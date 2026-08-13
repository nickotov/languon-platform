# Project setup

Short description of project can be found here /Users/nickkotov/projects/languon/docs/project-dev-setup.md
This is important to understand a context of what should be developed.

Developement is based on AI-first approach. That means agentic tools are used to build the system. Main agentic tool is codex cli.

What i need the first is to setup the agent environment to produce senior level code and autonomously run the development.

## Description of tech stack and initial requirements.

Main stack of app is:

- docker
- nodejs >= 24
- typescript
- pnpm (workspaces + turbopack => monorepo)
- eslint/prettier
- nextjs for web
- react-native for mobile
- postgres + redis
- mastra for ai
- langfuse + local prompts (for dev/stage environments)
- zod
- openapi
- hono

# Agentic setup

How i see general structure (here the reference):

```
repo/
│
├── AGENTS.md
│
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── explorer.toml
│       ├── reviewer.toml
│       ├── tester.toml
│       └── security-reviewer.toml
│
├── .agents/
│   └── skills/
│       ├── feature-development/
│       │   └── SKILL.md
│       │
│       ├── testing/
│       │   └── SKILL.md
│       │
│       ├── code-review/
│       │   └── SKILL.md
│       │
│       ├── browser-verification/
│       │   └── SKILL.md
│       │
│       ├── db-verification/
│       │   └── SKILL.md
│       │
│       └── user-flow-e2e/
│           ├── SKILL.md
│           └── agents/
│               └── openai.yaml
│
├── .agent/
│   ├── PLANS.md
│   │
│   └── features/
│       └── user-profile/
│           ├── FEATURE.md
│           ├── EXEC_PLAN.md
│           ├── EVIDENCE.md
│           └── REVIEW.md
│
├── apps/
├── packages/
└── ...
```

## Main agents.md file

Project agents.md file should have a project structure description, commands required to run the development environment, global constraints and agentic flow description.

We gonna have few sub-agents:

1. explorer
2. reviewer
3. tester
4. security-reviewer
5. product-owner
6. architect

Also in each workspace (like backend, web, mobile, packages) we gonna have dedicated agents.md file with workspace-specific commands and constraints.

Backend should be implemented using DDD pronciples.
Web should implement FSD pages-first approach.

Reference of content for agents.md:

```
# Engineering agent instructions

## Objective

Work autonomously from specification to verified implementation.

Do not stop after planning, implementation, or testing.

A feature is complete only when implementation, verification,
review, and required fixes are complete.

---

## Source of truth

Repository files are authoritative over conversation memory.

For feature work, always locate:

1. FEATURE.md
2. EXEC_PLAN.md if present
3. applicable AGENTS.md files
4. relevant architecture documentation

After context compaction or uncertainty about progress,
re-read these files and inspect git status/history before continuing.

Never rely on remembered task state when repository state can establish it.

---

## Complex features

For non-trivial features or significant refactors, create and maintain
an ExecPlan according to `.agent/PLANS.md`.

The ExecPlan is a living document.

Keep these sections current:

- requirements
- discovered architecture
- milestones
- progress
- decisions
- unexpected discoveries
- validation state
- remaining work

Do not ask the user to approve each milestone.

Continue until the feature satisfies its completion criteria.

---

## Autonomous execution

For feature implementation:

1. Understand the specification.
2. Explore the relevant code.
3. Create/update the ExecPlan.
4. Identify acceptance criteria.
5. Determine required automated tests.
6. Implement one coherent milestone.
7. Run targeted validation.
8. Update the ExecPlan.
9. Continue with the next milestone.
10. Run full relevant validation.
11. Perform independent code review.
12. Fix valid findings.
13. Re-run validation.
14. Record final evidence.
15. Finish only when the Definition of Done is met.

Do not wait for user confirmation between steps.

---

## Clarifications

Resolve implementation-level ambiguity autonomously.

Prefer:

1. existing project conventions
2. existing analogous implementations
3. architecture documentation
4. safest minimal behavior
5. documented assumption

Ask the user only when an unresolved question materially changes
product behavior, data integrity, security, billing, or irreversible actions.

Document autonomous assumptions in the ExecPlan.

---

## Definition of Done

Work is DONE only when:

- acceptance criteria are satisfied
- implementation is complete
- relevant unit tests pass
- relevant integration tests pass
- relevant E2E tests pass
- lint passes
- type checking passes
- build succeeds where applicable
- database migrations have been tested where applicable
- independent review has completed
- critical/high review findings are resolved
- relevant medium findings are resolved or explicitly justified
- no debugging artifacts remain
- EXEC_PLAN.md reflects final state
- EVIDENCE.md contains validation evidence

A successful compilation alone is never sufficient.

---

## Failure handling

When a test fails:

1. determine whether implementation or test is incorrect
2. inspect the failure
3. fix the root cause
4. rerun the smallest relevant test
5. rerun the appropriate broader suite

Do not delete, weaken, skip, or rewrite a legitimate test merely
to make the suite pass.

---

## Git

Before starting:

- inspect git status
- preserve unrelated user changes

Do not overwrite unrelated changes.

Create logical checkpoints for large features.

Never declare completion with unresolved merge conflicts
or unexpected working-tree changes.

---

## Subagents

Use subagents for bounded independent work.

Prefer subagents for:

- codebase exploration
- architecture investigation
- test analysis
- independent code review
- security review
- failure/log analysis

Avoid having multiple agents modify overlapping files concurrently.

The main agent owns implementation integration and final decisions.
```

