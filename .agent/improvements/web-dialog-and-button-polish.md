# Improvement: Web dialog actions and contextual icon-button polish

Status: Complete
Created: 2026-11-11
Updated: 2026-11-11

## Scope and authority

Existing-contract UX improvement authorized by the user's web-wide audit/polish
request. No new journey, API, persistence, auth/billing policy or dependency.
Baseline63645ef5, initial tree clean. Keep existing handlers, form submission,
loading/disabled state, focus return, editor selection and confirmations.
Root/web AGENTS, ADR0016/0029/0054 and the existing UI kit remain authoritative.
Revert the scoped patch to remove; no data/config migration.

## Discovery and direction before implementation

Read shared Dialog/DialogActions, Button/ButtonLink, IconButton and Tooltip plus
relevant prior texts-ui-and-shared-popovers/learning-dialog-presentation records.
AST inventory found66 direct Dialog/AlertDialog/BottomSheet uses; footer forms
include DialogActions, raw fragments, and custom grouped notes/actions. Native
command/navigation dialogs contain intentional vertical content and are not
footer rows. DialogActions currently wraps, while raw footers have no action
layout. Desktop rows must handle long localized labels without clipping: allow
label wrapping within a button rather than wrapping buttons into another row.
Mobile can retain sensible reflow. Preserve structured footer notes/progress.

Read-only ui-designer audit covered515 paired Button uses in216 non-story
pages/widgets/features files,64 ButtonLinks in36 and110 native buttons in57.
130 have icon props,42 already use desktopIconOnly. These are syntax counts,
not proof every abstraction/alias/rendered consumer was inspected. Selected
contextual candidates: repeated sentence row actions/filter reset/selection,
flashcard mode/end/pagination/undo, chat back/new/copy and profile refresh;
raw editor/composer/resource/password/context-removal icons need shared labels
and tooltips. Keep primary creation/save/AI/accept/rating/confirmation labels and
ownership/scope distinctions visible. Reuse existing responsive Button pattern:
icon plus accessible label/desktop tooltip, mobile text for those actions.

Only utility label tooltips should be desktop-only; explanatory help remains
available through the ordinary Tooltip contract. Native top-layer and editor
mouse/keyboard behavior must not change. Do not add a new UI library.

## Acceptance

- AC1: Desktop dialog action groups occupy one row, including raw footers and
  known custom wrappers, without label loss or viewport overflow; mobile usable.
- AC2: Contextually redundant utility text uses existing accessible icon patterns
  and desktop tooltips; task/confirmation labels stay visible.
- AC3: Semantics, focus, editor selection, disabled/loading, submission and
  confirmation behavior remain intact; tooltips stay in the native dialog layer.
- AC4: Useful isolated shared/leaf stories, affected guide mappings and focused
  component/browser evidence cover representative layouts and interactions.

## Ownership and selected verification

Root owns shared primitives, dialog consumer layout audit, stories/docs and build/
browser integration. Two workers may own nonoverlapping utility-callsite groups;
no duplicate compilers or whole-suite runs. Record actual source/evidence scope.

Checks planned before edits: shared ui-kit tests plus exact affected sentence/
flashcard/chat/profile/editor component files (selected after callsites settle,
~10–30s); scoped ESLint/Prettier/styles and one web typecheck (~15–30s); existing
Storybook at loopback6007 for native DialogActions/raw footer/long labels and
desktop-focus/mobile tooltip states (~2–4min); one production catalog build
(~2min) because shared primitive stories/props change. Run affected app critical
selections only for materially distinct touched orchestration: chat snippet
journey and knowledge formatting if editor wrappers change (~1–2min each).
No backend/paid AI/DB policy changes or full shared-consumer suite by default.
Guide/mapping and agent-skill validation when applicable (<10s). A bounded source
and rendered review covers shared-layout/tooltip/focus blast radius; no material
security-policy change, so no automatic security or separate harness reviewer.

## Progress

- [x] Inspect shared components and cross-surface source audit.
- [x] Implement shared layouts and selected context-aware button fixes.
- [x] Verify isolated and real-app behavior; resolve bounded review findings.
- [x] Final independent evidence approval and record closure.

## Evidence and remaining risks

Verified. Main reviewed risks were long localized footer labels, custom wrapper overrides,
tooltip wrappers changing flex layout, touch/keyboard modality and editor selection.
No automatic commit/merge; preserve unrelated work.

## Final implementation and evidence

