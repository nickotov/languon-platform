# Reliable learning-content tools and context pipeline

Status: In progress
Created: 2026-11-06

## Goal and authorization

User authorized implementation of the combined BL-013/BL-015 plan, then explicitly
removed unreleased-app compatibility requirements and permitted affected local
user-content cleanup. Build on feature 060. Full Mastra Studio BL-014 is excluded.
Research: [survey](../../../docs/surveys/agent-tool-context-compaction.md).
Incident: [diagnosis](../../improvements/learning-content-batching.md).

## Current delivery state

Implementation, local data remediation and selected deterministic/browser/static
verification are finished. Independent completion and security review approve
source, local cleanup and native evidence. Overall delivery remains in progress
because S3 has an operational High security remainder: the configured provider
key found in local observational-memory configuration must be rotated/revoked,
or the user must explicitly accept the residual risk. There is no evidence of
exfiltration. The feature is not ready for strict completion or merge to main.
AC-9's operational security gap is separate from the passing implementation checks.

## Acceptance criteria

- AC-1: Root/package instructions state the pre-release direct-contract policy.
- AC-2: One capability registry and raw authoring/publication operation serve singleton tools and atomic ordered mixed requests, with validated compact proposal receipts.
- AC-3: Phase-correct admission/execution permits the realistic 16.7 KB editor, four materials and 21 KB prospective-read case at 64,000 tokens; true irreducible overflow fails before hold/turn/dispatch, while compactable history remains eligible.
- AC-4: Prepare OM once per action, preserving full current context and canonical records. Planner consumes prepared observations/history; streamed actors persist through SDK output-only history without automatic repeat OM.
- AC-5: Historical complete tool pairs project to deterministic receipts; immediate read content, active pairs and exact selected source material remain available and authorized.
- AC-6: Remove obsolete compatibility paths while retaining current revision/copy/prose behavior through canonical contracts. No runtime old-app schema bridges.
- AC-7: One proposal query owner; no active polling/status-triggered refetches; successful publication/Apply/reconnect reconcile once; ordinary admission avoids workspace/detail reloads while preserving auto-title.
- AC-8: A production 64K journey from 50 entries through Apply/Save to 10 new entries, exact follow-ups, mixed content, reduced limits, invalid output, cancellation/fences and bounded network behavior have valid automated/browser evidence.
- AC-9: Current guides/backlog/evidence, independent completion/security review and scoped static/build checks; readiness and paid-model evidence separately reported.

## Constraints and design

Preserve five total calls, two memory calls, the 10,000-token output allowance,
deadlines and existing financial authority.
No provider/SDK upgrade, new exercise format, new artifact store or Studio expansion.
Extend approved existing UI patterns; error guidance correction only, no design changes.
Keep raw canonical artifacts for Review/Apply/Save; receipts are never source authority.
Data deletion is permitted only after verified target/dependencies and when necessary;
no arbitrary reset or changes to credentials/routing/ledger history.

## Interfaces

Internal `generateAndPropose` accepts the existing complete brief and returns ready
receipt (proposal ID, summary, kinds/counts/languages, requiresLearnerApply) or typed
clarification/unsupported/failure. Source ownership remains supplied by server ports.
HTTP/SSE activity remains safe ID/name/state; update current internal callers together.

## Documentation

Existing knowledge-workspace, interactive-workbooks and contextual-language-assistant-and-knowledge
guides cover these journeys. Add source mappings and tests to these guides, not a new journey namespace.
