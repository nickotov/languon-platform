# ExecPlan: Mastra Agent Development Harness

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-16

## Goal

Give backend developers one root command that provisions an isolated local
PostgreSQL playground and starts a loopback-only Mastra Server and Studio using
the same registry as backend infrastructure. The harness must support safe,
deterministic tool, workflow, request-context, prompt, trace, and scorer
iteration without production credentials or application servers.

## Specification

- In scope: root/backend/Turbo commands, a lockfile-managed Mastra CLI, the
  canonical composition root, development-only verification primitives, local
  prompt resolution and hot reload, strict playground configuration,
  provisioning/migrations/synthetic fixtures/reset, local traces, deterministic
  and optional live verification, and developer documentation.
- Out of scope: product AI behavior, public Hono Mastra routes, production
  Studio deployment/authentication, persistent Mastra memory/workflow/eval/trace
  storage, provider fallback/routing, full Langfuse lifecycle, business schema
  created only for this harness, database snapshots, and real user data.

## Existing architecture

- `apps/backend/src/index.ts` is the Hono process entry and independently loads
  root `.env.local`; `apps/backend/src/app.ts` exposes only health and public
  OpenAPI behavior.
- `apps/backend/src/infrastructure/ai/mastra.ts` currently owns an empty
  `new Mastra({})`; no code consumes it and no Mastra primitives exist.
- Backend dependency direction is `interface/infrastructure -> application ->
domain`; Mastra/provider/database types remain infrastructure concerns.
- `@languon/database` exposes PostgreSQL/Drizzle factories and the accepted
  forward-only migration runner. The backend owns five canonical Drizzle
  migrations and product user/authentication repositories.
- `@languon/prompts` exposes checked-in local prompt strings and does not perform
  remote resolution by default.
- `compose.yaml` provides PostgreSQL 17 and Redis 8; only the ordinary `languon`
  database is initialized. ADR-0002 requires the harness to apply the same
  checked-in forward-only migrations to its isolated database.
- Root commands use Turbo and build workspace dependencies before an
  application-specific development server.
- The workspace now locks `mastra@1.25.0` alongside `@mastra/core@1.57.0`; the
  installed CLI exposes `mastra dev --dir/--root/--env` and uses server settings
  from the registered `Mastra` instance.
- ADR-0001 owns the user/authentication model and ADR-0002 owns canonical
  Drizzle schema/migration behavior. The harness reuses both without adding a
  new durable architecture rule.

## Acceptance criteria

- [x] AC-1 — `pnpm dev:mastra` builds dependencies, provisions the playground,
      and starts only loopback Mastra Server/Studio at documented URLs.
- [x] AC-2 — `apps/backend/src/mastra/index.ts` is the sole CLI/backend Mastra
      composition root.
- [x] AC-3 — Module infrastructure primitives become discoverable only by
      canonical registration and need no framework-owned relocation.
- [x] AC-4 — Development-only deterministic agent, tool, and workflow fixtures
      prove Studio discovery/execution and remain absent from production composition.
- [x] AC-5 — The generated REST/OpenAPI interface is reachable at a documented
      loopback URL and exposes registered primitives.
- [x] AC-6 — Backend primitive and checked-in prompt edits hot reload without a
      manual build or server restart.
- [x] AC-7 — Agent/tool/workflow request context is Zod validated and Studio can
      provide a synthetic principal and behavior variant without Hono context.
- [x] AC-8 — Startup requires no Langfuse/model key; missing model credentials
      fail only model execution with a clear sanitized error and no fallback.
- [x] AC-9 — Local prompts are the default; remote resolution requires explicit
      enablement plus a separately configured resolver.
- [x] AC-10 — Verification tool inputs/outputs are validated, cancellation is
      preserved, Hono types are absent, and persistence uses an application port.
- [x] AC-11 — Studio is development-only and loopback-bound; Hono gains no
      generic Mastra route and production composition gains no verification fixture.
- [x] AC-12 — Local execution identifies primitive, workflow step path, duration,
      result, and sanitized error category without default remote export or raw data.
- [x] AC-13 — Registry/configuration/gating/command tests are deterministic and
      make no model call; any credentialed model smoke is explicit and opt-in.
- [x] AC-14 — Developer documentation covers the complete startup, context,
      registration, data-lifecycle, side-effect, storage-limit, and shutdown flow.
