import { validateIdempotencyRequest } from './idempotency';
import { validateTransactionAuthorization, type ServerPrincipal, type SessionAuthority, type TransactionAuthorization } from '../../application/authentication';
/** Inject a Netlify-managed pinned pool only after platform verification. No pool is constructed here. */
export interface ScopedClient {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[]; command: string }>;
}
export interface PinnedClient extends ScopedClient {
  release(discard?: boolean): void;
}
export interface PinnedPool { connect(): Promise<PinnedClient> }
export class UncertainCommit extends Error {
  constructor() { super('Commit outcome unknown; reconcile durable request before any retry'); }
}
export class AbortedCommit extends Error { constructor() { super('Transaction did not commit'); } }
const aborted = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && ['40001', '40P01'].includes(String(error.code));
export async function transaction<T>(pool: PinnedPool, sessions: SessionAuthority, context: TransactionAuthorization,
  work: (client: ScopedClient) => Promise<T>): Promise<T> {
  validateTransactionAuthorization(context);
  const { principal, organizationId, correlationId, operation } = context;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sessions.revalidate(principal);
    const client = await pool.connect();
    let begun = false; let committing = false; let discard = false; let active = true;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); begun = true;
      await client.query("SELECT set_config('hv.actor',$1,true),set_config('hv.organization',$2,true),set_config('hv.correlation',$3,true),set_config('hv.operation',$4,true),set_config('hv.epoch',$5,true)", [principal.userId, organizationId, correlationId, operation, String(principal.authenticationEpoch)]);
      const allowed = {
        provision: 'SELECT hv.provision($1,$2,$3,$4,$5,$6,$7)',
        revoke: 'SELECT hv.revoke_member($1,$2,$3,$4)',
        read: 'SELECT * FROM hv.read_organization($1)',
        lookup: 'SELECT hv.lookup_bootstrap($1,$2,$3)',
      };
      const scoped: ScopedClient = {query: async (sql, values) => {
        if (!active || sql !== allowed[operation]) throw new Error('SQL outside active authorization scope');
        return client.query(sql, values);
      }};
      const result = await work(scoped);
      active = false;
      committing = true;
      const completion = await client.query('COMMIT');
      if (completion.command === 'ROLLBACK') throw new AbortedCommit();
      if (completion.command !== 'COMMIT') { discard = true; throw new UncertainCommit(); }
      return result;
    } catch (error) {
      const knownAbort = aborted(error);
      if (committing && !(error instanceof AbortedCommit) && !knownAbort && !(typeof error === 'object' && error !== null && 'code' in error && /^23[A-Z0-9]{3}$/.test(String(error.code)))) {
        discard = true; throw new UncertainCommit();
      }
      if (begun) {
        try { if ((await client.query('ROLLBACK')).command !== 'ROLLBACK') discard = true; } catch { discard = true; }
      } else discard = true;
      if (!knownAbort || discard || attempt === 2) throw error;
    } finally { active = false; client.release(discard); }
  }
  throw new Error('Retry limit reached');
}
/** Exact allowlisted SQL; epoch comes exclusively from session validation. */
export const operations = {
  /** Read-only reconciliation: a null result remains unresolved; never automatically rerun. */
  lookupBootstrap: (client: ScopedClient, principal: ServerPrincipal, key: string, canonicalPayloadHash: string) => {
    validateIdempotencyRequest(key,canonicalPayloadHash);
    return client.query('SELECT hv.lookup_bootstrap($1,$2,$3)', [key,canonicalPayloadHash,principal.authenticationEpoch]);
  },
  provision: (client: ScopedClient, principal: ServerPrincipal, input: { organizationId: string; membershipId: string; name: string; timezone: string; key: string; canonicalPayloadHash: string }) => {
    validateIdempotencyRequest(input.key,input.canonicalPayloadHash);
    return client.query('SELECT hv.provision($1,$2,$3,$4,$5,$6,$7)', [input.organizationId,input.membershipId,input.name,input.timezone,input.key,input.canonicalPayloadHash,principal.authenticationEpoch]);
  },
  read: (client: ScopedClient, principal: ServerPrincipal) => client.query('SELECT * FROM hv.read_organization($1)', [principal.authenticationEpoch]),
  revoke: (client: ScopedClient, principal: ServerPrincipal, membershipId: string, key: string, canonicalPayloadHash: string) => {
    validateIdempotencyRequest(key,canonicalPayloadHash);
    return client.query('SELECT hv.revoke_member($1,$2,$3,$4)', [membershipId,principal.authenticationEpoch,key,canonicalPayloadHash]);
  },
};
