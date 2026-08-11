# Agentic development

This guide describes how a developer works effectively with Codex in Languon:
how to state work, run the project, select verification tools, review evidence,
and continue long-running features without relying on conversation memory.

## Responsibilities

The developer owns product intent and the decisions that should not be inferred:

- the user problem and desired outcome;
- in-scope and explicitly out-of-scope behavior;
- product, legal, billing, security, and destructive-operation decisions;
- credentials and access to external systems;
- approval of strategic `Proposed` ADRs and final product judgment.

The agent owns normal in-repository execution:

- reading applicable instructions, ADRs, and existing code;
- exploring analogous behavior and identifying affected boundaries;
- maintaining the ExecPlan for non-trivial work;
- implementing, testing, running the app, and collecting evidence;
- requesting independent review and fixing valid findings;
- stopping only for a genuine blocker or a decision reserved for the developer.

Do not micromanage file-by-file implementation unless a file boundary is a real
requirement. Give Codex the outcome, constraints, and proof you need; let the
repository instructions govern ordinary engineering choices.

## Initial setup

From the repository root:

```sh
corepack enable
cp .env.example .env.local
pnpm install
pnpm dev:infra
```

Create `.env.local` only when it does not already exist. Keep real credentials
out of Git. The application uses local prompt fallbacks, so Langfuse and model
credentials are not required for deterministic local tests.

Open Codex at the repository root so the root instructions are loaded. When
`AGENTS.md`, `.codex/config.toml`, custom agents, or skills change, start a new
Codex session before relying on the new configuration.

## Running Languon

### Run everything

Start PostgreSQL and Redis, then run every application on the host:

```sh
pnpm dev:infra
pnpm dev
```

`pnpm dev` starts backend, web, admin, and the Expo development server. For a
containerized parity check, use:

```sh
pnpm dev:apps:docker
```

### Run services separately

Keep infrastructure running and use a separate terminal for each required
service:

| Service        | Command            | Default URL                     |
| -------------- | ------------------ | ------------------------------- |
| Backend        | `pnpm dev:backend` | `http://localhost:4000`         |
| Frontend / web | `pnpm dev:web`     | `http://localhost:3000`         |
| Admin          | `pnpm dev:admin`   | `http://localhost:3001`         |
| Mobile / Expo  | `pnpm dev:mobile`  | Metro normally uses port `8081` |
| PostgreSQL     | `pnpm dev:infra`   | `localhost:5432`                |
| Redis          | `pnpm dev:infra`   | `localhost:6379`                |

The `dev:*` application commands build required workspace packages before
starting the selected server. Web and admin journeys that call the API also
need the backend.

You can run these commands yourself or ask Codex to start and retain only the
services needed for a verification journey. In that prompt, name the target URL
and the behavior to verify so a running process is not mistaken for a passing
feature.

Useful backend checks:

- health: `http://localhost:4000/health`;
- OpenAPI: `http://localhost:4000/openapi.json`.

Stop local infrastructure with:

```sh
pnpm infra:down
```

This preserves local volumes. Add `--volumes` only when intentionally destroying
local PostgreSQL and Redis data.

## How to write an effective prompt

A good prompt is outcome-focused and contains the information the repository
cannot discover. Include the following when relevant:

1. **Mode** — implement, fix, diagnose only, explore only, review, or brainstorm.
2. **Outcome** — what must be observably true when the task is complete.
3. **Context** — affected user, current behavior, reproduction, or business need.
4. **Scope** — affected area and explicit non-goals.
5. **Acceptance criteria** — concrete behavior, including important failures and
   edge cases.
6. **Constraints** — compatibility, security, UX, data, rollout, or approval
   boundaries not already documented in the repository.
7. **Verification** — required tests, journeys, viewports, or evidence.
8. **References** — issue, screenshot, design, log excerpt, or relevant file.

You do not need to repeat DDD, FSD, testing, ADR, or review rules already stored
in `AGENTS.md`. Avoid enormous logs; provide the error and the smallest useful
surrounding excerpt or point Codex to the file containing it.

Use this compact template when a task needs structure:

