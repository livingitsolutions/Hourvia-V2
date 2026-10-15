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
