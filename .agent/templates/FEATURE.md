# {{FEATURE_NAME}}

Status: Draft
Owner: Unassigned
Created: {{DATE}}

## Problem

Describe the user or system problem.

## Desired behavior

Describe the observable behavior after completion.

## Acceptance criteria

- AC-1 — Add a verifiable outcome. This file owns criterion text and stable IDs;
  `EVIDENCE.md` maps them to implementation/proof and reports completion.

## Supplied-design coverage

Required only for supplied-design fidelity; otherwise remove this section. Use
`$ui-ux-composition` fidelity mode to inventory the source independently of what
is already implemented. Before coding, record source revision, required rows,
local owners, planned verification, and initial dispositions. Add evidence IDs
and observed deviations/outcomes during implementation and rendered comparison;
never claim runtime proof at the planning stage.

| ID   | Source requirement/state | Local owner | Planned verification | Disposition/deviation | Evidence ID (after execution) |
| ---- | ------------------------ | ----------- | -------------------- | --------------------- | ----------------------------- |
| UI-1 |                          |             |                      |                       |                               |

## Scope

### In scope

- Define included behavior.

### Out of scope

- Define intentionally excluded behavior.

## Constraints and risks

- Record product, data, security, compatibility, and rollout constraints.

## User-flow documentation

- Required: Assess whether this feature has an executable browser, API, mobile,
  admin, CLI, or system journey.
- Guide: `docs/user-flows/{{FEATURE_SLUG}}.md`, or record a concrete reason why a
  guide is not applicable.
- Related guides: List every existing guide whose documented behavior may change.
- E2E synchronization: List stable critical scenarios and exact test files for
  every current guide, or keep the guide draft with a concrete blocker.

## Open decisions

- Record only decisions that materially require product or stakeholder input.
