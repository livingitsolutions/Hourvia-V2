# Hourvia V2 — Sprint 0.3A isolated PostgreSQL verification preflight

**Verdict: BLOCKED.** The operator explicitly answered "Not confirmed" for SEC-001 credential closure. Preparation of the verification environment is complete at source level, and no offline check failed. No PostgreSQL connection, SQL, migration generation or application, persistence or authentication activation, deployment, commit or push occurred. No credential, connection URL or secret fragment was printed or recorded.

## 1. Credential closure confirmation status — BLOCKED

The operator was asked to confirm explicitly that the GitHub-format token formerly in `package.json` is revoked or expired at the issuer, and that remote logs, source archives and build artifacts were reviewed. Answer: **Not confirmed**. Local removal and the passing metadata regression (`tests/credential-hygiene.test.ts`) do not prove revocation. SEC-001 stays P0 open, and the database execution gate is BLOCKED until the operator confirms closure.

## 2. Environment variable presence (names only; values never read into output)

| Variable | Status | Assessment |
| --- | --- | --- |
| `HOURVIA_DISPOSABLE_PG_AUTHORIZED` | UNSET | Integration suite skips (correct for this sprint) |
| `HOURVIA_TEST_MIGRATOR_URL` | UNSET | Operator must inject |
| `HOURVIA_TEST_RUNTIME_URL` | UNSET | Operator must inject |
| `DB_MIGRATION_TARGET` | UNSET | Operator must set `hourvia-v2-verification` |
| `HOURVIA_TEST_PG_SSLROOTCERT` (new) | UNSET | Operator must supply the CA path for verify-full |
| `NETLIFY_DB_URL`, `NETLIFY_DB_BRANCH`, `NETLIFY_AGENT_RUNNER_DB_CONNECTION_STRING` | SET | Netlify-managed agent/preview branch. **Rejected as a target** |
| `DATABASE_URL`, `NETLIFY_DATABASE_URL(_UNPOOLED)`, `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSERVICE`, `PGOPTIONS`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGPASSFILE` | UNSET | No ambient libpq routing; the harness would not inherit these anyway |

Tooling: `psql` is not on PATH in this runner. `pg`, `@netlify/database`, `@neondatabase/serverless` and `drizzle-kit` are not installed. There is no `~/.pgpass`.

## 3. Target isolation evidence

Every harness statement now passes through `verificationTarget()` in `tests/support/postgresql.ts` before any process is started:

- The label must equal exactly `DB_MIGRATION_TARGET=hourvia-v2-verification`. Absent, empty, `production`, `preview`, `hourvia-v1`, `deploy-preview-*`, unknown and suffixed labels are rejected (offline tested).
- The existing guards still apply: `postgres(ql)://` only, loopback host only, `hourvia_disposable_*` database name, user and password present, and no query string or fragment (so `sslmode`/`host` cannot be overridden).
- New: database names containing a `prod`/`production`/`preview`/`deploy`/`branch`/`staging`/`main`/`v1` token are rejected even with the label.
- New: a connection identical to `NETLIFY_DB_URL`, `NETLIFY_DATABASE_URL(_UNPOOLED)`, `NETLIFY_AGENT_RUNNER_DB_CONNECTION_STRING` or `DATABASE_URL` is rejected. This is an in-memory equality check only, and managed values are never parsed or logged. Remote Netlify hosts are already excluded by the loopback guard.
- Netlify deploy-preview branches copy production data, so they are not allowed as targets. Hourvia V1 is never referenced.

Limit: these name, host and label checks cannot prove disposability. A loopback port can be an SSH tunnel or proxy to a shared server. The operator must attest provenance (item 9).

## 4. Runtime/migration role plan

Credential separation is enforced in two layers. The runner requires distinct users at the identical host, port and database. `beforeAll` asserts `current_user` is `hv_migrator` and `hv_runtime` respectively. The candidate's opening `DO` block aborts unless all four roles exist with the safe flags.

| Role | Login | Required properties | Granted by candidate |
| --- | --- | --- | --- |
| `hv_migrator` | LOGIN | Member of `hv_schema`; not superuser; used only for apply and test inspection; never in runtime bundles | none (assumes `hv_schema`) |
| `hv_schema` | NOLOGIN | Schema/table owner; member of `hv_operation`; no SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION | owns `hv`, integrity policies |
| `hv_operation` | NOLOGIN | Definer-function owner; no memberships, no admin flags | narrow SELECT/INSERT/column UPDATE |
| `hv_runtime` | LOGIN | No memberships, no admin flags, no database/public-schema CREATE | `USAGE` on `hv` plus EXECUTE on 4 functions only |

