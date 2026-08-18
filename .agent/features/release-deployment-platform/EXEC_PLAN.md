# ExecPlan: Release and deployment platform

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-18

## Goal

Provide one reproducible, auditable release/deployment platform that can launch
staging on a single VPS now and production on separate application/data VPSs
later. Staging is manually authorized from the `stage` branch and completes
tests through deployment. Production release publication tests/builds but a
separate manual action promotes the already-built immutable release. Both paths
preserve active connections through graceful blue/green handoff and apply
database migrations safely.

The stakeholder approved this plan and ADR-0009 on 2026-08-18. Implementation
and local acceptance are complete; external provider launch checks remain
operator prerequisites rather than repository blockers.

## Specification

- In scope: See [FEATURE.md](./FEATURE.md), especially AC-1 through AC-18.
- Out of scope: Kubernetes/Swarm, automatic production deployment, data-tier HA,
  mobile delivery, production email, and first-pass Terraform provisioning.
- Strategic architecture: accepted
  [ADR-0009](../../../docs/adr/0009-release-and-deployment-platform.md).
- Existing migration constraint: accepted
  [ADR-0002](../../../docs/adr/0002-drizzle-schema-and-migration-strategy.md).

## Existing architecture

- The repository is a pnpm/Turborepo monorepo on Node.js 24. `pnpm check`
  aggregates formatting, agent-skill/docs validation, lint, types, tests, and
  builds, but there is no `.github/workflows` directory.
- `compose.yaml` and `infra/docker/dev.Dockerfile` are development-only. One
  image copies the whole repository, installs all dependencies, and runs dev
  processes. PostgreSQL 17 and Redis 8 publish loopback ports and use named
  volumes. There are no production Dockerfiles, NGINX config, deploy scripts,
  health-gated slots, or registry publication.
- Backend builds ESM with tsup and copies migration SQL to `dist/drizzle`.
  Its package has a production server entry, but the migration package command
  still invokes TypeScript source. Production needs a built one-shot migration
  entry.
- Backend handles SIGINT/SIGTERM through Node server close followed by adapter
  cleanup, but has no explicit hard deadline or acceptance test for active
  streaming requests. `/health` reports process state only.
- Web and admin are Next.js 16 applications without `output: 'standalone'` or
  readiness routes. Web API calls use the build-visible
  `NEXT_PUBLIC_API_URL`; same-origin `/api` routing is preferable so one image
  can be promoted without environment-specific rebuilding.
- PostgreSQL clients default to ten connections. During blue/green, two backend
  generations can therefore request twenty connections, in addition to the
  migrator and operator connections. The deployment must make pool size
  explicit and keep initial PostgreSQL capacity at least 30–50 connections.
- ADR-0002 already requires explicit singleton migrations, advisory locking,
  committed migration history, no startup/schema push, forward correction, and
  expand/migrate/contract compatibility.
- Production refresh cookies assume same-site web/API deployment. NGINX should
  expose the web and `/api` on one site. Backend proxy trust must list only the
  actual edge network.
- Production email-dependent authentication is intentionally unavailable.
  Admin is a placeholder and must remain private.
- No resource-history, metrics, error reporting, or deployment audit mechanism
  exists. Current generated build directories are not reliable sizing evidence
  because they include development caches and dependencies.
- Current provider facts: Timeweb creates new private networks as BGP networks,
  not OVN; services must be in a compatible region/availability topology;
  allow-list firewalls on private networks must preserve DHCP; Timeweb supplies
  HTTP/HTTPS/TCP monitoring and private S3 buckets. Provider behavior remains an
  operations adapter, not an application dependency.

## Target architecture

```text
GitHub release from main ──> verify/build ──> GHCR + release manifest
                                                   │
                                      manual production deploy
                                                   │
manual stage workflow ──> verify/build ────────────┤
                                                   v
                                      environment deploy contract
                                      migrate -> inactive slot
                                      -> ready/smoke -> NGINX reload
                                      -> drain -> cleanup -> audit

staging VPS                         production
┌──────────────────────────┐        ┌──────────────────────────┐
│ NGINX                    │        │ app VPS                  │
│ blue/green app slots     │        │ NGINX + blue/green slots│
│ PostgreSQL + Redis       │        └────────────┬─────────────┘
└──────────────────────────┘                     │ private BGP network
                                      ┌──────────▼─────────────┐
                                      │ data VPS               │
                                      │ PostgreSQL + Redis     │
                                      └────────────────────────┘
```

