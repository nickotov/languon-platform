# Reliable lesson runs, previews and automatic continuation

Status: Complete
Created: 2026-11-17

The implementation was committed as `5adafe92` on `feature/reliable-lesson-runs`. The review record tracks subsequent corrections.

Specification: [implementation plan](../../../docs/reliable-lesson-runs-implementation-plan.md).

## Acceptance

- AC-1: Durable exercise tasks generate/checkpoint individual units; exact activity allocation/order and already accepted results survive interruption/resume, including existing complete/partial checkpoints.
- AC-2: Safe persisted diagnostic category/paths drive specific bounded repair and actionable UI. No raw model/user content in diagnostics; no ambiguous transport redispatch or unchanged automatic failure loop.
- AC-3: Owner-only prepared preview shows ordered validated fragments and frozen dependencies while running/paused; current access, hash/revision, payload and deletion fences hold. Preview has no publication or paid-check authority.
- AC-4: Server automatic continuation after successful progress stays within the original configured customer/provider ceilings, existing per-stage limits, at most eight stages and 15-minute authorization. Stable fingerprint/idempotency prevent stale or duplicated admission. Reconnect performs no dispatch.
- AC-5: Stop, terminal failure, revocation, source/plan/config changes, expiry, unknown liability or exhausted budgets halt automation. Explicit Retry/Resume obtains current bounded authority; no wallet-balance-based unlimited spending. Existing customer rounding, failed-action and Stop charging rules remain intact.
- AC-6: Clear task/subunit progress, visible prepared preview, distinct failure/retry and budget/resume states, automatic-budget explanation; existing approved UI patterns, stories and mobile/desktop EN/RU browser proof. Full mixed proposal Insert/Save remains final-only.
- AC-7: Explicit lesson/explanation language is resolved independently from chat language and retained through clarification; original French/Russian lesson activity allocation has deterministic production-composition coverage.
- AC-8: Current ADRs/guides/architecture/mappings, disposable DB and browser/static/build evidence, independent completion/security reviews.

## Incident recovery extension

See the [diagnosis and staged implementation plan](INCIDENT_RECOVERY_PLAN.md).

- AC-9: An idle, healthy reconnected stream reconciles exactly once and restores controls for the correct conversation and run. A rejected command is attributable using its safe response code and support reference.
- AC-10: Admission measures the next tool input using the same projection as execution. Historical checkpoint accumulation cannot independently exhaust a new unit's input allowance.
- AC-11: Worker handoff accounts for remaining time, protects saved side effects during fallback, and preserves the first unfinished unit across bounded stages.
- AC-12: Automatic admission and provider failures have distinct durable recovery semantics. Known pre-dispatch contention is bounded. An uncertain provider outcome cannot silently cause another dispatch.

- AC-13: A new manual continuation quote and its confirmation use the enforced stage demand when evaluating the shared rolling limit. A genuine denial stays visible and cannot dispatch or charge. R08 can generate a checked exercise without asking the model to synchronize invented IDs and duplicate its answer key.

- AC-14: One submitted lesson advances through recoverable, settled validation failures and worker restarts within the admitted aggregate ceiling. Catalog-specific content compiles to a validated canonical exercise. Exhausted recovery preserves accepted units and allows independent tasks to finish. See [single-submission plan](SINGLE_SUBMISSION_PLAN.md) and [ADR-0062](../../../docs/adr/0062-single-submission-lesson-recovery.md).
