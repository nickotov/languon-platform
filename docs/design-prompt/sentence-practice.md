---
type: design-prompt
title: Sentence practice, AI checks and free reference review
status: current
created: 2026-10-04
updated: 2026-10-04
feature: 036-sentence-practice-backend
source_paths:
    - packages/contracts/src/learning/sentences.ts
    - apps/backend/src/modules/learning/domain/sentence-types.ts
    - apps/backend/src/modules/learning/domain/sentence-feedback.ts
    - apps/backend/src/modules/learning/domain/sentence-content.ts
    - apps/backend/src/modules/learning/application/sentence-practice-service.ts
related_docs:
    - docs/sentence-practice-implementation-plan.md
    - .agent/features/036-sentence-practice-backend/DESIGN.md
    - docs/backlog/004-ai-sentence-translation-practice.md
    - docs/backlog/005-user-selectable-ai-models.md
---

# Sentence practice, AI checks and free reference review — design prompt v001

Copy the entire portable block below into Magic Patterns. This handoff follows
verified backend completion and independent review. It requests design only;
frontend implementation awaits the returned design and its source identity.

Contract fingerprint: `bf172b6c527a218ee5897cf7cf1765e9b27eb9ee0046ac7f69ad6de93c4a1b23`. Source paths are listed above. The immutable
snapshot and selection record are in the [versioned handoff](../../.agent/features/036-sentence-practice-backend/DESIGN.md).
The [implementation plan](../sentence-practice-implementation-plan.md) owns product
scope and future Jev research; no Jev integration is part of this prompt.

## Portable designer prompt

