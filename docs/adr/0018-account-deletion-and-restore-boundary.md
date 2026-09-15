# ADR-0018: Account deletion and restore boundary

Status: Superseded by ADR-0019
Date: 2026-09-15
Supersedes: None

## Context

Account removal must end access immediately, allow only audited administrator cancellation before cleanup starts, purge live personal data after 30 days, and remain effective if PostgreSQL is later restored from an older encrypted backup. A deletion flag stored only in PostgreSQL would disappear with that restore.

## Decision

- Users owns the account lifecycle: `active` → `deletion_pending` → `purged`, or an audited admin-only cancellation back to `active` before purge claim. A separate durable request carries the 30-day purge date, retry state, lease, and fencing token. Ordinary admin restore cannot cancel removal.
- Scheduling requires a recently authenticated active session and no active administrator membership. In one SQL transaction, it revokes all sessions and unlisted share locators, changes account status, and records the purge request. Before committing, it must append an encrypted blocking intent to a separate immutable, versioned, retained S3-compatible journal. Journal failure rolls the transaction back.
- Admin cancellation takes the request and user locks, appends a cancellation marker, changes the user/request, and writes a bounded audit entry in one SQL transaction. A cancellation marker alone never authorizes an older backup: replay accepts it only if the restored active user has the committed cancellation version.
- A dedicated least-privilege purge worker verifies generation jobs and document cleanup are terminal, removes all physical object versions, then deletes live child records in FK order and leaves an opaque ID-only tombstone for audit integrity. Independent forks survive with their source reference anonymized. Leases and fencing prevent stale workers from finalizing.
- The recovery journal is outside PostgreSQL and dictionary/backup object stores. The API/admin writer has PutObject-only credentials; a pre-traffic restore/deployment gate has independent List/Get-only credentials. A missing sentinel, unreadable/corrupt event, or unavailable journal fails the gate closed. The gate re-blocks any restored account lacking a committed cancellation at the recorded version and revokes restored sessions/shares. Operators must initialize the sentinel before first activation and run the gate after any database restore before exposing traffic or workers.
- Historical encrypted backup retention remains governed by the existing backup policy. The journal carries only opaque user ID, version, timestamp, and event kind; it is not a second user-data archive.

## Alternatives considered

### PostgreSQL-only deletion records

Simpler, but a historical database restore could reactivate an account that had already been removed.

### Immediate hard deletion without a grace period

Avoids a worker but makes accidental requests and operational correction irrecoverable, and FK/storage cleanup cannot be proven atomically.

### Reuse dictionary or backup storage credentials

Would join unrelated trust boundaries and grant the application unnecessary read/delete access to restore evidence.

## Consequences

### Positive

- Removal and administrator cancellation have explicit, testable authority and failure semantics.
- A historical database restore cannot silently undo a committed removal.
- Audit links and independent forks can survive without retained personal fields in live tables.

### Negative

- An additional immutable object store, restricted credentials, encryption key custody, restore gate, and worker must be operated and monitored.
- A journal marker written before a rare later SQL failure can conservatively block an account after restore; administrator review is required to resolve that case.

### Risks / limitations

- Bucket object lock/versioning and retention are operator-provisioned controls, not enforceable by application code alone; readiness and restore rehearsals must verify them.
- Purge eligibility may retry beyond day 30 while durable jobs, upload capability expiry, or physical storage deletion remain incomplete. The worker must fail closed rather than erase metadata prematurely.
- An older deployed binary that lacks the recovery gate must never be used for a restore; rollback/deployment runbooks must retain this pre-traffic boundary.

## Related

- [ADR-0001](./0001-user-authentication-and-session-strategy.md), [ADR-0002](./0002-drizzle-schema-and-migration-strategy.md), [ADR-0009](./0009-release-and-deployment-platform.md), [ADR-0010](./0010-admin-application-and-authorization.md), [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md).
- [Profile Account Controls](../../.agent/features/profile-account-controls/FEATURE.md).
