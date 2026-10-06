# Improvement: Sentence practice UI fidelity

Status: Complete
Created: 2026-10-06
Updated: 2026-10-06

## Routing and scope

Focused existing-contract UX improvement, authorized by the user's request to
implement the full sentence practice UI from Magic Patterns version 8. Work in
`/Users/nickkotov/projects/languon` on `feature/sentence-practice-assistance`, already
checked out there. The earlier combined work was committed as 5b8b135;
this incremental UI improvement has no commit/merge authority. Baseline preserved in `/tmp/languon-sentence-ui-baseline-20261006`.
No backend, controller, API, persistence, credits, dependencies or Git lifecycle
changes. Escalate before crossing those boundaries. Revert only this incremental
presentation patch to roll back; preserve the baseline.

## Source and acceptance

User-selected source: https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4,
version 8 artifact `c9d7bdb9-7c33-4960-b2da-776b5f4091c2`. Retrieved through
Magic Patterns MCP, including all19 practice components, controller/context,
fixtures/utilities and all eight practiceStates groups. `/screens` currently
uses active artifact d9db6025-b8b7-4faf-87c2-65d51b0f9814. Reinspection
on 2026-10-06 confirmed all 14 selected active source files match preserved v8
after trailing whitespace removal; no visual source revision is needed. See
[evidence/design-source.json](evidence/sentence-practice-ui-fidelity/design-source.json).
Feature038 DESIGN.md retains the selected immutable v8 source and provenance.
Follow ADR0005/0016/0017 and the existing shared Dialog/Button/IconButton/Textarea.

| ID   | Source requirement                                                                                                                   | Owner and verification                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| UI-1 | Compact single-row header, title/dictionary, sentence/word progress, settings/history/fullscreen/close icons; inline views with Back | SentencePracticeSession; desktop/narrow and inner-view browser evidence |
| UI-2 | Canvas background, centered768px body, white bordered sentence card, direction badge, 3-row answer                                   | SentencePracticeSession; draft/RTL/dark browser evidence                |
| UI-3 | Solid required and dashed context hints, distinct opened surfaces, elevated hint card and icon legend                                | SentenceWithHints; keyboard/repeated/RTL existing tests and browser     |
| UI-4 | Skip left; free and AI actions right; next after finished answer; stable bordered footer                                             | SentencePracticeSession; checks/reference/skip/replay mapped journey    |
| UI-5 | Score/rating icon, correction numbering, feedback spacing; dashed neutral reference panel                                            | SentenceContent/ReferenceComparison; populated browser states           |
| UI-6 | Retain setup, recovery, results/replay, personal history/preferences and leave guard contracts                                       | Existing feature038 implementations and affected tests/journeys         |

The user explicitly requires logic preservation. Retain both underlying free
reference mechanisms through the source's single conditional action: reveal with
an empty answer, compare with a typed answer. Existing type-specific failure
notices and guarded modal mechanics remain authoritative. Do not import
simulation, scaffold, mock models or data. External rendered reference captures
are unavailable through the MCP; source comparison is available, but rendered
reference fidelity remains unverified.

## Plan and verification

- Implement presentation only and inspect an incremental diff against saved baseline.
- Run affected sentence tests, web typecheck/lint, formatting and guide mapping.
- Use maintained real Chromium journeys with owned disposable PostgreSQL/Redis,
  fake provider and screenshots; inspect narrow/wide/dark/draft/reference/feedback.
- Independent review justified by full-screen action/navigation layout changes.
- Guide prose changes only if existing behavioral promises/source mapping change.
  No new journey or backlog task completion; feature038's broader Git gates remain
  outside this improvement. No automatic commit/merge/push.

## Evidence and remaining work

Presentation implementation, focused checks, generated-output hygiene and independent remediation review are complete. Original source/controller logic is the baseline. HEAD is 5b8b135.

## Author preflight, 2026-10-06

