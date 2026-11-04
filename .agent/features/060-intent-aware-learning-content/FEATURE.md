# Intent-aware Knowledge tutor and dedicated learning content tools

Status: Complete
Owner: Engineering agents
Created: 2026-11-04

## Problem and scope

BL-013 and BL-015: Knowledge tutor currently authors full blocks itself and offers every prose reply for document insertion. Implement the user-approved intent-aware plan. Include exact same-chat proposal followups from BL-016. Runnable BL-014 Playground and cross-context standalone artifacts remain deferred.

## Acceptance criteria

- AC-1 — Distinguish conversation, learning explanation, clarification, generation, revision and limitations. Only useful learning prose or explicit editor requests offer document insertion.
- AC-2 — Standalone schema-validated vocabulary, grammar, bilingual text and exercise tools share bounded authoring with coordinated multi-component generation. Current exercise formats only; extensible capability registry.
- AC-3 — Clarify material gaps before generation, retain pending requirements across replies/reload/compaction, preserve explicit words/counts and use disclosed minor defaults.
- AC-4 — Validate complete ordered output before one proposal; no partial generation success. Respect cancellation, accounting, provider call/token bounds and existing Apply/Save permissions.
- AC-5 — Followups retrieve exact authorized prior same-chat proposals, including unapplied vocabulary, and clarify ambiguous references.
- AC-6 — Durable public response metadata survives replay/reload; legacy replies do not receive unsolicited document actions.
- AC-7 — Focused automated, production-composition, database, browser/E2E, static checks and independent/security review provide honest evidence. Standalone invocation instructions and current guides/backlog links are included.

## Design direction

Extend approved existing chat and proposal components. No supplied external design or new visual system.

## Constraints

Do not raise model-call/token ceilings or change providers. All model output is untrusted. Source authority is server-resolved. Generation is separate from publishing and dictionary saving. Default five exercises, existing supported mixed formats, all supplied words.

## User-flow documentation

Update existing knowledge-workspace, contextual-language-assistant-and-knowledge and interactive-workbooks guides and their tests rather than duplicate the existing journey.

## Open decisions

None. Implementation limitations and missing evidence belong in EXEC_PLAN/EVIDENCE.

## Completion and bounded exceptions

Implemented and verified the selected scope. Recent conversational proposal resolution is bounded to eight receipts; unavailable, older or ambiguous material requires clarification rather than invented source content. Existing mapped Knowledge guides cover the learner journeys. The standing internal smoke recipe needs no separate learner-flow guide; its startup now selects the actual workspace branch and rejects legacy responses without classification. Runnable Studio and cross-context artifacts remain deferred as authorized.

Real-provider proof of the changed route remains unavailable: the two standing smoke slots were consumed by an older non-watching local worker. No further dispatch, quota reset, new task key or budget change was attempted. Restart the existing user-owned worker before interactive use; no user-owned service was stopped. Broad opt-in model-quality evaluation remains separate from implementation correctness.
