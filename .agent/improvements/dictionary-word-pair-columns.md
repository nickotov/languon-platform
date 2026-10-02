# Improvement: Responsive dictionary word-pair columns

Status: Complete
Created: 2026-10-01
Updated: 2026-10-01

## Routing decision

Existing-contract UX improvement implementing original backlog task 2 (BL-001).
Two related surfaces exceed a one-screen correction; no new capability, journey,
API, persistence, security policy, dependency, or architecture commitment.
Escalate before crossing any feature boundary. Current branch; no automatic commit.

## Context and scope

Source and Translation currently stack and are separated by assistance/context in
the inline form. Group them first, keeping labels, generation and audio local.
Use component-local Grid/container queries: editor columns at viewport >=768px
and content >=36rem, list columns at container >=40rem. Otherwise stack Source
above Translation. Widen desktop editor cap from 672px to the recommended 880px;
retain mobile sheet. Optional fields, metadata, context and settings stay full width.
Owned active/archived lists share the layout; public sharing is unchanged.

Preserve generation, autosave, history, validation, language/direction and tab order.
Reuse existing Field/Button/Card, runtime tokens and CSS Modules (ADRs 0005, 0016,
0017). Related guide: `docs/user-flows/dictionary-platform.md`.
Rollback: revert presentation and matching stories/guide/tests; no migration.

## Acceptance criteria

- AC-1 — Add/Edit show equal Source/Translation columns when space permits;
  stack in narrow containers/mobile. Both precede context and assistance.
- AC-2 — Active/archived owner cards show equal word columns when space permits;
  optional content/metadata remain full width and row actions remain accessible.
- AC-3 — Long values, localized labels, RTL/LTR, audio, generation progress,
  keyboard navigation and 200% text scaling remain usable without overflow.
- AC-4 — Existing authoring behavior is unchanged; stories, mapped regression
  assertions, guide traceability, static checks and real browser evidence agree.

## Plan

- [x] Implement local form/list layout, desktop width and representative stories.
- [x] Extend existing mapped journey assertions and synchronize guide.
- [x] Run web tests/lint/typecheck/build and proportional real browser/E2E checks.
- [x] Author preflight and independent completion review for responsive uncertainty.
- [x] Record valid evidence, update backlog and inspect focused final diff.

## Verification strategy

Existing authoring unit suite protects unchanged controls/state. Real layout
geometry belongs in existing Playwright journeys (desktop/tablet/320px/200% text),
not unit tests asserting CSS classes. Safe-wrapper browser checks rendered layout,
keyboard and representative long/RTL/localized states. No backend/database suite
or security review: no corresponding behavior changes. E2E uses disposable local
DB/cache and deterministic adapters, never paid models. No new harness or complex
cross-app behavior: reviewer can assess evidence without a separate tester.

## Verification — original word-pair delivery

| Check                       | Result                                                  |
| --------------------------- | ------------------------------------------------------- |
| Web tests                   | 287 tests / 34 files pass                               |
| Web lint/typecheck/build    | Pass, including final E2E-file lint/typecheck           |
| Real browser and mapped E2E | Owner and two inline journeys pass; wrapper checks pass |
| Guide/mapping validation    | Pass, revision sha256:e9b24ef136c12fa1                  |
| Independent review          | Pass, no material findings                              |

## Outcome and evidence

Base: `94c78b2`. Final runtime/stories/E2E diff SHA-256 (from
`git diff -- apps/web/src apps/web/tests/e2e/dictionary-platform.journeys.spec.ts | shasum -a 256`):
`8bcdbdb4a211f20ba5162a7d506d30d7d7c2df4ba60de3c3b2dcc8c0eeea140a`.
Only story whitespace formatting followed the passing static checks; runtime
source is identical. E2E owner field-geometry correction was rerun successfully;
inline scenarios and their runtime paths are unchanged, so their evidence remains
valid. Final lint/typecheck include the complete mapped-file patch.

- AC-1/2: local container queries and pair grouping, desktop dialog cap880;
  no state/hook/API changes. Form now 235 lines; story additions are static
  fixtures, not production component responsibilities. Existing private CSS
  imports in untouched siblings are unchanged, not new coupling.
- E1: `pnpm --filter @languon/web test` passes 287 tests/34 files;
  `lint`, `typecheck`, `build` pass (webpack production builder). Runtime source
  and stories unchanged since these checks; subsequent changes only add mapped
  E2E assertions and guide prose. Production browser execution is not claimed.
