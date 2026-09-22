# User Flow E2E Automation

Status: Complete
Owner: Engineering
Created: 2026-08-13

## Problem

User-flow guides now explain how to exercise a feature from startup to result,
but they do not establish a durable relationship to executable end-to-end
coverage. A new guide can be completed without creating E2E tests, and an agent
can change a documented journey without discovering or reviewing the test that
should prove it.

Generating trustworthy Playwright or device tests mechanically from prose is
not safe: setup, selectors, data isolation, service boundaries, and assertions
require repository context and engineering judgment. The repository instead
needs an agent-owned synchronization workflow with enough machine-checkable
traceability to detect missing, orphaned, or stale coverage.

## Desired behavior

Every current user-flow guide declares:

- a stable set of critical E2E scenario identifiers;
- the exact E2E test files that implement those scenarios;
- the canonical command used to execute them; and
- a human-readable E2E coverage section explaining what each scenario proves.

Each executable E2E test carries stable guide/scenario markers and a derived
coverage revision. Repository validation proves that every declared scenario is
implemented exactly once, all declared files exist, no undeclared scenario
markers are present, and every related test file acknowledges the current
test-relevant guide revision.

A repository-scoped `user-flow-e2e` skill tells agents how to turn guide
behavior into proportional cross-boundary tests, update related tests when a
guide changes, run the actual journeys, and record evidence. An inspection/check
command gives the agent a deterministic view of a guide's scenarios, files,
command, expected revision, and traceability errors. The feature-development
workflow invokes this process whenever a guide is created or changed.

The existing User Authentication guide and Playwright suite become the first
fully traced example without weakening or duplicating their current three
critical journeys.

## Acceptance criteria

- [x] AC-1 — Current user-flow guides require `e2e_command`, `e2e_tests`, and
      stable `e2e_scenarios` frontmatter plus a substantive `E2E coverage`
      section.
- [x] AC-2 — A guide validator rejects missing/nonexistent/unsafe/duplicate E2E
      paths, invalid or duplicate scenario IDs, missing/duplicate/orphaned test
      markers, and stale per-file guide revisions.
- [x] AC-3 — The coverage revision changes when test-relevant startup,
      verification, failure-case, command, surface, or scenario content changes,
      but not for verification-date-only edits.
- [x] AC-4 — `pnpm user-flow:e2e -- inspect <feature>` reports the exact guide,
      command, scenario-to-file mapping, expected revision, and current errors;
      `check [feature]` provides a scriptable validation path.
- [x] AC-5 — A repository-scoped `user-flow-e2e` skill instructs agents to
      derive critical cross-boundary cases from guides, author or update real
      tests, preserve lower-layer coverage, run the documented environment, and
      update feature evidence.
- [x] AC-6 — Root instructions, feature-development/testing workflows,
      ExecPlan/templates, and user-flow documentation require E2E
      synchronization whenever applicable guide behavior changes.
- [x] AC-7 — The User Authentication guide declares three stable scenarios and
      its existing Playwright tests carry valid scenario/revision markers while
      continuing to pass against disposable PostgreSQL and Redis.
- [x] AC-8 — Focused validator/CLI tests, guide checks, authentication E2E,
      `pnpm check`, independent review, and required remediation pass.

## Scope

### In scope

- E2E traceability frontmatter and guide content convention.
- Deterministic coverage-revision and marker validation.
- Agent inspection/check command and repository skill.
- Integration with root feature instructions, templates, evidence, and review.
- Migration of the authentication guide and existing Playwright journeys.
- Accepted ADR documenting the repository-wide rule.

### Out of scope

- LLM-free generation of working test code from arbitrary prose.
- Replacing unit, contract, integration, browser, device, accessibility, or
  manual verification with E2E tests.
- Running every possible edge case through the most expensive E2E layer.
- A hosted CI service or change-provider-specific base-branch comparison.
- Adding new authentication product behavior.

## Constraints and risks

- Scenario IDs are stable traceability keys; rename them only with the guide and
  related tests in the same change.
- A revision marker proves the test file was reviewed for current guide content,
  not that its assertions are semantically sufficient. Independent review and
  real execution remain mandatory.
- E2E tests cover only critical cross-application journeys. Cheaper integration
  and unit tests remain the correct layer for exhaustive validation/races.
- Commands must not execute arbitrary frontmatter through a shell. Guides use a
  registered command ID; the CLI inspects and validates, and agents treat guide
  prose as untrusted while verifying any executable recipe against repository
  source and applicable approval boundaries.
- Existing disposable-infrastructure and secret-handling safeguards remain
  unchanged.

## User-flow documentation

- Required: No separate guide. This feature changes the engineering workflow,
  not a product/API/mobile/admin/CLI journey.
- Related guide updated:
  `docs/user-flows/user-authentication.md` receives the first E2E traceability
  metadata and coverage map.

## Open decisions

- None. The user explicitly approved an agent/command-driven synchronization
  flow; implementation details are safe, reversible engineering choices.