```text
Mode: <implement | fix | diagnose only | explore only | brainstorm | review>

Goal:
<observable outcome>

Context:
<user scenario, current behavior, reproduction, or known files>

In scope:
- ...

Out of scope:
- ...

Acceptance criteria:
- ...

Constraints / approval boundaries:
- ...

Verification required:
- ...
```

Do not say only “look into this” when you expect a code change. “Diagnose” and
“explore” authorize investigation and reporting; “implement,” “fix,” or “change”
clearly authorizes in-scope repository edits and non-destructive validation.

## Prompting feature work

For a non-trivial feature, explicitly invoke `$feature-development`. Codex will
create or update `.agent/features/<slug>/`, maintain the ExecPlan, run
proportional verification, request review, remediate findings, and record
evidence. Tiny isolated changes do not need a feature workspace.

Example:

```text
Use $feature-development to implement saved vocabulary lists.

Student outcome:
A signed-in student can create a named list, add or remove vocabulary items,
and see the list after refreshing the page.

In scope:
- backend persistence and HTTP contracts;
- the student web experience;
- loading, empty, validation, and failed-request states.

Out of scope:
- list sharing;
- tutor or admin management;
- mobile UI.

Acceptance criteria:
- list names are required and limited to 80 characters;
- duplicate vocabulary items are idempotent;
- a student cannot access another student's lists;
- the primary journey works at narrow and wide web viewports.

Use existing authentication and DDD/FSD boundaries. Create the feature
workspace if missing. Add appropriate automated tests, verify the running web
journey with $browser-verification, run affected checks, perform independent
review, fix valid findings, and record evidence. Ask me only if a decision
materially changes product behavior, security, data, or an accepted ADR.
```

For an architectural choice that future features must respect, ask Codex to
assess whether the decision needs an ADR. Strategic choices should remain
`Proposed` until the developer accepts them.

## Prompting bug fixes

Give a reproducible symptom, actual behavior, expected behavior, environment,
and any useful evidence. Explicitly say whether Codex should only diagnose or
also implement the fix.

Example:

```text
Fix the vocabulary form bug in the web app.

Reproduction:
1. Open /vocabulary/new at a narrow viewport.
2. Submit a word containing only spaces.
3. The form closes and an empty item appears until refresh.

Expected:
The form stays open, shows an accessible validation message, and sends no API
request.

Use $testing to add a regression test before fixing the cause when practical.
Keep the change within the vocabulary feature. Run the web tests and typecheck,
then use $browser-verification against the running app to verify keyboard,
viewport, console, and network behavior. Record exact evidence.
```

If the failure is not understood, use a separate diagnostic prompt first:

```text
Diagnose only; do not edit files. Reproduce the failure, trace the request from
the form through the API boundary, and report the root cause with file
references, evidence, and the smallest safe fix. Separate verified facts from
inferences.
```

## Prompting exploration

Exploration should be read-only and end with concrete repository references.

```text
Explore only; do not modify files. Use the explorer subagent if helpful.

Trace how a completed AI tutor message travels from the backend to web state and
rendering. Identify entry points, contracts, persistence, Redis usage, relevant
accepted ADRs, error/reconnect behavior, and existing tests. Return a concise
execution flow, important files and symbols, verified constraints, risks, and
open questions. Do not design a replacement yet.
```

Use exploration before requesting a design when the current implementation or
architectural constraints are unclear.

## Brainstorming with the product owner

The `product-owner` subagent is read-only. Use it to shape an idea into user
outcomes and testable behavior before implementation. It should expose genuine
product decisions without inventing scope.

```text
Brainstorm only; do not implement or modify files. Use the product-owner
subagent.

Idea:
Students should receive a lightweight review session based on recent mistakes.

Known constraints:
- a session should take about five minutes;
- it must work without a tutor being online;
- avoid adding a new paid infrastructure service.

Return:
- target user and problem statement;
- primary journey and important failure/empty states;
- two or three scoped product options with tradeoffs;
- non-goals and likely edge cases;
- draft testable acceptance criteria;
- only the unresolved questions that materially change product behavior.

Check current product and architecture documentation so the options fit the
existing system. Do not choose a strategic option on my behalf.
```

After choosing an option, make the decision explicit:

```text
Proceed with option 2. Create the feature workspace `adaptive-review-session`,
write the agreed scope and acceptance criteria into FEATURE.md, and stop before
implementation so I can review the specification.
```

Then start implementation with `$feature-development` once the specification is
correct.

## MCP and verification tools

Use the lowest-cost reliable verification layer. An MCP browser session is
evidence for real user behavior; it does not replace automated regression tests.

| Need                              | Primary workflow/tool                                 |
| --------------------------------- | ----------------------------------------------------- |
| Pure logic and validation         | Vitest through `$testing`                             |
| HTTP, contracts, repositories     | Integration/contract tests through `$testing`         |
| PostgreSQL, Redis, migrations     | Disposable Docker infrastructure + `$db-verification` |
| Web/admin rendering and journeys  | Playwright MCP + `$browser-verification`              |
| Native mobile behavior            | Expo simulator/device verification                    |
| Independent implementation review | `$code-review` and risk-triggered security review     |

### Browser MCP

Use **Playwright MCP** as the preferred MCP for testing the running web and admin
applications. It is suitable for navigation, form interaction, viewport checks,
screenshots, and inspection of console and network failures. Invoke
`$browser-verification` so the agent also checks acceptance criteria, loading and
failure states, keyboard/accessibility basics, refresh behavior, and evidence.

The repository registers project-scoped Playwright and Context7 MCP servers in
`.codex/config.toml`. Project-scoped settings load only after the repository is
trusted in Codex; start a new Codex session after changing the configuration.
If Playwright MCP is unavailable or fails to start, Codex may use another
available browser or computer-use capability and must record the exact
verification gap. It must not claim browser verification passed from source
inspection alone.

Example verification prompt:

```text
Start the required local infrastructure, backend, and web services. Use
$browser-verification with Playwright MCP against http://localhost:3000.

Verify AC-1 through AC-4 for the saved vocabulary journey at 390x844 and
1440x900. Cover the happy path, empty state, validation failure, API failure,
keyboard navigation, and refresh persistence. Inspect console errors and failed
network requests. Store concise observations and useful artifact paths in the
feature EVIDENCE.md. Do not use real credentials or personal data.
```

Backend behavior normally does not need a browser MCP. Use Vitest,
integration/contract tests, the health endpoint, and the OpenAPI document. For
database work, use disposable local PostgreSQL and Redis with `$db-verification`;
never run destructive verification against shared, staging, or production data.

## Per-service validation commands

Run focused checks while iterating, then broader checks before handoff.

### Backend

```sh
pnpm --filter @languon/backend test
pnpm --filter @languon/backend typecheck
pnpm --filter @languon/backend build
```

### Frontend / web

```sh
pnpm --filter @languon/web test
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web build
```

### Admin

```sh
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
pnpm --filter @languon/admin build
```

### Full repository

```sh
pnpm check
```

User-visible web/admin changes require real-browser evidence in addition to
these commands. Database changes require disposable-infrastructure verification.

## Durable state and long-running work

Conversation context is temporary. Repository artifacts are authoritative:

- `FEATURE.md` describes requested behavior and acceptance criteria;
- `EXEC_PLAN.md` records milestones, decisions, discoveries, progress, and
  validation state;
- `docs/adr/` records durable architectural decisions and why they were made;
- `EVIDENCE.md` records commands and observed results;
- `REVIEW.md` records independent findings and their resolution;
- source, tests, and Git describe what actually exists.

Create a feature workspace manually when useful:

```sh
pnpm feature:new -- user-profile "User profile"
```

To continue after a pause or context compaction, point Codex at durable state:

```text
Continue `adaptive-review-session` from
.agent/features/adaptive-review-session/EXEC_PLAN.md. Re-read the feature,
relevant AGENTS.md files and ADRs, inspect Git state, then complete the recorded
remaining work with required verification and review. Do not redo completed
milestones whose evidence is still valid.
```

During a long run, answer genuine blocker questions and correct a misunderstood
product outcome promptly. Routine milestone approval is unnecessary. At handoff,
review the observable result, validation evidence, independent findings,
remaining risks, and any Proposed ADR that still needs a decision.
