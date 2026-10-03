# Correction: Local app duplicate development stack

Status: Complete
Created: 2026-10-02
Updated: 2026-10-02

## Routing decision

Restore established local startup by stopping a verified obsolete Languon
development stack. This is an environment-only correction, not a new process
ownership policy or feature. No application code, public contracts, data,
dependencies, security boundaries, or deployment behavior change.

## Context and scope

The first reported failure is Vite's occupied admin port 3001. Subsequent
backend and dictionary worker exits are supervised shutdown consequences.
Read-only inspection found the admin listener PID 40529, started October 1,
with this repository's Vite command and working directory. Its ancestor
PID 40351 is an orphaned `pnpm exec turbo run dev` launcher, parent PID 1,
with repository cwd. The same tree owns web port 3333 and backend port 4000.
The current dev panel PID 3174 started October 2 and does not own this tree.

ADR-0014 inherits ADR-0013's panel-owned-process boundary: the panel must not
automatically adopt or kill externally started listeners. Existing guide
`docs/user-flows/web-dev-panel.md` already says external processes must be
stopped separately. No guide or behavior change is needed.

In scope: graceful termination of the verified obsolete app tree and scoped
startup verification. Preserve the panel, PostgreSQL, Redis, and stored data.
Do not kill unrelated listeners, change canonical ports, or modify the
flashcard feature flag as part of this repair.

## Acceptance criteria

- AC-1 — Old app listeners are released without stopping infrastructure or panel.
- AC-2 — The existing whole-app startup reaches application readiness.
- AC-3 — Verification-owned app processes are stopped so the user can start
  the stack through their existing panel.

## Plan

- [x] Inspect Git state, runner, tests, panel lifecycle, relevant ADRs and guide.
- [x] Confirm the collision and process ancestry without reading secrets.
- [x] Stop the exact verified old app tree gracefully.
- [x] Verify whole-app startup and clean up verification-owned app processes.
- [x] Record final evidence and inspect Git state.

## Verification

No automated regression is needed for an unchanged implementation: available
ports are an existing prerequisite, and external ownership is intentionally
outside the panel contract. Real startup is the relevant verification layer.
No browser rendering, schema, or dependency changes warrant additional tests.

## Outcome evidence

Base commit: bb2d065; application source and command configuration unchanged.

- Verified process commands, cwd, and ancestry using `ps` and `lsof`, then
  sent SIGTERM only to obsolete launcher 40351 and Turbo supervisor 40418.
  All three app ports were released; panel PID 3174 remained listening.
- Ran `pnpm dev:all` with the existing local configuration. Infrastructure,
  dependency builds, and migrations succeeded; application listeners opened
  on 3001, 3333, and 4000. Dictionary worker processes were also present, and
  its shutdown output reported graceful stop after SIGINT.
- Readiness checks using `curl` returned HTTP 200 for admin `/`, web `/`, and
  backend `/health`. This proves startup, not a full authenticated journey.
- Sent Ctrl-C to the verification-owned PTY. Exit 130 was expected cancellation.
  Final `lsof` check confirms all three app ports are free and the existing
  panel still listens on 4400. Compose reports PostgreSQL and Redis healthy;
  no container or stored data was removed.
- No product source changes or new tests were necessary. Existing guide
  explicitly covers separate termination of external app processes. The
  user can now start the application through the retained dev panel.

## Review and remaining risks

Independent review not required for the environment-only correction. No
automatic external-process cleanup is introduced. A separately launched app
stack can occupy the ports again; use one launcher at a time.
