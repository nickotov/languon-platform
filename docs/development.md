---
type: reference
title: Development guide
---

# Development

## Environment

Use Node.js 24 and the Corepack-managed pnpm version declared in
`package.json`. Copy `.env.example` to `.env.local`; never commit the resulting
file or real credentials.

Backend configuration is exported through `apps/backend/src/config/environment.ts`.
It exposes separate API, worker, migration, audio/storage and playground loaders;
imports do not read the environment or require another process's secrets. Load
configuration at startup and inject the validated values into runtime services.
Schema defaults produce a warning naming absent settings. Required or invalid
settings fail validation with an error naming the affected keys; values and
credentials are never included in these diagnostics. Intentionally optional
settings without a fallback stay quiet. Conditional requirements still fail when
the corresponding capability is enabled.

`SENTENCE_AI_TIMEOUT_MS` controls sentence generation and checking;
`TEXT_AI_TIMEOUT_MS` controls text detection and translation. Both accept integer
milliseconds from 1000 through 180000. Omitted or empty values warn and use
180000 ms. Explicit invalid values fail worker startup instead of silently
falling back. Set them in `.env.local` and restart the dictionary worker (or
`pnpm dev:all`) to apply changes. Existing jobs already running retain their
current deadline. No model limits, credit budgets or retry policies are changed.

Start infrastructure separately from application processes:

```sh
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

To run applications in separate terminals, start infrastructure, apply pending
migrations once, and then run only the services needed for the journey:

```sh
pnpm dev:backend
pnpm dev:web
pnpm dev:admin
pnpm dev:mobile
```

The aggregate `pnpm dev` command temporarily excludes mobile while that
application's development is deferred. Use `pnpm dev:mobile` only when working
on the mobile surface. The Docker aggregate follows the same boundary.

The default development verification and recovery code is `0000`. It is
accepted only in development/test, or in private staging with the explicit
unsafe acknowledgement documented in `.env.example`; production rejects it.

Keep `AUTH_TRUST_PROXY=false` unless the backend is reachable only through
known reverse proxies. When it is enabled, set `AUTH_TRUSTED_PROXY_CIDRS` to
the exact addresses or CIDRs of proxies that can connect directly to the
backend, and configure ingress to overwrite its forwarding headers. The API
ignores forwarding headers received from every other peer.

The individual commands build their workspace dependencies before starting the
selected development server.

### AI provider and model onboarding

Use [`$ai-provider-model-onboarding`](../.agents/skills/ai-provider-model-onboarding/SKILL.md)
when researching or adding a real AI provider/model, or preparing an authorized
default switch. It verifies the exact provider route, current official billing
rules and execution capabilities, then chooses bounded defaults from the existing
application policies and documented model limits. It asks only unresolved material
questions, such as which flows to support, processing restrictions or whether to
switch the current default. Existing per-flow customer tariffs remain independent
of provider USD prices.

Research without changing configuration:

```text
$ai-provider-model-onboarding Research whether <provider>/<exact-model-id> is real
and suitable for sentence generation. Verify official pricing, structured output,
streaming and processing constraints. Report compatible defaults and missing facts;
do not implement or change the current route.
```

Authorize implementation with a prepared configuration:

```text
$ai-provider-model-onboarding Create a feature to add <provider>/<exact-model-id>
for sentence generation and checking, with current official pricing and bounded
defaults. Implement and verify the integration, but keep the current default.
Ask me about material choices that existing configuration cannot resolve.
```

Request a switch as part of the same authorized feature:

```text
$ai-provider-model-onboarding Create a feature to add <provider>/<exact-model-id>
and switch the sentence-generation default after its required checks pass.
Preserve the current customer tariff and other flow routes. Ask for any missing
processing constraints, credentials or bounded live-check spending authority.
```

Replace the placeholders with the provider selling access and its exact model ID.
The agent researches official catalogs/docs rather than assuming an alias exists.
For speech, onboarding uses
[`$speech-model-configuration`](../.agents/skills/speech-model-configuration/SKILL.md)
for language/voice mappings and retained profiles. Review the
[price verification and actualization guide](./user-flows/model-price-actualization.md)
for current MCP methods and action permissions. Model-price verification reads
metadata; it does not run a paid generation check. When the work needs a live
probe, supply a finite spending authorization through the existing controls.

The skill prepares source, pricing and configuration changes through reviewed
application seams; it does not add arbitrary endpoints to learner requests or
reinterpret already admitted jobs. Restart the relevant backend/worker processes
after configuration changes and reconnect MCP clients when the listener or token
action snapshot changes. Restart the coding-agent session after adding/updating
skills so their discovery metadata reloads.

### Mastra development harness

Run Mastra Server and Studio independently from the product applications:

```sh
pnpm dev:mastra
```

This command builds required workspace packages, starts and waits for local
PostgreSQL, provisions the explicitly configured
`languon_mastra_playground*` database, applies canonical migrations, seeds the
stable synthetic `mastra-playground@example.test` principal through the users
unit-of-work, watches checked-in prompts, and binds Studio to
`http://127.0.0.1:4111`. It does not start Hono, web, admin, mobile, or Redis.

