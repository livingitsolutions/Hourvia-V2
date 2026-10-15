# Organization tenancy

Organization is the only tenant root. Global users can join multiple organizations. Solo businesses use a single-member organization. No PERSONAL workspace or automatic workspace exists. Every modeled tenant row has organization_id. Clients, projects, entries and billing snapshots use composite organization/ID foreign keys; UUID uniqueness alone is insufficient isolation.

Provisioning must be one serializable transaction inserting the organization, active OWNER membership, disabled monitoring policy, audit event and idempotency outcome. The authenticated server user becomes owner. No browser owner, role or permission claims are accepted.

Ownership design requires a deferred constraint trigger checking exactly one active OWNER membership matching organizations.owner_user_id at commit, plus a partial unique index on organization_id WHERE active AND role='OWNER'. These constraints are specified but not activated or fully expressible in the current Drizzle artifact. A future migration must install both. Ownership transfer locks the organization, validates expected version and target active membership, updates both memberships and owner pointer, and appends audit atomically. Revocation cannot remove the accountable owner without transfer. Membership mutations lock the same organization to serialize concurrent transfers and grants.

Trusted server membership lookup authorizes the requested organization each operation. Tenant repositories require authorized context and query by both organization and resource ID. Cross-tenant misses return generic not found. Current contracts are structural TypeScript interfaces, not cryptographic capability tokens; implementations must never deserialize trusted contexts from requests.

