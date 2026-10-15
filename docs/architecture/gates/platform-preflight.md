# Sprint 0.1A — Local platform preflight evidence

2026-10-15. Adds evidence to ADR 002/003 without changing the approved architecture. No database or provider calls, dependency installation, executable adapter imports, migrations or deployment occur.

## Local package evidence

Installed Drizzle is 0.45.4. @netlify/database, legacy @netlify/db, pg and @neondatabase/serverless are absent. Installed Drizzle peer declarations accept pg >=8 and Neon >=0.10.0, but peer ranges alone do not demonstrate exact compatibility. Both transport adapter declarations accept supplied clients and their session declarations include PoolClient types. Source constructs a session around the supplied client without creating a replacement pool when `client` is supplied.

Evidence paths: node_modules/drizzle-orm/node-postgres/{driver,session}.{js,d.ts}; node_modules/drizzle-orm/neon-serverless/{driver,session}.{js,d.ts}; node_modules/drizzle-orm/netlify-db/driver.js. A previously downloaded, non-executed @netlify/database 2.0.1 archive provides dist/main.js and main.d.ts. It is source evidence, **not an installed SDK**. No SDK was imported to inspect it.

Stable native netlify-db still imports legacy @netlify/db at module evaluation. Avoid this path even if an explicit client is supplied. The proposed bridge uses stable node-postgres for platform server mode and stable neon-serverless for platform serverless mode, binding the client's transport explicitly. No beta change is proposed.

## Capability assessment

| Capability | Source-supported finding | Remaining test/verification |
| --- | --- | --- |
| Pinned transactions | Both session implementations use a checked-out pool client or supplied client for BEGIN/callback/COMMIT/ROLLBACK; explicit client construction retains that client | Compile bridge with exact peers; verify backend identity under Netlify pooler and reconnect/failure conditions |
| SET LOCAL | Sessions provide parameterized raw execution on the supplied client; SQL context commands are representable | Verify PostgreSQL transaction-local lifetime, missing-context default deny and reset across reuse; never use standalone HTTP SQL for context |
| FORCE RLS | Driver transports SQL and does not implement or bypass PostgreSQL RLS itself | Verify actual current_user, ownership, BYPASSRLS flags, grants, policies and definer-owner behavior; no source evidence grants platform permission to configure RLS |
| Role separation | Platform driver accepts a connectionString override and returns a pool bound to a supplied connection configuration | Verify managed platform can provision true restricted login plus separate migrator binding; accepting a string is not proof roles/credentials can be provisioned |
| Rollback | Both sessions issue ROLLBACK after callback errors and release pooled clients in finally | BEGIN is outside try/finally; rollback failure can mask error/release a dirty client; owned lifecycle/discard wrapper and unknown-COMMIT reconciliation require tests |
| Pooling/reuse | Driver creates pg.Pool or Neon Pool; each getDatabase call constructs a new pool, whereas explicit Drizzle client retains one | Verify bounded pool limits, idle errors, warm reuse, lifecycle eviction, branch isolation and credential rotation |

The proposed bridge is source-plausible on both transports. It is not compiled against the missing driver/peers and is not verified against PostgreSQL. A caller-supplied acquired client avoids the ORM's own checkout leak, provided the caller covers acquisition/BEGIN/COMMIT/ROLLBACK/release in an exception-safe wrapper. Calling the convenience pool transaction method alone is insufficient evidence of reliable rollback. Nested callbacks use savepoints; transaction-local setting changes after savepoints require rollback-to-savepoint leakage tests. Query logging/tracing must avoid sensitive parameters and context.

Native driver source defaults to server unless configured serverless; beta Drizzle's implicit initializer uses a different environment branch. Explicit discriminated composition avoids relying on these differing defaults. The native serverless HTTP client can refresh connection configuration while its constructed pool is fixed; don't treat a refreshed HTTP client as proof the pool is refreshed. No actual environment values are inspected.

## Privilege/platform review

Maintain ADR 003: restricted operation EXECUTE plus FORCE RLS, true runtime login without ownership/BYPASSRLS and NOLOGIN operation owner. No default managed role is known. SET ROLE from a privileged login is not an acceptable substitute. The driver exposes no role-administration API, automatic least-privilege configuration or migration/runtime credential separation in inspected source. Custom roles, grants, ownership and definer functions must be platform-supported PostgreSQL operations separately authorized for a sandbox.

Platform migration runner permissions, public schema defaults, ability to select a restricted managed connection, FORCE RLS/trigger availability and custom security SQL preservation remain P0 unknowns. Migration auto-application on preview/production deploys is documented but not tested; no migrations or dependencies are installed to trigger it. Production-data copies in previews remain disallowed integration targets. Backup/PITR and recovery proof also remain absent. If true runtime login separation cannot be supported, stay inactive rather than weakening isolation.
