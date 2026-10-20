---
type: reference
title: Capacity, generation continuity, and resource assessment
assessed: 2026-10-20
source_paths:
  - infra/deploy/compose/apps.compose.yaml
  - infra/deploy/compose/production-data.compose.yaml
  - apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts
  - apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
  - apps/backend/src/modules/dictionaries/application/dictionary-generation-worker-service.ts
  - apps/backend/src/modules/conversations/application/conversation-worker-service.ts
---

# Capacity, generation continuity, and resource assessment

This assessment covers the checked-in infrastructure, backend, web, admin, and
background workers as inspected on 2026-10-20. It describes configuration defaults,
not verified settings on a deployed host. No fresh load test or resource profile
was run for this assessment. Estimates below are not production capacity promises.

## Simultaneous users and approximate throughput

AI generation capacity and ordinary database/API throughput have different limits.

| Area | Current default |
| --- | --- |
| AI worker execution slots | 2 per worker process, shared across dictionary, speech, sentence, text, tutor, and related work |
| Dictionary generation concurrency policy | 10 globally, 1 per owner |
| Dictionary outstanding-work admission limit | 1,000 globally, 5 per owner, with additional queue-age and budget checks |
| Backend database pool | 10 connections per backend process |
| Worker database pool | 4 connections per worker process |
| Account-purge database pool | 2 connections per worker process |
| Production PostgreSQL | 50 total connections |

Sources: [application configuration](../../infra/deploy/compose/apps.compose.yaml),
[PostgreSQL configuration](../../infra/deploy/compose/production-data.compose.yaml),
[worker composition](../../apps/backend/src/infrastructure/worker/dictionary-worker-command.ts),
[worker scheduling](../../apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts),
[dictionary execution policy](../../apps/backend/src/modules/dictionaries/application/dictionary-generation-worker-service.ts),
and [dictionary admission policy](../../apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store.ts).

With one default worker, approximately two jobs can execute simultaneously.
Other admitted jobs wait. Provider rate limits, provider concurrency settings,
credit/token/cost budgets, and workload-specific policies can reduce capacity.
Execution slots count jobs, not unique users or individual model calls.

Assuming one job occupies one slot for its entire duration, with both slots
available to the measured workload:

| Average slot occupancy per job | Calculated throughput with 2 slots |
| --- | --- |
| 5 seconds | 0.4 jobs/second; 24/minute |
| 15 seconds | 0.13 jobs/second; 8/minute |
| 60 seconds | 0.033 jobs/second; 2/minute |

The approximation is `completed jobs/second = occupied slots / average duration`.
These are calculations, not measured generation results. Sustainable arrivals
should remain below service capacity to leave headroom and prevent queue growth.
A job can make several provider calls; retries and other workloads also consume
capacity. Increasing worker concurrency alone does not raise every policy limit.