Shared desktop footer and DialogActions rows now do not wrap; the rule applies to
body action rows too. Long labels wrap inside equal-height buttons instead of
being clipped. Helper notes use separate rows. Custom library/learning/proposal/
dictionary/sentence footers reuse the shared grouping; the footerless body-form
sweep covers dictionary settings/card/sharing, batch/document review, chat delete
and sign-in. Stage actions, navigation, format/answer choices and inline content
controls retain their intended layouts.66direct JSXuses include wrapper
implementations, not66distinct rendered windows; this is source coverage plus
representative render proof, not an exhaustive screenshot of every consumer.

Responsive utility actions retain mobile text where applicable and accessible
names at all sizes. Label tooltips use the same768px breakpoint as responsive
icon labels, including keyboard focus and resize cleanup; generic explanatory
help/disabled reasons keep their ordinary contract. Raw icon controls retain
actual buttons, refs, submit types and selection-preserving mouse handlers.
Tooltip triggerClassName preserves password absolute positioning, toolbar
responsive hiding and flex sizing. No auth, model, accounting, transport or
backend behavior changed. No dependencies installed.

### Automated coverage

281unique focused component cases pass across the selected files:

- Shared ui-kit29, including desktop/touch resize, tooltip keyboard dismissal and
  trigger identity; /private/tmp/languon-dialog-kit-tests-final.log (2.52s).
- Utility22 across flashcard-training-manual-selection, conversation-history-rename,
  shared-knowledge-assistant-actions and credit-balance.
- Raw icon27 across auth-forms, knowledge-block-mentions and
  knowledge-workspace-block-selection; added a real-editor selection/pressed-state
  regression, preserving the original mouse-prevention behavior.
- Custom footer94 across dictionary-library, flashcard-training-setup/interactions,
  knowledge-learning-block-editor, knowledge-block-proposals/proposal-refresh,
  dictionary-generation, sentence-training-ui/review-regressions. Initial concurrent
  editor import/test timeout was retained; isolated rerun15/15 passed without
  changing timeouts/assertions (other79cases remain valid).
- Additional library-copy/block-copy12, serial5.48s.
- Footerless body forms97 across dictionary-card-authoring, dictionary-batch-
  generation and dictionary-document-generation-panel, serial11s.

Source types pass (/private/tmp/languon-dialog-web-types-accepted.log), scoped
ESLint/Prettier/diff and styles contract pass. Typed optional triggerClassName now
permits ordinary CSS-module undefined forwarding under exactOptionalPropertyTypes.
Shared-knowledge assistant fixture failures were reproduced with original
ResponseActions, then repaired using canonical empty messages/turns and a local
QueryClientProvider with disabled query contexts; production logic/assertions were
unchanged. No network was introduced to unit tests.

The production catalog built all modified runtime and story modules successfully
(/private/tmp/languon-dialog-storybook-build-accepted.log). After that build, only
the new footer story's initial open boolean changed for immediate isolated preview;
its actual current Vite rendering is verified. This does not change module imports,
types, layout code or compilation requirements. Earlier build reports predate
batched layout repairs and are not final runtime evidence.10new story variants:
shared footer3, sentence row3, real block-editor/footer4.

Two exact critical selections passed1test each,0skips, run
e2ecc8e0-34ea-4aef-b5a7-b265017120e4, /private/tmp/languon-dialog-critical.log:
knowledge-document-formatting (39.222s including setup/cleanup) and
dictionary-chat-snippets (27.574s), total67.506s/build0.701s. These exercise real
Next/backend/PostgreSQL composition with synthetic external AI, rich-text
selection/preview/native-modal tooltips, chat submission and actual confirmation
footers. Strict page/console/network checks pass and owned infrastructure cleaned.
The final library-save/block-copy/body-wrapper repairs use separate isolated/
component proof; they do not execute in these two unchanged journey paths. No
paid provider calls or full backend/shared AI suites were selected.

### Real browser and visual review

Pinned safe agent-browser session
languon-dialog-button-polish-e272a8c7a3d83e56d0d55812c6914dd7 inspected current
Storybook on loopback6007 at1440x900 and390x844. Desktop shared3longRussian
buttons all have y480 andheight81; real440pxLibrarySaveFooter buttons bothy815,
height60. Desktop focus shows View tooltip; mobile resize has0visible label
tooltips. Mobile editor labels reflow without clipping, sentence actions retain
their existing overflow menu. Native dialog and input focus/labels are preserved.
Screenshots are in test-results/web-dialog-button-polish/.

ui_render_critique approved the actual shared modal, narrow editor desktop/mobile
and sentence desktop/mobile screenshots with no material visual issue. Initial
shared-story captures showed only a closed opener and were explicitly rejected
as evidence; auto-open preview and a verified native-open recapture closed that
evidence gap. No temporal/runtime behavior is inferred from screenshots alone.

