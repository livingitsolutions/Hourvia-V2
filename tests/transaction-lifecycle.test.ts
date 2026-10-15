import { expect, it } from 'vitest';
import { transaction, AbortedCommit, UncertainCommit, type PinnedClient } from '../src/infrastructure/security/transaction';
import { validateTransactionAuthorization, type SessionAuthority, type TransactionAuthorization } from '../src/application/authentication';
const principal={userId:'11111111-1111-4111-8111-111111111111',sessionId:'server-session',authenticationEpoch:1};
const context: TransactionAuthorization={principal,organizationId:'22222222-2222-4222-8222-222222222222',correlationId:'33333333-3333-4333-8333-333333333333',operation:'read'};
const sessions: SessionAuthority={validate:async()=>principal,revalidate:async()=>{},invalidate:async()=>{},revokeAll:async()=>{}};
function client(fail: (sql:string)=>unknown, commitTag='COMMIT', rollbackTag='ROLLBACK') {
  const commands:string[]=[]; const released:boolean[]=[];
  const value: PinnedClient={query:async(sql)=>{ commands.push(sql); const failure=fail(sql); if(failure) throw failure; return {rows:[],command:sql==='COMMIT'?commitTag:sql==='ROLLBACK'?rollbackTag:sql.startsWith('BEGIN')?'BEGIN':'SELECT'}; },release:(discard)=>{released.push(Boolean(discard));}};
  return {value,commands,released};
}
it('returns success only on acknowledged COMMIT',async()=>{
 const c=client(()=>null);
 expect(await transaction({connect:async()=>c.value},sessions,context,async()=>42)).toBe(42);
 expect(c.commands.at(-1)).toBe('COMMIT'); expect(c.released).toEqual([false]);
});
it('never reports success for ROLLBACK command tag after swallowed work error',async()=>{
 const c=client(()=>null,'ROLLBACK'); let calls=0;
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>++calls)).rejects.toBeInstanceOf(AbortedCommit);
 expect(calls).toBe(1); expect(c.released).toEqual([false]);
});
it.each(['SELECT','', 'UNKNOWN'])('treats unsupported COMMIT result %s as uncertain and discards',async tag=>{
 const c=client(()=>null,tag);
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>42)).rejects.toBeInstanceOf(UncertainCommit);
 expect(c.released).toEqual([true]);
});
it('rolls back rejected constraint COMMIT without retrying',async()=>{
 const c=client(sql=>sql==='COMMIT'?{code:'23514'}:null); let calls=0;
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>++calls)).rejects.toEqual({code:'23514'});
 expect(calls).toBe(1); expect(c.commands.at(-1)).toBe('ROLLBACK'); expect(c.released).toEqual([false]);
});
it('discards a client after failed BEGIN', async()=>{
 const c=client(sql=>sql.startsWith('BEGIN')?new Error('transport'):null);
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>1)).rejects.toThrow();
 expect(c.released).toEqual([true]);
});
it('discards failed rollback and preserves operation error', async()=>{
 const c=client(sql=>sql==='ROLLBACK'?new Error('transport'):null);
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>{throw new Error('operation');})).rejects.toThrow('operation');
 expect(c.released).toEqual([true]);
});
it('discards an unacknowledged rollback',async()=>{
 const c=client(()=>null,'COMMIT','UNKNOWN');
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>{throw new Error('operation');})).rejects.toThrow('operation');
 expect(c.released).toEqual([true]);
});
it('never retries connection failure during COMMIT', async()=>{
 const c=client(sql=>sql==='COMMIT'?{code:'08006'}:null); let calls=0;
 await expect(transaction({connect:async()=>c.value},sessions,context,async()=>++calls)).rejects.toBeInstanceOf(UncertainCommit);
 expect(calls).toBe(1); expect(c.released).toEqual([true]);
});
it('bounds known-aborted retries and revalidates the session', async()=>{
 const c=client(()=>null); let validations=0; let calls=0;
 await expect(transaction({connect:async()=>c.value},{...sessions,revalidate:async()=>{validations++;}},context,async()=>{calls++; throw {code:'40001'};})).rejects.toEqual({code:'40001'});
 expect(calls).toBe(3); expect(validations).toBe(3); expect(c.commands.filter(x=>x==='ROLLBACK')).toHaveLength(3); expect(c.released).toEqual([false,false,false]);
});
it.each(['userId','organizationId','correlationId','operation','epoch'])('rejects malformed %s before acquiring a client',async field=>{
 const invalid={...context,principal:{...principal}};
 if(field==='userId') invalid.principal.userId='';
 if(field==='organizationId') invalid.organizationId='malformed';
 if(field==='correlationId') invalid.correlationId='';
 if(field==='operation') Object.assign(invalid,{operation:'unknown'});
 if(field==='epoch') invalid.principal.authenticationEpoch=0;
 expect(()=>validateTransactionAuthorization(invalid)).toThrow('Invalid server transaction authorization');
 let acquired=false;
 await expect(transaction({connect:async()=>{acquired=true;throw new Error('unexpected');}},sessions,invalid,async()=>42)).rejects.toThrow('Invalid server transaction authorization');
 expect(acquired).toBe(false);
});
it('blocks callback transaction-control SQL and another operation scope',async()=>{
 for(const sql of ['ROLLBACK','COMMIT','SELECT hv.revoke_member($1,$2,$3,$4)']) {
  const c=client(()=>null);
  await expect(transaction({connect:async()=>c.value},sessions,context,async scoped=>scoped.query(sql))).rejects.toThrow('SQL outside active authorization scope');
  expect(c.commands.at(-1)).toBe('ROLLBACK');
 }
});
it('expires a retained operation handle after completion',async()=>{
 const c=client(()=>null); let handle: import('../src/infrastructure/security/transaction').ScopedClient | undefined;
 await transaction({connect:async()=>c.value},sessions,context,async scoped=>{handle=scoped; return scoped.query('SELECT * FROM hv.read_organization($1)',[1]);});
 await expect(handle!.query('SELECT * FROM hv.read_organization($1)',[1])).rejects.toThrow('SQL outside active authorization scope');
});
