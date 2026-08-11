# Languon engineering agent instructions

## Objective

Work autonomously from specification to verified implementation. Do not stop
after planning, implementation, or the first passing test. A feature is complete
only after implementation, proportional verification, independent review, and
required remediation are complete.

## Source of truth

Repository files are authoritative over conversation memory. For feature work,
locate and read, in order:

1. The closest applicable `AGENTS.md` files.
2. `.agent/features/<feature>/FEATURE.md`.
3. `.agent/features/<feature>/EXEC_PLAN.md`, when present.
4. Relevant accepted ADRs under `docs/adr/` and architecture documentation.
5. Analogous source implementations and tests.

After context compaction or uncertainty, reread the feature and plan, inspect
`git status` and `git diff`, inspect relevant recent commits when available, and
continue from recorded remaining work. Never reconstruct progress from memory
when repository state can establish it.

## Repository map

- `apps/backend` — Hono API and Mastra runtime; DDD rules apply.
- `apps/web` — Next.js user application; pages-first FSD rules apply.
- `apps/admin` — Next.js administration application; pages-first FSD rules apply.
- `apps/mobile` — Expo/React Native application.
- `packages/contracts` — shared Zod schemas and derived types.
- `packages/database` — PostgreSQL and Redis infrastructure factories.
- `packages/prompts` — local prompt fallbacks and Langfuse integration.
- `infra` — local and deployable infrastructure definitions.
- `docs` — product, architecture, ADRs, and operating documentation.
- `.agent` — durable feature specifications, plans, evidence, and reviews.
- `.agents/skills` — repository-scoped reusable Codex workflows.
- `.codex` — trusted-project Codex configuration and custom agents.

Do not import application source across `apps/*`. Share stable behavior through
a focused package with public exports. Document every new top-level directory in
`README.md`.

## Canonical commands

Run from the repository root unless a nested instruction says otherwise:

```sh
corepack enable                 # activate the declared pnpm version
pnpm install                    # install all workspace dependencies
pnpm dev:infra                  # start PostgreSQL and Redis
pnpm dev                        # run application development servers
pnpm dev:backend                # run only the backend and build its dependencies
pnpm dev:web                    # run only the user-facing web application
pnpm dev:admin                  # run only the administration application
pnpm lint                       # lint the repository
pnpm typecheck                  # type-check all workspaces
pnpm test                       # run all automated tests
pnpm test:coverage              # run tests with coverage
pnpm build                      # build all workspaces
pnpm check                      # run the full pre-handoff validation suite
pnpm feature:new -- slug "Name" # create durable feature artifacts
```

Prefer targeted commands while iterating, for example
`pnpm --filter @languon/backend test`. Use Docker for PostgreSQL and Redis;
application processes normally run on the host for fast feedback.

## Global engineering constraints

- Use Node.js 24, TypeScript strict mode, pnpm workspaces, and Turborepo.
- Add dependencies to the workspace that imports them. Keep shared tooling at
  the root. Do not use undocumented global tools.
- Validate untrusted input at system boundaries with Zod. Derive TypeScript
  types from schemas instead of maintaining duplicate shapes.
- Keep credentials in ignored environment files. Update `.env.example` with
  sanitized names and safe local defaults.
- Do not log secrets, tokens, raw model prompts containing user data, or
  unnecessary personal data.
- Keep external model, Langfuse, database, cache, and transport SDKs behind
  infrastructure or interface boundaries.
- Use local prompt fallbacks in tests and local development. Tests must not call
  paid or nondeterministic model services.
- Do not edit generated output, dependency directories, caches, native build
  output, or lockfile content by hand.
- Keep changes focused. Preserve unrelated user work and avoid opportunistic
  refactors outside the feature boundary.

## Architecture Decision Records

Architecture Decision Records (ADRs) live under `docs/adr/`. Architecture
documentation describes what the system does and how it is structured; ADRs
record why a durable technical choice was made. The active feature's ExecPlan
records decisions that are local to that feature.

Before planning or changing architecture, scan `docs/adr/README.md` and search
ADR titles and content for relevant terms. Read only the relevant records and
any ADRs they supersede; do not load every ADR by default.

- Treat `Accepted` ADRs as active architectural constraints.
- Treat `Proposed` ADRs as pending decisions, not binding architecture.
- Treat `Rejected`, `Deprecated`, and `Superseded` ADRs as historical context,
  not current guidance.
- If an instruction or requested change conflicts with an accepted ADR, surface
  the conflict and follow the lifecycle below rather than silently diverging.

Create or propose an ADR when a decision affects multiple features, components,
or boundaries; is costly to reverse; establishes a project-wide rule; has
meaningful alternatives or non-obvious tradeoffs; or materially affects
security, persistence, APIs, infrastructure, scaling, or deployment. Keep local
implementation choices in `EXEC_PLAN.md`. If future features must respect a
feature decision, promote it to an ADR.

Use the next unused zero-padded number, a kebab-case filename, and
`docs/adr/template.md`. Add every ADR to `docs/adr/README.md`. An agent may mark
an ADR `Accepted` without user approval only when the choice is necessary to the
requested work, follows established architecture, and does not introduce a
strategic product, security, data, infrastructure, or cost commitment. Otherwise
create it as `Proposed` and obtain the user's decision before treating it as
binding. Database or framework replacement, authentication strategy, public API
strategy, deployment model, and irreversible migration decisions are always
strategic.

Accepted ADRs are historical records. Fixing typos, formatting, and broken links
is allowed. Apart from status and relationship metadata needed for supersession,
do not silently rewrite their context, decision, alternatives, or consequences.
To change an accepted decision:

