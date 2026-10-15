# Hourvia V2 — Sprint 0.2 final report

Verdict: **BLOCKED for database/platform security verification and promotion**. The quarantined implementation is reviewable and local validation passes. No PostgreSQL enforcement result is claimed.

## 1. Preflight and repository

Reviewed Sprint 0, 0.1 and 0.1A reports; ADRs 001–003; tenancy, authorization, session, enforcement, migration recovery, platform and test gates; schema and risk register. Working path is `/opt/build/repo`; package identity and repository metadata identify Hourvia V2. V1 was not accessed. No Git internals were inspected. No migration files, snapshots, journal or deployment migration directory existed. Provided context says no applied migrations; no live state query confirmed it.

Schema SHA-256 before and after: `c59cfd5dee9a939d874ca4cc83a9c00b0d520d0ac2fd3396cab2183566b58a1d`. Lockfile unchanged: `6d44df9bfdc98189d2cfe11cdaebc9b008fc0eddaa053db320fbb7992f796e0b`. Existing migration inventory: empty (no migration-file fingerprint). Screens/composition/styles were untouched; foundation tests and typecheck pass. Browser interaction verification was not run, so demo behavior is preserved by unchanged source rather than claimed browser evidence.

## 2. Credential hygiene

Credential-bearing URL regression passes. A working-tree URL/token-pattern scan excluding Git internals and dependencies passes with boolean-only output. No environment values were printed or database/provider calls made. This limited pattern scan is not exhaustive secret detection. SEC-001 provider revocation/expiry and external logs/artifact exposure remain open; local cleanup is not revocation.

## 3. Files

Created `db/candidates/sprint-0.2/001_security.sql` and its README; `src/application/authentication.ts`; `src/infrastructure/security/transaction.ts`; `tests/postgresql-security.test.ts`; `tests/security-quarantine.test.ts`; `tests/transaction-lifecycle.test.ts`; this report. Updated risk register and `.netlify/results.md`. Schema, dependency manifests, demo code and deploy configuration remain unchanged.

## 4. Candidate provenance

Candidate: `db/candidates/sprint-0.2/001_security.sql`.

SHA-256: `0f443cfd299ae316be7d6cc443fdb543e062b569c82ed2c3eff186c6ef55642e`.

Handwritten fresh security-kernel baseline, not ORM-generated, no snapshot lineage. Located outside all auto-applied directories. Separate `hv` schema intentionally does not activate or replace the inert business schema. Promotion requires explicit schema/generator reconciliation.

## 5. Ownership and membership

Organization remains sole tenant root. Deferred owner-to-membership FK and owner constraint triggers enforce a matching active owner at COMMIT; partial unique index rejects two active owners. Membership users reference global users. Tenant identity changes, owner changes, owner revocation, deletions and membership reactivation are denied. Non-owner revocation increments version under shared organization locks. Owner transfer has no permitted operation. Composite keys bind tenant revocation outcomes to same-organization members. Organization deletion is rejected and historical FKs restrict deletion. Other business-table enforcement is outside this kernel and remains inactive.

## 6. RLS and privileges

All seven candidate tables enable FORCE RLS. Runtime has enumerated operation execution only; no table privileges. Operation owner is NOLOGIN, non-bypass and separate from schema owner/migrator. Definer paths are fixed, object references qualified, PUBLIC function grants revoked, and integrity/audit triggers separately owned. Missing context denies operations. Role prerequisites block on unavailable/unsafe capabilities; no Netlify capability is assumed. Database-wide inherited/PUBLIC grants still require operator catalog verification.

## 7. Transactions, audit and idempotency

Dormant injected-client wrapper pins BEGIN/context/work/COMMIT/ROLLBACK, revalidates sessions before each attempt, retries only known-aborted serialization/deadlock errors at most three attempts, and discards clients after failed BEGIN/rollback or uncertain COMMIT. Uncertain outcomes raise a reconciliation-required error and never automatically rerun. Bootstrap lookup is read-only reconciliation. Security operations use parameterized SQL; only reviewed SQL functions mutate tables. Atomic provision creates organization/owner/default-OFF monitoring/audits/key outcome. Audit triggers require transaction actor/correlation and append events atomically; updates/deletes/truncate are denied. Bootstrap and revoke keys persist without expiry and reject conflicting hashes; replays reauthorize. README records the remaining fault/race matrix and callback restrictions.

