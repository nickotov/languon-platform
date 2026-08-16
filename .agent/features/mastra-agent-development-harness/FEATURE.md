# Mastra Agent Development Harness

Status: Complete
Owner: Engineering
Created: 2026-08-11

## Problem

Languon has `@mastra/core` and an empty `Mastra` instance, but it does not have
a runnable Mastra development environment. A developer cannot start Mastra
Studio from the monorepo, discover the agents, tools, workflows, processors, or
scorers used by the backend, run those primitives independently, or inspect
their local execution traces.

Future tools and workflows will execute real application behavior. They may
load a learner by identifier, enforce ownership, generate durable content, and
write results through application services and repositories. Running those
primitives from Studio against Languon's ordinary development database would
mix exploratory data with app data and make direct tool execution capable of
damaging work outside the current experiment. Pointing Studio at staging,
production, or a copied production dataset would create a substantially greater
security and privacy risk.

Without a canonical registration and startup path, future product features are
likely to create Studio-only copies of agents or bind agent definitions directly
to Hono and production infrastructure. That would make isolated iteration less
representative, increase configuration drift, and make tools unsafe or difficult
to exercise outside a complete application journey.

## Current state

- `apps/backend` depends on `@mastra/core`, but does not install the `mastra`
  CLI or provide a Mastra development script.
- `apps/backend/src/infrastructure/ai/mastra.ts` exports `new Mastra({})` with no
  registered primitives.
- The repository has no Mastra CLI entry point at `apps/backend/src/mastra/index.ts`.
- The root scripts and Turborepo task graph do not expose a `dev:mastra`
  command.
- No product agents, tools, workflows, processors, or scorers exist yet.
- Local prompt fallback support exists in `@languon/prompts`, but no agent uses
  it.
- Docker Compose provides one local PostgreSQL service and one default `languon`
  database. The repository now has canonical Drizzle migrations plus
  product-owned user, authentication, and repository paths; the harness still
  needs an isolated playground lifecycle and deterministic synthetic fixture.

## Desired behavior

A developer can run one documented command from the repository root to start a
local Mastra Server and Studio without starting the web, admin, mobile, or Hono
application servers. Studio uses the canonical Mastra registry that backend AI
infrastructure also consumes, so every product primitive registered for the app
is automatically available for isolated development without a second
definition.

Within Studio, a developer can discover registered agents, run safe tools in
isolation, execute and visualize workflows, provide validated request context,
observe tool and workflow events, and iterate on checked-in local prompts with
hot reload. The development environment starts without production credentials;
live model execution is explicit and requires a configured development provider
key.

The harness uses a dedicated local playground database, separate from the
ordinary application database. Startup ensures that this database exists,
applies the same canonical application migrations used by the backend, and
idempotently seeds explicitly synthetic users and any minimal fixture data
required by registered development scenarios. A synthetic principal selected
through validated request context maps to a real fixture row so tools can run
the same ownership, repository, and persistence paths they use in the app.

Starting Studio is non-destructive: existing playground data survives normal
restarts. A separate guarded reset command can recreate the playground database
and seed state when a clean environment is required. Database structure comes
from migrations, not from staging or production snapshots.

The harness is local-development infrastructure. It does not expose Mastra's
generic API through Languon's public Hono API or establish a production Studio
deployment.

## Acceptance criteria

- [x] AC-1 — Running `pnpm dev:mastra` from the repository root builds required
      workspace dependencies and starts Mastra Studio at a documented loopback URL,
      without starting the Languon web, admin, mobile, or Hono servers.
- [x] AC-2 — `apps/backend/src/mastra/index.ts` is the single canonical Mastra
      composition root used by the CLI and by backend Mastra infrastructure; no
      agent, tool, workflow, processor, or scorer needs a Studio-specific copy.
- [x] AC-3 — Product primitives may remain colocated with their owning backend
      modules and become discoverable in Studio solely by registration in the
      canonical composition root; the feature does not require business modules to
      move into a framework-owned folder structure.
- [x] AC-4 — Studio lists the registered development-verification primitives
      needed to prove the harness, can run a tool independently, can visualize and
      execute a workflow, and can invoke a registered agent when a development
      model is configured. Any permanent verification fixtures are deterministic,
      clearly development-only, and excluded from production composition.
- [x] AC-5 — Studio exposes its generated REST/OpenAPI interface at a documented
      local URL so registered primitives can also be inspected and exercised
      without the UI.
- [x] AC-6 — Editing an agent, tool, workflow, or checked-in local prompt while
      the harness runs causes the relevant Studio behavior to reload without a
      manual rebuild or restart.
- [x] AC-7 — Agents and tools can declare Zod-validated request context, and a
      developer can supply that context in Studio to exercise conditional prompt,
      model, tool, or synthetic-user behavior without a Hono context.
- [x] AC-8 — The harness starts without Langfuse or model-provider credentials.
      Operations that require an absent provider key fail with a clear,
      non-secret-bearing configuration error; they do not silently select
      production credentials or another provider.
