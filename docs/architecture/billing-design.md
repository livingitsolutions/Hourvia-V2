# Client billing architecture

Billable status is explicit on time revisions. Rates are effective-dated [from, until) client/project contracts, with project override precedence only after validation. Overlapping rates for the same scope and currency require future PostgreSQL exclusion constraints. Never silently choose an arbitrary rate. Time spanning rate boundaries must be split deterministically; reconciliation blocks on missing/ambiguous rates or unapproved corrections.

Weekly/biweekly periods require an explicit anchor. Semi-monthly starts on 1 or 16; monthly starts on 1. Custom requires a later explicit date. Local calendar midnight in an IANA timezone converts to UTC. Periods are half-open [start, end); DST can produce 167/169-hour weeks. The pure boundary function is a foundation invariant utility, not a scheduling feature. Historical timezone/cutoff changes create new versioned configuration; existing periods retain original boundaries.

Rates use exact bigint minor units per hour. Line amount = rate × integer seconds / 3600, rounded half-up once per line. Sum rounded lines; do not round aggregate hours. Currency uses ISO 4217 code and an explicit exponent registry (future validated registry, supporting zero/three-decimal currencies). Bigint serializes as decimal strings. One currency per invoice, no implicit FX; mixed currencies require separate invoices. Negative adjustments require a reason and permission; rates cannot be negative.

Reconciliation consumes approved exact revisions, checks period and client assignment, resolves rates and acquires duplicate-billing reservations. Immutable finalized snapshots retain source revisions, rate versions, calculation and rounding policy, timezone and currency metadata. Current representative schema lacks some of that snapshot payload and must be expanded before activation. Logical entry uniqueness (not revision uniqueness alone) prevents rebilling corrections. Partial allocations across cutoffs require segment-level allocation design and nonoverlap constraints before implementation. Finalization and reservations occur atomically under serializable isolation.

Drafts reference finalized snapshots and versioned lines/adjustments. Exports require idempotent artifacts, audit and currency consistency. Re-finalization and correction use compensating documents rather than mutating finalized data. Invoice drafts in the UI are examples only.

Excluded: payroll, salaries, payslips, statutory payroll deductions, payroll disbursement, automated tax filing and client payment processing in V1. SaaS subscriptions are a separate organization entitlement context, not client invoice collection.

