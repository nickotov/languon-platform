# Improvement: Distinct assistant conversation surface

Status: Complete — user accepted; commit authorized; merge not requested
Created: 2026-11-12

## Outcome and authority

User approved the screenshot-grounded proposal: a continuous cool-gray assistant
surface with a restrained indigo bias, neutral input/artifact surfaces, dependable
attached boundary and quiet floating elevation. Existing identity/layout and focus
semantics stay intact. This is an existing-contract UX improvement, not a feature.
Use improvement-development, frontend-development, ui-ux-composition, testing and
browser-verification. ADR0029/0016/0054 bind. Direction extends the approved tutor
shell and existing semantic theme system; no additional design approval gate.

Baseline80d330bd, clean checkout. User explicitly wants to inspect before a main
merge, so work on improvement/assistant-chat-surface; main remains untouched.
No commit/merge/push/deletion is authorized. Record technical completion separately
from the pending user's visual acceptance. Rollback is the scoped CSS/story/docs
patch, with no environment/data migration.

## Acceptance

- AC1: Dictionary, Text and Knowledge chat share the same quiet continuous surface
  across header, transcript and composer surroundings; primary page unchanged.
- AC2: Input and generated snippets/learning proposals remain distinct neutral
  surfaces; user bubbles remain recognizable; attached workspace has a stable
  boundary without pretending the entire panel has keyboard focus.
- AC3: Explicit/system dark and forced-color modes preserve legibility, grouping
  and real focus. Desktop/mobile layout, disclosure and behavior unchanged.
- AC4: Existing meaningful isolated snippet stories demonstrate the real artifact
  on the assistant surface, without a whole-chat story or production mock.
- AC5: Final actual-browser screenshots and a bounded independent visual critique
  support review, and the change remains off main for the user to inspect.

## Sources and brief

User screenshot filenames2026-11-12 at16.00.52,16.00.03,15.59.50 show text,
worksheet and dictionary. Worksheet is the strongest merging case: attached tutor
explicitly removes outer border and elevation. TutorShell, conversation-messages,
composer, DictionarySnippetView and BlockProposalCard own affected presentation.
Runtime tokens are globals.css; border/surface primitives and actual snippet
stories are reused. CSS Modules remain the implementation mechanism. The user
approved a starting light surface near#F0F2F8; dark requires separate tuning.
Do not globally change primary-subtle, user-message-bg, page surfaces or content
blocks. Generated proposals receive neutral surfaces; their status semantics and
controls remain. No transcript/message/editor data, orchestration, AI execution,
authentication, package exports or dependencies change.

The prior read-only ui-designer assessment recommends this direction; request a
bounded critique of final screenshots rather than another design exploration.
Relevant guides: contextual-language-assistant-and-knowledge, knowledge-workspace,
interactive-workbooks, dictionary-chat-snippets and web-ui-kit. Surface-only
changes leave executable journeys/commands valid; update concise shared visual
expectations rather than rewording every guide or widening execution promises.
No semantic LSP exposed; scoped path/text reads establish these style consumers.

## Selected verification before coding

- Styles contract + scoped Prettier/ESLint (~3–10s); web typecheck for story/test
  edits (~10s). No CSS-mirroring unit tests or full repository suite.
- Reuse existing isolated snippet stories, theme/viewport controls. Start existing
  Storybook dev server if needed; actual browser verifies compact/expanded on
  tinted surface in representative light/dark. No new whole-chat story.
- Extend existing lightweight editor/tutor responsive E2E case to observe the
  actual Text/Dictionary/Knowledge surfaces with a synthetic account, no generated
  model turn. Check explicit light/dark + system-dark, desktop and mobile,
  composer/artifact/background identity, no overflow/unexpected errors. Use real
  Next/backend/disposable PG/Redis via existing guarded runFlow utility, same
  current assistant fixture (55488/56488,3336/4006). Estimate30–90s cold setup,
  ~15–30s body. No paid AI or runtime admission changes, so AI matrix/doctor and
  paid smoke are inapplicable. No broad financial/generation journeys for CSS.
- Existing meaningful snippet component cases if artifact styles require no logic
  changes: reuse behavior coverage; browser disclosure observations suffice.
- Guide metadata/mappings if updated (~2s); source+tested-state identity in this
  record. Real-browser screenshots plus visual critique are decisive for color.
- Root owns compilation/test infra. Independent designer remains read-only and
  only critiques supplied rendered captures after source freezes.

## Progress

Discovery complete; implementation pending. User review/main merge remain pending.

