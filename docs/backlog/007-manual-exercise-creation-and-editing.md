---
type: backlog-task
id: BL-007
title: 'Manual exercise creation and editing'
status: in-progress
created: 2026-10-01
updated: 2026-10-28
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

## Related sentence-library work

[BL-010](./010-sentence-library-management-done.md) tracks personal sentence archives,
full-dictionary preparation and administrative management. Its
[implementation plan](../sentence-library-implementation-plan.md) is additive;
it does not change this task's completion or editing scope.

## Interactive workbook authoring delivery — 2026-10-28

[Feature 059](../../.agent/features/059-interactive-workbooks/FEATURE.md) owns the
authorized initial manual-exercise delivery. Confirmed formats are multiple
choice, fill-in-the-blank and free text, each with a reference answer and short
explanation. Authors manually create/edit the same structured blocks that AI
proposes; AI changes require preview/apply. Readers edit independent copies,
never shared originals. Practice, retries and private attempts remain separate
from reusable content. Material exercise edits preserve historical versions;
cosmetic edits retain progress. The
[execution plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md)
records delivery and required verification.

This resolves the initial workbook formats and copy/version/privacy decisions;
it does not promise every future exercise format or a second flashcard store.
Foundational contracts are in progress. Manual authoring, real practice journeys
and independent completion/security review are not yet verified, so BL-007 is
in progress and has no new completion evidence.
