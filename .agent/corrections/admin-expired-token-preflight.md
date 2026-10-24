# Correction: Admin expired access-token preflight

Status: Complete
Created: 2026-10-24
Updated: 2026-10-24

## Routing decision

- Restore existing transparent access-token refresh for all admin request paths.
  This is a bounded browser-client correction; no token lifetime, refresh
  rotation, five-minute recent-authentication policy, API or schema changes.
- User explicitly chose to retain five minutes and investigate only refresh
  bugs. Do not automatically replay sensitive mutations or extend recent auth.
- Preserve the unrelated development-login correction record.

## Diagnosis and scope

- Live audit reports `recent_authentication_required` for AI settings. Access
  tokens are configured for two days and refresh sessions for fourteen days;
  the observed quick cutoff is the separate five-minute sensitive-action check.
- A separate reproducible client defect exists: sensitive writes and audio
  previews use single-request transports without 401 refresh/retry. The admin
  access-token store discards the expiry supplied by login/refresh, so these
  paths send a known expired access token and fail without refreshing first.
- Store the server-provided expiry in memory and refresh before sending a
  protected request when the token is expired or close to expiry. Preserve the
  existing one-retry path for regular requests and no-replay sensitive writes.
- Governing constraints: ADR-0001/0010, existing browser-access-token-refresh
  correction and admin-user-management guide. No browser persistence of tokens.

## Acceptance criteria

- AC-1: known expired admin access tokens cause one coordinated refresh before
  protected GETs, sensitive accounting/pricing writes and audio previews.
- AC-2: concurrent requests share the refresh; valid tokens avoid needless
  refresh. Login/refresh retain expiry, clearing resets it, and the token remains
  memory-only.
- AC-3: genuine recent-authentication/permission failures are not refreshed or
  replayed; the five-minute backend policy remains intact.

## Plan and verification

- [x] Add failing regressions for single-request expired-token preflight.
- [x] Preserve expiry in admin state and use it in protected transports.
- [x] Run affected unit/static checks and a real admin browser journey.
- [x] Independent security review, final evidence and diff preflight.

## Evidence

- Initial admin API/speech tests: 2 files / 19 tests passed; coverage lacked
  known-expiry preflight for single-request paths.
- New sensitive accounting-write regression failed before implementation with
  `AdminApiError: Authentication is required` and no refresh request, reproducing
  the single-request defect.
- Final admin unit suite passed 10 files / 65 tests. Tests cover known expiry,
  the 30-second pre-dispatch margin, invalid expiry, clearing, coordinated reads
  plus audio preflight, exactly one sensitive publication, and unchanged
  recent-authentication denial without refresh/replay.
- Admin typecheck, lint and production build passed. Build retains the existing
  advisory bundle-size warning; unit rendering retains jsdom's existing
  getComputedStyle pseudo-element warning. No runtime implementation changes
  remain after these checks.
- The real browser scenario uses `ADMIN_E2E_ACCESS_TOKEN_TTL=60s` only in the
  guarded disposable test configuration; normal app token lifetimes are
  unchanged. It waits for actual backend expiry, uses the real refresh endpoint
  and cookie, and asserts one refresh followed by one pricing POST, status 200,
  closed dialog and retained authenticated view. No auth/clock/network mocks.
- First browser run completed the real publication successfully, then failed
  because the new test expected `AI settings` while the existing page heading
  is `AI providers`. Only the test locator was corrected; final rerun passed.
- Browser configuration is isolated: backend 4406, admin 3407, web 3408,
  PostgreSQL 55484 / `languon_admin_refresh_e2e_test`, Redis 56484. It uses fake
  users and makes no paid generation calls. Normal development services and
  data are untouched.
- Existing guide already promises idle token refresh and separately documents
  recent-authentication denial. No behavior/command/marker revision change to
  the guide is needed. `pnpm user-flow:e2e -- check admin-user-management`
  passes; `pnpm docs:user-flows:check` passed 16 validators and all 28 mapped
  guides.
- No change to user-visible layout or copy is planned.

## Final verification and review

- Base: `127769556276b7358387309986ef3a89defc1321`. Final scoped binary diff
  (`git diff --binary -- apps/admin`) SHA-256:
  `71094fcf72c98ef2549424cd4dba85b31151240c9c36e6d675aa69a2988dbb27`.
- Browser command: `pnpm --filter @languon/admin exec playwright test
tests/e2e/admin-user-management.journeys.spec.ts --grep
'refreshes expired admin access|owner signs in, refreshes|expired
recent-authentication window'`. Environment used the guarded disposable
  database/Redis above, `ADMIN_E2E_ACCESS_TOKEN_TTL=60s`, and explicit
  `ADMIN_E2E_BACKEND_ORIGIN`, `ADMIN_E2E_ADMIN_ORIGIN`,
  `ADMIN_E2E_WEB_ORIGIN` for ports 4406/3407/3408.
- Final Chromium run passed 3/3: login/reload/session restoration and user
  inspection; actual access-token expiry followed by one refresh and one
  successful sensitive price publication; independent recent-sign-in denial
  preserving the reason and requiring explicit sign-in. Console/page-error and
  unexpected HTTP-failure assertions passed. No extra exploratory browser run
  is needed because these tests exercise the exact real rendered workflow.
- `pnpm --filter @languon/admin test`: final 65/65 passed. Admin typecheck,
  lint and production build passed. No runtime code changed after the tests;
  only the final browser test locator changed and was verified by the rerun.
- Independent completion/security review: no material findings. Reviewer
  confirmed memory-only expiry, clear semantics, all five transport paths,
  coordinated refresh, no sensitive-write replay, and unchanged server policy.
- The two task-owned test containers and volumes were removed. Playwright
  stopped its test servers. The task-generated `apps/web/next-env.d.ts` output
  path was restored; the unrelated development-login correction is preserved.
- Final `git diff --check` passes. Changes remain uncommitted; no development
  database contents, live sessions, `.env.local`, backend lifetime or security
  policy was changed by this correction.

## Remaining limits

- This fixes actual access-token preflight, not the deliberate five-minute
  recent-sign-in check. Refresh cannot and must not extend that window.
- A legacy token without expiry metadata or clock skew beyond the 30-second
  margin may still fail a sensitive request; the request is not automatically
  replayed and requires explicit retry. Normal login and refresh now retain
  their contract-validated expiry.
