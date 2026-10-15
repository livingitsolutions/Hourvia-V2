# Bounded contexts

## 1. Identity

Global user IDs and future external subject mapping; no provider integration. Foundation contract only.

## 2. Organizations

Tenant root, accountable owner, timezone and provisioning. Foundation contract only.

## 3. Membership & Authorization

Membership lifecycle, delegated permissions and trusted server context. Foundation contract only.

## 4. Time Tracking

UTC entry revisions, integer durations and billable classification. Foundation contract only.

## 5. Attendance

Organization-local attendance dates; no attendance engine. Foundation contract only.

## 6. Timesheets

Versioned time summaries submitted for review. Foundation contract only.

## 7. Projects & Clients

Tenant-scoped clients, projects and composite references. Foundation contract only.

## 8. Approvals

Permission-scoped review decisions against exact revisions. Foundation contract only.

## 9. Billing Configuration

Effective-dated rates, currency and cutoff rules. Foundation contract only.

## 10. Billing Periods

Half-open UTC periods derived from IANA calendar boundaries. Foundation contract only.

## 11. Invoice Preparation

Immutable snapshots, allocations, drafts, adjustments and exports. Foundation contract only.

## 12. Reporting & Analytics

Read models constrained by organization and permission. Foundation contract only.

## 13. Desktop Monitoring & Privacy

Policy defaults, transparent collection and short authorization leases. Foundation contract only.

## 14. Audit

Append-oriented attributable security and business events. Foundation contract only.

## 15. SaaS Subscriptions

Organization subscription entitlements, separate from client invoices. Foundation contract only.

Contexts communicate through application ports and versioned events. Identity supplies global user IDs; organization membership supplies authority. Billing consumes approved revisions, never mutable timer state. Audit records transactional decisions. Subscriptions govern organization entitlements without granting permissions. Representative executable models exist for organizations, memberships, time, billing and monitoring; the remaining contexts deliberately have documentation-level contracts only.
