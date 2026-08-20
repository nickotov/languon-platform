---
feature: admin-user-management
title: Admin User Management
status: current
last_verified: 2026-08-20
surfaces:
    - browser
    - admin
    - api
    - cli
source_paths:
    - apps/admin/**
    - apps/backend/src/modules/administration/**
    - apps/backend/src/infrastructure/administration/**
    - packages/contracts/src/admin/**
    - packages/browser-auth/**
    - infra/deploy/**
    - infra/docker/prod.admin.Dockerfile
    - infra/docker/admin.nginx.conf
    - infra/nginx/nginx.conf
e2e_command: admin-user-management
e2e_tests:
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
    - infra/deploy/tests/admin-edge.journey.test.mjs
e2e_scenarios:
    - admin-owner-password-login-and-user-inspection
    - admin-owner-disable-and-restore-user
    - admin-recent-authentication-required
    - admin-non-member-denied
    - admin-owner-passkey-login
    - admin-private-edge-authentication
related_features:
    - user-authentication
    - release-deployment-platform
---

# Admin User Management

## What this verifies

This guide verifies the first owner-only administration capability from a real
browser through the real admin SPA, backend, PostgreSQL, and Redis. It covers
password and passkey authentication, persistent membership authorization, user
inspection, safe disable/restore transitions, session refresh, and denial of a
verified non-member.

It intentionally does not verify hard deletion, identity editing,
impersonation, browser-based membership management, or application-content
management; none of those capabilities exists in this version. Last-owner
locking, concurrent mutations, recent-authentication expiry, audit retention,
and malformed contract matrices are covered at the lower integration and
contract layers where timing and state are deterministic. Static image and
private-edge behavior are covered by a disposable real-NGINX journey,
deployment checks, and the related release guide.

## Start the development environment

Use synthetic identities and dedicated disposable services only. The mapped
Playwright command refuses non-loopback PostgreSQL and Redis URLs and refuses a
default PostgreSQL port or a database name that does not clearly identify an
admin E2E test database.

1. Start disposable PostgreSQL and Redis instances on non-default loopback
   ports. Use a database named, for example,
   `languon_admin_e2e_test`. Do not point these variables at the ordinary local,
   stage, or production databases.
2. Export the guarded inputs:

    ```sh
    export ADMIN_E2E_DATABASE_URL='postgres://admin_e2e:local-only-admin-e2e@127.0.0.1:55439/languon_admin_e2e_test'
    export ADMIN_E2E_REDIS_URL='redis://127.0.0.1:56389'
    ```

3. Run `pnpm --filter @languon/admin test:e2e`. Playwright migrates the
   dedicated database, starts the backend on `localhost:4000`, the admin Vite
   server on `localhost:3001`, and the public web app on `localhost:3333`.
   `localhost` is intentional: it is the disposable WebAuthn relying-party ID;
   do not mix it with `127.0.0.1` in browser/API origins.
   Existing servers are not reused unless
   `ADMIN_E2E_REUSE_SERVERS=true` is explicitly set.
   For the complete mapped acceptance command, including the disposable real
   NGINX private-edge check, run `pnpm test:e2e:admin-user-management` with a
   local Docker context and `DOCKER_HOST` unset. The composite command stops on
   the first failure and removes its uniquely named edge containers/network.
4. For manual exploration instead, start `pnpm dev:infra`, `pnpm dev:backend`,
   `pnpm dev:web`, and `pnpm dev:admin`. The admin Vite server proxies its
   same-origin `/api/*` requests to the local backend.

Expected result: `/health`, the public web sign-in page, and the admin sign-in
page respond locally. The browser never receives a database URL, Redis URL, JWT
secret, or owner-management credential.

## Browser verification

1. Open `http://localhost:3001/login`. Confirm the page identifies itself as a
   private operations surface and offers password and passkey authentication.
2. Sign in with a verified user that has an active owner membership. Confirm
   the dashboard shows exact user and owner totals and recent administrative
   activity.
3. Reload the page. Confirm the dedicated admin refresh cookie restores the
   session without placing an access token in local or session storage.
4. Change Light, Dark, and System preferences. Confirm the shell, table,
   statuses, dialog, and focus indicators remain legible. Reduce the viewport to
   320 CSS pixels and confirm navigation collapses without losing access to
   Overview, Users, Audit, theme, or sign-out actions.
5. Open Users, search for a synthetic email, filter by status, and open the
   result. Confirm only safe account, verification, status, session-count,
   passkey-count, timestamp, version, and owner-membership data is shown.
6. Enroll a passkey from the public account security page, sign out there, then
   use **Use a passkey** on the admin login page. Confirm the same database owner
   membership is still required after the passkey assertion.

Expected result: both authentication methods establish an admin-specific
session; all application authorization is server-backed; responsive and theme
states remain usable; no password hash, refresh credential, passkey credential
material, verification code, or secret is rendered or logged.

## Admin verification

1. From a target user detail page choose **Disable user**. Confirm the dialog
   explains immediate session revocation and audit recording.
2. Enter fewer than five characters and confirm submission is blocked. Enter a
   clear synthetic reason and submit.
3. Confirm status becomes `disabled`, the state version increments, and an
   audit row shows success, actor, target, reason, and occurrence time.
4. Choose **Restore user**, enter a different reason, and submit. Confirm a
   verified user becomes `active`; an unverified user becomes `pending`.
5. If the backend returns `recent_authentication_required`, choose **Sign in
   again**. Confirm the original mutation is not replayed after login. Reopen it
   and make a fresh decision.
6. If another owner changed the user first, confirm the version conflict is
   shown and refresh the detail before deciding again.

Expected result: destructive intent is explicit, reasons are 5–500 characters,
the UI never silently retries a mutation, and restore never creates a session.

## API verification

All admin API paths are same-origin below `/api/admin/*` at the private edge.
Call them only with synthetic local data and a short-lived access token from a
local admin login.

1. Request `/api/admin/me`, `/api/admin/dashboard`, `/api/admin/users`, a user
   detail, and `/api/admin/audit-events` through the admin origin.
2. Confirm every protected response requires a valid token whose session and
   user remain active and whose user has an active owner membership in
   PostgreSQL.
3. Confirm a normal verified user receives a bounded `admin_access_denied`
   response and the login-created session is revoked.
4. Send a stale `expectedVersion`, a short reason, a self-disable request, and a
   final-owner-disable request. Confirm bounded validation/conflict/forbidden
   responses and no successful state transition.
5. Request `/api/admin/*` through the public edge and confirm it returns 404.

Expected result: client claims or hidden navigation never grant access, error
responses include a correlation reference without sensitive data, and public
traffic cannot reach administration routes.

## CLI verification

### Add the first administrator

Administration membership is intentionally managed outside the browser. The
membership command **does not create a user**: it grants the `owner` role to a
user already stored in the same PostgreSQL database.

Before the first grant:

1. Register the intended administrator through the ordinary Languon web app.
2. Complete email verification. The account must be `active` and its primary
   email must be verified.
3. Confirm the command will use the intended database. The local command loads
   the repository-root `.env.local` and connects directly through
   `DATABASE_URL`; the backend process does not need to be running, although
   PostgreSQL must be available. Never point a local bootstrap command at stage
   or production.
4. Replace every example address below with the real registered email. An
   address such as `your-email@example.com` is a placeholder and will correctly
   fail with user-not-found if it was never registered.

For the first owner in a local development database, omit `--actor-email`:

```sh
pnpm admin:membership -- grant \
  --email your-registered-email@example.com \
  --reason 'Bootstrap the initial local administrator' \
  --confirm admin-membership-change

pnpm admin:membership -- list
```

The literal `--confirm admin-membership-change` is a safety acknowledgement, not
a password. A successful result prints the granted membership as JSON. The list
command should then show the canonical email and `owner` role. Only a database
with zero active owners may bootstrap without `--actor-email`; the invariant is
enforced transactionally.

For a real email or audit reason that should not appear in shell history, create
a short-lived JSON file using your editor:

```json
{
    "command": "grant",
    "email": "your-registered-email@example.com",
    "reason": "Bootstrap the initial accountable local administrator",
    "confirm": "admin-membership-change"
}
```

Restrict the file before use, then pass it through standard input:

```sh
chmod 0600 /safe/private/admin-request.json
pnpm admin:membership:stdin < /safe/private/admin-request.json
```

The strict request accepts `command`, optional `actorEmail`, `email`, `reason`,
and literal `confirm`. Delete the file after the command completes. The stdin
form avoids placing the email and reason in the local process arguments.

Every later grant or revoke must identify an existing active owner so the audit
record has an accountable actor:

```sh
pnpm admin:membership -- grant \
  --email second-owner@example.test \
  --actor-email your-registered-email@example.com \
  --reason 'Add the on-call operations owner' \
  --confirm admin-membership-change
```

### Add the first administrator on a deployed VPS

First register and verify the intended owner against that environment's public
web app. Then run the guarded SSH wrapper from the repository checkout, using
the exact manifest for the release currently active on the VPS:

```sh
pnpm admin:membership:remote -- grant \
  --environment stage \
  --target deploy@203.0.113.10 \
  --manifest .release/stage-manifest.json \
  --email your-registered-email@example.com \
  --reason 'Bootstrap the initial accountable stage owner' \
  --confirm admin-membership-change \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts
```

Verify the result without changing state:

```sh
pnpm admin:membership:remote -- list \
  --environment stage \
  --target deploy@203.0.113.10 \
  --manifest .release/stage-manifest.json \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts
```

The wrapper uses strict host-key checking, copies only a mode-0600 JSON request,
deletes that request after reading it, verifies the manifest identity, source
SHA, and image digests against active deployment state, and runs the release's
already-installed CLI inside the immutable backend image. It refuses an
inactive manifest or a release without that immutable operator bundle. The
validated request reaches the container through standard input, not
process-visible arguments. Use `--config` or `--state-directory` only when the
Timeweb host uses non-default paths.

Logging into the deployed admin application then requires two independent
layers:

1. the NGINX Basic Authentication credential provisioned for the private admin
   edge; and
2. the user's normal Languon password or passkey plus the active `owner`
   membership granted above.

Granting membership does not create or replace the NGINX credential. Likewise,
passing Basic Authentication alone never grants application administration
access.

Prune expired audit events through the same local or remote command with an
active actor, a reason, and the literal confirmation. Pruning writes its own
one-year audit event and never removes unexpired entries.

## E2E coverage

- `admin-owner-password-login-and-user-inspection` proves real password login,
  dedicated refresh bootstrap after reload, list search, and safe user detail.
- `admin-owner-disable-and-restore-user` proves both audited status transitions
  through the browser against PostgreSQL and Redis-backed authentication.
- `admin-recent-authentication-required` expires only the current synthetic
  owner's disposable database session, proves the mutation is rejected, and
  proves the entered reason remains visible beside the explicit sign-in action.
- `admin-non-member-denied` proves a verified ordinary user cannot establish an
  administration session.
- `admin-owner-passkey-login` uses Chromium's virtual authenticator to enroll a
  real WebAuthn credential through the public account and assert it through the
  admin application.
- `admin-private-edge-authentication` starts the production NGINX edge with a
  host-owned mode-0600 password file, proves invalid Basic credentials fail,
  proves valid credentials reach the SPA, and proves the scoped application
  token is translated to backend Bearer authorization without replacing Basic
  authentication.

The browser journey does not fake the frontend, backend, database, cache, or
WebAuthn protocol. Transaction races, last-owner concurrency, and expiry remain
in focused database tests. The private-edge journey uses real NGINX with a
minimal disposable upstream so credential forwarding and file permissions are
verified deterministically without shared services.

## Expected failure and edge cases

- Invalid password or passkey: remain on login with a bounded actionable error.
- Verified non-member or revoked owner: deny access immediately; do not wait for
  access-token expiry.
- Disabled owner or revoked session: clear memory state and return to login.
- Recent authentication expired: require a fresh sign-in and never replay the
  original mutation.
- Stale version: show conflict and require a refreshed decision.
- Self-disable or last active owner: reject without changing account state.
- Network loss: preserve the current page and offer retry; do not report a
  mutation as successful without a valid response.
- Empty search/audit result: show an explicit empty state rather than a blank
  table.
- Missing Basic Auth at the private edge: NGINX returns 401 before the SPA or
  admin API is served.

## Automated regression checks

```sh
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
pnpm --filter @languon/admin lint
pnpm --filter @languon/admin build
pnpm --filter @languon/backend test
node --test infra/deploy/tests/admin-operator.test.mjs
pnpm test:e2e:admin-user-management
pnpm user-flow:e2e -- check admin-user-management
pnpm docs:user-flows:check
```

The admin unit suite checks API validation and client state; backend tests cover
authorization, HTTP errors, persistence, transactions, and operator parsing;
deployment tests cover active-manifest SSH execution and private-edge/static
contracts. The mapped composite command runs both the Playwright
cross-application acceptance suite and the real-NGINX edge journey; it requires
the disposable variables from the startup section and a local Docker engine.

## Troubleshooting

- **Playwright refuses the database URL:** use loopback, a non-default port, and
  a database name such as `languon_admin_e2e_test`.
- **The owner grant says an actor is required:** the database already has an
  owner. List memberships and supply that active user's email; do not bypass the
  bootstrap invariant.
- **Admin requests return 404 in Vite:** confirm
  `ADMIN_API_PROXY_TARGET=http://127.0.0.1:4000` and that the Vite `/api`
  rewrite is active.
- **Admin login is denied after ordinary web login:** authentication alone is
  insufficient. Confirm an active membership with the list command.
- **Passkey prompt fails:** use Chromium with the virtual authenticator for E2E,
  or a secure/localhost browser origin and an RP ID that covers both web and
  admin hosts.
- **Remote command refuses the manifest:** download or create the manifest for
  the release currently active in the environment; never substitute a mutable
  image tag.

## Cleanup

Stop Playwright-started application processes with the test runner. Stop the
dedicated containers using their exact names. Remove only the disposable admin
E2E database/container after checking its name and loopback port; never run a
schema drop, Compose volume removal, or owner command against shared, stage, or
production data as cleanup.
