# Languon

Languon is an AI-first language-learning platform for students and tutors. The
repository is a pnpm/Turborepo monorepo containing the public web app, admin
app, mobile app, API, shared contracts, infrastructure clients, and prompt
management.

## Prerequisites

- Node.js 24.x
- pnpm 10.x through Corepack
- Docker Desktop or Docker Engine with Compose

## Quick start

```sh
corepack enable
cp .env.example .env.local
pnpm install
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

The default local endpoints are:

- Web: `http://localhost:3000`
- Admin: `http://localhost:3001`
- Backend health: `http://localhost:4000/health`
- OpenAPI document: `http://localhost:4000/openapi.json`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Use `pnpm dev:apps:docker` to build and start the application services plus
their infrastructure in Docker. The app profile is intended for environment
parity checks; the host-based `pnpm dev` loop is faster for normal development.

## Canonical commands

| Command                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                             | Run all application development servers        |
| `pnpm dev:infra`                       | Start PostgreSQL and Redis                     |
| `pnpm dev:backend`                     | Run only the backend                           |
| `pnpm dev:web`                         | Run only the user-facing web application       |
| `pnpm dev:admin`                       | Run only the administration application        |
| `pnpm dev:mobile`                      | Run only the Expo development server           |
| `pnpm db:generate`                     | Generate reviewed Drizzle SQL migrations       |
| `pnpm db:check`                        | Validate Drizzle migration history             |
| `pnpm db:migrate`                      | Explicitly apply pending PostgreSQL migrations |
| `pnpm db:studio`                       | Inspect the local database with Drizzle Studio |
| `pnpm lint`                            | Run repository lint rules                      |
| `pnpm typecheck`                       | Type-check every workspace                     |
| `pnpm test`                            | Run all automated tests                        |
| `pnpm test:coverage`                   | Run tests with coverage                        |
| `pnpm build`                           | Build all workspaces in dependency order       |
| `pnpm check`                           | Run formatting, lint, types, tests, and builds |
| `pnpm feature:new -- <slug> "<title>"` | Create a feature evidence workspace            |

Target one workspace with pnpm filters, for example:

```sh
pnpm --filter @languon/backend test
pnpm --filter @languon/web dev
pnpm --filter @languon/mobile typecheck
```

## Repository structure

- `apps/backend/` — Hono API and Mastra runtime; follows DDD dependency rules.
- `apps/web/` — Next.js student/tutor web experience; follows pages-first FSD.
- `apps/admin/` — Next.js operations interface; follows pages-first FSD.
- `apps/mobile/` — Expo/React Native mobile client.
- `packages/contracts/` — shared Zod schemas and API types.
- `packages/database/` — PostgreSQL and Redis infrastructure factories.
- `packages/prompts/` — local prompt fallbacks and Langfuse prompt access.
- `infra/` — checked-in container definitions.
- `docs/` — product, architecture, ADRs, setup, and development documentation.
- `.agent/` — durable feature specifications, plans, evidence, and reviews.
- `.agents/skills/` — repository-scoped Codex workflows.
- `.codex/` — trusted-project Codex configuration and custom agents.

Generated output, dependencies, caches, local environment files, credentials,
and native mobile build directories are ignored.

## Engineering workflow

Read [AGENTS.md](./AGENTS.md) before changing the repository. Non-trivial work
starts with a feature directory generated under `.agent/features/`. The
`EXEC_PLAN.md` is living state: it records requirements, milestones, decisions,
discoveries, validation, and remaining work so another agent can continue after
context compaction.

See [architecture](./docs/architecture.md),
[architecture decisions](./docs/adr/README.md),
[development](./docs/development.md), and
[agentic development](./docs/agentic-development.md) for details.
