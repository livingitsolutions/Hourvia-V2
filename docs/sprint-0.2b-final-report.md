# Hourvia V2 — Sprint 0.2B source remediation

**PASS for offline source remediation; BLOCKED for PostgreSQL enforcement, Netlify compatibility and migration promotion.** The revised candidate is ready for separately authorized isolated verification. No runtime security guarantee is claimed.

## 1. Files changed

Created:

- `db/candidates/sprint-0.2b/001_security.sql`
- `db/candidates/sprint-0.2b/README.md`
- `src/infrastructure/security/idempotency.ts`
- `tests/support/postgresql.ts`
- `tests/security-remediation.test.ts`
- `docs/sprint-0.2b-final-report.md`

Modified:

- `src/application/authentication.ts`
- `src/infrastructure/security/transaction.ts`
- `tests/transaction-lifecycle.test.ts`
- `tests/postgresql-security.test.ts`
- `tests/security-quarantine.test.ts`
- `docs/security-risk-register.md`
- `.netlify/results.md`

Reviewed Sprint 0.2A findings, historical candidate, schema, transaction/operation contracts and all 18 integration cases. Database storage guidance and the accepted explicit-client architecture remain respected. No database adapter exists or was activated. Dependency manifests, inert schema, demo screens, business features and deploy configuration are unchanged. No Hourvia V1 access or Sprint 1 implementation occurred.

## 2. Transaction completion correction

Pinned-client results now require a PostgreSQL command tag. Only `COMMIT` returns the work result. `ROLLBACK` raises AbortedCommit and cannot produce success. Missing/unexpected tags or a connection failure during COMMIT remain explicitly uncertain, discard the client, and never automatically retry. Known constraint rejection rolls back and does not retry; 40001/40P01 whole-operation retries remain bounded at three with renewed session validation. Cleanup ROLLBACK must also be acknowledged or the connection is discarded. Failed BEGIN/rollback cleanup continues to discard.

Callbacks receive an expiring ScopedClient instead of raw pool lifecycle access. It accepts only the exact parameterized operation SQL corresponding to transaction scope, rejecting transaction-control SQL, another operation and use after completion. Callbacks must await queries and avoid external side effects. Transport-specific command tags and release/discard behavior still require real integration; no implicit or convenience adapter was installed.

Offline regressions cover successful COMMIT, ROLLBACK-tag completion, unexpected/empty tags, rejected constraint COMMIT, COMMIT connection failure, failed BEGIN/rollback, unacknowledged rollback, bounded abort retries, context rejection, callback control SQL and expired handles. These tests prove wrapper decisions with injected clients, not database enforcement.

## 3. Idempotency correction

The new SQL uses `IS DISTINCT FROM` for all stored hash and identity replay comparisons. A shared validator rejects NULL/empty/oversize keys and NULL/malformed digests before any replay lookup. Bootstrap keys additionally store organization/member identity via a deferred composite membership FK; conflicting organization/member or digest fails with 22000. Revoke replay compares target and digest; NULL target fails with 22023. Durable keys remain unique, append-only and without TTL. Replays still reauthorize current epoch and membership.

Lookup now requires the original organization assertion, validates digest/key, and does not rewrite tenant context. Unknown outcomes can be reconciled without mutation; missing results remain unresolved. A server-side canonical hashing helper produces versioned, operation-bound digests with stable sorted object keys and rejects unsupported payload values. Trusted callers must include immutable organization/member/target identity and must never trust browser hashes. No endpoint uses it yet.

Offline regressions cover key/hash NULL/non-NULL combinations, malformed requests, canonical payload equality, operation/identity conflicts and required NULL-safe SQL source patterns. Real suite case 13 covers bootstrap NULL hash, conflicting member/organization, lookup replay, tenant revoke durable replay, NULL target/hash combinations and conflicting target. SQL source checks are not PostgreSQL evaluation proof.

## 4. Authorization-context reconciliation

Canonical TransactionAuthorization contains server principal, organization, correlation and operation. Principal supplies user/session/epoch from server validation. Actor, organization and correlation must be canonical UUIDs; epoch must be a positive safe integer. Transaction sets all five local assertions: actor, organization, correlation, operation and epoch, using parameterized set_config with local=true.

