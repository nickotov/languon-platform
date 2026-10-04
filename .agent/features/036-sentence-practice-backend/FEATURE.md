# Feature: Sentence translation practice backend

## Metadata

- Feature ID: 036-sentence-practice-backend
- Feature slug: sentence-practice-backend
- Status: Complete
- Owner: Engineering
- Created: 2026-10-04
- Updated: 2026-10-04

## Summary

Provide authenticated sentence translation practice for owned and live-authorized
shared dictionaries. Keep every successful generation available additively, offer
saved-first/new-only/review-only behavior, offer free reference review and default
AI checking with strict target
vocabulary feedback, and preserve personal attempts and versioned entry coverage.
This scope delivers backend contracts, persistence, AI/worker execution and safe
credit/capacity/deletion integration. Frontend implementation waits for the returned
Magic Patterns designs.

## Source and authority

User explicitly authorized implementation of the approved backend-first feature.
[Canonical detailed plan](../../../docs/sentence-practice-implementation-plan.md)
and its frozen implementation refinements are authoritative. BL-004, BL-005 and the
sentence slice of BL-003 are linked there. Model preference backend035 was verified
and squash-merged into local main as `bcfda16`; this feature branches from it.

## Acceptance criteria

- [ ] AC-1: Strict public sentence contracts and isolated capabilities preserve
      existing flashcard clients; authenticated owner/shared operations prepare, Next,
      job read/cancel, check, attempts and progress enforce live authority.
- [ ] AC-2: Saved-first uses current unchecked saved exercises before generating;
      new-only always admits fresh generation; review-only never generates. Successful
      generations are additive. Creator-owner exercises are shared; reader exercises
      and every learner's attempts/coverage are private. Every Next/check operation is
      replay-safe and conflicting payloads fail without new jobs or charges.
- [ ] AC-3: Generation creates simple complete source sentences with1–3 admitted
      targets, correct direction, normalized lexical hints and exact source highlight
      segments. Helpers have no hint; phrases and repeated occurrences remain coherent.
      Public exercises never expose reference answers, private provenance or snapshots.
- [ ] AC-4: Check preserves the exact submitted answer, explanation language and
      revealed hints. Semantic/grammar/target feedback and grapheme-safe UTF16 issue
      spans validate before publication. Missing required targets cap79; substantive
      issues cap99; ratings follow approved ranges. Hints do not reduce score. Any
      successful check completes an exercise for that learner regardless of grade.
- [ ] AC-4a: Generate a valid reference translation together with sentence/hints.
      Explicit Show reference answer uses stored content, requires live access/current
      versions, works with zero credits and unavailable AI, and never resolves a model,
      calls a provider or reserves credits. Idempotently record a private manual review;
      Saved first treats it as completed. Reference is one valid translation, with no
      exact-match pass/fail, percentage or quality rating. Never auto-reveal on AI failure.
- [ ] AC-4b: Keep AI scores/ratings separate from manual-review totals/history.
      Reveal preserves the user's draft and has no extra exposure/coverage increment.
      A subsequent AI check can identify reference assistance separately from hints,
      with no extra score penalty. Live access, retirement, deletion and purge cover
      reference translations and personal manual-review records.
- [ ] AC-5: First successful generation/save or first saved exposure increments
      persistent current entry/version/direction coverage once. Reuse never double
      counts; entry changes retire practice while authorized history remains. Unchanged
      A coverage survives retirement/deletion of an A+B exercise due to B.
- [ ] AC-6: Typed sentence jobs pin model/budget/rates at admission, share existing
      credits and combined global/provider capacity with dictionary work, and execute
      in existing bounded worker slots. Exact learning formats/selection/settlement
      capabilities and database guards fail closed for older workers. All worker writes
      are fenced; dispatch/publication recheck live access and entry versions.
