# Hourvia V2 — Sprint 0.2A security review

Verdict: **BLOCKED** for verification readiness and promotion. Quarantine and historical fingerprints pass. Source review identifies defects and incomplete test evidence; no PostgreSQL security enforcement has been verified. This review does not authorize candidate application.

## 1. Candidate and historical provenance

Candidate: `db/candidates/sprint-0.2/001_security.sql`.

SHA-256: `0f443cfd299ae316be7d6cc443fdb543e062b569c82ed2c3eff186c6ef55642e`.

Schema: `db/schema.ts`, SHA-256 `c59cfd5dee9a939d874ca4cc83a9c00b0d520d0ac2fd3396cab2183566b58a1d`.

Lockfile SHA-256: `6d44df9bfdc98189d2cfe11cdaebc9b008fc0eddaa053db320fbb7992f796e0b`.

All match Sprint 0.2 records; schema and lockfile also match earlier recorded provenance. Candidate, schema and lockfile were not changed. Historical migration inventory is empty: no deploy-consumed migration directory, Drizzle configuration, snapshot or journal is present. Live migration state is NOT VERIFIED; no connection or Git-internal inspection occurred.

The candidate is outside `netlify/database/migrations`, has no configuration/script reference that applies it, and is absent from composition. Architecture and quarantine checks pass. Current checkout does not automatically apply it. Future platform auto-generation behavior remains unverified and cannot be guaranteed from local checks; quarantine is not a substitute for a future deployment review gate.

## 2. Inspected files and permitted changes

Inspected Sprint 0.2 report; candidate SQL and README; db/schema.ts; transaction infrastructure; authentication contracts; PostgreSQL, lifecycle, quarantine and credential tests; ADRs 001–003; risk register; architecture script; Netlify/Vite configuration and installed parser availability.

Only implementation change: a narrow offline harness fix in `tests/postgresql-security.test.ts` sanitizes URL-constructor errors. Native invalid-URL exceptions retain an `input` field, which could expose confidential configuration through Vitest. No confidential input was used in reproduction. All SQL/application code stays unchanged. Added this report and updated risk register and `.netlify/results.md`. Business features, monitoring defaults, organization-only scope and billable-hours/invoice-preparation scope stay unchanged.

## 3. SQL and PL/pgSQL parser result

**NOT VERIFIED**. No installed psql/pg_config executable or Python pglast, pg_query or sqlparse module was found; installed JavaScript parser inventory did not reveal a PostgreSQL/PLpgSQL parser. No parser was downloaded or installed, and no database was started. Manual source review is not a parse/compile result. A generic SQL tokenizer would also not prove PostgreSQL or PL/pgSQL validity. Later isolated verification must compile every function and execute each branch; parsing alone cannot resolve permissions, rowtype fields or catalog-dependent semantics.

## 4. Ownership and tenancy

Source design combines deferred composite owner FK, immediate partial unique active-owner index and deferred matching-active-owner triggers. Together these target exactly one matching active OWNER at transaction end. Trigger checks run as schema owner with an always-visible integrity policy, preventing caller policies from hiding an invalid owner. Membership user FKs, role allowlist, positive versions and unique organization/user and organization/member pairs are present. Core tenant FKs use organization root; operation-request target is composite tenant/member backed.

Organization ID/owner pointer changes are denied; owner membership updates and every membership delete/truncate are denied. Non-owner updates preserve identity, increment version, reject reactivation and prevent promotion to OWNER. Owner transfer is unavailable. Organization delete/truncate is denied; no history-removing cascades are present. Direct administrative DML remains a trusted path, not constrained to authenticated membership checks. Monitoring-policy organization identity has no separate immutable-key guard, but runtime exposes no policy mutation. Organization name/timezone/version changes have no CAS/version guard; no runtime operation exposes them. These are future mutation-design requirements, not claims of an exposed feature.

The seven-table `hv` security kernel is not the public Drizzle business schema. Business tables and session/issuer mappings remain outside this candidate. Generating/applying the public schema would not inherit these protections. Reconciliation is a P0 activation gate, not an isolated-kernel-test prerequisite.

## 5. RLS, privileges and authorization context

All seven tables receive ENABLE and FORCE RLS. `hv_runtime` has schema USAGE and four explicit function EXECUTEs, no direct tables/sequences. `hv_operation` owns operations, has actor/tenant policies and narrow mutation grants; column UPDATE grants on users/organizations are needed for FOR UPDATE locks. `hv_schema` owns tables/integrity/audit functions; its unrestricted integrity policy is intentional administrative visibility. FORCE RLS does not eliminate that policy or prevent a schema administrator from changing protections.

