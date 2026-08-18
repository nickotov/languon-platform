---
feature: release-deployment-platform
title: Release and Deployment Platform
status: current
last_verified: 2026-08-18
surfaces:
    - cli
    - system
source_paths:
    - .agent/features/release-deployment-platform/**
    - .github/workflows/**
    - .env.example
    - README.md
    - apps/admin/next.config.mjs
    - apps/admin/src/app/healthz/**
    - apps/backend/package.json
    - apps/backend/src/app.ts
    - apps/backend/src/config/environment.ts
    - apps/backend/src/index.ts
    - apps/backend/src/infrastructure/database/**
    - apps/backend/src/infrastructure/server/**
    - apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts
    - apps/backend/src/modules/health/**
    - apps/web/next.config.mjs
    - apps/web/src/app/healthz/**
    - apps/web/src/fsd/shared/api/auth-api.ts
    - docs/architecture.md
    - docs/operations/**
    - infra/backup/**
    - infra/deploy/**
    - infra/docker/prod.*.Dockerfile
    - infra/nginx/**
    - package.json
    - pnpm-workspace.yaml
    - scripts/check-user-flow-guides.mjs
    - scripts/deploy-release.mjs
    - scripts/migration-classification.mjs
    - scripts/release-*.mjs
    - scripts/resources/**
e2e_command: deployment-local-rehearsal
e2e_tests:
    - infra/deploy/tests/local-rehearsal.journeys.test.mjs
e2e_scenarios:
    - local-deploy-verify-rollback
related_features:
    - user-authentication
---

# Release and Deployment Platform

## What this verifies

This guide proves that an operator can exercise the production packaging and
one-host staging deployment contract without a server or cloud account. The
disposable journey builds the real production images, starts isolated
PostgreSQL/Redis and the stable NGINX edge, deploys an application slot, verifies
it, proves a real migrator connection failure leaves that slot active, promotes
a distinct second release identity, rolls back to the previous immutable
manifest, and verifies again.

The same deployment library is used by staging and production. Local rehearsal
does not prove GitHub events/approvals, GHCR permissions, Timeweb networking,
public DNS/TLS, external monitoring, VPS performance, or off-host recovery.
Those boundaries require workflow contract tests and the staged launch checks in
the [operations handbook](../operations/README.md).

## Start the development environment

Install Node.js 24, enable the repository pnpm version through Corepack, ensure
OpenSSL is available for the disposable one-day localhost certificate, and
start a local Docker Engine with Compose. The rehearsal refuses `DOCKER_HOST`
and non-Unix Docker endpoints to prevent accidental execution against a shared
host.

From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
unset DOCKER_HOST
docker context show
docker info
```

Confirm the displayed context is the intended local engine. The rehearsal uses
only synthetic local secrets/data, loopback ports `18080`, `18443`, and `18444`, the fixed
`languon-local-stage-*` Compose scope, and state below
`infra/deploy/.local/`. Do not provide a staging/production environment file.

If a prior interrupted rehearsal exists, inspect only its fixed prefix and run
the documented cleanup before starting:

```sh
docker ps --all --filter label=com.docker.compose.project --format '{{.Names}}'
pnpm deploy:local:down
```

## CLI verification

1. Build production images and deploy the first local slot:

    ```sh
    pnpm deploy:local
    ```

    Expect a successful audit JSON with `environment: "stage"`, the local source
    SHA, `outcome: "succeeded"`, and active slot `blue`. The migrator must finish
    before applications start.

2. Verify the persisted active deployment without rebuilding:

    ```sh
    pnpm deploy:local:verify
    ```

    Expect the state to identify the same source SHA/slot and all dependency-aware
    readiness plus edge smoke checks to pass.

3. Run another local deployment to exercise the inactive slot and graceful
   NGINX switch:

    ```sh
    pnpm deploy:local
    pnpm deploy:local:verify
    ```

    Expect the active slot to change to `green`; only after NGINX has reloaded and
    old workers have drained may `blue` be removed. PostgreSQL and Redis volumes
    remain running and intact.

4. Promote the recorded previous immutable manifest through the ordinary gates:

    ```sh
    pnpm deploy:local:rollback
    pnpm deploy:local:verify
    ```

    Expect a new successful audit, active `blue`, and the release identity from
    the previous manifest. Rollback must not run a down migration.

The single mapped E2E command performs this success/failure sequence and always
runs scoped cleanup:

```sh
LANGUON_DEPLOY_E2E=true node --test infra/deploy/tests/local-rehearsal.journeys.test.mjs
```

## System verification

While a local deployment is active:

1. Request `http://127.0.0.1:18080/healthz`. Expect an HTTP `308` redirect to
   HTTPS; plaintext is never served by the application edge.
2. Request `https://localhost:18443/healthz` while trusting only the generated
   `infra/deploy/.local/tls/tls.crt`. Expect HTTP `200` and the deployed
   release/source identity.
3. Request `https://localhost:18443/api/readyz` with the same certificate.
   Expect HTTP `200`; NGINX removes
   `/api` and backend readiness proves PostgreSQL and Redis connectivity.
4. Request `https://localhost:18443/edge-healthz`. Expect HTTP `200` from the
   stable edge.
5. Request `https://localhost:18444/healthz` from the local machine. Expect the
   admin release identity. Confirm the port is bound to loopback, not a LAN
   address.
6. Inspect the fixed rehearsal projects and confirm one active application slot,
   one stable edge, and one data project. During a switch both app slots may
   coexist; after drain only the active slot remains.

The production topology additionally requires external denial tests for
PostgreSQL/Redis/admin and a private app-to-data readiness check. Do not point
this local journey at a remote engine to simulate that boundary.

## E2E coverage

- `local-deploy-verify-rollback` — the real local Docker journey builds the
  production artifacts, deploys and verifies the first slot, proves a failed
  real migration preserves it, promotes a distinct second release identity,
  rolls back through the persisted previous manifest, verifies again, and
  removes its fixed disposable resources.

Workflow trigger/ref restrictions, immutable manifest validation, deployment
serialization, readiness failure ordering, sanitized audit behavior,
and NGINX configuration failure are deterministic contract/integration tests.
They stay at that cheaper layer because a local process cannot truthfully
reproduce GitHub's release, environment-approval, GHCR, or Timeweb control
planes. Open-stream drain behavior requires its dedicated deployment integration
test and staging acceptance evidence; the mapped journey must not overclaim it.

## Expected failure and edge cases

| Condition                                                  | Expected result                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `DOCKER_HOST` is set or context endpoint is not local Unix | Rehearsal refuses before creating resources.                        |
| Production image or migration build fails                  | No traffic switch; command reports the failing build/log.           |
| Migrator fails                                             | Inactive applications do not start and current slot remains active. |
| Backend cannot reach PostgreSQL/Redis                      | `/readyz` fails; inactive slot is removed without switching.        |
| Web/admin release identity differs from manifest           | Readiness fails closed.                                             |
| NGINX configuration validation fails                       | Previous upstream file/active slot remains selected.                |
| Existing connection exceeds drain deadline                 | Audit records forced drain; bounded Compose termination applies.    |
| Rollback has no previous manifest                          | Command refuses without changing traffic or schema.                 |
| Loopback ports already in use                              | Startup fails without using alternate/public ports implicitly.      |
| Interrupted run leaves local resources                     | Inspect fixed prefix, then run scoped `deploy:local:down`.          |

Migration and readiness failure assertions run against controlled deployment
fixtures. A real shared database failure or destructive migration is never
introduced for verification.

## Automated regression checks

Validate deterministic deployment, workflow, manifest, and guide contracts:

```sh
node --test infra/deploy/tests/*.test.mjs
node --test scripts/release-manifest.test.mjs scripts/release-workflow-contract.test.mjs
pnpm user-flow:e2e -- inspect release-deployment-platform
pnpm user-flow:e2e -- check release-deployment-platform
pnpm docs:user-flows:check
```

Run the mapped real-Docker journey explicitly after reviewing its local safety
and cleanup boundaries:

```sh
LANGUON_DEPLOY_E2E=true node --test infra/deploy/tests/local-rehearsal.journeys.test.mjs
```

Resource sizing is separate from correctness. Run `pnpm resources:profile`
before purchasing and use `--record` only from an intentional clean revision.
The full GitHub/Timeweb path still requires the first staging rehearsal, external
port/TLS checks, alert delivery, and a timed off-host restore drill.

## Troubleshooting

- Refusal mentions `DOCKER_HOST`: unset it and inspect the context; never bypass
  the guard for a remote/shared engine.
- Port `18080`, `18443`, `18444`, or `5500` is occupied: identify the owning local process
  or prior fixed-name rehearsal registry. Do not broaden bind addresses.
- Image pull by digest fails: confirm the loopback registry is running and the
  manifest uses its pushed repository digest.
- PostgreSQL/Redis stays unhealthy: inspect only
  `languon-local-stage-data` logs and confirm the fixed synthetic configuration;
  do not substitute shared URLs.
- Backend is live but unready: inspect dependency health and release identity;
  `/livez` alone is never a deployment gate.
- NGINX returns `502`: inspect the active upstream include, edge network aliases,
  and active-slot health before retrying. Do not manually edit persisted state.
- Rollback reports no previous manifest: complete two successful local deploys
  first.
- A build is slow or exhausts Docker disk: use the resource profiler to record
  evidence, then remove only reviewed unused local images/build cache outside
  this guide.

## Cleanup

The mapped E2E runs cleanup in `finally`. After manual verification, remove only
the fixed local rehearsal containers, networks, volumes, registry, runtime, and
state:

```sh
pnpm deploy:local:down
```

Confirm no fixed rehearsal project remains. This cleanup intentionally deletes
the disposable local PostgreSQL/Redis volumes. It must refuse a remote Docker
endpoint and must never target staging, production, generic Docker resources,
or repository-wide data. Raw resource-profiler artifacts are separate and are
not removed by deployment cleanup.
