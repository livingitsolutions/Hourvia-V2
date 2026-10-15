# Hourvia V2 — Sprint 0.1A final report

Credential hygiene & platform preflight · 2026-10-15.

## 1. Credential finding classification

| Path / field | Sensitive credential-format material before remediation | Present after remediation | Git tracked |
| --- | --- | --- | --- |
| package.json / repository.url | Yes | No | Yes |
| package-lock.json | No | No | Yes |

Classification: GitHub access-token-format authentication material embedded in repository metadata, not ordinary non-sensitive metadata. The value has not been authenticated or submitted to any provider; genuine issuance, current validity, scopes and expiry remain unverified. Treat as a credential pending issuer verification. Removed URL userinfo from package.json and preserved the repository destination. No dependency versions, lockfile or application features changed. No secret fragments, credential-bearing URLs or secret hashes appear in this report.

## 2. Git/history/artifact exposure assessment

| Exposure indicator | Yes / No |
| --- | --- |
| Affected current file tracked by Git | Yes |
| Current credential found in locally reachable Git history | No |
| Any matching GitHub credential-format material in locally reachable Git history | No |
| Local build artifacts available for assessment | Yes |
| Current credential found in local build artifacts | No |
| Matching GitHub credential-format material in working-tree artifacts after cleanup | No |
| Current package lock contains credential-format material | No |
| Remote history coverage verified | No |
| Remote build/deploy logs verified clean | No |
| Remote source archives/retained artifacts verified clean | No |
| Previously emitted audit/runner logs verified clean | No |
| Provider validity/expiry/revocation verified | No |
| Credential revoked or rotated by this run | No |

Read-only Git commands assessed all three locally reachable commits and their file contents, with raw content captured in memory and never echoed. No direct inspection of .git files occurred. Reachable local commits do not establish coverage of remote refs, PRs, forks, deleted/unreachable objects, runner logs or hosting retention. No fetch or remote deployment/API request occurred.

Local inspection covered dist/index.html, dist/assets/index-BHjmMtfA.css and dist/assets/index-C6z22sgJ.js, plus local .netlify artifacts. A broad preliminary URL-pattern scan produced a CSS false positive; exact credential and token-format checks found no secret in those files. Artifact presence is not evidence they were deployed and does not mean a build ran in this sprint. The publish directory is dist; manifests are not deliberately published by existing static configuration, but source archives/CI workspace bundles can include tracked manifests. This possible exposure remains unverified.

Repository metadata's injection origin is not established. Do not infer that clean reachable history proves the credential never entered logs or external tooling. No remote history rewriting or artifact deletion occurs.

## 3. Required operator remediation

Provider: **GitHub**. Rotation/revocation requires operator action; this task explicitly does not authorize it.

1. Identify the issuing automation/GitHub App integration using secure provider and build-runner records, not by pasting the credential into tickets or terminal output. Determine exact token type, permissions, issuance and expiry. The observed format is consistent with an installation access token, but validity/issuer details are not cryptographically verified here.
2. If confirmed expired or already revoked, record only sanitized issuer confirmation. If valid or state cannot be established, have the authorized integration owner revoke the affected token using GitHub's supported secure token-revocation process and obtain a new short-lived credential through the issuing automation. Renew the Netlify/GitHub connection only if identified as the actual issuer. Do not rotate unrelated app private keys or personal tokens without evidence and authorization.
3. Review relevant build/runner logs, source archives, deployment retention, remote branches/PRs and access records for exposure. Limit access to affected records. Any archival/log cleanup or remote history rewrite requires separate approval; if additional copies are found, remove them without reproducing values. A history rewrite is not indicated by the current local findings alone.
4. Ensure automation supplies credentials only through secure ephemeral authentication, not manifest repository metadata. Record SEC-001 closure only after cleanup and provider-side expiration/revocation confirmation. Local metadata cleanup alone does not revoke a token.

## 4. Adapter compatibility evidence

Installed stable Drizzle: **0.45.4**. @netlify/database, @netlify/db, pg and @neondatabase/serverless are absent. No package is installed or activated in this sprint. Previously downloaded @netlify/database **2.0.1** declarations/source are inspection evidence only, not an installed or exercised SDK.

The native stable netlify-db module imports legacy @netlify/db; supplying a client does not remove its module-level import dependency. The approved explicit-client bridge avoids that module. Installed node-postgres and neon-serverless adapters both accept explicit clients, retain them and forward queries through the same client. Their declarations support PoolClient types. Source evidence strengthens the proposed bridge on both transport paths, but does not replace a compile/test with exact missing peer packages.

