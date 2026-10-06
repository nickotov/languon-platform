---
type: design-prompt
title: Sentence practice contextual hints, free comparison and replay
status: current
created: 2026-10-05
updated: 2026-10-05
feature: 038-sentence-practice-assistance
source_paths:
    - packages/contracts/src/learning/sentences.ts
    - packages/prompts/src/local/sentence-generation.ts
    - apps/backend/src/modules/learning/domain/sentence-content.ts
    - apps/backend/src/modules/learning/domain/sentence-types.ts
    - apps/backend/src/modules/learning/application/sentence-worker-service.ts
    - apps/web/src/fsd/features/sentence-training
related_docs:
    - docs/sentence-practice-assistance-implementation-plan.md
    - .agent/features/038-sentence-practice-assistance/FEATURE.md
    - .agent/features/038-sentence-practice-assistance/EXEC_PLAN.md
    - docs/backlog/004-ai-sentence-translation-practice-done.md
---

# Sentence practice contextual hints, free comparison and replay

The backend checkpoint is implemented, verified on disposable infrastructure and
independently reviewed. New generation-format activation remains gated until the
compatible UI and release workers are ready. The free-comparison and results/replay
UI described below is pending the returned Magic Patterns design; overall feature
implementation is not complete.

The [detailed plan](../sentence-practice-assistance-implementation-plan.md),
[feature requirements](../../.agent/features/038-sentence-practice-assistance/FEATURE.md)
and [ExecPlan](../../.agent/features/038-sentence-practice-assistance/EXEC_PLAN.md)
own scope and progress. The [earlier sentence prompt](sentence-practice.md) is a
historical visual reference, with its original frozen revision preserved. This
brief extends the delivered practice surface; its rules below supersede older
prototype assumptions about bounded dialogs, completed-example exclusion,
dictionary-only hints and nested end summaries.

## Portable Magic Patterns prompt

Copy this block into Magic Patterns. The prototype uses
local demonstration data only and contains no concrete API paths.

