---
feature: mastra-agent-development-harness
title: Mastra Agent Development Harness
status: current
last_verified: 2026-08-16
surfaces:
    - browser
    - api
    - cli
    - system
source_paths:
    - .agent/features/mastra-agent-development-harness/**
    - .agent/features/mastra-deepseek-model/**
    - .env.example
    - README.md
    - docs/development.md
    - package.json
    - turbo.json
    - scripts/dev-mastra.mjs
    - scripts/run-mastra-playground-e2e.mjs
    - apps/backend/package.json
    - apps/backend/src/infrastructure/database/**
    - apps/backend/src/infrastructure/playground/**
    - apps/backend/src/mastra/**
    - apps/backend/src/modules/development-harness/**
    - apps/backend/src/modules/users/**
    - apps/backend/tests/e2e/mastra-development-harness.journey.test.ts
    - packages/prompts/**
    - scripts/check-user-flow-guides.mjs
e2e_command: mastra-playground-vitest
e2e_tests:
    - apps/backend/tests/e2e/mastra-development-harness.journey.test.ts
e2e_scenarios:
    - playground-provision-run-persist-reset
related_features:
    - mastra-deepseek-model
    - user-authentication
---

# Mastra Agent Development Harness

## What this verifies

Use this guide to verify the local-only Mastra Server and Studio against a
dedicated PostgreSQL playground. The journey proves canonical primitive
registration, validated synthetic-principal context, deterministic tool,
workflow, and scorer execution, optional live-agent gating, canonical migration
and fixture provisioning, persistence across ordinary restarts, and guarded
reset behavior.

The harness never starts Languon's Hono, web, admin, or mobile servers. It does
not expose Mastra through the public backend, use copied user data, or provide
persistent Mastra memory, datasets, experiments, workflow state, or trace
storage. Use only the checked-in `example.test` fixture.

## Start the development environment

Install Node.js 24, enable the checked-in pnpm version, and ensure Docker is
running. Create the local environment file only when it does not exist:

```sh
corepack enable
pnpm install
if [ ! -e .env.local ] && [ ! -L .env.local ]; then
  cp .env.example .env.local
fi
```

Review the explicit `MASTRA_PLAYGROUND_*` values in `.env.local`. The target
must be loopback PostgreSQL, use a database name beginning with
`languon_mastra_playground`, select `postgres` in the separate admin URL, and be
different from `DATABASE_URL`. Do not substitute shared, staging, production,
or copied data.

`MASTRA_MODEL_ID` defaults to `deepseek/deepseek-chat`. To exercise another
Mastra-supported model, set its `provider/model` identifier as the primary and
add that provider's standard API-key variable. DeepSeek Chat remains the fixed
fallback, so every live agent run also requires a development-only
`DEEPSEEK_API_KEY`. Deterministic checks require neither credential.
Provider `*_BASE_URL` overrides are intentionally unsupported: the DeepSeek
fallback uses its pinned HTTPS origin, and an alternate primary uses the
selected Mastra provider's registered destination.

Start the complete harness from the repository root:

```sh
pnpm dev:mastra
```

The command builds workspace dependencies, starts only local PostgreSQL, waits
for readiness, creates or reuses the playground, applies every canonical
migration, idempotently seeds the synthetic principal, watches local prompts,
then starts Mastra. Expected local URLs are:

- Studio: `http://127.0.0.1:4111`
- generated OpenAPI document: `http://127.0.0.1:4111/api/openapi.json`

The harness makes Studio derive its API from the page origin. A
`http://localhost:4111` alias that resolves to IPv4 loopback is therefore also
same-origin, but `127.0.0.1` is canonical because some systems resolve
`localhost` only to unbound IPv6 `::1`. The command also disables Studio's
agent thread-signaling mode because persistent Mastra memory is unavailable;
agent chat uses the bounded, normalized stream route instead.

Normal startup never drops or truncates the playground. No DeepSeek,
alternate-provider, or Langfuse credential is needed for Studio, tool,
workflow, or scorer verification. The command forces Mastra usage telemetry
off.

## CLI verification

1. Observe the startup output and confirm playground provisioning finishes
   before Mastra reports its loopback URL.
2. Confirm no Hono, Next.js, Expo, Redis, or app-profile process starts.
3. Stop with `Ctrl+C`; both Mastra and the prompt watcher should exit cleanly.
4. Start the same command again. Expect the existing database to be reused and
   the deterministic fixture to remain current.

## Browser verification

1. Open `http://127.0.0.1:4111` in a local browser.
2. Confirm the development verification agent, principal-verification tool,
   verification workflow, and principal-match scorer are discoverable.
3. Select the `synthetic-principal` request-context preset.
4. Run the tool with `{"message":"studio tool check","delayMs":0}`. Expect
   the stable synthetic principal ID, `example.test` email, selected variant,
   and a sanitized successful trace summary.
5. Run the workflow with the same input. Expect the workflow graph to show the
   verification step and the result trace path to identify that step.
6. Exercise the code scorer with the expected principal ID. Expect score `1`
   without a model request.
7. Without `DEEPSEEK_API_KEY`, invoke the agent. Expect a clear credential
   error while deterministic primitives remain usable. With an intentional
   development-only DeepSeek key, the default agent may be invoked as an opt-in
   live smoke. If `MASTRA_MODEL_ID` selects another primary, also configure
   that provider's development key and confirm Studio shows the configured
   primary. The ordered DeepSeek fallback is covered by the focused composition
   test because Studio displays only the active primary model.
8. Edit the checked-in development-harness prompt while the server is running,
   confirm the prompt package rebuilds and Studio reloads, then restore the
   intended text before committing.
9. Inspect browser errors, console output, and network requests. Expect no
   external model or application request during deterministic runs and no
   secret or raw prompt export. Mastra Studio may request a cosmetic provider
   logo from `models.dev`; the repository browser wrapper does not authorize
   that request outside its loopback allowlist.

## API verification

Fetch the generated document and discovery endpoints from another terminal:

```sh
curl --fail-with-body http://127.0.0.1:4111/api/openapi.json
curl --fail-with-body http://127.0.0.1:4111/api/tools
curl --fail-with-body http://127.0.0.1:4111/api/workflows
curl --fail-with-body http://127.0.0.1:4111/api/agents
curl --fail-with-body http://127.0.0.1:4111/api/scores/scorers
```

Expect the same development primitive identifiers visible in Studio. The Hono
backend at port `4000` is not part of this run and gains no generic Mastra route.
The local generated server accepts only its documented loopback Host and Origin,
including for internal refresh and workflow-restart hooks. Its API pins the
checked-in prompt and configured primary/DeepSeek-fallback/provider/tool
policy, rejects processor replacement and privileged message roles, bounds
agent work, strips Studio's retry default before dispatch, and rejects the
generic Responses and Conversations model proxies. It disables unsupported
thread signaling and strips Studio's inert memory envelope before dispatching
the legacy chat stream. Use Studio for
request-context form execution; exhaustive
malformed input, policy-override, DNS-rebinding, and unsafe-target cases remain
at unit and integration layers.

## System verification

Normal Studio writes must land only in `languon_mastra_playground*` and survive
a stop/start cycle. The mapped E2E journey creates a fresh disposable PostgreSQL
container, applies all migrations, verifies the fixture through the real users
repository and application service, runs the workflow and scorer, adds a marker
write, provisions again, proves the marker persisted, checks the admin database
has no application tables, refuses an unconfirmed reset, then resets and proves
only the regenerated fixture remains.

## E2E coverage

- `playground-provision-run-persist-reset` maps to
  `apps/backend/tests/e2e/mastra-development-harness.journey.test.ts`. It proves
  initial creation, forward migrations, deterministic fixture and repository
  access, validated context, workflow/scorer execution, repeated-start
  idempotency, persistence, database isolation, guarded reset refusal, and safe
  regeneration against disposable PostgreSQL.

Studio rendering and live hot reload stay in real-browser verification because
the UI is third-party development tooling. Target-policy matrices, cancellation,
production fixture exclusion, and missing-credential behavior stay in focused
unit tests.

## Expected failure and edge cases

- Missing `.env.local` stops before Docker or Mastra starts and explains the
  guarded copy step.
- Missing, malformed, non-loopback, differently credentialed, shared, or
  non-prefixed playground URLs fail before database creation.
- An arbitrary principal ID, pending user, unverified user, or absent fixture is
  rejected; request context is selection input, not authentication proof.
- Cancellation aborts delayed tool/workflow work rather than continuing a
  database lookup.
- Missing `DEEPSEEK_API_KEY` affects only live agent invocation and prevents a
  run whose declared fallback would be unavailable.
- With a different valid `MASTRA_MODEL_ID`, Mastra tries the configured primary
  with no repeated request and then `deepseek/deepseek-chat`; fallback failure
  is surfaced and no third provider is attempted.
- `DEEPSEEK_BASE_URL` or the selected provider's `*_BASE_URL` override stops
  startup rather than redirecting credentials or prompts.
- Caller-provided model, prompt, provider, structured-output model, or tool
  overrides, processor lists, privileged message roles, and other execution
  options are rejected at the generated HTTP boundary.
- A port conflict on `4111` or PostgreSQL startup failure produces a non-zero
  process result; stop the conflicting local process and retry.
- Normal startup preserves data. Reset refuses unless confirmation exactly
  matches the validated target database name.

## Automated regression checks

Run focused deterministic checks:

```sh
pnpm --filter @languon/backend typecheck
pnpm --filter @languon/backend test
node --test scripts/dev-mastra.test.mjs
```

Run the mapped disposable-database journey:

```sh
node scripts/run-mastra-playground-e2e.mjs
```

Then validate guide traceability:

```sh
pnpm user-flow:e2e -- check mastra-agent-development-harness
pnpm docs:user-flows:check
```

The disposable runner refuses to reuse a pre-existing container with its test
name and removes only the container it started.

## Troubleshooting

- If dependency builds fail, run `pnpm install --frozen-lockfile` and retry.
- If PostgreSQL is unhealthy, inspect `docker compose ps postgres`; do not point
  the harness at another environment as a workaround.
- If Studio has no fixtures, verify `MASTRA_DEV_HARNESS=true` in the harness
  process and confirm provisioning completed before Mastra startup.
- If Studio says “Failed to load studio” while `pnpm dev:mastra` is still
  running, first stop and restart the harness so its forced same-origin Studio
  setting is active, then open canonical `http://127.0.0.1:4111`. If the error
  remains, select **Reset Studio Configuration**. Mastra Studio persists its
  connection under browser-local `mastra-studio-config`, so an old instance URL
  or API prefix can survive server restarts. After the reset, Settings should
  show the page's loopback origin and API prefix `/api`. If the reset control is
  unavailable, clear site data only for the loopback Studio origin and reload;
  do not relax the server's Host/Origin policy.
- If prompt edits do not reload, confirm the `@languon/prompts` watch process is
  still running and its `dist` build succeeds.
- If agent chat returns the harness's registered-primitives mutation 403, stop
  and restart `pnpm dev:mastra`, then reload Studio. The thread-signaling flag is
  fixed when Studio starts; the restarted page must use the registered agent
  `/stream` route rather than `/threads/subscribe`.
- If agent execution fails without a key, use the deterministic tool/workflow/
  scorer checks or deliberately add a development-only `DEEPSEEK_API_KEY`.
  An alternate `MASTRA_MODEL_ID` also needs that provider's normal key. Never
  borrow a production credential.
- Persistent Mastra datasets, experiment history, workflow state, and stored
  traces are intentionally unavailable in this feature.

## Cleanup

Stop the harness with `Ctrl+C`. PostgreSQL and playground data remain available
for the next run. Stop local infrastructure without deleting volumes via
`pnpm infra:down` only when no other local Languon work needs it.

The reset below is destructive only to the positively identified playground;
its synthetic contents are recoverable by regeneration, while exploratory
Studio writes are discarded:

```sh
MASTRA_PLAYGROUND_RESET_CONFIRM=languon_mastra_playground pnpm mastra:playground:reset
```

Before running reset, confirm the name exactly matches the validated target in
`.env.local`. Never change the guard to target `languon`, `postgres`, a shared
database, staging, or production.
