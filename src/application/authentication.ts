/** Server-only contracts. Implementations must never deserialize a principal from browser input. */
export interface VerifiedExternalIdentity {
  readonly issuer: string; readonly subject: string; readonly verifiedAt: string;
  readonly expiresAt: string; readonly assurance: string;
}
export interface ServerPrincipal {
  readonly userId: string; readonly sessionId: string; readonly authenticationEpoch: number;
}
export interface IdentityVerifier { verify(untrustedCredential: string): Promise<VerifiedExternalIdentity> }
export interface SessionAuthority {
  validate(untrustedCookie: string): Promise<ServerPrincipal>;
  revalidate(principal: ServerPrincipal): Promise<void>;
  invalidate(sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
}
export interface MembershipReauthorization {
  requireCurrent(principal: ServerPrincipal, organizationId: string, operation: 'read' | 'revoke'): Promise<void>;
}

/** Canonical server-created transaction assertion; never deserialize from request JSON. */
export type SecurityOperation = 'provision' | 'revoke' | 'read' | 'lookup';
export interface TransactionAuthorization {
  readonly principal: ServerPrincipal;
  readonly organizationId: string;
  readonly correlationId: string;
  readonly operation: SecurityOperation;
}
export function validateTransactionAuthorization(context: TransactionAuthorization): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(context.principal.userId) || !uuid.test(context.organizationId) || !uuid.test(context.correlationId)
    || !context.principal.sessionId || !Number.isSafeInteger(context.principal.authenticationEpoch)
    || context.principal.authenticationEpoch < 1 || !['provision','revoke','read','lookup'].includes(context.operation)) {
    throw new Error('Invalid server transaction authorization');
  }
}
