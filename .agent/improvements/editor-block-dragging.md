# Improvement: Consistent editor block dragging

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Scope and routing

Existing-contract editor UX improvement: expose the existing ProseMirror whole-
node selection/drag behavior for ordinary top-level blocks, and shift custom
handles about 20px left. No new journey, saved format, API, permissions, provider,
dependency or schema. Preserve prior uncommitted corrections. No commit requested.
Use improvement, frontend-development, testing and browser-verification workflows.

## Acceptance

- Handles do not overlap custom block content and stay reachable on mobile.
- Paragraphs, headings, lists, quotations and tables can be selected and dragged
  as complete top-level blocks; nested list/table contents retain their structure.
- Existing grouped custom drag, safe copy rules, undo, dirty state, text editing,
  keyboard access and read-only behavior remain valid. Handles are editor chrome,
  never saved content. Stale drag content cannot overwrite newer prose.

## Plan and validation

Reuse native ProseMirror drag slices/clipboard serialization and existing labels;
one floating ordinary-block handle avoids decorating saved nodes or list/table
DOM. Retain custom handles and group identity logic. Verify source geometry,
focused editor tests, lint/type/style checks and the real registered workbook
browser journeys, adding ordinary paragraph/heading drag and custom gutter
assertions. Update the mapped guide and its revision. Review proportional to the
local editor surface; no API/data/security-policy changes require feature gates.

## Evidence

- Implemented a floating editor-only handle for ordinary top-level nodes.
  Native slices use ProseMirror serialization; internal drops use captured
  immutable source content and group-safe top-level destinations. Moving and
  normalized copying dispatch only after validation; stale drops are cancelled.
- Custom grips translate left by the existing 20px token without shifting their
  headings. Coarse/narrow layouts reserve a gutter and give ordinary handles
  44x44 targets. Editor focus, Shift+Tab and pointer input reveal/reach the current
  handle; Alt+Up/Down also works directly from the prose selection.
- TableKit now allows whole-table NodeSelection. Without it the table plugin
  converted selection to a CellSelection, which could lose the complete table.
- Focused suite: 8 files /60 tests passed. Latest DOM-order refinement also passed
  all 11 prose-drag regressions. Selection/no-dirty, complete paragraph/heading/
  list/quote/table selection, keyboard movement, undo, stale drag, focus/pointer
  discovery, read-only controls, keyboard group crossing and drop-between-group-
  members are covered. Tests bypass JSDOM's missing scroll Range geometry only;
  browser movement/geometry remains a required gate.
- Web typecheck, scoped ESLint and styling contract pass. Prettier and mapped
  guide checks are part of final preflight. Updated interactive-workbooks guide
  and scenario revision; knowledge-workspace's existing general drag/edit journey
  descriptions remain accurate. No new scenario or product journey introduced.
- Independent source reviewer `ordinary_block_drag_review` found PBD-001 High
  (ordinary moves could split a group) and PBD-002 Medium (hover-only discovery
  and small coarse target). Both were fixed and approved after source remediation
  and regression tests. Final source/evidence approval is complete after browser
  gates passed. Review covers the new range/move/view helpers and existing group
  constraints; no API, model, billing, upload policy or HTML trust change.
- Failed browser iterations are retained as failures. First caught prevented
  mouse-down suppressing native drag; second showed native default placement did
  not provide the requested whole-block destination. Explicit group-safe drop
  handling resolves both. The next verified paragraph/heading drags, then caught
  Tab entering embedded player/custom controls; placing the handle before the
  editor makes Shift+Tab directly reachable. No application assertions weakened.
- Final browser run: `pnpm test:e2e:critical -- --flow interactive-workbooks`,
  61992026-d3e3-4e47-b0a2-ec463622bc24, passed 3/3 with no retries/skips.
  Real Chromium, web localhost:3336/backend:4006 and runner-owned disposable
  PostgreSQL:55488/Redis:56488/1, synthetic accounts and deterministic external
  providers. No paid calls or user-process restart. Runner cleanup completed and
  tracked generated Next declarations restored automatically.
- Runtime proof includes real mouse drags for paragraph and heading, stable
  contents/order, custom handle bounding box entirely left of its frame,
  Shift+Tab focusing an ordinary handle, 390px pointer-event reveal with a 44x44
  control inside viewport and outside prose, existing custom drag/publication/
  reload, plus console/page/server-error assertions. Mobile pointer event is
  injected by Playwright; this proves responsive discovery/geometry, not native
  finger dragging on every mobile browser.
- Inspected 1440x1000 and 390x844 screenshots at
  `test-results/critical-flows/61992026-d3e3-4e47-b0a2-ec463622bc24/interactive-workbooks-artifacts/interactive-workbooks.jour-cbc6b--and-saves-private-practice/`:
  `ordinary-block-drag-handles.png`, `ordinary-block-handle-mobile.png`.
  Prose/custom headings remain readable, gutter handles do not cover content,
  and mobile controls are visible without horizontal overflow.
- Final typecheck, scoped ESLint, Prettier, styling contract, guide/mapping
  validation (33 guides) and diff whitespace checks passed. No production build
  required beyond actual Next runtime compilation for this editor-only scope.
  Source preflight inspected the 181-line DOM lifecycle module, 111-line policy
  extension, pure group range helper and isolated move transaction separately;
  runtime geometry uses measurements while static gutter spacing uses tokens.
- Eleven source/test/guide files, sorted path + NUL + bytes + NUL fingerprint:
  SHA-256 c2b355e09dd142c7a472376bea7918fb0b92fc4d304c320bdc13e20fa7c7275b.
  Base HEAD 890575a. Previous startup/leading-line/icon corrections are preserved;
  no commit or merge made. Final independent evidence approval received from
  `ordinary_block_drag_review`: exact fingerprint reproduced, 3/3 clean browser
  results, direct Shift+Tab placement and inspected desktop/mobile captures
  approved with no material findings or missing evidence in scope.

Logs: `/tmp/languon-block-drag-tests-final.log`,
`/tmp/languon-block-drag-tests-current.log`, `/tmp/languon-block-drag-types.log`,
`/tmp/languon-block-drag-lint.log`, `/tmp/languon-block-drag-styles.log`,
`/tmp/languon-block-drag-guides.log`, `/tmp/languon-block-drag-browser.log`,
`/tmp/languon-block-drag-browser-native.log`,
`/tmp/languon-block-drag-browser-final.log`,
`/tmp/languon-block-drag-browser-pass.log`.

## Rollback and risks

Remove the ordinary-block extension and revert the custom handle CSS offset.
No migration or cleanup needed. Browser geometry, native dragging and final
independent evidence review passed. No remaining known implementation risk
within scope. Native finger dragging across mobile browser engines was not
claimed; mobile sizing and pointer discovery were verified in Chromium.

## Git handoff

The user subsequently requested committing the completed pending work. Earlier
no-commit statements describe implementation-time authority; this request
authorizes the local commit containing this record and its verified changes.
