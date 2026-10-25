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
if [ ! -e .env.local ] && [ ! -L .env.local ]; then
  cp .env.example .env.local
fi
pnpm install
pnpm dev:all
```

Alternatively, start `pnpm dev:panel`, open its printed URL, and choose
**Development → Start whole app → Start**. Docker must already be running.
This waits for PostgreSQL/Redis, builds shared dependencies, applies migrations
and starts backend, web, admin and dictionary worker. Stop/Ctrl+C
ends app processes and leaves infrastructure/data intact.

The default local endpoints are:

- Web: `http://localhost:3333`
- Admin: `http://localhost:3001`
- Backend health: `http://localhost:4000/livez`
- OpenAPI document: `http://localhost:4000/openapi.json`
- Mastra Studio (when started separately): `http://127.0.0.1:4111`
- Web dev command panel (when started separately): `http://127.0.0.1:4400`
- Architecture diagrams (run `pnpm diagrams`): `http://127.0.0.1:4401`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO speech storage: `http://127.0.0.1:9000`
- MinIO development console: `http://127.0.0.1:9001`

Backend, Next.js, PostgreSQL, and Redis development endpoints are loopback-only
by default. This keeps the public local secrets and verification code `0000`
off the LAN.

### Use live dictionary AI locally

Dictionary generation uses the dictionary worker, independently from the Mastra
Studio playground. `DICTIONARY_GENERATION_PROVIDER_MODE=deterministic` selects a
local test fixture; its proposals are deliberately predictable and can mirror
the submitted source text. Use that mode for tests and offline UI work.

To use a real model, configure the worker in the ignored `.env.local` file:

```dotenv
DICTIONARY_GENERATION_PROVIDER_MODE=mastra
DICTIONARY_GENERATION_MODEL_ID=deepseek/deepseek-flash
DEEPSEEK_API_KEY=replace-with-a-private-worker-key
DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED=true
DICTIONARY_AI_MANAGED_ROUTING_ENABLED=true
# Keep false until the priced revision and current worker pass rollout preflight.
DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED=false

DICTIONARY_JOB_API_READABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_CANCELLABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_DISCARDABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_ACCEPTABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_ENQUEUED_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
```

Use `DICTIONARY_GENERATION_MODEL_ID=kie/gemini-2.5-pro` with `KIE_API_KEY` and
`DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED=true` to use Kie's text endpoint.
`DICTIONARY_AUDIO_KIE_API_KEY` remains a separate TTS credential. The safe
`*_CREDENTIAL_CONFIGURED` flags tell the API which worker credentials are
deployed without exposing those credentials to the API process. Curated
providers use fixed reviewed URLs, model IDs, request caps, structured-output
handling, and non-billable readiness probes. DeepSeek's authenticated
`GET /models` can report available; Kie's route-only `HEAD` probe remains
unverified because it does not prove the credential or structured output. The admin AI settings page can
enable catalog models and choose the global default; it never reads or writes
credentials. Active learners can read/save Auto or an explicit curated model
through the [model preference backend](docs/user-flows/user-ai-model-preferences-backend.md);
new jobs resolve that choice and existing jobs retain their pinned execution.
The profile picker is deferred to the external-design continuation.

`DICTIONARY_AI_MANAGED_ROUTING_ENABLED` is the expand/activate safety gate. For a
deployed environment, enable it only after every active and rollback-floor worker
supports pinned provider revisions. Locally, one restarted API/worker release can
enable it immediately. Settings changes then apply to newly admitted jobs without
another restart; queued jobs retain their pinned provider/model and budget.
The database claim guard also rejects a pinned job unless the worker transaction
declares the managed-routing revision, so an old process cannot execute it with a
legacy default even if both releases temporarily overlap.

`DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED` activates per-user normalized AI
credits for newly admitted managed-routing jobs. It is off by default. Before
enabling it, apply the AI-credit migrations, save a new provider configuration
so the active immutable revision contains credit pricing, and verify every
active worker supports settlement revision `1`. Existing provider revisions and
legacy jobs are never retroactively charged. Disable the flag to stop new
generation admissions; retained jobs remain readable, cancellable and acceptable,
and already admitted jobs drain on current workers. Deterministic test fixtures
also use managed snapshots, reviewed synthetic rates and bounded accounting;
there is no new unaccounted API fallback.

The six format settings above enable the complete local card-authoring lifecycle.
If a setting already contains other formats, preserve them as comma-separated
entries when adding `card-authoring:v3`. Keep v1 and v2 readable and terminally
actionable until their queued and reviewable work drains. The same rule applies
when expanding `single-card:v2`, `pasted-terms:v2`, `import-pairs:v2`, and
`document-terms:v2` beside their v1 predecessors.

Each value such as `card-authoring:v3` is a durable job payload and wire-contract
version, not an application release number. A persisted v1 job remains v1 until
it reaches a terminal state; deployments do not rewrite it to the newest format.
The six settings deliberately control different lifecycle operations:

| Setting                                     | What enabling a format permits                                              |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `DICTIONARY_JOB_API_READABLE_FORMATS`       | Return its status, progress, proposal, or terminal outcome through the API. |
| `DICTIONARY_JOB_API_CANCELLABLE_FORMATS`    | Cancel its queued or running jobs.                                          |
| `DICTIONARY_JOB_API_DISCARDABLE_FORMATS`    | Discard its review-ready proposal.                                          |
| `DICTIONARY_JOB_API_ACCEPTABLE_FORMATS`     | Accept its review-ready proposal and commit the selected card changes.      |
| `DICTIONARY_JOB_API_ENQUEUED_FORMATS`       | Admit new jobs using that format. This is the activation gate.              |
| `DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS` | Let a worker claim and execute queued jobs using that format.               |

Keeping these sets separate makes blue/green deployment and rollback safe. For a
new `card-authoring:v3` format, use these phases:

1. **Expand:** add v3 to worker-processable and API read/cancel/discard/accept
   sets, but keep API enqueue on v1/v2. This deploys complete lifecycle support
   without creating v3 work; after rollout, the expand release can become the
   rollback floor for activation.
2. **Activate:** add v3 to API enqueue only after deployment preflight confirms
   the complete overlapping stack supports its lifecycle.
3. **Drain and retire:** stop enqueueing the old version first. Remove it from
   read/cancel/discard/accept and worker-processable sets only after no queued,
   running, retryable, or reviewable work remains and the rollback floor has
   advanced.

For example, the expand release differs only at enqueue:

```dotenv
DICTIONARY_JOB_API_READABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_CANCELLABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_DISCARDABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_ACCEPTABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
DICTIONARY_JOB_API_ENQUEUED_FORMATS=card-authoring:v1,card-authoring:v2
DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS=card-authoring:v1,card-authoring:v2,card-authoring:v3
```

