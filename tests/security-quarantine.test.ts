import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps security SQL outside deployment and composition', () => {
  expect(existsSync('netlify/database/migrations')).toBe(false);
  expect(existsSync('drizzle.config.ts')).toBe(false);
  expect(readFileSync('src/composition/main.tsx','utf8').includes('security')).toBe(false);
  const sql = readFileSync('db/candidates/sprint-0.2/001_security.sql','utf8');
  expect(sql.includes('FORCE ROW LEVEL SECURITY')).toBe(true);
  expect(sql.includes('DEFERRABLE INITIALLY DEFERRED')).toBe(true);
});