Reference for agents.md for backend workspace:

```
# Backend architecture

Architecture: DDD.

Dependencies:

domain <- application <- infrastructure/interface

## Domain

Must not depend on:

- HTTP
- database implementation
- framework
- external SDKs

## Application

Coordinates use cases.

Use constructor dependency injection.

## Infrastructure

Contains:

- PostgreSQL repositories
- external APIs
- Redis adapters
- message brokers

## Validation

Validate external input at system boundaries using Zod.

## Database

Do not query PostgreSQL directly from domain/application logic.

...
```

Reference for agents.md for frontend workspace:

```
# Web architecture

Architecture: FSD.

Allowed dependency direction:

app
pages
widgets
features
entities
shared

A layer may depend only on lower layers.

...

State:
- server state: TanStack Query
- shared client state: Zustand
- local UI state: React state

...
```

## Autonomous setup

To support autonomous development, it's crucial to add feature implementation logic using based on plans.md.
PLANS.md is crucial!

Here the reference for plans.md:

```
# Execution Plan specification

An ExecPlan is the persistent execution state for a complex feature.

It must be sufficient for another agent with no previous conversation
context to continue the implementation.

## Required sections

### Goal

Describe what the completed feature does.

### Specification

Reference the corresponding FEATURE.md.

### Existing architecture

Record the relevant components discovered during exploration.

### Acceptance criteria

Convert the feature specification into verifiable outcomes.

### Milestones

Break implementation into independently verifiable milestones.

Example:

- [x] M1 Database model
- [x] M2 Repository support
- [ ] M3 API endpoint
- [ ] M4 Frontend integration
- [ ] M5 E2E verification

Each milestone should contain:

- objective
- files/components involved
- required tests
- status
- validation evidence

### Decisions

Record implementation decisions and rationale.

### Discoveries

Record important unexpected findings.

### Validation

Track:

- unit
- integration
- E2E
- typecheck
- lint
- build
- DB migration
- review

### Remaining work

Explicit list of unfinished work.

## Update policy

Update this document whenever:

- a milestone is completed
- architecture assumptions change
- a significant issue is discovered
- an implementation decision is made
- validation status changes

Never mark a milestone complete before its required verification passes.
```

## Testing rules

Test-first where it gives information

```
Bug
→ reproduce with failing test
→ fix
→ prove test passes

Domain/business logic
→ test first usually desirable

API behavior
→ contract/integration test first where practical

Complex state machine
→ test first strongly preferred
```

### General testing policy:

Prefer behavior-first tests.

For bugs, create a regression test reproducing the failure before fixing it
when reasonably possible.

For deterministic business logic, prefer test-first development.

For UI/infrastructure changes where test-first provides little value,
implementation may precede automation, but required verification must
exist before completion.

### Testing skill

Reference:

```
---
name: testing
description: Determine and implement the appropriate automated test strategy for code changes.
---

# Testing strategy

Do not maximize test count.

Choose the lowest-cost test that reliably detects the relevant regression.

## Unit tests

Use for:

- pure business logic
- parsers
- validators
- transformations
- state machines
- algorithms

Avoid mocking entire application layers.

## Integration tests

Use for:

- repository implementations
- database queries
- HTTP endpoints
- authentication boundaries
- serialization
- transaction behavior
- service integration boundaries

Prefer real infrastructure in disposable containers when practical.

## E2E

Use for critical user journeys crossing frontend/backend boundaries.

Examples:

- authentication
- purchase
- profile modification
- core creation workflow

Do not test every visual branch with E2E.

## Regression bugs

Whenever practical:

1. reproduce with failing automated test
2. confirm failure
3. implement fix
4. confirm test passes

## Mocks

Mock external systems when:

- deterministic control is required
- service cost exists
- failure scenarios must be simulated

Do not mock the component that is actually under test.

## Required output

Before implementation, determine:

- unit tests required
- integration tests required
- E2E tests required
- manual/agent verification required

Record the decision in EXEC_PLAN.md.
```

## Evidance

Reference:

```
# Verification Evidence

## Unit

Command:

pnpm test

Result:

PASS — 184 tests

Added:

- profile-name.test.ts
- update-profile.test.ts

## Integration

Command:

pnpm test:integration

Result:

PASS — 42 tests

Validated:

- profile repository persists displayName
- invalid values rejected
- transaction rollback verified

## E2E

Command:

pnpm test:e2e --grep "profile"

Result:

PASS — Chromium
PASS — WebKit

## Browser verification

Scenario:

1. authenticated
2. opened /settings/profile
3. changed display name
4. saved
5. refreshed

Observed:

updated value persisted.

## Static checks

pnpm lint
PASS

pnpm typecheck
PASS

pnpm build
PASS

## Review

Reviewer:

PASS after 2 findings were fixed.

## Remaining risks

None known.
```

## Sub agents

### Eplorere

Reference:

```
You are a codebase exploration specialist.

Investigate the requested area without modifying files.

Return:

- relevant architecture
- important files
- existing patterns
- dependencies
- edge cases
- risks
- recommended implementation boundaries

Prefer concrete file references over generic explanations.
```

### Tester

Reference:

```
inspect feature + diff
find missing scenarios
run tests
analyze failures
```

### Reviewer

Reference:

```
Review the implementation independently.

Look for:

- functional correctness
- missing acceptance criteria
- regressions
- race conditions
- error handling
- architecture violations
- insufficient tests
- security problems
- performance problems where material

Do not modify implementation.

Write findings with:

severity
location
problem
impact
suggested fix

Do not invent issues merely to produce findings.
```

### Security reviewer

auth
permissions
uploads
payments
external URLs
secrets
cryptography
user data
SQL
HTML rendering
webhooks

## Agents orchestration

```
┌─ Explorer backend ─────┐
Main orchestrator ├─ Explorer frontend ────┼─ summaries
└─ Explorer tests ───────┘
           ↓
    MAIN IMPLEMENTER
           ↓
┌────────────┴────────────┐
↓                         ↓
Reviewer                 Tester
↓                         ↓
└──────── findings ───────┘
           ↓
    MAIN IMPLEMENTER
           ↓
        verify
```

## Context-rot strategy

This deserves explicit design.

OpenAI itself describes subagents as useful for avoiding context pollution/context rot because noisy exploration, logs and test output can be kept out of the main agent's thread.

I would enforce several rules.

### Rule 1 — Don't paste enormous logs into main context

Instead:

```
tester subagent:
    run 7,000-line test suite
            ↓
    return:
      3 failures
      root causes
      relevant 40 lines
```

### Rule 2 — persistent decisions

Every material decision goes to: EXEC_PLAN.md

Example:

```
### D04 — profile update uses PATCH

Reason:

Existing API follows partial-update semantics for user resources.

Rejected:

PUT because it would require full resource representation.
```

### Rule 3 — persistent progress

```
## Progress

- [x] profile domain model
- [x] repository update
- [x] API endpoint
- [ ] frontend form
- [ ] E2E
- [ ] final review
- [ ]
```

