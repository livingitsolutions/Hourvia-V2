# ADR 001: Inert foundation

Accepted. Organization is sole tenant root; permission delegation is explicit; monitoring defaults off. Use ports with inward dependencies and frontend-only demo data. No provider integration, endpoints, database client or migrations. Stable Drizzle metadata avoids activating the beta-only Netlify adapter. Consequence: production security guarantees remain specifications until isolated PostgreSQL tests verify constraints and roles. Sprint 1 requires explicit authorization and compatibility decisions.

