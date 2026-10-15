# Next implementation permissions and stop conditions

This gate is documentation-only; none of the following is currently authorized. Separate scopes prevent an isolated experiment from granting production access.

| Approval needed | Required scope/evidence |
| --- | --- |
| Credential hygiene | Review/remove credential-bearing repository metadata, regenerate clean package metadata/lockfiles, revoke/rotate affected credential through its issuer and assess any exposure; do not reproduce values |
| Isolated integration harness | Disposable synthetic-data PostgreSQL only; explicit image/extensions, create roles/schema, apply test migrations, execute concurrency tests, ephemeral credentials and cleanup |
| Adapter dependency experiment | Install pinned @netlify/database and reviewed transport peers into an isolated workspace; compile stable bridge, no platform connection or deployment; verify install hooks cannot activate resources |
| Managed platform capability verification | Named non-production sandbox with no copied customer data; platform-admin permission to inspect/provision restricted roles, transport pinning and pooling; connection approval distinct from migration approval |
| Schema implementation | Explicitly approve changes to db/schema.ts, sessions/provider mapping/bootstrap idempotency plus ownership/security constraints; generate/review migration artifacts only in isolated paths |
| Platform migration activation | Approve exact reviewed SQL/checksums, branch/target, migrator role, deployment behavior, backups and recovery. No placement in auto-consumed paths before review |
| Authentication implementation | Select provider and assurance/session limits; authorize package installation, provider configuration, redirect domains, protected auth endpoints and secrets management separately. Netlify Identity candidate uses @netlify/identity only |
| Protected persistence | Approve exact bounded operations/endpoints, least-privileged runtime binding, permission model and integration evidence; no blanket feature Sprint 1 approval inferred |
| Deployment | Separate explicit deployment approval; code review and artifact approval are not deploy permission. Commits/pushes remain separately controlled |

Platform capabilities still unverified: PostgreSQL version/extensions; CREATE ROLE and NOLOGIN ownership; restriction of runtime's actual credential; FORCE RLS/constraint triggers/definer operations; controlled migrator identity; transaction pinning and connection limits; branch credential rotation; auto-generation suppression/review gate; migration ledger concurrency; backup/PITR/restoration and production-copy handling.

Stop if default runtime connection owns tables or bypasses RLS, separate credentials cannot be supplied, pool cannot pin a transaction, definer operations cannot be restricted, migration generation/application occurs before review, secrets appear in artifacts, or production/preview access is requested without explicit target approval. Do not weaken accepted security design to bypass platform limitations.
