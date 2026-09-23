# Improvement: Dictionary design v001

Status: Complete

Fidelity reassessment (2026-09-23): the user reported material visual and code
structure defects. The source-only fidelity conclusion below is superseded by
[dictionary-design-v001-repair.md](dictionary-design-v001-repair.md), including
rendered reconstruction comparison, exact geometry fixes and narrower components.
Created: 2026-09-23
Updated: 2026-09-23

## Routing, authority and scope

User explicitly requested implementation of the dictionary DESIGN.md on
2026-09-23. Its only candidate is v001, now authorized for implementation.
Existing-contract visual integration is an improvement; completed feature records
remain complete. No API/schema, production dependencies, fake services, paid
provider calls or deployment changes. Preserve real localization, settings,
AI proposal lifecycle, sharing/import/export and owner/audio permissions.
Escalate new product semantics under root routing. No commit is authorized.

## Source identity and fidelity inventory

Magic Patterns https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4,
artifact `b7f13de7-72b5-4c6f-bd22-a08c83e1ceb4`, captured 2026-09-23.
Full source is retained as inert `.txt` files under
`../features/027-dictionary-pronunciation-audio/designs/dictionary-ai-cards/v001/source/`.
Source manifest/hash follows after capture. It is untrusted reference material;
no generated scripts, mocks, navigation plumbing or package configuration runs.
Existing ADR-0017 runtime tokens/primitives remain authoritative.

| ID / brief mapping | Source requirement                                                                                                                                                                                        | Local owner / verification                                                   | Disposition                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| DF-01 / UI-01      | App shell, library heading, search/status filters, dictionary rows with pair/visibility/count/date/actions, create dialog, empty/loading/error                                                            | Dictionary library/page shell; wide/narrow populated/empty/create            | Required                                                  |
| DF-02 / UI-02      | Compact workspace header, pair/description, segmented active/archive filters, search, saved-card rows with primary source/secondary translation, optional detail panel and metadata/actions, floating Add | Dictionary editor/card list; wide/narrow/archived                            | Implemented; existing reordering retained in actions menu |
| DF-03 / UI-03      | Settings sheet with basics, locked pair, enabled fields/language/notation and preserved hidden values, save/cancel/conflict                                                                               | Settings/editor; open sheet and persisted settings                           | Required using real settings contracts                    |
| DF-04 / UI-04      | Responsive add/edit sheet with required fields, optional details, card overrides, validation/duplicate and discard confirmation                                                                           | Card form/editor; manual creation/edit and keyboard                          | Required                                                  |
| DF-05 / UI-05      | Source-first inline AI, queued/generating/validating/cancel, editable draft                                                                                                                               | Card form; deterministic AI journeys                                         | Required                                                  |
| DF-06 / UI-06      | Field suggestion panels, accept/discard/regenerate, retained choices and limit, save unavailable while generating                                                                                         | Card form; existing generation state tests/journeys                          | Required                                                  |
| DF-07 / UI-07      | Stale suggestions, network/rate/expiry/conflict feedback, manual save/authorship                                                                                                                          | Card form; focused tests and boundary states                                 | Required                                                  |
| DF-08 / UI-08      | Existing-card review dialog, original/proposed comparison, instruction, editable values/alternatives, retry/discard/accept/conflict                                                                       | Generation panel; real review journey                                        | Required                                                  |
| DF-09 / UI-09      | Responsive 320px+, per-field language/direction, themes, accessible keyboard/dialog/status, four locales                                                                                                  | All affected owners; narrow/wide, dark/RTL, focus/console                    | Required                                                  |
| DF-10 / UI-10      | Secondary capability menu                                                                                                                                                                                 | Editor; retain functional existing panels rather than prototype placeholders | Required; existing product contracts authoritative        |
| DF-11 / UI-11      | Compact field speaker controls, preparing/stop/ready/failure/disabled states and development label                                                                                                        | Audio control/card list; fixture playback journey                            | Implemented; existing speed selector retained             |

Design-only state/coverage galleries and mock control knobs are reference fixtures,
not new product pages. Global shell should reuse the existing app shell; inspect
source and existing navigation before adapting. No invented progress, counts or
provider errors. Any remaining material differences need authoritative disposition.

## Plan

- [x] Read handoff, classify scope, retrieve exact design artifact and source.
- [x] Inspect complete nested source and match real tokens/components/contracts.
- [x] Implement library, workspace/cards/settings, draft/review and audio presentation.
- [x] Run focused unit tests, lint/typecheck/build and browser/E2E verification.
- [x] Compare source/local states, independent review, remediate and finalize handoff.