- [x] AC-15 — Existing health/OpenAPI and canonical validation commands continue
      to pass.
- [x] AC-16 — A registered code scorer executes deterministically without a
      model; persistent dataset/experiment/trace/scorer capabilities are documented
      as deferred.
- [x] AC-17 — Playground URL/admin configuration is required, strictly local,
      separately named, and never falls back to `DATABASE_URL` or unsafe targets.
- [x] AC-18 — Startup waits for PostgreSQL, creates the target, applies all
      pending canonical migrations, seeds fixtures, and is repeatably idempotent.
- [x] AC-19 — A stable synthetic principal row is seeded and selected through
      validated context, then authorized and accessed through an application port.
- [x] AC-20 — Studio writes are confined to the playground and survive normal
      restarts without changing the ordinary development database.
- [x] AC-21 — Normal startup is non-destructive; an explicit guarded reset
      recreates only a positively identified playground and then migrates/seeds it.
- [x] AC-22 — No snapshots or copied data are used; migrations plus checked-in
      synthetic fixtures define the playground state.
- [x] AC-23 — Disposable PostgreSQL verification proves creation, idempotency,
      forward migration, deterministic seed, isolation, safe reset, and refusals.

## Test strategy

- Unit: Required — environment/URL safety policy, local prompt mode, registry
  gating, model credential failure, schema validation, cancellation, scorer, and
  command configuration are deterministic logic.
- Integration: Required — tool/application-port/repository behavior and the
  complete playground lifecycle run against a disposable PostgreSQL database.
- Contract: Required — generated Mastra HTTP/OpenAPI endpoints and existing Hono
  health/OpenAPI behavior are exercised without a model call.
- E2E: Required for the executable local system journey — use a uniquely named
  disposable PostgreSQL container to prove the complete provision/run/persist/
  isolate/reset lifecycle. Real Studio/API verification covers the interactive
  developer journey.
- Browser/device: Required for Studio — use a real browser to verify discovery,
  tool/workflow/context behavior, trace visibility, and hot reload. Responsive
  product UI checks are not applicable because Studio is third-party local UI.
- Database migration: Required — prove creation, forward application, repeated
  startup, seed idempotency, isolation, reset, and unsafe-target rejection on an
  explicitly disposable local database. Down migrations are not part of the
  forward-only canonical strategy; reset is the safe local recovery path.
- Security: Required — Studio/tool execution, external model configuration,
  synthetic identity, local database reset, and trace data trigger review.

## Milestones

- [x] M1 — Exploration and acceptance design
    - Objective: map repository paths, CLI/core surface, architecture constraints,
      all ACs, and proportional verification.
    - Components: feature artifacts, backend/database/prompt source, manifests,
      Compose, architecture docs, installed Mastra types and CLI help.
    - Acceptance criteria: planning support for AC-1–AC-23.
    - Required tests: read-only inspection; CLI version/help verification.
    - Evidence: repository exploration and product audit completed 2026-08-12;
      the lockfile-resolved `mastra --version` reports `1.25.0`.
- [x] M2 — Canonical registry and deterministic primitives
    - Objective: create the canonical composition factory/root and module-owned,
      development-only agent/tool/workflow/scorer with validated request context,
      local prompt behavior, cancellation, and sanitized trace events.
    - Components: backend Mastra root, development verification application port
      and infrastructure primitives, prompts package, configuration, unit tests.
    - Acceptance criteria: AC-2–AC-4, AC-7–AC-13, AC-16, part of AC-6/AC-19.
    - Required tests: registry/gating, schemas, prompt mode, missing credentials,
      application service, cancellation, scorer, trace sanitization.
    - Evidence: 31 focused unit tests and live API/Studio execution passed.
- [x] M3 — Isolated playground lifecycle
    - Objective: implement strict environment validation, PostgreSQL-only clients,
      application migration runner, development fixture schema/seed, repository,
      non-destructive provision, and guarded reset.
    - Components: `@languon/database`, backend database infrastructure,
      playground scripts, disposable integration suite.
    - Acceptance criteria: AC-10, AC-17–AC-23.
    - Required tests: full disposable PostgreSQL lifecycle and unsafe-target matrix.
    - Evidence: disposable PostgreSQL journey and schema check passed.