### Documentation and review

Updated the UI-quality reference with context-aware icon-label and one-row dialog
contracts. Web UI kit guide describes the conventions separately from its
unchanged theme journey; guide revision remains56c27d0bd349dca6 because mapped
scenario behavior is unchanged. Mapping and docs validators pass (16tests,34guides).
Skill validator and27-package checks pass. Existing story catalog remains the
visual source; no new whole-chat/page stories or UI framework were introduced.

Independent source review found WDBP-001: two raw fixed-width library-save/block-
copy footers still wrapped. Replaced with actual DialogActions, retained helper
notes separately, covered12tests and real-footer stories. Bounded remediation
review approved those repairs plus the same-risk body-form sweep, with no new
material findings. Final evidence reconciliation approved all65 source hashes and10 report/attestation hashes; AC1–AC4 are supported with no material gaps. No material
security-policy effect or new harness justified separate specialist suites.

### Remaining limits and cleanup

This is a context-aware source audit with representative runtime checks, not a
guarantee every button in every state has been visually inspected. Primary/
confirmation/AI/scope labels remain where needed. Original feature/main/release
qualification is outside this UX improvement; no merge/release claim. Browser
inspection closes after proof. The extra read-only static catalog server6008 is
removed after inspection; existing6007preview remains for the user. No automatic
commit, push, branch changes, data cleanup or environment changes.

## Final handoff state

[Current verification manifest](evidence/web-dialog-and-button-polish/verification.json)
records the complete tracked/untracked source boundary and raw report hashes.
[Component attestations](evidence/web-dialog-and-button-polish/component-evidence.md)
distinguish worker CLI-only evidence from root raw logs; no reports were invented.
All44changed TS/TSX files passed final scoped ESLint. Types/styles/format/guide/
skill checks are green, and the full catalog compiled all modified runtime/story
modules before the harmless new-preview initial-open boolean adjustment described
above. Current live-render evidence covers that adjustment; compilation constructs
and module dependencies are unchanged. Root inspected the complete scoped diff.

Browser session closed with empty error output. Temporary read-only static catalog
server6008 was stopped after verifying its exact task command; existing6007preview
was preserved. Both critical fixtures cleaned their own infrastructure. Final independent source/evidence approval returned from dialog_button_review; the improvement is Complete. WDBP-001 is closed, with representative visual audit limits explicitly retained.

## User follow-up: concise single-line action labels (2026-11-11)

User rejects wrapping text inside buttons as well as wrapping action rows.
Requested EndSessionDialog Continue/Finish and context-aware concise CTA copy
elsewhere. Reopened same improvement; previous manifest/evidence is historical.
Before edits: retain object/scope/consequences in dialog titles/body, use concise
verb labels in all four locales, preserve ambiguous/paid/destructive distinctions.
Buttons remain single-line; do not truncate/shrink text or use horizontal action
scrolling to hide overflow. Contextual review utilities can use the existing
responsive icon pattern to free space. Mobile can stack whole buttons.

Root owns training copy, shared CSS/stories/rules and browser/build integration.
Knowledge worker owns knowledge copy + exact affected tests/guide labels; another
worker owns non-training shared locale dialog copy. No handlers/API/persistence
changes. Training uses the existing localized Finish key and shortens its
continue label; the status-screen End session key remains unchanged.
Snapshot before root changes: /private/tmp/languon-dialog-copy-before/.

Selected checks before code: exact affected training/knowledge/dialog component
files, serialmaxWorkers1 (~5–30s); roottypes/scopedlint/styles (~15s), changedskill
metadata (~1s). Real Storybook small EndSession and narrow editor/review fixtures
at desktop/mobile all relevant locales (~2min); affected mapped app selections
only when CTA locators change (~1min each). Reuse previous production catalog
compilation for copy/CSS-only changes; current actual Vite/Next render proves
updated values. No full catalog/backend/sharedAI repeats for literal/copy changes.
Bounded completion/UI review applies to this repair, not a new whole patch audit.

### Follow-up implementation and final evidence

The earlier wrapping-label design above is historical and superseded by this
follow-up. Desktop action rows and their labels remain on one line; mobile can
reflow whole buttons. EndSessionDialog uses Continue/Finish, while status-screen
End session remains contextual. Other actions use Create, Save, Apply, Copy,
Insert, Update, Continue, Discard or Cancel in en/ru/fr/es. Scope-specific
placement, ownership, paid-generation and permanent-delete distinctions remain.
Titles/body/helper text retain consequences and independent-copy information.
Four actual EndSessionDialog locale stories were added; existing editor stories
now show real production labels. The quality rule and UI-kit guide prohibit
wrapping/truncating/shrinking action text to force fit.

