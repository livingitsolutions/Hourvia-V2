# Hourvia V2 architecture

Time tracked. Progress made. A new organization-first implementation by Living IT Solutions. No V1 code exists in this checkout and none is modified.

React/Vite strict TypeScript and Tailwind v4 render a frontend-only foundation. Zod validates boundary types; Temporal provides calendar arithmetic. Drizzle describes PostgreSQL tables without initializing persistence. Netlify hosting and future Functions are the platform target; no Function endpoints are created.

Dependency direction: composition → presentation/infrastructure → application → domain. Domain imports only Zod and Temporal. Presentation never imports infrastructure; adapters implement application ports. A source check enforces these rules. Demo data stays in presentation memory because it is illustrative, never durable application state.

The schema and documentation are design artifacts, not a deployable backend. No authentication, database connection, timer, invoice processing or monitoring collector exists. Build configuration is static-only. No deployment, commit or push is authorized or performed.

Concurrency: version checks and append-only revisions prevent lost updates. Every critical mutation requires a persistent tenant/actor/operation/key idempotency record, payload hash and stored outcome in the same transaction. Never use process memory for durable idempotency. Conflicting hashes fail; retries return the committed outcome.

