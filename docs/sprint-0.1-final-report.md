# Hourvia V2 — Sprint 0.1 final report

Database & authentication architecture gate · 2026-10-15 · Architecture/audit/documentation only.

## 1. Files inspected and changed

Inspected Sprint 0 final report; ADR 001; architecture overview, tenancy, authorization, database/billing design; db/schema.ts; domain model; application contracts; foundation/schema tests; persistence/dependency safety script; Netlify configuration; package/lock metadata; installed Drizzle exports and node-postgres/netlify-db driver/session source. Read platform database and identity guidance. Published package metadata/source archives were downloaded to temporary storage only, without installing or executing them. No database credentials or environment values were queried.

Created:

- docs/architecture/decisions/002-database-adapter.md
- docs/architecture/decisions/003-isolation-and-authentication.md
- docs/architecture/gates/database-enforcement.md
- docs/architecture/gates/authentication-session.md
- docs/architecture/gates/migration-recovery.md
- docs/architecture/gates/postgresql-test-matrix.md
- docs/architecture/gates/next-sprint-authorizations.md
- docs/sprint-0.1-final-report.md

Updated .netlify/results.md with a standalone gate summary. Existing ADRs remain historical records; new ADR 002 explicitly corrects the old compatibility assumption. Schema, contracts, dependencies/lockfile, tests and accepted frontend functionality are unchanged. No V1 work occurs.

## 2. Schema audit

Confirmed no PERSONAL workspace discriminator, personal-workspace FK, personal tenant root or automatic workspace provisioning in domain/application/infrastructure/schema. References to personal devices in privacy policy are device autonomy, not tenancy. Organization is the only tenant root; users are global. All 12 non-root/non-user representative tables have organization_id; composite references constrain projects→clients, time revisions→projects/memberships, rates/periods→clients and allocations→snapshots/revisions.

The schema is not deployment-ready. Findings to address only after authorization:

| Severity | Gap | Required enforcement |
| --- | --- | --- |
| P0 | Owner pointer references global user only; no exactly-one active owner SQL constraint | Deferred composite membership FK, partial owner uniqueness, deferred owner triggers plus serialized organization locking |
| P0 | Membership user_id lacks FK to global users | User FK, controlled lifecycle; no cascade removing owner/history |
| P0 | No RLS, grants, immutable-record protections or restricted operations | Implement role separation, forced policies, controlled definer operations and negative privilege tests |
| P0 | Tenant idempotency requires existing organization | Separate global bootstrap scope for creation, atomic reservations/results and replay authorization |
| P0 for auth | users.subject is globally unique without issuer; no sessions/revocation model | Provider binding (issuer,subject), session hashes/expiry/epochs and current-membership lookup |
| P1 | Delegated JSON lacks shape/allowlist constraints; version positivity not enforced in DB | Validate grants/roles and CAS version rules in SQL and application |
| P1 | Allocation entry_id not bound to referenced revision's logical entry | Composite consistency enforcement, segment model for split periods |
| P1 | Rates/snapshots lack full project override, overlap, source/rate/rounding metadata | Effective range exclusions, frozen payload expansion and currency registry |
| P1 | Timezone/currency validity exists largely in application design | Authoritative validated boundary contracts and DB allowlists where appropriate |

Audit actor FK is not tenant membership by itself; audit routine must validate actor context and preserve historical attribution after revocation. No gap is silently repaired in this sprint. Existing static tests verify metadata only, not database behavior.

## 3. Adapter decision and evidence

**Proposed: stable explicit-client Drizzle bridge using @netlify/database-managed connections; conditional, not production-approved.**

Installed/locked Drizzle 0.45.4 does export netlify-db. Its implicit initializer imports legacy @netlify/db, which is absent. Current @netlify/database is also absent. This corrects Sprint 0's blanket beta-only conclusion. Native stable module import still resolves legacy peers, so avoid its implicit/module path in the bridge; bind the appropriate stable node-postgres/serverless adapter to a checked-out client supplied by the modern platform driver. Exact serverless type/runtime compatibility requires a compiled isolated experiment.

Registry/source evidence: @netlify/database latest 2.0.1 (Node >=22.12.0) returns a pg Pool in server mode or Neon Pool/httpClient in serverless mode. Drizzle beta is 1.0.0-beta.22; inspected source has explicit-client support and an environment-based implicit path, without demonstrated safety benefit. Kit stable 0.31.11 and beta 1.0.0-beta.22 are metadata candidates only; neither installed nor executed. Do not mix snapshot formats or assume stable schema generation compatibility without testing.

