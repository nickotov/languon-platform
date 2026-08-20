# ADR-0010: Admin application and authorization

Status: Accepted
Date: 2026-08-20
Supersedes: The `apps/admin` framework and FSD portions of ADR-0005

## Context

Languon needs an operational application for inspecting users, changing account
availability, and reviewing administrative activity. The existing admin
application is a Next.js placeholder and contains no administration framework,
authorization model, or safe mutation workflow.

This choice establishes a durable frontend framework boundary, privileged
authorization and audit semantics, and a production exposure model. Those
choices span future administration features and are costly to reverse. The
product owner explicitly approved Refine on a plain React/Vite SPA, database-
backed owner membership, CLI-only membership management in the first version,
and private-edge HTTP Basic Authentication as defense in depth.

## Decision

### Application framework

`apps/admin` is a client-side React application built with Vite. Refine owns the
administration resource, data-provider, authentication-provider, access-control,
and audit integration seams. React Router owns routing and Ant Design supplies
the accessible application component foundation. The admin application uses its
own pages/resources/shared layering appropriate to Refine; the pages-first
Next.js Feature-Sliced Design requirement in ADR-0005 continues to apply to
`apps/web`, but no longer applies to `apps/admin`.

The static admin build is served by an unprivileged NGINX image with SPA fallback
and a build-time release identity health response. Admin UI conventions belong
in `apps/admin/AGENTS.md`, while the visual source remains
`design/DESIGN_SYSTEM.md` and `design/main.pen`.

### Authentication and authorization

Administrators authenticate as ordinary verified Languon users using password
or passkey credentials. Admin refresh transport has a distinct host-only cookie
and browser coordination namespace from the public web application.

An `admin_memberships` record grants an active user the `owner` role. The access
token does not contain or authorize an admin role. Every admin request verifies
the token, active session, active user, and active membership from server-side
state. Security-sensitive mutations additionally require the existing recent-
authentication invariant.

Membership is granted and revoked by guarded local or SSH-based operator
commands in the first version. The commands require an existing verified user,
a bounded reason, and an explicit literal confirmation for mutations. The last
active owner cannot be revoked or disabled.

### User lifecycle and audit

Administration does not delete or edit user credentials. An owner may disable
or restore a user with optimistic version checking and a required bounded reason.
Disabling atomically changes user state, revokes the target's sessions, and
writes an administrative audit event. Restore selects `active` for a verified
user and `pending` otherwise and does not recreate sessions.

Administrative success and authorized rejection events are recorded server-side
with actor, target, action, outcome, reason, state/version context, correlation,
and expiry. Events are retained for one year and removed by an explicit,
auditable prune command.

### Production trust boundary

The admin hostname is not exposed through the public application listener. It is
served through a loopback/private listener protected by NGINX HTTP Basic
Authentication in addition to application authentication. The public listener
explicitly rejects `/api/admin/*`. Host allowlists, credential files, TLS,
allowed origins, and WebAuthn relying-party configuration are fail-closed
deployment inputs.

Framework-neutral browser authentication protocol helpers live in a focused
workspace package and are shared by public web and admin. Application-specific
UI and state remain within each app, and no app imports another app's source.

## Alternatives considered

### Continue the Next.js placeholder and build administration primitives

This would preserve one frontend framework, but it would require recreating
resource routing, data/auth/access provider seams, tables, filters, and mutation
workflows. The admin application is an operational SPA and receives little value
from server rendering. Refine provides the intended extension model directly.

### React-admin

React-admin is mature and capable. Refine was selected because its headless core
and explicit integration packages make the data/auth/access/audit boundaries
clear while allowing a Languon-specific Ant Design experience.

### Put owner roles in access tokens

Token roles reduce a persistence lookup but delay revocation until token expiry
and invite authorization drift. Server-side membership checks make privilege
changes effective immediately and preserve one source of truth.

### Application authentication without a private Basic Auth edge

One authentication layer is simpler, but the admin surface is privileged and
operational. A separately provisioned edge credential and private/loopback
listener reduce accidental exposure and provide independent containment.

### Browser membership management in the first version

This is convenient but adds a high-impact privilege-escalation workflow before
the core user-management journey is proven. Guarded operator commands establish
a smaller bootstrap surface and can later back a separately reviewed UI.

## Consequences

### Positive

- Future admin resources share explicit Refine provider and access-control seams.
- Privilege revocation takes effect without access-token renewal.
- User status, sessions, and audit history remain transactionally consistent.
- Static packaging reduces the admin runtime footprint and keeps release identity
  compatible with the existing deployment controller.
- Public and administrative browser authentication reuse protocol logic without
  sharing cookies, state, or application source.

### Negative

- The repository now supports two browser build frameworks and component systems.
- Every authorized admin request performs server-side state checks.
- Operators must provision both Basic Auth and owner membership before first use.
- Passkey origins/RP IDs and cookie separation need multi-host testing.

### Risks / limitations

- Basic Auth credentials require independent rotation and secure htpasswd file
  handling; they are not a substitute for application authorization.
- V1 has only the broad `owner` role. New roles or resource permissions require a
  new authorization design rather than ad hoc frontend checks.
- Audit retention is application-enforced pruning, so production scheduling and
  monitoring must be documented and verified.
- Client-side rendering means all authorization decisions must remain server-side;
  hidden UI controls are convenience, not enforcement.

## Related

- [ADR-0001](./0001-user-authentication-and-session-strategy.md)
- [ADR-0002](./0002-drizzle-schema-and-migration-strategy.md)
- [ADR-0005](./0005-frontend-component-and-fsd-standards.md)
- [ADR-0009](./0009-release-and-deployment-platform.md)
- [Architecture](../architecture.md)
- [Feature specification](../../.agent/features/admin-user-management/FEATURE.md)
- [Execution plan](../../.agent/features/admin-user-management/EXEC_PLAN.md)
