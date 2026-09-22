# ExecPlan: Web dev command panel

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-22

## Goal

Provide a safe, dependency-free local browser dashboard for reviewed Languon
development commands, with parallel independent control, isolated logs, and
race-free shared state across every open tab.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- Root `package.json` and `README.md` are the canonical package-script and human
  command indexes. Workspaces live under `apps/*` and `packages/*`; this feature
  adds the explicitly documented top-level `web-dev-panel` workspace.
- Existing local tooling uses Node entrypoints, fixed repository roots,
  `child_process.spawn`, explicit signal cleanup, loopback-only addresses, and
  strict wrapper-owned IDs. `scripts/dev-mastra.mjs` and
  `scripts/agent-browser.mjs` are relevant lifecycle and local-boundary analogues.
- User-flow guides resolve only reviewed E2E command IDs from
  `scripts/check-user-flow-guides.mjs`; documentation shell blocks are untrusted
  and are never mechanically executed.
- Repository skills live under `.agents/skills/<name>` with exact two-field
  frontmatter, generated UI metadata, repository validation, and explicit-only
  policy for destructive or intentionally user-controlled workflows.
- `design/DESIGN_SYSTEM.md` and `design/main.pen` are the visual authority. The
  panel is a developer-tooling variant using native controls and shared semantic
  tokens, not an application FSD slice.
- Accepted ADRs currently end at ADR-0010 on `main`; ADR-0011 and ADR-0012 are
  already reserved on the preserved dictionary feature branch, so this feature
  uses ADR-0013.

## Acceptance criteria

- [x] AC-1 — Fixed loopback singleton server.
- [x] AC-2 — Complete reviewed root-script catalog with drift blocking.
- [x] AC-3 — Parallel atomic batch starts with conflict reporting.
- [x] AC-4 — Independent and global lifecycle control with descendant cleanup.
- [x] AC-5 — Bounded ephemeral isolated logs and safe agent metadata.
- [x] AC-6 — Race-free synchronized state across tabs and reconnects.
- [x] AC-7 — Hardened HTTP and process-execution boundary.
- [x] AC-8 — Explicit updater skill reconciles package/docs sources safely.
- [x] AC-9 — Design, docs, E2E, browser evidence, and reviews are complete.

## Test strategy

- Unit: Required — catalog validation/digests, request schemas, log sanitation
  and redaction, Codex JSONL projection, conflicts, and lifecycle state machine.
- Integration: Required — real native HTTP/SSE server, session/origin/host
  boundary, process spawning, parallel runs, cancellation, reconnect snapshot,
  drift reload, and shutdown cleanup against synthetic Node fixtures.
- Contract: Required — `commands.json`, HTTP response/event shapes, root-script
  completeness, and user-flow command registry.
- E2E: Required — Playwright starts a fixture-backed real panel and exercises
  parallel per-command control plus two tabs sharing one server state.
- Browser/device: Required — project wrapper verifies expanded and compact
  rendering, semantics, keyboard focus, reconnect/failure messaging, console,
  and network activity against synthetic commands.
- Database migration: Not required — no database or cache behavior changes.
- User-flow guide: Required — `docs/user-flows/web-dev-panel.md` documents
  startup, browser/CLI/system checks, failures, troubleshooting, and cleanup.
- User-flow E2E: Required — scenarios
  `parallel-command-control-and-isolated-logs` and
  `cross-tab-single-source-of-truth` in
  `web-dev-panel/test/e2e/panel.spec.mjs`, executed by registered command
  `web-dev-panel-playwright` / `pnpm test:e2e:web-dev-panel`.
- Security: Required — independent threat-focused review of command injection,
  CSRF, DNS rebinding, XSS/log injection, source drift, secrets, races, and
  process ownership.

## Milestones

- [x] M1 — Exploration and decision capture
    - Objective: establish feature scope, security boundary, command policy,
      source authority, testing layers, and preserved-branch strategy.
    - Components: repository instructions, root scripts, analogous wrappers,
      design source, user-flow system, Codex CLI capabilities.
    - Acceptance criteria: specification readiness for AC-1 through AC-9.
    - Required tests: source inspection only.
    - Evidence: user resolved command scope, concurrency, log lifetime,
      dependency exception, agent scope, and batch failure behavior; feature
      artifacts created on `feature/web-dev-panel` from `main`.
- [x] M2 — Runtime, catalog, and synchronized UI
    - Objective: implement the checked catalog, deep process manager, hardened
      HTTP/SSE server, static UI, and unit/integration tests.
    - Components: `web-dev-panel/**`, workspace/root command integration.
    - Acceptance criteria: AC-1 through AC-7.
    - Required tests: focused unit, integration, catalog contract, and lint.
    - Evidence: 21 focused Node tests and 2 Playwright journeys pass; catalog,
      panel lint, browser acceptance, and singleton checks pass.
- [x] M3 — Skill, design, ADR, docs, and E2E
    - Objective: add the explicit updater workflow and synchronize all durable
      developer, design, architectural, and user-flow sources.
    - Components: local skill, ADR-0013, design source, README/agent docs,
      user-flow guide and mapped Playwright test.
    - Acceptance criteria: AC-8 and documentation portion of AC-9.
    - Required tests: skill validators/forward test, guide inspection/check,
      Playwright E2E, formatting.
    - Evidence: skill, ADR, docs, design-system contract, user-flow mapping, and
      live Pencil canvas frame are implemented. Repository persistence of the
      Pencil frame is blocked on saving the open Pen document.