Stable session source shows one checked-out client used throughout callback transactions, SERIALIZABLE config support and savepoints. HTTP queries/batches are a different path and cannot be treated as shared contextual interactive transactions. BEGIN outside cleanup try/finally in inspected Drizzle implementations creates a potential client leak on BEGIN failure. An owned acquire/BEGIN/cleanup wrapper is mandatory. COMMIT uncertainty must reconcile durable idempotency before retry.

Driver creates a pool per getDatabase call; HTTP config refresh differs from fixed pool construction. Pool reuse must be bounded, environment-scoped and invalidated on routing/credential changes. Platform role support, pooler behavior, limits, rotation and deploy integration are not proven by package source.

Fallback: parameterized native SQL on the same Netlify-managed acquired pool client, with stable Drizzle schema metadata retained. If least privilege or pinning fails, remain inactive. No beta upgrade or external database substitution is approved. Full rationale/evidence: ADR 002.

## 4. Database privilege model

Separate NOLOGIN schema owner, controlled migrator, NOLOGIN narrowly privileged operation owner, restricted runtime login and exceptional platform administrator. Runtime has CONNECT/USAGE and only enumerated function EXECUTE, no table access, DDL, ownership, role escalation or BYPASSRLS. Operation owner has exact required table privileges and forced RLS policies; audit cannot be updated/deleted/truncated. Revoke PUBLIC function/schema defaults, fix trusted search paths and reject dynamic arbitrary SQL. Migrator credentials never reach Functions.

Netlify must support actual restricted runtime credentials, role/object ownership, controlled migration identity, forced RLS, deferrable constraints/triggers, restricted functions, pinned transactions and recovery access. SET ROLE on an otherwise privileged runtime login is not enough. These capabilities remain unverified without approved platform access.

## 5. Ownership and tenant isolation design

Use **restricted operations plus FORCE RLS**, with tenant composite FKs as independent integrity checks. Actor/org/session/correlation context is parameterized and transaction-local; malformed/missing context denies access. Context alone is forgeable by an SQL caller and is not authentication: server principal verification and database operation checks are required. Runtime is denied direct tables; SQL injection/runtime compromise remains a trust-boundary risk.

Owner integrity combines deferred membership FK, partial active-owner uniqueness and deferred exactly-one matching-owner checks on organization and membership changes. Membership mutations and privilege-sensitive actions serialize on the organization row. Transfer demotes old owner before promoting new owner, then changes pointer/version in one transaction. Provisioning uses a pre-tenant actor idempotency scope and commits org/member/default-off policy/audit/result atomically.

Revocation and mutations take the same lock; an action committed before revocation is valid, actions ordered after revocation commit fail. SERIALIZABLE failures retry with current session/member reauthorization. Global session→organization→membership→resource lock order prevents inverse-lock deadlocks. Transaction context never survives release; rollback failure discards connections. Audit is transactionally append-only for committed changes; failed-attempt security logging is separately scoped. Durable idempotency hashes canonical payloads and reauthorizes replays, including after uncertain commit. Full specification: database-enforcement.md.

## 6. Authentication/session design

Provider-neutral identity verification maps issuer+subject to a global user. No provider role or browser user/org claims confer authority. Future provider implementation sits behind a verifier port; Netlify Identity is a candidate using @netlify/identity, not selected or activated.

Proposed app sessions use opaque secure HttpOnly host cookies, hashed server-side session records, global revocation epochs, idle/absolute expiry, rotation and refresh-family replay detection. Cryptographic JWT verification, issuer/audience/algorithm checks, introspection/revocation evidence, callback PKCE/state/nonce, CSRF/Origin checks and no-store responses are mandatory. Proposed expiry/assurance limits are documented, not active. Server validates session then reauthorizes current membership per operation; critical mutations recheck under transaction locks. Immediate provider-global revocation cannot be promised without validated provider APIs/events. Offline monitoring authorization remains bounded by lease expiry.

Existing structural AuthorizedContext/userId contracts must be strengthened in a later authorized sprint to accept server-validated principals and scoped transaction capabilities. No schema/provider/endpoints are changed here.

## 7. Migration and recovery strategy