### Verification selection refinement before execution

No new CSS-mirroring/reversible-style tests are warranted. Keep all existing E2E
code unchanged. The original single lightweight Text/rail case cannot show
Dictionary and attached Knowledge or populated messages. Select three existing
cases in one guarded assistant run instead: editor/real-tutor responsive case
(Text), copied-dictionary-cards case (populated Dictionary, mobile/system-dark/RTL)
and empty-workspace recovery case (attached Knowledge, explicit dark). This reuses
maintained journeys and their real captures with one cold infra setup; no new
harness or production fake. File regex(contextual-assistant|knowledge-workspace)
journeys, minimumTests3, grep by these exact existing titles. Estimate2–4min,
with no widened coverage promise beyond the selected cases. All financial,
provider, worker, deployment, auth and broad generation gates remain out of scope.
Existing snippet stories cover neutral generated artifact light/dark/disclosure;
no whole-chat story is introduced. No E2E source edits needed.

## Implemented outcome and final evidence

The final patch adds one semantic background-assistant token, light#F0F2F8 and
explicit/system-dark#171D29. Forced-color Canvas fallback includes a theme-attribute
selector so explicit/system theme specificity does not override it. Tutor panel
and composer surroundings use this role; existing header/transcript inherit it.
Input remains background-surface. Dictionary snippets and typed learning proposal
previews explicitly use background-surface, while ordinary replies remain directly
on the chat plane. User bubbles use existing primary100 (no new global primary or
user-message tokens). Muted panel labels use text-secondary for legible contrast.
The existing attached workspace divider and floating border use border-strong;
no duplicate border, focus frame, shadow increase, motion, layout or behavior change.
The actual snippet story decorator now uses a token-based surface backdrop.

Author source preflight confirms only these presentation/story/docs changes, no
cross-app import, runtime dependency, API/persistence/auth/model execution or
stored user-data change. Web typecheck, exact changed-story ESLint, styles
contract, scoped formatting and git diff check pass. No new unit or E2E tests,
CSS-value assertions, full suites or catalog rebuild were added/run. Current
Vite story rendering, Next real-app rendering and current types compile the
changed view/story/CSS imports; prior packaging configuration is unchanged.

The existing runFlow API ran three unchanged existing cases, file regex
(contextual-assistant|knowledge-workspace)\.journeys\.spec\.ts and grep:
editor and real tutor collapse the sidebar|two copied dictionary cards retain
typed labels|an empty workspace recovers edits. App=assistant, minimumTests3,
prerequisite=deterministic-assistant. Guarded loopback infrastructure55488/56488,
3336/4006, fresh synthetic account/content, real backend/Next/PostgreSQL/Redis;
external model boundary remains synthetic,0paid calls. One workspace lock/cold
setup; next-env.d.ts protected with existing withPreservedFile. Run
76bb1e42-bbdb-4383-9c78-00c8ba3976bb passes3/3,0skips,190.897s total:
7.961s setup,180.561s execution,2.370s cleanup. Bodies17.3s Text/rail,
~1.3min populated Dictionary,33.7s Knowledge. No unexpected browser exceptions
or failed requests under the existing case assertions. Runner cleaned owned
services/volumes and restored generated next-env.d.ts; no user service stopped.

Real app screenshots establish light Text1200, light populated Dictionary1440,
system-dark Dictionary with RTL/reduced-motion, mobile Dictionary, light attached
Knowledge and explicit-dark populated Knowledge. Root viewed representative
captures; independent ui-designer role chat_surface_design_review inspected all
8supplied app/story states and found no material visual defects or needed repairs.
Its approval concerns the supplied appearance, not the user's acceptance or
measured task performance. Full worksheet learning-block contents in the user's
original screenshots were not recreated; typed preview neutral surfaces are
source-reviewed and the actual isolated dictionary artifact is rendered.

Pinned safe-browser session languon-assistant-chat-surface-
148f01fbeffe7b8b68fbb23720343855 on existing Storybook6007 inspected real compact
light and expanded dark390x844 snippet views, desktop1280x900. No page errors or
warning/error console messages;411request records have only a catalog favicon404,
all ordinary page/modules200/304. Session closed, existing preview server retained.
Light/dark backdrop and neutral artifact remain distinct. Actual disclosure/view
state is reused, not reimplemented in stories.

