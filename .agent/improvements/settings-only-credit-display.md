# Improvement: Show passive credit information only in Settings

Status: Escalated
Created: 2026-10-25
Updated: 2026-10-25

## Routing and scope

Focused presentation improvement across established web journeys. The user explicitly
requests removal of distracting credit/budget/spending blocks outside Settings Credits.
No API, persistence, charging, budget admission or authorization changes. This newer
user instruction overrides the passive billing presentation described by ADR-0045;
its financial rules remain intact. No new architecture decision.

Remove ActionBudgetSummary, ActionBilling and TurnUsage consumers and obsolete display
components/slots. Remove chat model budget footer and balance rows from speech consent.
Keep Settings Credits, AI settings budget controls, execution/progress/error feedback,
and explicit reduced-allowance/paid-generation confirmations. No automatic consent.
Preserve existing Free capability policies. No paid calls or normal dev data changes.

## Acceptance

- AC1: No passive balance/budget/spending/usage panels in dictionary, texts, Knowledge,
  chat, sentence practice or interview; remove empty wrappers/unused imports.
- AC2: Settings Credits continues to display the available balance; saved budget
  settings and all existing accounting/error/consent behavior continue unchanged.
- AC3: Scoped frontend checks and real deterministic browser journeys pass; updated
  guide/test expectations retain backend charge and lifecycle assertions.

## Plan and verification

Implement display removal; synchronize affected guides/tests; run web typecheck,
scoped lint/format, targeted deterministic dictionary/text/chat flows with settings
visibility checks. Reuse runner isolation and external fixtures. No database layer
change requires a new persistence test. No new implementation-mirroring unit tests.
Bounded independent review checks accidental financial/control regressions.

Existing large files are touched only to remove display nodes/imports/slots;
restructuring their unrelated responsibilities would expand this focused cleanup.

## Evidence

Pending. Agent credit_ui_traceability owns guide/spec assertions and markers; root
owns runtime UI. Base: 2437617 (confirm current Git state at handoff). No commit
requested for this task. Rollback: restore removed UI consumers/components via Git;
there is no data or configuration rollback.

User approved the real Settings balance feature after discovery of the placeholder.
Continued in [feature 053](../features/053-settings-credit-balance/FEATURE.md); this
record is retained as the original bounded discovery, not a second completion claim.
