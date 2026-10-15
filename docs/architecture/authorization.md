# Permission model

OWNER has all listed permissions. ADMIN and MANAGER have only explicitly delegated permissions. EMPLOYEE and CONTRACTOR have none of these management permissions; future self-service rights require separate scoped permissions. No role inherits unrestricted management authority except OWNER.

| Permission | OWNER | ADMIN / MANAGER | EMPLOYEE / CONTRACTOR |
| --- | --- | --- | --- |
| organization.settings | Yes | Explicit grant | No |
| members.invite | Yes | Explicit grant | No |
| members.revoke | Yes | Explicit grant | No |
| time.manage | Yes | Explicit grant | No |
| timesheets.approve | Yes | Explicit grant | No |
| projects.manage | Yes | Explicit grant | No |
| clients.manage | Yes | Explicit grant | No |
| billing.configure | Yes | Explicit grant | No |
| invoices.prepare | Yes | Explicit grant | No |
| monitoring.configure | Yes | Explicit grant | No |
| monitoring.reports | Yes | Explicit grant | No |
| audit.read | Yes | Explicit grant | No |

Server checks authenticated subject, current active membership, organization equality, permission and resource scope. Revocation invalidates authorization immediately online; never rely on UI visibility. Invitations do not confer active rights until accepted. Grant mutation must prevent delegation escalation: only owner or specifically scoped membership administrators may grant rights they possess; ownership is never delegated through ordinary role change. Manager project/report scopes are additional restrictions, not broader privileges. Audit reads and monitoring reports remain separate from configuration.

