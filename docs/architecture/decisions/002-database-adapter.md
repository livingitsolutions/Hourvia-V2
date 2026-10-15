# ADR 002 — Explicit-client stable Drizzle bridge (proposed, conditional)

Date: 2026-10-15. Supersedes ADR 001's beta-only compatibility assumption, not its inactive-persistence decision. No package changes or connections are authorized by this decision.

## Evidence

Installed and locked `drizzle-orm@0.45.4` exports `drizzle-orm/netlify-db`. Its `netlify-db/driver.js` imports `getDatabase` from **@netlify/db**, not **@netlify/database**. Neither package, `pg`, nor Drizzle Kit is installed. Thus the presence of an export does not prove a usable current native integration. Its explicit `client` branch accepts a discriminated server/serverless connection and delegates server mode to node-postgres or constructs an HTTP/WebSocket session in serverless mode.

Registry metadata and published source archives were inspected without installation, import execution or database access:

| Candidate | Version evidence | API and implication |
| --- | --- | --- |
| Installed stable Drizzle | 0.45.4, local package exports and driver/session source | Native export exists but implicit initializer requires legacy @netlify/db. Reject implicit use. |
| Current Netlify Database driver | latest 2.0.1; not installed; published dist/main.js and main.d.ts inspected | `getDatabase` returns server `pg.Pool`, or serverless Neon `Pool` plus `httpClient`, with driver discriminator. Requires Node >=22.12.0. |
| Beta Drizzle | beta 1.0.0-beta.22; not installed; published netlify-db source inspected | Implicit initializer reads environment directly; explicit client still supported. Beta is not required merely to find the native export. No demonstrated safety advantage. |
| Drizzle Kit | latest 0.31.11; beta 1.0.0-beta.22 registry metadata | Neither installed nor executed. Snapshot/schema compatibility must be proven using a pinned stable pair in isolation. |

Sources: [registry Drizzle](https://registry.npmjs.org/drizzle-orm), [registry driver](https://registry.npmjs.org/@netlify%2fdatabase), [registry Kit](https://registry.npmjs.org/drizzle-kit). These establish package/source evidence only, not live platform behavior. Dist-tags can change; pin exact reviewed releases and verify integrity before future installation. No claims about production load, release support guarantees or live database privileges follow from this inspection.

Stable `NetlifyDbSession.transaction` checks out one pool client, constructs a WebSocket session using that client, executes BEGIN with isolation config, callback, COMMIT/ROLLBACK and release. Its batch API uses an HTTP transaction; independent HTTP queries cannot share transaction-local state. Node-postgres transaction source similarly pins a pool client. In both inspected stable transaction paths BEGIN occurs before the try/finally cleanup block: a failed BEGIN can leak the checked-out client. ROLLBACK failure and uncertain COMMIT also require explicit handling. Proposed wrapper must own acquisition/cleanup and use Drizzle bound to the acquired client, rather than rely unconditionally on these convenience transaction methods.

Netlify driver source creates a new pool for each `getDatabase` call. HTTP clients refresh connection configuration dynamically; the pool captures the connection configuration at construction. Recreating a driver per request risks exhausting connections; retaining a pool across environment/branch/credential changes risks stale routing. Pool lifecycle must be bounded and scoped to the runtime environment, with eviction on credential/branch change and release/discard on error. Source does not establish platform connection limits or rotation policy.

## Decision

Propose **stable Drizzle 0.45.4 with an explicit Netlify Database 2.0.1 supplied client**, preserving the stable-version stack. Never call the stable native no-argument initializer or add legacy @netlify/db just to satisfy it. For server mode, bind stable `drizzle-orm/node-postgres` to the checked-out Netlify pool client. For serverless mode, use an explicitly supplied client/session from the Netlify-managed pool; compatibility of the exact PoolClient binding must be compiled and tested before approval. Keep all tenant operations on that same acquired client and do not expose ambient db handles.

This is a proposed composition, not implemented or declared production-ready. Native adapter top-level imports still require the legacy peer to resolve even when its implicit branch is unused: avoid that module for the stable bridge. Use node-postgres/serverless stable adapters selected explicitly for the connection type, all through @netlify/database-managed connections. Peer dependencies must be pinned and evaluated in the isolated harness. Neon is the platform driver's transport, not authorization to provision an external database service.

Fallback: use the same @netlify/database pool with parameterized native SQL for restricted operations, retaining Drizzle schema definitions. If transport binding, safe roles or transaction pinning cannot be established, remain inactive and escalate platform requirements. Do not silently substitute the beta adapter or external services. Beta evaluation requires separate approval and full regression/snapshot review.

## Deployment and migration implications

Runtime adapter choice does not apply schema. Reviewed future SQL migrations belong in Netlify's migration directory and are platform-applied on deployment, including previews. Driver archive contains no evidence that a direct driver call alone generates reviewed migrations; the broader deploy integration may detect schema/dependencies. Do not install or activate packages in this gate. Verify auto-generation and pre-publication application using a separately authorized sandbox before placing files in a deploy-consumed path. Beta Kit snapshots must not be mixed with stable snapshots. No live deployment behavior is verified here.
