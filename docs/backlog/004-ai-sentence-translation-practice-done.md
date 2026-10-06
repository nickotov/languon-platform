---
type: backlog-task
id: BL-004
title: 'AI sentence translation practice'
status: done
created: 2026-10-01
updated: 2026-10-06
original_tasks: '7'
depends_on:
    - BL-005
evidence:
    - .agent/improvements/sentence-practice-ui-fidelity.md
    - .agent/improvements/sentence-check-validation.md
    - .agent/improvements/sentence-practice-reliability.md
    - .agent/features/036-sentence-practice-backend/EVIDENCE.md
    - .agent/features/037-sentence-practice-web/EVIDENCE.md
    - docs/user-flows/sentence-practice-web.md
---

# BL-004 — AI sentence translation practice — Done

## Completed delivery — 2026-10-05

The agreed backend and selected frontend scope is implemented and verified.
[Feature 037](../../.agent/features/037-sentence-practice-web/FEATURE.md),
[evidence](../../.agent/features/037-sentence-practice-web/EVIDENCE.md),
[review](../../.agent/features/037-sentence-practice-web/REVIEW.md), and
[current browser guide](../user-flows/sentence-practice-web.md) substantiate the
frontend. Six real-app journeys and final unit/static/build checks pass; all
material independent review findings are resolved. Prior backend-only/design
checkpoints below are historical. The broader BL-003 task remains in progress.

## Post-delivery reliability refinement — 2026-10-05

