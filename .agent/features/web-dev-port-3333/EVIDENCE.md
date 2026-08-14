# Verification evidence: Web Development Port 3333

Updated: 2026-08-14

Record exact commands, concise results, relevant scenarios, and remaining risks.
Do not paste full logs when a focused excerpt or artifact reference is enough.

## Automated tests

### Unit

- Command: `pnpm --filter @languon/backend exec vitest run tests/unit/config/environment.test.ts tests/unit/modules/authentication/interface/http/auth-http-policy.test.ts`
- Result: Passed, 2 files and 27 tests.
- Coverage added: a regression proves exact empty optional Langfuse public/secret
  values become `undefined` while configured non-empty values remain unchanged;
  the development auth-origin default now expects `http://localhost:3333`, and
  backend host defaults/restrictions are covered.

### Integration and contract

- Command: `pnpm --filter @languon/web test`; `docker compose --profile apps config`.
- Result: Web passed 5 files/35 tests. Compose rendered successfully.
- Behavior validated: existing web authentication behavior remains green; the
  rendered web service publishes/targets 3333, the backend app profile allows
  the exact matching origin, and all Compose app/data publications use host IP
  `127.0.0.1` while container listeners remain reachable internally. An opt-in
  render proves `LANGUON_APP_BIND_HOST=0.0.0.0` changes only application ports;
  PostgreSQL and Redis remain unconditionally loopback-only.

### E2E

- Command: registered `pnpm --filter @languon/web test:e2e` with
  `AUTH_E2E_WEB_ORIGIN=http://localhost:3333`, backend 4100, disposable
  PostgreSQL `languon_port3333_e2e` on 55432, and Redis DB 15 on 56379.
- Result: Final Desktop Chromium run passed 3/3 in 16.2 seconds; containers and launched
  backend/web processes were cleaned up.
- Journeys validated: `signup-verification-refresh-logout`,
  `password-reset-session-revocation`, and `passkey-lifecycle` including virtual
  WebAuthn and its expected bad-signature failure.

## Real application verification

- Environment: macOS host, Next.js 16.3 development server, Desktop Chromium,
  loopback-only disposable database/cache, web 3333 and backend 4100. The
  unrelated process on 3000 remained running throughout.
- Scenario: all mapped authentication browser journeys plus the canonical host
  `pnpm dev:web` startup and `GET /signup`.
- Observed result: Playwright reported backend/web on `127.0.0.1:4100` and
  `127.0.0.1:3333`, with no unexpected console/page errors or failed HTTP
  responses. Canonical `pnpm dev:web` and production `start` both served HTTP
  200; `lsof` confirmed each listener as `127.0.0.1:3333`. Browser journeys
  verified refresh persistence/logout, password-reset revocation, and passkeys.
- Artifacts: none retained because all scenarios passed; Playwright retains
  screenshots/traces/video only on failure.

## User-flow guide verification

- Guides created or updated: `docs/user-flows/user-authentication.md` updated for
  normal local web origin 3333; isolated safe E2E 3100/4100 recipe preserved.
- Commands and journeys checked: normal startup, browser signup URL, API Origin,
  troubleshooting, source-path metadata, and all three declared E2E scenarios.
- `pnpm docs:user-flows:check` result: Passed, validator 15/15 and one current
  guide/mapping validated.
- `pnpm user-flow:e2e -- check user-authentication` result: Passed; inspect reports
  synchronized revision `sha256:855d3e63671c4a38`.
- Scenario IDs and exact E2E test files: all three IDs listed above map to
  `apps/web/tests/e2e/auth.journeys.spec.ts`.
- E2E environment/command/result and cleanup: registered Playwright command at
  web 3333/backend 4100; 3/3 passed; exact disposable containers stopped and
  ports 3333/4100/55432/56379 were free afterward.

## Static checks

- Format: full `pnpm check` `format:check` passed.
- Lint: affected backend/web/admin lint and full repository lint passed.
- Typecheck: affected backend/web/admin typecheck and full repository typecheck passed.
- Build: affected backend/web/admin builds and full repository build passed.

## Database verification

- Migration command: Not applicable; no persistence changes. Playwright applied
  existing migrations only to its disposable database before the journeys.
- Forward result: Not applicable.
- Rollback result: Not applicable.
- Data/invariant checks: Not applicable.

## Review

- Reviewer result: Final pass with no material findings.
- Tester result: Final pass with no material gaps.
- Security reviewer result: Final clean verdict with no remaining material
  findings.
- Findings resolved: the security review's Medium LAN-exposure finding was
  remediated with loopback defaults, explicit container-only internal listeners,
  a validated backend host, and warned LAN opt-in. The tester's Medium finding
  on the infrastructure override was fixed by making database/cache publication
  unconditionally loopback-only. Final correctness/security/test reviews passed.

## Remaining risks

- Existing ignored `.env.local` files are intentionally not overwritten. A
  developer whose file still explicitly names port 3000 must update
  `AUTH_ALLOWED_ORIGINS=http://localhost:3333`; new copies inherit the checked-in
  value.
- Existing already-running Compose containers retain their old publication until
  `pnpm dev:infra` recreates them from the updated configuration.
- `LANGUON_APP_BIND_HOST=0.0.0.0` is an explicit unsafe app-only LAN opt-in;
  documentation forbids fixed codes, placeholders, meaningful accounts, and
  shared/deployed data in that mode. Database/cache publication cannot opt out of
  loopback.
