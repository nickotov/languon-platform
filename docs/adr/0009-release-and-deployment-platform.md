# ADR-0009: Release and deployment platform

Status: Accepted
Date: 2026-08-18
Supersedes: None

## Context

Languon has a development Docker Compose stack but no production packaging,
release qualification, deployment topology, traffic handoff, or operational
recovery contract. The initial shared environment will be staging on one VPS.
Production will later isolate application services from PostgreSQL and Redis on
at least two VPSs.

Web and backend traffic can include long-lived AI streaming responses. Replacing
containers in place can terminate those connections. Database migrations also
need coordination with both the old and new application versions during a
zero-downtime rollout. Accepted ADR-0002 already requires explicit singleton
migrations and expand/migrate/contract compatibility, but it does not choose a
deployment model.

The stakeholder requires CI tests to run only for an explicitly initiated
staging delivery or a production release version. Production deployment must be
a separate manual promotion after the release has passed tests and produced an
immutable build. The implementation should work on ordinary Docker VPSs and
remain portable beyond the initial Timeweb Cloud provider.

The stakeholder approved this strategic deployment, infrastructure, security,
and cost decision on 2026-08-18 before implementation began.

## Decision

### Release and promotion

- GitHub Actions is the automation control plane and GHCR is the OCI registry.
- No workflow runs tests merely because a commit is pushed or a pull request is
  opened. Contributors use local checks before creating a release or staging
  delivery.
- A manually dispatched staging workflow checks out the current `stage` branch
  commit and executes one reusable verify/build contract. If and only if every
  check and image build passes, the same authorized workflow deploys the exact
  resulting image digests to staging. Concurrent staging deployments are
  serialized.
- Publishing a GitHub release with a strict `vMAJOR.MINOR.PATCH` version triggers
  the same verify/build contract. The workflow rejects a release whose target
  commit is not reachable from `main`. It publishes immutable images and a
  release manifest but never deploys.
- Production deployment is a separate manual workflow protected by the GitHub
  `production` environment. It accepts only a build-ready release manifest and
  deploys the recorded digests without rebuilding or resolving mutable tags.
- The manifest and deployment audit record contain source/release identities,
  image digests, workflow identity, migration state, actor, timings, and result.
  They contain no secrets or user data.

### Runtime deployment

- Each application host has one stable NGINX edge and two named application
  slots, blue and green, managed with Docker Compose.
- A deployment obtains an environment lock, resolves the inactive slot, applies
  the release's one-shot migration, starts the inactive web/backend/admin set,
  waits for readiness, and runs smoke checks through the edge network.
- The runner renders an NGINX upstream include for the inactive slot, validates
  the complete NGINX configuration, and reloads NGINX. New connections then use
  the new worker/upstream while old workers and the old application slot remain
  available for existing connections.
- The runner waits until old NGINX workers have drained, with a maximum selected
  policy of five minutes for launch. It removes the old slot only after drain;
  at the deadline it records the forced termination and uses the bounded
  Compose stop policy. Streaming proxy buffering is disabled and relevant
  timeouts are at least the drain limit.
- Failure before a successful NGINX reload leaves the current active slot
  selected. Failure after switching invokes a validated switch back to the
  previous digest set when its database compatibility contract still holds.
- Backend, web, and admin handle termination within the configured grace period.
  Backend stops accepting connections, completes active requests/streams, and
  closes database/cache clients before its hard deadline.

### Health and migrations

- Liveness reports process state. Readiness separately proves that the instance
  can serve traffic and, for backend, can reach required PostgreSQL and Redis
  dependencies. Health output includes a non-secret release/source identity.
- Migrations are never run by ordinary application startup. A built one-shot
  migrator runs once per deployment before the inactive application slot starts,
  uses one database connection, and retains ADR-0002's advisory lock, ordered
  history, and checksum validation.
- A release may apply only migrations compatible with the currently active
  application. Destructive contract work ships in a later release after the old
  application is no longer a rollback target.
- If migration fails, traffic is not switched. Application rollback never
  automatically runs a down migration; forward correction is preferred unless
  an explicitly safe reversible migration was separately designed and tested.

### Environment topology

- Staging initially uses one VPS for NGINX, PostgreSQL, Redis, the migrator, and
  two transient generations of application containers. Database/cache ports are
  not published. Persistent data volumes are independent of application slots.
- Production uses at least two VPSs: an application VPS for NGINX and application
  slots, and a data VPS for PostgreSQL and Redis. The two communicate through a
  private provider network. PostgreSQL/Redis accept only explicit private
  application sources and are never exposed to the public internet.
- PostgreSQL and Redis sharing the data VPS is an accepted launch-stage failure
  domain. Backups are copied to private S3-compatible object storage and restore
  drills target a 24-hour RPO and four-hour RTO. Provider snapshots supplement
  rather than replace database-aware backups.
- Admin and host management use a private operator network. GitHub-hosted deploy
  jobs receive ephemeral Tailscale access; application hosts do not run a
  privileged self-hosted GitHub runner.
- Environment-specific values, credentials, domains, and provider identifiers
  are runtime configuration outside images. Secrets live only in protected
  GitHub environments and root-owned server files with least-privilege access.

