# Correction: Authentication Capability Retry

Status: Complete
Created: 2026-08-14
Updated: 2026-08-14

## Routing decision

- Intended outcome: Make the existing login/signup journey recover visibly when
  authentication capabilities cannot be loaded, while establishing and
  documenting the local service prerequisite needed for authentication.
- Why this is a correction: This adjusts the existing authentication screen's
  failure/retry presentation and local startup diagnosis without changing auth
  contracts, policy, persistence, dependencies, or product capabilities.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing if diagnosis
  requires an auth contract/policy change, schema migration, new service, or new
  journey.

## Context and scope

- Current behavior: When `/auth/capabilities` is unreachable, login displays
  "Authentication options are temporarily unavailable", hides the signup link,
  and leaves the same error visible while Retry is running. Login submissions
  fail with the corresponding service-unavailable message.
- Expected behavior: The local authentication stack is reachable; while a
  capability retry is in flight the UI visibly returns to its checking state;
  login retains the signup navigation unless the backend explicitly reports
  signup disabled.
- In scope: Capability retry state, login signup-link gating, focused component
  tests, local stack/runtime diagnosis, and affected user-flow troubleshooting.
- Out of scope: Authentication contracts/policy, database schema, credential
  semantics, new auth methods, or production deployment behavior.
- Likely files/surfaces: auth provider, capability/login UI, web component tests,
  and the existing authentication user-flow guide if troubleshooting changes.
- Relevant ADRs or constraints: Accepted ADR-0001 remains unchanged; fake local
  credentials only, exact origins, HTTP-only refresh cookie, and development
  code `0000` remain authoritative.
- Related user-flow guides: `docs/user-flows/user-authentication.md`.

## Plan

- [x] Reproduce and identify the service and UI failure paths.
- [x] Implement the bounded retry/signup-link correction.
- [x] Add the smallest reliable regression coverage.
- [x] Run targeted web tests, user-flow traceability, and real-browser checks.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                                  |
| ------------------------ | ------------------------------------------------------- |
| Tests                    | Passed: 36 web tests                                    |
| Lint/typecheck/build     | Web lint and typecheck passed; build not required       |
| Runtime/browser/database | Passed: migration, CORS, signup/verify/logout/login     |
| Documentation/user-flow  | Existing guide current; both traceability checks passed |

## Outcome and evidence

- Changes made: Corrected ignored `.env.local` from the stale allowed origin
  `http://localhost:3000` to the current web origin `http://localhost:3333`;
  Retry now clears the stale error while capability loading is in flight; login
  keeps Create an account discoverable unless the backend explicitly reports
  signup disabled; added a component regression for both UI behaviors.
- Commands and results: `pnpm db:migrate` passed; capability GET returned 200
  with `Access-Control-Allow-Origin: http://localhost:3333`; refresh preflight
  returned 204; `pnpm --filter @languon/web test` passed 36 tests; web lint and
  typecheck passed; `pnpm user-flow:e2e -- check user-authentication` and
  `pnpm docs:user-flows:check` passed.
- Runtime evidence: With agent-browser, reproduced the unavailable state,
  confirmed the signup link remained available, clicked Retry after backend
  reload, and observed capability recovery. Created a unique fake local account,
  verified it with development code `0000`, reached the authenticated home and
  security pages, signed out, and successfully signed in with its password. No
  page errors were reported; the isolated browser session was closed.
- Documentation: No tracked guide change. The existing authentication guide
  already specifies port 3333, exact `AUTH_ALLOWED_ORIGINS`, backend startup,
  capability probes, and troubleshooting; its mappings remain synchronized.
- Review: Final diff is bounded to retry/signup presentation, its regression,
  and this correction record. Accepted ADR-0001, contracts, persistence, and
  auth policy are unchanged. Existing generated `next-env.d.ts` user changes
  were preserved.

## Remaining risks

- Local authentication requires the backend, PostgreSQL, and Redis processes.
  They are healthy for the verified local session; after future environment
  edits, restart `pnpm dev:backend` so it reloads `.env.local`.