### Stable interfaces

- Build output: a signed/attested release manifest identifies source SHA,
  version or stage run ID, workflow run, verification result, migration image,
  and exact per-service OCI digests.
- Deploy input: environment plus manifest identity; deploy scripts reject raw
  mutable tags and unverified manifests.
- Runtime input: environment-specific secret file and topology file outside the
  image; all application images remain environment-neutral.
- Operator commands: one local resource-profile command, one dashboard command,
  and guarded deploy/rollback/backup/restore commands documented through safe
  repository entry points.
- Audit output: bounded JSON describing deployment identity, state transitions,
  timings, migration status, and result without configuration values.

## Acceptance criteria

- [x] AC-1 — Production images and runtime security.
- [x] AC-2 — Reusable verification/build and immutable manifest.
- [x] AC-3 — Release-only production CI trigger; no push/PR CI.
- [x] AC-4 — Manual stage branch verify/build/deploy flow.
- [x] AC-5 — Separate manual production promotion.
- [x] AC-6 — NGINX blue/green readiness, switch, drain, cleanup.
- [x] AC-7 — Bounded application shutdown and in-flight request proof.
- [x] AC-8 — Liveness/readiness/release identity.
- [x] AC-9 — Singleton built migration and compatibility gate.
- [x] AC-10 — Safe failure/rollback/backup behavior.
- [x] AC-11 — One-VPS staging and split-VPS production compositions.
- [x] AC-12 — Private admin and secret boundaries.
- [x] AC-13 — Reproducible local resource profiler.
- [x] AC-14 — Durable normalized history and local dashboard.
- [x] AC-15 — Universal operations guide and Timeweb appendix.
- [x] AC-16 — Sanitized deployment audit record.
- [x] AC-17 — Workflow/deployment contract and disposable system tests.
- [x] AC-18 — Evidence-led sizing and scaling triggers.

## Test strategy

- Unit: Required — manifest/schema validation, SemVer/ref validation, resource
  sample normalization/comparability, threshold calculation, slot state
  transitions, sanitized audit serialization, and deploy guard functions.
- Integration: Required — build each production image; run containers as
  non-root; verify filesystem/runtime contents, health endpoints, signals,
  Compose topology, NGINX configuration/reload, GHCR-manifest fixture
  resolution, and dashboard generation from fixture history.
- Contract: Required — statically and behaviorally test GitHub workflow triggers,
  permissions, environment gates, concurrency, artifact dependencies, exact
  digest deployment, migration-before-start ordering, and secret/log redaction.
- E2E: Required — a disposable local system journey builds the real production
  images, deploys and verifies both slots, rolls back, and proves scoped cleanup.
  A separate real-Docker integration keeps a stream open across the switch.
  GitHub event/approval behavior and controlled failure matrices remain at the
  deterministic contract/integration layer.
- Browser/device: Required for web/admin production images and NGINX routing at
  desktop/narrow widths; deployment mechanics are primarily system-level.
- Database migration: Required through `$db-verification` using disposable
  PostgreSQL. Prove built migrator clean/repeat/concurrent behavior, failed
  migration containment, ledger reporting, current/previous binary
  compatibility fixture, backup generation, and restore to a fresh instance.
- Load/resource: Required — execute the profiler on a documented reference host,
  record raw and normalized output, and validate idle/load/overlap collection.
  One run informs provisional sizing but trends require later comparable runs.
- Security: Required — deployment affects secrets, private networks, database
  exposure, registry credentials, SSH/Tailscale access, proxy trust, and admin
  access. Independent security review is mandatory.
- User-flow guide: Required — create
  `docs/user-flows/release-deployment-platform.md` during implementation and
  keep it `draft` until mapped tests and real evidence exist.
- User-flow E2E: Required — register the guarded local deployment rehearsal and
  map its deploy/verify/rollback journey. Re-inspect and rerun
  `user-authentication` because deployment source paths overlap.

## Milestones

- [x] M1 — Approve architecture and executable contracts
    - Objective: review this feature specification and approve or revise
      ADR-0009 before implementation.
    - Components: feature artifacts, ADR-0009, architecture/user-flow impact map.
    - Acceptance criteria: planning prerequisite for AC-1–AC-18.
    - Required tests: formatting, link/path inspection; no implementation tests.
    - Status: Complete — stakeholder approved the plan and ADR-0009 on 2026-08-18.
    - Evidence: planning discovery is recorded in `EVIDENCE.md`; ADR-0009 is
      Accepted.
