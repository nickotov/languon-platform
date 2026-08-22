---
feature: web-dev-panel
title: Web Dev Command Panel
status: current
last_verified: 2026-08-22
surfaces:
    - browser
    - cli
    - system
source_paths:
    - web-dev-panel/**
    - package.json
    - pnpm-workspace.yaml
    - scripts/check-user-flow-guides.mjs
e2e_command: web-dev-panel-playwright
e2e_tests:
    - web-dev-panel/test/e2e/panel.spec.mjs
e2e_scenarios:
    - parallel-command-control-and-isolated-logs
    - cross-tab-single-source-of-truth
    - portable-custom-command-sections
related_features:
    - web-dev-panel-custom-sections
---

# Web Dev Command Panel

## What this verifies

This guide verifies the development-only browser panel for reviewed repository
commands: complete catalog presentation, compatible batch starts, independent
controls, isolated latest-run logs, portable local quick-access layouts, and one
server-authoritative state shared by multiple tabs. It does not verify arbitrary
terminal input, interactive Codex, external process monitoring, persistent run
history, server/cloud layout storage, or production deployment; those
capabilities are intentionally absent.

## Start the development environment

Use Node.js 24 and install the pnpm workspace dependencies. First validate that
every root script is represented by a current reviewed catalog entry:

```sh
pnpm web-dev-panel:check
```

For ordinary manual inspection, start the singleton server from the repository
root in its own terminal:

```sh
pnpm dev:panel
```

Open the private launch URL printed by that process; it redirects the authorized
browser profile to `http://127.0.0.1:4400`. The bare origin cannot create a
session. No application server, database, cache, account, or project secret is
required to render the catalog. For command lifecycle acceptance, use the
committed Playwright fixture server rather than starting real project services
merely for testing.

## Browser verification

1. Open the panel and confirm the connection indicator becomes Connected.
   The sidebar lists every category and every category panel is collapsed.
   Following a sidebar link opens its matching panel. Every root package script
   has a collapsed command card whose summary shows title, description, and
   current status. Expanding it shows the displayed source command, controls,
   latest log, and either an available action or labeled “Why unavailable”
   explanation. Snapshot updates do not close an expanded card.
2. Open Services, select multiple enabled compatible fixture commands, and
   choose Run selected. Each card enters Running independently, its terminal
   area contains only that command's output, and the checkbox selection clears.
3. Select two incompatible inactive fixture commands. The server rejects the
   atomic batch and an in-viewport alert shows the full conflict explanation.
4. Stop one running command. Its card enters Cancelled while the other fixture
   remains Running. Stop All requires dialog confirmation.
5. Create a quick-access section named `Daily workspace`. Add two compatible
   fixture commands from their expanded cards and confirm the custom section is
   first and visually separate in both content and sidebar. Use its Start all,
   confirm both catalog and duplicate cards show one Running state/log, then use
   its confirmed Stop all and verify an unrelated running fixture is untouched.
6. Open Manage quick access and copy the versioned JSON. An import containing a
   missing command ID must show an alert and retain the current layout without
   executing anything. Import the valid JSON in a clean profile or cleared
   fixture layout and confirm names, order, and memberships reproduce exactly.
   Existing disabled IDs remain visible with their explanation.
7. Open a second tab in the same profile. Creating/removing a section in one tab
   updates the other through browser storage, while status/log changes continue
   to arrive through SSE. Reload the page and restart the fixture server to
   confirm the layout persists but run/log history does not move into JSON.
8. Resize from a desktop viewport to a narrow mobile viewport. The sidebar
   stacks above the disclosures, cards and controls remain readable, keyboard
   reachable, and horizontally safe; logs scroll inside their own regions.
9. Confirm the page reports no console errors or unexpected failed application
   requests. The deliberately rejected conflict request returns 409 and is
   represented by the visible alert.

## CLI verification

1. Run `pnpm web-dev-panel:check`. It reports the number of reviewed root
   commands and exits successfully.
2. Start `pnpm dev:panel`. It prints a private URL on the exact
   `http://127.0.0.1:4400` origin; the URL authorizes and redirects the browser.
   A second attempted instance reports that the panel is already running rather
   than choosing another port.
3. Stop the server with Ctrl+C. It stops accepting work, terminates panel-owned
   fixture process trees, and exits after bounded cleanup.

## System verification

1. Open the panel in two tabs backed by the same server session.
2. Start a fixture from the first tab. The second tab receives the Running state
   and disables duplicate selection/start without reload.
3. Stop that exact run from the second tab. The first tab receives Cancelled and
   retains the same bounded final log.
4. Start a newer run, then submit a stop carrying the prior run ID through the
   integration test. The server rejects it and leaves the newer process running.
5. Open a fresh tab while a fixture is active. Its first SSE snapshot matches
   the current state and latest logs without browser storage coordination.
6. Create a quick-access section in either tab. The other tab receives only its
   versioned layout through the browser storage event; process state remains
   unchanged until a reviewed start/stop API is invoked.

## E2E coverage

- `parallel-command-control-and-isolated-logs` proves that two fixture commands
  can be found through collapsed sections, start together, clear their selection,
  expose separate output, show rejected-batch feedback, explain an unavailable
  command, and stop independently.
- `cross-tab-single-source-of-truth` proves that a start in one tab and a stop in
  another update both tabs through one authoritative server state.
- `portable-custom-command-sections` proves collapsed summaries, custom-first
  navigation, one command in multiple sections, atomic section start/stop,
  cross-tab rejection when membership changes during stop confirmation,
  confirmed section deletion, JSON export, failed missing-ID import without
  replacement, valid import, storage synchronization, reload persistence, and
  rollback with a persistent alert when browser storage rejects a mutation.

Closed request validation, source drift, racing duplicate requests, stale run
IDs, bounded/redacted logs, and structured Codex event projection stay at the
faster unit and native HTTP integration layers.

## Expected failure and edge cases

- A second production server fails on `EADDRINUSE`; it never creates a second
  source of process truth.
- A bare bootstrap request without the private launch token cannot obtain the
  process-scoped session cookie.
- Unknown, disabled, missing, changed, unreviewed, duplicate, already-running,
  conflicting, or stale selections reject the entire batch before any spawn.
- Malformed, oversized, unsupported, duplicated, or current-catalog-incomplete
  quick-access JSON is rejected without replacing the prior layout or starting a
  command. Browser storage failures redraw the unchanged saved layout, leave the
  ordinary catalog usable, and show a persistent in-page alert.
- A stored layout whose command later disappears is preserved with a missing
  placeholder and cannot Start all until repaired. An existing disabled command
  remains reproducible but makes that section's atomic Start all fail visibly.
- A stop with an old run ID returns a conflict and cannot stop the latest run.
- A section Stop all confirmation whose membership or active run set changes in
  another tab is rejected before any request; the developer must inspect and
  confirm the current set again.
- Requests with a wrong Host, control Origin, SSE same-origin metadata, session
  cookie, content type, custom header, shape, or body size are rejected and
  receive no CORS permission.
- SSE reconnects with a complete bounded snapshot. A slow subscriber is closed
  rather than accumulating an unbounded response buffer.
- The panel shows only conservative activity for panel-launched Codex JSONL.
  Skill usage remains “Not reported by Codex CLI,” and external terminal agents
  are invisible.
- Windows can render and inspect the catalog, but command execution is
  deliberately unavailable until native Job Object supervision can guarantee
  descendant cleanup after a command leader exits.

## Automated regression checks

Run the focused safe checks from the repository root:

```sh
pnpm web-dev-panel:check
pnpm test:web-dev-panel
pnpm test:e2e:web-dev-panel
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check web-dev-panel
```

The Node suite covers catalog, portable layout validation/storage, selection,
request, process, log, Codex projection, and native HTTP/SSE behavior.
Playwright uses only committed synthetic commands and covers the three declared
browser/cross-tab journeys.

## Troubleshooting

- If port 4400 is occupied, reuse the existing panel tab or stop the owning
  local process; production intentionally has no port override.
- If a command is disabled after a package change, inspect the source diff and
  explicitly invoke `$web-dev-panel` to reconcile its safety metadata and
  revision. Do not hand-bypass the drift check.
- If Connected changes to Reconnecting, confirm the singleton server is still
  running and reload `/` to establish its current process-scoped session.
- If imported quick access cannot be reproduced, inspect the alert's missing
  command IDs. Reconcile the reviewed catalog or remove those memberships in the
  source layout; never paste executable definitions into the JSON.
- If browser tests cannot listen on loopback in a restricted sandbox, rerun the
  reviewed fixture command with local-server permission rather than weakening
  Host, Origin, or session checks.

## Cleanup

Use Stop All and confirm the dialog for any panel-owned fixtures still running,
then press Ctrl+C in the server terminal. This removes only memory-held state and
owned child processes. It does not stop infrastructure or applications launched
outside the panel and does not delete files, volumes, or data.
