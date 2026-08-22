# Verification evidence: Web Dev Panel Custom Sections

Updated: 2026-08-22

## Automated tests

### Unit

- Command: `pnpm test:web-dev-panel` with loopback permission.
- Result: Pass, 38/38 Node tests.
- Coverage added: closed/bounded/canonical custom-section JSON; unique names,
  IDs, and memberships; disabled and missing catalog IDs; immutable create,
  delete, and membership changes; storage read/write failures; all-member start
  selection; active-only stop selection; multi-start batch eligibility; atomic
  selected-stop duplicate, missing, stale, and terminal-run behavior; and the
  shared 64-member layout/atomic-stop boundary.

### Integration and contract

- Commands: `pnpm test:web-dev-panel`, `pnpm web-dev-panel:check`,
  `pnpm agent-skills:check`, `pnpm docs:user-flows:check`, and
  `pnpm user-flow:e2e -- check web-dev-panel`.
- Result: Pass; native HTTP/SSE integration included in 38/38, 54 catalog
  commands reviewed, 15 repository skills valid, seven guides valid, and the
  mapped guide revision is current.
- Behavior validated: authorized static delivery of `custom-sections.js`, closed
  1–64-run `/api/stop-selected`, no partial stop on invalid/stale input, current
  run-ID protection, existing Host/Origin/session boundary, and exact guide/E2E
  traceability.

### E2E

- Command: `pnpm test:e2e:web-dev-panel` with the committed loopback fixture.
- Result: Pass, 3/3 Playwright tests.
- Journeys validated:
    - `parallel-command-control-and-isolated-logs`
    - `cross-tab-single-source-of-truth`
    - `portable-custom-command-sections`
- The portable journey covers collapsed card summaries, creation and two-command
  membership, custom-first navigation, duplicate status synchronization, atomic
  section start and confirmed member-only stop, copy feedback, missing-ID import
  retention, valid replacement, one command in multiple sections, confirmed
  section deletion, storage-event synchronization, and reload persistence.
  It also injects a browser-storage write failure, proves the checkbox/layout
  redraw from unchanged state, and proves the preference alert remains visible
  after unrelated navigation.
- Post-squash verification on `main`: panel Node 38/38 and Playwright 3/3 pass.
  The first Playwright rerun exposed a test-only timeout when both tabs clicked
  sidebar links whose handler rebuilds navigation; the cross-tab setup now opens
  the stable native category disclosures directly. Its focused rerun passed 1/1
  and the complete rerun passed 3/3.

## Real application verification

- Environment: committed synthetic fixture server on `127.0.0.1:4411`; project-
  pinned agent-browser wrapper; isolated session
  `languon-wdpcs-4996bb4c7906fc05503111166327d26d`; desktop default and 390×844
  viewport.
- Scenario: opened the authorized panel, created `Daily workspace`, navigated by
  sidebar, expanded Alpha, added it to quick access, observed one expanded
  catalog card and one collapsed duplicate, reloaded and confirmed the saved
  section returned collapsed, then submitted a canonical layout referencing
  `missing-colleague-command`.
- Observed result: custom navigation preceded catalog navigation; compact cards
  exposed title/description/status; membership persisted; import retained the
  old layout and announced the exact missing ID inside the modal. The first
  browser pass exposed the page-level alert as inert behind the modal; feedback
  was moved into the dialog and the scenario was repeated successfully.
- Console/network: browser `errors` and `console` were empty. Requests were only
  authorized loopback documents, styles, `app.js`, `custom-sections.js`,
  `selection.js`, SSE, and 204 favicon responses; no unexpected origins.
- Cleanup: task-scoped browser closed and fixture server interrupted.
- Artifacts: accessibility snapshots were inspected through the wrapper; no
  generated screenshot or trace artifact retained.

## User-flow guide verification

- Guides updated: `docs/user-flows/web-dev-panel.md`; index description updated.
- Commands: `pnpm user-flow:e2e -- inspect web-dev-panel`,
  `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check web-dev-panel`, and
  mapped `pnpm test:e2e:web-dev-panel`.
- Result: Pass; guide revision `sha256:d3bcf51e0663253b` and all three scenario
  markers match `web-dev-panel/test/e2e/panel.spec.mjs`.

## Static and broad checks

- `pnpm --filter @languon/web-dev-panel lint`: Pass.
- `pnpm format:check`: Pass.
- `pnpm check` with loopback permission: Pass, including skills, catalog,
  user-flow docs, full lint, typecheck, tests, and builds. The first sandboxed
  run reached the full tests and failed only because it denied the panel HTTP
  integration bind to `127.0.0.1`; the identical escalated gate passed.
- Database verification: Not applicable; only browser-local presentation data,
  with no database/cache schema or repository change.
- Generic skill-creator `quick_validate.py`: unavailable because host Python
  lacks PyYAML. No dependency was installed; the repository-native skill tests
  and validator passed.

## Review

- Reviewer result: Pass after remediation. No material implementation findings
  remain; the review covered acceptance criteria, design source, lifecycle
  races, storage failure behavior, bounds, and guide/E2E traceability.
- Security reviewer result: Pass. The ID-only JSON, text-only rendering,
  cross-tab confirmation race, active-run atomic stop validation, and inherited
  Host/session/Origin boundary were audited; no material security finding
  remains.
- Independent tester result: Pass. The tester independently reran the pre-bound
  37/37 Node suite, 3/3 Playwright, catalog, guide/mapping, skill, lint, format,
  and escalated full `pnpm check`, then verified the final deterministic bound
  tests 12/12 plus artifact/diff hygiene. The main final run passed 38/38,
  including the max-byte HTTP transport regression; no functional failure
  remained.

## Remaining risks

- Windows command execution remains deliberately unavailable under the inherited
  panel policy until native Job Object supervision exists; this feature neither
  changes nor bypasses that limitation.
- The bounded maximum layout can render up to 512 duplicate command cards; the
  ordinary and compact fixture journeys passed, but maximum-size browser
  performance was not benchmarked. All limits are finite and collapsed cards
  keep this a low residual risk.