- [x] M4 — Real-app validation, independent review, remediation, and merge
    - Objective: verify the running panel, complete independent tester,
      implementation, and security passes, remediate findings, and satisfy the
      repository Definition of Done.
    - Components: all feature surfaces and durable evidence.
    - Acceptance criteria: AC-1 through AC-9.
    - Required tests: browser verification, affected/full gates, repeated review
      where remediation is material, post-squash checks.
    - Evidence: pending.

## Progress

- 2026-08-22 — Preserved clean `feature/dictionary-platform` at four commits
  ahead of main, switched to `main`, created `feature/web-dev-panel`, and
  scaffolded feature artifacts. Completed repository/skill/design exploration.
  Next: implement the runtime seam and focused tests.
- 2026-08-22 — Implemented the native panel, reviewed 54-command catalog,
  explicit updater skill, hardened launch/session boundary, synchronized UI,
  bounded logs, docs, ADR, user-flow E2E, and browser acceptance. Independent
  tester and security passes are clean after remediation. Full `pnpm check`
  passes after regenerating stale Next route output. The user saved the live
  Pencil frame to `design/main.pen`; final independent review approved the
  persisted design with no material findings.

## Decisions

- D1 — Native HTTP plus SSE, not WebSocket or PTY
    - Context: the browser sends only control requests while logs and state flow
      one way; Node has no native PTY server.
    - Choice and rationale: use ordinary POST requests and SSE with static native
      UI. This minimizes protocol and dependency surface.
    - Alternatives rejected: generic WebSocket terminal, `node-pty`, React, and
      framework servers.
    - ADR impact: Accepted ADR-0013.
- D2 — Reviewed catalog with source revision enforcement
    - Context: package scripts and documentation can change independently of
      descriptions and safety classification.
    - Choice and rationale: account for all root scripts, enable only checked
      static commands, hash their source, synthesize disabled drift entries, and
      revalidate before every spawn.
    - Alternatives rejected: arbitrary shell input, automatic enablement, and a
      fully dynamic package-script launcher.
    - ADR impact: Accepted ADR-0013.
- D3 — Server-only process truth
    - Context: multiple tabs can race and browser state cannot own OS children.
    - Choice and rationale: one fixed-port server owns atomic command state,
      run IDs, logs, and event sequence; tabs keep only checkbox presentation
      state.
    - Alternatives rejected: localStorage coordination, per-tab workers, and
      best-effort duplicate detection.
    - ADR impact: Accepted ADR-0013.
- D4 — Zero runtime dependencies with closed native validation
    - Context: repository policy normally requires Zod, while the user requires
      a native dependency-free isolated tool.
    - Choice and rationale: user approved a narrow exception; accept only exact
      closed request/catalog shapes and test them exhaustively.
    - Alternatives rejected: Zod as the sole runtime dependency and permissive
      manual parsing.
    - ADR impact: Accepted ADR-0013.
- D5 — Ephemeral latest-run logs and conservative agent metadata
    - Context: logs can contain secrets or personal prompts and Codex does not
      reliably emit a skill-activation event.
    - Choice and rationale: keep one bounded in-memory run per command, redact
      known secret values, project only safe JSONL activity fields, and label
      skill usage as not reported.
    - Alternatives rejected: file persistence, tailing Codex private sessions,
      parsing prose, and monitoring external terminals.
    - ADR impact: feature-local consequence of ADR-0013.

## Discoveries

- The root `agent` command launches `headroom wrap codex`, which requires an
  interactive TTY and cannot be safely driven by a dependency-free HTTP child
  process. It remains visible but disabled.
- The installed Codex CLI supports `codex exec --json`, but the official docs
  search endpoint was unavailable during exploration. The adapter must be
  fixture-driven, tolerate unknown events, and expose no field not confirmed by
  emitted JSONL.
- A fixed root package hash would self-invalidate when panel scripts are added;
  source revisions must be per script name/value and per exact documented
  command instead.

## Validation

| Check              | Status         | Evidence                                              |
| ------------------ | -------------- | ----------------------------------------------------- |
| Unit               | Passed         | `pnpm test:web-dev-panel` — 21/21                     |
| Integration        | Passed         | Native HTTP/SSE and real child fixtures               |
| Contract           | Passed         | 54 catalog entries; docs/skill/user-flow checks       |
| E2E                | Passed         | `pnpm test:e2e:web-dev-panel` — 2/2                   |
| Browser/device     | Passed         | agent-browser 0.33.0; desktop and 390×844             |
| Typecheck          | Not applicable | Native JavaScript runtime; syntax/lint/tests cover it |
| Lint               | Passed         | Panel and repository lint                             |
| Build              | Passed         | `pnpm check`                                          |
| Database migration | Not applicable | No persistence changes                                |
| User-flow guide    | Passed         | `docs/user-flows/web-dev-panel.md`                    |
| User-flow E2E      | Passed         | revision `sha256:69621e426da34ad2`                    |
| Independent review | Passed         | Final implementation and persisted design approved    |
| Security review    | Passed         | No material findings remain                           |

## Remaining work

- None.
