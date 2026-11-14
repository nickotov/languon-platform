---
type: backlog-task
id: BL-007
title: 'Manual exercise creation and editing'
status: in-progress
created: 2026-10-01
updated: 2026-11-14
original_tasks: '11'
evidence:
    - .agent/features/059-interactive-workbooks/EVIDENCE.md
    - .agent/features/067-named-text-exercises/EVIDENCE.md
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

## v16 partial-delivery checkpoint — 2026-10-30

The initial workbook authoring slice supports multiple choice, blanks and free text, shared manual/AI block schemas, side dialogs/mobile sheets, reference answers/explanations, reviewed AI changes and independent copies. Browser and execution regressions verify the delivered slice; broader feature completion and future exercise capabilities are not implied.

See [F059 evidence](../../.agent/features/059-interactive-workbooks/EVIDENCE.md)
and its [fidelity observations](../../.agent/features/059-interactive-workbooks/evidence/v16-migration/FIDELITY.md).
The full critical gate passes14 flows /812 tests with no skips. Parent F059 and
this broader backlog task remain **in progress**; this is partial-delivery evidence,
not a terminal task disposition.

## Named activity groundwork — 2026-11-13

The user authorized [Feature067](../../.agent/features/067-named-text-exercises/FEATURE.md)
for the 19 priority named text activities, beginning step by step with E1. Its
first checkpoint supplies catalog and standalone semantic contracts. Active block
writers, manual editing/Custom conversion, copying and private practice integration
remain later milestones; no new learner journey or completion of this task is
claimed. Existing F059 evidence and this task's In progress status remain valid.

## Named activity implementation — 2026-11-14

Feature067 implements all19 priority text activities, localized source picker,
protected named editing and explicit Custom conversion, independent copying and
private deterministic/AI practice with structured feedback. The
[feature evidence](../../.agent/features/067-named-text-exercises/EVIDENCE.md)
records passing runtime gates, independent completion approval and operational
follow-ups. This expands the
delivered authoring slice; BL-003/006/007 retain their broader In progress scope.
Additional text activities, answer-aware chat and audio remain deferred.