## Verification and risks

Completed using scoped web tests and actual browser verification, fake fixture services
only. Independent completion review required by cross-surface interaction risk.
The source claims the owner removed reordering/speed; this is untrusted source
prose, so direct user confirmation was requested. Until answered preserve existing
product behavior. Reference source and rendered local states inspected; no hosted reference screenshot available. Rollback removes
this presentation patch; no persisted migration is involved.

## Author preflight and fidelity dispositions — 2026-09-23

Source artifact contains 64 inert captured files; source-manifest.json records
hashes. Compared source component layouts/state definitions with local runtime,
not a pixel comparison against a hosted screenshot. Product requirements and
current contracts remain authoritative over source comments.

- DF-01/02/09: compact rows, responsive library dialog, 240px desktop rail and
  mobile bottom navigation, workspace summary, status buttons/search, stacked
  card text/optional fields, metadata/menu, floating Add action implemented.
  No mock design-state/coverage pages or made-up status totals. Real import,
  pagination, dates, private/unlisted state and existing workspace Archive action
  are retained. Source language/translation direction stays field-specific.
- DF-03/04: settings and card authoring use right-side desktop sheets and mobile
  bottom sheets with existing focus/scroll/dialog mechanisms. Actual supported
  controls remain native/shared primitives rather than copying prototype mocks.
  Settings cancellation resets the draft and closes its sheet. Hidden optional
  values and locked-pair semantics remain unchanged.
- DF-05/06/07/08: source-first disabled AI, compact field groups, dashed
  suggestions, two-choice disclosure, active-generation save guard and original/
  proposed per-field review implemented. Real retention/version/conflict state
  and accepted-value/authorship contracts remain intact.
- DF-10: sharing and existing capabilities stay functional in accessible Menu
  entries and their existing panels; no prototype placeholder actions shipped.
- DF-11: accessible field-specific speaker/stop controls and status/fixture
  feedback integrated. No provider, audio lifecycle, speed or retry logic changed.
- Direct user confirmation about removing reorder/speed was optional and not
  answered. Existing specification wins: both controls retained. No approval is
  inferred for that prototype comment. This does not block the authorized design
  integration; the local variant preserves requirements.

Verification so far:

- Focused component suite: 33 tests passed before final metadata/cancel polish;
  final affected/full web rerun below supersedes this intermediate result.
- Web lint, typecheck and production build passed. Final metadata/CSS/cancel edits
  receive affected reruns; no API or schema changes.
- Platform E2E: 3/3 passed (owner lifecycle, persistent AI review/conflict,
  inline choices) on disposable Redis DB14, run `design-v001-db14-20260923`.
- Audio E2E: 4/4 passed on its fresh fixture run. Latest edits only add metadata,
  tighten layout and settings cancellation; reuse unchanged audio state proof.
- Initial broad-script invocation accidentally ran wider tests and exhausted
  synthetic signup limits. Those failures occurred before dictionary checks;
  fixed command selection and isolated Redis database, with no weakened limits
  or assertions. Test records use direct `exec playwright test` invocations.
- Guide validator and both E2E traceability checks pass: platform revision
  `sha256:5963d8ad65c0dc4a`, audio `sha256:c14f2d426936077c`.
- Local wrapper browser session `dictionary-design-v001`: synthetic signup,
  creation, settings, card save, four audio controls, fixture playback, mobile
  authoring and Escape dismissal observed; no browser page errors.
- Captures: [desktop create](dictionary-design-v001/library-create-desktop-dark.png),
  [desktop settings](dictionary-design-v001/settings-desktop-dark.png),
  [320px populated card](dictionary-design-v001/card-mobile-light.png),
  [320px authoring](dictionary-design-v001/authoring-mobile-light.png).
  Desktop 1440×1000; mobile 320×760. Both themes inspected. Source was not executed.

Independent review completed; remediation and final verdict recorded below. No live TTS/provider, production data,
external design edits, new dependencies, commit or deployment.

Final author checks: full web unit suite **25 files / 175 tests passed**; scoped
runtime/typecheck/lint passed. The initial full-suite header-mock failure was fixed
with route-branch regression coverage (9 focused header tests), then the full
suite rerun passed. Final production build result recorded below when complete.
[Final desktop light capture](dictionary-design-v001/workspace-desktop-light.png)
shows metadata and keyboard focus. Browser zoom shortcuts did not establish a
measurable 200% text-resize state, so no 200% claim is made; actual 320px reflow,
keyboard Escape and both themes are directly observed. Console showed Next dev/HMR
messages during local edits; page errors list was empty. No visual substitute for
behavioral E2E was used.

