import { expect, it } from 'vitest';
import { transaction, UncertainCommit, type PinnedClient } from '../src/infrastructure/security/transaction';
import type { SessionAuthority } from '../src/application/authentication';
const principal={userId:'server-user',sessionId:'server-session',authenticationEpoch:1};
const sessions: SessionAuthority={validate:async()=>principal,revalidate:async()=>{},invalidate:async()=>{},revokeAll:async()=>{}};
function client(fail: (sql:string)=>unknown) {
  const commands:string[]=[]; const released:boolean[]=[];
  const value: PinnedClient={query:async(sql)=>{ commands.push(sql); const failure=fail(sql); if(failure) throw failure; return {rows:[]}; },release:(discard)=>{released.push(Boolean(discard));}};
  return {value,commands,released};
}
it('discards a client after failed BEGIN', async()=>{
 const c=client(sql=>sql.startsWith('BEGIN')?new Error('transport'):null);
 await expect(transaction({connect:async()=>c.value},sessions,principal,'org','correlation',async()=>1)).rejects.toThrow();
 expect(c.released).toEqual([true]);
});
it('discards failed rollback and preserves the operation error', async()=>{
 const c=client(sql=>sql==='ROLLBACK'?new Error('transport'):null);
 await expect(transaction({connect:async()=>c.value},sessions,principal,'org','correlation',async()=>{throw new Error('operation');})).rejects.toThrow('operation');
 expect(c.released).toEqual([true]);
});
it('never retries an uncertain COMMIT', async()=>{
 const c=client(sql=>sql==='COMMIT'?{code:'08006'}:null); let calls=0;
 await expect(transaction({connect:async()=>c.value},sessions,principal,'org','correlation',async()=>++calls)).rejects.toBeInstanceOf(UncertainCommit);
 expect(calls).toBe(1); expect(c.released).toEqual([true]);
});
it('bounds known-aborted retries and validates the session again', async()=>{
 const c=client(()=>null); let validations=0; let calls=0;
 await expect(transaction({connect:async()=>c.value},{...sessions,revalidate:async()=>{validations++;}},principal,'org','correlation',async()=>{calls++; throw {code:'40001'};})).rejects.toEqual({code:'40001'});
 expect(calls).toBe(3); expect(validations).toBe(3); expect(c.commands.filter(x=>x==='ROLLBACK')).toHaveLength(3); expect(c.released).toEqual([false,false,false]);
});