There is no defensible current RPS figure for authenticated fetch/save operations.
A database pool of ten connections is not a ten-user limit: requests reuse
connections. PostgreSQL's `max_connections` limits concurrent database sessions,
not HTTP requests or users; see the
[PostgreSQL documentation](https://www.postgresql.org/docs/current/runtime-config-connection.html).
Both application slots and all worker pools must fit during deployment overlap,
with additional capacity for migrations, probes, and operators.

An older ignored local profile at
`.artifacts/resource-profile/runs/2026-08-18T191318583Z-60cfe273d40a/result.json`
reported approximately 664 RPS and 12.23 ms p95 under its load phase. Its August
revision and health/readiness workload do not establish current product capacity.
It did not measure the current full set of workers or authenticated reads, writes,
generation admission, and tutor streaming. The durable resource-profile history
was empty when inspected. Treat the old result as historical context only.

## Deploying while generations are running

The release infrastructure supports blue/green deployment, but uninterrupted
generation is not guaranteed across all workloads.

Implemented protections include:

- Candidate containers pass readiness before traffic switches.
- Existing HTTP connections drain, with a default five-minute limit.
- Jobs persist in PostgreSQL with expiring leases and fencing checks.
- Versioned job formats and release compatibility checks support overlapping releases.
- Migrations must remain compatible with the old application and rollback target.

See [ADR-0009](../adr/0009-release-and-deployment-platform.md),
[ADR-0012](../adr/0012-dictionary-worker-and-document-ingestion.md), and the
[deployment runbook](./deployment.md).

The important distinction is what happens when the old worker receives shutdown:

| Workload | Current shutdown behavior |
| --- | --- |
| Dictionary generation | Aborts the provider call; unfinished leased jobs are returned to the queue for another attempt, subject to cancellation and execution policies |
| Tutor conversation | Aborts the response and records it as interrupted/cancelled; deliberately avoids automatically repeating an ambiguous provider request |

Sources: [dictionary shutdown handling](../../apps/backend/src/modules/dictionaries/application/dictionary-generation-worker-service.ts),
[dictionary lease release](../../apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store.ts),
and [tutor interruption handling](../../apps/backend/src/modules/conversations/application/conversation-worker-service.ts).

A five-minute stop grace period does not mean provider calls keep running for
five minutes. The application can abort them immediately on shutdown. Docker's
grace period establishes the deadline before forced termination; see the
[Compose service reference](https://docs.docker.com/reference/compose-file/services/#stop_grace_period).

The deployment runner waits for old NGINX workers/connections to drain; this is
not a separate AI-job drain guarantee. To improve continuity, a future worker
drain phase would stop claiming new jobs, let active jobs finish, and terminate
only afterward, with a bounded fallback. This is a recommendation, not implemented
behavior or an authorization to change deployment semantics. Verify each workload
through an active-generation deployment test before claiming uninterrupted releases.

## CPU, RAM, and disk requirements

A verified minimum has not been measured for the current application. Existing
[monitoring and capacity guidance](./monitoring-capacity.md) defines these
provisional starting envelopes:

| Deployment role | vCPU | RAM | SSD/NVMe |
| --- | --- | --- | --- |
| Staging, entire stack on one host | 4 | 8 GB | 100 GB |
| Production application host | 4 | 8 GB | 80 GB |
| Production PostgreSQL and Redis host | 4 | 8 GB | At least 100 GB |
| Reference image builder | 4 | 16 GB | At least 30 GB free |

These are sizing hypotheses with deployment headroom, not measured minimums.
The accepted production topology uses separate application and data hosts.
Application hosts must accommodate both versions during blue/green overlap.

A smaller machine may boot the stack, but that does not demonstrate capacity for
active generations, database growth, and deployment overlap. Disk sizing must
include images, logs, PostgreSQL data and WAL, Redis persistence, backup staging,
and any locally stored audio/documents. Builds have a separate resource envelope;
the deployed application host consumes prebuilt images. Production admin serves
compiled static assets through NGINX. AI inference uses external providers, so
this setup requires no local inference GPU.

## Measurements needed for reliable sizing

Run a current production-image resource profile using the existing
`pnpm resources:profile` tooling, following the
[resource profiling instructions](./monitoring-capacity.md#local-resource-profile).
Its default health/readiness traffic is insufficient for product capacity claims.

Use synthetic data and controlled provider responses for a mixed-workload test
covering authenticated fetch/save operations, generation admission and completion,
status polling, tutor streaming, and a deployment while jobs are active. Measure
successful RPS, job throughput, queue age, p50/p95/p99 latency, errors, memory/CPU,
database pool waits, locks, and disk/IO. Measure actual provider latency and account
quotas separately under an explicitly authorized live-provider test.

Record the revision, host specification, data volume, workload mix, concurrency,
provider mode, and deployment-overlap behavior. Only then translate capacity into
an active-user estimate using an explicit per-user activity rate and latency target.