Preflight checks four named roles, selected administrative flags, absence of runtime/operation memberships, NOLOGIN for schema/operation owners, current migrator identity and runtime database/public-schema CREATE. Runtime and migrator LOGIN status, all migrator flags, other-schema privileges, PUBLIC function grants elsewhere, database CONNECT/TEMP, membership SET/INHERIT options and existing default grants are not exhaustively attested. Separate actual credentials and complete catalog review remain required. Schema owner must be able to create the schema and assign ownership to operation owner; exact PostgreSQL version and managed-role capabilities are unknown.

Definers have fixed pg_catalog paths and qualified application objects; dynamic SQL uses identifier formatting over a fixed table list only. PUBLIC execution is explicitly revoked at the end. Schema-local default privilege revocation alone does not remove PostgreSQL's global default PUBLIC function EXECUTE; the final explicit revoke is essential. Existing hv_operation-owned functions are protected by that revoke, but future functions need their own verified ownership/default-grant policy. Runtime cannot assume a privileged role under the stated topology.

Missing/empty actor or organization denies normal tenant operations by NULL comparisons/no matching authorized rows. Malformed UUID settings raise errors rather than grant access. Missing correlation denies new audited mutations. However `read_organization` does not require correlation, and successful replay paths do not necessarily read/validate it. Bootstrap lookup intentionally resolves organization from a durable actor-scoped key, so it does not require an incoming organization context. A malformed unused correlation can therefore be ignored. This is a source-visible contract inconsistency if every operation is required to validate all three settings; universal invalid-context denial is not established.

GUCs and structural TypeScript principals are trusted-server assertions, not authentication credentials. Runtime SQL access could impersonate a valid actor/epoch. Provider verification, opaque sessions, single-session revocation/expiry and trusted server composition are not implemented. Revalidation happens before SQL; only the user epoch is checked under a database lock. No claim of transaction-time single-session invalidation is justified.

## 6. Audit and idempotency

Core organization/member/policy mutations automatically insert actor/correlation/transaction-tagged audit rows in the same transaction. Failed audit insert aborts the mutation. UPDATE/DELETE/TRUNCATE triggers deny audit/idempotency tampering; runtime has no insertion privileges for audit. Schema owner can insert fabricated audit rows or disable triggers as an administrative trust boundary. Audit actor references global users, not tenant membership; the operation's authorization check supplies membership attribution. No external tamper-evident archive exists.

Bootstrap keys are actor/key scoped; tenant revoke keys add organization/actor/operation/key and target. Unique constraints, user/organization locks and atomic result/mutation commit target durable convergence. No expiration permits accidental key reuse. Server-side canonical versioned payload hashing is a contract only; no hash canonicalizer is implemented.

**Proven source defect:** replay uses `stored.payload_hash <> digest`. With a NULL digest the comparison is NULL, and PL/pgSQL IF does not treat it as true. Table NOT NULL/CHECK constraints do not help because replay returns before INSERT. Bootstrap provision and lookup therefore accept a NULL digest for an existing key. Revoke replay can similarly bypass one comparison with NULL; a matching target plus NULL digest returns successfully, and NULL digest plus NULL target makes both comparisons unknown. This returns an existing result rather than executing a new mutation, but violates conflict/invalid-input rejection. Require non-null/format validation and NULL-safe comparisons in separately authorized implementation work.

Bootstrap replay/lookup rewrites local organization context to the stored organization. This is deliberate actor-scoped reconciliation but requires documentation and later tests for caller-context expectations. Tenant revocation has no dedicated read-only reconciliation operation; repeating its idempotent call requires current owner authority and leaves uncertainty unresolved if that authority is gone.

## 7. Transactions and concurrency

Wrapper acquires one injected client, starts SERIALIZABLE, sets parameterized transaction-local settings, executes work, commits and releases. Known 40001/40P01 failures retry at most three attempts with renewed session validation. Failed BEGIN/rollback and uncertain COMMIT discard the client. Uncertain commit is never automatically retried; class-23 commit errors are treated as known failures. Client release behavior and transport error-code classification still require exact peer/driver verification.

**Proven source defect, reproduced offline:** PinnedClient results contain rows only and wrapper ignores PostgreSQL command tags. If work catches a statement error and leaves an aborted transaction, PostgreSQL COMMIT can return a successful protocol response tagged ROLLBACK. The wrapper then returns the callback result as success. A synthetic injected client returning that tag reproduced the acceptance; this is proof of wrapper logic, not live PostgreSQL behavior. Expose/check command tags and test aborted-but-swallowed statements before readiness approval. Raw-client callbacks can also issue transaction control or leak a handle; scoped operation capabilities and an explicit no-nested-control/no-external-effects contract are needed.

