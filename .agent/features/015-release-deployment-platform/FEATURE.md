# Release and deployment platform

Status: Complete
Owner: nickkotov
Created: 2026-08-18

## Problem

Languon has development-only Docker configuration but no reproducible production
images, release-only CI, deployment automation, graceful traffic handoff,
production migration procedure, resource-sizing workflow, or provider runbook.
Deploying the current repository would require undocumented manual choices and
could interrupt web requests or backend streams when a container is replaced.

The first shared environment will be staging on one VPS. Production will later
use at least one application VPS and a separate PostgreSQL/Redis VPS. Both
environments need the same tested deployment mechanism without coupling the
implementation to Timeweb Cloud.

## Desired behavior

Languon builds immutable production images for the web, admin, backend, and
one-shot migrator. A single provider-neutral deployment contract supports:

- a manually started staging flow sourced from the `stage` branch that tests,
  builds, migrates, deploys, and verifies in one authorized run; and
- a production flow where publishing a SemVer GitHub release from `main` tests
  and builds only, followed later by a separate manual deployment of that exact
  successful release.

Deployments use a stable NGINX edge and two application slots. The inactive slot
becomes ready before NGINX sends it new traffic. NGINX reloads gracefully, the
old slot remains alive while existing web/backend connections drain for up to
five minutes, and only then is it removed. A failed migration, readiness check,
smoke check, or traffic switch leaves the active slot serving traffic.

Staging initially runs application slots, NGINX, PostgreSQL, and Redis on one
VPS with separate persistent data volumes. Production runs NGINX and application
slots on an application VPS while PostgreSQL and Redis run on a dedicated data
VPS reachable over a private network. Production database/cache ports are never
publicly exposed.

A separate local profiler performs clean production Docker builds and controlled
runtime load checks. It records comparable measurements in append-only history
and generates a self-contained HTML dashboard so resource growth can be reviewed
before VPS sizing or release decisions.

## Acceptance criteria

- [x] AC-1 — Checked-in production Dockerfiles produce minimal, non-root,
      health-checkable images for backend, web, admin, and a one-shot migrator;
      images contain only required runtime output, are labeled with the source
      revision, and run on the repository's Node.js 24 contract.
- [x] AC-2 — A reusable verification/build workflow performs frozen dependency
      installation, formatting, lint, typecheck, tests, migration checks, and
      production builds once for a selected immutable commit, then publishes
      GHCR images plus a manifest of exact image digests and verification
      metadata.
- [x] AC-3 — Ordinary pushes and pull requests do not trigger CI. Publishing a
      valid `vMAJOR.MINOR.PATCH` GitHub release whose target commit belongs to
      `main` triggers production verification/build but never deployment. A
      failed or incomplete release is not selectable for deployment.
- [x] AC-4 — A manually dispatched staging workflow always selects the current
      `stage` branch commit, runs the same verification/build contract, and,
      after all checks pass, deploys that exact digest set without requiring a
      second approval. Concurrent staging deployments are serialized.
- [x] AC-5 — A separate manually dispatched production workflow accepts only a
      successful build-ready SemVer release, resolves its immutable manifest,
      uses a protected GitHub `production` environment, and never rebuilds or
      substitutes mutable image tags during deployment.
- [x] AC-6 — The deployment runner uses a stable NGINX edge plus blue/green
      application slots. It starts the inactive slot, waits for readiness and
      smoke checks, atomically reloads validated NGINX configuration, prevents
      new traffic reaching the old slot, waits for existing connections to drain
      for at most five minutes, and removes the old slot only after drain or the
      documented deadline policy.
- [x] AC-7 — Backend shutdown stops accepting new connections, drains active
      work and streaming responses, closes PostgreSQL/Redis clients, and has a
      bounded termination deadline aligned with Compose. Web and admin also
      receive sufficient graceful-stop time. Automated verification covers
      in-flight HTTP and streaming traffic during a slot switch.
- [x] AC-8 — Backend exposes separate liveness and dependency-aware readiness
      behavior including release identity; web and admin expose readiness
      endpoints. Deployment checks run from the same network path NGINX uses and
      fail closed when PostgreSQL, Redis, or an application is unavailable.
- [x] AC-9 — Every deployment runs the built one-shot migrator exactly once
      before the inactive slot starts. The migrator uses its own one-connection
      credential and the existing advisory lock/history checks. Only
      backward-compatible expand/migrate changes may precede a traffic switch;
      destructive contract migrations require a later release after old code is
      no longer deployable.
- [x] AC-10 — Migration failure leaves the active slot untouched. Application
      rollback redeploys the previous digest set without an automatic down
      migration. A recent successful backup and restore procedure is verified
      before production schema changes, and forward correction is the default
      data rollback strategy under ADR-0002.
- [x] AC-11 — Staging composition supports NGINX, two transient generations of
      web/backend/admin, PostgreSQL, Redis, and the migrator on one VPS without
      publishing database/cache ports. Production composition places application
      and data services on separate VPSs and restricts PostgreSQL/Redis to the
      private network and explicit application sources.
- [x] AC-12 — Admin is private by default, reachable only through the approved
      operator network. Secrets stay in GitHub environment secrets or root-owned
      host files, never in images, Compose files, logs, manifests, dashboard
      history, or repository examples.
- [x] AC-13 — `pnpm resources:profile` performs production image builds plus
      idle, representative-load, and blue/green-overlap measurements. It records
      revision, host fingerprint, build duration/peak resource use, image size,
      container CPU/RSS, disk use, throughput, latency percentiles, and errors;
      unsafe or incomparable results are clearly labeled.
