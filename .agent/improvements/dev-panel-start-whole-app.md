# Improvement: Start the whole local app from the dev panel

Status: Complete
Created: 2026-09-23
Updated: 2026-09-23

## Routing decision

Focused developer-tooling improvement: compose existing local infrastructure,
build, migration, application and worker commands behind one reviewed command.
No new product journey, migration/schema, production dependency, deployment or
panel request/security contract. The user explicitly requests automatic local
migrations; the existing catalog already enables `db:migrate` individually.
That authorization overrides the skill's generic disabled-migration default for
this scoped command. Keep this migration-bearing command out of generic batches.
No commit is authorized. Preserve the unrelated dictionary design worktree.

## Context and scope

`pnpm dev` starts application servers but does not prepare infrastructure or run
workers. Add root `dev:all`, presented as **Start whole app** in Development.
Use existing `.env.local`, reject nonlocal database/cache targets, wait for
PostgreSQL/Redis health, build shared dependencies, migrate, and supervise the
backend/web/admin and dictionary worker. Stop owned processes on
failure or cancellation, retaining infrastructure and data. No mobile, Mastra
Studio, installation, Docker daemon startup, provider activation or seeding.

ADR-0014 and inherited ADR-0013 execution constraints remain unchanged: fixed
reviewed command, no browser argv/shell/environment, server-owned lifecycle.
Relevant guide: `docs/user-flows/web-dev-panel.md`.
Rollback: remove root command, runner/tests, reviewed catalog entry/conflicts and
documentation; no persistent schema or data changes introduced by this patch.

## Acceptance criteria

- AC-1: One individually runnable panel command waits for healthy infrastructure,
  builds dependencies and applies existing migrations before starting the app.
- AC-2: Backend, web, admin and required asynchronous workers run together; a
  failure stops siblings and cancellation cannot advance to the next setup step.
- AC-3: Local-development target guards, fixed commands, symmetric conflicts and
  non-batch eligibility prevent accidental duplicate or unrelated starts.
- AC-4: Actionable setup/failure logs and documented prerequisites, endpoints and
  stop behavior; existing panel controls and trust enforcement keep working.

## Plan and verification strategy

- Implement runner and synthetic process lifecycle/ordering/failure tests.
- Register/review catalog entry and symmetric conflicts; contract tests for it.
- Update README, panel docs and existing guide/traceability.
- Run focused Node tests, catalog check, lint/format, mapped panel Playwright and
  real browser inspection using the safe wrapper. Synthetic tests do not start
  databases, apps or paid providers. No schema change warrants DB tests.
- Author preflight and independent review of lifecycle and local target guards.
- Record final evidence, risks and status. No production app build is required
  for a native Node tooling change.

## Evidence and review

- Scoped native suite: `pnpm test:web-dev-panel`, 51 tests pass, including 11
  runner tests for stage ordering, prerequisite failures, cancellation, sibling
  failure, nested process cleanup, local targets and streaming secret redaction.
  Loopback HTTP and process inspection required sandbox escalation. Initial
  sandbox EPERM/ps failures were rerun with the required permissions.
- `pnpm test:e2e:web-dev-panel`: 4/4 Playwright journeys pass, including the new
  synthetic whole-app command's start, non-batch eligibility, reload and stop.
  Initial new-test selector mistakes were corrected to existing control labels,
  log markup and collapsed-on-reload behavior; no runtime behavior was weakened.
- `pnpm web-dev-panel:check`: 58 reviewed commands. Reviewed fixed runner chain,
  local environment checks, inherited process group, `logs.mjs` redactor, Compose
  config, package/Turbo commands and symmetric lifecycle conflicts. Reconciler
  also found the previously stale root `test` revision after feature-creation
  tests were added; inspected its trusted test-only source and refreshed that
  revision while preserving its existing enabled/batch policy. Purge remains
  individually disabled. No new candidate was enabled blindly.
- Scoped ESLint, Prettier, `git diff --check`, user-flow documentation validation
  and `pnpm user-flow:e2e -- check web-dev-panel` pass. Guide revision
  `sha256:d8e919c7d552f950`; four mapped scenarios.
- Turbo dry-run confirms the pre-migration build selects contracts, database,
  languages and prompts. No app build/typecheck is applicable to native Node
  orchestration and catalog/documentation changes.
- Required real-browser observation: project-pinned agent-browser 0.28.1 through
  `pnpm browser`, synthetic fixture on `127.0.0.1:4411`; observed **Start whole
  app** in Development at default desktop and 390×844 widths, no console/page
  errors and only local 200 responses plus SSE. Playwright supplies detailed
  control interaction coverage. Browser session and fixture server closed.
- Independent completion/security review: `dev_all_review`. Found a material
  destructive-worker risk: a local DB guard cannot prevent account-purge jobs
  deleting objects from remote storage. Removed account-purge startup entirely;
  it is not needed for ordinary inspection. Automatic startup now includes only
  app servers and dictionary worker. Reviewer confirmed **PASS after remediation**, with no remaining material
  findings. Also removed the unused purge database URL guard and added a
  regression proving unrelated purge configuration does not block startup.
  Final affected runner tests: 11/11 pass, independently rerun by the reviewer;
  scoped lint/format and guide mapping checks pass.

## Limitations and remaining risks

The real app stack was not launched or migrated against the user's current
local database. Tests use synthetic subprocesses and never invoke Docker,
modify application data or call providers. Docker, dependencies, compatible
local environment, available ports and configured providers are prerequisites.
Docker must use a local daemon/context: as with existing `dev:infra`, inherited
Docker host/context configuration is not constrained by the DB/cache guards.
The existing catalog revision checks the root package-script text, not transitive
runner contents; execution-source review remains required when this file changes.
This command uses existing data and migrations; it is not an isolated sandbox,
does not seed accounts, and does not reverse completed migrations. A configured
dictionary worker can consume existing queued jobs using configured providers.

Panel process-group cleanup handles orphaned subprocesses on launcher failure;
direct CLI cleanup snapshots descendants and cannot guarantee catching a child
that has already been orphaned by an unexpectedly exiting launcher. Normal
cancellation, failfast siblings and nested live descendants are tested. No
production infrastructure, schema, deployment or app behavior changed.

## Remaining work

None. Changes remain uncommitted; unrelated dictionary design work preserved.