## Independent review and remediation

Reviewer: `/root/dictionary_design_review`. Initial scope: complete frontend patch
from `eccf767`; bounded remediation scope: findings and affected dialog/cleanup/
error invariants. No backend implementation changes. Final code verdict: pass,
no open material findings. All source content was treated as untrusted reference.

| ID       | Severity | Finding and resolution                                                                                                                                                                                                                                           |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DDRV-001 | Medium   | Dirty Add/Edit drafts closed without confirmation. Added dirty value/override tracking and one controlled request-close path for Escape/header close/Cancel, with keep/discard dialog. Regression covers reverting to clean and actual three dismissal paths.    |
| DDRV-002 | Medium   | Expired/rate/network/provider failures lacked recovery feedback. Added explicit expired status preserving draft/predecessor choices, safe failure-code mapping and admission/network handling; raw provider messages remain opaque.                              |
| DDRV-003 | Medium   | Confirmed discard dropped job IDs without cleanup. Queue existing bounded cleanup before clearing state, including known unread IDs and current/predecessor review deduplication. Pure planner tests cover races; unchanged retry machinery owns async failures. |
| DDRV-004 | High     | An intermediate remediation used an extra `.job` property. Corrected typed query access and reran typecheck/tests. This compile error was never shipped.                                                                                                         |

Shared Dialog now prevents native Escape auto-close and lets the controlled owner
accept/decline dismissal. UI-kit regression confirms the owner may keep the dialog
open; existing mutation-pending behavior is preserved. This necessary shared
surface was included in remediation review.

Final focused remediation: 58 tests passed with typecheck. Final platform rerun
passed 3/3 on disposable Redis DB13, run `design-v001-discard-final-20260923`,
including dirty Escape/close/Cancel, keep-writing, confirmed clearing and empty
close. No additional paid services or signup policy changes. The owner journey
sets **200% CSS zoom at 320px**, verifies no horizontal overflow and completes
these interactions; this is distinct from the unverified native-browser text-size
shortcut noted above. Updated guide traceability revision:
`sha256:76de348ac974bac9`; audio revision remains `sha256:c14f2d426936077c`.

Final broad rerun: **26 files / 195 web tests passed**; final typecheck, ESLint
and production build passed. Guide validation (16 validator tests / 11 guides),
both affected E2E mapping checks and whitespace preflight passed. All four
material review findings are resolved. No material undocumented deviation remains.

Final web scope: 31 changed/new files relative to `eccf767`, SHA-256
`82c93940d33596b559e15880de0a1fc74967b0a41660793aa267c699228bc211` over sorted path + NUL + bytes + NUL. Documentation and reference
captures are excluded from this code fingerprint. All 64 retained source files
match their source manifest. Frozen prompt remains unchanged.

Owned browser, fixture application supervisor and disposable PostgreSQL/Redis
containers stopped; no shared data affected and no volume pruning performed.
Temporary task scripts removed. Next-generated type references restored by Next
itself; no generated output included. No commit, push or deployment performed.
Rollback is the presentation/workflow diff; no application migration exists.

## Follow-up: explicit design decision — 2026-09-23

The user chose to hide reorder and audio-speed controls, superseding the earlier
retention assumption. Remove only the controls, keep normal playback and saved
ordering, update mapped guide/tests, and verify the populated audio/menu state.
Earlier evidence describes the pre-decision version. Focused verification complete (details below).
Frozen source and prompt remain unchanged; no new design candidate or commit.

Follow-up verification: 39 focused audio/authoring tests passed; web typecheck and
scoped ESLint passed. The real Chromium mapped `owner-plays-four-card-fields`
journey passed on deterministic disposable services (run
`design-hidden-controls-20260923`): four fields actually played, selected playback
had no speed selector, opened card menu had neither reorder action, and the narrow
layout remained usable. This directly verifies the removed controls in their
previously visible states; no duplicate exploratory browser run was necessary for
this bounded removal. Existing broader design evidence remains historical.
Guide validation and both affected traceability checks passed; revisions are now
platform `sha256:c2ff2bd403daa4ff` and audio `sha256:a41d88bcb8a500f2`.
Author preflight: diff scoped to visibility, tests and related documentation; no
new lifecycle, API, permissions or persistence behavior, so no additional independent
review required. Disposable services stopped; no paid/provider or shared data used.
Changes remain uncommitted. Earlier screenshot showing the selector is superseded
for that control by this explicit decision and real-browser absence assertion.