### Portability, observability, and capacity

- The core relies on OCI images, Docker Compose, NGINX, SSH, Tailscale, and
  S3-compatible backup storage. Timeweb-specific BGP network, firewall, server,
  DNS, backup, and monitoring instructions are isolated in an operations
  appendix.
- Sentry and Grafana Cloud-compatible telemetry provide managed error,
  log/metrics, and alert destinations. Provider-native uptime monitoring is an
  additional external signal, not the sole observability path.
- A repository command performs clean production builds and controlled runtime
  load measurements, preserves ignored raw artifacts, and explicitly appends
  sanitized normalized observations to tracked history. A generated
  self-contained HTML dashboard visualizes comparable trends.
- VPS sizes remain provisional until measured. Capacity keeps normal sustained
  CPU, memory, and disk below 70% and reserves enough application-host headroom
  to run the inactive slot during deployment.

## Alternatives considered

### In-place Docker Compose replacement

This is simpler but removes containers while they still own active requests or
streams. Docker stop grace alone cannot redirect new connections away from the
old generation before termination. It does not satisfy the connection-preserving
requirement.

### Docker Swarm or Kubernetes rolling updates

Both provide service orchestration and health-gated rollout, but add a control
plane, networking model, and operating burden disproportionate to one
application host. Compose blue/green with stable NGINX provides the required
behavior while preserving a migration path to an orchestrator later.

### Provider-managed application platform

This reduces host setup but couples promotion, traffic draining, private
networking, and runtime behavior to provider capabilities. The selected design
keeps Timeweb as a replaceable infrastructure adapter and gives explicit control
over five-minute streams and migration order.

### Automatic deployment from a release

It shortens delivery but collapses qualification and production authorization.
The stakeholder explicitly requires a successful ready build followed by a
separate manual production promotion.

### CI on every push or pull request

It provides earlier feedback but conflicts with the chosen trigger/cost policy.
The accepted tradeoff is later CI feedback, mitigated through documented local
checks and the mandatory staging/release verification contract.

### Build independently in staging and production deployment jobs

Rebuilding can yield different dependencies or base-image content for the same
source revision and makes rollback ambiguous. Immutable digest manifests provide
stronger provenance and ensure production deploys exactly what passed release
verification.

### Share staging and production data infrastructure

This saves cost but creates security, resource, migration, and failure coupling.
Staging stays entirely independent; its first data services run on its own
all-in-one VPS.

### Automatically reverse migrations during rollback

Destructive or reinterpretive down migrations can lose data and contradict
ADR-0002. Backward-compatible releases allow application rollback while schema
correction moves forward.

### Self-host a GitHub Actions runner on the application VPS

It simplifies private access but places a repository-controlled privileged
execution agent on the production host. Ephemeral private-network access from a
GitHub-hosted job preserves a smaller trust boundary.

## Consequences

### Positive

- Staging exercises essentially the same artifact, migration, readiness,
  traffic, rollback, and audit contracts used by production.
- Production promotion is deliberate and reproducible; deployment never changes
  the already-tested artifact.
- Existing HTTP and AI streaming connections can finish while new traffic moves
  to the new generation.
- Provider-specific provisioning does not leak into application packaging or
  deployment state transitions.
- Capacity decisions become repeatable evidence rather than estimates based on
  development caches.

### Negative

- Every application host needs capacity for two generations during deployment,
  and staging additionally carries both data services.
- Release-only CI finds integration failures later than push/PR CI.
- Blue/green scripts, NGINX worker-drain observation, manifest validation, and
  migration compatibility create operational code that requires its own tests.
- Initial staging and production data topology contain single-host failure
  domains and require restore discipline.
- Tailscale, GHCR credentials, managed observability, and object storage add
  external configuration and secret-rotation responsibilities.

### Risks / limitations

- A stream longer than five minutes can be terminated at the selected drain
  deadline. Raising the limit increases overlap resource usage and deployment
  duration.
- NGINX graceful reload protects connections it owns; the old application slot
  must not be removed merely because the new slot is healthy.
- Backward-compatible migration discipline is a human and automated review
  responsibility. Blue/green cannot make destructive schema changes safe.
- The production data VPS is not highly available. The selected 24h RPO/4h RTO
  depends on successful off-host backups and practiced restore.
- Host fingerprint differences can make resource-history trends misleading;
  the profiler must mark comparability and retain raw evidence locally.
- Timeweb control-panel behavior and product names may change. The provider
  appendix must link current official docs and be rechecked before provisioning.

## Related

- [Release and deployment feature](../../.agent/features/release-deployment-platform/FEATURE.md)
- [Release and deployment ExecPlan](../../.agent/features/release-deployment-platform/EXEC_PLAN.md)
- [ADR-0002: Drizzle schema and migration strategy](./0002-drizzle-schema-and-migration-strategy.md)
- [Architecture](../architecture.md)
- [NGINX signal control](https://nginx.org/en/docs/control.html)
- [Docker Compose stop grace period](https://docs.docker.com/reference/compose-file/services/#stop_grace_period)
- [GitHub release workflow event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)
- [Timeweb BGP private networks](https://timeweb.cloud/docs/vpc/managing-bgp-networks/creating-bgp-networks)