The [reliability record](../../.agent/improvements/sentence-practice-reliability.md)
and [current plan](../sentence-practice-implementation-plan.md#approved-reliability-refinement--2026-10-05)
track language validation, bounded job/transport recovery and selected-word rounds.
Rounds finish once every selected word has appeared, including skipped sentences;
the final sentence remains available before viewing results. Saved first reuses
checked and manually reviewed exercises and hints; only explicit New examples
requests fresh generations. Rounds use at most 100 eligible words; larger
dictionaries retain their separate 10,000-card capacity and lifetime progress.
This maintenance keeps BL-004 Done and does not expand BL-003 or the later tasks.

## Authorized assistance extension — 2026-10-05

The user separately authorized contextual content-word and whole-phrase hints,
free conservative reference comparison and final-action results with exact/fresh
example replay. The [detailed backend-first plan](../sentence-practice-assistance-implementation-plan.md),
[feature 038](../../.agent/features/038-sentence-practice-assistance/FEATURE.md)
and [ExecPlan](../../.agent/features/038-sentence-practice-assistance/EXEC_PLAN.md)
record this active extension. Backend verification precedes a detailed versioned
design prompt without concrete API paths; frontend implementation awaits the
returned Magic Patterns design. This is a planning link, not completion evidence.
BL-004 remains Done for its verified historical scope, with no reopening of
unrelated backlog work or claim that the extension is already delivered.

## Returned design analysis — 2026-10-04

The user returned the sentence-practice prototype. Provider v6 is pinned in the
[handoff](../../.agent/features/036-sentence-practice-backend/DESIGN.md);
the [source inventory](../../.agent/features/036-sentence-practice-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04)
selects setup, active practice/hints/draft, AI feedback, free manual reference,
personal history/summary and fullscreen/dialog controls. Unrelated dictionary
and shell UI is excluded; real contracts replace simulated services.
Analysis is complete, not frontend implementation or rendered fidelity proof.
This task remains in-progress.

[Backlog index and shared constraints](README.md).

## Delivery planning

The [backend-first implementation plan](../sentence-practice-implementation-plan.md)
records the agreed sentence behavior and the BL-005 prerequisite. The user authorized
implementation on 2026-10-04; its backend follows the BL-005 prerequisite. Finish and verify both
backends, then save separate detailed Magic Patterns prompts covering all UI
states, without concrete API paths in the copyable prompts. Wait for the returned
designs before frontend implementation. Planning and a backend-only slice do not
complete BL-004; no implementation evidence is claimed here.

## Confirmed requirements

- Let the learner select the source language. The working product assumption is
  either language from the dictionary pair, translating into the other language;
  confirm this when preparing the task.
- Generate grammatically complete sentences using vocabulary from the dictionary,
  supporting vocabulary, and mappings from source words/expressions to translated hints.
- The learner types a translation freely. This is not a word-bank assembly mode.
- Hovering over a mapped source word reveals its translation. Provide equivalent
  help on touch devices and for keyboard users.
- Vocabulary hints omit articles and auxiliary helpers and present verbs in
  their infinitive form. Apply these simplifications to hints, not to the
  generated sentence itself.
- AI checks the submitted translation and returns a correctness percentage,
  an acceptable translation, and detailed explanations of all identified mistakes.
- Recognize valid alternative translations; exact matching against one sentence
  is insufficient. Preserve attempts and mistake feedback for personal progress
  and later analysis of weak areas.
- Provide generation with vocabulary already used and vocabulary remaining,
  so subsequent exercises favour unused words and reduce repetition.
- Signed-in shared-dictionary readers can practise existing exercises or generate
  personal exercises using their own model preference and AI allowance. They
  do not modify the dictionary owner's content.
- Generated exercise content is saved and reusable. Personal attempt state
  remains separate, as defined in [BL-003](003-personal-learning-progress.md).

## Existing behaviour and implementation context

Dictionary entries may be phrases or separate senses of the same normalized word.
Generation must respect the dictionary language pair and authorized active content.
Private dictionary/card translation context is currently omitted from public
shares and forks; reader-side generation must not gain access to that hidden
context merely because it can read shared vocabulary.

## Resolve before implementation

Language direction, initial difficulty, vocabulary coverage per sentence,
used/remaining tracking across sessions, repeated or edited vocabulary, multiword
hint mappings, grammatical helper normalization, and the scope of the visible
vocabulary list. Define scoring, acceptable alternatives, feedback language,
hint-use statistics, retries, unavailable AI, exercise storage/visibility, and
credit charging for generation versus checking.

## Acceptance scenarios to refine

Generate from owned/shared content; use hints and submit a free answer; check
correct, partially correct, and valid alternative translations; inspect detailed
feedback; generate subsequent exercises with used/remaining vocabulary; handle
changed dictionaries and AI failures while keeping learner results separate.

## Active backend delivery

[Feature036](../../.agent/features/036-sentence-practice-backend/FEATURE.md) and
[ExecPlan](../../.agent/features/036-sentence-practice-backend/EXEC_PLAN.md) implement
this backend scope after verified model backend035 (`bcfda16`). The approved
[plan](../sentence-practice-implementation-plan.md) remains the product baseline.
Design prompts are created after both backends are verified; frontend delivery
waits for the user's returned Magic Patterns designs.

## Approved free reference review

The [plan](../sentence-practice-implementation-plan.md#free-reference-review-and-default-ai-checking)
now includes a reference translation generated alongside sentence/hints and an
explicit free reveal that works with zero credits. It records a personal manual
review with no AI score; AI checking remains the default. Saved first reuses
previously reviewed exercises as described in the current refinement above. See
[feature036 AC-4a/4b](../../.agent/features/036-sentence-practice-backend/FEATURE.md).
Jev correctness estimation is recorded as future research, not active integration.

## Verified backend / design checkpoint — 2026-10-04

Backend delivery is implemented, verified and independently reviewed. The detailed
[implementation plan](../sentence-practice-implementation-plan.md) records completed
backend and deferred frontend scope. Copy the
[sentence-practice v001 prompt](../design-prompt/sentence-practice.md) into Magic Patterns;
return its generated design/source before frontend implementation continues.
[Versioned handoff](../../.agent/features/036-sentence-practice-backend/DESIGN.md) preserves the
snapshot and selection history. This task remains In progress; backend completion
does not mark the deferred UI/product work done.

## Check-validation maintenance — 2026-10-06

The [focused validation improvement](../../.agent/improvements/sentence-check-validation.md)
tracks complete target assessments, backend-calculated exact Unicode-safe highlights
and privacy-safe rejection diagnostics. It preserves the existing public feedback,
score caps, credit/retry policy and backlog disposition; verification and independent
review passed and remain documented in that record. Earlier Feature038 Git scope remains separate.

## Practice presentation maintenance — 2026-10-06

The [UI fidelity improvement](../../.agent/improvements/sentence-practice-ui-fidelity.md)
tracks the user's requested Magic Patterns practice presentation from header to
footer, preserving established generation, checking, hints, saved reuse and
completion behavior. It retains v001 source selection after active-artifact
reinspection and records scoped runtime evidence. Backlog status remains Done.
