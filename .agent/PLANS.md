# Execution Plan specification

An ExecPlan is the current execution state for an authorized feature. It must
let an agent with no conversation history safely continue the work. Follow
[DELIVERY.md](./DELIVERY.md) for common execution and artifact ownership; link
specification, evidence, and review instead of reproducing their contents here.

## When an ExecPlan is required

Create an ExecPlan only for a feature the user explicitly requests. Features
normally span multiple modules or workspaces, change architecture or
persistence, introduce a user journey, require migration or rollout
coordination, or cannot be safely completed and verified in one small change.

Do not create an ExecPlan for work that satisfies the correction or improvement
criteria in root `AGENTS.md`. Use one `.agent/corrections/<slug>.md` document
based on `.agent/templates/CORRECTION.md`, or one
`.agent/improvements/<slug>.md` document based on
`.agent/templates/IMPROVEMENT.md`, instead. If discovery crosses a lightweight
boundary, preserve it and request explicit feature authorization before creating
an ExecPlan.

## Required sections

### Goal

Describe the observable outcome and who benefits.

### Specification

Link to `FEATURE.md`, which owns scope and acceptance text. Note only execution
constraints needed to interpret the plan.

### Existing architecture

Record relevant components, execution paths, analogous patterns, dependencies,
constraints, and accepted ADRs discovered from the repository.

### Acceptance criteria

Reference stable IDs defined in `FEATURE.md` from each milestone. Do not copy or
refine criteria independently here; update their authoritative specification
text when scope changes. For fidelity work, reference its source inventory too.

### Test strategy

State which unit, integration, contract, E2E, browser/device, migration, and
manual checks are required or not required, with rationale.

### User-flow documentation

List every `docs/user-flows/*.md` guide that the feature must create or update,
based on feature slugs and `source_paths` metadata. For a feature with no
executable browser, API, mobile, admin, CLI, or system journey, record the
concrete reason a guide is not applicable. State which documented commands and
expected results will be verified. For every current guide, list stable critical
E2E scenario IDs, exact test files, the mapped command, and how the tests will be
executed. Record a blocker rather than marking a guide current without E2E.

### Milestones

Use checkboxes and keep each milestone independently verifiable:

```md
- [x] M1 — Database model
- [x] M2 — Repository support
- [ ] M3 — API endpoint
- [ ] M4 — Frontend integration
- [ ] M5 — E2E verification
```

For each milestone, record its objective, affected components, acceptance IDs,
required checks, status, and evidence links. Never mark a milestone complete
before its required verification passes. Task completion does not automatically
trigger independent review: author preflight precedes completion review. An
early specialist review must answer a specific consequential uncertainty.

### Progress

Record timestamped completed work, current work, and the immediate next action.

### Decisions

Give each material decision a stable identifier, context, choice, rationale,
rejected alternatives, and ADR impact. Feature-local decisions remain here. If
the decision establishes a rule that future features must respect, create or
propose an ADR under `docs/adr/` according to `AGENTS.md` and link it from the
decision entry.

### Discoveries

Record unexpected behavior, constraints, failed assumptions, and their impact.

### Validation

Link the acceptance-to-evidence table and check IDs in `EVIDENCE.md` and verdict
in `REVIEW.md`. Keep only currently missing or invalidated verification here;
do not maintain a second results table. Apply `$testing` validity rules to
changed code, configuration, dependencies, and environment before reusing proof.

### Remaining work

List every unfinished item, known risk, external dependency, and blocker.

## Update policy

Update the ExecPlan whenever a milestone completes, an architecture assumption
changes, a significant issue is found, a decision is made, validation changes,
an ADR is created or superseded, or execution stops. Keep it concise and
current; Git retains obsolete detail.

## Completion policy

Complete a plan only after all acceptance criteria and relevant validation pass,
required user-flow guides match current behavior and pass
`pnpm docs:user-flows:check`, their mapped E2E scenarios/revisions are current
and executed, independent review finishes, material findings are resolved or
justified, and `EVIDENCE.md` describes the final proof. Mark work blocked only
for a genuine external dependency or decision that cannot be safely resolved
from repository context.
