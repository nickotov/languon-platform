# Development

## Environment

Use Node.js 24 and the Corepack-managed pnpm version declared in
`package.json`. Copy `.env.example` to `.env.local`; never commit the resulting
file or real credentials.

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

`MASTRA_PLAYGROUND_DATABASE_URL` and
`MASTRA_PLAYGROUND_ADMIN_DATABASE_URL` are mandatory, independent of
`DATABASE_URL`, and accepted only when they identify the same loopback
PostgreSQL authority, the `postgres` admin database, and a safely prefixed
target. Normal startup is non-destructive and preserves playground writes.

The canonical registry lives at `apps/backend/src/mastra/index.ts`. Product
agents, tools, workflows, processors, and scorers remain in their owning backend
module infrastructure and are registered there. Permanent verification
primitives appear only when `MASTRA_DEV_HARNESS=true`; the Hono server imports
the same production composition without exposing generic Mastra routes.

Studio provides `synthetic-principal` request-context presets. Context selects
the allowlisted fixture but is not authentication proof: the development
application service authorizes the stable ID and resolves the active verified
row through the product users repository. Tool/workflow inputs and outputs are
Zod validated and cancellation is preserved.

Checked-in local prompts are the only default resolver. Neither Langfuse nor a
model key is required to boot or run the deterministic tool, workflow, and code
scorer. The live agent defaults to `deepseek/deepseek-chat`. When
`MASTRA_MODEL_ID` selects another valid Mastra `provider/model`, that model is
the primary and DeepSeek Chat remains the fixed fallback. Live invocation is
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
