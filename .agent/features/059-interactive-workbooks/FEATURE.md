# Interactive knowledge workbooks

Status: In progress — v16 migration verified; transcription activation awaits provider/model approval
Owner: Engineering agent
Created: 2026-10-28

## Problem

Static knowledge notes cannot compose reusable interactive learning material or
retain private learner activity across shared, ordered study documents.

## Desired behavior

Owners author interactive knowledge notes manually or with reviewed AI proposals,
organize them into ordered workbooks and share saved content. Learners practice
privately, copy reusable content and save vocabulary/text into their own libraries.
This is the foundation for later generated lessons, not course generation itself.
The user confirmed the complete interview scope on 2026-10-28; the interview's
older pending-confirmation wording is historical, not a new approval requirement.

## Acceptance criteria

- AC-1 — **Reusable blocks:** Knowledge notes support video, vocabulary, bilingual text, audio comprehension, grammar and exercises. Each block retains its presentation and basic interactions in an independent learning context, with no dependency on the knowledge editor.

- AC-2 — **Manual authoring:** An Add block menu and type-specific controls allow manual creation/editing, reorder, duplication, deletion and learner preview. Custom blocks share whole-block selection, manual drag reordering and a heading-right extensible settings popover for editing, copying, duplication, keyboard movement and deletion. Existing prose, private drafts, conflict recovery, explicit Save and revision behavior remain usable.

- AC-3 — **AI proposals:** AI generates the same structured blocks as manual authoring, previews changes and requires explicit Apply. Apply changes only the working draft; Save publishes. Explanations require no Apply. Stale targets cannot silently overwrite newer content.

- AC-4 — **Workbooks:** An owner orders notes in a workbook and navigates previous/next. Each note belongs to at most one workbook; standalone notes remain supported. Deleting a workbook defaults to retaining its notes; deleting notes is a separate explicit choice.

- AC-5 — **Sharing:** Notes and workbooks are private by default with revocable unlisted links and no public discovery. Anonymous reading exposes saved content only. Workbook access includes later saved additions with a clear notice; removal ends workbook-derived access without invalidating an independent note link.

- AC-6 — **Shared learning authority:** Signed-in shared readers can practice, request explanation/evaluation and private translations without copying. Server authorization prevents them and their AI tools from editing original content. Copying, saved practice and AI require sign-in.

- AC-7 — **Independent copies:** Users copy a whole note, a whole ordered workbook or selected complete blocks. Copies preserve content/settings/answers/translations and usable uploaded media, but receive fresh exercise identities and no original chats, revisions or learner history. Ordinary text selections copy as text. Completed copies survive original changes/revocation/deletion.

    Workbook copying uses explicitly saved material. An owner's copy is blocked
    with a clear notice when any member is still a draft, rather than silently
    omitting it. Shared copies include only currently authorized saved members;
    they do not disclose private drafts or publish them implicitly.

**AC-7 publication boundary:** Copying an owned workbook requires every member note to have been explicitly saved; an unsaved member blocks the entire operation with a clear notice. No member is silently omitted or implicitly published. Shared-workbook copies include exactly the saved material available through that share and reveal no private draft inventory.

- AC-8 — **Vocabulary:** Vocabulary blocks launch existing Languon flashcard and sentence practice directly without requiring library saving. Selected prepared entries can create a dictionary or extend an existing dictionary as independent copies. Existing dictionary entries can be inserted into notes as copies. Publication is atomic and retry-safe, without unnecessary AI generation.

- AC-9 — **Text library:** Text blocks create independent Text items or append to existing Texts through preview and explicit commit. Copies preserve valid source/translation alignment and use fresh inserted identities. Existing Texts can be inserted into notes as independent copies.

- AC-10 — **Bilingual reading:** Original-only and bilingual views preserve original wording. Author-prepared translations are shared; reader-requested target-language translations are private, billed to the requester and do not mutate the note.

- AC-11 — **Grammar:** Grammar has a distinct UI with optional rule, formation/pattern, translated examples and common-mistake sections. Related exercises use reusable exercise blocks. Grammar-library saving is deferred.

- AC-12 — **Media playback:** Video supports validated YouTube embeds and direct browser-playable URLs. Other providers remain ordinary links; arbitrary embed code is forbidden. External-media unavailability is explicit and does not imply successful AI understanding.