Focused component evidence: 187 unique passing cases across current selections:
102 dictionary/consent,47 knowledge,4 tutor-budget,34 shared/responsive/EndSession.
The proposal-only11-case rerun is a subset, not additional coverage. Exact
commands and raw report hashes are in
[the follow-up manifest](evidence/web-dialog-and-button-polish/verification-concise.json).
Production copy/handlers stayed fixed after these passes; final test-only changes
were whitespace/formatting. Current web typecheck and styling contract pass.
The80-file scoped lint selection found one new-test blank-line violation; the
101-file formatting selection found one changed test requiring formatting.
Both were repaired, and exact affected2-file lint/format remediation passed;
unaffected passing evidence is reused. No full-suite repetition was selected.

Real integration caught a Maximum update depth exceeded browser error in the
new desktop-only tooltip media hook during review-dialog viewport transitions.
The recorded stack points at effect-driven setDesktop(media.matches); native
Popover amplification was not established. Replaced effect/state synchronization
with stable useSyncExternalStore media subscription/snapshots. Added a controllable
StrictMode regression for first desktop snapshot, desktop/mobile changes and
unsubscription. Original failed critical run707dd6af-9885-4b90-a1e3-dd2005c4cdb2
is retained. Exact final rerun1208ecdb-76e2-4c0c-a238-c58a83e9fd69 passes both
knowledge-block-revision-copy and knowledge-document-formatting,1case each,
0skips,88.096s including setup/cleanup,0.894s cached build. The previous failure's
health assertions and product deadlines were preserved. Real Next/backend/DB
composition uses synthetic external AI; no paid calls.

Pinned safe browser session
languon-concise-dialog-actions-7e18c5172de14adf65d8247aa1a07b1f verified actual
Storybook components. Russian EndSession desktop actions are44px high,120.8/
109.6px wide; French at390px is44px high,99/92.5px wide. French1440px and
Russian1440px confirmations have aligned single-line actions. Actual narrow
library footer desktop/mobile captures also show concise nonclipped actions.
Five screenshots retained in test-results/web-dialog-button-polish/concise-actions/.
Root viewed these rendered captures; reviewer inspected EndSession captures.
No page errors or warning console messages;634request records contain only a
catalog favicon404 outside successful200 module/page loads. Session closed;
existing6007preview remains. These are representative checks, not screenshots
of every confirmation/locale combination; duplicate unsaved-confirmation copies
were source-reviewed against the same small shared primitive.

Guide checks pass34guides/16validator cases; both affected mappings pass.
Interactive-workbooks revision031bff1bdbb49194 uses Insert for proposals while
preserving editor Apply. UI-kit theme revision remains valid because its executable
theme scenario is unchanged. Repository skill checks pass27packages. Previous
catalog compilation covers unchanged module structure; current Vite/Next rendering
and typecheck cover the new labels/stories/media hook. No dependency/config change.

Independent bounded remediation source review closed WDBP-002 (missed duplicate
training/knowledge/budget labels) and WDBP-003 (retired proposal guide wording).
The sync media hook and regression are sound; no further source changes or broader
checks were requested. Final evidence reconciliation is recorded below.

Rollback remains reverting the scoped UI/copy/test/docs patch; no migration or
configuration reset. Existing large uncommitted task patch is preserved. No commit,
merge, push, release or environment change is authorized by this follow-up.

### Follow-up closure

Independent final evidence approval granted by dialog_button_review: all101source
and31report/artifact hashes match;187unique component cases and both0-skip app
journeys reconcile. WDBP-002/WDBP-003 are closed. Final lint/format remediation,
types/styles/guide mappings/skill checks and representative rendered proof support
AC1–AC4. No further source changes or wider checks were requested. Root final
Git inspection and diff check pass. Improvement and follow-up are Complete;
changes remain uncommitted. Representative visual coverage limit is retained.

## Acceptance and retrospective (2026-11-11)

User accepted the UI work and requested committing it, closing the current feature
and merging to main. Investigation/implementation time was not instrumented;
focused final component runs took seconds and final two-journey execution88.096s.
Largest avoidable rework: the earlier equal-height wrapped-label design did not
match the user's expected concise single-line actions. The durable UI rule now
requires concise labels and contextual body copy before rendering. Integration
caught an effect-driven tooltip media update loop; useSyncExternalStore and its
StrictMode/viewport regression prevent recurrence. No additional full suites
were needed after affected proof passed. Git history records the requested commit;
main integration separately retains inherited prerequisite dispositions.