## 8. Authentication boundary

Provider-neutral identity verification, server session validation/revalidation, epoch, invalidation and membership reauthorization contracts were added. No provider, session persistence, endpoints or UI were activated. Structural TypeScript principals and GUCs are not unforgeable authentication; the trusted server must construct them. SQL checks current epoch/membership under locks. Session expiry/provider revocation still need a future implementation before activation.

## 9. Integration inventory

The real-PostgreSQL suite contains all 18 requested cases: atomic creation; missing owner; multiple owner; owner mismatch; unauthorized owner change; cross-org reads/writes; missing context; forced RLS/runtime privileges; audit update/delete/truncate; missing audit attribution rollback; concurrent revocation; duplicate keys; conflicting payload; failed transaction rollback; same-connection context reset; deferred commit checks; role separation; direct mutation denial.

Tests require explicit disposable authorization, two dedicated loopback credentials, synthetic database-name guard, installed psql and a separately prepared/applied candidate. The suite never applies SQL or provisions roles. All 18 skipped. Concurrent cases are basic two-connection checks, not complete barrier-controlled races. RLS table flags and operation denial do not replace the full future policy negative-control matrix. Transport/pool lifecycle tests remain unexecuted.

## 10. Actual validation

Typecheck PASS; ESLint PASS; Vitest **76 passed, 18 skipped**, five passed files and one skipped file; architecture/inactive persistence PASS; metadata credential regression PASS; migration quarantine PASS; working-tree credential pattern scan PASS. Lifecycle unit tests cover failed BEGIN, rollback failure, uncertain COMMIT and bounded aborted retries. PostgreSQL SQL/PLpgSQL execution NOT RUN. SQL parser unavailable (`psql` and Python pglast absent); syntax parsing NOT RUN. Browser automation and production build NOT RUN. No connection, provisioning, migration application/promotion, deploy, commit or push occurred.

## 11. Netlify compatibility

Netlify Database remains the intended storage primitive with the accepted explicit-client ADR bridge. No SDK or peers were installed. Managed role provisioning, separate login binding, pinned server/serverless transport, definer ownership, forced policies, pool reuse/rotation, migration review controls and backup/restore remain unverified. Unsupported roles or privilege boundaries mean BLOCKED, never downgraded isolation.

## 12. Promotion/recovery

Candidate README specifies role preparation, isolated test setup, review provenance and cleanup. Test runner does not self-apply, complying with this sprint's restriction. Separately authorize disposable preparation/application, execute and expand security matrix, verify exact Netlify sandbox capabilities, reconcile schema/snapshots/security manifest and prove isolated restore before promotion. Preserve applied history and use forward repair. Publication must stop on privilege drift/unreviewed generation; ambiguous migration outcomes require reconciliation. Restore requires session/revocation and durable-outcome review. No automatic promotion is authorized.

## 13–15. Findings, verdict and readiness

P0: SEC-001 issuer/external exposure closure; SEC-002 actual restricted role/Netlify verification; SEC-003 exact bridge and pool/commit fault proof; SEC-004 candidate SQL execution, session implementation and broader security matrix; SEC-005 schema reconciliation, migration ledger and recovery proof. P1: deterministic revocation barriers, pooled context/cancellation/load/rotation, idempotency retention decisions, remaining billing constraints and privileged audit archival. Monitoring remains OFF; no new configuration operation changes the accepted admin-only policy. Billable-hours/invoice-preparation scope is preserved; Sprint 1 is not started.

**BLOCKED** overall. Ready for review and separately authorized fresh disposable PostgreSQL preparation; not ready for promotion, persistence, authentication or production use. The harness exists and defaults to SKIPPED; absence of execution is not evidence of enforcement. Stop after this report.
