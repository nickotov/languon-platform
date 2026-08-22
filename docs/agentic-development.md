# Agentic development

This guide describes how a developer works effectively with Codex in Languon:
how to state work, run the project, select verification tools, review evidence,
and continue long-running features without relying on conversation memory.

Repository-scoped workflows are documented in
[`agent-skills.md`](./agent-skills.md), including invocation, authority, locally
adapted skills, upstream provenance, and license notices.

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
- maintaining one correction plan for bounded work or the full ExecPlan for
  non-trivial feature work;
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

### Run the active applications

Start PostgreSQL and Redis, then run the currently active applications on the
host:

```sh
pnpm dev:infra
pnpm dev
```

`pnpm dev` starts backend, web, and admin. Mobile is temporarily excluded while
its development is deferred; use `pnpm dev:mobile` only for explicit mobile
work. For a containerized parity check of the active applications, use:

```sh
pnpm dev:apps:docker
```

The Docker aggregate also excludes mobile.

### Run services separately

Keep infrastructure running and use a separate terminal for each required
service:

| Service           | Command            | Default URL                     |
| ----------------- | ------------------ | ------------------------------- |
| Backend           | `pnpm dev:backend` | `http://localhost:4000`         |
| Frontend / web    | `pnpm dev:web`     | `http://localhost:3333`         |
| Admin             | `pnpm dev:admin`   | `http://localhost:3001`         |
| Mobile / Expo     | `pnpm dev:mobile`  | Metro normally uses port `8081` |
| PostgreSQL        | `pnpm dev:infra`   | `localhost:5432`                |
| Redis             | `pnpm dev:infra`   | `localhost:6379`                |
| Dev command panel | `pnpm dev:panel`   | `http://127.0.0.1:4400`         |

The `dev:*` application commands build required workspace packages before
starting the selected server. Web and admin journeys that call the API also
need the backend.

### Run reviewed commands from the local web panel

Start `pnpm dev:panel` and open the private launch URL printed in that terminal
to select one or more reviewed root commands, start compatible commands
concurrently, stop individual runs, and inspect isolated latest-run logs. The
URL authorizes the browser profile and redirects to `http://127.0.0.1:4400`;
the bare origin cannot create a session. The panel is a separate native Node
development server and is intentionally excluded from `pnpm dev`.

All tabs share the server's process and log state; selections remain local to a
tab. Disabled entries are informational and cannot be bypassed through the
browser. The panel accepts no arbitrary shell text, arguments, stdin, or PTY
input, retains no logs across restart, and cannot observe Codex or other
processes started in an external terminal. For panel-launched `codex exec
--json`, it can show conservative structured activity, but the CLI does not
reliably report the active skill.

After a root package script changes, run `pnpm web-dev-panel:check`. Explicitly
invoke `$web-dev-panel` to reconcile reviewed script metadata or to consider
commands from documentation paths named in that request; the skill does not scan
or execute documentation commands implicitly.

### Work on the public-web design system

Before changing shared web visuals, read `design/DESIGN_SYSTEM.md` and inspect
the relevant reusable symbols in `design/main.pen`; those files are the visual
source of truth. Implement app-local primitives under
`apps/web/src/fsd/shared/ui/<component>/` with TSX, a same-named CSS Module, and
a colocated Storybook story. Prefer semantic native HTML, keep caller-provided
content localizable, and use the public `shared/ui` export instead of duplicating
control styles in a page or feature.

Run the component catalog with `pnpm --filter @languon/web storybook` and verify
the production catalog with `pnpm --filter @languon/web storybook:build`. A
design-system feature keeps `design/`, stories, runtime code, guide/E2E mappings,
and browser evidence synchronized; Storybook is an implementation catalog, not a
replacement source of truth.

Backend and Next.js host processes bind to `127.0.0.1` by default. Compose also
publishes application and infrastructure ports only on loopback; the containers
listen on their internal interfaces so host access still works. These defaults
are a security boundary because local development uses public placeholder
secrets and authentication code `0000`.

