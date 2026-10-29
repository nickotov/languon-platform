---
type: backlog-task
id: BL-003
title: 'Personal learning progress'
status: in-progress
created: 2026-10-01
updated: 2026-10-30
original_tasks: '6 and 10'
summary: Flashcard persistence verified and frontend progress implemented under feature 034; other exercise modes remain outstanding.
evidence:
    - .agent/features/059-interactive-workbooks/EVIDENCE.md
    - .agent/features/033-flashcard-training-backend/EVIDENCE.md
    - .agent/features/034-flashcard-training-web/EVIDENCE.md
    - docs/adr/0024-flashcard-learning-state-and-revisions.md
---

# BL-003 — Personal learning progress

[Backlog index and shared constraints](README.md).

Sentence attempts, hint statistics and directional vocabulary coverage are
planned in the [backend-first sentence implementation plan](../sentence-practice-implementation-plan.md).
Implementation was authorized on 2026-10-04; the plan supplies no new delivery evidence.
Its backend/design/frontend checkpoints leave the grammar and manual-exercise
progress scopes outstanding; BL-003 remains in progress.

## Confirmed requirements

- Save progress in the backend for every signed-in learner, whether they own
  the dictionary or practise a shared dictionary.
- Associate progress with the learner and relevant dictionary, entries, or exercises.
- Keep exercise content reusable and separate from individual answers, attempts,
  and completion state. Different learners practise the same content independently.
- Added entries start unstudied. Changed learning content requires fresh practice.
  Removed entries leave current-progress totals. Earlier attempts remain in history,
  subject to the deletion and privacy rules established before implementation.
- Practising someone else's dictionary never changes their content or progress.

This supersedes the original owner-only statistics proposal. Ownership controls
content editing; it does not determine whether personal progress is saved.

## Existing behaviour and implementation context

Dictionary/card identities, revisions, archive/restore, permanent deletion, and
private/unlisted sharing already exist. Forks receive new identities and are
independent copies. Progress must distinguish current learning content from
historical attempts, and must not merge independent dictionaries merely because
their words match.

## Resolve before implementation

The [flashcard implementation plan](../flashcard-training-implementation-plan.md)
resolves the flashcard-specific progress, revision invalidation, concurrency, Undo,
retention, archive, access and deletion behavior. Its backend delivery implements
only this task's flashcard foundation, not progress for all future exercise types.
Planning is not implementation evidence. [Feature 033](../../.agent/features/033-flashcard-training-backend/FEATURE.md)
owns the authorized flashcard backend slice; other exercise modes remain outstanding.
[Feature 034](../../.agent/features/034-flashcard-training-web/FEATURE.md) implements
the flashcard frontend's personal saved totals, acknowledged rating/retry/Undo,
independent shared-learner progress and session-only anonymous behavior.
Its evidence and review own current frontend verification. Linked evidence covers
only the flashcard scope, not completion of this task; progress for sentences,
grammar and manually created exercises remains outstanding. Keep BL-003 in
progress after completing flashcards.

Progress metrics and aggregation, what counts as a learning-relevant content
change, exercise editing/version changes, settings changes, archive/restore,
fork progress, repeated attempts, and interrupted sessions. Define retention and
visibility after content deletion, dictionary access revocation, and account
deletion. Preserving attempt history does not authorize retaining deleted source
content indefinitely.

## Acceptance scenarios to refine

Independent learners and dictionaries; added, changed, and removed entries;
historical attempts versus current totals; repeated sessions; exercise edits;
archive, access revocation, and deletion without exposing another user's history.

The sentence progress slice is now in backend
[feature036](../../.agent/features/036-sentence-practice-backend/FEATURE.md), with
personal attempts/ratings and current entry-version coverage. Existing flashcard
progress remains unchanged. Other progress/UI scope remains separately tracked.

Sentence progress separates ungraded manual reference reviews from AI check scores
and ratings. Both can complete Saved first for the learner; revealing the reference
never double-counts word exposure or implies mastery. See the
[approved plan](../sentence-practice-implementation-plan.md#free-reference-review-and-default-ai-checking).

## Sentence progress backend checkpoint — 2026-10-04

Feature036 implements personal entry exposure/coverage, separate AI/manual event
statistics and personal history, including free reference-review completion. See
[backend evidence](../../.agent/features/036-sentence-practice-backend/EVIDENCE.md)
and the [sentence design prompt](../design-prompt/sentence-practice.md). This
sentence slice does not complete the broader progress backlog or its deferred UI.

## Sentence frontend progress checkpoint — 2026-10-05

[Feature 037](../../.agent/features/037-sentence-practice-web/FEATURE.md) verifies
personal sentence AI/manual histories, directional coverage and session summary.
See its [evidence](../../.agent/features/037-sentence-practice-web/EVIDENCE.md).
This does not complete broader grammar/manual-exercise progress; BL-003 remains
in progress.

## Interactive workbook progress delivery — 2026-10-28

[Feature 059](../../.agent/features/059-interactive-workbooks/FEATURE.md) now owns
the authorized knowledge-exercise slice: private persisted attempts, hint/reveal
observations, content-version history, explicit note completion and workbook
progress. Shared readers keep their own state, authors cannot inspect it, and
revocation/deletion follows the confirmed source-access policy. See its
[execution plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md).

Foundational contracts are in progress; no completed workbook-progress behavior
or runtime evidence is claimed. Existing flashcard/sentence evidence remains
valid only for its recorded scope. Broader learning statistics and future exercise
modes remain outside this slice; BL-003 stays in progress.

## v16 partial-delivery checkpoint — 2026-10-30

Private inline exercise attempts, prepared versus AI evaluation, separate hint/reveal observations, material revisions and explicit completion are implemented and verified for the knowledge-workbook slice. Initial progress loading preserves an answer already being edited. Broader cross-mode statistics and future exercise modes remain outstanding.

See [F059 evidence](../../.agent/features/059-interactive-workbooks/EVIDENCE.md)
and its [fidelity observations](../../.agent/features/059-interactive-workbooks/evidence/v16-migration/FIDELITY.md).
The full critical gate passes14 flows /812 tests with no skips. Parent F059 and
this broader backlog task remain **in progress**; this is partial-delivery evidence,
not a terminal task disposition.
