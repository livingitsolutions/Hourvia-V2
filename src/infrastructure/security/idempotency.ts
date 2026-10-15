import { createHash } from 'node:crypto';
import type { SecurityOperation } from '../../application/authentication';
export function validateIdempotencyRequest(key: unknown, digest: unknown): asserts digest is string {
  if (typeof key !== 'string' || key.length < 1 || key.length > 200 || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('Invalid idempotency request');
  }
}
/** Server-side only. Include immutable request identity in payload (org/member/target).
 * Never hash provider/session secrets or accept a browser-computed hash as trusted. */
export function canonicalRequestDigest(operation: SecurityOperation, payload: unknown): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    throw new Error('Unsupported canonical request payload');
  };
  return createHash('sha256').update(canonical({version:1,operation,payload})).digest('hex');
}
