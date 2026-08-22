# Web dev command panel

Status: Complete
Owner: Engineering
Created: 2026-08-22

## Problem

Languon has many reviewed development commands, but developers must remember
their names, purposes, compatibility, and terminal ownership. There is no local
browser surface that can start safe commands, keep their logs separate, or
synchronize command state across multiple open tabs. A generic browser shell
would create an unacceptable local command-execution boundary.

## Desired behavior

Running `pnpm dev:panel` starts one loopback-only native Node.js server at
`http://127.0.0.1:4400` and prints an unguessable private launch URL that
authorizes the browser session. Its plain HTML/CSS/JavaScript UI inventories every root
package script with a title and description, enables only reviewed click-safe
commands, runs selected compatible commands concurrently, and exposes
independent Start/Stop controls and per-command logs. The server is the only
source of truth for catalog, process, and log state, so every browser tab sees
the same run and a duplicate start cannot race through.

A repository-scoped `$web-dev-panel` skill creates or reconciles the panel,
reviews root script changes and explicitly mentioned documentation commands,
and keeps catalog metadata, safety classification, tests, and documentation in
sync. Changed or unclassified commands remain disabled until that review.

## Acceptance criteria

- [x] AC-1 — `pnpm dev:panel` serves the dependency-free panel only on
      `127.0.0.1:4400`, requires its terminal-printed private launch URL to mint
      a browser session, and prevents a second server instance from creating
      another source of truth.
- [x] AC-2 — Every root `package.json` script appears with a stable ID, title,
      description, source revision, and enabled or disabled reason. The server
      refuses missing, changed, unreviewed, interactive, parameterized,
      destructive, remote, or otherwise unsafe commands.
- [x] AC-3 — A developer can select one, several, or all currently runnable
      commands and start compatible selections concurrently. Invalid batches
      start nothing and report every conflict or stale selection.
- [x] AC-4 — Each command can be started or stopped independently, Stop All is
      explicit, duplicate starts are rejected server-side, and owned child
      processes and descendants are cleaned up on stop or normal server exit.
- [x] AC-5 — The current or latest run for every command exposes bounded,
      separated stdout/stderr logs, lifecycle timestamps, exit result, and safe
      structured agent activity when available. Logs are memory-only, redact
      known sensitive environment values, and never render as HTML.
- [x] AC-6 — Two tabs share server-authoritative state and logs. A start from one
      tab immediately disables Start in the other; a racing duplicate fails; a
      stop from either tab and a newly connected tab observe the same run state.
- [x] AC-7 — The HTTP boundary enforces exact Host/session checks, exact Origin
      on controls, same-origin browser metadata on SSE, no CORS, strict response
      security headers, bounded requests, closed request shapes, fixed working
      directories, and checked argv execution without an arbitrary shell or
      browser-provided arguments.
- [x] AC-8 — `$web-dev-panel` is explicit-only, can create the missing feature or
      reconcile an existing panel, reads only the root manifest plus explicitly
      named docs, never executes documentation during discovery, and leaves
      unsafe candidates disabled with reasons.
- [x] AC-9 — The design source, developer documentation, user-flow guide,
      Playwright journeys, automated tests, browser evidence, independent
      implementation review, and security review agree with the delivered
      behavior.

## Scope

### In scope

- A new `web-dev-panel/` pnpm workspace using Node.js HTTP/SSE and native browser
  HTML/CSS/JavaScript with no runtime dependencies.
- A versioned reviewed command catalog sourced from the root `package.json` and
  optional explicitly named documentation commands.
- Parallel batch execution, independent process controls, latest-run logs,
  multi-tab synchronization, source drift detection, and safe Codex JSONL
  activity summaries.
- Repository-scoped updater skill, accepted local security ADR, design story,
  developer docs, user-flow guide, and proportional automated/browser evidence.

### Out of scope

- A generic shell, arbitrary command/argument entry, stdin, PTY emulation, or a
  browser replacement for the interactive Codex TUI.
- Monitoring agents or processes launched outside this panel.
- Persisting logs across server restarts or storing prompts, reasoning, or agent
  message content.
- Production deployment, LAN binding, authentication changes, database schema,
  or changes to product web/admin/mobile runtime applications.

## Constraints and risks

- Browser input is untrusted even on loopback; the server must resolve only
  checked catalog IDs and revalidate their source revision immediately before
  every start.
- The user approved a narrow exception to the repository Zod rule for this
  isolated zero-runtime-dependency tool. Boundary validators must therefore use
  closed, exact native validation with exhaustive tests and no extensible input
  fields.
- Interactive commands such as `pnpm agent`, operational commands, and commands
  requiring parameters stay visible but disabled.
- Plain command output can contain accidental sensitive values. Exact inherited
  secret values are redacted before buffering, logs are bounded and ephemeral,
  and structured agent output drops raw content fields.
- POSIX process-group cleanup is verified. Native Node cannot guarantee Windows
  descendant ownership after a leader exits without Job Objects, so execution
  fails closed there while catalog inspection remains available.

## User-flow documentation

- Guide: `docs/user-flows/web-dev-panel.md`.
- Surfaces: browser, CLI, and system.
- Related guides: none; the new panel adds root commands but does not change the
  startup or expected behavior of existing application journeys.
- E2E scenarios in `web-dev-panel/test/e2e/panel.spec.mjs`:
    - `parallel-command-control-and-isolated-logs`
    - `cross-tab-single-source-of-truth`
- E2E command ID: `web-dev-panel-playwright`.

## Open decisions

- None. Command safety, concurrency, log lifetime, root-manifest scope,
  panel-owned agent scope, dependency policy, and multi-tab semantics were
  explicitly resolved with the user before implementation.
