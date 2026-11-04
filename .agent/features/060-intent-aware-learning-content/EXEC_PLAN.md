# ExecPlan: Intent-aware learning content

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-11-04

## Architecture and decisions

Follow ADR-0037, 0041, 0042, 0045, 0050 and 0052. Conversation worker owns fenced persistence; authoring lives in infrastructure with application-owned briefs; shared contracts contain only boundary schemas. Exact source readback requires current operation authority, never model-selected owner IDs. Extend existing UI patterns.

## Verification plan before implementation

- Focused Vitest authoring/routing/metadata/worker tests (estimated 1–3 min).
- pnpm --filter @languon/contracts build, backend/web typecheck and scoped lint/format checks (estimated 2–5 min).
- Disposable DB migration/readback/fencing tests and affected production-composition AI contract tests; prerequisites Docker PostgreSQL/Redis (estimated 3–10 min).
- Existing mapped Knowledge Playwright journeys and targeted metadata/document-action browser case; prerequisites disposable E2E stack (estimated 3–10 min).
- pnpm docs:user-flows:check and pnpm user-flow:e2e -- check for changed guides (estimated <1 min).
- Baseline/final pnpm dev:doctor --capability knowledge-actions --json; live proof separately under AI_SMOKE_POLICY. Never equate deterministic adapters with real-provider proof.
- Independent source/completion review required; security reviewer covers model tools, authorized proposal reads, public projections, migration grants. Separate tester covers production-composition harness adequacy and selected E2E evidence.

## Milestones

- [x] M1 — Authoring tools, routing, pending briefs and exact proposal followups (AC-2–5).
- [x] M2 — Durable metadata, document action guard, registry and documentation (AC-1,6).
- [x] M3 — Verification, independent/security review, remediation and accurate handoff (AC-7).

## Current progress

2026-11-04: user authorized implementation. Initial worktree clean. Created feature/intent-aware-learning-content from main. Workers have disjoint ownership: authoring service/tools, routing integration, response metadata persistence/UI. Root owns integration, proposal readback, feature records, registry, documentation and final gates.

## Remaining work

Implementation and selected verification are complete. Final source and security reviews approved. Real-provider proof of the changed route is a documented residual gap; see EVIDENCE. No additional paid dispatch is permitted under the exhausted standing task allowance.

## Evidence

[EVIDENCE.md](./EVIDENCE.md), [REVIEW.md](./REVIEW.md).

## Integration findings

- D-1: Keep exact proposal reads behind new narrow security-definer function with turn lease and same-chat owner/source checks; do not grant broad proposal SELECT to worker. Added generated custom migration0163 and role EXECUTE grant.
- D-2: Preserve current financial categories: planning and authoring are actor work mapped to existing answer category at the action-accounting boundary; internal phase labels do not expand financial authority.
- D-3: Prior unapplied proposals provide exact grounding, but do not confer current-document source-link authority. Follow-up exercises are self-contained when their sources have not been applied. Same-batch valid links retain existing behavior.
- D-4: Mechanism stays within accepted ADR0050/0052; no independent cross-context artifact lifecycle or Studio execution boundary is introduced.

## Remediation checkpoint

Independent review exposed cross-phase contract gaps; the stabilized remedies and all selected final gates now pass. Centralized shared serialization/defaults/limitations and complete task-set matching replace duplicated inference. Added publication lifecycle gates (running/failed/cancelled proposals remain private and inapplicable) with migration0164. Real DB52test suite and security remediation review pass. Browser evidence includes all nine Knowledge workspace cases after JSONB semantic-dirty repair and all three workbook cases, including the final natural catalog revision/copy rerun. Final registered ai-conversation stage includes new request, source, authoring and presentation regressions plus existing portrait/accounting isolation.

## Final outcome

2026-11-04: registered ai-conversation stage passes222tests/13files with no skips; all12mappedbrowsercases pass using11valid unaffected cases plus the focused catalog-revision rerun; API prerequisite4/4; fixture9/9; smoke guard11/11; critical registry23/23; backend build/typecheck, web typecheck and focused tests, scopedlint/format and three guide mappings pass. All migrations0162–0164 verified against disposable DB and applied only to the explicitly checked local development database. Finaldoctor knowledge-actions ready=true is configuration/runtime readiness, not changed-route live proof.

The first live action succeeded only on legacy/no-branch path (expense249microUSD); the second selected a working branch but lacked classification metadata and failed the corrected proof guard. Existingworker processes startedNov1 and run without watch; source was implementedNov4. Both reservations/artifacts remain retained, no retry or allowance evasion. Worker restart remains an explicit local activation step; no user-owned service was stopped.

Owned testcontainers/servers cleaned up; synthetic live billing artifacts retained per policy. No production deployment/model switch/price/budget change, branch deletion or push. Backlog013/015/016 remain In progress for their full deferred acceptance, avoiding false closure.

## Retrospective

Pending user acceptance per DELIVERY; does not delay technical handoff.