The harness forces Studio to derive its API URL from the page origin. Opening a
working `http://localhost:4111` alias therefore stays same-origin instead of
mixing `localhost` with `127.0.0.1`; `http://127.0.0.1:4111` remains canonical
because some systems resolve `localhost` to unbound IPv6 `::1`. It also disables
Studio's agent thread-signaling mode because persistent Mastra memory is not
enabled; chat uses the harness's bounded, normalized agent stream route.

`MASTRA_PLAYGROUND_DATABASE_URL` and
`MASTRA_PLAYGROUND_ADMIN_DATABASE_URL` are mandatory, independent of
`DATABASE_URL`, and accepted only when they identify the same loopback
PostgreSQL authority, the `postgres` admin database, and a safely prefixed
target. Normal startup is non-destructive and preserves playground writes.

The canonical CLI entry lives at `apps/backend/src/mastra/index.ts`, and its
registry factory lives at `apps/backend/src/mastra/composition.ts`. Product
agents, tools, workflows, processors, and scorers remain in their owning backend
module infrastructure and are registered through that factory. Permanent
verification primitives appear only when `MASTRA_DEV_HARNESS=true`; the Hono
server imports the same production composition without exposing generic Mastra
routes.

The contextual language tutor is registered through the canonical composition
only with an operation-bound model, tools, identity and memory store. It is
intentionally excluded from the default Studio runtime: learner source access
and billing cannot be established by caller-selected Studio fields. Deterministic
integration tests exercise the same factory with synthetic source/accounting
ports; no learner execution route is added to Studio.

The knowledge block field-check and exercise-evaluation specialists are defined
in the Knowledge module and composed into the canonical registry through the
Texts job composition. They run only for authenticated durable knowledge actions,
with pinned source access, an admitted budget, cancellation and fenced settlement.
They are intentionally absent from default Studio: a caller-selected Studio field
cannot establish a note grant, private learner attempt or billing authority. The
registry unit test and production worker/SDK integration tests exercise this same
composition with synthetic data; no additional Studio execution route is enabled.

#### Registering Mastra primitives

Mastra Studio does not scan the repository for new files. A new agent, tool,
workflow, processor, or scorer becomes available only after it is connected to
the canonical composition. Use this checklist whenever one is added or
materially changed:

1. Define the primitive in the infrastructure layer of the module that owns the
   behavior. Keep business decisions in domain/application code and reach them
   through ports rather than querying a database from a tool.
2. Export the primitive from a focused module composition factory. Reuse this
   factory from production and development wiring; do not create a second copy
   for Studio.
3. Add the returned primitive to the appropriate `agents`, `tools`,
   `workflows`, `processors`, or `scorers` map in
   `apps/backend/src/mastra/composition.ts`. Register a tool in the canonical
   `tools` map when it should be independently runnable, and attach it to each
   registered agent that may invoke it.
