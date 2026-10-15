# Sprint 0 final report

## 1. Repository and stack

New Hourvia V2 checkout at /opt/build/repo; initial repository contained only README.md. No Hourvia V1 files were accessed or modified. React 19.3.1, Vite 8.3.4, TypeScript 6.0.3 (strict), Tailwind 4.3.3, stable Drizzle 0.45.4, Zod 4.6.7, Vitest 5.0.4 and ESLint 10.12.0. Exact dependencies are locked. Node 22.23.3 is the executed environment; configured minimum is 22.12. Netlify Database is the future persistence platform; no adapter is activated.

## 2. Files

Modified README.md. Created package.json, package-lock.json, tsconfig.json, vite.config.ts, eslint.config.js, index.html, netlify.toml, .gitignore and .netlify/results.md, plus the following files:

- db/schema.ts
- docs/architecture/authorization.md
- docs/architecture/billing-design.md
- docs/architecture/bounded-contexts.md
- docs/architecture/database-design.md
- docs/architecture/decisions/001-foundation-only.md
- docs/architecture/monitoring-privacy.md
- docs/architecture/overview.md
- docs/architecture/tenancy.md
- docs/roadmap.md
- scripts/check-architecture.mjs
- src/application/contracts.ts
- src/composition/main.tsx
- src/domain/billing.ts
- src/domain/model.ts
- src/infrastructure/README.md
- src/presentation/App.tsx
- src/presentation/styles.css
- src/vite-env.d.ts
- tests/foundation.test.ts
- tests/schema.test.ts

This report itself is also created.

## 3. Bounded-context architecture

All 15 required contexts are documented in bounded-contexts.md. Domain models represent organizations, membership, time, rates, finalized snapshots, invoice drafts and monitoring. Application ports cover authorization, tenant repositories, audit, serializable transactions, persistent idempotency and organization provisioning. Infrastructure is intentionally inactive; presentation uses local illustrative data; composition mounts React. Architecture checks enforce inward dependencies.

## 4. Tenancy

Organization is the only tenant root; global users can have multiple memberships, including single-member organizations. Tenant-owned schema tables carry organization_id; composite foreign keys constrain resource relationships. Exactly one accountable owner is validated by a domain invariant. Database enforcement requires future deferred triggers and partial unique indexes before activation. Trusted authorization context must come from server authentication and current membership, never browser claims.

## 5. Authorization and monitoring

All 12 management permissions are distinct. OWNER is accountable; ADMIN and MANAGER require explicit grants. EMPLOYEE/CONTRACTOR cannot configure monitoring. Five monitoring capabilities default off in both domain and schema metadata. Contracts require visible status, notice acknowledgment, OS permissions, bounded retention, audited policy changes and fail-closed offline expiry. No covert tracking, keylogging, passwords, collection or desktop software exists.

## 6. Billing

Contracts cover billable time, effective rates, all five cutoff cadences, reconciliation, immutable snapshots, drafts, adjustments, exports and duplicate allocation prevention. Pure tests cover calendar boundaries, DST and exact bigint money with half-up line rounding. One currency per invoice. No billing workflow, invoice generator or payment processing is implemented. Payroll is excluded. Segment allocations, rate nonoverlap constraints and complete frozen snapshot payloads remain design work before activation.

## 7. Database and migration status

Schema definitions only: no client or connection, seeds, live tables, migration configuration, generation, application or privilege grants. No @netlify/database dependency is installed because platform guidance describes automatic provisioning on installation/first use. No migration directory exists. Static checks confirm inactive persistence paths. Stable Drizzle metadata is used; beta-only native adapter compatibility remains unresolved. No database-changing action was attempted. RLS, audit immutability and ownership SQL are specified, not asserted as operational.

## 8. UI

Dashboard, Time Tracker, Timesheets, Attendance, Projects, Clients, Billing Cutoffs, Invoice Drafts, Reports, Team, Organization Settings and Monitoring Settings. Responsive navy/emerald interface, light/dark toggle, mobile navigation, project/client search, demo date toggle and honest explanatory notices. All screens visibly identify demo data; timers and policy controls are unavailable. No API requests or fake mutation success. Themes and navigation state are transient.

## 9. Executed validation

Typecheck: PASS. ESLint: PASS. Vitest: 70 tests across 2 files PASS. Architecture/inactive persistence check: PASS. Dependency installation audit reported zero vulnerabilities at installation. Production build: NOT RUN, as explicitly prohibited by run requirements; reserved for platform validation. Browser, accessibility automation and PostgreSQL integration tests: NOT RUN. No deploy, commit or push.

## 10. Security findings and risks

No credentials, browser role trust, active backend or persistence introduced. Security is contract-level only: structural TypeScript context is not an authorization capability by itself. No authentication provider is integrated. The design schema alone lacks deferred owner integrity, forced RLS, audit/snapshot immutability and complete billing constraints. Browser font loading uses Google Fonts; self-hosting and CSP are future privacy/hardening work. Integration and visual verification remain outstanding.

## 11. P0/P1 blockers

No P0 blocker to the inert Sprint 0 deliverable. P0 before persistence: decide stable/beta adapter strategy; verify Netlify transaction pinning and restricted runtime roles; implement/test forced RLS, deferred ownership and immutable records in disposable PostgreSQL; approve authentication and any migration activation separately. P1: finish segment allocation, exact snapshot payloads, currency registry/rate exclusions, manager resource scopes, retention legal review, browser/accessibility validation and export/outbox design.

## 12. Verdict

PASS for the explicitly limited Sprint 0 foundation. Production readiness is not claimed. Build validation remains pending on the platform; persistence readiness is BLOCKED by the P0 items above.

## 13. Sprint 1 recommendation

Proceed only after explicit new authorization and resolution of the persistence/authentication gates. Keep production and preview databases untouched until then. Sprint 1 has not begun. Stop here.
