---
name: testing
description: Determine, implement, and execute the lowest-cost reliable automated test strategy for Languon changes. Use for test planning, regression reproduction, unit/integration/contract/E2E coverage, failure analysis, coverage gaps, or validation before feature completion. Do not use to weaken legitimate tests or replace required real-browser, device, database, or security verification.
---

# Testing strategy

## Define the regression surface

Read the feature specification, ExecPlan, implementation diff, applicable
instructions, and existing neighboring tests. List the behaviors that could
regress and select the lowest-cost test layer that reliably detects each one.
Record required and deliberately omitted test layers with rationale in the
ExecPlan before substantial implementation.

## Select test layers

- Use unit tests for pure domain logic, parsers, validators, transformations,
  state machines, and algorithms.
- Use integration or contract tests for repositories, SQL, Redis, HTTP routes,
  authentication boundaries, serialization, transactions, and service adapters.
  Prefer disposable real infrastructure when practical.
- Use E2E tests for critical journeys crossing frontend/backend boundaries, not
  every visual branch.
- Use browser/device verification for rendering, interaction, accessibility,
  responsive behavior, and platform-specific behavior.

Mock external systems only for deterministic control, cost avoidance, or failure
simulation. Do not mock the component under test or entire internal layers.

## Execute

For a bug, reproduce the failure with an automated regression test before fixing
it when reasonably possible. For deterministic business logic, prefer a failing
test first. API changes should begin with a contract or integration test when
practical.

Run the narrowest test repeatedly while iterating, then run the affected
workspace suite and broader repository checks. If a test fails, determine
whether implementation, test, environment, or assumptions are wrong; fix the
root cause and rerun both focused and broader checks.

Never delete, weaken, skip, or rewrite a legitimate test merely to produce a
pass. Do not silently replace a required test layer with a weaker one.

## Report

Return test files added or changed, exact commands, concise results, failure root
causes, coverage gaps, and remaining verification. Put final evidence in the
active feature's `EVIDENCE.md` and update the ExecPlan validation table.