- [ ] AC-7: Permanent entry/dictionary/account deletion erases complete derived
      exercises/answers and all copied candidate job input, including foreign learner
      work. Unsettled work is quiesced/cancelled first. Settled content-free credit and
      usage accounting remains valid after content erasure; account purge erases the
      account's accounting under the established policy. Share rotation/archive
      immediately denies access; unchanged restoration can reuse valid content.
- [ ] AC-8: Relevant unit/contract/disposable database/API+worker/legacy regression,
      static/build/migration/guide checks pass, independent tester and completion/
      security reviews pass, and evidence/backlog documentation reflect reality.
- [ ] AC-9: After BOTH backend scopes are verified, create TWO versioned detailed
      Magic Patterns prompts in docs and design handoff records, covering all states
      and modes without concrete API paths in copyable prompt blocks. Stop frontend
      delivery and wait for the user's returned designs.

## Scope exclusions

No frontend, native mobile UI, profile picker, billing/grant/provider replacement,
new unbounded worker fleet, generic universal AI job registry, hint scoring penalty,
mastery algorithm, or regeneration deletion/reset. No paid nondeterministic test
calls. Fullscreen/dialog is a future frontend acceptance requirement and must be
fully represented in the final design prompt rather than simulated by backend.

## Architectural constraints and verification

Read accepted ADR0011/0012/0019/0021/0022/0023/0024/0026 and related architecture.
Learning owns sentence business work; shared text-AI owns selection/infrastructure;
credits own typed settlement; root composition connects infrastructure participants.
New persistence/credit/capacity/deletion rules require real disposable database
proof, separate tester and independent correctness/security reviews. Existing
legacy flashcard/provider/credit journeys remain regression constraints.

## User-flow guide

Create a backend-only sentence API/worker guide with stable mapped scenario IDs and
safe explicit disposable-target runner; update related learning/credit guides only
when their observed commands or behavior changes. Feature035 guides remain valid.

## Evidence and review

See EXEC_PLAN.md, EVIDENCE.md and REVIEW.md. This feature is not complete until the
backend evidence and the design-prompt checkpoint are fulfilled.

## Approved adjustment (2026-10-04)

The user confirmed that explicit reference reveal is free and counts as manually
reviewed for Saved first, separately from AI scores. AI checking stays the default.
Future Jev investigation is a separate possible assessment direction; no Jev
integration, pricing or probability-to-quality-score mapping is authorized here.

## Verified backend completion

Backend acceptance, real infrastructure evidence and independent completion/security
reviews are complete. Two versioned design prompts are saved and linked from the
canonical plan/backlogs. See [DESIGN.md](./DESIGN.md) and prerequisite
[035 handoff](../035-user-ai-model-preferences-backend/DESIGN.md). Frontend integration
is deliberately outside this backend feature and awaits a returned selected design.
Production enablement/deployment was not performed.

## Returned design scope and source inventory — 2026-10-04

The user supplied the sentence-practice flow and requested only UI required for
the features being developed. This analysis covers BL-004 and its personal-progress
slice; backend status stays Complete. Candidate v001/provider v6 and retained source
identity are in [DESIGN.md](./DESIGN.md). This inventory owns the selected UI.

**Include:** sentence/history entries in the existing Train menu; owner and
signed-in shared-reader setup; active sentence, hints, free-text draft, default AI
check, free reference review, feedback and earlier attempts; async/recovery states;
personal AI/manual history; progress/session summary; fullscreen/dialog/mobile
presentation and safe leave confirmation. Enable the existing sentence option
when the real capability permits it, retaining working Flashcards.

**Exclude:** the prototype's library/workspace/navigation redesign, card editor,
AI dictionary authoring/review, audio, import/export/settings, marketing/purchases,
scenario galleries and role/credit/network toggles. No Jev selector, mastery,
streaks, difficulty controls or progress-reset/delete actions. Workspace and
SharedDictionary exports establish placement only.