- [x] AC-9 — Local checked-in prompts are the default for Studio, and the
      harness does not attempt remote prompt resolution unless a developer
      explicitly enables a separately configured remote resolver. Remote prompt
      access is never a prerequisite for deterministic harness verification.
- [x] AC-10 — Tool definitions exercised by Studio validate their external
      inputs and outputs, preserve cancellation, do not depend on Hono types, and
      reach databases or other services only through authorized infrastructure or
      application ports. Studio does not use shared, staging, or production data for
      verification.
- [x] AC-11 — The local Studio server is development-only and loopback-bound by
      default. The feature does not add unauthenticated Mastra routes to the public
      backend or include development-only verification primitives in production
      composition.
- [x] AC-12 — Local execution provides enough trace detail to identify the
      invoked agent/workflow/tool, step path, duration, result, and sanitized error
      category. Raw learner data, secrets, and unnecessary prompt or model content
      are not exported to Langfuse or another remote destination by default.
- [x] AC-13 — Automated verification proves registry composition, environment
      validation, development-only fixture gating if fixtures are used, and command
      configuration without calling a paid or nondeterministic model service. A
      separate opt-in live smoke check may verify model interaction when a developer
      provides credentials.
- [x] AC-14 — Developer documentation explains startup and shutdown, local URLs,
      environment loading, how module-owned primitives are registered, how to
      provide request context, playground database creation/migration/fixture/reset
      behavior, which actions can cause side effects, and which Studio capabilities
      require later persistent storage.
- [x] AC-15 — Existing backend health/OpenAPI behavior and canonical development,
      build, lint, typecheck, and test commands continue to work after the harness is
      added.
- [x] AC-16 — A deterministic code-based scorer can be registered and exercised
      against a verification run without a paid model call. Studio capabilities
      that require persistent dataset, experiment, trace, or scorer storage are
      unavailable or clearly identified until a follow-up storage feature is
      implemented.
- [x] AC-17 — Studio and every database-backed primitive registered in the
      harness receive a dedicated playground database connection that is distinct
      from the ordinary local application database. Playground startup refuses a
      missing, malformed, shared-development, staging, or production database
      target instead of falling back to `DATABASE_URL`.
- [x] AC-18 — `pnpm dev:mastra` ensures required local PostgreSQL infrastructure
      is healthy, creates the dedicated playground database when absent, applies
      every pending canonical application migration, and starts Studio only after
      provisioning succeeds. Provisioning and migration application are
      idempotent on repeated startup.
- [x] AC-19 — Playground provisioning idempotently creates at least one
      deterministic synthetic user fixture with a stable, documented identifier.
      Validated Studio request context can select that fixture, and the resulting
      tool/workflow calls exercise normal application authorization and repository
      paths rather than bypassing them or treating the supplied identifier as proof
      of authentication.
- [x] AC-20 — Database writes produced by Studio agents, tools, and workflows are
      confined to the playground database, remain available for inspection across
      normal Studio restarts, and cannot affect the ordinary development database,
      shared environments, or production.
- [x] AC-21 — Normal playground startup never drops, truncates, or restores a
      database. A separate explicitly named reset command can recreate only a
      positively identified local playground database, requires safeguards against
      ambiguous or unsafe targets, reapplies migrations and fixtures, and documents
      that its playground data is destructive and recoverable only by regeneration.
- [x] AC-22 — The harness neither downloads nor restores staging or production
      database snapshots. Schema parity is provided by canonical migrations;
      representative records are provided by checked-in synthetic fixtures that
      contain no copied personal data or secrets.
- [x] AC-23 — Disposable-database integration verification proves initial
      creation, repeated-start idempotency, forward migration, deterministic seed
      behavior, isolation from the normal development database, safe reset, and
      refusal of unsafe database targets.

## Scope

### In scope

- A repository-root `dev:mastra` command and the corresponding backend workspace
  and Turborepo task configuration.
- A workspace-local, lockfile-managed Mastra CLI compatible with the installed
  Mastra core packages.
- A canonical `apps/backend/src/mastra/index.ts` composition root.
- A registration convention that keeps business agents, workflows, and tools in
  their owning backend module's infrastructure layer.
- Reuse of the canonical registry by Studio and backend infrastructure adapters.
- Safe development-verification primitives or equivalent test fixtures needed
  to prove agent, tool, and workflow discovery before product agents exist.
- Development environment parsing for the selected local model and Studio
  settings, including clear missing-credential behavior.
- Local prompt iteration and hot reload through `@languon/prompts`.
- Request-context support suitable for synthetic identities and prompt/model/tool
  variants in Studio.
- Dedicated playground PostgreSQL configuration using the existing local
  PostgreSQL service while remaining isolated from Languon's ordinary local
  application database.
- Idempotent playground database creation, canonical migration application, and
  deterministic synthetic user/fixture seeding as a prerequisite to Studio
  startup.