Current SQL lock order is acting global user, organization, acting membership, target. Provision replay takes only actor lock and checks OWNER; transfer is currently impossible, limiting that race. Reads and revocation take the same organization lock, serializing with a committed revoke. Different actors acquire different user locks before the shared organization lock; the current two-step revoke routine does not acquire the target user's global lock. Future global invalidation/member-management operations must preserve one order. READ COMMITTED direct SQL and SERIALIZABLE wrapper behavior both need actual tests; stale SERIALIZABLE authority may require abort/retry. Three retries have no backoff/deadline. Connection release( discard ) has not been compiled/exercised with a Netlify-managed transport, pooler or actual backend.

## 8. All 18 integration cases: actual source coverage

Every case remains SKIPPED. The suite uses real psql commands when enabled, not mocks, but its current generic catch converts process/timeout/syntax/permission failures to the same rejection. Negative tests generally do not assert SQLSTATE or prove the statement reached the intended constraint. Therefore many could pass for the wrong reason.

| Case | Current exercise | Missing evidence |
| --- | --- | --- |
| 1 Atomic creation | Runtime identity, provisioning result and three audit rows | Explicit org/owner/policy/key final-state assertions and fault points |
| 2 Missing owner | Admin org insert fails at COMMIT | Distinguish deferred FK vs owner trigger, assert rollback |
| 3 Multiple owners | Second global user and active owner insert | Specific unique-index SQLSTATE and unchanged final state |
| 4 Owner mismatch | Update pointer to random user | Identity guard prevents update first; does not isolate deferred matching-owner enforcement |
| 5 Owner role change | Owner revoke operation denied | Direct owner demotion/promotion/inactivation and identity reassignment cases |
| 6 Cross-organization | Nonexistent random org read; direct insert denied | Two populated tenants, real cross-tenant reads/writes through operations and independent FK/RLS controls |
| 7 Missing context | Context-free read denied | Partial/empty/malformed settings, epochs, correlation and replay paths |
| 8 RLS/privileges | Catalog flags and runtime table denial | Non-vacuous seven-table count, each USING/WITH CHECK policy and negative controls |
| 9 Audit tampering | Runtime and schema-owner update/delete/truncate denied | SQLSTATE, actor forgery, cascades and forced audit-insert failure |
| 10 Missing audit | Context-free admin insert fails | May fail through multiple checks; actor-only/correlation-only and explicit no partial rows |
| 11 Concurrent revoke | Two commands; one success; inactive/version=2 | No synchronized barrier or authorize-vs-revoke race; generic failure may hide unrelated defects |
| 12 Duplicate keys | Concurrent replay of a key already created by case 1 | Concurrent first-use reservation and exactly one committed outcome |
| 13 Conflicting payload | Different non-null hash denied | NULL/malformed payload, tenant revoke keys, cross-actor scope and replay after revocation |
| 14 Failed rollback | Fresh provision then division by zero; no organization | Trigger can fail before division; audit/member/policy/key absence and fault attribution |
| 15 Context reuse | Same psql connection COMMIT then actor setting cleared | Organization/correlation reset, A/B/no-context pool reuse, rollback/savepoint/cancel/failure |
| 16 Deferred constraints | Ownerless org then SET CONSTRAINTS IMMEDIATE | Case 2 covers COMMIT rejection; no isolated inactive/mismatched owner trigger branches |
| 17 Role separation | Cannot assume schema/operation roles or create table | Actual migrator identity/flags, SET ROLE hv_migrator, inheritance/PUBLIC/default grants, search-path attacks |
| 18 Direct mutations | Runtime cannot update members or insert users | Every table/sequence/function/DDL privilege and unauthorized existing-tenant operations |

No test exercises wrapper transactions against PostgreSQL, server-side sessions, revocation epochs, NULL replay, unknown COMMIT lookup, the tenant revoke idempotency record, or successful non-owner read. Basic concurrency tests use default BEGIN isolation rather than the SERIALIZABLE wrapper. Shared ordered fixture fails cascading cases if initial bootstrap fails. A failed executable/configuration can count as an expected denial. Narrow URL-error sanitization fixes one exposure risk only; it does not fix these enforcement-evidence gaps.

## 9. Disposable setup and Netlify requirements

No database or credential value was inspected. Later explicit authorization must name a synthetic disposable target, PostgreSQL version, extensions, roles, preparation/application scope and destruction responsibility. Candidate application is an operator prerequisite, never performed by the suite. psql is currently absent. Two dedicated login credentials are required, with runtime identity separate from migrator; migrator must assume schema owner and schema owner must have the required ownership-assignment capability.