4. Decide explicitly whether the primitive is production-capable,
   development-only, or shared. Keep fixtures and verification-only primitives
   behind `MASTRA_DEV_HARNESS`; do not hide a real product primitive behind that
   flag merely to make it visible in Studio.
5. For Studio execution, update
   `apps/backend/src/mastra/development-server-policy.ts` with only the exact
   primitive ID, mutation route, validated body, and bounded execution controls
   it requires. Add focused policy regressions. Never enable a prefix-wide
   mutation, caller-selected model/prompt/tool override, or generic model proxy
   as a shortcut.
6. Give development wiring isolated playground adapters and synthetic fixture
   data. For production requests, authenticate at the Hono interface boundary,
   derive the real user ID from verified claims, and create Mastra request
   context server-side. A user ID supplied by Studio, a browser body, or model
   output is selection input and must never be treated as authentication.
7. Run focused composition, schema, credential-gating, and HTTP-policy tests.
   Start `pnpm dev:mastra`, confirm the primitive appears under its stable ID,
   and exercise a deterministic path with the documented synthetic context.
   Update the Mastra user-flow guide and its mapped evidence when commands,
   expected results, failure behavior, or the visible journey changes.

Registration in the canonical composition makes the primitive available to
Studio on reload or hot reload; no Studio-specific implementation is needed.
Work is incomplete if an intended playground primitive merely compiles but is
missing from Studio or is blocked by the exact-route development policy.

Studio provides `synthetic-principal` request-context presets. Context selects
the allowlisted fixture but is not authentication proof: the development
application service authorizes the stable ID and resolves the active verified
row through the product users repository. Tool/workflow inputs and outputs are
Zod validated and cancellation is preserved.

Checked-in local prompts are the only default resolver. Neither Langfuse nor a
model key is required to boot or run the deterministic tool, workflow, and code
scorer. The live agent defaults to `deepseek/deepseek-flash`. When
`MASTRA_MODEL_ID` selects another valid Mastra `provider/model`, that model is
the primary and DeepSeek Flash remains the fixed fallback. Live invocation is
explicit and fails with a sanitized error when `DEEPSEEK_API_KEY` is absent so
the fallback is never silently unavailable; an alternate primary also requires
its provider-specific environment key. The harness forces Mastra usage
telemetry off, pins the fallback to DeepSeek's HTTPS API origin, rejects
`*_BASE_URL` overrides for the active providers, and suppresses provider error
payloads from harness logs. Its generated server accepts only the documented
loopback Host and Origin values (including internal refresh/restart hooks),
rejects caller overrides for the configured model list, prompt, provider
settings, and tools, rejects per-request processor replacement, limits agent
requests and concurrent execution, and does not expose the generic Responses
or Conversations model proxies. Persistent Mastra memory, workflow state,
datasets, experiments, traces, and scorer history remain deferred.

Stop the harness with `Ctrl+C`. To intentionally discard only playground data,
set `MASTRA_PLAYGROUND_RESET_CONFIRM` to the exact validated target name and
run:

```sh
pnpm mastra:playground:reset
```

The reset command refuses missing/mismatched confirmation and any unsafe target,
then recreates the playground from migrations and synthetic fixtures. Full
startup, Studio/API checks, side-effect boundaries, and disposable database
verification are documented in the
[Mastra harness user flow](./user-flows/mastra-agent-development-harness.md).

Stop the containers with `pnpm infra:down`. Add `--volumes` manually only when
you intentionally want to destroy local database and Redis data.

## Validation

During implementation, run the narrowest relevant workspace command. Before
handoff, run:

```sh
pnpm check
```

Database changes also require migration-forward, migration-backward when a safe
down migration exists, and integration verification against a disposable
PostgreSQL instance. When a safe inverse does not exist, record the forward-fix
and compatible deployment position instead of inventing a destructive rollback.
User-visible changes require browser or device evidence in the active feature's
`EVIDENCE.md`.

Completed executable features also require a current start-to-result guide under
[`docs/user-flows/`](./user-flows/README.md). Before changing related behavior,
match the feature slug and changed paths against guide frontmatter. After
updating a guide, verify its commands and expected results against current source
and run:

