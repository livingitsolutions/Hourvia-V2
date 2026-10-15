import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export class DatabaseStatementError extends Error {
  constructor(readonly sqlstate: string) { super(`Database statement rejected (${sqlstate})`); }
}
/** Consume stderr only in memory; never retain/serialize driver messages or credentials. */
export function sanitizedFailure(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'stderr' in error && 'code' in error
    && [1,3].includes(Number(error.code)) && typeof error.stderr === 'string') {
    const match = /^ERROR:\s+([0-9A-Z]{5})\s*$/m.exec(error.stderr);
    if (match) return new DatabaseStatementError(match[1]);
  }
  return new Error('Isolated PostgreSQL runner or connection failed');
}
export function isolatedConnection(connection: string | undefined): URL {
  if (!connection) throw new Error('Dedicated isolated credentials required');
  let url: URL;
  try { url = new URL(connection); } catch { throw new Error('Invalid isolated credential configuration'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || !/^\/hourvia_disposable_[a-z0-9_]+$/.test(url.pathname) || !url.username || !url.password || url.search || url.hash) {
    throw new Error('Dedicated disposable local credentials required');
  }
  return url;
}
export async function sql(connection: string | undefined, query: string): Promise<string> {
  isolatedConnection(connection);
  // Deliberately do not inherit PGHOST/PGSERVICE/PGOPTIONS or arbitrary runner settings.
  const env = { PATH: process.env.PATH, LANG: 'C', PGDATABASE: connection, PGCONNECT_TIMEOUT: '5' };
  try {
    const { stdout } = await run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-c',query], { env, timeout: 10000 });
    return stdout.trim();
  } catch (error) { throw sanitizedFailure(error); }
}
export async function expectSqlstate(work: Promise<unknown>, states: readonly string[]): Promise<void> {
  try { await work; } catch (error) {
    if (error instanceof DatabaseStatementError && states.includes(error.sqlstate)) return;
    // eslint-disable-next-line preserve-caught-error -- Raw runner causes may contain credentials; retain only sanitized categories.
    throw new Error('Expected security SQLSTATE was not observed', {cause: error instanceof DatabaseStatementError ? new DatabaseStatementError(error.sqlstate) : new Error('Runner failure')});
  }
  throw new Error('Expected database rejection did not occur');
}