- [x] M2 — Production packaging and health lifecycle
    - Objective: create reproducible production images and lifecycle contracts.
    - Components: production Dockerfiles/build contexts, Next standalone output,
      backend/migrator packaging, same-origin API routing, liveness/readiness,
      bounded shutdown, environment examples.
    - Acceptance criteria: AC-1, AC-7, AC-8, part of AC-12.
    - Required tests: image builds/inspection, health dependency tests, signal and
      stream drain integration, app tests/typecheck/lint/build.
    - Evidence: Complete; see production image, health, browser, and shutdown
      evidence in `EVIDENCE.md`.
- [x] M3 — Reusable CI verification and immutable release artifacts
    - Objective: implement one verification/build contract with only the approved
      staging and release entry points.
    - Components: `.github/workflows`, workflow validation scripts/tests, GHCR
      publication, manifest schema, artifact attestations/SBOM, concurrency.
    - Acceptance criteria: AC-2, AC-3, AC-4 build half, AC-5 build gate, AC-16.
    - Required tests: workflow contract suite and a non-publishing local fixture
      run; GitHub dry run or staging workflow evidence when credentials exist.
    - Evidence: Complete; workflow/manifest contract tests pass.
- [x] M4 — Blue/green deploy orchestration and safe migrations
    - Objective: deploy exact manifests through migrate/readiness/switch/drain
      with deterministic failure and rollback behavior.
    - Components: NGINX, staging/prod Compose topology, deploy state machine,
      built migrator, backup gate, audit output, Tailscale/SSH transport.
    - Acceptance criteria: AC-4 deploy half, AC-5, AC-6, AC-7, AC-9–AC-12, AC-16.
    - Required tests: disposable database verification, NGINX reload/drain,
      failed migration/readiness, rollback and idempotent retry integration.
    - Evidence: Complete; deterministic tests, disposable migration suite, full
      Docker deployment, rollback, TLS, and stream-drain checks pass.
- [x] M5 — Resource profiler, history, and sizing
    - Objective: make build/runtime capacity measurable and trendable.
    - Components: `pnpm resources:profile`, collector/load fixtures, JSON schema,
      ignored raw run directory, tracked sanitized JSONL history, static dashboard,
      capacity thresholds.
    - Acceptance criteria: AC-13, AC-14, AC-18.
    - Required tests: deterministic fixture/unit tests, local Docker measurement,
      dashboard content/CSP check, dirty/incomparable-host labeling.
    - Evidence: Complete; full Docker profile and dashboard generation pass.
- [x] M6 — Operations documentation and system journeys
    - Objective: make provisioning, staging, production promotion, rollback,
      restore, monitoring, and capacity review executable by an operator.
    - Components: provider-neutral operations guide, Timeweb appendix, draft then
      current user-flow guide, command registry, E2E journeys, README/architecture.
    - Acceptance criteria: AC-15, AC-17 and documentation portions of all ACs.
    - Required tests: docs/user-flow validators, mapped deployment E2E,
      authentication guide inspection/check/rerun, browser smoke, restore drill.
    - Evidence: Complete; guide traceability, mapped deployment E2E, affected
      authentication Playwright journeys, browser smoke, and docs checks pass.
- [x] M7 — Independent validation, remediation, and launch rehearsal
    - Objective: prove the completed platform from clean build to rollback and
      record independent correctness/security outcomes.
    - Components: full diff, release/stage workflow evidence, EVIDENCE/REVIEW,
      reviewer, tester, security reviewer.
    - Acceptance criteria: AC-1–AC-18.
    - Required tests: affected full repository checks, production image scan,
      disposable system rehearsal, profiler reference run, stage rehearsal,
      backup restore, browser checks, independent reviews.
    - Evidence: Complete; full repository validation, disposable Docker
      rehearsals, real Redis TLS/ACL verification, independent correctness/test
      review, and security review passed. External-account launch checks remain
      documented operator prerequisites.

## Progress

- 2026-08-18 — Classified as a feature because it establishes CI/CD,
  production topology, migration rollout, security boundaries, and durable
  architecture.
- 2026-08-18 — Confirmed clean `main`, created
  `feature/release-deployment-platform`, and generated durable feature artifacts.
- 2026-08-18 — Inspected repository commands, current Docker development stack,
  backend lifecycle/readiness, Next packaging, database pool/migrator, environment
  validation, current user-flow mappings, architecture docs, and ADR-0002.