Database context helpers validate every required assertion, accepted scope and matching epoch argument. Missing/empty/malformed/inconsistent settings fail closed; database operations use 42501 for context denial. UUID parsing rejects noncanonical forms and safely treats invalid values as missing. All runtime operation policies include canonical context validation. Each callable operation requires its exact scope; audit mutations require provision/revoke scope. Reads and successful replay paths no longer skip correlation/context validation.

GUCs and structural principals are still trusted-server assertions, not credentials. Membership remains authoritative in SQL. No browser actor acceptance, provider, session storage, protected endpoint or authentication activation was added. Per-session expiry/revocation remains unimplemented and must precede protected persistence activation.

## 5. Integration-test hardening

All 18 cases remain actual PostgreSQL statements behind explicit disposable authorization. The suite does not apply SQL, provision roles, or start a database. It now targets the revised pre-applied baseline only.

A separate beforeAll validates dedicated logins on the same loopback database, checks actual hv_migrator/hv_runtime identities, requires seven tables and a positive revised-context helper result, creates committed global users, and provisions two organizations successfully. Fixture setup is outside the operation expected to fail. Original case 1 now independently checks committed organization, matching owner, disabled monitoring, three audit events and durable key.

Runner uses SQLSTATE-only diagnostics and sanitized typed DatabaseStatementError. Expected denials require an explicit state: 42501 permissions/context, 23505 uniqueness, documented 23503/23514 deferred owner order, 22000 replay conflicts, 22023 invalid request and 22012 deliberate rollback fault. Process/timeout/configuration/connection failures and syntax SQLSTATE cannot satisfy security denials. Offline tests exercise this classification and rejection behavior. Raw diagnostics and native URL errors are never retained as error causes; only sanitized categories survive.

Runner requires dedicated user/password settings, accepted Postgres protocol, strict disposable database prefix, loopback host, no URL query routing options, and distinct users at an identical target. It passes connection configuration only through child environment, without inheriting PGHOST/PGSERVICE/PGOPTIONS or unrelated secrets. It disables psql user initialization/prompts and uses bounded process/connection timeouts. Operator provenance must still exclude tunnels, copied production data and inappropriate targets; hostname/name guards alone cannot prove disposability.

Coverage corrections: existing second tenant and authorized read control; wrong/malformed/missing context fields and scope/epoch; nonvacuous RLS count and all-table direct-read denial; separated second-owner user setup; post-failure state for owner changes, audit attribution, cross-tenant denial and direct mutations; concurrent first-use bootstrap key rather than only prior-key replay; SQLSTATE validation of revocation race failure; NULL/identity replay cases; all-record rollback checks; all local settings reset after both commit/rollback; inactive-owner COMMIT check with a satisfied membership FK; helper function and all privileged role assumption denial.

Remaining coverage limits: concurrent cases still lack deterministic barriers; default-isolation psql operations do not exercise the SERIALIZABLE wrapper; no actual pool/transport reuse, cancellation, commit-fault injection, session races, independent policy USING/WITH CHECK negative controls or business-table enforcement is proven. Synthetic committed data remains for operator inspection and full target destruction.

## 6. Candidate history and security review

Historical candidate preserved byte-for-byte:

`db/candidates/sprint-0.2/001_security.sql`

SHA-256 `0f443cfd299ae316be7d6cc443fdb543e062b569c82ed2c3eff186c6ef55642e`.

New replacement fresh baseline:

`db/candidates/sprint-0.2b/001_security.sql`

SHA-256 `85165c04e209fa8b96167bb8dbdf9c1eca74e62d13913df0579a3b76feb43d3c`.

Schema fingerprint unchanged: `c59cfd5dee9a939d874ca4cc83a9c00b0d520d0ac2fd3396cab2183566b58a1d`.

Lockfile fingerprint unchanged: `6d44df9bfdc98189d2cfe11cdaebc9b008fc0eddaa053db320fbb7992f796e0b`.

The revised SQL is a superseding never-applied baseline, not an incremental migration to apply after the old candidate. Apply neither during this sprint and never apply both. An actually applied target would require a separately reviewed forward repair. No deployed migration history was changed. No automatic migration directory/configuration/client exists; quarantine tests and architecture checks pass. Live migration history was not queried.