### Rule 4 — rehydrate after uncertainty

Put this directly in AGENTS.md:

```
When uncertain about current progress or after context compaction:

1. read FEATURE.md
2. read EXEC_PLAN.md
3. inspect git status
4. inspect git diff
5. inspect relevant recent commits
6. continue from recorded remaining work

Do not reconstruct progress from memory.
```

### Rule 5 — milestone checkpoints

After each substantial milestone:

```
implementation
↓
targeted test
↓
update ExecPlan
↓
checkpoint
```

## Feture development skill

```
---
name: feature-development
description: Autonomously implement a feature specification from investigation through verified completion.
---

# Feature development

## Phase 1 — Understand

Read:

- FEATURE.md
- applicable AGENTS.md
- architecture docs
- existing ExecPlan if present

Use explorer subagents when codebase investigation can be parallelized.

## Phase 2 — Plan

Create/update EXEC_PLAN.md.

Translate acceptance criteria into:

- implementation milestones
- test requirements
- verification requirements

Do not begin implementation while critical architectural uncertainty remains.

Resolve normal implementation ambiguity autonomously.

## Phase 3 — Implement

For every milestone:

1. implement
2. run targeted tests
3. fix failures
4. update ExecPlan

Continue automatically.

## Phase 4 — Validate

Run relevant:

- unit
- integration
- E2E
- typecheck
- lint
- build

Verify applicable acceptance criteria using the real application.

Write EVIDENCE.md.

## Phase 5 — Review

Spawn independent reviewer.

Provide:

- FEATURE.md
- EXEC_PLAN.md
- git diff

Review must consider behavior, architecture, regressions and tests.

Write REVIEW.md.

## Phase 6 — Remediate

For valid findings:

1. fix
2. add/update tests if needed
3. rerun relevant checks

Repeat review if material changes were required.

## Completion

Return DONE only if Definition of Done is satisfied.

Return BLOCKED only for a genuine external blocker that cannot be
reasonably resolved autonomously.
```

### Example of autonomous state machine:

```
┌─────────────┐
│ FEATURE     │
└──────┬──────┘
       ↓
┌─────────────┐
│ EXPLORE     │
└──────┬──────┘
       ↓
┌─────────────┐
│ PLAN        │
└──────┬──────┘
       ↓
┌───────────────┐
┌────→│ IMPLEMENT     │
│     └───────┬───────┘
│             ↓
│      ┌──────────────┐
│      │ TARGET TESTS │
│      └──────┬───────┘
│             │
│         fail│
└─────────────┘
       │ pass
       ↓
more milestones?
   │       │
  yes      no
   │       ↓
   └─→ FULL TEST
           ↓
    E2E / REAL APP
           ↓
        REVIEW
           ↓
      findings?
      │       │
     yes      no
      │       ↓
      │   FINAL VERIFY
      ↓       ↓
      FIX    DONE
      │
      └────→ tests
```

## Define exactly what constitutes BLOCKED

```
## Blocking conditions

Do NOT stop for:

- file naming
- implementation details
- library usage when an existing project convention exists
- code organization choices
- ordinary refactor decisions
- test structure
- minor UI interpretation

Document reasonable assumptions and continue.

Stop only when:

- two materially different product behaviors are equally plausible
- required credential/secret is unavailable
- required external service cannot be accessed
- destructive or irreversible data operation requires authorization
- billing/security/legal semantics require user decision
- specification directly contradicts itself in a way that affects behavior
```

## What should survive compaction

```
┌─────────────────────────────────┐
│ Chat context                    │
│ EPHEMERAL                       │
│                                 │
│ immediate reasoning             │
│ current command output          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ EXEC_PLAN.md                    │
│ FEATURE MEMORY                  │
│                                 │
│ decisions                       │
│ progress                        │
│ discoveries                     │
│ remaining work                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ AGENTS.md / skills              │
│ PROCEDURAL MEMORY               │
│                                 │
│ how we code                     │
│ how we test                     │
│ how we review                   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Source + tests + git            │
│ OBJECTIVE TRUTH                 │
│                                 │
│ what actually exists            │
└─────────────────────────────────┘
```