- AC-13 — **Audio:** Authors upload audio with transcription, generate speech from text through compatible speech capabilities, or supply transcripts. Uploaded assets copied independently remain playable after original deletion. Private draft assets cannot leak through shared saved documents.

- AC-14 — **Grounded comprehension:** Audio questions derive from available transcripts. Practice initially hides the full transcript; Show transcript and Hint are separate actions. Hints reveal relevant transcript passages and offer timestamp replay when available. No claim of fetching or understanding remote video is made without supported processing.

- AC-15 — **Exercises:** Multiple-choice, fill-in-the-blank and free-text exercises have a reference answer and short explanation. Learners can reveal the prepared answer or request AI evaluation, which recognizes valid alternatives. Retries are available.

- AC-16 — **Private learning state:** Signed-in attempts and progress persist separately from author content. Authors cannot inspect readers’ answers, progress, private translations or AI chats. Attempted, hint used, answer revealed and answered correctly remain distinct observations.

- AC-17 — **Versioning and completion:** Question, choices, accepted answers, criteria and source passage/audio changes create a new exercise version. Styling, movement and explanation-only corrections retain progress. Historical attempts remain bound to answered versions. Completion is explicit, opening is insufficient, and changed completed notes show updated since completion. Workbook progress counts completed notes without grades/prerequisites.

- AC-18 — **Access lifecycle:** Loss of source access makes shared-source chats and practice history unavailable. Permanent note deletion removes associated shared-source chats, attempts, progress and private translations while retaining independent copies and library items. Concurrent access/copy/delete races cannot expose revoked content or corrupt copies.

- AC-19 — **AI accounting:** The requesting signed-in user pays for generation, transcription, translation and evaluation under existing bounded action, tariff, admission, cancellation and settlement policies. Prepared content playback/viewing and answer reveals need no AI call. Shared readers never charge the author implicitly.

- AC-20 — **XSS and input security:** Server-validated structured blocks, safe rendering and restricted attributes/URL schemes prevent scripts, event handlers, executable URLs and arbitrary embeds from executing across editing, paste, AI proposals, persistence/reload, translations, copying and shared views. Supported players use validated identifiers and constrained browser policy.

- AC-21 — **Upload and agent security:** Uploads and any server-side retrieval enforce bounded supported input, protected storage/access and private-network protection. Untrusted learning material cannot change agent permissions. Authorization covers every source/destination/media/private-state operation, including retries and stale proposals.

- AC-22 — **Verification and compatibility:** Existing notes and practice journeys remain functional. Accessible responsive runtime behavior, localized controls, real database migrations/invariants, security regressions, production-composition AI execution tests, required critical gates and independent source/security/final-evidence review all pass before completion.

## Scope

All ACs above are one authorized feature delivered in six milestones. Web, API,
worker and persistence surfaces are in scope; reusable contracts do not authorize
an unrelated mobile redesign. The user subsequently selected Magic Patterns v16 for custom-block/editor/chat fidelity; see the inventory below.

Out of scope: course/lesson generation, group-wide AI context, teacher dashboards,
submitted assignments, course grading/prerequisites, grammar-library saving,
external Quizlet integration, microphone recording and automatic remote-video
understanding. Do not drop uploaded-audio transcription because it needs onboarding.

## Constraints and risks

- Preserve existing saved-only publication and private draft/chat boundaries.
- Extend existing credit/execution authority; do not create parallel wallets/pools.
- Transcription uses a fixed reviewed capability and native duration authority.
  Activation requires explicit account-processing and compatible billing evidence;
  no default tariff or production provider activation is inferred.
- Partially supersede ADR-0042 explicitly for shared AI and media; do not rewrite
  its accepted decision. Other accepted constraints remain binding.
- AI specialist tools/subagents are an implementation option, not permission to
  bypass content approval, caller budgets or source authorization.

## User-flow documentation

A new browser/API/system guide `docs/user-flows/interactive-workbooks.md` is
required. Related mapped guides: knowledge-workspace,
contextual-language-assistant-and-knowledge, texts, dictionary-platform,
flashcard-training-web/backend, sentence-practice-web/backend,
shared-pronunciation-playback, ai-accounting and affected provider/admin guides.
Update only actually affected behavior/source mappings after implementation.
Exact existing mappings and proposed new scenarios are recorded in EXEC_PLAN.md.
Guides stay draft until executable tests and real evidence exist.

## Open decisions

No unresolved product scope decision prevents discovery/implementation. Technical
architecture, transcription onboarding and exact resource bounds require evidence
before dependent implementation, with strategic commitments escalated if needed.