Suite accepts only loopback hostname and `hourvia_disposable_` database prefix and requires an exact authorization marker; no Netlify variable fallback exists. These are useful guards, not proof of disposability: loopback may be a proxy/tunnel, a name is not provenance, and inherited PG/service/options variables can affect routing. Validate database/host/role identities and no customer data through separately approved setup. Runner leaves synthetic rows for operator inspection/destruction. Never use previews or production-copy branches. Environment values are not to be echoed; malformed credential validation is now sanitized.

Netlify must prove restricted runtime credential binding, distinct migrator, NOLOGIN owners, membership/ownership privileges, forced RLS and custom trigger support, pg_catalog-safe function execution, pinned server/serverless backend, transaction command tags, discard semantics, pool rotation/cancellation and reviewed migration generation/application. Installed stack has no driver/peer bridge compiled against these contracts. Default platform role, SDK connection override and local PostgreSQL success cannot establish managed capability. Unsupported requirements keep the design BLOCKED. Backup/PITR and isolated restore with approved RPO/RTO remain promotion requirements.

## 10. Credential incident

Existing metadata credential test remains effective for its defined scope: recursive URL userinfo and selected GitHub token formats in package and lock metadata. It asserts booleans, avoiding serialization of confidential content. It passes. It does not cover every secret format, environment, dependency, external log/archive or remote history. SEC-001 revocation/expiry and external exposure review remain open; no issuer contact occurred. Sanitized harness URL-error handling prevents a newly identified malformed-input output path; no actual credential exposure was observed or claimed.

## 11. P0/P1 findings and evidence classification

| Finding | Priority | Classification/status |
| --- | --- | --- |
| Wrapper accepts COMMIT response tagged ROLLBACK as success | P0 | Source defect; offline injected-client reproduction confirms logic; unfixed under review-only scope |
| Negative DB tests conflate enforcement with execution/setup errors | P0 verification gate | Source evidence defect; add SQLSTATE/positive controls before treating a green isolated run as proof |
| URL validation exception can retain confidential input | P0 hygiene | Native exception behavior reproduced offline; narrow harness fix applied, no actual exposure claimed |
| NULL replay digest/target bypasses conflict comparisons | P1 | Source defect; no live execution; enforce NULL-safe input/conflict rules |
| Required context validation differs across read/replay/mutation paths | P1 | Source contract gap; define required fields per operation and test explicitly |
| Raw callback client/control and command metadata contract incomplete | P1 | Source/API design gap; scoped operations and result metadata needed |
| 18-case labels exceed actual isolation/race/fault coverage | P1, P0 for proof acceptance | Source coverage gaps detailed above; deterministic barriers and two populated tenants needed |
| Single-session expiry/revocation not bound to SQL session state | P0 before activation | Intentionally absent implementation; epoch alone is not complete session validation |
| Public Drizzle/kernel reconciliation absent | P0 before activation | Proven artifact mismatch, not a current exposed vulnerability |
| Managed role/driver compatibility, actual constraints/RLS/cleanup | P0 | Unverified runtime behavior, not proven unsupported |
| Credential issuer/exposure closure and migration/restore proof | P0 | Open external/operational evidence requirements |
| Retry deadlines/backoff, pool lifecycle, key retention, privileged audit hardening | P1 | Design/operational evidence gaps |

## 12. Actual validation

After the narrow harness fix: TypeScript PASS; ESLint PASS; Vitest **76 passed, 18 skipped**, five passed files/one skipped; architecture/inactive persistence PASS; quarantine and credential regression tests PASS. Fingerprints match both before and after review. Integration authorization was explicitly overridden to disabled for this offline validation regardless of inherited runner settings.

Offline wrapper false-success and native URL-error-input reproductions executed with synthetic values only. These are not security-enforcement tests. SQL and PL/pgSQL parsing **NOT VERIFIED**; PostgreSQL tests **NOT RUN**. No build, database connection, migration apply/promote, live object change, activation, deployment, commit or push occurred. No new sprint began.

## 13–14. Verdict and recommendation

**BLOCKED**. Review deliverable is complete; candidate security acceptance is not PASS. Known source defects and inadequate negative-test evidence need separately authorized remediation before a comprehensive isolated verification run can be accepted.

Recommended next scope: permit fixes to transaction command-result handling and SQL NULL/context validation, strengthen SQLSTATE-aware harness errors and positive controls, add deterministic races and existing-tenant/RLS cases, and provision/apply the exact revised fingerprint only in an explicitly named fresh synthetic disposable environment. Permit offline PostgreSQL/PLpgSQL parsing there and compile all functions before operation tests. Record catalog/role/backend/version evidence and full rollback/failure results. A diagnostic isolated run of the unchanged candidate may expose defects, but must not be treated as readiness approval. Platform sandbox verification, credential incident closure and recovery evidence remain separate gates. This report grants none of those actions. Stop here.
