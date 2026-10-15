# Hourvia V2 security risk register

Updated by Sprint 0.1A. Severity is impact/readiness priority; open does not mean an active feature exists. Architecture remains unchanged.

| ID | Priority | Finding | Evidence/status | Closure requirement |
| --- | --- | --- | --- | --- |
| SEC-001 | P0 | Credential-bearing package metadata | package.json repository.url contained a GitHub-format access token; removed locally. package-lock.json clean. No matching token in reachable history or local build artifacts. Credential validity and external exposure unknown | Operator verify expiration/revocation, replace automation credential if needed, assess remote logs/source archives/artifacts; fresh metadata test passes |
| SEC-002 | P0 | Managed runtime privilege separation unverified | No platform/DB connection. SDK override capability does not establish restricted role provisioning | Dedicated runtime login and migrator credentials; real privilege/RLS negatives in authorized sandbox |
| SEC-003 | P0 | Transport composition and failure cleanup unverified | Installed stable transport sources retain explicit clients; peers/SDK absent; BEGIN/rollback cleanup concerns remain | Compile exact dependency bridge; isolated failure/reuse/transaction tests; exception-safe caller lifecycle |
| SEC-004 | P0 | Ownership/member/session/bootstrap constraints absent | Sprint 0 schema intentionally inert and incomplete | Authorized schema/security implementation with deferred checks, session/issuer model and bootstrap idempotency tests |
| SEC-005 | P0 | Migration/deployment/recovery behavior unverified | No runner/backup/restore exercise | Reviewed snapshots/security manifest, no automatic unreviewed DDL, isolated restore and approved RPO/RTO |
| SEC-006 | P1 | Pool capacity/rotation lifecycle uncertain | New pool per SDK initialization; fixed pool vs refreshing HTTP configuration | Capacity limits, bounded reuse, routing/credential eviction, cancellation/load tests |
| SEC-007 | P1 | Revocation/privacy semantics require validation | ADR 003 defines strong transaction ordering; offline leases bounded, default zero | Race/session/lease tests and approved session/retention policies |
| SEC-008 | P1 | Billing/audit hardening incomplete | Segment consistency, frozen payloads and privileged audit tampering controls remain planned | Future reviewed schema constraints, allocation tests and external tamper-evident audit process |

No secret value, secret fragment, credential-bearing URL or secret hash is recorded. SEC-001's local cleanup is complete; provider-side closure is not claimed. Previously emitted audit/runner logs are also part of operator exposure review; this run does not retrieve or repeat their contents.

## Sprint 0.2 candidate status

A quarantined security kernel and dormant transaction/session contracts now exist; see `docs/sprint-0.2-final-report.md`. SEC-004 is implemented at candidate level only, not closed: SQL remains unexecuted, the inert Drizzle business schema is unreconciled, and session/provider implementation remains absent. All 18 real PostgreSQL cases skipped. SEC-002/003/005 remain P0 pending actual role, transport, migration and recovery evidence. SEC-001 local regressions pass but issuer revocation and external exposure closure remain open. No persistence or migration was activated.