Computed palette contrast (sRGB relative luminance, not a claim of full WCAG
audit): body/assistant14.92light,16.02dark; muted label/assistant5.34light,
11.45dark; body/user-bubble13.55light,10.84dark; muted label/user-bubble4.85light,
7.75dark. Keyboard/close/drawer behavior is exercised by unchanged app cases.
Forced-colors Canvas fallback is source-checked; forced-colors rendering was not
emulated because the safe exploratory wrapper only permits viewport changes,
and these unchanged selected app journeys do not emulate it. No bypass or claim
of full accessibility certification. Primary explicit/system light/dark variants
and mobile rendering are verified; forced-colors runtime remains an explicit
limited observation, not a skipped selected test.

Web-ui-kit now documents the semantic conversation surface. Metadata and
34guide/16validator cases pass; web-ui-kit mapping remains valid (unchanged
executable theme scenario/revision). Other relevant guides retain their existing
commands, source paths and outcomes: no new journey or disclosure semantics.
Additional mapped theme-persistence execution is unnecessary because persistence
code is unchanged and selected app journeys prove actual explicit/system colors.

Raw logs: /private/tmp/languon-assistant-surface-{app,types,lint,styles-final,
format,guides,mapping,story-network}.log. Real-app report/summary/artifacts under
test-results/critical-flows/76bb1e42-bbdb-4383-9c78-00c8ba3976bb/.
Curated byte-identical screenshots: test-results/assistant-chat-surface-review/.
Main remains80d330bd. Branch improvement/assistant-chat-surface remains
uncommitted; do not merge/commit/push without the user's next instruction.
Rollback is these scoped files and the new story backdrop file; no data cleanup.
User's requested visual review is pending. Technical completion is not approval
to integrate or a claim of improved human task performance.

### Tested final source identity (SHA-256)

- `apps/web/src/app/globals.css`: `e29d38dbfb9217de1d7467127cf6ab9473d0eb0fe3e2295bde2209252e9987f8`.
- `apps/web/src/fsd/features/dictionary-chat-snippets/ui/snippet-card/snippet-card.module.css`: `f7ad57cdd6db6071f7dde5bb94bc4cbdea95f8cd03b6acc72b6de458b428d22d`.
- `apps/web/src/fsd/features/dictionary-chat-snippets/ui/snippet-card/snippet-view.stories.tsx`: `df8dd78ed934fb52fc478328349b36bde1411b35fe245885baa7580abfadd4e8`.
- `apps/web/src/fsd/features/knowledge-notes/ui/block-proposals/block-proposal-card.module.css`: `4ae3e9630241cc5667059bdba440388ac77bcf97bb225423d2b13b23054f6184`.
- `apps/web/src/fsd/shared/ui/companion-layout/companion-layout.module.css`: `b369ee8a208caf5f8c48fc4623cf534fc444c75057726e64f1f3b4a9e0d8aa85`.
- `apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/composer.module.css`: `b13fd01c7a922f286bc01c210974a454ec0c2761a8744b26c926a843aa1fb9b9`.
- `apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-messages.module.css`: `b8b043ffe954166b1bee5e9aa016c7d73194c02a7b49f31511af0f31b7167255`.
- `apps/web/src/fsd/widgets/contextual-assistant/ui/tutor-shell/tutor-shell.module.css`: `b18e36e173b6d6987028457fafca7ca3138b6b5d51176716cebf0cb6d0026517`.
- `docs/user-flows/web-ui-kit.md`: `d99d8807eca9b9578c6b31b3ca2d0e7a14a6eb6d85b7a5eb68507c1d329cc150`.
- `apps/web/src/fsd/features/dictionary-chat-snippets/ui/snippet-card/snippet-view.stories.module.css`: `60c2729df8cd8c3658343bae1f9654a1b2c26dd2f142941e94ee88797fed3344`.

Summary SHA-256: `ed701d4f0219c63214e9ae646b5a6a7fb07b1298b0669833837e3260b9eac8d5`.

## Acceptance and retrospective — 2026-11-12

User stated “i like it” and explicitly requested committing the approved surface
before a separate ComposerPreferences placement correction. No integration/push
was requested; main stays80d330bd. All10source identities and the selected runtime
evidence are unchanged; no reruns for this documentation-only acceptance update.
The small CSS patch used existing story/state and three maintained journeys with
one fixture setup (190.897s total), avoiding new CSS-mirroring tests, broad suites
and another catalog build. The independent critique found no visual repairs.
A narrower maintained visual-only fixture could reduce future app proof cost;
introducing a new harness for this palette change was not justified. End-to-end
investigation time was not instrumented. Git history records the authorized
surface commit; the follow-up correction owns its own checks and diff.