The activate release then adds `card-authoring:v3` to
`DICTIONARY_JOB_API_ENQUEUED_FORMATS`. Local development may enable the complete
lifecycle immediately because the API and worker are restarted together. See
[Dictionary jobs and document operations](docs/operations/dictionary-jobs-and-documents.md#deployment-contract)
for deployment gates and [ADR-0012](docs/adr/0012-dictionary-worker-and-document-ingestion.md)
for the authoritative compatibility policy.

An existing managed AI provider revision does not need to be resaved after an
additive job-format release. Its pinned format list remains compatible while all
formats it originally supported are still present in the current code-owned
model catalog. Removing support remains a drain-and-retire operation.

The endpoint must provide an
OpenAI-compatible API and the model must support the structured output used by
dictionary generation. Generic legacy endpoints require `GET /models`; curated
providers use the provider-specific readiness behavior above. Restart
`pnpm dev:all` or `pnpm dev:dictionary-worker` after changing these values;
running `pnpm dev:mastra` does not change the dictionary worker provider.

Standard development pronunciation storage uses the private, versioned MinIO
bucket initialized by `pnpm dev:infra`. Development and disposable-test Compose
files use the public `heifeng/minio` and `heifeng/mc` replicas, pinned to the exact
original upstream image digests because the original repositories no longer
allow these pulls. Both ARM64 and AMD64 manifests were verified. Changing the
registry does not change the MinIO release or stored data. No Docker login or
`.env` change is needed for these public replicas.

Keep the fixture provider for local work;
shared playback/generation remain disabled until explicitly configured. See
[shared pronunciation operations](docs/shared-pronunciation-operations.md) for
host/container endpoints, scoped credentials, retained-text policy and live
activation evidence.

Provider-specific TTS settings such as `DICTIONARY_AUDIO_KIE_API_KEY` only power
pronunciation audio. Kie's text models use `KIE_API_KEY`. Additional text providers
require a reviewed catalog entry and compatibility tests; admins cannot enter
arbitrary URLs, headers, keys, or model identifiers.

Use `pnpm dev:apps:docker` to build and start backend, web, admin, and their
infrastructure in Docker. The app profile is intended for environment parity
checks; the host-based `pnpm dev` loop is faster for normal development. Mobile
is temporarily excluded from both aggregate commands while its development is
deferred; start it explicitly with `pnpm dev:mobile` when needed.

## Canonical commands

| Command                                       | Purpose                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev:all`                                | Prepare infra/migrations and run apps plus workers                                  |
| `pnpm dev`                                    | Run backend, web, and admin development servers                                     |
| `pnpm dev:infra`                              | Start PostgreSQL, Redis and private development MinIO                               |
| `pnpm dev:mastra`                             | Provision and run isolated Mastra Studio                                            |
| `pnpm dev:backend`                            | Run only the backend                                                                |
| `pnpm dev:web`                                | Run only the user-facing web application                                            |
| `pnpm dev:admin`                              | Run only the administration application                                             |
| `pnpm dev:mobile`                             | Run only the Expo development server                                                |
| `pnpm dev:panel`                              | Run the local reviewed-command web panel                                            |
| `pnpm diagrams`                               | Browse source-backed architecture and data-flow diagrams locally                    |
| `pnpm diagrams:check`                         | Check diagram syntax and source freshness                                           |
| `pnpm test:diagrams`                          | Test the diagram catalog and read-only HTTP boundary                                |
| `pnpm test:e2e:diagrams`                      | Verify the real diagram viewer in Chromium                                          |
| `pnpm dev:doctor`                             | Inspect local capability, worker, pricing and budget readiness without mutations    |
| `pnpm dev:configure -- --help`                | Preview/apply reviewed local setup profiles through admin APIs                      |
| `pnpm test:e2e:critical`                      | Run critical browser and backend AI execution checks on owned disposable infra         |
| `pnpm critical-flows:check`                   | Validate the extensible critical workflow registry                                  |
| `pnpm check:setup-docs`                       | Check documented setup values against reviewed profile definitions                  |
| `pnpm browser:install`                        | Install Chrome for agent-led browser checks                                         |
| `pnpm browser:check`                          | Test the safe wrapper and live browser launch                                       |
| `pnpm agent-skills:check`                     | Validate repository-scoped agent skill packages                                     |
| `pnpm styles:check`                           | Validate web CSS Modules, geometry tokens and utility-free markup                   |
| `pnpm search:ast`                             | Read-only structural code search using the pinned ast-grep CLI                      |
| `pnpm test:code-search`                       | Verify TypeScript/TSX structural search behavior                                    |
| `pnpm db:generate`                            | Generate reviewed Drizzle SQL migrations                                            |
| `pnpm db:check`                               | Validate Drizzle migration history                                                  |
| `pnpm db:migrate`                             | Explicitly apply pending PostgreSQL migrations                                      |
| `pnpm test:e2e:shared-pronunciation`          | Run guarded learner/admin pronunciation and pricing journeys                        |
| `pnpm test:e2e:texts-backend`                 | Run guarded Texts API journeys against disposable PostgreSQL and Redis              |
| `pnpm test:e2e:texts-web`                     | Run guarded Texts real-browser journeys                                             |
| `node scripts/run-ai-accounting-e2e.mjs`      | Run guarded learner budget/quote and owner accounting browser journeys sequentially |
| `pnpm test:e2e:contextual-assistant`          | Run guarded contextual chat and Knowledge journeys with deterministic models        |
| `pnpm test:e2e:learner-portrait`              | Run guarded portrait API and real-browser journeys with deterministic models        |
| `pnpm test:e2e:texts`                         | Run Texts backend and web journeys against exclusive disposable targets             |
| `pnpm db:studio`                              | Inspect the local database with Drizzle Studio                                      |
| `pnpm mastra:playground:reset`                | Guarded destructive Mastra playground reset                                         |
| `pnpm lint`                                   | Run repository lint rules                                                           |
| `pnpm typecheck`                              | Type-check every workspace                                                          |
| `pnpm test`                                   | Run all automated tests                                                             |
| `pnpm test:frontend-architecture`             | Test web/admin FSD import boundaries                                                |
| `pnpm test:persistence-readability`           | Test backend persistence size and spacing lint rules                                |
| `pnpm test:coverage`                          | Run tests with coverage                                                             |
| `pnpm test:web-dev-panel`                     | Test the local command panel                                                        |
| `pnpm test:e2e:web-dev-panel`                 | Run panel Playwright journeys against fixtures                                      |
| `pnpm web-dev-panel:check`                    | Validate reviewed panel command sources                                             |
| `pnpm build`                                  | Build all workspaces in dependency order                                            |
| `pnpm check`                                  | Run formatting, lint, types, tests, and builds                                      |
| `pnpm deploy:remote`                          | Deploy a verified manifest to a remote VPS over SSH                                 |
| `pnpm admin:membership`                       | Guarded local admin owner/list/prune operations                                     |
| `pnpm admin:membership:stdin`                 | Run a local admin operation from private JSON stdin                                 |
| `pnpm admin:membership:remote`                | Run guarded admin operations on an active VPS image                                 |
| `pnpm docs:user-flows:check`                  | Validate user-flow guide metadata and sections                                      |
| `pnpm user-flow:e2e -- inspect <slug>`        | Inspect guide-to-E2E scenario traceability                                          |
| `pnpm user-flow:e2e -- check [slug]`          | Validate guide-to-E2E scenario traceability                                         |
| `node scripts/run-flashcard-training-e2e.mjs` | Run backend flashcard HTTP journeys in owned ephemeral PostgreSQL/Redis containers  |
| `pnpm feature:new -- <slug> "<title>"`        | Create the next numbered feature evidence workspace                                 |

The contextual assistant journey uses exclusive disposable PostgreSQL/Redis
targets and a deterministic model. Follow its
[user-flow guide](docs/user-flows/contextual-language-assistant-and-knowledge.md)
for the required confirmation variables, ports and cleanup.

Quick one-command style remote flow (Timeweb-ready):

```sh
pnpm deploy:remote deploy \
  --environment stage \
  --target root@<vps-ip-or-dns> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env
```

See full flag reference and staging/production examples in  
[Deployment runbook → Remote deploy from your laptop](./docs/operations/deployment.md#remote-deploy-from-your-laptop).

Target one workspace with pnpm filters, for example:

```sh
pnpm --filter @languon/backend test
pnpm --filter @languon/web dev
pnpm --filter @languon/mobile typecheck
```

Run `pnpm browser:install` once after installing dependencies when agents need
real-browser verification. The repository-pinned
[agent-browser](https://github.com/vercel-labs/agent-browser) CLI is for fast,
exploratory checks of a running web or admin app through
`$browser-verification`; Playwright remains the committed E2E test runner. Use
the repository wrapper so local host, configuration, session, and command
safeguards are enforced. Start with
`pnpm browser -- start <task-slug> <local-url>`, then use the random session
handle it prints for subsequent commands.

## Repository structure

- `apps/backend/` — Hono API and Mastra runtime; follows DDD dependency rules.
- `apps/web/` — Next.js student/tutor web experience; follows pages-first FSD.
- `apps/admin/` — Vite/Refine operations SPA with React Router and Ant Design;
  follows `app -> pages -> widgets -> shared` boundaries.
- `apps/mobile/` — Expo/React Native mobile client.
- `packages/contracts/` — shared Zod schemas and API types.
- `packages/database/` — PostgreSQL and Redis infrastructure factories.
- `packages/prompts/` — local prompt fallbacks and Langfuse prompt access.
- `web-dev-panel/` — native local dashboard for reviewed development commands.
- `scripts/architecture-viewer/` — native read-only diagram server and local browser client.
- `docs/diagrams/` — maintained source-backed architecture and data-flow views.
- `infra/` — checked-in container definitions.
- `design/` — design-system blueprints and editable visual design sources.
- `docs/` — product, architecture, ADRs, setup, and development documentation.
- `.agent/` — durable feature artifacts plus lightweight correction and
  improvement plans.
- `.agents/skills/` — repository-scoped Codex workflows.
- `.codex/` — trusted-project Codex configuration and custom agents.

Generated output, dependencies, caches, local environment files, credentials,
and native mobile build directories are ignored.

## Engineering workflow

Read [AGENTS.md](./AGENTS.md) before changing the repository. An explicitly
requested feature starts with a directory generated under `.agent/features/`.
The `EXEC_PLAN.md` is living state: it records requirements, milestones,
decisions, discoveries, validation, and remaining work so another agent can
continue after context compaction. Bounded low-risk maintenance uses one
lightweight plan under `.agent/corrections/`; focused developer, tooling, and
existing-contract UX enhancements use `.agent/improvements/`.

See [architecture](./docs/architecture.md),
[architecture decisions](./docs/adr/README.md),
[development](./docs/development.md),
[release and deployment operations](./docs/operations/README.md),
[user-flow testing guides](./docs/user-flows/README.md), and
[agentic development](./docs/agentic-development.md) for details.
The [product backlog](./docs/backlog/INDEX.md) indexes numbered task documents,
implementation context, open decisions and evidence. Completed tasks use `-done`
filenames; explicitly skipped tasks use `-skipped`. Agents synchronize these
statuses and links automatically as part of backlog delivery.
For a detailed walkthrough with Mermaid diagrams, agent responsibilities,
feature/correction/improvement and bug-fix flows, review loops, design fidelity,
and copyable prompts, read the
[agentic development handbook](./docs/agentic-workflow-handbook.md).
Copy task-specific examples from the [prompt cookbook](./docs/agentic-prompts.md),
including the backend → `$design-brief` → Magic Patterns → frontend handoff.
The explicitly invoked skill produces a grounded design prompt and UI checklist;
it does not generate or upload a design automatically.
Saved briefs live in [design prompts](./docs/design-prompt/README.md), including
the [dictionary and AI-card UI prompt](./docs/design-prompt/dictionary-ai-cards.md),
with links to their feature implementations and relevant ADRs.
The [repository agent skills guide](./docs/agent-skills.md) documents local skill
invocation, authority, provenance, and upstream license notices.
Ask for a survey with a short research brief, or invoke `$survey`, to compare
options and save sourced findings in [research surveys](./docs/surveys/README.md).
The [workflow audit and rollout](./docs/agentic-workflow-audit.md) explains
delivery/review improvements; [workflow evaluation](./docs/agentic-workflow-evaluation.md)
provides decision probes and repair-inclusive quality/cost measurements.
Frontend component and state work uses the project-local
`$frontend-development` skill.

### Verify learner model preferences

`pnpm test:e2e:user-ai-model-preferences-backend` runs the authenticated API and
pinned dictionary-admission journey on explicitly confirmed disposable
PostgreSQL/Redis only. See its [safe verification guide](docs/user-flows/user-ai-model-preferences-backend.md)
for required test environment variables; it has no default database target and
never calls a paid provider.
