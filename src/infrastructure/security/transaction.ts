import type { ServerPrincipal, SessionAuthority } from '../../application/authentication';
/** Inject a Netlify-managed pinned pool only after platform verification. No pool is constructed here. */
export interface PinnedClient {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(discard?: boolean): void;
}
export interface PinnedPool { connect(): Promise<PinnedClient> }
export class UncertainCommit extends Error {
  constructor() { super('Commit outcome unknown; reconcile durable request before any retry'); }
}
const aborted = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && ['40001', '40P01'].includes(String(error.code));
export async function transaction<T>(pool: PinnedPool, sessions: SessionAuthority, principal: ServerPrincipal,
  organizationId: string, correlationId: string, work: (client: PinnedClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sessions.revalidate(principal);
    const client = await pool.connect();
    let begun = false; let committing = false; let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); begun = true;
      await client.query("SELECT set_config('hv.actor',$1,true),set_config('hv.organization',$2,true),set_config('hv.correlation',$3,true)", [principal.userId, organizationId, correlationId]);
      const result = await work(client);
      committing = true;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      const knownAbort = aborted(error);
      if (committing && !knownAbort && !(typeof error === 'object' && error !== null && 'code' in error && /^23[A-Z0-9]{3}$/.test(String(error.code)))) {
        discard = true; throw new UncertainCommit();
      }
      if (begun) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
      } else discard = true;
      if (!knownAbort || discard || attempt === 2) throw error;
    } finally { client.release(discard); }
  }
  throw new Error('Retry limit reached');
}
/** Exact allowlisted SQL; epoch comes exclusively from session validation. */
export const operations = {
  /** Read-only reconciliation: a null result remains unresolved; never automatically rerun. */
  lookupBootstrap: (client: PinnedClient, principal: ServerPrincipal, key: string, canonicalPayloadHash: string) => client.query('SELECT hv.lookup_bootstrap($1,$2,$3)', [key,canonicalPayloadHash,principal.authenticationEpoch]),
  provision: (client: PinnedClient, principal: ServerPrincipal, input: { organizationId: string; membershipId: string; name: string; timezone: string; key: string; canonicalPayloadHash: string }) =>
    client.query('SELECT hv.provision($1,$2,$3,$4,$5,$6,$7)', [input.organizationId,input.membershipId,input.name,input.timezone,input.key,input.canonicalPayloadHash,principal.authenticationEpoch]),
  read: (client: PinnedClient, principal: ServerPrincipal) => client.query('SELECT * FROM hv.read_organization($1)', [principal.authenticationEpoch]),
  revoke: (client: PinnedClient, principal: ServerPrincipal, membershipId: string, key: string, canonicalPayloadHash: string) => client.query('SELECT hv.revoke_member($1,$2,$3,$4)', [membershipId,principal.authenticationEpoch,key,canonicalPayloadHash]),
};
