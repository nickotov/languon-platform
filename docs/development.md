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

| Service    | Default                 | Configuration  |
| ---------- | ----------------------- | -------------- |
| Backend    | `http://localhost:4000` | `BACKEND_PORT` |
| PostgreSQL | `localhost:5432`        | `DATABASE_URL` |
| Redis      | `localhost:6379`        | `REDIS_URL`    |
| Langfuse   | Cloud URL by default    | `LANGFUSE_*`   |

The prompt package does not require Langfuse credentials for local tests: it
uses checked-in local prompt definitions. Never silently use production
credentials from development or test code.
