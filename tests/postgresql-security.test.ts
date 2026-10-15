import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
const run = promisify(execFile);
// No fallback to Netlify/preview/production credentials. Candidate must already be
// applied by a separately authorized operator to a synthetic disposable database.
const enabled = process.env.HOURVIA_DISPOSABLE_PG_AUTHORIZED === 'YES_SYNTHETIC_DISPOSABLE';
const admin = process.env.HOURVIA_TEST_MIGRATOR_URL;
const runtime = process.env.HOURVIA_TEST_RUNTIME_URL;
async function sql(connection: string | undefined, query: string) {
  if (!connection) throw new Error('Dedicated isolated credentials required');
  let url: URL;
  try { url = new URL(connection); }
  catch { throw new Error('Invalid isolated credential configuration'); } // URL errors can carry confidential input.
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !url.pathname.startsWith('/hourvia_disposable_')) throw new Error('Disposable local target required');
  try {
    const { stdout } = await run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',query], { env: { ...process.env, PGDATABASE: connection }, timeout: 10000 });
    return stdout.trim();
  } catch { throw new Error('PostgreSQL statement rejected'); } // Never serialize driver errors/credentials.
}
const actor = randomUUID(), org = randomUUID(), member = randomUUID(), correlation = randomUUID();
const hash = 'a'.repeat(64);
const ctx = `SELECT set_config('hv.actor','${actor}',true),set_config('hv.organization','${org}',true),set_config('hv.correlation','${correlation}',true);`;
const call = `SELECT hv.provision('${org}','${member}','Synthetic','UTC','${org}','${hash}',1);`;
const privileged = (q: string) => sql(admin, `BEGIN; SET LOCAL ROLE hv_schema; ${q}`);
const denied = async (q: string) => expect(sql(runtime, q)).rejects.toThrow('PostgreSQL statement rejected');
describe.skipIf(!enabled)('real disposable PostgreSQL security (pre-applied candidate)', () => {
  it('1 atomic organization creation', async () => {
    expect(await sql(runtime,'SELECT current_user')).toBe('hv_runtime');
    await privileged(`INSERT INTO hv.users(id) VALUES('${actor}'); COMMIT;`);
    expect((await sql(runtime,`BEGIN; ${ctx} ${call} COMMIT;`)).endsWith(org)).toBe(true);
    expect(await privileged(`SELECT count(*) FROM hv.audit_events WHERE organization_id='${org}'; COMMIT;`)).toBe('3');
  });
  it('2 missing owner rejected at commit', async () => {
    const id=randomUUID();
    await expect(privileged(`${ctx.replaceAll(org,id)} INSERT INTO hv.organizations VALUES('${id}','${actor}','Bad','UTC',1); COMMIT;`)).rejects.toThrow();
  });
  it('3 multiple owners rejected', async () => { const second=randomUUID(); await expect(privileged(`${ctx} INSERT INTO hv.users(id) VALUES('${second}'); INSERT INTO hv.memberships VALUES('${randomUUID()}','${org}','${second}','OWNER',true,1); COMMIT;`)).rejects.toThrow(); });
  it('4 owner mismatch rejected', async () => { await expect(privileged(`${ctx} UPDATE hv.organizations SET owner_user_id='${randomUUID()}' WHERE id='${org}'; COMMIT;`)).rejects.toThrow(); });
  it('5 unauthorized owner role change', async () => { await denied(`BEGIN; ${ctx} SELECT hv.revoke_member('${member}',1,'${randomUUID()}','${hash}'); COMMIT;`); });
  it('6 cross organization reads and writes', async () => {
    await denied(`BEGIN; ${ctx.replaceAll(org,randomUUID())} SELECT * FROM hv.read_organization(1); COMMIT;`);
    await denied(`INSERT INTO hv.memberships VALUES('${randomUUID()}','${randomUUID()}','${actor}','OWNER',true,1)`);
  });
  it('7 missing context denies', async () => { await denied('SELECT * FROM hv.read_organization(1)'); });
  it('8 forced RLS and runtime privileges', async () => {
    expect(await privileged("SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relnamespace='hv'::regnamespace AND relkind='r'; COMMIT;")).toBe('t');
    await denied('SELECT * FROM hv.organizations');
  });
  it('9 audit update delete truncate rejected', async () => { for(const q of ['UPDATE hv.audit_events SET action=action','DELETE FROM hv.audit_events','TRUNCATE hv.audit_events']) { await denied(q); await expect(privileged(`${q}; COMMIT;`)).rejects.toThrow(); } });
  it('10 missing audit attribution rolls back', async () => { await expect(privileged(`INSERT INTO hv.organizations VALUES('${randomUUID()}','${actor}','Bad','UTC',1); COMMIT;`)).rejects.toThrow(); });
  it('11 concurrent membership revocation serializes', async () => {
    const target=randomUUID(), user=randomUUID();
    await privileged(`${ctx} INSERT INTO hv.users(id) VALUES('${user}'); INSERT INTO hv.memberships VALUES('${target}','${org}','${user}','EMPLOYEE',true,1); COMMIT;`);
    const outcomes=await Promise.allSettled([sql(runtime,`BEGIN; ${ctx} SELECT hv.revoke_member('${target}',1,'${randomUUID()}','${hash}'); COMMIT;`),sql(runtime,`BEGIN; ${ctx} SELECT hv.revoke_member('${target}',1,'${randomUUID()}','${hash}'); COMMIT;`)]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(await privileged(`SELECT active::text || ':' || version FROM hv.memberships WHERE id='${target}'; COMMIT;`)).toBe('false:2');
  });
  it('12 duplicate idempotency converges', async () => { const results=await Promise.all([sql(runtime,`BEGIN; ${ctx} ${call} COMMIT;`),sql(runtime,`BEGIN; ${ctx} ${call} COMMIT;`)]); expect(results.every(x=>x.endsWith(org))).toBe(true); });
  it('13 conflicting payload rejected', async () => { await denied(`BEGIN; ${ctx} ${call.replace(hash,'b'.repeat(64))} COMMIT;`); });
  it('14 failed transaction rollback', async () => { const id=randomUUID(); await denied(`BEGIN; ${ctx.replaceAll(org,id)} ${call.replaceAll(org,id).replace(member,randomUUID())} SELECT 1/0; COMMIT;`); expect(await privileged(`SELECT count(*) FROM hv.organizations WHERE id='${id}'; COMMIT;`)).toBe('0'); });
  it('15 same connection resets local context', async () => { expect((await sql(runtime,`BEGIN; ${ctx} COMMIT; SELECT coalesce(nullif(current_setting('hv.actor',true),''),'clear');`)).endsWith('clear')).toBe(true); });
  it('16 deferred owner integrity checked at commit', async () => { const id=randomUUID(); await expect(privileged(`${ctx.replaceAll(org,id)} INSERT INTO hv.organizations VALUES('${id}','${actor}','Bad','UTC',1); SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`)).rejects.toThrow(); });
  it('17 runtime cannot become migrator', async () => { await denied('SET ROLE hv_schema'); await denied('SET ROLE hv_operation'); await denied('CREATE TABLE hv.attack(id int)'); });
  it('18 direct database mutations denied', async () => { await denied(`UPDATE hv.memberships SET active=false WHERE id='${member}'`); await denied(`INSERT INTO hv.users(id) VALUES('${randomUUID()}')`); });
});