Pin reviewed versions; generate only in a separately authorized disposable workspace outside auto-consumed paths. Review generated SQL and custom security objects together, preserve immutable snapshot/journal lineage and compare to an isolated catalog/security manifest. Netlify auto-applies migration files during deployment, including previews; generation is not authorization to deploy. Verify actual auto-generation/application behavior in an approved sandbox before activation. No migration generation, reset, state commands or live schema inspection occurs now.

Use expand-contract migrations and compatibility checks, controlled migrator identity, checksums, serialization, timeouts and fail-closed publication. Never edit applied files/snapshots. Failed migrations require reconciliation and forward repair; code rollback does not revert schema. Backup/PITR and an isolated restore drill, approved RPO/RTO and session-revocation reconciliation are release gates. Recovery/cutover require separate explicit approval.

## 8. PostgreSQL integration-test plan

Prepared a synthetic-data disposable PostgreSQL matrix covering ownership/provisioning/transfer; tenant reads/writes/FKs/RLS; all role-permission combinations; privilege escalation; audit tampering; idempotent races/crashes; session and membership revocation; connection reuse/cancellation/failed BEGIN/COMMIT; isolation retries; migration drift/restore; and billing allocation integrity.

Use barriers and multiple connections for races, real restricted login roles, SQLSTATE/final-state assertions and negative controls. Test each transport in a separately approved platform sandbox; local success alone cannot demonstrate deployed Netlify behavior. No integration test or database connection is executed in this sprint.

## 9. Actual validation results

| Check | Executed result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run test | PASS: 70 tests, 2 files |
| npm run check:architecture | PASS, including inactive-persistence checks |
| Production build | Not run; prohibited by run requirements |
| PostgreSQL/platform integration | Not run; no database access authorized |

Source hashes captured before/after confirm schema, manifests/lockfile, application contract and frontend App remain unchanged. Documentation edits do not activate services. No deployments, commits, pushes or Sprint 1 work occur.

## 10. P0/P1 risks

**P0 security finding:** package manifest contains credential-bearing repository metadata inherited from the existing checkout. Its value is not repeated or copied into documentation. Documentation-only scope leaves it unchanged. Removal from metadata, credential revocation/rotation and exposure review are required before publishing/installing/deploying artifacts; expiry must not be assumed. This finding independently blocks a clean security gate.

Other P0: unverified true restricted runtime identity and platform capabilities; no proven stable transport bridge; schema enforcement/session/bootstrap gaps; uncontrolled migration generation/application risk; absent recovery evidence. P1: grant/resource scoping, session policy approval, connection lifecycle/load, billing segment/snapshot/currency constraints and external audit hardening. All production-readiness assertions remain withheld.

## 11. Sprint 0.1 verdict

**BLOCKED for gate closure.** Architecture/audit deliverables and permitted regression checks are complete, and the adapter direction is proposed with evidence. Platform and database security behavior cannot be verified under the no-connection restriction; credential hygiene is also unresolved. No unsafe workaround is implemented and no production-readiness claim is made.

## 12. Readiness for isolated database implementation

Ready to review and authorize a **strictly isolated** experiment, not ready to activate protected persistence. First remediate credential metadata, then explicitly authorize disposable PostgreSQL/role setup/test migration execution, pinned adapter composition experiments and approved schema/security changes. A separate Netlify sandbox permission must identify target, no customer-data copies, connections, roles and migration/deployment scope. Authentication/provider enablement, protected endpoints and deployment each need explicit authorization. Full permission matrix and stop conditions: next-sprint-authorizations.md.

Stop here. Sprint 1 has not begun.

## Sprint 0.1A follow-up

Credential-bearing userinfo was removed from package.json without changing its repository destination. The token-format finding was confirmed and classified as sensitive, but authenticity/validity was not tested. Package metadata is Git-tracked; no token-format material was found in three locally reachable commits or local build artifacts. Remote history, logs, source archives and deployment retention are not verified. Rotation/revocation remains operator-controlled, with no credential values repeated. See docs/sprint-0.1a-final-report.md and docs/security-risk-register.md.

Local installed transport declarations/source support explicit PoolClient binding on both server and serverless paths; missing SDK/transport peers prevent claiming compiled or PostgreSQL-tested integration. Role/RLS separation and cleanup remain unverified. Approved ADR 002/003 architecture is unchanged; gate closure remains BLOCKED.
