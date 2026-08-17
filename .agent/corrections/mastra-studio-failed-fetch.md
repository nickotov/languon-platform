# Correction: Mastra Studio failed fetch

Status: Complete
Created: 2026-08-17
Updated: 2026-08-17

## Routing decision

- Intended outcome: `pnpm dev:mastra` serves a working Studio that discovers
  its API from the browser's loopback page origin instead of failing when
  `localhost` and `127.0.0.1` differ.
- Why this is a correction: this restores the documented local Studio journey
  through existing Mastra configuration. It adds no endpoint, public contract,
  dependency, persistent concept, or product behavior.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true. The fix preserves the IPv4 loopback bind, CORS-disabled server,
  and existing Host/Origin policy.
- Escalation rule: feature development would be required before weakening
  authority validation, binding non-loopback interfaces, or exposing new
  routes; none was needed.

## Context and scope

- Current behavior: Studio opened through `http://localhost:4111` rendered
  “Failed to load studio” even though `/api` was reachable. A clean
  `127.0.0.1` session worked.
- Expected behavior: Studio derives its API from the browser page origin, so
  both documented IPv4 loopback and a working `localhost` alias remain
  same-origin without enabling CORS.
- In scope: local harness environment policy, focused orchestration/policy
  regressions, real Studio bootstrap/browser verification, and existing guide.
- Out of scope: provider behavior, public Hono routes, database lifecycle,
  production deployment, non-loopback binding, and broader Mastra API exposure.
- Relevant ADRs or constraints: no accepted ADR governs this development-only
  Studio transport; loopback Host/Origin restrictions remain authoritative.
- Related user-flow guide: `mastra-agent-development-harness`.

## Plan

- [x] Reproduce and minimize the failed browser request.
- [x] Add the smallest reliable regression coverage.
- [x] Implement the bounded same-origin correction.
- [x] Run focused tests and real-browser verification.
- [x] Synchronize affected user-flow documentation.
- [x] Inspect the final diff and record results.

## Verification

| Check                    | Result                                                |
| ------------------------ | ----------------------------------------------------- |
| Tests                    | 3 orchestration and 17 policy tests passed            |
| Lint/typecheck/build     | Lint and backend typecheck passed; build not required |
| Runtime/browser/database | Studio/browser passed; database behavior unaffected   |
| Documentation/user-flow  | Guide and mapping checks passed                       |

## Outcome and evidence

- Root cause: Mastra generated Studio with API host `127.0.0.1`, while the page
  could be opened as `localhost`. Browsers treat those as different origins,
  and the intentionally CORS-disabled server caused Studio's fetch failure.
  Separately, some browsers resolve `localhost` only to unbound IPv6 `::1`, so
  `127.0.0.1` remains the reliable canonical URL.
- Changes made:
    - Force `MASTRA_AUTO_DETECT_URL=true` in the harness child environment and
      again after Mastra CLI `.env.local` loading.
    - Retain `host: 127.0.0.1`, `cors: false`, and exact loopback authority
      checks.
    - Document canonical `127.0.0.1`, compatible IPv4 `localhost`, restart, and
      stale Studio configuration recovery.
    - Synchronize the guide revision marker to
      `sha256:16e725e744722d75` after reviewing the mapped E2E file.
- Commands and results:
    - `node --test scripts/dev-mastra.test.mjs`: 3/3 passed and asserted every
      child receives the forced auto-detect value.
    - Focused backend policy test: 17/17 passed and asserted CLI-loaded false is
      overwritten to true.
    - Backend typecheck and repository lint: passed.
    - Guide mapping and documentation validators: passed for all 3 guides.
    - Final `pnpm dev:mastra`: startup passed; HTML requested with
      `Host/Origin: localhost:4111` contained
      `window.MASTRA_AUTO_DETECT_URL = 'true'`.
    - Project-pinned `agent-browser` 0.33.0 at canonical IPv4 loopback loaded
      Agents, reported no browser errors, and every local discovery request
      returned HTTP 200.
- Mapped E2E: not rerun because its scenario covers disposable PostgreSQL
  provision/persistence/reset and is unaffected by browser-origin selection;
  the marker and guide validators passed after whole-file review.
- Review: final diff is bounded to orchestration/policy configuration, focused
  tests, guide synchronization, and this correction record. No generated
  output, credential, endpoint exposure, or unrelated change remains.

## Remaining risks

- On systems where `localhost` resolves only to IPv6 `::1`, it cannot reach the
  intentionally IPv4-only listener. Use canonical `http://127.0.0.1:4111`.
