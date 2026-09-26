# ADR-0023: Archived dictionary content deletion

Status: Accepted
Date: 2026-09-26
Supersedes: None

## Context

Dictionary archive is a reversible organization state. Owners also need irreversible removal of archived dictionaries and cards, including selected and all-archived batches. Dictionary content participates in generation jobs and proposals, import idempotency responses, revision provenance, document upload cleanup, pronunciation audio storage, sharing, provider budgets, and AI-credit settlement. A database cascade can therefore orphan physical objects, allow an idempotent retry to recreate erased data, or reset operational spending limits.

The user authorized permanent archived-content deletion and content-free accounting retention. The decision must preserve ADR-0012 worker fencing, ADR-0020 audio inventory cleanup, and ADR-0022 credit settlement without creating a second deletion workflow unless automatic waiting is required.

## Decision

- Only an owner may permanently delete their archived dictionary or archived card. An archived dictionary deletion includes every child card regardless of child lifecycle. Active parent targets and active card targets are rejected.
- Selected batches validate their complete ID/version set and delete atomically. All-archived commands use a server-issued count and opaque snapshot so confirmation covers unloaded records and cannot silently expand after a concurrent lifecycle change.
- Logical deletion is synchronous after prerequisite checks. Nonterminal or unsettled generation work and nonterminal document capability/object cleanup return retryable `deletion_busy`; the owner retries later. We do not hide resources behind a second pending-deletion lifecycle.
- Commands are idempotent. Content-free deletion receipts retain the request fingerprint and outcome. Prior create/fork/import idempotency records that reference removed content become payload-free invalidated records so replay cannot recreate erased data.
- Before removable generation jobs are deleted, their settled rolling provider-budget contribution moves to content-free operational history. AI-credit ledger entries remain unchanged. Deletion is not a refund and cannot reset provider or credit accounting.
- Pronunciation bindings are removed and affected assets enter the existing fenced `deleting` state. Audio job text is scrubbed, reservation accounting and object inventory remain, and the existing cleanup worker removes every physical version after writer and lease safety conditions are satisfied.
- Document extraction and object inventory rows are deleted only after existing cleanup proves capability expiry and physical cleanup completion. Inventory is never erased while a late writer can still publish.
- Dictionary rows, settings, cards, revisions, proposals, completed job payloads, document metadata, sharing state, and affected result payloads are hard-deleted or scrubbed in explicit dependency order. Independent forks survive and lose their source reference through the existing `ON DELETE SET NULL` relationship.
- Persistence changes are additive and do not delete user content during deployment. Product-triggered deletion is irreversible in application behavior. Backup expiry and already-downloaded copies remain governed by their separate boundaries.

## Alternatives considered

### Cascading database deletion

This is smaller but loses object inventory, provider usage, and idempotency safety. It can also violate restrictive provenance relationships and permit late workers to recreate content.

### Persistent deletion requests and hidden resources

A worker could accept deletion immediately, cancel/drain every dependent process, and purge later. This requires another resource lifecycle, filters in every reader/writer, cancellation and status APIs, recovery behavior, and broader rollout compatibility. The product does not require automatic waiting, so a retryable busy result has a smaller and safer state space.

### Retain deleted dictionary/card tombstones

Tombstones would preserve job relationships but complicate every query and retain more content-bearing structure than necessary. Focused content-free receipts and usage history preserve only the required invariants.

## Consequences

### Positive

- Owners get predictable irreversible cleanup with atomic bulk behavior.
- Network retries cannot duplicate deletion or recreate previously erased imports/forks.
- Existing provider, credit, document, and audio safety boundaries remain valid.
- No new worker process or pending-deletion lifecycle is introduced.

### Negative

- Deletion can temporarily return busy while dependent processing or document cleanup finishes.
- Persistence and deletion order are explicit and require broader PostgreSQL verification than a cascade.
- Content-free receipts and provider usage history remain after user content is gone.

### Risks / limitations

- Every future dictionary-owned content store must join the deletion inventory before it can ship.
- Retained rows must remain content-free and bounded to their operational/idempotency retention needs.
- External object cleanup remains asynchronous and depends on the existing retrying cleanup worker.
- Database backups and copies already delivered to clients cannot be synchronously revoked by this feature.

## Related

- [ADR-0011](./0011-dictionary-persistence-and-composition.md)
- [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md)
- [ADR-0020](./0020-dictionary-pronunciation-audio.md)
- [ADR-0022](./0022-ai-credit-ledger-and-generation-settlement.md)
- [Feature 030](../../.agent/features/030-dictionary-permanent-deletion/FEATURE.md)
- [Feature 030 ExecPlan](../../.agent/features/030-dictionary-permanent-deletion/EXEC_PLAN.md)
