---
feature: user-authentication
title: User Authentication
status: current
last_verified: 2026-08-13
surfaces:
  - browser
  - api
source_paths:
  - .agent/features/user-authentication/**
  - .env.example
  - compose.yaml
  - package.json
  - apps/backend/package.json
  - apps/backend/drizzle/**
  - apps/backend/src/app.ts
  - apps/backend/src/config/environment.ts
  - apps/backend/src/infrastructure/database/**
  - apps/backend/src/modules/authentication/**
  - apps/backend/src/modules/users/**
  - apps/web/package.json
  - apps/web/playwright.config.ts
  - apps/web/tests/e2e/**
  - apps/web/src/app/(auth)/**
  - apps/web/src/fsd/entities/session/**
  - apps/web/src/fsd/features/auth/**
  - apps/web/src/fsd/pages/**
  - apps/web/src/fsd/shared/api/auth-api.ts
  - packages/contracts/src/auth/**
  - packages/database/src/migrations/**
  - packages/database/src/postgres/**
related_features:
  - user-flow-testing-guides
---

# User Authentication

## What this verifies

Use this guide to exercise the complete local authentication journey:

- email/password signup and four-digit email verification;
- session restoration through the HTTP-only refresh cookie;
- current-session and all-session logout;
- password login, recovery/reset, and authenticated password change;
- passkey enrollment, discoverable login, rename, and removal;
- supported API operations and their expected response/cookie behavior;
- important validation, throttling, session-revocation, and security outcomes.

The guide uses local fake identities and the development verification/recovery
code `0000`. It must never be used with staging or production data. Production
email delivery is intentionally unavailable until a real sender adapter is
implemented, and production always rejects the fixed code.

WebAuthn registration and authentication require a supported browser and an
authenticator. The API can return ceremony options and manage an already enrolled
passkey, but a valid WebAuthn credential cannot be hand-authored with `curl`.

## Start the development environment

### Prerequisites and one-time setup

Install Node.js 24, enable the repository pnpm version through Corepack, and make
sure Docker is running. From the repository root:

```sh
corepack enable
pnpm install
if [ ! -e .env.local ] && [ ! -L .env.local ]; then
  cp .env.example .env.local
fi
```

The checked-in example contains local-only database credentials and separate
development JWT/code-HMAC placeholders. Do not copy deployed secrets into this
file. Keep these values for the guide:

```dotenv
APP_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:4000
AUTH_ALLOWED_ORIGINS=http://localhost:3000
AUTH_WEBAUTHN_RP_ID=localhost
```

The guarded copy preserves any existing file or symlink. If `.env.local`
already exists, compare it with `.env.example` and edit it deliberately instead
of overwriting it.

### Start services

Start PostgreSQL and Redis, then apply all committed migrations:

```sh
pnpm dev:infra
pnpm db:migrate
```

Keep the backend and web app running in separate terminals:

```sh
pnpm dev:backend
```

```sh
pnpm dev:web
```

Expected endpoints:

- Web: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- OpenAPI: `http://localhost:4000/openapi.json`

Confirm the backend and authentication capabilities before creating data:

```sh
curl --fail-with-body http://localhost:4000/health
curl --fail-with-body http://localhost:4000/auth/capabilities
```

The capability response should report password authentication, email signup/
verification/recovery, and passkey registration/authentication as available.
Startup failures usually mean `.env.local` is missing, Docker is not ready, or
migrations have not been applied.

Use a unique fake email for each run to avoid colliding with an earlier verified
account or rolling issuance limits, for example
`auth-guide-<current-timestamp>@example.test`. Use a password of 15–128 Unicode
characters that is not a common password, such as
`Languon-dev-passphrase-2026!`.

## Browser verification

### Signup, verification, reload, and current-session logout

1. Open `http://localhost:3000/signup?returnTo=%2Fsecurity`.
2. Enter a fresh fake email and `Languon-dev-passphrase-2026!`.
3. Select **Create account**.
4. Expect navigation to `/verify-email` with a flow identifier in the URL. The
   resend button remains disabled until the displayed 60-second cooldown ends.
5. Enter `0000` and select **Verify email**.
6. Expect navigation to `/security`. The Account section shows the normalized
   email and the current session expiry.
7. Reload the page. Expect **Restoring your session…** briefly, followed by the
   same authenticated security view. The refresh cookie restored the in-memory
   access token.
8. In browser developer tools, confirm no access token exists in the URL,
   `localStorage`, or `sessionStorage`. The refresh cookie is HTTP-only and is not
   readable from page JavaScript.
9. Select **Sign out here**. Expect `/login`; reloading must remain signed out.

### Password login and unverified account behavior

1. On `/login?returnTo=%2Fsecurity`, enter the verified email and password.
2. Select **Sign in**. Expect `/security` and the account email.
3. In another fresh browser profile, create a second unique account but stop at
   the verification page.
4. Attempt password login for that pending account. Expect navigation back to
   the verification flow and no authenticated security page.
5. Try a wrong password for a verified account. Expect a generic sign-in error;
   the UI must not reveal whether a different email exists.

### Password recovery and session revocation

1. Sign in to the same verified account in two isolated browser contexts (for
   example, a normal window and an incognito window).
2. In one context, open `/forgot-password`, enter the account email, and select
   **Send recovery code**.
3. Expect `/reset-password?flowId=...`. Enter `0000` and a different valid
   password such as `Languon-dev-replacement-2026!`.
4. Select **Change password**. Expect
   `/login?passwordReset=complete` and a message explaining that existing
   sessions were signed out.
5. Reload the second context. Expect it to return to login rather than restore
   its old session.
6. Confirm the original password is rejected and the replacement password signs
   in successfully.

The forgot-password response and screen stay generic for unknown email addresses.
Do not infer account existence from the response.

### Authenticated password change and logout everywhere

1. Sign in and open `/security` within five minutes of authentication.
2. In **Change password**, enter the current password and another valid new
   password, then submit.
3. Expect to remain authenticated in a replacement current session. Other
   sessions must fail to restore, and the previous password must no longer work.
4. Create a second session by signing in from an isolated browser context.
5. From the first context, select **Sign out everywhere**.
6. Expect both contexts to require login after navigation/reload.

### Passkey enrollment, login, rename, and removal

Use a browser/platform that supports WebAuthn. Localhost is treated as a secure
development context.

1. Sign in with a password and open `/security` within five minutes.
2. Enter a unique name such as `Local test passkey` and select **Add passkey**.
3. Complete the browser/OS authenticator prompt with user verification.
4. Expect **Passkey added.** and the new entry in the list.
5. Select **Sign out here**, then select **Sign in with a passkey** on `/login`.
6. Choose the discoverable credential and complete user verification. Expect an
   authenticated home page; open **Security settings**.
7. Rename the passkey and expect the new name immediately.
8. Select **Remove**, then **Confirm remove**. Expect the passkey to disappear.
9. Sign out and confirm that removed credential can no longer authenticate this
   account. Password login and recovery remain available.

If the platform has no suitable authenticator, run the Playwright journey in
`apps/web/tests/e2e/auth.journeys.spec.ts`, which uses Chromium's virtual
authenticator and also asserts a deliberately bad signature is rejected.

## API verification

The API examples use the same local server and fake data. All browser-equivalent
authentication mutations require the exact allowed `Origin`; empty request
schemas still require a JSON `{}` body. Response bodies containing access tokens
are written only to temporary local files.

Set task-specific shell variables:

```sh
export LANGUON_PREVIOUS_UMASK="$(umask)"
umask 077
export LANGUON_API=http://localhost:4000
export LANGUON_ORIGIN=http://localhost:3000
export LANGUON_EMAIL="auth-guide-$(date +%s)@example.test"
export LANGUON_PASSWORD='Languon-dev-passphrase-2026!'
export LANGUON_NEW_PASSWORD='Languon-dev-replacement-2026!'
export LANGUON_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/languon-auth-guide.XXXXXX")"
export LANGUON_COOKIE_JAR="$LANGUON_TEMP_DIR/cookies.txt"
export LANGUON_SIGNUP_JSON="$LANGUON_TEMP_DIR/signup.json"
export LANGUON_VERIFIED_JSON="$LANGUON_TEMP_DIR/verified.json"
export LANGUON_REFRESHED_JSON="$LANGUON_TEMP_DIR/refreshed.json"
export LANGUON_LOGIN_JSON="$LANGUON_TEMP_DIR/login.json"
export LANGUON_RECOVERY_JSON="$LANGUON_TEMP_DIR/recovery.json"
export LANGUON_RESET_JSON="$LANGUON_TEMP_DIR/reset.json"
export LANGUON_AUTH_HEADER="$LANGUON_TEMP_DIR/authorization.txt"
```

`umask 077` keeps newly created token and cookie files readable only by your
local user. The unique directory prevents collisions with another guide run.

### Signup and verification

Create a pending account:

```sh
curl --fail-with-body --silent --show-error \
  --output "$LANGUON_SIGNUP_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"$LANGUON_EMAIL\",\"password\":\"$LANGUON_PASSWORD\"}" \
  "$LANGUON_API/auth/sign-up"
```

Expect HTTP `202`. Inspect the non-secret response and capture its flow ID:

```sh
node -p "JSON.stringify(JSON.parse(require('node:fs').readFileSync(process.env.LANGUON_SIGNUP_JSON, 'utf8')), null, 2)"
export LANGUON_FLOW_ID="$(node -p "JSON.parse(require('node:fs').readFileSync(process.env.LANGUON_SIGNUP_JSON, 'utf8')).verification.flowId")"
```

The response has `status: "verification_pending"`, `expiresAt`, and
`resendAvailableAt`. Verify using the development code and store the HTTP-only
refresh cookie:

```sh
curl --fail-with-body --silent --show-error \
  --cookie-jar "$LANGUON_COOKIE_JAR" \
  --output "$LANGUON_VERIFIED_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data "{\"flowId\":\"$LANGUON_FLOW_ID\",\"code\":\"0000\"}" \
  "$LANGUON_API/auth/email-verification/verify"
```

Expect HTTP `200`, `status: "authenticated"`, active user/session metadata, an
access token in JSON, and a `languon_refresh` entry in the cookie jar. Capture the
short-lived access token for the next checks:

```sh
LANGUON_ACCESS_TOKEN="$(node -p "JSON.parse(require('node:fs').readFileSync(process.env.LANGUON_VERIFIED_JSON, 'utf8')).accessToken")"
printf 'Authorization: Bearer %s\n' "$LANGUON_ACCESS_TOKEN" >"$LANGUON_AUTH_HEADER"
unset LANGUON_ACCESS_TOKEN
```

### Current user, refresh rotation, and logout

Resolve the current principal:

```sh
curl --fail-with-body --silent --show-error \
  --header "@$LANGUON_AUTH_HEADER" \
  "$LANGUON_API/users/me"
```

Expect HTTP `200` with the same active user and session identifiers. Rotate the
refresh credential and obtain a new access token:

```sh
curl --fail-with-body --silent --show-error \
  --cookie "$LANGUON_COOKIE_JAR" \
  --cookie-jar "$LANGUON_COOKIE_JAR" \
  --output "$LANGUON_REFRESHED_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$LANGUON_API/auth/refresh"
```

Expect HTTP `200`, another authenticated response, the same absolute session
expiry, and an updated refresh cookie. Log out the current session:

```sh
curl --fail-with-body --silent --show-error \
  --cookie "$LANGUON_COOKIE_JAR" \
  --cookie-jar "$LANGUON_COOKIE_JAR" \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$LANGUON_API/auth/logout"
```

Expect `{"status":"signed_out"}`. Repeating refresh with that cookie must
return HTTP `401 authentication_required` rather than restore the session.

### Password login and recovery

Sign in again and save the replacement session:

```sh
curl --fail-with-body --silent --show-error \
  --cookie-jar "$LANGUON_COOKIE_JAR" \
  --output "$LANGUON_LOGIN_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"$LANGUON_EMAIL\",\"password\":\"$LANGUON_PASSWORD\"}" \
  "$LANGUON_API/auth/login/password"
```

Expect HTTP `200` and `status: "authenticated"`. Request password recovery:

```sh
curl --fail-with-body --silent --show-error \
  --output "$LANGUON_RECOVERY_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"$LANGUON_EMAIL\"}" \
  "$LANGUON_API/auth/password/forgot"
export LANGUON_RECOVERY_FLOW_ID="$(node -p "JSON.parse(require('node:fs').readFileSync(process.env.LANGUON_RECOVERY_JSON, 'utf8')).recovery.flowId")"
```

Expect HTTP `202` and `status: "recovery_pending"`. Reset the password:

```sh
curl --fail-with-body --silent --show-error \
  --output "$LANGUON_RESET_JSON" \
  --write-out '%{http_code}\n' \
  --header "Origin: $LANGUON_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data "{\"flowId\":\"$LANGUON_RECOVERY_FLOW_ID\",\"code\":\"0000\",\"newPassword\":\"$LANGUON_NEW_PASSWORD\"}" \
  "$LANGUON_API/auth/password/reset"
```

Expect HTTP `200` and `status: "password_reset"`. Every pre-reset refresh
session is revoked. Password login with `$LANGUON_PASSWORD` must now return HTTP
`401 invalid_credentials`; login with `$LANGUON_NEW_PASSWORD` must authenticate.

### Additional session and passkey API checks

- `POST /auth/password/change` requires the current Bearer access token,
  `Origin`, and `{ "currentPassword": ..., "newPassword": ... }`. Success
  returns a replacement authenticated session, revokes other sessions, and sets
  a replacement refresh cookie.
- `POST /auth/logout-all` requires Bearer, refresh cookie, `Origin`, and `{}`.
  Success returns `all_sessions_revoked`; refresh from every cookie jar in that
  account's session family must then return `401`.
- `POST /auth/passkeys/registration/options` accepts Bearer, `Origin`, and `{}`.
  It returns a five-minute ceremony flow and WebAuthn options, but complete the
  credential creation in a browser.
- After browser enrollment, `GET /auth/passkeys` with Bearer returns safe
  metadata. `PATCH /auth/passkeys/{passkeyId}` with Bearer, `Origin`, and
  `{ "name": "New name" }` renames it. `DELETE` on the same URL with Bearer and
  `Origin` revokes it. Rename/removal can require authentication from the last
  five minutes.

Open `http://localhost:4000/openapi.json` for the complete current schema and
response/error definitions. Never paste captured access tokens or cookie jars
into issues, logs, or committed documentation.

## Expected failure and edge cases

| Case                                                              | Expected result                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Missing/disallowed `Origin` on an auth mutation                   | HTTP `403 forbidden`; no state mutation.                                                                                |
| Missing/malformed Bearer token                                    | HTTP `401 authentication_required`; no protected data.                                                                  |
| Wrong/nonexistent password login                                  | Generic HTTP `401 invalid_credentials`; no account-existence detail.                                                    |
| Correct password for pending account                              | `email_verification_required`; no tokens or refresh cookie.                                                             |
| Wrong verification/recovery code                                  | HTTP `400 verification_failed`; a fifth wrong attempt exhausts the flow, while a correct fifth attempt succeeds.        |
| Verification/recovery code after ten minutes                      | `verification_failed`; request a new flow.                                                                              |
| Immediate resend                                                  | UI countdown or HTTP `429 rate_limited` with `Retry-After`; honor `resendAvailableAt`.                                  |
| More than five sends in a rolling hour                            | HTTP `429`; do not bypass by repeating signup for the same address.                                                     |
| Weak/common/short password                                        | Client validation or HTTP `400 password_policy_failed`; account credential is unchanged.                                |
| Refresh after logout, reset, logout-all, expiry, or revocation    | HTTP `401`; terminal refresh/logout failures clear the browser cookie.                                                  |
| Replay of an already rotated refresh credential                   | The complete refresh family is revoked; use automated integration tests rather than replaying a primary manual account. |
| Passkey operation after recent-auth window                        | HTTP `403 recent_authentication_required`; sign in again.                                                               |
| Duplicate passkey credential/name or more than 50 active passkeys | Stable conflict/operation failure; existing credentials remain intact.                                                  |
| Redis unavailable during issuance/rate-limit/WebAuthn work        | Fail-closed `503 service_unavailable`; no challenge/session should be issued.                                           |
| Oversized auth body above 384 KiB                                 | HTTP `413`; bounded contract-valid WebAuthn registration bodies remain accepted for validation.                         |

Rate limits are intentionally shared across account/flow and client-address
dimensions. Use unique test emails and wait for the returned retry interval; do
not restart Redis merely to bypass a correct throttle.

## Automated regression checks

Run the low-cost deterministic suites after auth contract/backend/web changes:

```sh
pnpm --filter @languon/contracts test
pnpm --filter @languon/backend test
pnpm --filter @languon/web test
```

Run the repository handoff suite before completing related feature work:

```sh
pnpm check
```

The checked-in Playwright suite covers the critical cross-application journeys,
including a virtual authenticator. Run this complete block from the repository
root. It creates two loopback-only, disposable containers, waits for them, runs
the journeys, and removes them even when a test fails:

```sh
(
  set -eu
  LANGUON_E2E_POSTGRES_CONTAINER=languon-auth-e2e-postgres
  LANGUON_E2E_REDIS_CONTAINER=languon-auth-e2e-redis
  LANGUON_E2E_POSTGRES_STARTED=false
  LANGUON_E2E_REDIS_STARTED=false
  cleanup_e2e() {
    if [ "$LANGUON_E2E_REDIS_STARTED" = true ]; then
      docker stop "$LANGUON_E2E_REDIS_CONTAINER" >/dev/null 2>&1 || true
    fi
    if [ "$LANGUON_E2E_POSTGRES_STARTED" = true ]; then
      docker stop "$LANGUON_E2E_POSTGRES_CONTAINER" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_e2e EXIT HUP INT TERM

  docker run --detach --rm \
    --name "$LANGUON_E2E_POSTGRES_CONTAINER" \
    --publish 127.0.0.1:55432:5432 \
    --env POSTGRES_DB=languon_auth_e2e \
    --env POSTGRES_USER=languon_e2e \
    --env POSTGRES_PASSWORD=languon_e2e \
    postgres:17-alpine
  LANGUON_E2E_POSTGRES_STARTED=true
  docker run --detach --rm \
    --name "$LANGUON_E2E_REDIS_CONTAINER" \
    --publish 127.0.0.1:56379:6379 \
    redis:8-alpine
  LANGUON_E2E_REDIS_STARTED=true

  LANGUON_WAIT_ATTEMPTS=0
  until docker exec "$LANGUON_E2E_POSTGRES_CONTAINER" \
    pg_isready --username languon_e2e --dbname languon_auth_e2e >/dev/null 2>&1
  do
    LANGUON_WAIT_ATTEMPTS=$((LANGUON_WAIT_ATTEMPTS + 1))
    [ "$LANGUON_WAIT_ATTEMPTS" -lt 30 ] || exit 1
    sleep 1
  done
  LANGUON_WAIT_ATTEMPTS=0
  until docker exec "$LANGUON_E2E_REDIS_CONTAINER" \
    redis-cli ping >/dev/null 2>&1
  do
    LANGUON_WAIT_ATTEMPTS=$((LANGUON_WAIT_ATTEMPTS + 1))
    [ "$LANGUON_WAIT_ATTEMPTS" -lt 30 ] || exit 1
    sleep 1
  done

  AUTH_E2E_DATABASE_URL=postgres://languon_e2e:languon_e2e@127.0.0.1:55432/languon_auth_e2e \
  AUTH_E2E_REDIS_URL=redis://127.0.0.1:56379/15 \
  AUTH_E2E_WEB_ORIGIN=http://localhost:3100 \
  AUTH_E2E_BACKEND_ORIGIN=http://localhost:4100 \
  pnpm --filter @languon/web test:e2e
)
```

If either fixed container name or dedicated loopback port (`55432`, `56379`,
`3100`, or `4100`) is already in use, the block fails instead of reusing an
unknown service. Stop or rename the conflicting local process, confirm its
ownership, and retry. The harness also refuses ordinary/shared database names
and starts its own backend/web processes. See `apps/web/tests/e2e/README.md` for
guard conditions.

Authentication database/Redis integration tests have stricter disposable-target
confirmations under `apps/backend/tests/integration/support/`. Use the exact
documented environment gates; never point destructive tests at development,
staging, or production data. Historical commands and results are in
`.agent/features/user-authentication/EVIDENCE.md`.

## Troubleshooting

- Backend exits during startup: compare `.env.local` to `.env.example`. `APP_ENV`,
  distinct 32-byte-or-longer JWT/HMAC secrets, database/Redis URLs, allowed
  origin, and WebAuthn RP ID must pass validation.
- `pnpm db:migrate` cannot connect: wait for `pnpm dev:infra`, confirm Docker
  health, and confirm `DATABASE_URL` points to the local Compose PostgreSQL.
- Browser shows capability unavailable: inspect `/auth/capabilities` and backend
  startup configuration. Development should use the local sender/fixed code;
  deployed environments intentionally differ.
- API returns `403` unexpectedly: include `Origin: http://localhost:3000`
  exactly. Do not use a trailing slash.
- Browser/API returns `429`: read `Retry-After`, wait, and use a fresh fake email
  for a new end-to-end run.
- Passkey button is disabled: use a WebAuthn-capable browser on localhost, confirm
  platform/security-key availability, or run the virtual-authenticator E2E.
- Security operations ask for recent authentication: password/passkey login must
  have occurred within five minutes; a refresh alone does not extend that proof.
- Reload signs out: inspect the refresh request and cookie in browser network
  tools. Do not expect an access token in local/session storage.

## Cleanup

Stop the host development processes with `Ctrl-C`, then stop local containers
without deleting data:

```sh
pnpm infra:down
```

Remove only the temporary API files created by this guide when they are no longer
needed:

```sh
rm -f "$LANGUON_COOKIE_JAR" \
  "$LANGUON_SIGNUP_JSON" \
  "$LANGUON_VERIFIED_JSON" \
  "$LANGUON_REFRESHED_JSON" \
  "$LANGUON_LOGIN_JSON" \
  "$LANGUON_RECOVERY_JSON" \
  "$LANGUON_RESET_JSON" \
  "$LANGUON_AUTH_HEADER"
rmdir "$LANGUON_TEMP_DIR"
umask "$LANGUON_PREVIOUS_UMASK"
unset LANGUON_ACCESS_TOKEN LANGUON_FLOW_ID LANGUON_RECOVERY_FLOW_ID \
  LANGUON_PASSWORD LANGUON_NEW_PASSWORD LANGUON_EMAIL \
  LANGUON_COOKIE_JAR LANGUON_AUTH_HEADER LANGUON_SIGNUP_JSON \
  LANGUON_VERIFIED_JSON \
  LANGUON_REFRESHED_JSON LANGUON_LOGIN_JSON LANGUON_RECOVERY_JSON \
  LANGUON_RESET_JSON LANGUON_TEMP_DIR LANGUON_API LANGUON_ORIGIN \
  LANGUON_PREVIOUS_UMASK
```

If an interrupted E2E run left its disposable containers running, remove only
containers you confirmed came from your run. Inspect them with
`docker ps --filter name=languon-auth-e2e-`, then stop the confirmed names.

Ordinary cleanup preserves the local PostgreSQL and Redis volumes. If you
intentionally need a completely fresh local database, first confirm that Compose
is targeting only your local development project, then run
`pnpm infra:down --volumes`. That destructive command deletes all local Languon
PostgreSQL/Redis data and must never be used against shared environments.
