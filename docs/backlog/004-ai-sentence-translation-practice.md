---
type: backlog-task
id: BL-004
title: 'AI sentence translation practice'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '7'
evidence: []
---

# BL-004 — AI sentence translation practice

[Backlog index and shared constraints](README.md).

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
