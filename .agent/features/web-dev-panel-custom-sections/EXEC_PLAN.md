# ExecPlan: Web Dev Panel Custom Sections

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-22

## Goal

Deliver compact command disclosures and portable, local quick-access sections
whose duplicate cards operate on one server-authoritative command/run state,
including atomic per-section start and stop controls with visible failure detail.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `web-dev-panel/` is a dependency-free private tooling workspace governed by
  `web-dev-panel/AGENTS.md` and accepted ADR-0013. Its `CatalogStore` and
  `ProcessManager` own reviewed command definitions, source revisions, active
  runs, bounded logs, conflicts, and serialized lifecycle operations.
- The browser receives snapshot-first SSE and sends only closed POST bodies with
  reviewed IDs/revisions/run IDs. `app.js` currently owns tab-local checkbox and
  category-disclosure state, rebuilds cards from each snapshot, and renders all
  text with `textContent`.
- `selection.js` is the established pure browser/server-independent test seam.
  A sibling `custom-sections.js` can hide schema, validation, serialization, and
  immutable membership rules without a runtime dependency.
- `localStorage` must never coordinate process ownership. Standard `storage`
  events can synchronize only the versioned presentation document within one
  browser profile; SSE remains the only lifecycle/log synchronization channel.
- `POST /api/start` already validates and reserves a whole batch atomically.
  Existing `/api/stop` is single-run and `/api/stop-all` is global, so section
  Stop all needs one closed, atomic multi-run adapter rather than racing multiple
  client requests or stopping unrelated commands.
- `design/DESIGN_SYSTEM.md` and `design/main.pen` are visual authority. The saved
  command-panel story already contains a category sidebar, collapsed sections,
  unavailable reason, and visible mutation feedback from the immediately prior
  correction carried into this feature branch.

## Acceptance criteria

- [ ] AC-1 — Compact command disclosure summary and preserved tab-local state.
- [ ] AC-2 — Create/delete custom sections and many-to-many command membership.
- [ ] AC-3 — Custom-first separated main/sidebar navigation.
- [ ] AC-4 — Versioned bounded localStorage presentation document.
- [ ] AC-5 — Atomic portable JSON export/import and reproducibility alerts.
- [ ] AC-6 — Cross-tab layout sync without moving process truth client-side.
- [ ] AC-7 — Atomic full-member Start all with complete failure feedback.
- [ ] AC-8 — Confirmed atomic member-only Stop all with stale-run protection.
- [ ] AC-9 — Design, ADR, docs, skill, user-flow, tests, browser, and reviews.

## Test strategy

- Unit: Required — pure custom-section schema/limits/parse/serialize/membership
  rules; active/conflict selection; stop-selected request validation; process
  manager all-or-nothing stale-run behavior.
- Integration: Required — native HTTP authorization/shape/status behavior for
  the fixed stop-selected route and synchronized resulting snapshots.
- Contract: Required — versioned JSON exact shape, stable command IDs only,
  static browser-module serving/CSP, catalog validation, guide/skill checks.
- E2E: Required — fixture-backed command-card disclosure, create/membership,
  persistence/reload, cross-tab storage sync, export/import success and failure,
  section start/stop, and duplicate-card synchronized status.
- Browser/device: Required — project-pinned browser at desktop and compact width,
  keyboard/dialog behavior, error/persistence journeys, console/network review.
- Database migration: Not required — localStorage presentation data only.
- User-flow guide: Required — update `docs/user-flows/web-dev-panel.md`.
- User-flow E2E: Required — add `portable-custom-command-sections` and update
  existing scenarios in `web-dev-panel/test/e2e/panel.spec.mjs`, execute
  `pnpm test:e2e:web-dev-panel`, refresh the exact guide revision marker.
- Security: Required — untrusted JSON-to-DOM and new process-control request
  materially affect rendering/execution boundaries.

## Milestones

- [x] M1 — Architecture, specification, and visual contract
    - Objective: finalize strict preference/stop contracts, ADR, acceptance/test
      mapping, and command-panel design story before runtime styling changes.
    - Components: feature artifacts, ADR-0014, `design/*`, relevant source/tests.
    - Acceptance criteria: AC-1 through AC-9 specified; AC-9 design/ADR portion.
    - Required tests: source/design inspection; architecture comparison.
    - Evidence: feature branch/artifacts created; independent product and
      architecture passes completed; ADR-0014 accepted; Pencil story updated
      with custom-first navigation, collapsed command summaries, section bulk
      actions, portable JSON controls, import failure, and zero layout problems.