## Source decisions

[Confirmed interview](../../../docs/interactive-workbook-discovery.md), Q1–Q25
plus explicit XSS requirement; [glossary](../../../CONTEXT.md).

## Magic Patterns v16 fidelity inventory

Selected source: [versioned handoff](DESIGN.md), Magic Patterns artifact
`fb2e85d3-cf96-4a3f-b0e3-841f9057a4f8` (v16). This is a continuation of
AC-1–AC-3, AC-8–AC-17 and AC-19–AC-22, including the expressly requested atomic
AI authoring extension. Existing chat/editor shell is retained; prototype/demo
controls and future boards are reference-only, not shipped product UI.

| ID    | Source requirement / states                                                                                                                                                     | Intended local owner                                            | Required verification                                                       | Disposition                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| MP-01 | Grip, 16px family icon, title, type/count and right ellipsis on a compact row; selected indigo ring, hover/touch handle                                                         | Knowledge block node/actions                                    | Wide/narrow selection, keyboard/touch/menu                                  | Required                                                    |
| MP-02 | Type-specific soft tinted containers with neutral media; sheet Highlight learning blocks toggle; default on, local display preference, no dirty Save; shared readers default on | Knowledge workspace / block frame                               | On/off, selected/inserted, light/dark                                       | Required; mirror v16 local behavior                         |
| MP-03 | Reorder, duplicate/copy/delete and extensible family menu; empty writable prose after/between blocks                                                                            | TipTap block node / document transactions                       | Drag/keyboard, text insertion, undo, reload, safe paste                     | Required; retain TipTap and safe structured rendering       |
| MP-04 | Desktop right editing panel: 440px max width, 12px inset; mobile 82% bottom sheet expandable to 8px top inset, fixed header/footer                                              | Knowledge block form dialog                                     | Dirty-dismiss/cancel/apply, focus/keyboard, long forms, mobile              | Required                                                    |
| MP-05 | Per-type editors for all six blocks, manual edits local until Apply changes; document Save publishes                                                                            | Knowledge block authoring                                       | All forms, validation, discard/recovery                                     | Required                                                    |
| MP-06 | Atomic AI field check/generation; pending/correct/proposed/failure/stale; current/proposed Accept/Dismiss                                                                       | Knowledge field-AI authoring feature and bounded backend action | Target isolation, input changes, cancel/late result, credits, authorization | Required; accepted vocabulary and bilingual fields          |
| MP-07 | Compact chat preview, full review panel, author and learner variants                                                                                                            | Reusable learning-block entity                                  | Representative all-six contexts and long content                            | Required                                                    |
| MP-08 | Compact proposal header/count/status, Apply, Review, applied Show in sheet, failed Retry                                                                                        | Conversation proposal UI                                        | Preparing/ready/review/applying/applied/failure, scroll/focus               | Required                                                    |
| MP-09 | Update existing block proposal with captured target; stale Add separately/Ask again, no silent overwrite                                                                        | Proposal contracts / backend persistence / editor apply         | Per-block staleness, atomic update, duplicate apply, source authorization   | Required; implementation extends append-only contracts      |
| MP-10 | Vocabulary six-row compact pairs; author/learner per-row folds initially closed; Show/Hide all in menu; two columns at 11+ entries and 560px block width                        | Vocabulary block                                                | Chat vs review vs sheet, expand-all, content-width resize                   | Required                                                    |
| MP-11 | Explicit playback for vocabulary terms/examples, grammar examples and bilingual source/snippets; shared active target                                                           | Speech playback integration                                     | Real prepared playback, generation/unavailable/retry, cross-context stop    | Required; no mock timers or new provider                    |
| MP-12 | Grammar rule/pattern/examples/mistakes; compact summary and focused editor                                                                                                      | Grammar block                                                   | Optional sections, examples/playback, narrow widths                         | Required                                                    |
| MP-13 | Original/Bilingual, translation picker, aligned columns >=560px otherwise stacking, private reader translation                                                                  | Bilingual block / translation feature                           | Multiple languages, prepared/private/stale, role and credits                | Required                                                    |
| MP-14 | Audio player, hidden learner transcript, timed passage/replay and inline related questions; preview/review transcript variants                                                  | Media / exercise blocks                                         | Media/failed/unprepared/transcript variants, hints/reveal isolation         | Required; accepted unprepared audio                         |
| MP-15 | Explicit video playback, supported source/link fallback, description and transcript disclosure, unavailable and honest understanding label                                      | Video block / editor                                            | YouTube/direct/unsupported/unsafe/unavailable, no autoplay                  | Required; no automatic remote understanding                 |
| MP-16 | Folded exercise summary and individually expandable task/input; inline feedback, hint and answer below task, collapse preserves answer                                          | Exercise block / private learning                               | MC/blank/free, retry/loading/reveal/hint/correct distinct                   | Required; free MC/blank check, optional AI feedback for all |
| MP-17 | Exercise set editor, multiple questions and per-question reference/alternatives/explanation/grounding                                                                           | Contracts / authoring / learning persistence                    | Material versions, unchanged progress, copies fresh IDs                     | Required; preserve reusable exercise identity/history       |
| MP-18 | Library create/extend dictionary, create/append Text with selection/preview; media copy panel; library insert and practice launch                                               | Existing library/practice/copy widgets                          | Independent saved items, retry-safe apply/copy, media remains usable        | Required; use real existing practice, no mock replacement   |
| MP-19 | Learner preview and shared reader menu without author editing; private attempts/completion and revoked/sign-in/credits states                                                   | Workbook learning and shared sheet                              | Author/signed-in/anonymous, save vs publication, access lifecycle           | Required                                                    |
| MP-20 | All visual controls/states keep source dimensions, semantic colors, icons, typography, responsive/dark styling                                                                  | Owning CSS Modules / shared primitives                          | Matched reference/runtime capture, styling guard, accessibility             | Required; adapt code mechanisms, not supplied design        |
| MP-21 | Future pronunciation, deeper transcript+description comprehension, difficulty, courses/group context                                                                            | No launch owner                                                 | Ensure future/demo controls absent from launch UI                           | Explicitly deferred per brief and source FutureBoard        |

