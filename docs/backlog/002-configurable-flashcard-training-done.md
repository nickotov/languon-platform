---
type: backlog-task
id: BL-002
title: 'Configurable flashcard training'
status: done
created: 2026-10-01
updated: 2026-10-02
original_tasks: '3–5'
summary: Backend and training-only web flow verified for owners, shared learners and anonymous practice.
evidence:
    - .agent/features/033-flashcard-training-backend/EVIDENCE.md
    - .agent/features/034-flashcard-training-web/EVIDENCE.md
    - .agent/features/034-flashcard-training-web/REVIEW.md
    - docs/user-flows/flashcard-training-web.md
    - docs/adr/0024-flashcard-learning-state-and-revisions.md
---

# BL-002 — Configurable flashcard training — Done

[Backlog index and shared constraints](README.md).

## Confirmed requirements

- Add Train beside Create in the dictionary interface. Its menu offers Cards
  and Sentences; the sentence journey is defined in [BL-004](004-ai-sentence-translation-practice.md).
- Selecting Cards first opens a settings dialog where the learner selects one
  or more fields for the front and back.
- Select examples only by default: translated example on the front,
  source-language example on the back. Source/translation terms are optional
  additions, not part of the agreed default.
- Start in full-screen presentation. Provide a control to switch to a dialog
  presentation without losing the current session.
- Clicking a flashcard turns it over. Swiping in one direction means known;
  the other means practise again. Provide equivalent keyboard and touch controls.
- Show session statistics and the known/practise-again groups, with a way to
  practise the latter again. Persist personal progress through [BL-003](003-personal-learning-progress.md).

Quizlet is a general interaction reference. These explicit requirements define
the initial flow; no exact copy of every Quizlet behaviour is implied.

## Existing behaviour and implementation context

Dictionary entries already have configurable optional fields and inherited
settings. Examples may be disabled, dormant, or empty. An example's configured
language role can be source or target; the paired translation uses the opposite
role. The default front/back meaning must follow language roles, rather than
assuming a particular field name always represents the source language.

## Implementation plan

The [backend-first implementation plan](../flashcard-training-implementation-plan.md)
records the resolved setup, eligibility, fallback, shuffle, presentation, statistics,
retry, Undo, anonymous-reader and persistence decisions. Delivery is backend first,
then a versioned Magic Patterns prompt grounded in the implemented contracts; pause
for the returned design before frontend implementation. That initial pause was
observed; the user returned the design and authorized training-only integration
on 2026-10-02. The plan is not completion
evidence. [Feature 033](../../.agent/features/033-flashcard-training-backend/FEATURE.md)
owns the authorized backend/design-handoff slice.
The [copyable prompt](../design-prompt/flashcard-training.md) is frozen as v001 in
the [design handoff](../../.agent/features/033-flashcard-training-backend/DESIGN.md).
[Feature 034](../../.agent/features/034-flashcard-training-web/FEATURE.md) now owns
the owner/shared Train action, setup, learning-card flow and saved-progress UI,
using the returned source and four rendered references recorded in the handoff.
The dictionary preview redesign is explicitly excluded. Final verification and independent completion/security review passed; the complete flashcard journey is verified.

## Acceptance scenarios to refine

Check default and custom sides, flip and both outcomes, another practice round,
full-screen/dialog transition, incomplete fields, empty dictionaries, accessible
controls, and separate saved progress for two learners using shared content.

## Completion — 2026-10-02

Feature 033 verifies the backend foundation; feature 034 verifies the returned
training-only UI, real owner/shared/anonymous journeys, native gestures and
independent completion/security review. [Current guide](../user-flows/flashcard-training-web.md)
and [final review](../../.agent/features/034-flashcard-training-web/REVIEW.md)
substantiate completion. Dictionary preview redesign was excluded by the user.
Sentences remain disabled pending BL-004; BL-003 remains partial for other modes.
Capability activation is a documented rollout boundary, not production deployment.