Intended ownership: a sibling `features/sentence-training` slice with real API,
session model/hooks and colocated UI. Existing dictionary pages compose public
exports. Keep flashcard domain state independent; shared presentation primitives
may be reused without private cross-slice imports. The preferences recovery action
uses the real model-preference UI, not the prototype placeholder.

### Required source UI and verification mapping

All rows are pending implementation and runtime evidence. Original brief IDs
remain separate from source inventory IDs.

| Inventory ID | Brief        | Source section/control/state                                                                                                                                                                            | Intended owner                                | Verification and disposition                                                                                                                                                                       | Implementation proof — 2026-10-05                                                                                                                              |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SP-UI-01     | SP-01        | PracticeLauncher: Sentence practice/My practice history; owner/shared/anonymous/archived context                                                                                                        | Existing Train menu/pages + sentence launcher | Owner, verified reader, anonymous auth return, capability off/archive. Include; keep working Flashcards.                                                                                           | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-02     | SP-02        | PracticeSetup: Direction; Explanation language default dictionary front; All eligible/Choose entries, search, Select all shown/Clear, checkbox list, skipped disclosure/count                           | Setup/controller/manual selection             | Both directions, changed IDs (not only count), partial/no eligible, empty search/selection, localized labels. Adapt to authoritative prepare response.                                             | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-03     | SP-02        | Saved first/New only/Review only descriptions; saved and uncompleted counts; free/paid note; zero-credit saved versus no saved; Start in a dialog/Start in full screen                                  | Setup modes/footer                            | First/later session, partial coverage, retained fresh generations, current direction/scope counts, no invented free generation. Include.                                                           | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-04     | SP-01, SP-02 | Setup skeleton; preparation failure Try again; feature unavailable; no eligible; sign-in requirement                                                                                                    | Preparation/auth states                       | Load/error retry without setup loss; stale response exclusion; real capability/auth. Include.                                                                                                      | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-05     | SP-03        | SentenceWithHints: large source text, underlined target buttons, word/phrase popover, Hints shown chips, repeated-target shared reveal                                                                  | Sentence/hints UI                             | Exact supplied segments, phrases/repeats/inflections, keyboard/touch/RTL, helper text not interactive; no score penalty. Adapt to hint/occurrence IDs.                                             | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-06     | SP-04        | DraftField: labelled multiline translation; inline validation/counter; exact draft; read-only during check                                                                                              | Draft/session state                           | Whitespace/over-limit/non-Latin text; submitted answer preserved; cancel unlocks. Adapt to contract code-point limit.                                                                              | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-07     | SP-04, SP-06 | PracticeActions: Check with AI primary; free reveal secondary; Skip before completion; Next sentence after completion; later Check new answer                                                           | Session actions                               | No duplicate paid action; skip does not complete; AI/manual completion distinct; free reveal usable despite model/credit failures. Include.                                                        | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-08     | SP-05        | AiResultPanel: percentage/rating, explanation, exact submitted text with numbered marks, correction list, vocabulary chips, improved translation/details, assisted badge and earlier-attempt disclosure | Feedback/attempt UI                           | Four ratings, missing target, spanless/minor issue, perfect/no corrections, long feedback, earlier attempts unchanged. Adapt public fields; never grade locally.                                   | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-09     | SP-06        | ReferencePanel: neutral dashed Reference translation, Manually reviewed, one-valid-translation help, Hide/Show again; pending/reveal error                                                              | Reference controller/UI                       | Explicit server reveal, zero credits/no model; replay once; no score/verdict; failed reveal no completion; assistance at check admission. Include.                                                 | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-10     | SP-07        | JobStatus: preparing versus checking, honest indeterminate progress, Cancel/Stopping, resumed-work and possible credit-use help                                                                         | Job controller/status                         | Queued/running/cancellation/completed/failed, reconnect same ID, late result isolation, no refund/ETA promises. Adapt actual job fields.                                                           | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-11     | SP-07        | PracticeNotice: credits/model/capacity/offline/timeout/provider/cancelled; retry/free reveal/review saved/return/preferences recovery                                                                   | Error mapping/controller                      | Different error codes, access still required for free actions, retry delay and ambiguous admission recovery, failed terminal job versus same-job poll. Adapt copy and actions.                     | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-12     | SP-02, SP-07 | PracticeBody empty pool/exhausted: Switch to New only, Restart review, Back to dictionary                                                                                                               | Selection/session controller                  | Review never generates; visited set reset only; mode change deliberate; no server history/progress reset. Adapt actual next/prepare result.                                                        | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-13     | SP-08        | HistoryContent: AI checks/Manual reviews tabs, personal rows/time/languages/answer/score/assistance/Feedback, manual reference without grade, outdated badge, load-more/error/empty                     | Personal history queries/UI                   | Separate cursor streams, initial/loading-more/error states, actor isolation, outdated read-only, purged rows removed. Adapt; no fixture totals.                                                    | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-14     | SP-08        | ProgressStrip/SessionSummary: vocabulary seen/not seen; AI/manual/assisted/rating counts; My history/Keep practising/Leave practice                                                                     | Progress query + session counters/summary     | Server directional counters versus local session events clearly separated; dedupe polling/replay, no mastery. Include.                                                                             | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#sentence-evidence).                                                |
| SP-UI-15     | SP-09        | PracticeFrame: dictionary header/direction/mode/feedback language; Summary, History, layout toggle, Close; full viewport and bounded dialog with scroll body/sticky actions                             | Presentation/session shell                    | Layout switch retains one controller and draft/reference/result/counters/job; native gesture/fallback/Escape; focus return; pending/draft leave confirmation. Adapt existing flashcard convention. | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#presentation-and-access-evidence).                                 |
| SP-UI-16     | SP-07, SP-09 | Revoked/expired/archived/outdated/removed notice; real sign-in/return; AI preference recovery overlay                                                                                                   | Auth/access integration + model-preference UI | Hide protected cached content immediately; reauthorize after identity/share changes; preserved session on preferences overlay. Adapt, no fake sign-in or placeholder.                              | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#presentation-and-access-evidence).                                 |
| SP-UI-17     | SP-11        | Semantic controls/status/error associations; focused hint/feedback overlays; responsive sheet, dark/RTL/long text/keyboard                                                                              | Sentence UI/shared primitives                 | Keyboard-only, touch, 200% zoom, reduced motion, RTL/non-Latin, narrow/wide and keyboard-open renders. Include; rendering/fidelity evidence pending.                                               | Verified RTL content, compact layouts and honest viewport simulations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#presentation-and-access-evidence). |

