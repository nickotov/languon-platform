# Correction: AI execution regression instructions

Status: Complete
Created: 2026-10-25
Updated: 2026-10-25

## Routing and scope

User approved the proposed backend agent instruction following the reproduced
card-authoring router failure. Bounded instruction maintenance; no runtime,
contract, persistence, billing, dependency or workflow-authority change.
Preserve all existing uncommitted implementation work. No commit authorized.

## Acceptance and plan

- Add one rule under backend AI instructions requiring real default routing and
  factory coverage with fake external HTTP, admitted/reduced budgets, preserved
  snapshot validation, isolated capabilities and outgoing limit assertions.
- Distinguish injected-provider and isolated live-call evidence from full failing
  execution-path coverage. Retain existing no-paid-call policy.
- Check formatting, whitespace, instruction scope and authority consistency.

## Verification and outcome

Added `AI execution regression coverage` to `apps/backend/AGENTS.md`.
`pnpm exec prettier --check apps/backend/AGENTS.md .agent/corrections/ai-execution-regression-instructions.md`
and `git diff --check` pass. Author review confirmed routing/factory/admission
changes trigger the rule; unrelated UI/copy edits do not. Existing paid-call,
workflow, security and broader verification authority is preserved. No new
commands or links were introduced in the instruction.

Documentation-only: no runtime/browser/database/test execution needed.
Existing user-flow behavior, commands and mappings do not change. No ADR or
backlog change. Author review is proportional; no independent review required
for this small instruction addition. Rollback: remove the added subsection.

## Remaining risks

Instruction compliance still depends on selecting a faithful regression seam;
the existing real-router regression provides an executable example in
`apps/backend/tests/unit/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router.test.ts`.
