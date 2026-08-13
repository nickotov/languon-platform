# ADR-0003: User-flow E2E traceability

Status: Superseded by ADR-0004
Date: 2026-08-13
Supersedes: None
Superseded by: [ADR-0004](./0004-user-flow-e2e-traceability-hardening.md)

## Context

Languon keeps durable start-to-result feature instructions in
`docs/user-flows/`, but a guide alone does not ensure that critical journeys are
covered by executable end-to-end tests or that those tests are reviewed when the
guide changes. File paths without scenario-level traceability allow missing or
stale coverage, while automatic code generation from prose cannot reliably
understand application boundaries, selectors, data isolation, infrastructure,
or meaningful assertions.

This decision affects every future executable feature and must remain stable
across feature workspaces and application test frameworks.

## Decision

Every `current` user-flow guide declares a canonical E2E command, exact E2E test
files, and stable critical scenario IDs, and contains a human-readable E2E
coverage section. Each declared test file carries a guide revision marker; each
scenario is implemented by exactly one stable scenario marker.

The guide revision is derived from test-relevant guide content: feature and
surface identity, scenario list, E2E command, scope, development startup,
surface-verification sections, and expected failures/edge cases. Verification
dates and unrelated prose do not affect it.

Repository validation fails on unsafe or missing paths, duplicate or invalid
scenario IDs, missing/duplicate/undeclared markers, and stale guide revisions.
The traceability metadata is not proof of semantic test quality. Agents must use
the repository `user-flow-e2e` skill to read the guide, select proportional
cross-boundary cases, author or update real tests, execute them against safe
infrastructure, and record evidence. Independent review remains required.

Guide-provided commands are descriptive and are never automatically passed to a
shell by the inspection/check tooling. Agents execute reviewed repository
commands according to the guide and applicable safety skills.

## Alternatives considered

### Generate tests mechanically from guide prose

Rejected because prose does not contain enough stable architecture, selector,
fixture, security, and assertion information to produce trustworthy tests.
Generated-looking tests could pass while proving the wrong behavior.

### Require only E2E test file paths

Rejected because a file can exist while omitting a journey or remaining stale
after a behavior change.

### Enforce updates only from Git diffs in CI

Rejected because it depends on provider/base-branch context, is unavailable in
ordinary local work, and still cannot establish semantic coverage.

### Keep the convention as prose only

Rejected because missing and stale traceability would not fail the standard
repository handoff gate.

## Consequences

### Positive

- Agents can deterministically discover which E2E tests a guide owns.
- Missing scenarios and test files fail locally in `pnpm check`.
- Test-relevant guide changes force every declared test file to acknowledge the
  current revision.
- Stable IDs support different E2E frameworks without importing app code across
  workspace boundaries.

### Negative

- Guide and test changes carry small marker/frontmatter maintenance overhead.
- Renaming scenarios intentionally touches both documentation and tests.
- Revision acknowledgement can be updated without a meaningful assertion
  change, so review and execution cannot be removed.

### Risks / limitations

- The validator proves syntactic traceability, not semantic completeness.
- E2E remains reserved for critical cross-boundary journeys; exhaustive edge
  coverage belongs at cheaper layers.
- A guide command may require local infrastructure; the agent must follow its
  documented safe startup/cleanup rather than executing editable metadata.

## Related

- [User-flow testing guides](../user-flows/README.md)
- [Development workflow](../development.md)
- [User Flow E2E Automation feature](../../.agent/features/user-flow-e2e-automation/FEATURE.md)
- [User Flow E2E Automation ExecPlan](../../.agent/features/user-flow-e2e-automation/EXEC_PLAN.md)