- [x] M2 — Portable custom-section model and compact UI
    - Objective: implement strict versioned storage/import/export, custom-first
      navigation, many-to-many membership, and collapsed command summaries.
    - Components: `web-dev-panel/public/**`, pure unit tests, fixtures.
    - Acceptance criteria: AC-1 through AC-6.
    - Required tests: pure Node tests, lint, focused Playwright iteration.
    - Evidence: `custom-sections.js` enforces the exact bounded v1 document,
      immutable membership, localStorage translation, and current-catalog import
      validation; every catalog/custom card is a placement-keyed disclosure;
      Playwright proved persistence, duplicate views, invalid import retention,
      and same-profile storage-event synchronization.
- [x] M3 — Atomic section lifecycle controls
    - Objective: implement all-member atomic start semantics and confirmed,
      member-only atomic stop semantics while preserving run-ID protection.
    - Components: process manager, HTTP validation/server, browser actions/tests.
    - Acceptance criteria: AC-7 and AC-8.
    - Required tests: unit, HTTP integration, Playwright race/error journeys.
    - Evidence: ProcessManager rejects non-batch members in multi-starts and
      atomically validates selected command/run pairs before stopping; closed
      HTTP validation, process, integration, selection, and Playwright tests pass.
- [x] M4 — Durable docs, skill, user-flow, and complete verification
    - Objective: synchronize every durable source and gather automated plus
      real-browser evidence.
    - Components: README, design contract/canvas, ADR, guide/E2E marker,
      `$web-dev-panel`, feature evidence.
    - Acceptance criteria: AC-9 and all prior criteria.
    - Required tests: panel suite/E2E, catalog, skill, user-flow, lint, format,
      repository affected gates, desktop/compact browser acceptance.
    - Evidence: README, ADR-0014, design sources, design-system contract,
      user-flow guide/revision, and `$web-dev-panel` agree. Panel Node 38/38,
      Playwright 3/3, catalog/guide/skill validators, project browser acceptance,
      and escalated full `pnpm check` pass. A one-member non-batch section edge
      case found during acceptance audit is now client-rejected and covered.
- [x] M5 — Independent review, remediation, and feature merge
    - Objective: obtain tester, implementation, and security verdicts, resolve
      material findings, rerun affected checks, and squash-merge locally.
    - Components: final diff plus all feature artifacts.
    - Acceptance criteria: AC-1 through AC-9.
    - Required tests: independent passes and post-remediation/post-merge gates.
    - Evidence: Independent implementation, security, and tester verdicts pass
      after remediation. The feature was committed locally, squash-applied to
      `main` without conflict, and post-squash Node 38/38 plus Playwright 3/3
      checks pass.

## Progress

- 2026-08-22 — Classified as a feature because it adds versioned local
  persistence/import semantics and a new multi-command lifecycle journey.
  Created `feature/web-dev-panel-custom-sections` from `main` while preserving
  the completed, uncommitted navigation correction as the implementation base.
  Scaffolded artifacts, read prior feature/ADR/guide/design/source/tests, and ran
  synchronized user-flow inspection. Next: finalize architecture/ADR/design and
  implement M2 from pure model tests.
- 2026-08-22 — Completed M1. Independent architecture compared client-only,
  server-persisted, and mixed client/server lifecycle designs; selected a deep
  client preference module plus atomic server stop-selected adapter. Accepted
  ADR-0014 as the successor to ADR-0013 and updated the live Pencil story without
  clipping. Next: write custom-section model regression tests and implement M2.
- 2026-08-22 — Completed M2 and M3. Added strict ID-only v1 preference parsing,
  canonical localStorage import/export, cross-tab storage synchronization,
  placement-local command disclosures, many-to-many section cards, and fixed
  atomic stop-selected control. Focused Node tests and the three fixture-backed
  Playwright journeys pass.
- 2026-08-22 — Completed M4. Updated the persisted Pencil story, design contract,
  ADRs, README, guide, mapped E2E revision, and explicit maintenance skill.
  Project-pinned browser verification passed at desktop and 390×844 after moving
  invalid-import feedback inside the accessible modal. Full `pnpm check` passed
  with loopback permission. Next: independent reviewer/tester/security passes,
  remediation, feature commit, and squash merge.