- E2: selected Chromium journeys use `AUTH_E2E_REUSE_SERVERS=true`, disposable
  DB `languon_dictionary_columns_e2e` at127.0.0.1:55482, Redis at56382, web3335,
  backend4002. API compatible v1/v2/v3 formats, disabled credit/managed routing,
  deterministic worker, synthetic data, no paid models. Exact command:
  `pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts --grep 'owner creates, edits, archives, and restores dictionary content|creates the displayed local version|automatically saves full inline forms'`.
  Two inline journeys passed (8.3s/5.7s). Initial owner assertion incorrectly
  compared input baselines when Source label/action wrapped at768px. Replaced
  it with full Field geometry (wrapping is permitted); owner-only same command
  with `--grep 'owner creates, edits, archives, and restores dictionary content'`
  passes (5.9s, total11.2s). No implementation changes were needed. Proves Add/Edit,
  active/archive geometry, full-width optional content, tablet/320px/200% scaling,
  200-character draft containment, keyboard order, lang/dir, and retained lifecycle.
  Five unrelated dictionary scenarios not rerun; no new journey or harness.
- E3: `pnpm browser:check` passes nine wrapper tests and real headless launch;
  agent-browser0.33.0, Chrome152. Task session
  `languon-dictionary-columns-3bb1c793d34318b41dca2170cf8c45ac`.
  Synthetic Arabic-English dictionary: 200-character values, desktop1280x800,
  tablet768x900, narrow320x800, English/French labels, Add/Create/Edit/list,
  field-local regeneration and fixture audio buttons. Source RTL/Translation LTR
  remain local; narrow actions and footer reachable. Screenshots in
  `/Users/nickkotov/.agent-browser/tmp/screenshots/`: `screenshot-1790876950620.png`
  (desktop long pair), `screenshot-1790876957546.png` (narrow),
  `screenshot-1790877071987.png` (French list/audio),
  `screenshot-1790877136335.png` (French tablet),
  `screenshot-1790877144392.png` (French narrow),
  `screenshot-1790877183137.png` (narrow list). No browser exceptions; ordinary
  HMR/devtools notices. Reviewed loopback network only; initial anonymous401
  expected. Text scaling evidence is Playwright, not wrapper zoom.
- E4: guide and mapped test revision checks pass; stable scenario IDs preserved.
  Bounded independent worker owned only guide/E2E file. Main owns UI/integration.
- Author preflight: acceptance maps to E1–E4; no public/shared/back-end changes,
  secrets, temporary instrumentation or production dependencies. Independent
  review requested for CSS containment and responsive coverage uncertainty.
- Browser session and task-owned web/backend closed. Exact auto-remove containers
  `languon-dictionary-columns-postgres` and `languon-dictionary-columns-redis`
  validated and stopped; only their disposable synthetic data was removed.
  Existing development servers at3333/4000 and shared local infrastructure were
  left untouched. Generated Next declarations restored with Next's own
  `writeAppTypeDeclarations` generator to the normal `.next/dev` configuration;
  no generated-file edits remain. Fixture audio interaction reached the Stop
  state without browser exceptions.
- Independent initial completion review by `columns_completion_review`: entire
  nine-file tracked diff from `94c78b2` plus this untracked record; generated
  declarations clean/excluded. Reviewer independently confirmed runtime patch
  hash above, inspected responsive browser captures, source/control paths, guide
  mapping and test evidence, and found no material defects. Reviewed tracked
  patch SHA-256: `715610a6b83c96b72d91f3bf6f0e27ace051eb31db69b759dde4781ce330ef1b`.
  Closure-only stale record fields reconciled; no implementation remediation.
  All AC-1–4 satisfied. BL-001 now records both original tasks as implemented.

## Remaining risks

Chromium and representative English/French states
verified; other browser engines and the full locale/state cross-product were not
run. No known product ambiguity or unresolved implementation defect.

## Follow-up: example pair

User requested the same equal desktop columns for Example and Example Translation.
Extend the same Add/Edit and active/archived owner-list surfaces and thresholds;
single enabled/populated example field remains full width. Preserve optional-field
order, languages/direction, generation dependencies, dormant values, audio and
autosave/history. Definition/transcription stay full width; public sharing unchanged.
This remains an existing-contract improvement. Prior evidence above is historical;
rerun affected web checks, mapped owner geometry and safe-browser rendering for
the extended patch. Independent remediation review covers example grouping and
the previous word-pair invariants, not a new delivery lifecycle.

- AC-5 — Example and Example Translation use equal columns wherever the respective
  word pair uses columns; otherwise stack. A lone example field fills the row.
- [x] Implement local grouping/layout and representative paired/single stories.
- [x] Cover paired/single presence in component tests and measured responsive E2E.
- [x] Verify scoped web checks, guide traceability and real browser rendering.
- [x] Review extended diff and record final evidence/status.

### Follow-up evidence and decisions

- Form groups example fields after other optional content, reusing the local
  responsive pair grid. Two-child selector avoids empty columns when just one
  field is enabled. Authoring form is 246 lines; no state or request changes.