- [x] AC-14 — Resource profiling writes ignored raw artifacts and a
      self-contained HTML dashboard, while an explicit `--record` mode appends a
      sanitized normalized JSONL observation to a durable history. The dashboard
      shows trends and highlights threshold regressions without an external
      service or credentials.
- [x] AC-15 — A provider-neutral operations guide documents provisioning,
      configuration, deploy, rollback, migration, backup/restore, secret
      rotation, monitoring, capacity review, and disaster recovery. A Timeweb
      Cloud appendix gives current control-panel steps for the staged one-VPS
      launch and later two-VPS production topology, including BGP private
      networking, firewall/DHCP considerations, DNS, Docker, NGINX, S3 backups,
      and monitoring.
- [x] AC-16 — Staging and production deployments emit a concise audit record
      containing actor, environment, source revision, release where applicable,
      image digests, migration ledger state, previous/new slots, timings, and
      outcome without secrets or user data.
- [x] AC-17 — Automated contract tests exercise workflow trigger restrictions,
      manifest validation, migration ordering, readiness failure, deployment
      serialization, NGINX configuration switching, rollback, and cleanup.
      Disposable end-to-end system tests prove successful and failed blue/green
      journeys, including a connection that remains open across the switch.
- [x] AC-18 — Provisional capacity guidance and scaling triggers are documented.
      Final purchase guidance is explicitly based on profiler history and includes
      enough headroom for the inactive application generation during deployment.

## Scope

### In scope

- GitHub Actions workflows for manual staging, release verification/build, and
  manual production deployment.
- GHCR publication, immutable release manifest, deployment audit artifacts, and
  concurrency controls.
- Production Docker images and Compose overlays for edge, application slots,
  staging data services, and production data services.
- NGINX routing, TLS termination, private admin access, graceful reload/drain,
  health/readiness endpoints, and bounded process shutdown.
- Built production migration command and expand/migrate/contract deployment
  policy consistent with ADR-0002.
- Local production build/load resource profiling, append-only history, dashboard,
  provisional sizing, and capacity thresholds.
- PostgreSQL/Redis persistence, private networking, connection-budget guidance,
  backup/restore automation and documented RPO/RTO procedures.
- Provider-neutral operations documentation and a Timeweb Cloud preparation
  runbook.
- Managed error/metrics/log destinations already selected for the launch plan:
  Sentry plus Grafana Cloud-compatible telemetry, with provider-native uptime
  checks as an additional signal.

### Out of scope

- Kubernetes, Docker Swarm, multi-region failover, autoscaling, or a managed
  load balancer.
- Production high availability for PostgreSQL/Redis, database replicas, or an
  automatic data-VPS failover.
- Deploying mobile applications.
- A production email provider or changing authentication product behavior.
- Building the Timeweb resources through Terraform in the first delivery;
  provider-neutral files and a reproducible panel runbook are required first.
- Automatic production deployment, automatic down migrations, or mutable
  `latest`-tag promotion.
- Making the admin application publicly available.

## Constraints and risks

- CI intentionally runs only for a manual staging invocation or a published
  production release. This detects integration failures later than push/PR CI;
  local `pnpm check` remains the contributor safety net.
- The staging VPS must fit PostgreSQL/Redis plus both application generations
  during a deploy. Capacity is provisional until the profiler produces evidence.
- Blue/green protects application traffic but not incompatible database changes.
  Every schema change needs explicit compatibility classification.
- NGINX can gracefully retain old workers, but the deployment runner must keep
  the old containers alive until those workers finish. The selected maximum
  drain is five minutes; connections exceeding it follow a documented forced
  termination policy.
- PostgreSQL and Redis on one production data VPS share a host failure domain.
  The accepted launch target is 24-hour RPO and four-hour RTO, not high
  availability.
- Timeweb private-network attachment can require a reboot or private-IP OS
  configuration. Provider operations must be scheduled separately from ordinary
  zero-downtime application deploys.
- GitHub-hosted deployment jobs need a secure route to private hosts. The design
  uses ephemeral Tailscale access rather than a privileged self-hosted runner on
  an application server.
- Production authentication email flows remain unavailable. Initial controlled
  access depends on the separately scoped invitation capability before a public
  launch.

## User-flow documentation

- Required: this feature adds executable CLI and system journeys.
- Current guide: `docs/user-flows/release-deployment-platform.md`.
- Mapped real-Docker scenario: `local-deploy-verify-rollback` in
  `infra/deploy/tests/local-rehearsal.journeys.test.mjs`.
- A separate real-Docker integration proves an open stream survives an NGINX
  switch. Workflow events/approvals, failure matrices, migration ordering, and
  readiness containment stay in deterministic contract/integration tests because
  a local process cannot truthfully reproduce GitHub or Timeweb control planes.
- Related current guides: `user-authentication` because its migration, proxy,
  cookie, production environment, and deployment source paths overlap. Its
  existing scenarios must be re-inspected and rerun after implementation.

## Open decisions

- [ADR-0009](../../../docs/adr/0009-release-and-deployment-platform.md) was
  approved by the stakeholder on 2026-08-18 and is now Accepted.
- Select concrete Timeweb region, server plans, domain names, and monthly budget
  only after the first comparable local profiler result. The design does not
  depend on those commercial selections.
- Production launch remains blocked on a production-capable enrollment/email
  decision or the separately proposed one-time invitation capability.