- 2026-08-18 — Incorporated stakeholder choices: GitHub/GHCR, release-only
  production CI, manual production promotion, manually authorized stage flow,
  one-VPS staging, split application/data production, NGINX blue/green,
  five-minute stream drain, private admin, Tailscale, 24h RPO/4h RTO, and local
  resource history/dashboard.
- 2026-08-18 — Drafted proposed ADR-0009. Current action: wait for stakeholder
  review; do not begin M2 until explicitly approved.
- 2026-08-18 — Stakeholder approved the plan and strategic topology. Accepted
  ADR-0009 and started M2–M6 implementation in parallel with root-owned
  integration.
- 2026-08-18 — Completed M2–M6. Production images, release workflows,
  blue/green deploy/rollback, guarded migration and backup gates, resource
  profiler/dashboard, operations handbook, Timeweb appendix, and current mapped
  user-flow guide are implemented.
- 2026-08-18 — Passed repository lint/types/tests/builds, disposable migration
  verification, real Docker deploy/rollback/cleanup and open-stream handoff,
  browser smoke, resource profiling, affected authentication E2E, and real
  Redis 8 TLS/ACL verification. Independent correctness, test, and security
  reviews approved the remediated implementation; M7 is complete.

## Decisions

- D-001 — Two explicit CI/CD entry points
    - Context: CI should not run on ordinary pushes/PRs; staging needs a manual
      full rehearsal while production needs release qualification separated from
      promotion.
    - Choice and rationale: manual `stage` workflow runs verify/build/deploy;
      published SemVer release from `main` runs verify/build only; production
      deploy is a separate manual workflow consuming a successful manifest.
    - Alternatives rejected: push/PR CI (outside cost/trigger requirement),
      automatic production deploy (removes approval boundary), rebuilding during
      deploy (breaks artifact identity).
    - ADR impact: Accepted ADR-0009.
- D-002 — Stable NGINX plus Compose blue/green
    - Context: one host must stop new traffic to old containers without breaking
      existing HTTP/streaming connections.
    - Choice and rationale: keep NGINX stable, run named blue/green Compose
      application projects, validate/reload upstream config, retain old app
      containers until old NGINX workers finish or five-minute deadline.
    - Alternatives rejected: in-place Compose replacement (connection loss),
      Docker Swarm/Kubernetes (unnecessary operating complexity), DNS switching
      (slow/non-deterministic drain).
    - ADR impact: Accepted ADR-0009.
- D-003 — Staging/prod topology variants behind one deploy contract
    - Context: launch starts on one staging VPS; production later isolates durable
      data on a second VPS.
    - Choice and rationale: topology files vary, but manifest, migrate, health,
      switch, drain, rollback, audit, and operator commands stay identical.
    - Alternatives rejected: environment-specific deploy scripts (drift), sharing
      production data with staging (security/failure coupling), four VPSs at
      initial staging launch (unnecessary cost).
    - ADR impact: Accepted ADR-0009.
- D-004 — Explicit built migration before inactive slot
    - Context: schema transitions must work while the old slot still serves.
    - Choice and rationale: run one migration image using the canonical checked-in
      history and advisory lock; require backward-compatible expand/migrate
      changes; never automatically run down migrations during application
      rollback.
    - Alternatives rejected: migrations on process startup, schema push,
      destructive same-release contract migration.
    - ADR impact: Required by accepted ADR-0002; ADR-0009 defines deployment order.
- D-005 — Provider-neutral core with Timeweb adapter guide
    - Context: Timeweb is the initial vendor, but operational logic should remain
      portable.
    - Choice and rationale: standard OCI/Compose/NGINX/SSH/Tailscale/S3-compatible
      interfaces; isolate Timeweb panel, BGP network, firewall, backup, and
      monitoring procedures in an appendix.
    - Alternatives rejected: Timeweb Apps/platform-specific deployment (less
      control over draining/topology), provider API/Terraform in first delivery
      (additional strategic and credential surface).
    - ADR impact: Accepted ADR-0009.
- D-006 — Local, durable resource profiling
    - Context: current `.next` and `node_modules` sizes are cache-heavy and cannot
      size a VPS; resource needs will change with the product.
    - Choice and rationale: deterministic Docker build/load measurement,
      fingerprinted normalized JSONL history on explicit record, ignored raw
      logs, and a generated self-contained dashboard.
    - Alternatives rejected: one-time spreadsheet (not reproducible), committing
      raw logs (large/noisy/sensitive), relying only on cloud monitoring (too late
      for initial purchase/build sizing).
    - ADR impact: Feature-local implementation detail; the evidence-led capacity
      rule is included in accepted ADR-0009.