```text
Design an interactive, responsive extension to Languon's existing sentence-translation practice. Deliver ONE cohesive prototype with TWO related product screens: (1) practice with contextual vocabulary help, default AI checking and free reference comparison; (2) completed-session results with exact-example and fresh-example replay. Both screens use the same practice surface. Include a separate review-only state gallery; its controls are prototype review aids, not learner settings.

This is a focused extension of an existing language-learning application. Preserve the dictionary learning entry, language direction, bounded round setup, personal history, saved-example reuse, inline AI settings, dialog/fullscreen continuity and accessible close behavior. Do not redesign the surrounding dictionary, account, navigation or billing product. Do not add purchases, difficulty controls, a new AI provider, gamification, helper-word creation, social scores or an automatic practice schedule. Use realistic fixtures and local interactions; no backend wiring, concrete API paths or technical integration controls are needed.

VISUAL BASELINE
Use a calm white/light-gray canvas, dark readable text, indigo primary actions, subtle neutral borders, restrained shadows and clear sans-serif typography. Follow the existing Languon component language: approximately 8px control rounding, 12px cards and 16px rounded secondary surfaces. Use efficient spacing and a readable sentence column within a spacious practice shell. Dark theme needs equivalent contrast, focus and hierarchy, not a simple inverted screenshot. Favor focused learning over dashboard density. Keep essential actions stable across loading, feedback and comparison states.

SPH-01 — TWO SCREENS, ONE CONTINUOUS SURFACE
The active practice screen contains a sticky header, concise round progress, the source sentence, an editable translation field, help/feedback and reachable actions. Its header always includes a clearly labelled close/stop-practice control and a discoverable presentation toggle. Closing the interface is distinct from cancelling running AI work; do not promise a refund or automatic cancellation.

The completed screen REPLACES the exercise in that same surface. It does not open a second results dialog over the learning dialog. Preserve the practice title, clear exit and presentation continuity. Make the result readable and the two replay choices obvious. The final checked answer and reference/feedback must remain available as result details, without forcing the learner to keep the exercise open behind another modal.

SPH-02 — ROUND SETUP AND SAVED REUSE
Retain direction, explanation language, dictionary batch/manual entry selection and existing modes. Label source and answer languages by name. The initial direction presents the learner's familiar translation language and asks for the dictionary's learning language; both directions remain selectable.

Each round uses at most 100 eligible dictionary words. A dictionary batch takes the first eligible words in stable order. Clearly state that rule in setup and offer Choose entries with search and Load more to practise other words; manual selection also supports at most 100 words. Do not invent tag filters, automatic next batches or batch pagination controls. Incomplete entries are excluded with a useful explanation. Zero selected/eligible words disables Start or shows an honest empty state. Round progress is separate from whole-dictionary lifetime progress.

Saved first is the default. Reuse current saved sentences and their stored hints, INCLUDING examples checked with AI or manually reviewed in earlier sessions, before generating for the words still missing in this round. New examples explicitly requests fresh generation and retains all earlier valid examples/history. Review saved never generates. A second or later session must not silently switch to fresh generation. Older examples may have dictionary-target hints only; keep them usable without paid enrichment or a regeneration requirement.

Explain that saved selection and hints are free; new generation and AI checking may require credits. An empty saved pool does not manufacture a free sentence or reference. No invented prices or checkout. Owner and signed-in shared-reader states are supported; anonymous readers receive sign-in recovery back to their dictionary.

SPH-03 — SOURCE SENTENCE AND REQUIRED WORDS
Make the source sentence the visual focus. Preserve its exact text, punctuation, spaces, case and order. Display source and response language labels near the sentence/input so the learner cannot confuse which language to translate into.

Dictionary-required words and phrases retain a recognizable treatment. One sentence has one to three required dictionary targets. Required words are the vocabulary task and contribute to the selected-word round; additional help is supporting vocabulary. Use visual treatment plus an accessible label/legend to distinguish required vocabulary from contextual help. Do not rely on color alone or show every hint translation upfront as a word bank.

Useful contextual help covers additional nouns, adjectives, verbs, adverbs and meaningful expressions. A newly generated rich example contains at least one useful helper, with at most 40 additional hint records alongside the one to three dictionary targets. These are content limits, not visible learner settings. Articles and simple auxiliary grammatical words can remain unhinted. Contextual helpers are saved with the sentence, free to reopen and do not become dictionary entries, required targets, mastery points or additional progress. A sentence can have several useful helpers, but never create a dense translation overlay over every grammatical token.

SPH-04 — WHOLE PHRASES, IDIOMS AND REPEATED OCCURRENCES
An idiom, phrasal verb or inseparable expression is one coherent hintable span. Tapping or focusing it reveals the contextual meaning of the whole phrase, not misleading translations of its individual pieces. Multiword dictionary targets likewise stay grouped. Support phrases in scripts whose words are not separated by spaces and phrases that wrap across visual lines without breaking their reading order.

Repeated occurrences can share the same stored hint. Each visible occurrence remains a distinct keyboard/touch trigger, with a predictable focus target and popover anchor. Opening a hint on one occurrence must not open duplicate popovers on every repeated occurrence. Its already-seen assistance state may be shared, while the active trigger remains clear. Different contextual senses must not be collapsed into one invented translation. Hint use never costs credits or lowers the AI score.

Provide hover as a convenience, plus explicit click/tap and keyboard activation. Use accessible buttons/popovers, Escape dismissal and sensible focus restoration. Screen readers should identify the source span, whether it is required vocabulary or contextual help, and the translated hint. Essential information must not depend on hovering or a subtle color difference. Preserve visible focus in light/dark themes.

SPH-05 — COHERENT PROTOTYPE EXAMPLES
Use Russian source and French answer for the main demonstration, with clear labels. Example: “Сегодня я навещаю друга после работы.” Reference: “Je rends visite à un ami après le travail aujourd'hui.” Dictionary targets include “друга” → “ami” and “работы” → “travail”; contextual help includes “Сегодня” → “aujourd'hui” and the meaningful verb expression “навещаю” → “rendre visite”. Do not transliterate French slang into an unnatural Russian sentence.

Provide a whole-expression example, such as “Сегодня я держу тебя в курсе.” with contextual expression “держу тебя в курсе” → “tenir au courant”, and a repeated-target example, such as “Уютный дом стоит рядом с другим домом.” where “дом” and “домом” share the required hint “maison”, while other content words offer contextual help. Keep the distinction between phrase help and required dictionary vocabulary visible. Use coherent translations checked within the prototype fixtures.

Also include a legacy example with only dictionary hints, a long sentence with wrapped phrases, and non-Latin/RTL examples. These are fixtures for layout and interaction, not a new difficulty setting.

SPH-06 — EXACT DRAFT AND DEFAULT AI CHECK
Use a labelled multiline translation field. Preserve the learner's exact text; do not silently replace it with a normalized draft or the reference. Provide whitespace-only/empty validation, the existing 4,000-code-point limit and useful over-limit feedback. Keep long text editable and actions reachable. The primary assessment action is Check with AI; the free action is visibly distinct.

When AI checking begins, preserve its exact submitted answer. Either hold the input read-only while pending or clearly distinguish a later draft from the submitted version; feedback must attach to the submitted version. Prevent duplicate checks. Switching presentation or opening AI settings preserves the exercise, exact draft, hints, reference disclosure and pending work.

AI output evaluates meaning, grammar and required dictionary vocabulary. Natural inflections and valid alternative translations can be accepted. Supporting contextual hints are not additional mandatory vocabulary. Existing rating labels remain: Perfect at 100, Good at 80–99, Not bad at 50–79, Practise again later below 50. Missing required targets caps the score at 79; a real issue prevents Perfect. No probability/confidence score or mastery claim. Hints/reference assistance are neutral and do not deduct points.

SPH-07 — FREE CONSERVATIVE REFERENCE COMPARISON
Provide a clear secondary action such as Compare with reference — free. Explain that this checks a normalized match to ONE saved translation, not meaning or grammar. It explicitly reveals the authorized reference; never reveal it automatically because AI failed or credits ran out. Reference-only reading may remain available without a draft; avoid a fabricated match verdict on an empty answer.

The comparison ignores case, extra spaces, punctuation and typographic apostrophe variations; canonically equivalent Unicode spelling matches. Accents, meaningful characters and word order remain significant. Do not normalize the displayed draft or reference, and do not turn separated words into a merged word. No synonyms, grammar analysis or fuzzy semantic promise.

Use two honest results:
• “Matches the reference after normalization.” Include a brief description of the ignored formatting differences. Do not award a score, AI badge, quality rating or a semantic Correct label.
• “Different from this reference.” Explain: “Another translation may still be valid. AI checking can evaluate meaning and grammar.” A difference is not a wrong-answer verdict. Avoid a red failure treatment that implies semantic rejection.

Demonstrate draft “j'arrive   demain” compared with reference “J’arrive demain.” as a normalized match while preserving both exact strings. Demonstrate changed word order, “cafe” versus “café”, and an alternative phrasing as differences without claiming they are incorrect. The explanatory text must be visible, not hidden only in a tooltip.

SPH-08 — REFERENCE PRIVACY, MANUAL RECORD AND ZERO CREDITS
Before an explicit reveal/comparison, keep the complete reference hidden. Lexical hints must not expose the entire reference answer. A successful free reveal records a personal manual review, without an AI attempt, grade or credit charge. Showing and hiding the reference again does not duplicate manual counts. Free comparison uses that reference; it is not a second assessment provider.

With zero credits or unavailable AI, an existing current saved sentence still supports hints and free reference comparison. Explain the AI limitation next to its action; leave free actions usable. A learner with no saved sentence cannot obtain free generation. If AI is available later, an optional Check with AI action may assess the retained draft; reference-assisted metadata is shown neutrally, without a penalty.

AI and manual records may overlap on one example and stay separate. Revealing after a check was submitted does not relabel that earlier attempt's assistance. Another learner's answers, reviews, grades and drafts never appear in the current learner's screen, including on a shared dictionary. Do not introduce shared leaderboards or owner-wallet entitlement.

SPH-09 — FINAL SENTENCE AND COMPLETION TRANSITION
Coverage counts dictionary words appearing in the round, including skipped examples; repeated occurrences count once. Once all selected words have appeared, no additional sentence generation is allowed in that round. KEEP the final sentence available to answer. Showing that all words have appeared must not immediately discard it.

Complete the session after one finishing action on that final sentence: a successfully returned AI check, a successful explicit reference reveal/comparison, or Skip. An AI check can complete successfully with a low score; completion is activity, not mastery. A queued/running check, failed check or failed reference request must not finish the session. Keep the draft and recovery available on failure.

After that finishing action, replace practice with the results screen. Preserve the final submitted answer, AI feedback or revealed reference as readable result details. Skipping the last sentence should show a skipped result, not invent a check/reference record. Do not require an extra sixth example, hidden generation or a second modal to reach statistics.

SPH-10 — SESSION RESULTS AND COUNTS
Show a concise completion title and the dictionary/language context. Summarize examples presented, distinct selected words seen, successful AI checks, manual reviews and skipped examples using actual session activity. Show AI ratings only when AI checks exist. Keep free manual/reference-assisted activity separate from graded checks; do not sum overlapping event types into a fabricated unique correctness percentage.

Allow expanding final-answer details and personal result rows while retaining the two continuation actions. Support only-AI, only-manual, only-skipped, mixed, no-AI-score and long-feedback variants. A skipped-only round is complete but ungraded. Do not invent points, badges, streaks, reset-progress buttons or per-example deletion controls.

Lifetime dictionary statistics are separate from this round's counters. Repeating the examples starts fresh session counters without erasing persisted personal history. Revealed hints do not inflate vocabulary coverage. Repeated button presses/recovered responses do not duplicate counts.

SPH-11 — REPEAT THE EXACT EXAMPLES
The first continuation action is Repeat these exact examples. It uses precisely the exercise sequence from the session just completed, in the same order, with the same stored sentence/hints/reference. Do not silently select different saved sentences or regenerate them. Label this as saved replay without implying that all future AI checks are free: selecting examples and revealing existing hints/reference are free, while a new AI check may still require credits.

Start new round interaction state: fresh drafts and appropriate hint/reference disclosure state, fresh session counters and the same language/scope context. Retain persisted history. Replay is finite and uses the same final-action completion behavior. Support one example and a multi-example sequence with repeated dictionary words.

If a replay example became outdated, deleted or inaccessible, explain the affected saved replay and offer a deliberate return/change of practice. Do not show protected cached reference content or secretly swap in another example while calling it exact replay. Loading/recovery must not duplicate or reorder examples. Changing presentation does not restart replay.

SPH-12 — GENERATE FRESH EXAMPLES
The second continuation action is Generate new examples. It deliberately selects fresh generation for the configured eligible words, respecting the existing finite batch and normal credits/model/readiness limits. Old generations and personal history remain saved. Do not reset lifetime progress or call new generation free.

Show admission/loading honestly and prevent repeated clicks from starting duplicate work. If fresh generation is unavailable, retain the result screen and useful return/exact-replay actions rather than losing the completed session. No automatic next batch, automatic model fallback, purchase flow or unlimited Generate loop.

SPH-13 — ASYNC WORK, BOUNDED RECOVERY AND UNKNOWN OUTCOME
Distinguish Preparing a sentence, Checking your answer, Revealing the reference, Loading saved replay and Loading personal results. Use honest indeterminate progress; do not invent queue positions, percentages or completion times. Queued/running work stays attached to its original exercise and exact submitted answer.

Temporary transport failures can recover automatically within a bounded retry window. Make the waiting/recovering state visible. If a server-provided retry time exists, show a truthful countdown and disable early duplicate submission; never invent timing. A long delay beyond automatic recovery offers explicit recovery when due. Repeated recovery resumes the original work, not a replacement paid request.

An uncertain response means the original task may still be running. Say so and offer Get result/Resume checking before creating another operation. Keep the answer saved in the current session. A poll failure must not display an empty exercise as though it were deleted. A late response after reset, cancellation or lost access must not replace current content.

Cancellation offers Stop request, then disabled Stopping… until acknowledged. Cancelled work preserves the appropriate draft/setup and offers deliberate continuation. Closing practice can hide work without proving cancellation; leave guards must communicate that distinction. Never guarantee no charge or a full refund for already-started AI work.

SPH-14 — ERROR STATES AND EXPLICIT FREE FALLBACK
Separate these failures: offline/transient network, poll/read failure, retryable capacity/rate pressure, exhausted credits, unavailable model, malformed AI result, timeout/provider failure, reference failure, stale content and lost access. Give each an appropriate action while preserving authorized local work.

Malformed/failed AI feedback must not be fabricated into a score or automatically reveal the reference. Keep the draft, explain the failure and offer bounded recovery or explicit free reference comparison when still authorized. Wrong-language generation is a failed/retrying preparation state; do not present it as a valid exercise and ask the learner to translate in the wrong direction.

Reference failure must keep the reference hidden and the exact draft intact, with no successful-match/manual-completion claim. Retrying an uncertain reference response should not create another manual-review record. Capacity/model/credit errors do not make an existing authorized free reference unavailable. A stale or revoked example does.

SPH-15 — ACCESS LOSS, VERSION CHANGES AND PERSONAL HISTORY
Source edits may make a saved exercise outdated; deletion, archive, revoked sharing or sign-out can remove live authority. Immediately remove protected cached exercise/reference/feedback from the current view when access is lost. Do not rely on a failing refresh to keep old private data visible. Offer clear return/sign-in recovery without dumping the learner's answer into a URL or public screen.

Existing personal history may identify authorized outdated results as read-only, but outdated content cannot be used for a new check/reference reveal. Permanently removed content must not remain selectable from a cache. History has separate AI/manual activity, empty/loading/loading-more/page-error states and retained already loaded authorized rows where appropriate. This history is not another learner's results or a new saved-exercise library.

SPH-16 — FULL-VIEWPORT DIALOG, FULLSCREEN AND KEYBOARD LAYOUT
The learning dialog occupies the ENTIRE window width and height: 100dvw and 100dvh. It is not a small centered bounded modal. Fullscreen uses the same focused content and controller; if native fullscreen is denied or unavailable, use the viewport layout. Keep a sensible readable content width inside the full-window shell without shrinking the dialog itself.

Use a sticky reachable header with close/back and a stable action area. Long sentence, hints, reference, draft and feedback can scroll without hiding essential exit controls. On mobile account for safe areas and the on-screen keyboard; the focused translation field and actions must remain reachable without covering the sentence or leaving a trapped scroll region. Avoid horizontal overflow with long phrases/localized labels.

Switching presentation preserves exercise, exact draft, submitted answer, hints/reference disclosure, pending work, final feedback, counters and replay position. It never admits another paid request or starts another session. Native fullscreen exit does not erase the session. Explicit close restores focus to the dictionary learning control and guards unsent work appropriately.

SPH-17 — INLINE AI PREFERENCES AND RETURN NAVIGATION
AI settings opens INSIDE the current practice surface, either as an inline collapsible section or a replacement inner view with a visible back arrow at the top. Do not open a second AI-settings modal over learning. Returning restores the same draft and exercise, with stable focus. Pending work retains its originally selected model; saving a preference affects future requests only.

Dirty model choices receive a clear Keep editing/Discard decision when needed. Back returns within practice; Close attempts to leave practice and then applies the ordinary unsent-answer/pending-work guard. Do not swallow close requests or reset the answer because a settings view was opened. Avoid unrelated account controls or provider configuration.

SPH-18 — ACCESSIBILITY AND LOCALIZATION
Use semantic labelled controls, visible focus, reliable dialog focus containment/restoration, comfortable touch targets and predictable reading order. Hint triggers are individually keyboard reachable, phrase-sized and properly labelled. Focus/popover placement must work in native fullscreen and the viewport dialog. Announce async/result changes briefly, without repeatedly narrating the whole sentence.

Associate validation/errors with the translation field and provide non-color indicators for required/contextual hints, ratings, unavailable actions and comparison differences. Support long translated labels, non-Latin scripts, correct content direction/language metadata, RTL sentence text and mixed-direction drafts. Do not assume the interface locale changes because a sentence is Arabic. Include dark theme, reduced motion and a narrow/reduced-height keyboard-visible layout. Show an honest 200% zoom/responsive stress variant without promising tested device behavior.

SPH-19 — REVIEW-ONLY STATE GALLERY
Provide selectable fixtures outside the learner flow for all of these groups. Each must demonstrate its meaningful actions and retained/cleared state, not just a static alert:

A. Setup: initial loading; retryable preparation failure; both language directions; dictionary batch first eligible words; manual search/Load more; 100-word cap; empty selection; incomplete/zero eligible entries; Saved first later-session reuse; explicit New examples; review-only empty/exhausted; anonymous sign-in.
B. Hints: new rich example; multiple ordinary helpers; whole idiom/phrasal expression; required multiword phrase; repeated hint with distinct visible triggers; long wrapping phrase; unhinted grammatical helper; legacy dictionary-only example; non-Latin and RTL examples; keyboard/touch-open popover.
C. Draft/check: empty/whitespace draft; typing; ready; over-limit editable draft; check queued/running; retained exact submitted answer; perfect/low-score/missing-required-word/spanless-issue/long-feedback; reference-assisted AI result; check failure with exact draft preserved.
D. Free action: hidden reference; comparison/reveal loading; normalized match; difference with valid-alternative disclaimer; case/punctuation/apostrophe/whitespace variants; accents/order difference; empty-draft neutral reference; hide/reopen; failed/uncertain reveal; zero-credit saved example; unavailable AI with free action still usable; no-saved-example zero-credit state.
E. Work/recovery: generation queued/running/retrying; poll failure; bounded automatic retry; known retry countdown; long-delay explicit recovery; unknown job outcome/Get result; malformed AI feedback with explicit free fallback; timeout; cancellation requested/Stopping; cancelled; offline; capacity pressure; late result fenced after restart.
F. Final action/results: coverage exhausted but final sentence answerable; final check pending/fails without completion; final reveal fails without completion; final successful AI result replaced by statistics with feedback details; final reference/manual completion; final skip; mixed/only-skipped/only-manual/no-AI-score counters; long final details; close/back reachability.
G. Replay: exact single-example replay; exact multi-example ordered replay; repeat completion; replay loading/recovery; stale/deleted/revoked replay item without substitution; explicit fresh-generation admission; new-generation failure retaining completed results; insufficient credits/model unavailable while saved replay remains possible.
H. Navigation/access/layout: full-viewport dialog; native fullscreen/fallback; presentation switch with draft, reference and pending work; inline AI settings/back; dirty settings guard; unsent-answer/pending-work leave guard; sign-out; revoked share; outdated source; deleted content; desktop/tablet/narrow/dark/reduced-height keyboard layouts; RTL and long labels; personal history loading/empty/page-error.

SPH-20 — DELIVERABLE AND NON-GOALS
Return a clickable prototype with the two related screens and their complete review state gallery. Make the happy path coherent: start a saved or new finite round, inspect contextual/required hints, type an answer, check with AI or explicitly compare for free, finish the final sentence, view inline results, repeat the exact sequence or deliberately generate fresh examples. Provide mobile, dark, loading/error and keyboard-focused demonstrations.

Keep every SPH requirement identifiable for later implementation review. Demo toggles must not become product settings. Do not add concrete API paths, backend wiring, credentials, technical format controls, automatic paid legacy enrichment, helper-word dictionary creation, semantic exact-match grading, a second results/settings modal, purchase routes, new difficulty controls or unrelated shell/account redesign. Design the real interaction and its honest limits, rather than a fictional AI capability.
```

