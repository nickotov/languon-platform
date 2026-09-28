# Correction: Browser access-token refresh

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: authenticated web and admin requests transparently refresh
  an expired in-memory access token and retry once while the refresh session is
  still valid.
- Why this is a correction: it restores the accepted ADR-0001/ADR-0010 browser
  session behavior and existing refresh endpoints; it adds no authentication
  capability and changes no token, cookie, authorization, persistence, or
  deployment policy.
- Feature-flow triggers checked: the work is one coherent browser-auth seam,
  preserves public contracts and security boundaries, and requires no migration,
  dependency, or product decision. Authentication risk still requires focused
  security review and real-browser evidence.
- Escalation rule: if investigation requires a new token/error contract or a
  policy change, mark this record `Escalated` and obtain feature authorization.

## Context and scope

- Current behavior: web retries only `AuthApiError` status 401, so protected
  feature errors such as `DictionaryApiError` bypass refresh. Admin retries only
  status 401. A refreshable `authentication_required` response surfaced as 403
  therefore reaches the UI unchanged in both clients.
- Expected behavior: refresh and retry exactly once for a typed browser API
  error that is status 401 or carries `authentication_required`, including a
  compatibility 403; preserve genuine 403 permission/recent-auth errors.
- In scope: shared browser-auth error classification, web dictionary error base,
  web session retry, admin protected request retry, focused regression tests,
  affected authentication/admin user-flow documentation and runtime evidence.
- Out of scope: token lifetimes, refresh rotation/replay policy, cookie settings,
  backend status-code contracts, proactive timers, native clients.
- Likely files/surfaces: `packages/browser-auth`, web auth provider and dictionary
  API error, admin API wrapper, focused tests, `user-authentication` and
  `admin-user-management` guides.
- Relevant ADRs or constraints: ADR-0001, ADR-0010, no access-token persistence,
  one coordinated refresh, one retry, no refresh on authorization denial.
- Related user-flow guides: `user-authentication`, `admin-user-management`.

## Acceptance criteria

- AC-1 — A web protected request returning a typed
  `authentication_required` error refreshes the session and retries once with
  the new access token, including dictionary API errors and compatibility 403.
- AC-2 — Admin GET and mutation requests do the same through the existing
  admin refresh coordinator.
- AC-3 — Genuine 403 errors such as `forbidden`, `admin_access_denied`, and
  `recent_authentication_required` are not refreshed or retried.
- AC-4 — Concurrent expired-token requests continue to coordinate one refresh;
  failed refresh does not loop or persist access tokens.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add failing regression coverage at the shared/web/admin seams.
- [x] Implement the bounded shared classification and client integrations.
- [x] Run targeted and affected workspace validation.
- [x] Update and validate affected user-flow documentation and mapped coverage.
- [x] Verify web and admin runtime behavior with disposable local infrastructure.
- [x] Perform security-focused final diff review and record results.

## Verification

| Check                    | Result                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | Browser-auth 2 files/7 tests, web 32 files/238 tests, admin 4 files/23 tests passed; focused pre-fix web and admin regressions failed for the reported reason |
| Lint/typecheck/build     | Browser-auth, web, and admin lint/typecheck/build passed                                                                                                      |
| Runtime/browser/database | Managed Chrome against disposable PostgreSQL/Redis verified real 60-second token expiry and successful refresh/retry in web and admin with no browser errors  |
| Documentation/user-flow  | All 14 guides validated; `user-authentication` and `admin-user-management` mappings and revision markers passed                                               |

## Outcome and evidence

- Changes made: added a shared typed authentication-failure predicate; made
  dictionary API errors participate in the browser-auth error hierarchy; wired
  web and all admin protected-request paths to refresh for status 401 or the
  stable `authentication_required` code, then retry exactly once. Permission
  and recent-authentication 403 responses remain terminal.
- Commands and results: pre-fix `auth-session-refresh.test.tsx` and the admin
  compatibility-403 case failed because the original error escaped. The final
  browser-auth, web, and admin suites and all affected lint/typecheck/build
  commands passed. `git diff --check` passed. Two stale browser-auth fixtures
  were updated with the already-required nullable `handle` field exposed by the
  affected package typecheck.
- Runtime evidence: project-managed Chrome used a synthetic verified owner and
  backend `AUTH_ACCESS_TOKEN_TTL=60s`. Web observed dictionary request `401`,
  `/auth/refresh` `200`, retry `200`. Admin observed concurrent `/admin/users`
  and `/admin/me` `401` responses, exactly one `/admin/auth/refresh` `200`, then
  successful `200` retries. No browser errors occurred. Disposable containers,
  services, browser session, and `.next-refresh-browser` output were removed.
- Documentation: guides now state idle access-token retry and distinguish it
  from genuine authorization/recent-authentication denial. Traceability checks
  and markers pass. Existing mapped E2E scenarios were semantically reviewed
  but not rerun because they exercise reload bootstrap rather than idle expiry;
  focused regression tests plus the real shortened-TTL browser journeys cover
  the changed path directly.
- Review: security-focused author review at base `20fbb2f` plus the final patch
  found no material finding. The predicate requires a typed `BrowserApiError`;
  compatibility 403 refresh is restricted to `authentication_required`, so
  `forbidden`, `admin_access_denied`, and
  `recent_authentication_required` cannot trigger credential rotation or
  mutation replay. Refresh remains coordinated, access tokens remain memory-only,
  and retries remain bounded to one. No backend policy, cookie, token lifetime,
  or authorization decision changed. Independent subagent review was not run
  because this environment's active delegation policy disallows it without an
  explicit user request; focused security tests and runtime evidence cover the
  material boundary.

## Remaining risks

- The reported production 403 payload was not captured. Compatibility handling
  deliberately requires the stable `authentication_required` code, so any
  differently coded production 403 remains visible rather than being retried
  unsafely.