- D-007 — Secure private operator/deploy path
    - Context: admin and SSH should not be public, while GitHub-hosted runners need
      temporary reachability.
    - Choice and rationale: Tailscale private addresses and ephemeral CI access;
      environment-scoped secrets; read-only registry credentials on hosts; no
      privileged self-hosted GitHub runner on an application server.
    - Alternatives rejected: globally open SSH/admin, continuously changing
      GitHub runner IP allowlists, privileged app-host runner.
    - ADR impact: Accepted ADR-0009.

## Discoveries

- The backend already has the core graceful-close hook and built migration
  artifact, reducing implementation scope, but shutdown deadlines and connection
  behavior are untested.
- Current `/health` is liveness despite its OpenAPI description saying ready;
  deployment requires a separate dependency-aware readiness contract.
- Next's public API URL is a build-time input. Same-origin proxy routing avoids
  separate staging/production web builds and preserves immutable promotion.
- Default PostgreSQL pooling creates a material overlap budget during blue/green;
  pool size must become explicit rather than relying on the default of ten.
- Timeweb documentation states new private networks are BGP-only; attaching an
  existing service can involve a reboot/downtime and private IP may need manual
  OS configuration. Provision servers in the target network initially.
- A Timeweb allow-list firewall on a private network must permit DHCP traffic or
  a server can lose its private address. This belongs in the provider runbook and
  verification checklist.
- Provider snapshots are not a database-consistent backup guarantee. PostgreSQL
  logical/physical backups must be copied off the data VPS to private object
  storage and restore-tested; snapshots are supplementary.

## Provisional capacity and measurement gates

These are purchasing hypotheses, not final requirements:

- Staging all-in-one VPS: 4 vCPU, 8 GB RAM, 100 GB NVMe. It must fit data
  services plus two app generations during deployment.
- Production application VPS: 4 vCPU, 8 GB RAM, 80 GB NVMe.
- Production PostgreSQL/Redis VPS: 4 vCPU, 8 GB RAM, at least 100 GB NVMe,
  with storage growth/IOPS reviewed independently.
- CI or local reference builder: 4 vCPU, 16 GB RAM, at least 30 GB free disk.

Before purchase, run the profiler from a clean revision and size normal steady
state below 70% CPU/RAM/disk, preserving overlap headroom. Review scaling when
p95 latency exceeds its agreed budget, errors exceed 0.1%, sustained CPU/RAM or
disk exceeds 70%, database storage forecast reaches 60 days of free space, or
Redis eviction/PG connection saturation appears.

## Validation

| Check                   | Status         | Evidence                                                 |
| ----------------------- | -------------- | -------------------------------------------------------- |
| Planning/source audit   | Passed         | `EVIDENCE.md`                                            |
| Unit                    | Passed         | `pnpm test:release-deployment`, workspace tests          |
| Integration             | Passed         | disposable PostgreSQL, container, NGINX checks           |
| Contract                | Passed         | workflow, manifest, migration, deploy contracts          |
| E2E                     | Passed         | failed/success/rollback and stream Docker journeys       |
| Browser/device          | Passed         | Agent Browser wide/narrow web and admin images           |
| Typecheck               | Passed         | `pnpm check`                                             |
| Lint                    | Passed         | `pnpm check`                                             |
| Build                   | Passed         | workspace and four production image builds               |
| Database migration      | Passed         | disposable PostgreSQL 5/5                                |
| Resource profile        | Passed         | full topology and BuildKit peak run                      |
| Backup restore          | Passed locally | deterministic automation; off-host drill is launch check |
| User-flow guide         | Passed         | `pnpm docs:user-flows:check`                             |
| User-flow E2E           | Passed         | revision `sha256:550be74b36f843db`                       |
| Independent review      | Passed         | `REVIEW.md`                                              |
| Security review         | Passed         | `REVIEW.md`                                              |
| Stakeholder plan review | Passed         | Accepted ADR-0009                                        |

## Remaining work

- No repository implementation work remains for this feature.
- Choose actual Timeweb region, host plans, domains, and secrets during the
  provisioning milestone using profiler evidence; do not encode vendor-specific
  identifiers in source.
- Resolve production enrollment/email capability before public production use.