Brief mapping: KS-01–KS-05 → MP-01–MP-05, MP-19–MP-20; KS-06–KS-08 →
MP-07–MP-09; KS-09–KS-14 → MP-10–MP-17; KS-15–KS-18 → MP-17–MP-19;
KS-19–KS-21 → MP-20; KS-22 → MP-06; KS-23 → MP-21.

Source field-AI, playback, grading, private translations and upload/generation
include fake local results/timers. Implement real existing services and bounded
new action contracts; never port their fake success paths. Preview state controls,
prototype navigation and boards are verification references only. New schemas must
not weaken shared-source authority, XSS validation, asset grants or AI budgets.

## Follow-up: readable content and block mentions — 2026-10-30

Authorized by the user's explicit request to fix formatting/loading and extend
block references when needed. Reuse this active feature branch and its existing
proposal/authority contracts; no unrelated redesign or provider activation.

- REF-1: Generated narrative rule/pattern/explanation fields use readable safe
  Markdown in chat previews, editor and reading views. Verbatim source texts,
  examples, answers, translations and speech input retain their literal content.
  Raw HTML, executable links and embeds cannot execute.
- REF-2: Slash picker and editor block settings attach removable typed references
  to any supported custom block in the current authorized note. Multiple unique
  references (at most eight) may be included in a request. Read-only readers can
  reference/explain but cannot acquire author mutation authority.
- REF-3: References are server-resolved against the authorized frozen source.
  Compact type/title/ID descriptors discover content; bounded exact-ID retrieval
  provides only needed block material, with explicit incomplete/oversize behavior.
  User data cannot grant tool permissions or silently overwrite newer material.
- REF-4: Explain requests reply directly. Requested updates produce distinct
  per-target preview proposals, with explicit Update, Dismiss and insert-at-cursor
  alternatives. Multiple mentioned targets may each receive a bounded proposal;
  updating one does not invalidate another unchanged target. Stale/deleted targets
  cannot be overwritten. Apply changes working draft only; Save still publishes.
- REF-5: Initial successful workspace hydration shows loading rather than a false
  unavailable error. Cancellation/remount is not an error; genuine failures and
  invalid branches remain explicit with existing recovery behavior.

Scoped follow-up status: **Complete**, 2026-10-30. REF-1–REF-5 implementation,
canonical14-flow/816-case verification and independent correctness/security
evidence reviews are approved. Exact source and report identities are recorded
in EVIDENCE.md and REVIEW.md. This does not complete parent F059 or activate a
new provider/model or live uploaded-audio transcription.
