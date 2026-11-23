---
type: adr
id: ADR-0062
title: Single-submission lesson recovery
status: accepted
date: 2026-11-19
supersedes: 'ADR-0061 handling of settled invalid exercise candidates and authority across recovery stages'
---

# Single-submission lesson recovery

## Context

A learner requested a reading, three comprehension exercises, a grammar explanation and five grammar exercises. The provider could submit prepared answers for the R04 free-response activity, while the canonical checker required passage evidence and prohibited prepared answers. Repeating the same request consumed provider capacity and required the learner to supervise individual attempts.

## Decision

The planner declares dependencies and output order. A constrained author generates educational content for one ready exercise at a time. The host builds the canonical checking configuration and validates the exercise against its frozen sources before checkpointing. The exercise catalog defines what the author can supply.

Track attempts by revision, task, ordinal and dependency fingerprint. After a settled rejection, the scheduler can attempt a targeted repair and then a distinct fallback. Resume the next unused strategy across worker restarts. An exhausted unit blocks its dependents. Other ready tasks may still finish. Final publication requires every requested unit in plan order.

Before authoring, project every remaining strategy for each unfinished unit using its request schema, frozen inputs and expected predecessor material. Include input, output and request fees in estimated provider spend. At most one accepted candidate per unit counts toward estimated customer charges. Dispatch enforces actual limits on each call.

The initial admission pins a whole-lesson ceiling for credits and provider expense. A customer quote identifies its scope. Each stage reserves only its own allowance. Stage handoffs and recovery spend from the remaining authority, including measured expense for rejected calls. The existing eight-stage and fifteen-minute limits apply. Read-only requests never enqueue work. Stop revokes authority. An uncertain dispatch requires reconciliation or explicit acknowledgement. Existing paused runs require deliberate resumption.

## Alternatives considered

Repeating a failed stage resets the strategy and can repeat a deterministic validation error. Giving independent agents their own budgets complicates cost accounting and cancellation. Sequential specialist calls under one scheduler preserve the existing dependency and settlement model.

## Consequences

Customer-visible progress survives a disconnect and a worker restart. Capacity waits and validation repairs can finish in the background within the admitted limits. A permanent failure keeps completed previews available and identifies the affected exercise. Record only allowlisted validation information with attempt identity and strategy. Keep provider responses and learner text out of operational diagnostics.