## Requirements checklist for design review

| ID     | Required design evidence                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- |
| SPH-01 | Practice and results replace each other in one surface; final details remain reachable.                  |
| SPH-02 | Finite 100-word dictionary/manual setup, saved-completed reuse, explicit new mode and legacy reuse.      |
| SPH-03 | Required targets differ accessibly from supporting content-word hints without changing coverage.         |
| SPH-04 | Whole phrases and repeated hint IDs have individually usable keyboard/touch triggers.                    |
| SPH-05 | Coherent Russian/French fixtures plus phrase, repeated, legacy, long and RTL/non-Latin examples.         |
| SPH-06 | Exact editable draft, honest validation, default AI checking and retained submitted answer.              |
| SPH-07 | Free normalized match/difference with visible valid-alternative disclaimer and no semantic grade.        |
| SPH-08 | Explicit private reference reveal; zero-credit/unavailable-AI use; separate manual/AI records.           |
| SPH-09 | Final sentence remains answerable until successful check/reveal or skip; failed work does not complete.  |
| SPH-10 | Results show accurate separate session counts, final details and no mastery claims.                      |
| SPH-11 | Exact replay retains the original sequence without generation or silent substitution.                    |
| SPH-12 | Explicit fresh generation is finite, normally billed and preserves completed results on failure.         |
| SPH-13 | Polling, bounded recovery, honest countdowns, unknown outcomes and cancellation preserve identity/state. |
| SPH-14 | Distinct actionable failures, no fabricated AI feedback and explicit free fallback only.                 |
| SPH-15 | Lost access clears protected content; stale/deleted history cannot remain selectable.                    |
| SPH-16 | 100dvw/100dvh dialog, fullscreen continuity, reachable exit/actions and keyboard-safe layouts.           |
| SPH-17 | Inline AI preferences/back and dirty-work guards without a second settings modal.                        |
| SPH-18 | Focus, semantics, touch, announcements, localization, RTL, dark and reduced-motion examples.             |
| SPH-19 | Review gallery covers every listed loading, empty, result, error, recovery and replay group.             |
| SPH-20 | One cohesive two-screen prototype; no unsupported capability or implementation controls.                 |

## Versioned handoff and next step

[Feature-owned design handoff](../../.agent/features/038-sentence-practice-assistance/DESIGN.md)
records immutable v001, the reviewed backend boundary and a blank generated-design
URL. The previous sentence-practice prompt/design remains unchanged.

Return the generated Magic Patterns editor link and identifiable export or provider
revision/captures. Frontend implementation will use the selected preserved design,
then complete real-browser verification. No UI implementation or design fidelity is
claimed by this prompt. The full state inventory remains acceptance criteria.