Before apply, the operator must verify catalog state that the candidate does not check: database `CONNECT` grants, PUBLIC grants in `public` and other schemas, default privileges, `pg_hba` method (scram-sha-256), and that `hv_migrator` is not a superuser and is not reachable from runtime.

## 5. TLS and transport prerequisites

The operator chose **verify-full**. The harness now forces `PGSSLMODE=verify-full` with `PGSSLROOTCERT` from `HOURVIA_TEST_PG_SSLROOTCERT`, which must be an existing absolute path. It refuses to run without that setting. URL query overrides remain rejected. `beforeAll` additionally asserts `pg_stat_ssl.ssl = t` for both logins and `server_version_num >= 150000`.

Operator setup: generate a disposable CA and a server certificate with SAN `localhost`/`127.0.0.1` (and `::1` if used); set `ssl=on`; add `hostssl` lines in `pg_hba` with only scram for both roles, and no `host`/`local` trust lines; destroy the key material with the target.

Supported version: PostgreSQL server 15+ and a matching psql 15+ client. The test assertions use `endsWith()` on multi-statement `-c` output, which assumes psql ≥ 15 prints every result. Record exact server and psql versions.

Out of scope for local proof (Netlify-specific, P0): restricted login binding on managed Netlify Database, pinned backend through the Netlify pooler, command-tag metadata from `@netlify/database` transports, pool eviction/rotation and serverless HTTP/WebSocket behavior.

## 6. Migration candidate integrity

| Artifact | SHA-256 | Status |
| --- | --- | --- |
| `db/candidates/sprint-0.2/001_security.sql` (historical) | `0f443cfd299ae316be7d6cc443fdb543e062b569c82ed2c3eff186c6ef55642e` | Identical in every commit since a510627 |
| `db/candidates/sprint-0.2b/001_security.sql` (revised) | `85165c04e209fa8b96167bb8dbdf9c1eca74e62d13913df0579a3b76feb43d3c` | Identical since 4210990 |
| `db/schema.ts` (inert) | `c59cfd5dee9a939d874ca4cc83a9c00b0d520d0ac2fd3396cab2183566b58a1d` | Unchanged since 5503a78 |
| `package-lock.json` | `6d44df9bfdc98189d2cfe11cdaebc9b008fc0eddaa053db320fbb7992f796e0b` | Unchanged |

Repository identity: HEAD `aac9ba5` on `main` matches the published production deploy commit for `livingitsolutions/Hourvia-V2`. The working tree was clean at start.

Quarantine: there is no `netlify/database/migrations/`, `drizzle.config.ts`, `db/index.ts` or `netlify/functions/`, and no `@netlify/database` or `drizzle-kit` dependency. Netlify applies migrations only from `netlify/database/migrations/`, so neither candidate can run during a deploy. The build command (`npm run build`) does not run tests. The architecture check and quarantine tests pass. The site currently reports no provisioned database.

Residual risk: `db/schema.ts` sits at the conventional Drizzle schema path. Before any dependency change, the operator must confirm that Netlify never auto-generates migrations from it.

## 7. Integration-test execution plan (separately authorized run only)

Preconditions: SEC-001 confirmed; operator provenance attestation; a fresh dedicated host or container on an ephemeral volume with no network egress and no copied data; PostgreSQL 15+ with verify-full TLS; roles provisioned as in item 4; and the revised candidate applied **once** as `hv_migrator` after its checksum is verified against `85165c04…`. Never apply the 0.2 candidate, and never apply both. Apply output must be SQLSTATE-only. Any apply failure stops the run, and the target is destroyed.

Run serially: `DB_MIGRATION_TARGET=hourvia-v2-verification HOURVIA_DISPOSABLE_PG_AUTHORIZED=YES_SYNTHETIC_DISPOSABLE npx vitest run tests/postgresql-security.test.ts --no-file-parallelism`. Inject secrets through a secret store, never shell history or argv. Capture vitest pass/fail and SQLSTATEs only.

`beforeAll` (any failure aborts all 18; none can count as passing): same target with distinct logins; current_user identities; TLS on both logins; version ≥ 15; 7 `hv` tables; positive `context_valid('read')`; fixture users; two provisioned organizations.