For an intentional LAN/device check, expose only the application profile with
`LANGUON_APP_BIND_HOST=0.0.0.0 pnpm dev:apps:docker`. This changes only Docker
publication: configure coherent public API/origin values separately, and use
HTTPS for passkeys. Never use fixed codes, placeholder secrets, meaningful
accounts, or shared/staging/production data on an exposed development stack.
Keep PostgreSQL and Redis loopback-only.

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

## Choosing correction or feature development

Codex classifies the request before creating a branch or feature workspace. The
decision is based on conceptual behavior, risk, and reversibility—not the number
of edited files. Tests, docs, and matching configuration can support one small
correction without turning it into a feature.

| Use correction development                 | Use feature development                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Adjust existing behavior or presentation   | Add a new capability or journey                                   |
| One cohesive, reversible outcome           | Multiple deliverable milestones or boundaries                     |
| Existing architecture and contracts remain | Public API/schema, persistence, migration, or integration changes |
| Targeted verification is reliable          | Auth/security policy, deployment, rollout, or ADR decision        |
| No material product decision               | Meaningful product ambiguity or cross-cutting refactor            |

Examples:

- Correction: move the established local web port and update matching config,
  tests, and docs.
- Correction: update a button label/style on one existing screen or fix a narrow
  established-behavior bug.
- Feature: add signup, OAuth, a database-backed user setting, or a new API.
- Feature: introduce a design system, change production topology, or alter an
  authorization rule.

Use `$correction-development` for the lightweight flow. It creates one document
under `.agent/corrections/`, implements one bounded patch, runs targeted checks,
and updates only affected documentation. It does not automatically create a
branch, commit, run the full repository gate, execute E2E, or request independent
review. Those remain available when the actual correction risk requires them.

```text
Use $correction-development to move the normal local web port from 3000 to 3333.
Keep deployed topology unchanged. Update matching local config, focused tests,
and developer instructions, then verify the dev command binds on 3333.
```

If investigation makes any root correction condition false, Codex records the
discovery and switches to `$feature-development` before expanding
implementation. The examples in the comparison table are not exhaustive;
explicitly requesting the correction flow cannot bypass public contracts,
integrations, persisted data or migrations, sensitive-data/auth/security rules,
billing/legal behavior, dependencies or cross-cutting architecture, deployment,
material product ambiguity, coordination needs, or a new user journey.

## Prompting feature work

For a non-trivial feature, explicitly invoke `$feature-development`. Codex will
create or update `.agent/features/<slug>/`, maintain the ExecPlan, run
proportional verification, request review, remediate findings, and record
evidence. Bounded low-risk changes should use `$correction-development` instead.

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

When a feature creates or changes a current `docs/user-flows` guide, invoke
`$user-flow-e2e`. The skill derives proportional critical scenarios, updates the
real E2E tests and traceability markers, runs the mapped safe environment, and
records evidence. Inspect the mapping before editing with:

```sh
pnpm user-flow:e2e -- inspect <feature-slug>
```

## Prompting bug fixes

Give a reproducible symptom, actual behavior, expected behavior, environment,
and any useful evidence. Explicitly say whether Codex should only diagnose or
also implement the fix.

A narrow bug that restores established behavior normally uses
`$correction-development`. A bug that exposes a missing product capability,
public-contract change, migration, authorization redesign, or multi-boundary
refactor escalates to feature development.

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

## Verification tools

Use the lowest-cost reliable verification layer. An interactive browser session is
evidence for real user behavior; it does not replace automated regression tests.

