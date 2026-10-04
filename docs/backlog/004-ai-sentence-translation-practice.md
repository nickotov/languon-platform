---
type: backlog-task
id: BL-004
title: 'AI sentence translation practice'
status: in-progress
created: 2026-10-01
updated: 2026-10-04
original_tasks: '7'
depends_on:
    - BL-005
evidence: []
---

# BL-004 — AI sentence translation practice

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
explicit free reveal that works with zero credits. It completes Saved first as a
personal manual review, with no AI score; AI checking remains the default. See
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
