# Execution Plan specification

An ExecPlan records an authorized feature's current execution state so an agent
without conversation history can safely resume. Follow [DELIVERY.md](./DELIVERY.md)
for common execution and artifact ownership; link specification, evidence and
review instead of duplicating them.

## When an ExecPlan is required

Create an ExecPlan only for explicitly requested features. These normally span
modules/workspaces, change architecture/persistence, introduce journeys, need
migration/rollout coordination, or exceed one safely implemented and verified
small change.

For corrections/improvements under root `AGENTS.md`, use one
`.agent/corrections/<slug>.md` from `.agent/templates/CORRECTION.md`, or
`.agent/improvements/<slug>.md` from `.agent/templates/IMPROVEMENT.md` instead.
If discovery exceeds lightweight boundaries, preserve it and obtain explicit
feature authorization before creating an ExecPlan.

## Required sections

### Goal

Describe the observable outcome and beneficiaries.

### Specification

Link `FEATURE.md`, the authority for scope and acceptance text. Add only
execution constraints needed to interpret this plan.

### Existing architecture

Record relevant repository components, execution paths, analogous patterns,
dependencies, constraints and accepted ADRs. For consequential uncertainty,
record affected readers/writers, transitive consumers, invariants, unresolved
assumptions and the first small proof before dependent implementation.

### Acceptance criteria

Each milestone references stable `FEATURE.md` IDs; fidelity work also references
its source inventory. Change criteria only in their authoritative specification
when scope changes; do not copy or independently refine them here.

### Test strategy

Specify which unit, integration, contract, E2E, browser/device, migration and
manual checks are required or not, with rationale. Distinguish narrow development
selections, early risky-seam proofs, setup prerequisites and deferred final gates.
Link shared delivery readiness checks without copying them.

### User-flow documentation

List all guides to create/update under `docs/user-flows/*.md`, using feature
slugs and `source_paths`. If no executable browser, API, mobile, admin, CLI or
system journey exists, record why no guide applies. Identify documented commands
and expected results to verify. Each current guide needs stable critical E2E
scenario IDs, exact test files, mapped command and execution method; record a
blocker instead of marking it current without E2E.

### Milestones

Use checkboxes for independently verifiable milestones:

```md
- [x] M1 — Database model
- [x] M2 — Repository support
- [ ] M3 — API endpoint
- [ ] M4 — Frontend integration
- [ ] M5 — E2E verification
```

Record each objective, affected components, acceptance IDs, required checks,
status and evidence links. Completion requires passing required verification.
Task completion does not automatically trigger independent review: focused author
preflight precedes source review. Final gates may remain pending during source
review; final approval and milestone completion require all required evidence.
Early specialist reviews must answer a specific consequential uncertainty.

### Progress

Timestamp completed/current work and the immediate next action.

### Decisions

Give each material decision a stable ID, context, choice, rationale, rejected
alternatives and ADR impact. Keep feature-local decisions here. For rules binding
future features, create/propose an ADR under `docs/adr/` per `AGENTS.md` and link it.

### Discoveries

Record unexpected behavior, constraints, failed assumptions and their impact.

### Validation

Link `EVIDENCE.md`'s acceptance-to-evidence table and check IDs, and `REVIEW.md`'s
verdict. Record only missing/invalidated verification here, not another results
table. Before reusing proof, apply `$testing` validity rules to changed code,
configuration, dependencies and environment.

### Remaining work

List every unfinished item, known risk, external dependency and blocker.

## Update policy

Update on milestone completion, changed architecture assumptions or validation,
significant issues, decisions, ADR creation/supersession and execution stops.
Keep the plan concise and current; Git retains obsolete detail.

## Completion policy

Completion requires passing all acceptance criteria and relevant validation, required guides
matching current behavior and passing `pnpm docs:user-flows:check`, current and
executed mapped E2E scenarios/revisions, finished independent review, resolved or
justified material findings, and final proof in `EVIDENCE.md`. Block only on genuine
external dependencies or decisions that repository context cannot safely resolve.
