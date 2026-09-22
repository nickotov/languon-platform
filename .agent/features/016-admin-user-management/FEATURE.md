# Admin user management

Status: Complete
Owner: Engineering
Created: 2026-08-20

## Problem

Languon has no operational application for authorized administrators to inspect
user state, disable or restore accounts, or review administrative activity.
Operating directly against PostgreSQL would bypass domain invariants, session
revocation, recent-authentication checks, and audit requirements. The existing
`apps/admin` placeholder is not a usable administration surface.

## Desired behavior

An owner can open a privately exposed, separately authenticated admin SPA, sign
in with an existing password or passkey, inspect service and user summaries,
search and filter users, view safe user details, disable or restore a user with
a recorded reason, and inspect an immutable administrative audit trail.

Administration membership is database-backed and checked on every request.
Membership is bootstrapped and maintained through guarded local or remote CLI
commands in this first version. The browser application is a Refine-based Vite
SPA served as static content and uses shared framework-neutral browser auth
logic also consumed by the public web application.

## Acceptance criteria

- [x] AC-1 — `apps/admin` is a production-buildable Vite React SPA using Refine,
      React Router, Ant Design, TypeScript strict mode, and an English i18n
      provider; routes include login, dashboard, users, user detail, and audit.
- [x] AC-2 — The admin theme supports light, dark, and system preferences and
      the admin shell, tables, filters, statuses, detail views, dialogs, loading,
      empty, denied, offline, conflict, retry, and error states follow the
      Languon design source in `design/`.
- [x] AC-3 — Password and passkey login use a dedicated admin refresh cookie and
      framework-neutral auth protocol helpers shared with `apps/web`; the public
      web authentication behavior does not regress.
- [x] AC-4 — Every admin API request verifies the access token, active session,
      active user, and an active database membership. Authorization is never
      trusted solely from token claims.
- [x] AC-5 — Owners can retrieve dashboard data, search/filter/page users, view
      safe user details, and query paginated administrative audit events without
      exposing credentials, tokens, passkey material, or unnecessary personal
      data.
- [x] AC-6 — Disabling a user requires a 5–500 character reason, rejects self and
      last-owner disablement, detects stale state, atomically changes status,
      revokes sessions, and writes an audit event. Restoring chooses `active`
      only for verified users and `pending` otherwise and never recreates a
      session.
- [x] AC-7 — Mutating admin operations require recent authentication and the UI
      presents an explicit reauthentication flow without automatically replaying
      the original mutation.
- [x] AC-8 — Administrative success and authorized rejection events are stored
      server-side with actor, target, outcome, reason, state/version context,
      correlation, occurrence, and one-year expiry; pruning is executable and
      verified.
- [x] AC-9 — Guarded local and SSH-based commands grant, revoke, list, and prune
      administration state. Membership mutations require an existing verified
      user, reason, and literal confirmation and cannot revoke the last owner.
- [x] AC-10 — The static admin image exposes a SHA-bearing health endpoint,
      supports SPA fallback and safe caching, runs unprivileged, and participates
      in the existing blue/green deployment and resource profiler.
- [x] AC-11 — The private admin edge requires NGINX Basic Authentication in
      addition to application authentication, while the public edge explicitly
      rejects admin API routes. Stage/production origins and WebAuthn RP settings
      are validated.
- [x] AC-12 — Disposable PostgreSQL integration tests prove migrations,
      authorization, atomic status/session/audit behavior, last-owner and
      concurrency invariants, and audit pruning.
- [x] AC-13 — Contract, unit, Playwright, Docker/deployment, and real-browser
      checks cover the critical admin journeys and failure states with no
      material accessibility, console, network, or security defects.
- [x] AC-14 — Architecture, operator, Timeweb, agent-facing, and user-flow
      documentation describes the admin application, membership bootstrap,
      private exposure, release/deployment behavior, and safe troubleshooting.

## Scope

### In scope

- Owner membership persistence and guarded membership/pruning commands.
- Admin-specific password, passkey, refresh, logout, and current-actor APIs.
- Dashboard, user read models, disable/restore operations, and audit read model.
- Refine/Vite admin SPA and a Languon admin visual contract.
- Shared framework-neutral browser auth extraction used by web and admin.
- Static-image packaging, private-edge Basic Auth, release/deploy/profile wiring.
- Stage/production and local verification documentation.

### Out of scope

- Hard deletion, anonymization, email editing, password/passkey editing, or
  impersonation.
- Membership management in the browser UI or roles beyond `owner`.
- Managing application/domain content beyond users.
- Fine-grained per-resource permissions, bulk user operations, or audit export.
- Replacing the public web UI kit or migrating the public web application to
  Vite/Refine/Ant Design.

## Constraints and risks

- Administrative authorization and mutation paths handle personal data and
  security state; a security review is mandatory.
- Access tokens remain minimal. Active membership and user/session state are
  loaded from persistence for every request so revocation takes effect promptly.
- Admin and public web refresh cookies and refresh coordination namespaces must
  remain distinct, including when both applications share a parent domain.
- User status changes, session revocation, and success audit writes must share a
  database transaction. Rejected attempts must not leak secret or excessive
  personal data.
- Production access has two independent controls: loopback/private networking
  plus NGINX Basic Authentication, and application owner authentication.
- The framework replacement, new persistence, security policy, and deployment
  contract are durable decisions documented by ADR-0010.

## User-flow documentation

- Required guide: `docs/user-flows/admin-user-management.md`.
- Related guide: `docs/user-flows/release-deployment-platform.md`.
- Planned stable scenarios:
    - `admin-owner-password-login-and-user-inspection`
    - `admin-owner-passkey-login`
    - `admin-owner-disable-and-restore-user`
    - `admin-non-member-denied`
    - `admin-recent-authentication-required`
    - `admin-private-edge-authentication`
- Planned E2E files:
    - `apps/admin/tests/e2e/admin-user-management.journeys.spec.ts`
    - deployment mappings under `infra/deploy/tests/` for packaging and edge
      behavior.

## Open decisions

None. The owner-only membership model, Refine/Vite/Ant Design stack, soft
disable/restore semantics, one-year audit retention, private-edge Basic Auth,
and CLI-only membership management were explicitly approved for this version.