- [x] M4 — Developer command and documentation
    - Objective: wire root/backend/Turbo commands, Compose health wait, prompt
      watch, Mastra dev, graceful shutdown, optional live smoke, and docs.
    - Components: manifests/lockfile/Turbo, process orchestrator, `.env.example`,
      development documentation and request-context presets.
    - Acceptance criteria: AC-1, AC-5–AC-6, AC-8–AC-9, AC-11, AC-13–AC-14.
    - Required tests: command configuration plus real server/API/browser/hot-reload
      checks; optional smoke remains excluded without credentials.
    - Evidence: real root startup, API/browser discovery/execution, both hot-reload
      paths, shutdown, docs, and user-flow traceability passed.
- [x] M5 — Full validation, independent review, and integration
    - Objective: run affected and full repository checks, real DB/Studio evidence,
      independent correctness/security review, remediation, artifact completion,
      and squash integration to `main`.
    - Components: whole diff and feature artifacts.
    - Acceptance criteria: AC-1–AC-23 and Definition of Done.
    - Required tests: affected tests/typecheck/lint/build, `pnpm check`, Studio/API,
      database lifecycle, review reruns after fixes.
    - Evidence: full repository checks, disposable PostgreSQL, live hardened API,
      browser acceptance, independent correctness/test/security review, and all
      remediation reruns passed.

## Progress

- 2026-08-11 — Scaffold plan created.
- 2026-08-12 — Confirmed dedicated feature branch and clean starting worktree;
  read root/backend instructions, feature, architecture, development docs, and
  ADR index; no accepted ADRs exist.
- 2026-08-12 — Completed read-only architecture/execution-path and product/AC
  audits; no stakeholder blocker found.
- 2026-08-12 — Added and locked the workspace-local `mastra@1.24.0` CLI and
  verified its version and `dev`/`build` options.
- 2026-08-12 — Independent architecture review found AC-19 contradicts the
  current repository and explicit scope: no product user/authorization
  repository exists, while harness-only business schema is forbidden. Current:
  obtain the product-boundary decision described in Remaining work before M2.
- 2026-08-16 — Switched to the feature branch and merged local `main` in merge
  commit `920446b`. Resolved manifest/lockfile conflicts by retaining the
  authentication/database dependencies and workspace Mastra CLI.
- 2026-08-16 — The merged ADR-0001/ADR-0002 user model, repository, and
  canonical migrations resolve the former AC-19 blocker. Current: implement M2
  against the product-owned user path, then the isolated lifecycle in M3.
- 2026-08-16 — Completed M2–M4: canonical explicit-gated composition,
  module-owned primitives, keyless tripwire behavior, isolated provision/reset,
  checked-in fixture and prompt, root orchestration, presets, and documentation.
- 2026-08-16 — Passed `pnpm check`, `pnpm db:check`, synchronized both affected
  user-flow mappings, passed the disposable database journey, and completed live
  API, Studio, hot-reload, and shutdown acceptance. Independent tester rerun
  found coverage sufficient with no material remaining test gap.
- 2026-08-16 — Independent review found and remediation fixed built migration
  discovery, request-context defaulting, lifecycle lock scope, caller-controlled
  generated-agent policy overrides, database aliases, telemetry, modern step
  limits, and prefix-based mutation authorization. Final correctness, tester,
  and security verdicts are Pass with no material finding or coverage gap.

## Decisions

- D-001 — Canonical composition with explicit development inclusion
    - Context: CLI and backend need one registry while permanent verification
      primitives must never appear in production.
    - Choice and rationale: `src/mastra/index.ts` owns a side-effect-light factory
      and the canonical export. Development primitives are included only through
      an explicit harness flag validated for development/test; the backend adapter
      re-exports the canonical instance.
    - Alternatives rejected: a Studio-only registry duplicates definitions;
      `NODE_ENV !== production` alone could expose fixtures unintentionally.
    - ADR impact: Not ADR-worthy; this is feature-local composition following the
      documented infrastructure boundary.
- D-002 — Strict playground target policy
    - Context: reset and direct tool execution must be incapable of selecting
      ordinary/shared environments.
    - Choice and rationale: require separate target and admin URLs; accept only
      PostgreSQL on loopback, require target names beginning with the exact
      `languon_mastra_playground` prefix, require an admin database of `postgres`,
      require matching authority, reject production/staging/shared names, and use
      `DATABASE_URL` only as a negative same-name alias guard.
    - Alternatives rejected: deriving from `DATABASE_URL`, schema-only isolation,
      host allowlists containing non-loopback names, or name-substring heuristics.
    - ADR impact: Not ADR-worthy; this safeguards the local-only harness.
