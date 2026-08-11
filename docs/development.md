# Development

## Environment

Use Node.js 24 and the Corepack-managed pnpm version declared in
`package.json`. Copy `.env.example` to `.env.local`; never commit the resulting
file or real credentials.

Start infrastructure separately from application processes:

```sh
pnpm dev:infra
pnpm dev
```

To run applications in separate terminals, start infrastructure first and then
run only the services needed for the journey:

```sh
pnpm dev:backend
pnpm dev:web
pnpm dev:admin
pnpm dev:mobile
```

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
PostgreSQL instance. User-visible changes require browser or device evidence in
the active feature's `EVIDENCE.md`.

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
