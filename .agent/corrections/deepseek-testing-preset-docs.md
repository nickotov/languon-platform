# Correction: Document the DeepSeek Flash testing preset

Status: Complete
Created: 2026-10-24
Updated: 2026-10-24

## Routing decision

Documentation-only correction recording user-supplied testing values. No runtime,
contract, persistence, security, billing behavior, dependency, or deployment changes.

## Context and scope

Add the accounting limits and provider-price preset to the existing operations
guide. Preserve unrelated admin changes. No application settings are changed.
Existing user-flow behavior and mappings remain unchanged; no guide update or
independent review is required for this prose-only change.

## Acceptance criteria

- AC-1 — Both supplied tables are documented with their exact values, local-test
  scope, and distinction between provider costs and customer tariffs.

## Plan

- [x] Add the preset to the accounting operations guide.
- [x] Verify formatting, supplied values, and the scoped diff.

## Verification

`pnpm exec prettier --check docs/operations/ai-accounting.md
.agent/corrections/deepseek-testing-preset-docs.md` and `git diff --check` passed.
Author preflight compared both tables against the supplied values and inspected
the operations-guide diff; all values match. Runtime, browser, database,
unit tests, lint, typecheck, and build are not applicable to this prose-only change.

## Remaining risks

Provider rates can change; the guide directs operators to review current pricing
before using the preset for actual cost reporting.
