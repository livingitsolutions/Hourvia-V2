import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { verificationTarget, tlsSettings, VERIFICATION_TARGET } from './support/postgresql';
// Synthetic placeholders only; no real credential or host appears here.
const local = (db: string, user = 'hv_runtime') => `postgresql://${user}:synthetic@127.0.0.1:55432/${db}`;
const good = local('hourvia_disposable_verify');
it('requires the exact disposable target label', () => {
  for (const label of [undefined, '', 'production', 'preview', 'hourvia-v1', 'deploy-preview-3', 'unknown', `${VERIFICATION_TARGET}-x`]) {
    expect(() => verificationTarget({ DB_MIGRATION_TARGET: label }, good)).toThrow('Explicit disposable verification target label required');
  }
  expect(() => verificationTarget({ DB_MIGRATION_TARGET: VERIFICATION_TARGET }, good)).not.toThrow();
});
it('rejects production, preview, V1 and remote targets even with the label', () => {
  const env = { DB_MIGRATION_TARGET: VERIFICATION_TARGET };
  for (const db of ['hourvia_disposable_prod', 'hourvia_disposable_preview_1', 'hourvia_disposable_v1', 'hourvia_disposable_main', 'hourvia_v1', 'neondb']) {
    expect(() => verificationTarget(env, local(db))).toThrow();
  }
  expect(() => verificationTarget(env, 'postgresql://hv_runtime:synthetic@db.example.com/hourvia_disposable_verify')).toThrow();
  expect(() => verificationTarget(env, `${good}?sslmode=disable`)).toThrow();
});
it('rejects any connection identical to a Netlify-managed database variable', () => {
  for (const name of ['NETLIFY_DB_URL', 'NETLIFY_DATABASE_URL', 'NETLIFY_AGENT_RUNNER_DB_CONNECTION_STRING', 'DATABASE_URL']) {
    expect(() => verificationTarget({ DB_MIGRATION_TARGET: VERIFICATION_TARGET, [name]: good }, good)).toThrow('Netlify-managed or shared database target rejected');
  }
});
it('enforces verify-full with an existing absolute operator CA path', () => {
  expect(() => tlsSettings({})).toThrow('Dedicated verify-full CA certificate required');
  expect(() => tlsSettings({ HOURVIA_TEST_PG_SSLROOTCERT: 'relative/ca.pem' })).toThrow();
  const missing = join(tmpdir(), 'hourvia-absent-ca.pem');
  expect(existsSync(missing)).toBe(false);
  expect(() => tlsSettings({ HOURVIA_TEST_PG_SSLROOTCERT: missing })).toThrow();
  const ca = join(mkdtempSync(join(tmpdir(), 'hv-ca-')), 'ca.pem');
  writeFileSync(ca, 'synthetic');
  expect(tlsSettings({ HOURVIA_TEST_PG_SSLROOTCERT: ca })).toEqual({ PGSSLMODE: 'verify-full', PGSSLROOTCERT: ca });
});
