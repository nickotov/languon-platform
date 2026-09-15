# ADR-0019: Account deletion journal commit and replay safety

Status: Accepted
Date: 2026-09-15
Supersedes: ADR-0018

## Context

The independent journal is written before SQL commit so a missing writer cannot permit deletion. An intent can nevertheless outlive a failed SQL transaction. Replaying intents during an ordinary blue/green deployment also races the serving admin and purge worker. In a versioned bucket, a delete marker can hide a retained event from a current-object listing.

## Decision

- Keep the encrypted pre-commit blocking intent. After SQL commit, append a separate matching committed marker containing the same opaque user ID, version, and schedule timestamp. If this second write fails, current SQL access remains blocked; a historical restore fails stop for operator reconciliation rather than inferring that an unmatched intent authorizes a purge. The API reports journal unavailability.
- Replay only when all application, admin, and worker traffic against the restored database is quiesced. Initial deployment without an active slot may run the gate; an ordinary blue/green deployment must not mutate the live database through replay. Restore operators run the gate before any isolated backend smoke, authentication, or traffic switch.
- Replay accepts cancellation only when the restored request is committed `cancelled` at or after the cancellation version, regardless of a later account `disabled` state. Already-committed pending/running requests remain untouched. Request rows are locked before user rows, matching purge and admin cancellation.
- Read retained journal object versions, not just current objects. Reject delete markers, ambiguous versions, missing IDs, corrupt ciphertext, and incomplete listings. Reader credentials require version-list and version-get authority but no write/delete authority.
- The 30-day schedule and recent-auth check use fresh database time after lock acquisition. Deletion clears all unlisted share locators and increments dictionary version; share rotation independently requires an active owner.
- Preserve the existing admin-only cancellation, live purge, opaque tombstone, independent-fork anonymization, and backup-retention boundaries from ADR-0018.

## Alternatives considered

### Infer committed deletion from an intent alone

This can schedule irreversible purge after SQL rolled back, so an indeterminate intent must fail stop.

### Replay on each ordinary release

It races live admin cancellation and purge claims, and can reset a leased request. A separate quiesced restore gate maintains the recovery invariant without mutating live traffic.

## Consequences

### Positive

- Historical restores cannot silently reactivate a committed removal or turn an uncommitted one into an automatic purge.
- Live purge leases and admin cancellation are not disturbed by routine releases.
- Hidden retained events cannot disappear behind bucket delete markers.

### Negative

- A crash or object-store failure between SQL commit and the committed marker requires operator reconciliation before a restore can proceed. The current account is blocked even if the API cannot return a receipt.
- Restore runbooks and IAM must provision version-list/read authority and a quiescent replay window.

### Risks / limitations

- Bucket versioning, object-lock retention, key custody, and least-privilege IAM are operator-provisioned and must be verified in restore drills.
- Do not start an older binary without this gate against a restored database.

## Related

- [ADR-0018](./0018-account-deletion-and-restore-boundary.md).
- [Profile Account Controls](../../.agent/features/profile-account-controls/FEATURE.md).
- [Database recovery](../operations/database-recovery.md#disaster-recovery).
