# ADR 003 — Restricted operations, forced RLS and provider-neutral sessions

Accepted as an architectural target, conditional on platform capability verification and new implementation authorization. Supplements ADR 001; does not activate any service.

Use FORCE RLS as defense in depth and grant runtime only enumerated restricted operations. The server is trusted to assert authenticated actor identity; transaction-local context alone is not a security credential. Owner/membership changes serialize under organization locks, immutable audit appends transactionally, and critical mutations use durable idempotency. Details: ../gates/database-enforcement.md.

Keep identity proof separate from application permission. Provider-neutral verification maps (issuer, subject) to a global Hourvia user; authenticated sessions do not grant tenant access. Durable application sessions and current database memberships govern access and revocation. The supported future Netlify Identity candidate must use @netlify/identity behind the provider port; no provider is selected or activated in this gate. Details: ../gates/authentication-session.md.

Tradeoffs: restricted operations require reviewed SQL lifecycle and role support; strict organization locking initially limits tenant write concurrency. Revisit finer-grained locks only after correctness tests. Local PostgreSQL success does not prove Netlify role/transport support. Do not replace this design with application-filter-only isolation if forced RLS or role separation is unavailable.
