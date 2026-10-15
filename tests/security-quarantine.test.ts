import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
it('keeps security SQL outside deployment and composition', () => {
  expect(existsSync('netlify/database/migrations')).toBe(false);
  expect(existsSync('drizzle.config.ts')).toBe(false);
  expect(readFileSync('src/composition/main.tsx','utf8').includes('security')).toBe(false);
  const sql = readFileSync('db/candidates/sprint-0.2b/001_security.sql','utf8');
  expect(sql.includes('FORCE ROW LEVEL SECURITY')).toBe(true);
  expect(sql.includes('DEFERRABLE INITIALLY DEFERRED')).toBe(true);
});

it('preserves historical candidate and inert schema fingerprints',()=>{
 const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 expect(hash('db/candidates/sprint-0.2/001_security.sql')).toBe('0f443cfd299ae316be7d6cc443fdb543e062b569c82ed2c3eff186c6ef55642e');
 expect(hash('db/schema.ts')).toBe('c59cfd5dee9a939d874ca4cc83a9c00b0d520d0ac2fd3396cab2183566b58a1d');
});
