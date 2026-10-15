import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql, expectSqlstate, DatabaseStatementError, isolatedConnection } from './support/postgresql';
const enabled = process.env.HOURVIA_DISPOSABLE_PG_AUTHORIZED === 'YES_SYNTHETIC_DISPOSABLE';
const admin = process.env.HOURVIA_TEST_MIGRATOR_URL;
const runtime = process.env.HOURVIA_TEST_RUNTIME_URL;
const actor = randomUUID(), org = randomUUID(), member = randomUUID();
const otherActor=randomUUID(), otherOrg=randomUUID(), otherMember=randomUUID();
const hash = 'a'.repeat(64);
function ctx(operation='provision', organization: string=org, user: string=actor) {
  return `SELECT set_config('hv.actor','${user}',true),set_config('hv.organization','${organization}',true),set_config('hv.correlation','${randomUUID()}',true),set_config('hv.operation','${operation}',true),set_config('hv.epoch','1',true);`;
}
function provision(organization: string=org, membership: string=member, key: string=organization, digest: string | null=hash) {
  return `SELECT hv.provision('${organization}','${membership}','Synthetic','UTC','${key}',${digest===null?'NULL':`'${digest}'`},1);`;
}
const privileged = (q: string) => sql(admin, `BEGIN; SET LOCAL ROLE hv_schema; ${q}`);
const tenant = (q:string, operation='read', organization: string=org, user: string=actor) => sql(runtime,`BEGIN; ${ctx(operation,organization,user)} ${q} COMMIT;`);
const denied = (q:string, states=['42501']) => expectSqlstate(sql(runtime,q),states);
const adminDenied = (q:string, states=['42501']) => expectSqlstate(privileged(q),states);
async function provisionFixture(organization:string, membership:string, user: string=actor, key=organization) {
  const result=await tenant(provision(organization,membership,key),'provision',organization,user);
  expect(result.endsWith(organization)).toBe(true);
}
async function absent(organization:string) {
  const tables=['organizations','memberships','monitoring_policies','audit_events','bootstrap_requests','operation_requests'];
  const sum=tables.map(t=>`(SELECT count(*) FROM hv.${t} WHERE ${t==='organizations'?'id':'organization_id'}='${organization}')`).join('+');
  expect(await privileged(`SELECT ${sum}; COMMIT;`)).toBe('0');
}
describe.skipIf(!enabled)('real disposable PostgreSQL security (pre-applied Sprint 0.2B baseline)', () => {
  beforeAll(async()=>{
    const a=isolatedConnection(admin), r=isolatedConnection(runtime);
    if (a.pathname!==r.pathname || a.hostname!==r.hostname || a.port!==r.port || a.username===r.username) throw new Error('Separate logins on the same isolated target required');
    expect(await sql(admin,'SELECT current_user')).toBe('hv_migrator');
    expect(await sql(runtime,'SELECT current_user')).toBe('hv_runtime');
    // Transport and version prerequisites: verified TLS on both logins; PostgreSQL 15+ server.
    for (const login of [admin, runtime]) expect(await sql(login,'SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).toBe('t');
    expect(Number(await sql(admin,"SELECT current_setting('server_version_num')"))).toBeGreaterThanOrEqual(150000);
    // Positive execution control prevents missing executable/SQL errors becoming denial proof.
    expect(await privileged("SELECT count(*) FROM pg_class WHERE relnamespace='hv'::regnamespace AND relkind='r'; COMMIT;")).toBe('7');
    expect((await privileged(`${ctx('read')} SELECT hv.context_valid('read'); COMMIT;`)).endsWith('t')).toBe(true);
    await privileged(`INSERT INTO hv.users(id) VALUES('${actor}'),('${otherActor}'); COMMIT;`);
    await provisionFixture(org,member);
    await provisionFixture(otherOrg,otherMember,otherActor);
  });
  it('1 atomic organization creation', async () => {
    const id=randomUUID(), membership=randomUUID();
    await provisionFixture(id,membership);
    expect(await privileged(`SELECT json_build_array((SELECT count(*) FROM hv.organizations WHERE id='${id}'),(SELECT count(*) FROM hv.memberships WHERE organization_id='${id}' AND user_id='${actor}' AND active AND role='OWNER'),(SELECT count(*) FROM hv.monitoring_policies WHERE organization_id='${id}' AND NOT idle_detection AND NOT applications AND NOT websites AND NOT screenshots AND NOT productivity),(SELECT count(*) FROM hv.audit_events WHERE organization_id='${id}'),(SELECT count(*) FROM hv.bootstrap_requests WHERE organization_id='${id}')); COMMIT;`)).toBe('[1, 1, 1, 3, 1]');
  });
  it('2 missing owner rejected at commit', async () => {
    const id=randomUUID();
    // Either deferred FK or matching-owner trigger may fire first at COMMIT.
    await adminDenied(`${ctx('provision',id)} INSERT INTO hv.organizations VALUES('${id}','${actor}','Bad','UTC',1); COMMIT;`,['23503','23514']);
    await absent(id);
  });
  it('3 multiple owners rejected', async () => {
    const second=randomUUID();
    await privileged(`INSERT INTO hv.users(id) VALUES('${second}'); COMMIT;`);
    await adminDenied(`${ctx()} INSERT INTO hv.memberships VALUES('${randomUUID()}','${org}','${second}','OWNER',true,1); COMMIT;`,['23505']);
    expect(await privileged(`SELECT count(*) FROM hv.memberships WHERE organization_id='${org}' AND active AND role='OWNER'; COMMIT;`)).toBe('1');
  });
  it('4 owner identity mismatch rejected by immutable guard', async () => {
    await adminDenied(`${ctx()} UPDATE hv.organizations SET owner_user_id='${otherActor}' WHERE id='${org}'; COMMIT;`);
    expect(await privileged(`SELECT owner_user_id FROM hv.organizations WHERE id='${org}'; COMMIT;`)).toBe(actor);
  });
  it('5 unauthorized owner role and lifecycle change', async () => {
    await expectSqlstate(tenant(`SELECT hv.revoke_member('${member}',1,'${randomUUID()}','${hash}');`,'revoke'),['42501']);
    await adminDenied(`${ctx()} UPDATE hv.memberships SET role='ADMIN',version=version+1 WHERE id='${member}'; COMMIT;`);
    expect(await privileged(`SELECT role || ':' || active::text FROM hv.memberships WHERE id='${member}'; COMMIT;`)).toBe('OWNER:true');
  });
  it('6 existing cross organization reads and writes denied', async () => {
    expect((await tenant('SELECT * FROM hv.read_organization(1);')).endsWith(`${org}|Synthetic`)).toBe(true);
    await expectSqlstate(tenant('SELECT * FROM hv.read_organization(1);','read',otherOrg),['42501']);
    await expectSqlstate(tenant(`SELECT hv.revoke_member('${otherMember}',1,'${randomUUID()}','${hash}');`,'revoke'),['42501']);
    await denied(`INSERT INTO hv.memberships VALUES('${randomUUID()}','${otherOrg}','${actor}','OWNER',true,1)`);
    expect(await privileged(`SELECT active FROM hv.memberships WHERE id='${otherMember}'; COMMIT;`)).toBe('t');
  });
  it('7 required context missing malformed inconsistent or wrong scope denies', async () => {
    await denied('SELECT * FROM hv.read_organization(1)');
    for (const name of ['actor','organization','correlation','operation','epoch']) {
      for(const value of ['', 'malformed']) await denied(`BEGIN; ${ctx('read')} SELECT set_config('hv.${name}','${value}',true); SELECT * FROM hv.read_organization(1); COMMIT;`);
    }
    await expectSqlstate(tenant('SELECT * FROM hv.read_organization(2);'),['42501']);
    await expectSqlstate(tenant('SELECT * FROM hv.read_organization(1);','revoke'),['42501']);
  });
  it('8 forced RLS and runtime privileges', async () => {
    expect(await privileged("SELECT count(*) FROM pg_class WHERE relnamespace='hv'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity; COMMIT;")).toBe('7');
    for(const table of ['users','organizations','memberships','monitoring_policies','audit_events','bootstrap_requests','operation_requests']) await denied(`SELECT * FROM hv.${table}`);
  });
  it('9 audit update delete truncate rejected', async () => {
    for(const q of ['UPDATE hv.audit_events SET action=action','DELETE FROM hv.audit_events','TRUNCATE hv.audit_events']) {
      await denied(q); await adminDenied(`${q}; COMMIT;`);
    }
    expect(await privileged(`SELECT count(*) FROM hv.audit_events WHERE organization_id='${org}'; COMMIT;`)).toBe('3');
  });
  it('10 missing audit correlation rolls back mutation', async () => {
    const id=randomUUID();
    await adminDenied(`${ctx('provision',id)} SELECT set_config('hv.correlation','',true); INSERT INTO hv.organizations VALUES('${id}','${actor}','Bad','UTC',1); COMMIT;`);
    await absent(id);
  });
  it('11 concurrent membership revocation has one committed version change', async () => {
    const target=randomUUID(), user=randomUUID();
    await privileged(`INSERT INTO hv.users(id) VALUES('${user}'); COMMIT;`);
    await privileged(`${ctx()} INSERT INTO hv.memberships VALUES('${target}','${org}','${user}','EMPLOYEE',true,1); COMMIT;`);
    const outcomes=await Promise.allSettled([tenant(`SELECT hv.revoke_member('${target}',1,'${randomUUID()}','${hash}');`,'revoke'),tenant(`SELECT hv.revoke_member('${target}',1,'${randomUUID()}','${hash}');`,'revoke')]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    for(const outcome of outcomes) if(outcome.status==='rejected') {
      expect(outcome.reason instanceof DatabaseStatementError).toBe(true);
      expect(outcome.reason.sqlstate).toBe('42501');
    }
    expect(await privileged(`SELECT active::text || ':' || version FROM hv.memberships WHERE id='${target}'; COMMIT;`)).toBe('false:2');
  });
  it('12 concurrent first-use idempotency converges durably', async () => {
    const id=randomUUID(), membership=randomUUID();
    const results=await Promise.all([tenant(provision(id,membership),'provision',id),tenant(provision(id,membership),'provision',id)]);
    expect(results.every(x=>x.endsWith(id))).toBe(true);
    expect(await privileged(`SELECT count(*) FROM hv.bootstrap_requests WHERE organization_id='${id}'; COMMIT;`)).toBe('1');
    expect(await privileged(`SELECT count(*) FROM hv.audit_events WHERE organization_id='${id}'; COMMIT;`)).toBe('3');
  });
  it('13 conflicting payload and request identity rejected including NULL', async () => {
    await expectSqlstate(tenant(provision(org,member,org,'b'.repeat(64)),'provision'),['22000']);
    await expectSqlstate(tenant(provision(org,member,org,null),'provision'),['22023']);
    await expectSqlstate(tenant(provision(org,randomUUID()),'provision'),['22000']);
    const conflictingOrg=randomUUID();
    await expectSqlstate(tenant(provision(conflictingOrg,randomUUID(),org),'provision',conflictingOrg),['22000']);
    await absent(conflictingOrg);
    await expectSqlstate(tenant(`SELECT hv.lookup_bootstrap('${org}',NULL,1);`,'lookup'),['22023']);
    expect((await tenant(`SELECT hv.lookup_bootstrap('${org}','${hash}',1);`,'lookup')).endsWith(org)).toBe(true);
    const user=randomUUID(), target=randomUUID(), key=randomUUID();
    await privileged(`INSERT INTO hv.users(id) VALUES('${user}'); COMMIT;`);
    await privileged(`${ctx()} INSERT INTO hv.memberships VALUES('${target}','${org}','${user}','EMPLOYEE',true,1); COMMIT;`);
    await tenant(`SELECT hv.revoke_member('${target}',1,'${key}','${hash}');`,'revoke');
    await tenant(`SELECT hv.revoke_member('${target}',1,'${key}','${hash}');`,'revoke');
    for(const [targetValue,digest] of [[`'${target}'`,'NULL'],['NULL',`'${hash}'`],['NULL','NULL']]) await expectSqlstate(tenant(`SELECT hv.revoke_member(${targetValue},1,'${key}',${digest});`,'revoke'),['22023']);
    await expectSqlstate(tenant(`SELECT hv.revoke_member('${member}',1,'${key}','${hash}');`,'revoke'),['22000']);
    expect(await privileged(`SELECT version FROM hv.memberships WHERE id='${target}'; COMMIT;`)).toBe('2');
  });
  it('14 failed transaction rolls back all core records', async () => {
    const id=randomUUID();
    await expectSqlstate(tenant(`${provision(id,randomUUID())} SELECT 1/0;`,'provision',id),['22012']);
    await absent(id);
  });
  it('15 same backend resets all local context after commit and rollback', async () => {
    const check="SELECT coalesce(nullif(current_setting('hv.actor',true),''),'clear') || ':' || coalesce(nullif(current_setting('hv.organization',true),''),'clear') || ':' || coalesce(nullif(current_setting('hv.correlation',true),''),'clear') || ':' || coalesce(nullif(current_setting('hv.operation',true),''),'clear') || ':' || coalesce(nullif(current_setting('hv.epoch',true),''),'clear');";
    for(const completion of ['COMMIT','ROLLBACK']) expect((await sql(runtime,`BEGIN; ${ctx('read')} ${completion}; ${check}`)).endsWith('clear:clear:clear:clear:clear')).toBe(true);
  });
  it('16 deferred active-owner check at commit with valid membership FK', async () => {
    const id=randomUUID();
    await adminDenied(`${ctx('provision',id)} INSERT INTO hv.organizations VALUES('${id}','${actor}','Bad','UTC',1); INSERT INTO hv.memberships VALUES('${randomUUID()}','${id}','${actor}','OWNER',false,1); COMMIT;`,['23514']);
    await absent(id);
  });
  it('17 runtime cannot become privileged or execute helper functions', async () => {
    for(const role of ['hv_schema','hv_operation','hv_migrator']) await denied(`SET ROLE ${role}`);
    await denied('CREATE TABLE hv.attack(id int)');
    await denied("SELECT hv.require_context('read',1)");
    expect(await privileged("SELECT count(*) FROM pg_auth_members WHERE member='hv_runtime'::regrole; COMMIT;")).toBe('0');
  });
  it('18 direct mutations denied without changing owner or users', async () => {
    const id=randomUUID();
    await denied(`UPDATE hv.memberships SET active=false WHERE id='${member}'`);
    await denied(`INSERT INTO hv.users(id) VALUES('${id}')`);
    expect(await privileged(`SELECT active FROM hv.memberships WHERE id='${member}'; COMMIT;`)).toBe('t');
    expect(await privileged(`SELECT count(*) FROM hv.users WHERE id='${id}'; COMMIT;`)).toBe('0');
  });
});
