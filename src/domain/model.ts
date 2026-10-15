import { z } from 'zod';
export const idSchema = z.string().uuid();
export type Id = z.infer<typeof idSchema>;
export const instantSchema = z.iso.datetime({ offset: false });
export const timezoneSchema = z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return value.includes('/') || value === 'UTC'; } catch { return false; } }, 'IANA timezone required');
export const roles = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR'] as const;
export type Role = typeof roles[number];
export const permissions = ['organization.settings', 'members.invite', 'members.revoke', 'time.manage', 'timesheets.approve', 'projects.manage', 'clients.manage', 'billing.configure', 'invoices.prepare', 'monitoring.configure', 'monitoring.reports', 'audit.read'] as const;
export type Permission = typeof permissions[number];
export interface Organization { id: Id; name: string; ownerUserId: Id; timezone: string; version: number }
export interface Membership { organizationId: Id; userId: Id; role: Role; active: boolean; delegated: readonly Permission[]; version: number }
export interface TenantRecord { organizationId: Id; id: Id; version: number }
export interface TimeEntry extends TenantRecord { userId: Id; projectId: Id; start: string; end: string; seconds: number; billable: boolean; supersedesId?: Id }
export interface BillingRate extends TenantRecord { clientId: Id; projectId?: Id; effectiveFrom: string; effectiveUntil?: string; currency: string; hourlyMinor: bigint }
export interface FinalizedSnapshot extends TenantRecord { periodId: Id; finalizedAt: string; currency: string; lines: readonly { timeEntryRevisionId: Id; amountMinor: bigint }[] }
export interface InvoiceDraft extends TenantRecord { currency: string; snapshotId: Id; adjustments: readonly { reason: string; amountMinor: bigint }[] }
export interface MonitoringPolicy extends TenantRecord { idleDetection: boolean; applications: boolean; websites: boolean; screenshots: boolean; productivity: boolean; retentionDays: number; noticeVersion: string; offlineLeaseSeconds: number }
export function monitoringDefaults(organizationId: Id, id: Id): MonitoringPolicy { return { organizationId, id, version: 1, idleDetection: false, applications: false, websites: false, screenshots: false, productivity: false, retentionDays: 30, noticeVersion: 'unpublished', offlineLeaseSeconds: 0 }; }
export function may(m: Membership, p: Permission, organizationId: Id): boolean {
 if (!m.active || m.organizationId !== organizationId) return false;
 if (m.role === 'OWNER') return true;
 if (m.role === 'EMPLOYEE' || m.role === 'CONTRACTOR') return false;
 return m.delegated.includes(p);
}
export function assertOwnership(org: Organization, members: readonly Membership[]): void {
 const owners = members.filter(m => m.organizationId === org.id && m.active && m.role === 'OWNER');
 if (owners.length !== 1 || owners[0].userId !== org.ownerUserId) throw new Error('Exactly one accountable owner required');
}
export const timeEntrySchema = z.object({ organizationId: idSchema, id: idSchema, userId: idSchema, projectId: idSchema, version: z.number().int().positive(), start: instantSchema, end: instantSchema, seconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), billable: z.boolean() }).refine(t => Date.parse(t.end) >= Date.parse(t.start) && (Date.parse(t.end) - Date.parse(t.start)) === t.seconds * 1000, 'Duration must match UTC instants');