- A guarded, explicitly destructive playground database reset workflow.
- Disposable PostgreSQL integration verification for provisioning, migrations,
  seeding, isolation, and reset safeguards.
- Local execution traces sufficient for debugging the registered primitives.
- Registration and deterministic smoke verification for a code-based scorer,
  without introducing persistent evaluation storage.
- Automated configuration/registry verification and an optional credentialed
  live-model smoke path kept outside the default test suite.
- Developer documentation for the complete local workflow.

### Out of scope

- Implementing learner-profile, course-builder, translation, grammar, culture,
  tutor, or other product agents and their business behavior.
- Deploying Mastra Studio or Mastra Server to production, adding Studio team
  access, or choosing production Studio authentication and authorization.
- Exposing Mastra's generic agent/workflow routes through the public Hono API or
  adding the Mastra Hono server adapter.
- Making Mastra memory, workflow state, datasets, experiments, traces, or scorer
  history durable. Persistent Studio storage is a follow-up once its ownership,
  isolation, retention, and PostgreSQL verification are specified. This exclusion
  does not prevent application tools from writing business results to the isolated
  playground database.
- Implementing the full Langfuse prompt-management lifecycle, prompt promotion,
  or production trace export.
- Adding Bifrost, multiple model providers, automatic routing, or provider
  fallback policy.
- Creating a generic shared AI package or moving Mastra SDK types into domain or
  application layers.
- Inventing business tables or migrations solely for this harness before a
  product feature owns them. The harness must discover and apply the canonical
  migration set as it grows.
- Importing, anonymizing, or refreshing snapshots from local application,
  staging, or production databases. Richer synthetic datasets may be specified in
  a follow-up feature if deterministic seed fixtures become insufficient.
- Adding frontend UI, production authentication, or real user data.

## Constraints and risks

- Follow the backend dependency direction from interface/infrastructure to
  application to domain. Mastra and provider SDK types remain infrastructure
  concerns.
- The CLI-facing `src/mastra/index.ts` is a framework composition root, not a new
  business layer. Module-specific AI behavior remains in the owning module's
  infrastructure directory.
- Mastra CLI and core versions evolve independently and quickly. The plan must
  verify compatibility using locked workspace dependencies rather than a global
  CLI or floating runtime download.
- Mastra's monorepo environment-file discovery may differ from Languon's current
  root `.env.local` convention. The implementation must establish one documented
  source for backend development secrets without committing or duplicating real
  credentials.
- The development server must remain loopback-only unless a later authenticated
  deployment feature explicitly changes that policy.
- Studio can invoke tools directly. A misconfigured tool could mutate durable
  data or call external services outside the normal Hono authorization boundary;
  fixtures and dependency wiring must make side effects explicit and disposable.
- Request-context identities used in Studio are synthetic development inputs and
  must never be treated as proof of authentication.
- The playground database should be a separate database in the existing local
  PostgreSQL service, rather than a schema inside `languon`. Database-level
  isolation makes accidental cross-environment queries and destructive reset
  operations easier to prevent. Runtime wiring must not silently fall back to the
  normal application connection.
- Canonical migrations, not schema dumps or database snapshots, define database
  structure. The harness currently has no migrations to apply; its provisioning
  path must remain valid when product features introduce them.
- Normal startup is idempotent and non-destructive. Destructive reset logic must
  resolve and validate the exact local playground target before acting and must
  never accept a broad directory, host, database wildcard, or unresolved
  environment value.
- Synthetic fixtures must be deterministic, contain no copied personal data, and
  be safe to regenerate. They may model roles and ownership but do not establish
  a production authentication strategy.
- Automated tests must use deterministic local prompts and test doubles and must
  not call paid or nondeterministic model services.
- Local traces and logs must follow the repository prohibition on secrets, raw
  user prompts containing personal data, and unnecessary personal information.
- Port conflicts and orphaned development processes must produce actionable
  errors and have a documented shutdown path.
- Because this feature adds migration and database lifecycle behavior, its later
  implementation must use the repository's database-verification workflow and
  record creation, forward-migration, idempotency, isolation, and reset evidence
  against disposable infrastructure.

## Open decisions

- None currently require stakeholder input. Exact script wiring, development
  fixture design, compatible CLI version, model configuration, and local trace
  implementation are implementation decisions to resolve and record in the
  later `EXEC_PLAN.md`.

## References

- [Repository architecture](../../../docs/architecture.md)
- [Backend engineering constraints](../../../apps/backend/AGENTS.md)
- [Current backend package](../../../apps/backend/package.json)
- [Current empty Mastra registry](../../../apps/backend/src/infrastructure/ai/mastra.ts)
- [Mastra project structure](https://mastra.ai/reference/project-structure)
- [Mastra Studio](https://mastra.ai/docs/studio/overview)
- [Mastra monorepo guidance](https://mastra.ai/docs/deployment/monorepo)
