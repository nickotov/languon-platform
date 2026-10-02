# Flashcard training backend and design handoff

Status: Complete
Owner: Engineering agent
Created: 2026-10-02

## Problem and authorization

BL-002 needs configurable flashcards; BL-003 requires independent learner progress.
On 2026-10-02 the user explicitly authorized backend feature delivery, followed by
a copyable Magic Patterns prompt grounded in actual backend/current frontend code.
Stop for the returned design; frontend implementation is not authorized in this slice.

## Desired behavior

Follow the [resolved implementation baseline](../../../docs/flashcard-training-implementation-plan.md).
Owners and signed-in shared readers save independent preferences and learning
results. Anonymous shared readers receive bounded content without personal writes.

## Acceptance criteria

- AC-1 — Monotonic learning versions invalidate only effective learning changes
  across manual/AI/default settings paths, preserving protected overrides/authored metadata.
- AC-2 — Bounded typed selection/preparation/items APIs project enabled fields,
  role-relative examples and word fallback/deduplication with correct eligibility.
- AC-3 — Independent preferences, content-free idempotent attempts and per-entry
  current progress persist with optimistic/stale-write conflict handling.
- AC-4 — Idempotent latest-rating Undo retains audit and cannot overwrite newer
  results or changed content; totals reflect current active entries.
- AC-5 — Every operation/replay checks live owner/shared access and active users;
  anonymous reads never write progress; bounded learning-specific rate limits.
- AC-6 — Archive/restore, permanent deletion, learner purge on foreign dictionaries
  and independent forks obey the baseline lifetime/isolation rules.
- AC-7 — Additive migrations and disabled-by-default rollout are verified with
  disposable PostgreSQL, concurrency, bounds and indexed deletion lookups.
- AC-8 — Contracts/OpenAPI, executable mapped API guide, affected checks and
  independent completion/security/persistence-test reviews are complete.
- AC-9 — Copyable actual-code design prompt has versioned provenance; frontend
  remains untouched awaiting the returned design.

## Scope

Learning revisions, projection/contracts, persistence/API, cleanup, rollout,
verification, API guide and versioned design prompt. Exclude frontend/native/admin
runtime changes, sentence/grammar exercises, AI/credits, persisted queue resume,
spaced repetition and copied content snapshots.

## Constraints and risks

Root AGENTS, backend DDD and ADR-0002/0011/0019/0023/0024 apply. Do not store share
keys or vocabulary in learning history. Users retain tombstones, so foreign learner
purge is explicit. Bound 10,000 active entries and 25-item presentation batches.
Learning metadata must not fabricate authored revisions/timestamps. Maintain
epochs/cleanup before capability activation and do not roll back to incompatible writers.
This scoped feature does not complete BL-002 frontend or all future BL-003 modes.

## User-flow documentation

[Flashcard backend API guide](../../../docs/user-flows/flashcard-training-backend.md)
maps three real composed HTTP/PostgreSQL/Redis journeys. Existing dictionary-platform,
profile-account-controls and dictionary-permanent-deletion guides were inspected;
related-guide metadata links learning without changing existing browser scenarios.
Lifecycle/race proof is recorded in EVIDENCE. No visible application changes occur,
so browser visual verification is not applicable to this backend slice; frontend
browser evidence remains required in its later delivery.

## Design boundary

[DESIGN.md](DESIGN.md) owns v001 provenance and the Awaiting design slot.
No supplied design or selected frontend implementation target exists. FC-01–FC-09
are future UI requirements, not claims of implemented screens or rendered fidelity.

## Open decisions

No unresolved product decision. Actual source decisions and review remediation
belong to [EXEC_PLAN.md](EXEC_PLAN.md), [EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md).