SP-10's 25 states map explicitly: 1→01/04; 2→04; 3–4→02;
5–6→03; 7→12; 8→10/11; 9→05; 10→06; 11→07/10/11;
12→08; 13→09; 14–15→03/07/09/11; 16→11/16; 17–18→10/11;
19→16; 20→13; 21→14; 22–25→15/17. Demo galleries are references,
not real product controls.

### Geometry and presentation to preserve

Full viewport uses 100dvh, safe-area padding, fixed header/progress, scrollable
body and sticky footer with a centered max-w-3xl reading column (48rem). Desktop
dialog uses size lg with bounded scrolling, separated header/body/footer, no
overlay dismissal of active work, and the same session content. Compact practice
uses the full viewport; setup/history/summary use a responsive desktop dialog or
bottom sheet (source sheet max-height92vh, rounded24px top corners). Setup uses
20px group spacing, 16px section boundaries, bounded searchable selection list,
and right-aligned wrapping start actions. Source sentence panel uses 16px padding,
20px at sm, 12px radius; sentence text24px and28px at md with relaxed line height.
Draft has three rows, vertically resizable, with inline validation. Feedback uses
16px padding, compact numbered corrections, semantic borders/badges and expandable
details. Manual reference uses neutral subtle surface and dashed border, distinctly
separate from scored feedback. Primary Check becomes secondary after completion;
Next becomes primary. Keep the existing runtime semantic tokens; do not import
prototype global CSS/theme/config or invent a second design system.