```text
Design a complete interactive, responsive Languon sentence-translation practice experience. This prototype will become the design specification for an existing language-learning product. The backend is implemented and verified. Follow every product rule and required state below, using local prototype fixtures rather than API wiring. Include owner and shared-reader contexts, dialog and full-screen practice, loading/failure states, personal history and free reference review.

VISUAL CONTEXT
Languon uses a calm white/light-gray canvas, dark readable text, indigo primary actions (#4f46e5), subtle neutral borders, restrained shadows and rounded surfaces: about 8px for controls, 12px for cards and 16px for dialogs. Use clear sans-serif typography, generous but efficient spacing, visible focus states and accessible dark-theme equivalents. Practice should feel focused, readable and encouraging rather than like a dashboard or gamified competition. Preserve the established signed-in navigation and dictionary shell. Add Sentence practice beside the existing Flashcards entry in the dictionary learning menu; represent the surrounding dictionary only as context, without redesigning editing/import/export.

SP-01 — ENTRY AND SETUP
Support an owner opening practice from their dictionary and a signed-in reader opening an unlisted shared dictionary. Both have personal practice state. An anonymous shared reader must sign in before sentence practice; present a useful sign-in recovery that returns to the dictionary. If sentence practice is disabled or temporarily unavailable, show an honest unavailable entry state with return navigation.

Use a compact preparation dialog with dictionary title, language direction, optional vocabulary scope, explanation language and practice mode. Allow either dictionary direction. Direction labels use language names and an arrow, not flags alone. Explanation language defaults to the dictionary's front/source language independently of exercise direction and can be changed. Incomplete entries cannot participate; explain skipped entries briefly. Support all eligible entries or a deliberate subset, using searchable familiar vocabulary rows, selected count, select/clear controls and a zero-selection disabled Start state. Do not invent a permanent sentence-settings save flow.

Modes:
• “Saved first” — default. Reuse current, uncompleted saved sentences that have not already been visited in this session before generating more. A successful AI check, of any grade, or explicit reference reveal completes that sentence personally. Skipping without review does not mark it completed; it can return in a later session.
• “New only” — generate fresh sentences on each Next. This is the clear “Generate new sentences” choice for second, third and later sessions as well as the first. It adds to the saved pool and does not replace older valid generations or reset personal progress.
• “Review only” — reuse valid saved sentences, including completed ones; never generate. If the saved pool is empty, show an empty state. If all selected saved sentences were visited in this session, offer a deliberate restart of review or change of mode rather than silently charging for generation.

Explain costs near Start: saved selection and hints are free; new AI generation and AI checking may need credits. An empty saved pool does not create a free reference. Do not show an invented price or automatic purchase flow. Offer “Start in full screen” as the familiar primary launch and a clearly discoverable dialog alternative.

SP-02 — OWNERSHIP, SAVED REUSE AND PROGRESS
Owner-generated exercises can be used by authorized shared readers. Reader-generated exercises are private to their creator. Every draft, AI attempt, manual review, score, exposure and completion is personal; another learner's review cannot complete my practice or appear in my history. Do not display a global shared score leaderboard or another learner's private answers.

All successful generations are saved additively and can be reused while their source entries remain current and authorized. This is a saved practice pool, not a batch-management library: do not invent generation deletion, publishing, sharing reader-created exercises, or an archive browser unsupported by the feature. Entry edits can retire an old exercise; permanent deletion can remove derived content entirely. History may identify authorized older results as “Outdated”, but outdated content cannot be used for a new check/reference review.

Progress counters describe personal activity, not mastery. Show eligible vocabulary, vocabulary seen, vocabulary not yet seen, AI-check count, manual-review count and AI rating distribution as appropriate. Exposure advances only on first actual use of that exercise; reopening it or revealing a reference does not inflate vocabulary coverage. AI and manual event counts are separate and may overlap on the same sentence; do not add them into a fabricated unique mastery percentage. New or edited vocabulary can still need fresh practice.

SP-03 — ACTIVE SENTENCE AND HINTS
Make the original sentence the visual focus. Sentences are simple, natural and complete, with one to three admitted vocabulary targets. Preserve exact punctuation, spaces, case and text order. Display source and response language labels clearly, especially when direction changes.

Only admitted target occurrences are interactive. Give them a subtle highlight/dotted underline with a keyboard-focusable hint affordance; other sentence text remains normal reading text. Clicking, tapping or focusing a target opens an accessible lexical hint. Hints contain the dictionary mapping in normalized form: a lemma/infinitive or a phrase, not the entire reference translation. A surface form such as “gehe” may map to the dictionary infinitive “go”; the hint need not copy the source inflection. Phrases remain grouped, including languages whose words are not separated by spaces.

Repeated occurrences of one target share one hint and reveal state. Showing/hiding a hint must not duplicate exposure or paid work. Revealed hints remain visible or recoverable after changing layout. Indicate assistance neutrally; using hints never deducts points. If a word has multiple mappings, show exactly the mapping admitted for this exercise rather than inventing a dictionary lookup tool.

Use a coherent example in the prototype: German source “Ich gehe heute zu Fuß zur Arbeit.”; lexical targets “go”, “on foot”, “work”; one valid English reference “I go to work on foot today.” A response using “walk” while omitting required “go”/“on foot” can communicate meaning but misses required vocabulary. Supply long, repeated-target, non-Latin and RTL fixture examples as well.

SP-04 — ANSWER DRAFT AND DEFAULT AI CHECK
Place a clearly labelled multiline translation field below the sentence, with a short prompt and accessible character-limit feedback when relevant. Keep the learner's exact draft. The primary action is “Check with AI”. Empty/whitespace-only or too-long answers cannot be submitted. Explain validation inline without losing text.

AI checking submits the current answer and preserves that submitted version while pending. Prevent duplicate checks and show a stable pending state. If editing is offered during a pending check, distinguish the new draft from the submitted text; feedback highlights must refer to the exact submitted answer, never to a different edited draft. A simpler read-only-during-check approach is acceptable if the draft is retained and cancellation/retry remains clear.

Use a compact secondary “Show reference answer — free” action. It is always an explicit user choice, never an automatic fallback after a failed check or exhausted credits. Free reference review is available for a current saved exercise even when the learner has no credits or the current AI model/worker is unavailable. Show hints for free as well. If no exercise has been saved, explain that new generation is still needed before a reference can exist.

SP-05 — AI RESULT AND CORRECTIONS
Display the percentage, plain-language rating and explanation in the selected explanation language. Ratings are:
• 100 — “Perfect”
• 80–99 — “Good”
• 50–79 — “Not bad”
• 0–49 — “Practise again later”

Required vocabulary is strict while grammatical inflections are allowed. A synonym does not replace a required dictionary target. Missing any required target limits the rating below Good, at most 79. Meaning, grammar, spelling or any real issue prevents a perfect 100. Hints and reference assistance do not reduce an otherwise valid grade. Do not add confidence percentages or reinterpret the grade as a probability.

Show the exact submitted answer, readable corrections anchored to exact substrings, target-vocabulary status, a corrected/improved translation when returned, and concise feedback details. Provide expanded feedback without crowding the central practice action. Highlights must preserve graphemes and punctuation; do not color arbitrary individual UTF-16 fragments. Support a meaningful issue without an available text span and a perfect result with no corrections. Do not rewrite the learner's answer in place.

Allow deliberate new AI attempts on the same exercise when appropriate, keeping older attempts in personal history. The result remains attached to its original submitted answer and explanation language. A grade is not a mastery claim. Give Next and accessible secondary navigation clear priority after feedback.

SP-06 — FREE MANUAL REFERENCE REVIEW
After explicit reveal, display a neutral “Reference translation” panel alongside or below the retained draft. Explain: “One valid translation. Your answer may also be correct.” It must look distinct from scored AI feedback: no percentage, rating, pass/fail verdict or automatic exact-string comparison. Show that it is recorded as “Manually reviewed” and completes this sentence for the learner's Saved first practice. Keep AI statistics unchanged.

Offer comparison, Next and an optional later “Check with AI” when paid checking is available. Zero credits should explain why AI checking is unavailable while the reference and Next/review remain usable. Do not require purchase or model configuration to reveal an existing valid reference. Do not silently discard the draft or submit it to AI on reveal.

Reference reveal is personally replay-safe; retrying a failed network response cannot create duplicate reviews. If reveal fails because access changed or the exercise became outdated, display that failure without pretending the answer was revealed or completing the sentence. Hiding the panel does not erase the saved review.

If the reference was revealed before an AI submission in the same session, the resulting attempt is neutrally marked assisted; its grade is unchanged. If reveal happens after a check was submitted, keep that attempt's original assistance metadata. Do not relabel old attempts when a later reference is shown.

SP-07 — ASYNC WORK, CANCELLATION AND RECOVERY
Generation and checking can be queued, running, retrying, completed, failed or cancelled. Use honest indeterminate progress, not invented percentages, queue positions or completion times. Distinguish “Preparing a new sentence” from “Checking your translation”. Maintain the surrounding layout so controls do not jump.

While pending, prevent duplicate paid actions; keep the operation attached to its original exercise/draft. A retry of the same request resumes the same work, not a new charge. Provide cancellation with “Stopping…” after it is requested. Explain gently that an already-started AI request may have consumed credits; do not promise a full refund. Cancellation, layout switching or a late response must not unexpectedly replace the current exercise/result.

For generation failure preserve setup and offer a deliberate retry, saved review if available, or return. For check failure retain the draft and exercise, offer retry or explicit free reference review when still authorized. Temporary capacity pressure is a retryable unavailable state, not deleted content; respect retry delay without a fake countdown. Credit exhaustion, model unavailable, offline/network failure, timeout and provider failure need clear different explanations and useful actions.

Changing the profile model choice applies to future requests; pending work retains its original choice. Link to AI preferences only when relevant. Do not display per-attempt model identity or exact cost if not supplied. Existing saved hints/reference review remain free when AI capacity or a current model is unavailable.

SP-08 — PERSONAL HISTORY AND SUMMARY
Provide a compact personal results/history panel with separate “AI checks” and “Manual reviews” views. AI rows show date/time, source sentence/languages, exact submitted answer, grade/rating, assistance, and expandable feedback. Manual rows show reference translation/date and “Manually reviewed”, with no score. Support pagination/loading-more, empty views and a failed page load without wiping already loaded rows. Only my results appear, including on a shared dictionary.

Outdated historical content is labelled clearly and read-only. Permanently removed content must not persist as a selectable cached row. Do not invent undoing a manual review, resetting server progress or deleting individual attempts. A session summary may summarize actual session actions and current returned counters, separating scored checks from manual review. Avoid invented streaks, points, badges, mastery percentages or scheduled repetition.

SP-09 — FULL SCREEN, DIALOG AND CONTINUITY
Design a focused full-screen desktop practice view and a bounded, scrollable dialog view. Both render the same session, exercise and controls. On mobile use the full viewport with safe-area spacing; keep the draft and actions reachable above the keyboard without obscuring the sentence or hint affordance. Long text/feedback scrolls naturally without moving the primary controls off-screen.

Start full screen on the user's gesture. If native browser full screen is unavailable, use the viewport layout as the fallback. A discoverable toggle switches between full screen and dialog on demand. Switching preserves exercise, draft, revealed hints/reference, submitted answer, feedback, personal/session counters and pending work; it never regenerates, checks, clears completion or starts a second job. Popovers and confirmation dialogs remain visible and usable in either mode.

Match the existing flashcard practice convention for Escape/native full-screen exit and explicit close. Separate changing presentation from ending practice. If leaving would discard an unsent draft or hide pending work, offer a clear “Keep practising” / “Leave practice” confirmation and truthful pending-work information. Do not imply closing the UI automatically cancels or refunds work. Restore focus to the originating dictionary learning control. Native full-screen exit itself must not erase session state.

SP-10 — COMPLETE REQUIRED STATE INVENTORY
Provide a demo gallery outside the product flow, showing all of these:
1. Owner entry and setup; signed-in shared-reader entry; anonymous sign-in requirement.
2. Initial preparation loading; preparation/network failure and retry; feature unavailable.
3. Both directions and explanation-language selection; re-preparation after changed direction/scope.
4. All-entry versus subset selection; no selected entries; partially ineligible entries; no eligible entries.
5. First practice with no saved sentences; Saved first on second/later sessions with partial coverage and reusable uncompleted sentences.
6. New only on a later session, with earlier generations retained; Review only with saved content.
7. Review-only empty pool; all selected saved exercises visited this session; explicit restart/change mode.
8. Generation queued/running/retrying; generation failed/timed out/cancelled; cancellation requested.
9. Source sentence before hints; one hint; repeated target; multiple hints; phrase target; long/non-Latin/RTL sentence.
10. Empty draft, typing, too-long validation, ready-to-check and exact submitted answer.
11. AI check queued/running/retrying, duplicate action disabled, cancelled, timed out or failed with draft intact.
12. Perfect/Good/Not bad/Practise again later results; missing required target; minor issue; spanless issue; long feedback; assisted result without penalty.
13. Reference hidden; explicit reveal pending; reference revealed with neutral manual-completion state; hide/reopen; reveal retry/no duplicate review.
14. Zero credits with a saved exercise: reference/hints/review remain usable while AI checking explains the limitation.
15. Zero credits with no saved exercise: no fabricated free generation/reference; useful return/options.
16. Current model/worker unavailable with valid saved content; open AI preferences without losing local session context where feasible.
17. Temporary queue/budget capacity unavailable, distinct from missing exercise; manual review still available.
18. Offline/transient errors preserving the current in-memory draft; reconnected polling resumes the same work.
19. Source entry edited/outdated, permanently removed exercise, dictionary archived/unavailable, revoked share and expired session; stop protected reads and do not reveal stale reference content.
20. AI history empty/loaded/loading-more/page-error; manual history empty/loaded; outdated result.
21. Session progress and end summary with separate AI/manual counters and vocabulary seen/not seen.
22. Desktop full screen, desktop dialog, mobile, tablet, dark theme, keyboard open and 200% zoom.
23. Switching layout with a draft, revealed reference, feedback and an active generation/check job.
24. Native full-screen unavailable/exit fallback and leave-practice confirmation.
25. Long localized labels, RTL layout, reduced motion and keyboard-only hint/feedback access.

SP-11 — ACCESSIBILITY
Use semantic labelled controls, keyboard-operable hint buttons and popovers, stable focus, dialog focus containment and restoration, comfortable touch targets and visible focus rings. Announce async work/result changes without narrating the entire sentence repeatedly. Use accessible error summaries and associate input validation with the draft. Do not rely on color for target marking, correction severity, grades or unavailable actions. Preserve reading order in both layouts. Respect reduced motion, screen-reader text, RTL direction and language tags. Help and essential recovery cannot depend on hovering.

DELIVERABLE
Produce a clickable prototype containing setup, full-screen/dialog active practice, scored feedback, free manual-reference comparison, separate personal history, session summary and the complete state gallery. Include realistic mobile/dark/error/loading examples. Demo-state controls are review aids, not product settings. Preserve every SP requirement; keep the experience focused and avoid unrelated dictionary editing, purchases, API setup, future checker-provider controls or social features. No API paths or backend wiring are needed. The final design will be implemented using Languon's existing components after user review.
```

## Return the design

Return the Magic Patterns editor link and its exported source or retained captures.
Record the exact provider revision/export date so a future implementation can select
this revision explicitly. No generated design or implementation target has been
selected yet. Keep requirement IDs stable when revising this brief; create a new
snapshot rather than modifying v001.
