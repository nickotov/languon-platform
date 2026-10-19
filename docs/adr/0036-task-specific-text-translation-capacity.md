---
type: adr
id: ADR-0036
title: Task-specific immutable translation capacity
status: accepted
date: 2026-10-16
supersedes: None
superseded_in_part_by: 'ADR-0038: retired DeepSeek Chat and arbitrary legacy environment model execution only'
---

# ADR-0036: Task-specific immutable translation capacity

## Context

Whole-text translations need more output than dictionary cards. Their shared
8192-token request cap rejects ordinary aligned articles despite an existing
40960-token aggregate reservation. Increasing a global cap would change unrelated
work and reinterpreting queued snapshots would violate ADR-0026. Old workers
must not claim snapshots using an execution profile they cannot resolve.

## Decision

Trusted model definitions retain base limits for dictionary and legacy work.
New text-translation:v2 jobs pin a reviewed model-specific translation profile
into the existing immutable execution snapshot. Current DeepSeekFlash uses
128000input/32768output tokens; base calls remain64000/8192. Other existing
models retain their base profile until their exact route supports verified higher
limits. No silent model fallback or mutable dispatch-time preference lookup occurs.

Resolvers accept exact reviewed profiles only and forward the snapshot's limits
to the actual provider adapter. Existing aggregate cost/token reservations and
credit price revisions remain authoritative; larger per-call limits do not raise
them. The Flash request explicitly uses reasoning_effort:none for predictable
translation output; an SDK-wire test verifies serialization without a paid call.

The internal translation format advances to v2. A backwards-compatible CHECK
migration permits v1 and v2 translation rows, while detection remains v1. New
workers process both; v1-only workers cannot claim v2. Already-admitted snapshots
are not rewritten. Expand/migrate/start compatible workers before enabling v2
admission; roll back by disabling admission and draining v2 before old workers. Shared default activation additionally requires every
worker to recognize Flash; pre-Flash rollback must drain all Flash jobs, including
dictionary/learning jobs, and restore a supported default before old code runs.

Complete-request preflight remains conservative and dependency-free. Exact
serialized JSON framing replaces a fixed per-pair penalty. This does not claim
that UTF8 bytes are an exact tokenizer, nor that translation length is predictable.
The 20000-code-point source bound does not guarantee model fit. A distinct
model_capacity_exceeded error exposes genuine overflow before dispatch. Provider
length termination, malformed or incomplete alignment never publishes a proposal.

## Alternatives considered

- Increase global limits: changes dictionary behavior and does not preserve jobs.
- Guess an unrelated tokenizer's count: reduces some rejections without reliable
  model-specific guarantees. A future tokenizer can be independently verified.
- Keep v1 and rely on worker readiness: old workers could still claim new jobs.
- Automatically split or silently switch models: changes context, cost and user
  selection semantics beyond this repair.

## Consequences

Dictionary limits, existing envelopes and legacy jobs stay stable. New translation
profiles can be tested through admission, resolver and actual SDK payload. The
format migration and worker rollback floor add operational coordination.

DeepSeek's non-billable model catalog and current official docs advertise Flash
and Pro rather than the legacy deepseek-chat model. The user explicitly selected
Flash for new jobs; mutable default/preferences may be changed only within that
authorization, preserving historical configuration/pricing/job records.

## Related

- [ADR-0026](0026-shared-text-ai-selection-and-user-preferences.md).
- [ADR-0035](0035-texts-and-contextual-vocabulary-publication.md).
- [Provider completion limits](https://api-docs.deepseek.com/api/create-chat-completion).
- [Provider model limits](https://api-docs.deepseek.com/quick_start/pricing).
- [Texts follow-up plan](../../.agent/features/043-texts/EXEC_PLAN.md).
