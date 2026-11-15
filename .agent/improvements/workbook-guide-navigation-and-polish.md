# Workbook guide navigation and visual polish

Status: Complete
Created: 2026-11-15

## Routing and scope

Existing-contract UX improvement requested with a screenshot: desktop sticky right
exercise table-of-contents, mobile bottom sticky selector, stronger visual accents.
No new product journey/API/persistence/provider/dependency. Preserve all19local
examples, canonical checking, reset/URL/copy and isolated illustrative feedback.
Use the existing branch/main and UI tokens/primitives/CSSModules. User-selected
layout plus existing-pattern extension is the design direction. No new palette.

## Acceptance

- Desktop exercise choices form a grouped right sticky navigator with visible
  selected state; all19 remain reachable even in short viewports.
- Mobile uses a labelled bottom selector with safe-area/content clearance and
  correct stacking beneath the application drawer. Keyboard and focus work.
- Stronger hierarchy/accents and compact spacing preserve source, instructions,
  prompts and feedback. No decorative content hides the actual exercise.
- URL/deep links/reset, prepared checking/copy and no-AI/no-write guarantees remain.

## Plan and evidence selection before edits

Source baseline main4188cc08, clean. Bounded designer briefs and reviews; worker
owns guide UI, separate worker owns tests, root owns integration and records.
Targeted guide component/metadata/corpus tests (seconds), style/ESLint/format,
webtypecheck/build (minutes), existing guarded3guidebrowserjourneys at1440/768/390
(tens of seconds) with actual sticky position/clearance and screenshots. Validate
updated user-flow mappings; source-review and final rendered critique. Reuse
unchanged corpus/provider proof. No DB/security/paid-model/full backend regressions.
No new untrusted boundary. Restore generatedNextenv after verification. Rollback:
revert scopedguide/style/navigation edits; no data/configuration migration.

## Progress

- [x] Implement responsive navigation and visual hierarchy.
- [x] Pass focused/static/build and real desktop/narrow checks.
- [x] Resolve source/rendered review; update guides and final scoped diff.

## Verification/results

- Focused guide tests: four files, 19 tests passed. Local corpus and checking
  contracts remain unchanged.
- Web production build and subsequent web typecheck passed. The first concurrent
  typecheck raced Next's generated `.next/types`; the sequential rerun passed.
- Scoped ESLint/Prettier, style-contract checks, user-flow mapping validation and
  documentation checks passed before review remediation; final reruns passed.
- Initial browser run exposed a headless Chromium native-select arrow-key test
  assumption. Isolated native-select checks confirmed typeahead works; the journey
  now verifies native typeahead and Tab instead. No product workaround was added.
- Guarded browser run `37437596-7c63-448c-9b9b-e1dff0fcff0a`: three journeys
  passed, no skips. Desktop sticky geometry, keyboard selection, 390/768px bottom
  dock, light/dark themes, final-copy clearance and no domain/model writes passed.
  Final regression run `672cc955-2164-49a6-b0e5-ed2bf3c79f91` passed all
  three journeys with no skips, including direct W01 at 1440×620 and scrolled
  mobile switching beneath the top bar. Artifacts:
  `test-results/critical-flows/672cc955-2164-49a6-b0e5-ed2bf3c79f91/`.

## Review

Independent source review found two medium issues: WGP-R1 selected direct W01
entry initially clipped in a short desktop TOC; WGP-R2 mobile heading partially
behind the sticky top bar after switching. Both are resolved with focused browser regressions. R1 reveals the active item
by changing only the aside scroll position, including resize; R2 uses the existing
computed CSS scroll margin to clear the top bar. Independent remediation source
review found no new material issues; final evidence approval passed (reviewed boundary hash
`3c9880034b7db10b305679a262e05383bb04cd0d288c95f47f9b04ed2769097a`).
No unresolved material findings.

Designer rendered critique found no material composition issues in the supplied
runtime screenshots: desktop navigation/focus and answer/feedback states, mobile
and tablet headers/source/recipes/footer in light/dark themes. It did not inspect
Russian runtime text, an open mobile keyboard, or desktop hero/W01 screenshots.
These remain bounded observation limits, not exhaustive accessibility claims.

## Outcome

- Grouped, sticky right-hand TOC on wide guide layouts; selected entry, focus
  state and internally scrollable choices use existing semantic tokens.
- Labelled bottom selector at narrower sizes, sidebar offset and safe-area
  padding, with document clearance for final recipe actions.
- Compact header, indigo activity/category accents and source/guidance highlights.
  Existing local exercise rendering, checking, reset and prompt copying preserved.
- Updated user-flow manual instructions and E2E revision mapping. No environment
  updates are needed. Existing architecture and feature documentation remain valid;
  this improvement changes presentation/navigation within the existing journey.

## Delivery

The earlier user instruction to commit each implementation stage authorizes the
single local polish commit after verification. No push or branch deletion.
Rollback is a scoped revert of this commit; no data/configuration changes.

Final production build, sequential typecheck, scoped lint and formatting passed
after remediation. A callback-local null guard resolved TypeScript closure
narrowing without changing behavior. Browser evidence remains valid for this
runtime-neutral addition. Generated Next.js declarations were restored. Final
`git diff --check` passed. No remaining known material risks; observation limits
are recorded above. Retrospective follows user acceptance.
