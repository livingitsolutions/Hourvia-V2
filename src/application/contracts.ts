import type { Id, Membership, Permission, TenantRecord } from '../domain/model';
/** Trusted context is constructed ONLY by server authentication plus current membership lookup. */
export interface AuthorizedContext { readonly userId: Id; readonly membership: Membership; readonly verifiedAt: string }
export interface AuthorizationPort { require(userId: Id, organizationId: Id, permission: Permission): Promise<AuthorizedContext> }
export interface TenantRepository<T extends TenantRecord> { find(context: AuthorizedContext, id: Id): Promise<T | null>; appendCorrection(context: AuthorizedContext, record: T, expectedVersion: number): Promise<void> }
export interface TransactionPort { serializable<T>(work: () => Promise<T>): Promise<T> }
export interface IdempotencyPort { execute<T>(context: AuthorizedContext, operation: string, key: string, payloadHash: string, work: () => Promise<T>): Promise<T> }
export interface AuditPort { append(event: { organizationId: Id; actorId: Id; action: string; occurredAt: string; targetId: Id; correlationId: Id }): Promise<void> }
export interface OrganizationProvisioningPort { provision(input: { authenticatedUserId: Id; name: string; timezone: string; idempotencyKey: string }): Promise<Id>; transferOwner(context: AuthorizedContext, newOwnerId: Id, expectedVersion: number): Promise<void> }
export interface MonitoringAuthorizationLease { organizationId: Id; userId: Id; deviceId: Id; policyVersion: number; issuedAt: string; expiresAt: string; noticeAcknowledgedAt: string; osPermissions: readonly string[]; signature: string }
export interface MonitoringSafetyContract { visibleStatusRequired: true; covertCollectionAllowed: false; keyloggingAllowed: false; passwordCollectionAllowed: false; canStopSession: true; canDisconnectDevice: true; expireOfflineClosed: true }