- D-003 — Persisted synthetic principal path (resolved after main merge)
    - Context: AC-19 needs a real synthetic row and repository/authorization path,
      while the feature forbids inventing product business tables or migrations.
    - Choice and rationale: seed one deterministic active user through the
      product-owned `UsersUnitOfWork` after canonical migrations, then resolve it
      through a narrow development-verification application service and the
      read-only Drizzle user repository. Context selects the fixture but never
      authenticates an arbitrary identifier.
    - Alternatives rejected: a playground-only table violates canonical schema
      parity; raw/in-memory context is not persisted; accepting arbitrary context
      IDs would treat caller input as proof of authentication.
    - ADR impact: None; the accepted authentication/user decisions own the
      product model and the harness only supplies synthetic local fixtures.
- D-004 — Deterministic default, explicit live model
    - Context: the server must boot without external credentials and tests may not
      call paid/nondeterministic services.
    - Choice and rationale: all default verification uses a tool/workflow/scorer;
      the agent resolves one configured OpenAI model only at invocation and aborts
      through a sanitized tripwire if `OPENAI_API_KEY` is absent. A live test is
      separately named and opt-in.
    - Alternatives rejected: startup credential requirement, provider fallbacks,
      mocked default model calls, or silently disabling the registered agent.
    - ADR impact: Not ADR-worthy; provider strategy remains explicitly out of scope.
- D-005 — Narrow generated-server mutation and model policy
    - Context: Mastra's generated local API otherwise permits caller-selected
      model, instructions, provider settings, tools, and other mutable surfaces.
    - Choice and rationale: enforce loopback Host/Origin, exact verification-only
      mutation actions, fixed model/prompt/tool/version policy, body/time/step and
      concurrency limits, disabled generic model proxies, and telemetry opt-out at
      both orchestration and canonical-entry boundaries.
    - Alternatives rejected: trusting loopback alone leaves DNS rebinding and
      arbitrary local-process cost overrides; deploying authenticated Studio is
      explicitly out of scope.
    - ADR impact: None; this is a local feature security boundary and makes no
      production authentication or deployment decision.

## Discoveries

- `mastra dev` takes directory/root/env inputs but no host/port flags; bind and
  OpenAPI settings belong in `Mastra.server` (`host` defaults to `localhost`,
  port to `4111`, `apiPrefix` to `/api`).
- Mastra 1.57 supports Zod `requestContextSchema` on agents, tools, workflows,
  and steps, validated tool output schemas, `AbortSignal`, registered tools and
  scorers, code scorers, and server OpenAPI configuration.
- The CLI resolved to `mastra@1.25.0` and reports a peer warning because its
  deployer declares `@hono/node-server@^1.19.11` while the backend uses `2.1.0`;
  real startup/build verification must determine whether this is material.
- The prompt package is consumed from built output, so root orchestration needs
  a prompt-package watcher for source prompt hot reload.
- AC-19 cannot be met in the current repository without either changing the
  criterion or broadening scope to a product-owned user/authorization feature.
  This conflicts with `FEATURE.md` lines 39–44 and 230–234 and is a genuine
  behavior-affecting specification blocker.
- The 2026-08-16 merge introduced the product-owned user/authentication slice,
  so the preceding AC-19 discovery is historical and no longer blocks work.
- Architecture review recommends ADRs for the single composition-root convention
  and canonical migration format/ledger before those become future constraints.

## Validation

| Check              | Status | Evidence                                     |
| ------------------ | ------ | -------------------------------------------- |
| Unit               | Passed | 31 focused; 194 backend tests passed.        |
| Integration        | Passed | Disposable database journey.                 |
| Contract           | Passed | Live generated API discovery/execution.      |
| E2E                | Passed | Mapped disposable PostgreSQL system journey. |
| Browser/device     | Passed | Studio discovery/tool/context; no JS error.  |
| Typecheck          | Passed | Full `pnpm check`.                           |
| Lint               | Passed | Full `pnpm check`.                           |
| Build              | Passed | Full `pnpm check`.                           |
| Database migration | Passed | Create/migrate/idempotence/isolation/reset.  |
| Independent review | Passed | Correctness and test reviews passed.         |
| Security review    | Passed | Final re-review found no material finding.   |

## Remaining work

None. The feature is verified and ready for its required squash integration.
