# Dictionary Permanent Deletion

Status: Complete
Owner: Codex
Created: 2026-09-26

## Problem

Dictionary owners can archive dictionaries and cards but cannot permanently remove unwanted, duplicate, test, or sensitive learning content. Clearing an archive item by item is also impractical for owners with many archived records. A direct SQL cascade would be unsafe because dictionary content is referenced by generation history, import idempotency records, document cleanup inventories, pronunciation audio, and provider/credit accounting.

## Desired behavior

An authenticated owner can permanently delete one archived dictionary or card, a selected set, or every archived item in the current dictionary/library scope. The UI provides explicit accessible confirmation, the server validates and deletes the full requested set atomically, retrying the same request is safe, and retained operational/accounting data contains no deleted learning content.

## Acceptance criteria

- AC-1 — Archived library rows expose selection and **Delete permanently** actions; active dictionary rows do not. An owner can delete one archived dictionary, a selected set, or every archived dictionary independent of search and pagination.
- AC-2 — An archived dictionary deletion removes the dictionary and every child card regardless of child lifecycle. The former owner URL, share capability, export, restore, and read paths return the established non-enumerating unavailable/not-found behavior. Independent forks survive with their source reference cleared.
- AC-3 — An active dictionary's archived-card view exposes equivalent single, selected, and all-archived actions. Individual/selected targets must themselves be archived; deletion removes no active or unselected card.
- AC-4 — Selected deletion validates nonempty unique IDs, ownership, dictionary membership, archived lifecycle, and every expected version. Validation is atomic: any missing, foreign, active, restored, or stale target deletes nothing.
- AC-5 — All-archived deletion uses a server-issued preview containing the exact count and opaque snapshot. Confirmation deletes that exact owner-scoped snapshot, including unloaded and filtered-out rows; a changed snapshot returns a conflict and deletes nothing.
- AC-6 — All permanent-deletion commands require an idempotency key. Replaying the same key and request returns the content-free original receipt; reusing a key for a different request conflicts. A receipt reports operation ID, target kind, deleted count, and resulting dictionary version for card deletion.
- AC-7 — Generation work must be terminal and reservations settled/released, and document upload capabilities and physical cleanup must be terminal, before dependent content can be removed. Unsafe work returns retryable `deletion_busy` without a partial deletion. Deletion cannot permit a worker to recreate removed content.
- AC-8 — Deleted revisions, proposals, document metadata, completed generation payloads, and prior create/fork/import result payloads no longer retain deleted learning content. Prior idempotency keys become invalidated so replay cannot recreate deleted content.
- AC-9 — Pronunciation bindings are removed, affected assets enter the existing fenced asynchronous cleanup path, job text is scrubbed, and every physical object version is eventually removed without discarding inventory before writer/lease safety permits cleanup.
- AC-10 — Provider-budget usage and AI-credit accounting remain correct after deletion through retained content-free records. Deletion does not refund settled usage or expose deleted dictionary/card payload in retained accounting.
- AC-11 — Single-card confirmation identifies source and translation. Single-dictionary confirmation requires the dictionary name. Selected/all dictionary confirmation requires an explicit typed phrase; card bulk confirmation requires an explicit acknowledgement. Dialog text states scope, count, irreversibility, and child-content effects.
- AC-12 — While submission is pending, confirmation cannot close or submit twice. Success clears stale selection, refreshes affected queries, returns focus to a stable control, and announces the deleted count. Network errors preserve confirmation state for retry; conflicts offer reload.
- AC-13 — Selection works by keyboard, may span loaded pages in the current archived view, and can be cleared. Destructive controls are absent/disabled when no eligible content exists. Dialogs use alert-dialog semantics and remain usable at narrow widths and 200% zoom.
- AC-14 — Strict contracts/OpenAPI, domain/application tests, disposable PostgreSQL concurrency and cleanup checks, mapped E2E journeys, real-browser desktop/narrow verification, affected static/build checks, and independent completion/security reviews pass with no unresolved material finding.

## Scope

### In scope

- Permanent deletion of archived dictionaries and archived cards by single selection, explicit multi-selection, or all-archived snapshot.
- Owner-only contracts, previews, idempotent commands, atomic validation, content-free receipts, and retryable busy/conflict semantics.
- Ordered cleanup/invalidation for dictionary rows, card revisions, proposals, generation jobs, imports, documents, audio, share access, operational provider usage, and AI-credit references.
- Web archived-library and archived-card selection toolbars, destructive confirmations, success/error/focus states, localization, guide/E2E/browser/database evidence.
- Additive persistence needed for receipts, idempotency invalidation, and content-free provider usage.

### Out of scope

- Direct deletion of active dictionaries/cards, trash/recovery, retention delays, or administrator deletion/restoration.
- Automatic queued deletion while unsafe jobs or document cleanup are still active; users retry after `deletion_busy`.
- Deleting another owner's fork, independently deleting documents/jobs/audio, changing credit balances, or issuing refunds.
- Backup expiry, already-downloaded copies, subscriptions, payments, or legal billing retention.

## Constraints and risks

- ADR-0002 governs additive migrations; ADR-0011 governs dictionary ownership/sharing; ADR-0012 governs job/document fencing; ADR-0016 requires runtime UI evidence; ADR-0020 governs audio object inventory and cleanup; ADR-0022 governs retained credit accounting; ADR-0023 records permanent-deletion disposition and coordination.
- Deletion must serialize with lifecycle changes, edits, generation admission/finalization, proposal acceptance, document capability cleanup, and audio writers using established lock order.
- Generation jobs currently contribute to rolling provider budgets and may support surviving-card provenance. They cannot be blindly cascaded.
- Existing idempotency payloads can contain full card content and must be invalidated without allowing replay to recreate deleted material.
- No deployment migration deletes user content. Product-triggered deletion is intentionally irreversible.

## User-flow documentation

- Guide: `docs/user-flows/dictionary-permanent-deletion.md`.
- Related guide: `docs/user-flows/dictionary-platform.md`; update archive-management behavior/source mappings and keep existing journey semantics.
- Planned mapped scenarios in `apps/web/tests/e2e/dictionary-permanent-deletion.journeys.spec.ts`:
    - `owner-deletes-selected-and-all-archived-dictionaries`
    - `owner-deletes-selected-and-all-archived-cards`
    - `stale-or-busy-deletion-preserves-content`

## Open decisions

None. The user authorized irreversible archived-content deletion and bulk scopes; established safety boundaries determine cleanup and retained content-free accounting.
