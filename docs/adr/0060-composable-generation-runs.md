---
type: adr
id: ADR-0060
title: 'Composable generation runs and mixed document proposals'
status: accepted
date: 2026-11-16
supersedes: 'Extends ADR-0050/0055 proposal representation, ADR-0058 generated-source origins, and implements ADR-0045 independently settled stages with cumulative rounding; other authority and accounting rules remain active'
---

# ADR-0060: Composable generation runs and mixed document proposals

## Context

The user approved Feature070 after a mixed lesson failed during structured authoring. Knowledge documents already support prose and typed blocks, while proposals only carried blocks. Complex composition requires independent document order and generation dependencies, durable validated results, explicit continuation, and safe reuse after requirement changes.

## Decision

Use an application-owned validated generation plan, independent of chat transcript. Chat resolution and future authorized planning agents share the same entry point. The plan contains bounded typed tasks, explicit authorized sources and generated-artifact references, and separate output order. The host schedules sequential ready tasks, validates results and assembles one complete proposal. Keep existing provider SDK adapters and worker/lease composition; introduce no general workflow engine.

Evolve the canonical persisted proposal to a safe mixed Knowledge v2 fragment. Migrate historical blocks by wrapping them as learningBlock nodes, preserving identities and receipts. Mixed proposals insert only; existing replacement authority remains limited to exact typed block targets. Do not widen prose-only writers. Review, Insert into working draft and explicit Save remain distinct.

Persist owner-scoped runs, immutable plan revisions and validated artifacts with semantic fingerprints and exact dependency hashes. A source may identify generated prose through an immutable artifact origin and frozen text. Historical provenance never grants read authority. Published/copied material retains frozen evidence without requiring access to a private run.

A run may span explicitly admitted conversation actions. Each action retains existing calls, output, deadline, rate and cost limits. Reconnect never dispatches. Continue requires fresh explicit admission, idempotency and revision checks. At most one action runs per run; all checkpoints, transitions and publication require current lease and run revision. A successful stage stores new validated content and may pause the run. Final aggregate validation and final successful turn expose exactly one complete proposal.

Provider completion and expense are distinct from learner-charge eligibility. Rejected/partially invalid structured responses are ineligible in full. Technical failure releases the current action hold; earlier successful charges remain. Reusable validated artifacts from a failed action are not retrospectively charged. New calls consuming their text incur ordinary new input usage. Successful clarification/revision replies retain normal chat pricing; accepting a revision alone is free.

STOP RETAINS ADR-0045 eligible-partial-usage charging. It is not treated as a free technical failure. Cumulative exact customer rounding across run stages includes eligible stopped amounts and excludes operator-funded amounts. Every action pins its tariff/funding; settlement series locking and idempotency prevent double charging. No hidden automatic budget extension is permitted.

Paused unfinished runs may accept reviewed plan revisions. Reuse only semantically matching validated artifacts; invalidate changed tasks and descendants. Output-order changes reuse content. Active work must be explicitly stopped first. Revision acceptance does not dispatch; Continue remains separate. Completed proposals are immutable. Changed external sources offer captured snapshot or refreshed revision under current access; revocation prevents continuation.

Private checkpoints are not incomplete published proposals. Discard and source/conversation/account deletion fence late writes and clean private content while preserving required financial evidence without prompts or artifacts. No automatic web research, provider switch, arbitrary renderer or higher per-action limit is introduced.

## Alternatives considered

### Raise response and action limits

This does not fix ambiguity, source dependency correctness, invalid output recovery or failure diagnostics. Larger cost authority was not selected.

### One independent proposal per component

This exposes incomplete lessons and complicates source-dependent insertion. Private checkpoints plus complete atomic proposals preserve the existing publication boundary.

### New monolingual block or parallel proposal family

Existing Knowledge prose supports the content. Evolving the canonical mixed proposal avoids redundant document types and unreleased compatibility paths.

### Fixed plans and free Stop

The user explicitly chose revise-and-reuse and the existing Stop charge policy. Neither may be silently substituted during implementation.

## Consequences

Cross-package contracts, migrations, renderer/source validation, worker lifecycle and accounting require coordinated delivery. Disposable database proof, deterministic real SDK/worker execution, browser insertion and independent security/completion reviews are required. Estimates cannot guarantee model quality or that every lesson fits one action; remaining work requires explicit continuation or a reviewed scope change.

## Related

- [Feature070](../../.agent/features/070-composable-lesson-generation/FEATURE.md)
- [ADR-0045](0045-action-accounting-and-provider-expenses.md)
- [ADR-0050](0050-interactive-workbook-content-and-learning-boundaries.md)
- [ADR-0055](0055-learning-content-context-and-publication.md)
- [ADR-0058](0058-named-activity-content-and-source-provenance.md)