- 2026-08-22 — Independent implementation and security review found and drove
  fixes for stale cross-tab section-stop confirmation, terminal-run partial stop,
  storage-write phantom membership, masked disabled-command reasons, and the
  section/stop endpoint bound mismatch. Regression coverage now includes all
  five cases. Reviewer and security verdicts are pass; final independent tests
  pass. Next: finalize artifacts, commit, squash merge, and run post-merge checks.
- 2026-08-22 — Completed M5. Created the local feature commit, squash-applied it
  to `main` without conflict, stabilized a test-only two-tab disclosure setup,
  and reran the post-squash panel Node suite 38/38 and Playwright journeys 3/3.
  All acceptance criteria are complete and no material review finding remains.

## Decisions

- D1 — Client-owned preferences, server-owned runtime truth
    - Context: the user explicitly requested localStorage while ADR-0013 rejects
      localStorage as process coordination.
    - Choice and rationale: persist only section identity/name/order/membership;
      use SSE snapshots for every command status/log and server APIs for control.
    - Alternatives rejected: server JSON/file persistence, localStorage process
      locks/state, cloud/team synchronization.
    - ADR impact: new ADR-0014 extends and narrows ADR-0013's persistence rule.
- D2 — Closed named/versioned ID-only import replaces atomically
    - Context: colleague reproduction must not import executable definitions or
      partially overwrite a good layout.
    - Choice and rationale: exact `{schema, version, sections}` JSON with bounded
      unique IDs/names/member IDs; verify every member against current catalog;
      replace only after complete validation. Existing disabled IDs remain
      reproducible.
    - Alternatives rejected: merge semantics, embedded command metadata/argv,
      permissive unknown fields, silent missing-ID removal.
    - ADR impact: ADR-0014.
- D3 — Server-atomic stop-selected operation
    - Context: issuing one `/api/stop` request per card can partially stop a set
      after one stale run fails; global Stop All affects unrelated commands.
    - Choice and rationale: a fixed closed multi-run request validates every
      current command/run pair synchronously before requesting any stop.
    - Alternatives rejected: client Promise.all single stops, global Stop All,
      browser-owned lifecycle locks.
    - ADR impact: ADR-0014.
- D4 — Stable view keys preserve disclosures across snapshot rebuilds
    - Context: the same command can render in catalog and several custom
      sections, while `app.js` replaces DOM on snapshots.
    - Choice and rationale: key expanded card state by section identity plus
      command ID; render each from the same current command snapshot.
    - Alternatives rejected: one global expansion state per command, persisted
      disclosure state, losing expansion on each snapshot.
    - ADR impact: Not ADR-worthy; feature-local UI decision.

## Discoveries

- The immediately prior correction is complete but intentionally uncommitted;
  its category/sidebar/design changes moved with the dirty worktree onto this
  required feature branch and will be included in the feature's single delivery.
- Existing fixture catalog has five commands, including one disabled entry and a
  symmetric alpha/aggregate conflict, sufficient for safe import/start failure
  journeys without launching real repository services.
- Existing command cards and sections are rebuilt from each SSE snapshot, so
  disclosure state must live outside DOM and custom data must resolve snapshots
  by stable ID on every render.

## Validation

| Check              | Status         | Evidence                                    |
| ------------------ | -------------- | ------------------------------------------- |
| Unit               | Pass           | Panel Node suite 38/38                      |
| Integration        | Pass           | Authorized native HTTP/SSE and atomic stops |
| Contract           | Pass           | JSON, catalog, ADR, guide, and skill checks |
| E2E                | Pass           | Fixture Playwright 3/3                      |
| Browser/device     | Pass           | Project browser desktop and 390×844         |
| Typecheck          | Not applicable | Native JavaScript; lint/tests cover syntax  |
| Lint               | Pass           | Panel lint and full repository lint         |
| Build              | Pass           | Full repository build through `pnpm check`  |
| Database migration | Not applicable | Browser localStorage only                   |
| User-flow guide    | Pass           | Updated `web-dev-panel` guide               |
| User-flow E2E      | Pass           | Three mapped scenarios and current revision |
| Independent review | Pass           | No material finding remains                 |
| Security review    | Pass           | No material security finding remains        |

## Remaining work

- None.
