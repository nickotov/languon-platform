---
type: adr
id: ADR-0024
title: Flashcard learning state and revisions
status: accepted
date: 2026-10-02
supersedes: None
---

# ADR-0024: Flashcard learning state and revisions

## Context

The authorized flashcard backend adds personal practice to owned and live-shared
dictionaries. Authored card revisions include changes irrelevant to practice,
while inherited settings may change learning content without a card edit.
Learning state must remain private to each learner, survive archive/restore, and
be invalidated by content changes without copying dictionary content into history.
Permanent deletion and tombstoned account purge must remove linked personal data.

## Decision

The backend `learning` module owns flashcard preferences, attempts and current
entry progress. Dictionaries continue to own vocabulary, effective settings and
live access. Contracts are public exports of `packages/contracts`; no cross-app
source imports or universal asset/exercise abstraction are introduced.

Dictionary entries have an internal monotonic positive learning version. A pure
canonical comparison considers source/translation and enabled effective optional
content, language roles and notation. No-op, dormant, context, order, authorship
and lifecycle changes do not advance it. Every existing manual/AI writer applies
the comparison in its content transaction. Default settings changes increment
only affected entries, including archived ones, in bounded batches, without
fabricating authored revisions or edited timestamps. New/imported/forked entries
start at version 1. Old-version progress is Unstudied, never revived by reverting
content to a previously seen value.

Store one current result per learner/entry, not per field configuration. Content-
free attempts retain configuration keys, learning version, self-assessed rating,
session/round grouping and server ordering. Undo voids history and restores the
newest eligible prior result at the same learning version. It rejects a newer
session/entry result or changed content. Client operation IDs are idempotent per
learner across rating and Undo operations; reusing them for another payload conflicts.
Session IDs do not store resumable queues.

An infrastructure-only dictionary transaction participant resolves canonical
settings and live authority under database locks in the same transaction as
learning reads/writes. Active users are locked before the dictionary; conflicting
learner writes are serialized before examining idempotency/current results.
Shared capabilities are checked cryptographically before the transaction and
rechecked against current dictionary state within it. Never retain share keys
as learning authority. Anonymous shared reads cannot mutate personal state.

Composite entry/dictionary foreign keys cascade learning data on permanent content
deletion. Account purge also explicitly removes the learner's preferences,
attempts and progress on foreign dictionaries because user identities are retained
as tombstones. Archive retains rows but removes entries from current totals;
independent forks never inherit progress.

Deploy additive schema and compatible writers/purge workers before enabling the
disabled-by-default learning capability. Keep epoch maintenance and cleanup active
even when training endpoints are disabled. A rollback to writers lacking revision
maintenance is not supported after learning is activated; disable training and
roll forward compatible writers instead. No destructive down-migration is defined.

## Alternatives considered

### Reuse authored revisions or content hashes

Authored revisions invalidate irrelevant context edits and miss inherited default
changes. Hashes alone can resurrect old state after A→B→A. A separate monotonic
learning version expresses the actual practice invalidation boundary.

### Persist queues, field-specific mastery or copied exercise content

These add product/persistence concepts outside the authorized current-result model.
Queues remain client state; one learner/entry result and content-free history meet
the current scope without retaining deleted vocabulary.

### Authorize outside the write transaction or retain a shared capability

Both permit access/content races or stale authority. Live rechecking and atomic
version/result writes preserve existing dictionary capability constraints.

## Consequences

### Positive

- Personal isolation without making ownership a prerequisite for shared learning.
- Precise invalidation, replay safety and retained Undo audit without content copies.
- Explicit integration with permanent content deletion and learner account purge.

### Negative

- Every learning-relevant dictionary writer must maintain the new revision.
- Settings changes scan retained entries in bounded batches; indexes and 10k fixtures
  must verify performance. Learner-wide write serialization trades throughput for
  simple consistent operation/session/entry ordering.

### Risks / limitations

- Self-assessed Known percentage is not objective accuracy or spaced repetition.
- New exercise modes need their own contracts; this record establishes only the
  flashcard foundation, not a generic exercise engine.
- UI/fullscreen/session behavior remains a separate design/implementation delivery.

## Related

- [Feature 033](../../.agent/features/033-flashcard-training-backend/FEATURE.md)
- [Implementation baseline](../flashcard-training-implementation-plan.md)
- [Architecture](../architecture.md)
- [ADR-0002](0002-drizzle-schema-and-migration-strategy.md)
- [ADR-0011](0011-dictionary-persistence-and-composition.md)
- [ADR-0019](0019-account-deletion-journal-commit-and-replay.md)
- [ADR-0023](0023-archived-dictionary-content-deletion.md)