### Contract discrepancies and required adaptations

- Ordinary exercises omit referenceTranslation. The prototype embeds a reference
  in every exercise: **never port that shape**. Fetch/store reference only after
  explicit authorized reveal, or in returned personal manual-review history.
  Failed reveal must not show Manually reviewed or mark completion.
- Adapt forward/reverse to source-to-target/target-to-source; subset to manual
  scope; prototype “again” to practise-again-later. Backend assessments are
  used/missing, not a separate synonym enum. Display returned explanations rather
  than fabricate synonym/spelling/punctuation categories or local correctness.
- Feedback issues have meaning/grammar/target kind, severity and optional validated
  spans; feedback/target text is server-owned. Preserve UTF16 span semantics and
  grapheme boundaries. No exact-string checking, confidence estimate or fixture
  scores. Character limit is4000 Unicode code points, not JS string.length.
- Queued/running/completed/failed/cancelled are actual job states.
  cancellationRequested drives Stopping. Prototype retrying is not a standalone
  supplied state; display it only if reliable retry evidence exists, otherwise
  use running/queued without invention. No simulated timers, prices or queue ETA.
- Reusing an operation ID recovers ambiguous admission; polling reconnects the
  same job. A terminal failed/cancelled job does not become new work by replaying
  its ID. Deliberate new submission needs a new operation and may charge credits.
  Replace blanket “retry is not a new charge” promises with outcome-specific help.
- The API has no review-empty reason distinct from review-exhausted. Use returned
  prepare counts to explain an empty pool versus visited-session exhaustion; do
  not invent a server enum. Saved-first completion uses personal checks/manual
  reviews, not fixtures or flashcard completion.
- Prepare/progress counts are authoritative for current direction/version/scope.
  Reprepare on changed entry IDs even when selected.length is unchanged. Do not
  use mock seenEntryIds or total loaded history rows as all-time counts. Do not
  promise share-reader access to another reader's private generated exercises.
- History pagination is cursor-based, separate for AI/manual. Add initial loading
  and initial failure states (prototype mainly covers pagination). Remove purged
  and inaccessible rows from caches, but show authorized outdated history read-only.
- Existing native fullscreen Escape returns to dialog; prototype native exit
  stays viewport. Follow the approved plan/existing flashcards, preserving state.
  Keep overlays within the fullscreen/top-layer context and return focus safely.
- Open AI preferences currently displays explanatory placeholder text. Replace it
  with real selected model preference UI, preserving in-memory practice state.
  Fake setViewer/sign-in and setOnline handlers are excluded.
- Session-expired notice claims local draft remains visible. Protected content
  must be hidden/cleared through established auth/access lifecycle; no cross-user
  draft cache or post-reload continuity promise. Generic access failures must not
  guess whether an unavailable dictionary was deleted or unshared.
- Capability off stays truthful and does not authorize production activation.
  Keep existing flashcards working: the source disabled Flashcards is a demo
  limitation, not the selected product behavior.

Reference rendered access was unavailable during this analysis; source exports
do not establish visual fidelity. All required controls/states need real backend
integration, regression tests and source/runtime rendered comparison before UI
completion. No frontend implementation, paid call or production enablement occurred.

## Frontend continuation completed — 2026-10-05

[Feature 037](../037-sentence-practice-web/FEATURE.md) implemented and verified
this selected inventory. Its [evidence](../037-sentence-practice-web/EVIDENCE.md)
and [review](../037-sentence-practice-web/REVIEW.md) own frontend proof and resolved
findings. This backend feature remains Complete; no competing UI inventory or
external pixel-equivalence claim is introduced.
