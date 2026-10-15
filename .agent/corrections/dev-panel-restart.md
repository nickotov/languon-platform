# Correction: Restart the local dev panel

Status: Complete
Created: 2026-10-14
Updated: 2026-10-14

## Routing decision

- Outcome: rerunning `pnpm dev:panel` gracefully replaces this checkout's panel.
- Bounded correction to the existing local launcher; no HTTP routes, catalog,
  runtime packages, production infrastructure or security policy changes.
- All correction conditions hold. Escalate if a new product/trust boundary is needed.

## Context and scope

- Current behavior: `src/main.mjs` receives EADDRINUSE and exits 1.
- Expected behavior: the development launcher verifies the existing listener's
  user, exact entrypoint and checkout directory, sends SIGTERM, waits for exit,
  then starts the existing production entrypoint on the same fixed port.
- ADR-0014 inherits ADR-0013: retain fixed loopback binding, EADDRINUSE failure
  in the entrypoint, bounded owned-tree shutdown, and memory-only logs.
- Scope: launcher, regression tests, panel README and web-dev-panel guide.
- Exclusions: force killing, stopping unrelated processes, HTTP/session changes.
- macOS/Linux use native `ps` and `lsof`; absent tools fail closed for restart.
- Related guide: `docs/user-flows/web-dev-panel.md`. No backlog task applies.

## Acceptance criteria

- AC-1: a second development launch gracefully stops the verified panel and
  starts one replacement; owned commands stop and a new launch URL is printed.
- AC-2: unrelated/other-checkout listeners are never signalled; failed inspection
  or shutdown fails clearly, with no fallback port or forced termination.

## Plan

- [x] Implement launcher and focused synthetic-process regression tests.
- [x] Run panel tests/lint, catalog and documentation checks and mapped browser tests.
- [x] Independently review process ownership/races and inspect the final diff.

## Verification

- Native integration tests cover actual listener replacement, refusal, shutdown
  and bounded failure; mocks cover inspection edge cases.
- Mapped Playwright fixtures cover unchanged browser/session/control behavior.
- No database/build/typecheck needed: native JS-only launcher; no product UI edits.

## Outcome and evidence

- Implemented `src/dev.mjs` as the terminal-only restart launcher, preserving
  `src/main.mjs` fixed-port startup. Main runs as a child with forwarded
  SIGINT/SIGTERM, preserving its graceful owned-process shutdown.
- AC-1/AC-2: `pnpm test:web-dev-panel` passed 66/66 on Node v24.8.0/macOS,
  with local socket/process permission. Nine restart tests include real native
  inspection, graceful synthetic listener exit, replacement on the same port,
  other-checkout refusal, changed identity, missing tools and timeout. Five
  launcher tests cover await-before-spawn, refusal, signals, exit propagation
  and the mocked Windows fallback.
- Browser regression: `pnpm test:e2e:web-dev-panel` passed all four mapped
  Chromium fixture journeys; fixtures cleaned up. CLI-only changes require no
  new visual check. No real application services or shared data started/stopped.
- `pnpm --filter @languon/web-dev-panel lint`, scoped `pnpm exec prettier
--check`, `pnpm docs:user-flows:check` (21 guides), `pnpm user-flow:e2e --
check web-dev-panel`, and `git diff --check` passed.
- `pnpm web-dev-panel:check` reports existing root catalog drift: changed
  `check`/`test` and seven unreviewed scripts. Root package/catalog are unchanged
  by this correction. Do not refresh unrelated safety approvals to hide it.
- Updated panel README and guide CLI/restart/session troubleshooting. Reviewed
  all four mapped browser tests; assertions remain applicable. Revision is
  `sha256:9a072f7ad1102d8d`. Verification date remains the prior full-guide date;
  real service setup was not re-executed.
- Tested uncommitted patch based on `69ea1b816223d80e6974be1f11e21a8aaa61208b`.
  SHA-256: dev launcher `75eef1c4a4f293c15c685bfb733649d21a04d63b9fd9171a76c49f58aa8ab3ee`;
  restart `2e3995a3fb90f5b50975ea09e9944f96ccd3790296ab3eb69ad26e586f3daadb`;
  restart tests `940e58c30dbd59f9cae400900112bed6e3a44c8753e347ed64d1a76d0e866381`.
  Dev tests: `22a5d6e982f805f05f224196c5778a1eba7f81fe15ab75bfaa6d355bfcf8c32f`.
  Later changes to this evidence prose do not invalidate runtime checks.
- Initial restricted runtime attempt could not listen; rerun with local process
  permission passed. No legitimate tests weakened or skipped.
- Author preflight: scope, ADR fixed-port/owned-process boundary, fake test data,
  documentation mapping and final diff checked; no secrets or artifacts added.
- Independent reviewer `/root/restart_review` initially found CR-1 (Medium):
  new tests used host getuid/native lsof without Windows guards. Fixed via UID
  injection and skipping only the unsupported native case on Windows. Added
  focused launcher coverage. Remediation review confirmed CR-1 resolved and
  no remaining material findings against the final hashes. No material
  authentication/authorization/HTTP/data-policy changes require security review.
- Rollback: restore workspace dev script to `node src/main.mjs`, remove the
  launcher/restart modules and tests, and restore guide/README wording. No
  persistent state, migration, dependency or catalog changes to undo.

## Remaining risks

- Windows OS execution was not performed; fallback covered by platform injection.
- Existing catalog drift remains outside this correction; no new drift introduced.
- A restart loses in-memory run/log state and invalidates existing browser sessions.
- Process inspection and signalling are not atomic OS operations; verify identity
  immediately before SIGTERM and never escalate to SIGKILL.