Incremental diff changes five existing production presentation files, adds two focused header/footer components and changes two tests; controllers, hooks, API clients and backend are untouched. The stored baseline is preserved; no staging/commit/merge is performed. Header/source/answer/footer surfaces use existing semantic tokens and primitives. Existing direction/mode/feedback metadata stays in the body badge to preserve the configuration contract, instead of the previous three-line header. Last-sentence notice comes from the existing roundComplete flag. Empty earlier-attempt disclosure is hidden until records/loading/errors exist. Settings/history content and guarded closing retain existing app contracts.

87 focused unit/UI/controller/reference/API tests pass (five files). Web typecheck and scoped ESLint pass. User-flow presentation prose and mapped revision sha256:164560e61d2cb598 are synchronized; commands and underlying behavior are unchanged. One pre-existing hint test used the stale pre-feature038 accessible name; its role-bearing name is now matched without weakening its repeated-hint assertions. The E2E results assertions target headings because the source-designed header also announces Round complete. Browser proof is recorded in [browser-final/manifest.json](evidence/sentence-practice-ui-fidelity/browser-final/manifest.json), with SHA-listed images and the intermittent failure trace. Three selected journeys passed across the final run and isolated rerun; the timestamp issue is retained below. Root visually inspected the final desktop dark draft and light finite-round results screenshots.

External rendered reference is unavailable. This patch implements the inspected v8 source; no rendered reference comparison or pixel-exact fidelity is claimed. UI-6 reuses the established feature038 setup/results/settings/history/recovery contracts; their model/routing/privacy mechanisms are intentionally not replaced with prototype simulations.

## Verification finding — pre-existing completion timestamp inversion

The finite-round browser scenario remained on generation even though the owned
fake worker returned a completed job. In one job's synthetic trace, the running
snapshot was updated at `2026-10-06T10:04:55.598Z`; the later completed snapshot
was updated at `2026-10-06T10:04:54.891Z`. The unchanged controller correctly
applies its existing ordering guard and ignores that older timestamp, leaving
the pending UI. No presentation code changes these job timestamps or acceptance
logic. An isolated rerun passed without any source or test changes (1/1, 1.3 minutes).
The owner/reader and RTL/Japanese scenarios passed in the preceding final run
(2/3, with the finite scenario showing the inversion). All three selected
scenarios therefore passed across the final run and isolated rerun. This is
retained as an intermittent pre-existing risk, not silently erased by the pass.
The user has been asked whether to retain the explicitly requested UI-only scope
or authorize a separate completion correction.

Independent initial review found only UI-FID-R1: generated Next declaration paths
and three task-owned build directories must be restored/removed after runtime.
Header/footer conditions, all source inventory and existing product behavior
otherwise passed review.

UI-FID-R1 is resolved: after disposable app teardown, Next declarations were
restored through the canonical generator (no next-env diff), all three task-owned
output directories were removed, and the final typecheck/diff check passed.
Independent remediation review passed with no material remaining findings.
The existing build remains valid because production source did not change.

## Handoff

The original UI-only instruction remains the active scope while the optional
follow-up question is unanswered; no generation/controller/backend logic was
changed. The pre-existing timestamp inversion remains a separate follow-up.
All 87 focused tests, scoped ESLint, web typecheck/build, 19-guide checks and
mapping checks passed. Three selected browser scenarios passed across final and
isolated runs with the failed trace retained, as described above.
No commit, merge, push, private environment changes or paid model calls were made.
Rollback is the focused presentation/test/doc diff, preserving controller and API
contracts. Final browser source hashes match current production files.

## User-reported fidelity remediation — 2026-10-06

Reopened after the user identified incorrect header/footer controls, misplaced
generation/checking status, and misplaced Two ways to check. The earlier
completion evidence did not adequately account for these deviations.

Source re-read: active artifact d9db6025-b8b7-4faf-87c2-65d51b0f9814
PracticeBody/PracticeActions/ReferenceCompare/JobStatus and common/IconAction.
Button.tsx is empty in both selected provider artifacts; the runtime button
sizes/radii are explicitly matched by preserved index.css control tokens
(36/44/52px and radius12), so preserve the shared primitive.