1. Create a new ADR that references and supersedes the old record.
2. Mark the old record `Superseded by ADR-NNNN` and link the new record.
3. Update the ADR index and current architecture documentation.
4. Record migration and rollout work in the active ExecPlan.

## Complex features and ExecPlans

For non-trivial work or significant refactors, create and maintain an ExecPlan
according to `.agent/PLANS.md`. Generate the feature directory with
`pnpm feature:new` when it does not exist.

Treat the ExecPlan as living execution state. Keep requirements, discovered
architecture, acceptance criteria, test strategy, milestones, progress,
decisions, discoveries, validation, and remaining work current. Document
reasonable autonomous assumptions there.

Do not ask the user to approve ordinary milestones. Continue until the feature
satisfies the Definition of Done or meets a genuine blocking condition.

## Autonomous feature flow

1. Understand the specification, applicable instructions, and relevant ADRs.
2. Explore relevant execution paths and analogous implementations.
3. Create or update the ExecPlan.
4. Convert acceptance criteria into verifiable outcomes.
5. Decide required unit, integration, contract, E2E, browser/device, migration,
   and security verification.
6. Implement one coherent milestone.
7. Run the narrowest relevant validation and fix root causes.
8. Update the ExecPlan and evidence; create or update an ADR when a decision
   crosses the ADR threshold.
9. Repeat implementation and targeted validation for remaining milestones.
10. Run the full relevant validation suite.
11. Verify user-visible behavior in the real app when applicable.
12. Perform independent code review and risk-triggered security review.
13. Fix valid findings and rerun affected checks.
14. Record final evidence and remaining risks.
15. Finish only when the Definition of Done is satisfied.

## Clarifications and blocking conditions

Resolve implementation-level ambiguity using, in order: accepted ADRs, existing
conventions, analogous implementations, architecture documentation, the safest
minimal behavior, and a documented assumption.

Do not stop for naming, ordinary library use, code organization, test layout,
normal refactor choices, or minor UI interpretation. Ask only when an unresolved
choice materially changes product behavior, data integrity, security, billing,
legal semantics, credentials, or an irreversible operation.

Mark work blocked only when a required secret or external service is unavailable,
a destructive operation needs authorization, two materially different product
behaviors remain equally plausible, or the specification contradicts itself in
a behavior-affecting way. Record the exact blocker and all completed work.

## Testing policy

Prefer behavior-first tests and the lowest-cost test that reliably catches the
regression.

- Bugs: reproduce with a failing test when reasonably possible, fix the cause,
  and prove the test passes.
- Deterministic domain logic, parsers, validators, transformations, and state
  machines: prefer unit tests and test-first development.
- Repositories, SQL, HTTP, authentication, serialization, transactions, and
  service boundaries: prefer integration or contract tests with disposable real
  infrastructure when practical.
- Critical journeys crossing application boundaries: use E2E tests.
- UI and infrastructure changes may be implemented before automation when
  test-first adds little information, but must have relevant verification before
  completion.

Mock external systems only for deterministic control, cost avoidance, or failure
simulation. Do not mock the component under test or entire internal layers.
Never delete, weaken, skip, or rewrite a legitimate test merely to obtain a pass.

## Failure handling

When a command or test fails:

1. Inspect the actual error and determine whether code, test, environment, or
   assumptions are wrong.
2. Fix the root cause.
3. Rerun the smallest reproducing check.
4. Rerun the appropriate broader suite.
5. Record material discoveries and validation changes in the ExecPlan.

Do not silently fall back to a weaker verification path.

## Subagents

Use subagents for bounded independent work that benefits from isolated context.
Avoid concurrent edits to overlapping files. The main agent owns implementation,
integration, product decisions, and final conclusions.

- `explorer`: read-only architecture, ADR, and execution-path investigation.
- `architect`: read-only evaluation of boundaries, ADR compliance, and material
  design choices.
- `product-owner`: specification and acceptance-criteria audit; no invented scope.
- `tester`: test selection, execution, and focused failure analysis.
- `reviewer`: independent correctness, regression, architecture/ADR, and test
  review.
- `security-reviewer`: threat-focused review for risk-triggering changes.

Keep noisy exploration and long logs out of the main context. Ask subagents for
file references, root causes, relevant excerpts, and actionable conclusions.
Run reviewer and tester after implementation; run security review for auth,
authorization, uploads, payments, external URLs, secrets, cryptography, personal
data, SQL, HTML rendering, model tool execution, and webhooks.

## Definition of Done

Work is done only when:

- Acceptance criteria are satisfied and implementation is complete.
- Relevant unit, integration, contract, E2E, and real-app checks pass.
- Lint, typecheck, and builds pass for affected workspaces.
- Database migrations and invariants are verified when applicable.
- Independent review completed and critical/high findings are resolved.
- Relevant medium findings are resolved or explicitly justified.
- Security review completed when triggered and material findings are resolved.
- Relevant accepted ADRs remain satisfied, and any new or superseding
  architectural decision is recorded and indexed.
- No debugging artifacts, secrets, generated output, or accidental scope changes
  remain.
- `EXEC_PLAN.md`, `EVIDENCE.md`, and `REVIEW.md` reflect the final state.
- Remaining risks are explicit.

A successful compilation alone is never sufficient.

## Git and review hygiene

Inspect `git status` before work and before handoff. Preserve unrelated changes,
do not overwrite user work, and never leave conflicts unresolved. Do not create
commits unless the user or current workflow explicitly requests them. If commits
are requested, use focused imperative subjects and avoid mixing refactors with
functional changes.

Review findings must include severity, location, problem, impact, and suggested
fix. Prioritize functional correctness, missing requirements, regressions, race
conditions, error handling, architecture violations, security, performance when
material, and missing tests. Do not invent issues to populate a review.
