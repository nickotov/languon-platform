---
type: backlog-task
id: BL-003
title: 'Personal learning progress'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '6 and 10'
evidence: []
---

# BL-003 — Personal learning progress

[Backlog index and shared constraints](README.md).

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