The platform driver source returns pg.Pool or Neon Pool/httpClient according to its driver discriminator. Each initialization constructs a pool; HTTP configuration refresh does not refresh the already constructed pool. Full evidence and capability matrix: docs/architecture/gates/platform-preflight.md. ADR 002/003 remain unchanged.

## 5. Role/RLS/transaction feasibility

| Capability | Source-supported | Proven in Netlify/PostgreSQL |
| --- | --- | --- |
| Explicit supplied client and transaction pinning mechanism | Yes | No |
| Parameterized transaction SQL including SET LOCAL/set_config | Yes | No |
| Transport for FORCE RLS/role-related SQL | Yes | No |
| Managed restricted role provisioning/credential separation | No | No |
| COMMIT/ROLLBACK and savepoint mechanism | Yes | No |
| Reliable cleanup across BEGIN/ROLLBACK/COMMIT failures | No | No |
| Pool creation and client reuse mechanism | Yes | No |
| Safe pool lifecycle under rotation/reconnect/branch changes | No | No |

Pinned client transaction source supports the design. Forced RLS and role separation are PostgreSQL/platform guarantees, not ORM guarantees. The SDK accepting a connection override does not prove Netlify permits creating/supplying restricted runtime identities. No evidence establishes default role flags or object ownership.

Inspected convenience transactions issue BEGIN before their cleanup block; failed BEGIN can leak a client. Rollback failure can mask the original exception and return a dirty connection. Approved owned lifecycle wrapper must discard uncertain clients and reconcile unknown COMMIT through durable idempotency. It is not implemented here.

Retain true restricted runtime login, separate controlled migrator, NOLOGIN operation/schema owners, PUBLIC privilege restrictions and forced policies. A privileged login plus SET ROLE is insufficient. Platform incompatibility is not proven, but compatibility is also not proven; fail closed rather than weaken the design.

## 6. Remaining unverified assumptions

Exact bridge compilation; managed transport backend pinning; PostgreSQL version/extensions; role provisioning and runtime binding; forced RLS/definer/constraint-trigger privileges; pooled context reset; failed-BEGIN/rollback/cancellation cleanup; capacity/rotation/branch lifecycle; automatic migration generation/application and snapshot compatibility; controlled migrator identity; backup/PITR/restore; provider-side credential state; external artifact/log exposure. No PostgreSQL or live platform capability is reported as passed.

## 7. Actual validation results

Typecheck: PASS. Lint: PASS. Unit tests: PASS, **71 tests across 3 files**, including new package credential-hygiene regression check. Architecture/inactive-persistence check: PASS. The hygiene test reports boolean failures only to prevent credential serialization. No production build, provider validation, database test, dependency installation, migration generation/application or deployment ran.

## 8. P0/P1 blockers

P0: SEC-001 provider-side credential closure/external exposure review; SEC-002 restricted platform roles/RLS verification; SEC-003 compiled/tested transport and failure cleanup; SEC-004 future ownership/session/bootstrap enforcement; SEC-005 migration/recovery safety proof. Local manifest cleanup is complete.

P1: pool lifecycle/load and rotation; session/retention policy and revocation races; billing allocation consistency and immutable payloads; external audit hardening. Updated docs/security-risk-register.md distinguishes local remediation from provider/platform closure.

## 9. Verdict

**BLOCKED** for overall gate closure. Local credential hygiene is remediated and source-based preflight is complete. Operator credential verification and real platform/database evidence remain required. Regression checks pass. No active vulnerability exploitability or production adapter readiness is claimed.

## 10. Recommendation for isolated implementation

After provider-side credential closure, authorize a narrowly scoped disposable synthetic-data PostgreSQL harness and exact pinned adapter compilation experiment. Test transactions, context reuse, privileges, ownership, idempotency and revocation before any protected persistence. Managed Netlify sandbox connections/role setup/migrations require separate explicit target approval. Current work authorizes none of these follow-on actions.

Changed: package.json (credential removal only); tests/credential-hygiene.test.ts; docs/architecture/gates/platform-preflight.md; docs/security-risk-register.md; docs/sprint-0.1-final-report.md (follow-up only); this report; .netlify/results.md. No schema, features, approved ADR decisions, authentication, persistence or protected endpoints changed. No credentials were rotated/revoked. No deploy, commit, push, Sprint 0.2 or Sprint 1 began. Stop here.