- List retains semantic `dl > div > dt/dd` groups. Data field attributes let the
  component-local container query pair only two visible examples, leaving all
  other rows full width. Conditional borders keep dividers coherent with or
  without preceding Definition/Transcription. Disabled/empty fields are not
  newly surfaced. No migration, shared component or public sharing change.
- E5: fresh `pnpm --filter @languon/web test`: 290 tests/34 files pass (12.29s).
  Three new tests preserve dormant translations with one enabled example and
  check both inverse single-populated cases with language/direction intact.
  All existing auto-application/history/save tests retained and passing.
- E6: web `lint`, `typecheck`, `build` pass; webpack production build rerun after
  final audio containment CSS. Final mapped-test lint/typecheck also pass.
- E7: same selected owner plus two inline Playwright journeys, new disposable DB
  `languon_dictionary_examples_e2e` and containers
  `languon-dictionary-examples-postgres`/`languon-dictionary-examples-redis`, same
  loopback ports and deterministic formats/adapters as E2. Both inline journeys
  pass. New example language assertion initially ambiguously selected the audio
  span as well as value span; corrected to the first value span. Owner then
  passed paired/single field geometry. Final owner-only rerun adds audio-button
  containment at all measured sizes passes (6.5s, total12.0s). An initial new
  assertion required audio on archived cards; corrected to preserve the existing
  lifecycle contract: active buttons visible/contained, archived buttons absent.
  The existing browser-error observer also rejects unexpected HTTP failures;
  final owner run records no unexpected console/page/response errors.
  One repeat run hit accumulated
  synthetic signup quotas before authoring; restarted the owned backend with a
  fresh test-only auth namespace, preserving production rate-limit behavior.
- E8: safe-wrapper Chrome session
  `languon-example-cols-b353ea9d8495a8d5bdc697ba61ae17ab`; long Arabic-English
  examples in Add/Edit/list at1280x1000 and320x1000, field-local actions and
  audio. Real visual check found audio flex span shrinking/clipping in half-width
  cells. Fixed text flex/shrink, audio non-shrink/max-width, and wrapping locally
  in the list; added E2E containment assertions. Fresh task-owned Next distDir
  `.next-example-columns` used to ensure final CSS rendered rather than prior
  development assets. Observed final audio wrapper40px, flex-shrink0, and its
  button fully inside the row. Screenshots in the same directory as E3:
  `screenshot-1790880778105.png` (desktop form),
  `screenshot-1790880811763.png` (narrow stacked examples),
  `screenshot-1790881210588.png` (final desktop list/audio),
  `screenshot-1790881398627.png` (final narrow list/audio).
  No browser exceptions; HMR/devtools notices only. Unsaved fake draft discarded,
  wrapper session closed. Inverse single translated example covered by unit
  tests, not claimed as a completed manual journey. No paid models/audio used.
- E9: guide revision `sha256:b91834a1f50d7cf0`, stable scenarios preserved;
  bounded worker owned guide/E2E only. Author preflight finds no API/security/
  state changes or unrelated source edits; author preflight and independent
  review complete.
- Tested final runtime/stories/tests diff from `94c78b2` (including unit tests),
  `git diff -- apps/web/src apps/web/tests | shasum -a 256`:
  `e2807d60e7feda4baf3eedbc161e0c9cc7f2b0039cbb43a093f9c502104f7537`.
  E5 tests still valid after CSS-only audio containment changes (no JS/units
  altered). Final build, lint/typecheck and owner E2E include these changes.
  Two inline journeys retain validity: their form/state paths and assertions
  were unchanged by list-only audio CSS and owner-only helper changes.
- Task-owned servers and both validated disposable containers stopped/removed;
  only fake test data was deleted. Existing3333/4000 development services were
  untouched. Next declarations restored through Next's own generator. Fresh
  task-only generated cache moved recoverably out of the worktree to
  `/private/tmp/languon-example-layout.hRPpIO/next-example-columns`; no generated
  or dependency files remain in the diff. No commit or push performed.
- Independent follow-up review by `columns_completion_review` covered AC-5's
  optional rendering/audio surface and preserved AC-1–4 invariants; unrelated
  lifecycle paths were not reopened. Reviewer independently confirmed final
  runtime hash above, current guide revision/mapping and clean diff, inspected
  final desktop/narrow captures, and found no material findings. Final checks:
  290 tests/34 files, web lint/typecheck/build, owner responsive/audio E2E,
  two unchanged inline journeys, browser evidence and guide checks pass.
  Current recorded status is Complete for both original work and this extension.
  Residual limitation: Chromium and representative combinations only; inverse
  lone Example Translation is unit-covered and uses identical one-child CSS,
  but is not claimed as separate manual rendering evidence.
