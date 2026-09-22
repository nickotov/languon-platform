# Verification evidence: Web dev command panel

Updated: 2026-08-22

## Automated tests

### Unit

- Command: `pnpm test:web-dev-panel`
- Result: Passed, 21/21 on macOS with approved loopback access.
- Coverage: catalog validation/reconciliation, source containment, checked pnpm
  argv, Windows fail-closed policy, request shapes, streaming redaction, bounded
  logs, Codex projection, atomic runs, stale stop IDs, startup/shutdown races,
  POSIX inherited-pipe descendant cleanup, production bulk-selection
  compatibility, and native HTTP/SSE security behavior.

### Integration and contract

- Commands: `pnpm web-dev-panel:check`, `pnpm agent-skills:check`, panel lint,
  and the focused Node suite.
- Result: Passed; 54 reviewed root commands and 15 repository skills validated.
- Behavior: source drift blocks execution, changed/new scripts fail closed,
  meaningful descriptions are required, launch authorization strips the token,
  Host/Origin/session/body controls reject invalid requests, and one server owns
  synchronized run/log state.

### E2E

- Command: `pnpm test:e2e:web-dev-panel`
- Result: Passed, 2/2 Playwright tests.
- Journeys: parallel command control with isolated logs and cross-tab
  single-source-of-truth behavior, including a newly opened tab during a run.

## Real application verification

- Environment: macOS, Chromium through pinned `agent-browser` 0.33.0, and the
  deterministic fixture panel on `127.0.0.1:4411`.
- Scenario: private launch redirect, semantic snapshot, select-all-compatible
  batch start, status/log inspection, and compact viewport at 390×844.
- Result: controls remained labeled and reachable; three fixtures completed
  independently; console/errors were empty; every observed request stayed on
  the fixture origin with successful statuses.
- Production CLI: `pnpm dev:panel` printed a private URL at the fixed origin and
  a concurrent second start failed with `EADDRINUSE` semantics.
- Artifacts: no screenshot was needed; the task-scoped browser and fixture were
  closed after verification.

## User-flow guide verification

- Guide: `docs/user-flows/web-dev-panel.md` and the guide index.
- `pnpm docs:user-flows:check`: Passed, 7 guides validated.
- `pnpm user-flow:e2e -- check web-dev-panel`: Passed at revision
  `sha256:69621e426da34ad2`.
- Scenarios: `parallel-command-control-and-isolated-logs` and
  `cross-tab-single-source-of-truth` in
  `web-dev-panel/test/e2e/panel.spec.mjs`.
- Cleanup: fixture server/browser closed; ignored Playwright results removed.

## Static checks

- Format: `pnpm format:check` passed.
- Lint: focused panel lint and repository lint passed.
- Typecheck/build/test: full `pnpm check` passed after the normal web build
  regenerated stale `.next` route validators left by another branch.
- Database: Not applicable; no persistence or cache was touched.

## Review

- Tester: final independent pass; 21 Node tests, 2 Playwright journeys, catalog,
  lint, guide, and skill checks passed.
- Reviewer: approved; all runtime findings and the design-persistence finding
  are resolved.
- Security: no material findings remain after Windows execution was made
  fail-closed pending Job Object supervision.
- Remediated: session minting, cross-chunk secrets, Codex content, browser log
  growth, SSE buffering, stale stops, process cleanup, startup/shutdown race,
  updater trust windows, descriptions, Expo LAN policy, Windows pnpm spawning,
  and conflicting bulk selection.

## Remaining risks

- The `Developer Tooling / Web Dev Command Panel · Reviewed` frame is persisted
  in `design/main.pen`; a fresh Pencil render shows no visible clipping.
- Windows command execution is intentionally unavailable until reliable native
  Job Object ownership exists. Catalog inspection remains supported.