Corrections: circular outlined32/40px header icons with source hit targets;
source footer labels/states and one free action (blank draft reveals, nonempty
compares), removing the extra footer reference control; source status card with
indeterminate bar after the generation skeleton or immediately after the draft
during checking, including fresh-round preparation on results; place the
reference explanation after latest and earlier AI feedback. Controller and
backend files remain unchanged. Footer AI action remains visible but disabled
during generation, as in PracticeActions. New source translations cover ru/fr/es.

Verification/review of this remediation is in progress. Earlier screenshots are
historical and do not establish fidelity of this incremental patch.

### Remediation author preflight and review findings

91 focused tests pass across sentence-training-ui, sentence-training-state,
sentence-training-review-regressions, sentence-training-api and
reference-comparison after the final production patch. Scoped ESLint, formatting
and the isolated web production build pass. Guide revision
`sha256:d6d7a5db8d528e52` matches maintained E2E; all16 validator tests and19 guide checks pass.
Controllers, hooks, model/API clients, backend and dependencies are untouched.

Independent reviewer identified and root resolved:

- UI-FID-R2, Medium: footer comparison label must use the exact source and
  translated key `Compare with reference — free`; fixed, along with source Skip.
- UI-FID-R3, Medium: stopping must change the status title and retain the source
  credit disclosure; fixed and strengthened the existing cancellation regression.
- UI-FID-R4, Medium: inline settings/history header must say `Your answer and
exercise are kept`; fixed and localized instead of showing the dictionary name.
- UI-FID-R5, High: treating an over-limit nonempty answer as empty changed free
  comparison into reference-only review. Fixed draft detection to use only trimmed
  emptiness; the length limit applies only to AI checks. Regression verifies
  recompare and no reveal or paid call. The first run exposed a missing mock action
  in this test fixture, which was corrected; final91 tests pass with no unhandled
  errors.

Independent code remediation review resolves R2/R3/R4/R5 with no further material
finding. Final fresh browser evidence and post-runtime cleanup disposition are
pending. The first browser rerun is diagnostic only: edits during execution
caused stale compiled selectors to await the old comparison label. Final tests
run from stable source; the failed diagnostic is retained rather than counted as
passing evidence.

### Fresh remediation verification

- Final deterministic browser run:3/3 maintained Chromium journeys pass in40.8s,
  with19 screenshots. Root and independent reviewer inspected the generation,
  checking, idle footer, stopping and inline-view captures. Production source
  hashes in `remediation-browser/tested-source.json` match current files.
- [Manifest](evidence/sentence-practice-ui-fidelity/remediation-browser/manifest.json)
  records ports, fake-provider safety, console/request assertions, source hashes
  and screenshot checksums. The obsolete-label diagnostic run is retained in
  `remediation-browser/diagnostic` and is not counted as passing evidence.
- Exact source controls/card classes and DOM placement were independently
  checked. External rendered reference comparison remains unavailable. The
  one-word browser fixture transitions directly to results, so populated nonfinal
  feedback followed by the explanation is established by the actual-session
  DOM-order regression instead of a browser screenshot.
- Owned web/backend processes and PostgreSQL/Redis containers stopped; both
  `.next-sentence-ui-*` build directories removed. Next declarations regenerated
  through Next's canonical writer. Post-cleanup typecheck, scoped ESLint and diff checks pass.
- The prior unrelated nonmonotonic job timestamp risk remains outside this
  UI-only scope. It did not reproduce in the fresh remediation journeys.

No feature, contract, data, environment or runtime dependency changes were made.
The existing backlog004 link remains current. No commit, merge or push was made.

Final independent remediation review: **Approve**, no material findings remain.
All four follow-up findings were resolved and reviewed against the final source
hashes, browser evidence and post-runtime cleanup. Status: **Complete**.

User authorized a local commit after verification. Large diagnostic browser
trace archives are retained locally under
`/private/tmp/languon-sentence-practice-ui-traces-20261006/`, preserving their
relative evidence paths. They are excluded from Git because trace archives can
contain local authentication transport details. Committed evidence includes
screenshots, manifests, source hashes and records; screenshot checksum lists omit
the local archives. No push or merge is authorized by this commit request.
