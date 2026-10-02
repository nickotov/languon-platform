---
type: backlog-task
id: BL-007
title: 'Manual exercise creation and editing'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '11'
evidence: []
---

# BL-007 — Manual exercise creation and editing

[Backlog index and shared constraints](README.md).

## Confirmed requirements

- Allow manual exercise creation and editing, including editing AI-generated exercises.
- Authors edit their original exercises. Other learners can make editable private
  copies of exercises available to them without changing the original.
- Manual and AI-generated exercises use the corresponding practice and personal
  progress behaviour.
- Define exercise formats and their authoring fields alongside the relevant
  practice features; the initial list of formats is not yet committed.

## Resolve before implementation

Authoring fields and expected answers, ownership of reader-generated exercises,
allowed attachment targets, private-copy behaviour, source-access revocation,
and the relationship between edited exercises and historical attempts. Existing
dictionary-entry editing already supplies flashcard content; do not assume a
second independent flashcard content store is required.

## Acceptance scenarios to refine

Create and edit manually; edit generated content; practise with saved personal
progress; make a private editable copy; verify the original and prior attempts
are not silently rewritten.