```sh
pnpm docs:user-flows:check
```

Current guides also map their critical scenarios to executable E2E files. Use
the repository `user-flow-e2e` skill when guide behavior changes, then inspect
and validate the mapping:

```sh
pnpm user-flow:e2e -- inspect <feature-slug>
pnpm user-flow:e2e -- check <feature-slug>
```

Run the mapped guide environment/command and record the exact result in the
active feature evidence; traceability markers do not replace execution or
review.

## PostgreSQL schema and migrations

Backend modules own their Drizzle schema definitions. The backend aggregate at
`apps/backend/src/infrastructure/database/schema.ts` is the generation entry;
reviewed SQL and Drizzle metadata under `apps/backend/drizzle/` are the ordered,
committed database transition history.

```sh
pnpm db:generate # generate a migration after changing Drizzle schema
pnpm db:check    # validate the checked-in migration history
pnpm db:migrate  # explicitly apply pending migrations
pnpm db:studio   # inspect a local development database
```

`db:migrate` requires explicit `APP_ENV` and `DATABASE_URL` configuration. Run
it as a singleton development/deployment step before backend processes start;
the runner also holds a PostgreSQL advisory lock. Backend HTTP startup never
mutates schema. Do not use `drizzle-kit push` for the ordinary development,
staging, or production database.

For pending additive enum values, the runner commits additions to existing types
under that same advisory lock before applying constraints that reference them.
Migration files/hashes remain unchanged. Ordinary DDL/history still rolls back on
failure; unused additive labels can remain, and the same command safely retries.
Do not reset data or edit the migration ledger to recover. Verify existing-schema
upgrades as well as empty installs; see [ADR-0033](adr/0033-additive-enum-migration-commit-boundaries.md).

## Dependencies

Add a dependency only to the workspace that imports it:

```sh
pnpm --filter @languon/backend add package-name
pnpm --filter @languon/web add -D package-name
```

Keep shared build and quality tooling at the repository root. Commit
`pnpm-lock.yaml` and use `pnpm install --frozen-lockfile` in CI and containers.

## Local services

| Service    | Default                 | Configuration                 |
| ---------- | ----------------------- | ----------------------------- |
| Backend    | `http://localhost:4000` | `BACKEND_PORT`                |
| Mastra     | `http://127.0.0.1:4111` | fixed loopback harness server |
| PostgreSQL | `localhost:5432`        | `DATABASE_URL`                |
| Redis      | `localhost:6379`        | `REDIS_URL`                   |
| Langfuse   | Cloud URL by default    | `LANGFUSE_*`                  |

The prompt package does not require Langfuse credentials for local tests: it
uses checked-in local prompt definitions. Never silently use production
credentials from development or test code.

### Browser API paths in development

Web browser requests use the same-origin `/api` base in development and production.
`NEXT_PUBLIC_API_URL=/api` is the sanitized default. Next's development-only rewrite
forwards `/api/*` to `WEB_API_PROXY_TARGET=http://localhost:4000`, stripping `/api`.
The server-only target accepts a credential-free loopback HTTP origin or the
exact trusted Compose service `http://backend:4000`; it rejects arbitrary remote
hosts, credentials, paths and queries. Docker app development sets `/api` and that
Compose target, keeping browser paths identical to host development. Production still uses NGINX's existing
`/api` proxy. Internal backend health/debug/service requests therefore keep their
unprefixed routes, while browser speech requests look like
`http://localhost:3333/api/speech/requests/<request-id>`.

Restart web after changing its environment or Next proxy configuration. Restart
backend and dictionary worker together to load provider changes. Explicit browser
API URL overrides remain supported for controlled deployments and must include
the intended public base path. A Kie terminal 500 is a supplier generation failure;
changing an API URL cannot repair it. Safe failed-job errors and billing outcomes
remain available after failed recording cleanup. Never retry a potentially accepted
paid submission merely because its status is unavailable.
