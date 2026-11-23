---
type: adr
id: ADR-0061
title: Bounded automatic lesson continuation and owner prepared previews
status: accepted
date: 2026-11-17
superseded_in_part_by: 'ADR-0062 durable exercise recovery after a settled rejection and ADR-0063 repeatable insertion from completed lesson proposals'
supersedes: 'ADR-0060 manual confirmation at every internal stage and hiding all prepared content until final publication; all other rules remain active'
---

# ADR-0061: Bounded automatic lesson continuation and owner prepared previews

## Context

The user approved the complete revised lesson flow after repeated final-exercise failures: preserve per-exercise progress, expose completed material for inspection, and avoid manual continuation between internal stages. The original lesson exposed poor estimates and insufficient safe error classification. A sufficient wallet balance is not unlimited spending authority.

## Decision

Keep typed plans, immutable artifacts, existing conversation actions/workers/leases, canonical complete mixed proposals and accounting participants. Exercise generation in a durable run uses individual validated/checkpointed units. Safe diagnostics identify failure category and bounded schema paths; the one allowed repair addresses known completed invalid output. Never automatically retry ambiguous transport or publish truncated output.

Pin durable automatic-continuation authority to the initial admitted action's configured credit ceiling and provider-cost ceiling, stable funding/route/tariff/provider-price fingerprint, current revision, at most eight stages and a 15-minute lifetime. These limits apply to the entire authorization, not each new stage; defaults are not multiplied. Each stage separately retains the existing five-call/10000-output/provider deadline limits and current financial/capacity/access admission. Unknown liabilities prevent additional dispatch.

After a successful action with new checkpoints pauses on allowance, server-owned idempotent scheduling may admit a next stage inside the remaining pinned authority. The claim path recovers ready work after crashes. Reconnection/read requests never schedule work. Stop at run level revokes automatic authority even between actions. Technical failure, source/plan change, access revocation, stale configuration, expiry or exhausted ceilings halt automatic continuation. Explicit Retry/Resume obtains fresh bounded authority through existing confirmation; it does not authorize an unlimited balance drain. Preserve failed-action release, chargeable Stop, cumulative customer rounding and separate operator expense rules.

An owner-only prepared-preview endpoint may expose current-revision validated task fragments and frozen source dependencies after checking current access and artifact hashes. It uses existing safe document contracts and aggregate payload bounds. Preview is read-only, private and independent of final proposal publication. Shared readers cannot read it; discard/deletion/revocation remove access. No insertion, persisted practice, paid checking, library-copy or source-reading authority follows from preview provenance. Final insertion remains one complete mixed proposal followed by explicit Save.

## Alternatives

Increasing per-call output alone leaves validation and retry loops unresolved. Automatically spending until wallet exhaustion has no suitable bounded authorization. Client-driven continuation fails on closed pages and duplicates work on reconnect. Publishing each checkpoint as a separate proposal fragments the lesson and widens insertion authority unnecessarily.

## Consequences

Run persistence, financial admission and Stop must coordinate atomically and require real database/race tests. Current actions settle independently; prior accepted work remains charged when a later action fails. Existing runs preserve content and may acquire new authority only on an explicit continuation. Prepared previews must not leak through summaries, sharing or stale caches. A budget or recoverable technical failure may still require a decision; automatic completion is not a guarantee of model validity.

## Related

- [Feature071](../../.agent/features/071-reliable-lesson-runs/FEATURE.md)
- [Implementation plan](../reliable-lesson-runs-implementation-plan.md)
- [ADR-0060](0060-composable-generation-runs.md)
- [ADR-0045](0045-action-accounting-and-provider-expenses.md)