| # | Case | Expected evidence |
| --- | --- | --- |
| 1 | Atomic organization creation | org/owner/monitoring-off/3 audits/1 key = `[1, 1, 1, 3, 1]` |
| 2 | Ownerless org at COMMIT | 23503 or 23514; no residual rows |
| 3 | Second active owner | 23505; owner count stays 1 |
| 4 | Owner pointer change | 42501; owner unchanged |
| 5 | Owner revoke/role change | 42501 ×2; `OWNER:true` |
| 6 | Cross-tenant read/revoke/insert | Positive own-org read; 42501 ×3; other member active |
| 7 | Missing/empty/malformed context, epoch, scope | 42501 for 13 variants |
| 8 | FORCE RLS + direct reads | 7 forced tables; 42501 on all 7 |
| 9 | Audit UPDATE/DELETE/TRUNCATE | 42501 runtime and schema owner; count 3 |
| 10 | Missing correlation | 42501; no rows |
| 11 | Concurrent revocation | Exactly 1 success, other 42501; `false:2` |
| 12 | Concurrent first-use bootstrap | Both return org; 1 key; 3 audits |
| 13 | Conflict/NULL replay matrix | 22000/22023 as specified; version 2 |
| 14 | Fault rollback | 22012; no rows |
| 15 | Local context reset | All five settings `clear` after COMMIT and ROLLBACK |
| 16 | Inactive owner at COMMIT | 23514; no rows |
| 17 | Privilege escalation | 42501 for SET ROLE ×3, CREATE, helper; 0 memberships |
| 18 | Direct mutations | 42501 ×2; state unchanged |

Failure handling: on any failure, stop. Do not rerun against the same target and do not edit SQL to make tests pass. Record the case number, SQLSTATE and the version, role and TLS evidence. Preserve the target for inspection, then destroy it. A source defect goes to a new reviewed candidate with a new checksum on a fresh target.

Known non-proving limits: there are no deterministic barriers in cases 11/12; psql uses default isolation rather than the SERIALIZABLE wrapper; there is no pooled reuse, cancellation or COMMIT-fault injection; and there are no policy negative controls. A generic 42501 cannot distinguish a privilege denial from a trigger denial.

## 8. Cleanup and recovery plan

The tests intentionally leave committed synthetic data. After evidence capture, the operator drops the whole disposable cluster or container and its volume, which removes the roles, CA/server keys and injected secrets. No object-level cleanup or reuse is allowed, and nothing is restored into a shared server. For an aborted apply: the transaction rolls back; verify the `hv` schema is absent, or destroy the target. For an uncertain outcome, destroy the target and start fresh rather than reconcile it. Production and preview recovery (backups/PITR, RPO/RTO, restore proof) remains a separate P0 promotion gate and is untouched here.

## 9. Outstanding operator actions

1. **SEC-001:** revoke or confirm expiry at GitHub; review Actions/Netlify build logs, deploy source zips and artifacts; provide an explicit written confirmation.
2. Provision an isolated runner with psql 15+ and PostgreSQL 15+ (this Netlify agent runner has no psql and must not be used).
3. Provide a verify-full CA, a server certificate, `hostssl` + scram `pg_hba`, and set `HOURVIA_TEST_PG_SSLROOTCERT`.
4. Create the four roles; complete the catalog/grant review in item 4; apply the revised candidate once with its checksum verified.
5. Set `DB_MIGRATION_TARGET`, both connection settings and the authorization flag via secret injection only.
6. Attest no tunnel/proxy, no customer or V1 data, and no Netlify-managed branch.
7. Netlify platform (later sandbox): confirm restricted-login support, migrator separation, pinned transactions through the pooler, command-tag metadata, no auto-generation from `db/schema.ts`, and backup/restore.

## 10. Validation results (actual)

| Check | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| ESLint | PASS |
| Offline tests | PASS: 104 tests in 7 files (100 previous + 4 new preflight) |
| PostgreSQL integration | SKIPPED: 18 cases (authorization forced off) |
| Architecture/inactive persistence | PASS |
| Fingerprints | PASS (all four unchanged) |
| SQL compilation / database enforcement | NOT VERIFIED (no execution permitted) |

**Verdict: BLOCKED.** The block is caused solely by the unconfirmed credential closure and the unprovisioned operator environment. No FAIL condition was found.

## 11. Readiness for separately authorized database execution

**Not ready to execute.** The harness and plan are ready; the gate is not. Execution can be authorized once item 9 actions 1–6 are complete and evidenced. Even a fully passing run would prove only local PostgreSQL enforcement for this candidate. Netlify role, transport and recovery gates, and promotion, stay BLOCKED. Sprint 0.3B and Sprint 1 were not started.