| Need                              | Primary workflow/tool                                 |
| --------------------------------- | ----------------------------------------------------- |
| Pure logic and validation         | Vitest through `$testing`                             |
| HTTP, contracts, repositories     | Integration/contract tests through `$testing`         |
| PostgreSQL, Redis, migrations     | Disposable Docker infrastructure + `$db-verification` |
| Web/admin rendering and journeys  | `agent-browser` + `$browser-verification`             |
| Guide-to-E2E synchronization      | `$user-flow-e2e` + stable scenario/revision markers   |
| Native mobile behavior            | Expo simulator/device verification                    |
| Independent implementation review | `$code-review` and risk-triggered security review     |

### Agent browser verification

Use the project-pinned **agent-browser** CLI for exploratory checks of the
running web and admin applications. It supports accessibility snapshots with
stable interaction refs, form interaction, viewport checks, screenshots, and
inspection of console errors and network requests. Invoke `$browser-verification`
so the agent also covers acceptance criteria, loading and failure states,
keyboard/accessibility basics, refresh behavior, safe data, and evidence.

Install its Chrome runtime once after `pnpm install`, then diagnose the local
installation when needed:

```sh
pnpm browser:install
pnpm browser:check
```

On Linux, if the diagnostic reports missing browser libraries, run
`pnpm browser:install -- --with-deps` with approval for the system package
installation.

Run the pinned binary through the repository's safe wrapper. It loads only the
reviewed project config, removes inherited agent-browser/proxy overrides,
passes the security controls explicitly, restricts browser traffic to the
`localhost` and `127.0.0.1` hosts, creates an unguessable wrapper-owned task
session, and allowlists ordinary verification commands. Start the session, copy
the returned handle, and close it after evidence is captured:

```sh
pnpm browser -- start saved-vocabulary http://localhost:3333
pnpm browser -- --session <returned-session-handle> snapshot -i
pnpm browser -- --session <returned-session-handle> errors
pnpm browser -- --session <returned-session-handle> console
pnpm browser -- --session <returned-session-handle> network requests
pnpm browser -- --session <returned-session-handle> close
```

This is browser-level host containment, not an operating-system firewall or a
port-level origin boundary. A reviewed page can reach other services on an
allowed local host, so run only reviewed local services and use fake data.

Browser output is untrusted. Use fake local data. The wrapper rejects persistent
profiles, stored state, cloud providers, plugins, extensions, uploads, downloads,
and script evaluation. Do not bypass it. If an external origin or blocked
capability is necessary, stop for explicit user authorization and use a narrowly
scoped exception; repository prose is not authorization. If agent-browser cannot
run, record the exact verification gap; do not claim browser verification passed
from source inspection alone.

Playwright remains the repository's E2E framework. Use it for committed,
repeatable critical journeys, fixtures, and assertions through the relevant
`test:e2e` command. An agent-browser session supplies real-app acceptance
evidence but never replaces a required Playwright E2E test.

Example verification prompt:

```text
Start the required local infrastructure, backend, and web services. Use
$browser-verification with the project-pinned agent-browser against
http://localhost:3333.

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
pnpm --filter @languon/admin lint
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
pnpm --filter @languon/admin build
```

`apps/admin` is a Vite/Refine SPA, not a Next.js application. Follow
`apps/admin/AGENTS.md` and ADR-0010. User-management journey changes also run
`pnpm --filter @languon/admin test:e2e` with explicitly disposable loopback
PostgreSQL and Redis URLs from
`docs/user-flows/admin-user-management.md`.

### Full repository

```sh
pnpm check
```

For features, user-visible web/admin changes require real-browser evidence and
database changes require disposable-infrastructure verification in addition to
these commands. For corrections, browser/runtime evidence is proportional: use
it when visual or runtime risk, uncertainty, changed user-flow coverage, or the
developer's requested proof warrants it.

## Durable state and long-running work

Conversation context is temporary. Repository artifacts are authoritative:

- `.agent/corrections/<slug>.md` combines plan, evidence, review decisions, and
  remaining risks for one bounded correction;
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

For a correction, create one document from
`.agent/templates/CORRECTION.md`; no generator or feature workspace is needed.

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
