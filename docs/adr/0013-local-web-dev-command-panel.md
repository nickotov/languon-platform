# ADR-0013: Local web dev command panel

Status: Superseded by ADR-0014
Date: 2026-08-22
Supersedes: None

## Context

Developers need a discoverable browser surface for starting reviewed repository
commands, selecting compatible batches, observing separate logs, and controlling
the same processes from multiple tabs. Turning loopback HTTP input into shell
execution would create a dangerous local trust boundary, while client-owned
state cannot reliably serialize starts or own operating-system process trees.

The requested tool is development-only and must use native Node HTTP plus plain
HTML, CSS, and JavaScript without runtime packages. Repository policy normally
uses Zod for untrusted boundaries, so this isolated zero-runtime-dependency
requirement needs an explicit narrow exception and a compensating closed native
validator contract.

## Decision

Create a private top-level `web-dev-panel/` pnpm workspace with no imports from
product applications or shared packages. Its production entry binds exactly one
native HTTP server to `127.0.0.1:4400`; `EADDRINUSE` fails instead of selecting a
fallback port. It is excluded from aggregate `pnpm dev` and started explicitly
with `pnpm dev:panel`.

The root `package.json` and explicitly named, repository-bounded documentation
files are the only catalog sources. A versioned reviewed catalog accounts for
every root script, stores human metadata and per-source SHA-256 revisions, and
defaults new, missing, changed, interactive, parameterized, destructive,
administrative, remote, or unknown commands to disabled. Documentation is
untrusted and is never parsed or executed; a reviewer records an exact snippet,
fixed executable, fixed argv, and fixed working directory. This extends rather
than replaces ADR-0004's registered user-flow command boundary.

The browser sends only stable command IDs, expected source revisions, and run
IDs. It cannot provide shell text, executables, argv, cwd, environment, stdin,
or PTY input. The server refreshes sources before every batch, validates the
entire selection, reserves all accepted runs synchronously before spawning, and
uses `child_process.spawn` with `shell:false`, ignored stdin, fixed cwd, and
panel-owned process groups. Stop requires the current run ID; Stop All and
shutdown terminate only owned trees with bounded escalation.

One server-owned command manager is authoritative for current/latest run state,
bounded memory-only logs, and a monotonic event sequence. Tabs own only checkbox
selection. Native POST requests control runs and snapshot-first SSE broadcasts
state/log deltas; slow subscribers are disconnected and recover from a new
snapshot. There is no persistence, replay buffer, browser terminal, or external
process monitoring.

Every response uses no-store and strict content/security headers. All routes
require the exact loopback Host. The process prints an unguessable out-of-band
launch URL; only that token exchange can establish the random process-scoped
HttpOnly SameSite=Strict cookie, after which it redirects to the bare origin.
Control requests
require the exact Origin plus a fixed same-origin header. Same-origin EventSource
requests do not consistently carry Origin in browsers and the panel deliberately
uses a no-referrer policy, so SSE requires either that exact Origin or an absent
Origin paired with `Sec-Fetch-Site: same-origin`. Control JSON uses an exact
content type, bounded bytes, and closed native request validation. No CORS
surface exists.

Logs are UTF-8 decoded, exact inherited secret values are redacted across stream
chunk boundaries, unsafe control/terminal sequences are removed, and bounded
entries are rendered only through `textContent`. `codex-jsonl` commands may
project allowlisted activity/status/usage metadata but never retain prompts,
messages, reasoning, content, arguments, or unknown events. The CLI does not
provide a reliable skill-use event, so the UI reports skill usage as unavailable
instead of inferring it. Only agents launched by the panel can be observed.

The repository `$web-dev-panel` skill is explicit-only. It may reconcile root
scripts and documentation paths named in that invocation, but it must leave
unreviewed candidates disabled, inspect changes before refreshing trust
revisions, and verify the resulting catalog.

## Alternatives considered

### Generic browser terminal or WebSocket PTY

Rejected because it would accept arbitrary command input, require runtime
packages, and expose an unnecessarily broad local execution boundary. The
control flow is request/one-way-event shaped, so native HTTP plus SSE is enough.

### Client-owned tab coordination

Rejected because localStorage, BroadcastChannel, and optimistic disabling cannot
atomically own OS processes or prevent simultaneous duplicate requests.

### Automatically expose every package script

Rejected because package scripts include interactive, destructive, remote,
parameterized, and privileged operations. Visibility is complete, but execution
requires an explicit reviewed safety decision and unchanged source revision.

### Persist command history and agent transcripts

Rejected because persistence increases sensitive-data exposure and is not
needed for the approved latest-run developer workflow.

## Consequences

### Positive

- Multiple tabs share one race-free process and log source of truth.
- Browser input cannot become arbitrary argv or shell execution.
- Source drift visibly disables stale trust decisions.
- The standalone workspace does not weaken product application boundaries.

### Negative

- Command metadata and hashes require deliberate reconciliation after source
  changes.
- Only the latest run survives in memory and all history disappears on restart.
- The native validators and platform process cleanup require dedicated tests.

### Risks / limitations

- The private launch token prevents another local account from minting a session,
  but a malicious process running as the panel owner can still read that owner's
  terminal/process state or mutate the repository; this tool is not an OS-user
  sandbox.
- Exact environment-value redaction is defense in depth, not a guarantee that
  arbitrary command output contains no sensitive data.
- Native Node cannot guarantee Windows descendant ownership after a command
  leader exits. Execution therefore fails closed on Windows until Job Object
  supervision is implemented; catalog inspection remains available.
- Codex CLI structured events may evolve. Unknown fields/events must remain
  dropped until explicitly reviewed.

## Related

- [ADR-0004](./0004-user-flow-e2e-traceability-hardening.md)
- [Web dev panel README](../../web-dev-panel/README.md)
- [Web dev command panel feature](../../.agent/features/web-dev-panel/FEATURE.md)
- [Web dev command panel ExecPlan](../../.agent/features/web-dev-panel/EXEC_PLAN.md)
