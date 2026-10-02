---
type: backlog-task
id: BL-002
title: 'Configurable flashcard training'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '3–5'
evidence: []
---

# BL-002 — Configurable flashcard training

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

## Resolve before implementation

Missing selected fields, eligible entries, ordering/shuffling, remembered settings,
which direction means known, session interruption/resumption, and the exact
statistics. Also establish full-screen API versus application presentation,
empty-dictionary behaviour, and anonymous-reader availability. Saved progress
for signed-in readers is already required; anonymous progress is not specified.

## Acceptance scenarios to refine

Check default and custom sides, flip and both outcomes, another practice round,
full-screen/dialog transition, incomplete fields, empty dictionaries, accessible
controls, and separate saved progress for two learners using shared content.
