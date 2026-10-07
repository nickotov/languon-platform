---
type: adr
status: accepted
feature: sentence-library-management
related_features:
    - sentence-practice
    - administration
source_paths:
    - apps/backend/src/modules/learning
    - apps/backend/src/modules/administration
    - packages/contracts/src/learning/sentence-library.ts
    - packages/contracts/src/learning/sentence-preparation.ts
---

# ADR-0028: Sentence library visibility and durable preparation

- Status: Accepted
- Date: 2026-10-06
- Extends: ADR-0010, ADR-0023 and ADR-0027

## Context

Saved examples can be shared while attempts belong to individual learners.
Removing an example from one learner's practice must preserve other learners'
access and existing history. Full-dictionary preparation must survive navigation
without creating another executor or bypassing existing financial limits. Admin
permanent removal must have a precise, auditable scope.

The user explicitly selected personal archive/restore, independent global
archive, creator-archived-only permanent deletion and background preparation.
This record accepts the implementation of those authorized choices within the
existing authentication, persistence and typed-worker architecture.

## Decision

Learning owns separate personal and global visibility records. Personal archive
is reversible and affects one learner's future practice; global archive affects
all future selection. Neither deletes historical attempts. Management detail can
explicitly return a reference and hints, without recording exposure or review.
Ordinary practice projections retain their reference redaction.

Administrative operations use administration's live membership, current session,
recent-authentication and reason policy. Success auditing and mutations share one
transaction. Permanent erasure is permitted only for examples personally archived
by their generator. Selected items and all-matching confirmation snapshots pin
versions; the latter pin an immutable server-side set. Busy unsettled work rejects
synchronously under ADR-0023. Erasure removes associated content for every learner
and retains only permitted content-free accounting and receipts.

Preparation snapshots dictionary entry versions in partitions of at most 100.
The intended practice scope is the first partition. Durable manifests distinguish
reused and newly generated examples. One child generation is admitted at a time
through the existing typed generation, provider-budget and credit participants.
Separate preparation formats fence older workers, while pinned provider execution
and pricing retain the base generation format. Publication does not create
practice exposure. Stop waits for current work to settle; resume is explicit.
Prepared practice reads a ready partition without implicit paid fallback. Later
partitions have bounded discovery. Confirmation snapshots are actor-serialized
and bounded to five per actor/dictionary, 25 per actor and 10,000 identities per
confirmation. Preparation retains at most 20 content-bearing manifests per learner;
inactive non-resumable content expires after seven days with unsettled work
fenced. Content-free operation tombstones preserve retry identity, scrub shared
authority digests and never delete the underlying saved examples. These limits
prevent free preparation/confirmation requests from creating unbounded copies.

## Alternatives considered

### Delete examples directly on personal removal

This would erase shared content or private learning history unexpectedly. A
visibility marker implements reversible personal management instead.

### A second background executor or one unbounded generation request

These approaches duplicate capacity/accounting or exceed existing round limits.
A coordinator within the existing bounded worker and bounded manifests preserve
those limits while allowing a large dictionary to be prepared over time.

### Re-evaluate all matching content when confirmation is submitted

Newly generated examples could be deleted without having been previewed. A frozen
selection and version checks keep the confirmation's scope stable.

## Consequences

### Positive

- Shared examples and personal history remain independent.
- Preparation survives navigation and uses established limits and settlement.
- Administrative erasure has precise authorization, audit and lifecycle behavior.

### Negative

- Archives, manifests and confirmation snapshots add lifecycle cleanup obligations.
- Partial preparation and stale content require explicit UI states.
- Large dictionaries may need multiple practice rounds despite complete preparation.

### Risks / limitations

- Preparation is not free generation; normal credits and provider limits apply.
- Archived/outdated examples may be restored for management while still ineligible
  for practice. Existing active work can settle into history after an archive.
- New worker grants and compatible capability observations must accompany deployment.
- New web/admin controls await the selected external design; this decision does
  not claim frontend delivery.

## Related

- [ADR-0010](./0010-admin-application-and-authorization.md)
- [ADR-0023](./0023-archived-dictionary-content-deletion.md)
- [ADR-0027](./0027-typed-sentence-work-and-shared-ai-accounting.md)
- [Implementation plan](../sentence-library-implementation-plan.md)
- [Feature and acceptance criteria](../../.agent/features/039-sentence-library-management/FEATURE.md)
