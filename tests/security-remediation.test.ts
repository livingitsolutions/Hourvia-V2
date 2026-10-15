import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateIdempotencyRequest, canonicalRequestDigest } from '../src/infrastructure/security/idempotency';
import { sanitizedFailure, DatabaseStatementError, expectSqlstate } from './support/postgresql';
it.each([[null,null],['key',null],[null,'a'.repeat(64)],['key',''],['key','malformed']])('rejects invalid key/hash pair %# offline', (key,hash)=>{
 expect(()=>validateIdempotencyRequest(key,hash)).toThrow('Invalid idempotency request');
});
it('canonical versioned hashes preserve equal payloads and bind operation and request identity',()=>{
 const a=canonicalRequestDigest('provision',{org:'A',member:'M',payload:null});
 expect(canonicalRequestDigest('provision',{payload:null,member:'M',org:'A'})).toBe(a);
 expect(canonicalRequestDigest('provision',{org:'B',member:'M',payload:null})).not.toBe(a);
 expect(canonicalRequestDigest('revoke',{org:'A',member:'M',payload:null})).not.toBe(a);
 expect(()=>validateIdempotencyRequest('key',a)).not.toThrow();
 expect(()=>canonicalRequestDigest('provision',{value:undefined})).toThrow();
});
it('requires null-safe persisted SQL comparisons and validation on every replay path (source only)',()=>{
 const sql=readFileSync('db/candidates/sprint-0.2b/001_security.sql','utf8');
 expect(sql.includes('payload_hash<>')).toBe(false);
 expect(sql.match(/payload_hash IS DISTINCT FROM digest/g)).toHaveLength(3);
 expect(sql.match(/PERFORM hv.require_request\(request_key,digest\)/g)).toHaveLength(3);
 expect(sql.includes('previous.target_id IS DISTINCT FROM target')).toBe(true);
 expect(sql.includes('existing_request.membership_id IS DISTINCT FROM member')).toBe(true);
});
it('classifies only server SQLSTATE messages and never exposes diagnostic input',()=>{
 const database=sanitizedFailure({code:1,stderr:'ERROR:  42501\n'});
 expect(database).toBeInstanceOf(DatabaseStatementError);
 expect((database as DatabaseStatementError).sqlstate).toBe('42501');
 for(const error of [{code:'ENOENT'},{code:1,stderr:'connection failed'},{code:1,stderr:'ERROR: syntax error'},{code:'ETIMEDOUT',stderr:'ERROR:  42501\n'}]) {
  expect(sanitizedFailure(error)).not.toBeInstanceOf(DatabaseStatementError);
 }
});
it('setup and wrong SQLSTATE cannot satisfy expected denial',async()=>{
 await expect(expectSqlstate(Promise.reject(new Error('runner failure')),['42501'])).rejects.toThrow('Expected security SQLSTATE was not observed');
 await expect(expectSqlstate(Promise.reject(new DatabaseStatementError('42601')),['42501'])).rejects.toThrow('Expected security SQLSTATE was not observed');
 await expect(expectSqlstate(Promise.resolve(),['42501'])).rejects.toThrow('Expected database rejection did not occur');
 await expect(expectSqlstate(Promise.reject(new DatabaseStatementError('42501')),['42501'])).resolves.toBeUndefined();
});
