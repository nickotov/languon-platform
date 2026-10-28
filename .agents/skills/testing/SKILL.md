---
name: testing
description: Determine, implement, and execute the lowest-cost reliable automated test strategy for Languon changes. Use for test planning, regression reproduction, unit/integration/contract/E2E coverage, failure analysis, coverage gaps, or validation before correction, improvement, or feature handoff. Do not use to weaken legitimate tests or replace required real-browser, device, database, or security verification.
---

# Testing strategy

## Define the regression surface

Read the active correction or improvement document, or feature specification/ExecPlan, the
implementation diff, applicable instructions, and neighboring tests. List the
behaviors that could regress and select the lowest-cost reliable layer for each.
Record required and deliberately omitted layers with rationale in the active
durable work state before substantial implementation. Separate development checks
from final gates. Trace shared contracts to their readers/writers and affected
consumers; file edits alone do not define the regression surface. For consequential
uncertainty, name and prove a small real integration seam early under
[discovery](../../../.agent/DELIVERY.md#1-establish-the-outcome-and-risk), then extend
the validated contract/fixtures across consumers. Keep small-fix discovery bounded.

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

For every user-visible change, retain ADR-0016's real browser/device evidence.
A copy-only typo can use one focused rendered-label check and existing relevant
component coverage; do not turn that into a full browser matrix or manufacture
a new test. If rendering is unavailable, report the evidence gap. A prose-only
developer-documentation change is not an application UI change.

Mock external systems only for deterministic control, cost avoidance, or failure
simulation. Do not mock the component under test or entire internal layers.

For behavior represented by a current `docs/user-flows` guide, use
`$user-flow-e2e` to synchronize stable scenarios and mapped tests. Traceability
markers do not justify promoting exhaustive lower-layer cases into E2E.

## Execute

For bounded corrections and focused improvements, apply the
[small-fix fast path](../../../.agent/DELIVERY.md#small-fix-fast-path).
Choose test files/cases by affected behavior rather than automatically running
the whole workspace or repository suite. Keep required static checks and
risk-triggered layers; widen the selection for affected callers, shared
primitives/contracts, configuration changes, or unresolved regression risk.
Use `$browser-verification` to decide whether valid durable browser-test evidence
already covers runtime verification before preparing a second browser session.

For a bug, reproduce the failure with an automated regression test before fixing
it when reasonably possible. For deterministic business logic, prefer a failing
test first. API changes should begin with a contract or integration test when
practical.

During development, run the narrowest affected unit/contract/integration files or
cases and scoped static checks. Include transitive consumers when a shared seam
changes. Validate fixture shapes through their real boundary schemas. A smaller
selection must still exercise the behavior at risk; mock only external transport
when real internal composition/persistence is required.

Schedule broad workspace suites, builds and critical gates after focused preflight
and source-review fixes stabilize, using the
[final readiness check](../../../.agent/DELIVERY.md#5-run-final-gates-and-approve-evidence).
Record a specific risk/selection for an earlier broad check. A targeted production
integration or rendered observation can run early to settle an assumption; this
does not move the whole-app gate into every development iteration. Resolve exact
mapped E2E files and reviewed commands; verify argument forwarding so a filter
does not silently run the entire suite.

If a check fails, distinguish implementation, fixture, environment and assumption
errors. Repair and rerun the focused reproducer before a justified broader check.
Measure cold reset/migration/setup cost separately from body time when diagnosing
slow integration tests. Diagnose waits, asynchronous work and resource contention
before changing a bounded harness watchdog; preserve product/cancellation deadline
assertions. Do not run competing builds or destructive resets on shared test resources.

Never delete, weaken, skip, or rewrite a legitimate test merely to produce a
pass. Do not silently replace a required test layer with a weaker one.
When guide behavior changes, rerun
`pnpm user-flow:e2e -- check <guide-feature-slug>` for every affected guide and
the mapped E2E command before handoff when their evidence is invalidated.

## Keep evidence valid without duplicate runs

For each material check, record an evidence ID, exact command and test selection,
result, tested revision/patch state, and relevant configuration/environment.
For uncommitted work, identify the base plus a captured patch or content hashes
of relevant tracked/untracked files; HEAD alone is insufficient. Never record
secrets, raw user data, or environment dumps. State precisely what the check
proves and what it does not prove.

Before handoff or remediation review, compare the final patch to the tested
state. Reuse evidence only if tested behavior, dependencies, tests, command
configuration, and relevant environment are unchanged. Record that comparison
and rationale. Invalidate checks for changed affected paths or uncertain impact;
rerun the smallest reproducer and necessary broader checks. Shared primitives,
contracts, migrations, build configuration, or infrastructure can invalidate
multiple consumers even when their files did not change.

A prose-only correction normally requires documentation/traceability checks,
not another database or build run. A changed guide coverage promise requires
semantic mapping review and may invalidate mapped execution evidence. A changed
runtime path cannot reuse evidence merely because the command was once green.
Never reuse external state-dependent evidence after the relevant state changed.

Once required checks pass for the final state, broaden or repeat only to answer
an unresolved risk, new failure, or explicit request. Use a separate tester for
the root specialist triggers and give it a bounded question and existing evidence.

## Report

Return test files added or changed, exact commands, concise results, failure root
causes, coverage gaps, and remaining verification. Put final evidence in the
single correction or improvement document, or feature `EVIDENCE.md`. The ExecPlan
links evidence IDs and records remaining work; it does not duplicate results.
