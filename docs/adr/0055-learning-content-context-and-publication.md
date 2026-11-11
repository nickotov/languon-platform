---
type: adr
id: ADR-0055
title: Learning-content phase context and canonical publication
status: accepted
date: 2026-11-06
supersedes: None
---

# ADR-0055: Learning-content phase context and canonical publication

## Context

The Knowledge tutor rejected a71-character question before provider dispatch:
its global reservation combined74214input units against a64000per-call limit.
Sequential planning, authoring and hypothetical retrieval framing were treated
as simultaneous inputs. Independently, full historical tool exchanges and editor
snapshots could inflate later context. Dedicated tool execution also lacked the
same publication contract used by coordinated generation.

## Decision

Accepted on 2026-11-06 within the authorized feature: these are technical
execution and representation choices using the existing SDK, persistence,
permissions and accounting limits. They introduce no new provider or cost authority.

Separate canonical application records from model-context projections. Preserve
exact current sources and validated artifacts under existing authorization;
derive deterministic historical receipts without overwriting those records.
Receipts and semantic observations never grant source or publication authority.

Prepare bounded context once per admitted turn. Budget noncompactable inputs by
actual execution phase, separately from compactable history and financial upper
bounds. Admission and worker share phase rules; the actual model dispatch gate
remains authoritative. Do not reserve mutually exclusive phases as one call.

Use the installed SDK's explicit observational preparation and context retrieval,
then output-only SDK history persistence for streamed responses. Current input
and immediate tool dependencies remain exact. No automatic second memory cycle
or unaccounted background summarization is permitted.

Share raw authoring and one operation-bound publication facade. Mixed requests
validate every component before one proposal is persisted. Dedicated tools return
compact canonical proposal receipts; Apply and Save remain explicit learner actions.
The project is pre-release: replace obsolete application contracts directly and
update current callers rather than maintaining old-app compatibility branches.

## Alternatives considered

### Increase global context limits

Would leave incorrect reservation arithmetic, repeated context and financial
authority concerns unresolved. No provider, tariff or allowance increase is needed.

### Generic historical token trimming

The pinned built-in limiter does not protect tool pairs or complete current source
snapshots. Lossless canonical records and task-aware projections are required.

### Persist one proposal per generated component

Would expose partial mixed-request success and duplicate publication responsibility.
One guarded publication after full validation preserves the existing product contract.

## Consequences

Phase/schema and projected-context changes need production-composition regressions
using actual admission limits. SDK updates must preserve transient context versus
output persistence. Observation/reflection still consume the parent action's
existing support-call and output allowances. Unavailable exact sources require
clarification, not reconstruction from summaries.

## Related

- [ADR0042](0042-knowledge-workspace-document-and-context-boundaries.md).
- [ADR0045](0045-action-accounting-and-provider-expenses.md).
- [ADR0052](0052-source-bound-knowledge-ai-actions.md).
- [Feature061](../../.agent/features/061-reliable-learning-content-pipeline/FEATURE.md).
- [Research](../surveys/agent-tool-context-compaction.md).