FORCE RLS on all seven tables, deferred ownership checks, protected owner/membership lifecycle, organization deletion restrictions and automatic append-only audit remain. SECURITY DEFINER functions retain explicit ownership and pg_catalog search paths with qualified application objects. PUBLIC execution is explicitly revoked for all functions, including new context/request helpers. Only operation owner receives helper execution; runtime retains only four named operations and no table access. Roles still must lack BYPASSRLS/admin flags and runtime/operation inheritance, with controlled migration/schema ownership. Administrative integrity visibility remains explicit. Managed capabilities and database-wide PUBLIC/inherited/default grants require catalog verification rather than assumption. No isolation boundary was weakened.

## 7. Actual validation

Final results after corrections:

| Check | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| ESLint | PASS |
| Unit/offline tests | PASS: 100 tests, six files |
| PostgreSQL integration | SKIPPED: all 18 cases, one file |
| Architecture/inactive persistence | PASS |
| Credential regression | PASS (existing boolean-only metadata checks) |
| Quarantine/history fingerprints | PASS |
| Offline transaction/idempotency regressions | PASS; no runtime enforcement claim |
| SQL/PLpgSQL parser and PostgreSQL compilation | NOT VERIFIED; no applicable parser/runtime execution |

Integration authorization was explicitly disabled during test execution regardless of inherited settings. Initial typecheck/lint issues were corrected and final reruns passed. No database connection, candidate application/promotion, production build, live object change, provider activation, deployment, commit or push occurred. No secrets or connection URLs were printed.

## 8. Remaining PostgreSQL/Netlify assumptions

A separately authorized fresh synthetic target must have the exact reviewed baseline prepared by an operator and psql available. Functions, role ownership/grants, trigger ordering, RLS and SQLSTATE-only psql diagnostics remain unexecuted. Verify actual PostgreSQL version/extensions, restricted runtime credentials, NOLOGIN ownership, database-wide PUBLIC/inherited grants and all privilege flags. Verify source SQL/PLpgSQL compilation and context/NULL cases before declaring enforcement.

Netlify must independently demonstrate actual restricted login binding, separate migrator, pinned client/backend, PostgreSQL command-result metadata, reliable discard, server/serverless compatibility, pool routing/rotation, custom security migration preservation and review-controlled deployment behavior. No SDK/peer adapter has been installed or compiled. Public Drizzle/kernel reconciliation, backups/PITR and isolated recovery proof remain promotion gates. No fallback to privileged runtime credentials is acceptable.

## 9. P0/P1 status

Source defects from Sprint 0.2A were remediated: false COMMIT success, NULL-sensitive replay, missing context reconciliation and generic runner errors counting as negative security proof. Offline regressions pass; database consequences remain unverified.

P0 still open: SEC-001 credential issuer revocation/expiry and external logs/artifact exposure review; actual restricted Netlify roles/transport/command metadata; real database constraint/RLS/function tests; per-session security implementation before activation; schema/snapshot reconciliation and migration/recovery proof. Local cleanup and passing metadata checks do not revoke credentials.

P1 still open: deterministic revocation barriers and serializable stale-authority races, pooled context/cancellation/reconnect/load/rotation tests, bounded retry timing/backoff policy, idempotency retention decisions, dedicated tenant-revoke outcome lookup, billing consistency and privileged audit archival. These do not prevent a controlled diagnostic disposable test, but do prevent broader claims of readiness.

## 10–11. Verdict and isolated verification readiness

**PASS for the authorized dormant source remediation. Overall database security acceptance remains BLOCKED.** Ready for separately authorized isolated PostgreSQL preparation/application and verification of the revised fingerprint, subject to the explicit operator setup and disposable-target protections. This readiness recommendation does not authorize a connection, migration application, platform sandbox, provider, deployment or persistence activation.

Next evidence must include successful baseline compile/apply in a genuinely fresh synthetic target, role/catalog attestations, all 18 hardened cases with actual SQLSTATE/final-state results, and additional transport/race/fault checks before promotion. Preserve both historical source records and any future applied ledger; use forward repair for applied defects. Stop after reporting.
