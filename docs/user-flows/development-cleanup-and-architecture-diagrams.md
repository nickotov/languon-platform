---
feature: development-cleanup-and-architecture-diagrams
title: Development cleanup and architecture diagrams
status: current
last_verified: 2026-10-19
surfaces:
    - browser
    - cli
source_paths:
    - scripts/architecture-viewer/**
    - docs/diagrams/**
    - .agents/skills/development-cleanup/**
    - .agents/skills/architecture-diagrams/**
    - package.json
e2e_command: architecture-diagrams-playwright
e2e_tests:
    - scripts/architecture-viewer/test/e2e/diagrams.spec.mjs
e2e_scenarios:
    - explore-current-architecture
    - recover-diagram-review-and-load-failures
---

# Development cleanup and architecture diagrams

## What this verifies

Browse implemented system boundaries and data/logic flows, inspect their recorded
sources and notice changes since review. The viewer is local and read only. Source
fingerprints detect changes in recorded inputs; they do not establish that a diagram
is complete or discover new modules automatically.

The reusable `$development-cleanup` and `$architecture-diagrams` skills guide agent
work. A cleanup run records evidence before removing obsolete runtime paths or
authorized disposable data; diagrams trace code, accepted ADRs and current docs.
Skill decisions are reviewed through isolated task probes and affected application
checks, rather than pretending that a browser test executes agent judgment.

## Start the development environment

Use Node.js24 and the repository-pinned pnpm, with workspace dependencies installed.
The viewer needs no application servers, database, credentials or provider calls.

From the repository root:

```sh
pnpm diagrams:check
pnpm diagrams
```

Open `http://127.0.0.1:4401`. The server binds only to loopback. If that port is
occupied, stop its owner or use `pnpm diagrams --port 4402`; an existing process
is never replaced. `GET /health` responds `ok` while the viewer is running.

## Browser verification

1. Open the local URL. Expect System context and a navigation list of nine views.
2. Select Authentication, AI job lifecycle, Texts, Conversations and the remaining
   flows. Each selection renders a labeled SVG and updates its title and summary.
3. Search for `knowledge`, then enter a string with no match. Expect filtered links
   and an explicit empty result. Clearing search restores all views.
4. Use Zoom in, Zoom out and Fit. The canvas can scroll when zoomed; controls stay
   reachable. Refresh the browser with a selected diagram hash; selection survives.
5. Open Flow notes and Sources and Mermaid. Expect the document path, actual source
   paths and inspectable Mermaid text. Notes are displayed as text.
6. Refresh sources after a recorded input changes. Expect a visible needs-review
   state until the diagram has been reconciled. On a narrow viewport, navigation
   scrolls horizontally and every diagram/control remains reachable by keyboard.

## CLI verification

1. Run `pnpm diagrams:check`. Expect all nine documents current with valid Mermaid.
   Invalid/missing sources, malformed metadata, syntax errors or drift exit nonzero.
2. Invoke `$architecture-diagrams` to reconcile changed implementation and accepted
   decisions. After reviewing every affected input and updating the diagrams, run
   `pnpm diagrams:check -- --stamp`, then rerun the ordinary check.
3. Invoke `$development-cleanup` with a scope such as “audit retired text models”.
   Expect a recorded candidate/removal/retention ledger, appropriate verification
   and an explicit local target check before any authorized data mutation.

## E2E coverage

`explore-current-architecture` loads the real native server and real repository
catalog in Chromium, renders all nine views, inspects notes/sources, searches,
zooms/fits, retains hash selection, checks narrow layout and keyboard navigation,
and rejects unexpected browser/console/network failures or external requests.

HTTP/unit tests cover hostile Host/Origin headers, unsupported writes/paths,
source and document confinement, changed source detection and inert note strings.
These exhaustive boundary cases stay outside the browser journey.

`recover-diagram-review-and-load-failures` runs the same real server against an
isolated temporary diagram repository. It changes an actual source file to prove
the stale warning, preserves inert note text, fixes a malformed authored diagram,
and stops/restarts the server to prove the visible fetch failure and successful
retry. No internal application layer or browser response is mocked.

## Expected failure and edge cases

Stale inputs remain viewable with a warning. Invalid documents are reported by
filename while valid views remain available. A fetch/render failure stays visible
and allows retry or source inspection. The server serves only its fixed assets,
local Mermaid modules and diagram catalog; it accepts no commands or writes.

## Automated regression checks

```sh
pnpm test:diagrams
pnpm diagrams:check
pnpm test:e2e:diagrams
pnpm agent-skills:check
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check development-cleanup-and-architecture-diagrams
```

The browser runner owns a loopback server on4412 and refuses to adopt another
listener. Install the project's browser runtime if Chromium is unavailable.

## Troubleshooting

For source drift, inspect the changed inputs and revise the diagram before stamping.
For invalid Mermaid, use the checker and inspect Sources and Mermaid. A missing
dependency requires reinstalling workspace development dependencies; browser assets
are served locally without a CDN. A port conflict requires another free local port.

## Cleanup

Stop the viewer with Ctrl+C. Tests stop their owned server. No database or cache
cleanup is needed to view diagrams. A cleanup skill run follows its own recorded
target and deletion scope; this guide authorizes no database reset.
