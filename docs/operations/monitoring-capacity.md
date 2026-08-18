# Monitoring and capacity

Monitoring must answer three questions: is the service reachable, is it serving
correctly, and is it approaching a resource limit? Provider-native monitoring is
useful for host/outside reachability but is not the only signal. The launch plan
uses Sentry for application errors and Grafana Cloud-compatible metrics/logs,
with an external provider uptime check.

## Minimum signals

| Layer       | Signals and alerts                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Public edge | TLS expiry, external HTTPS availability, status class, latency, NGINX reload/config errors, active/old workers                  |
| Web/admin   | `/healthz`, release identity, process restarts, server errors; admin is probed only from the private network                    |
| Backend     | `/livez`, dependency-aware `/readyz`, release identity, request/error/latency, active and streaming requests, shutdown deadline |
| PostgreSQL  | availability, connections versus limit, long transactions, locks/deadlocks, query latency, disk/IOPS, backup age/result         |
| Redis       | availability, memory, eviction, rejected connections, latency, persistence errors where enabled                                 |
| Host/Docker | CPU, memory and swap, disk bytes/inodes, IO wait, network, container restarts/OOM, image/volume growth                          |
| Delivery    | workflow result, migration result/ledger, active slot, drain duration/forced termination, rollback, audit upload                |

Health probes must have short timeouts and must not perform expensive queries.
Do not put credentials in URLs or labels. Logs and telemetry must exclude tokens,
cookies, passwords, verification codes, database URLs, prompts containing user
data, and raw request/response bodies.

## Alert routing

- Page immediately when the public endpoint is unavailable, every backend slot
  is unready, PostgreSQL is unavailable, disk is critically full, or a backup
  has missed the 24-hour RPO.
- Notify urgently for error-rate/latency regression, Redis eviction, database
  connection saturation, repeated container restart, migration failure, forced
  five-minute drain, or TLS expiry within 14 days.
- Create a capacity task for sustained resource threshold crossings or less than
  60 days of forecast database storage.
- Every alert has an owner, actionable link, environment/release identity, and
  recovery/runbook link. Test delivery after initial setup and rotation.

## Local resource profile

Use the repository profiler before buying a plan, before a material service is
added, and periodically as the product grows. It builds production images and
measures idle, representative load, and blue/green overlap. Raw artifacts and
the generated self-contained dashboard remain ignored; only explicit sanitized
normalized observations belong in durable JSONL history.

Compare runs only when their host fingerprint, architecture, Docker allocation,
load profile, and profiler schema are compatible. A dirty working tree or a
different host must be labeled; never hide incomparable runs in a single trend.
The dashboard is local evidence, not telemetry and must contain no secrets or
user data.

Run a full clean-build/runtime profile and open the generated dashboard:

```sh
pnpm resources:profile
pnpm resources:dashboard
```

Use `pnpm resources:profile -- --build-only` when the runtime lifecycle is not
the subject, and `--reuse-build-cache` only for an explicitly labeled warm-build
comparison. A full run uses loopback ports `18080`/`18480`/`18081`, real stage-data/app/
edge Compose files, blue/green overlap, a dedicated measured BuildKit worker,
web plus dependency-aware backend load, and scoped automatic cleanup. Detailed
logs/results are written below `.artifacts/resource-profile/runs/`; the static
dashboard is `.artifacts/resource-profile/dashboard.html`.

To make one normalized observation durable, first commit the intended revision
and ensure the worktree is clean, then run:

```sh
pnpm resources:profile -- --record
```

The command refuses to record a dirty tree and appends to
`docs/operations/resource-profile/history.jsonl`. Do not edit JSONL by hand or
commit raw `.artifacts` output.

Record at least:

- revision/release, timestamp, OS/architecture, CPU/RAM and Docker version;
- clean/cached build duration and peak builder CPU/memory;
- image sizes and free disk before/after;
- per-container idle/load/overlap CPU and RSS;
- throughput, error count/rate, and p50/p95/p99 latency; and
- threshold result plus comparison reason/fingerprint.

## Initial sizing hypotheses

These are starting measurement envelopes, not purchase guarantees:

| Role                        | Provisional size                            |
| --------------------------- | ------------------------------------------- |
| Staging all-in-one          | 4 vCPU, 8 GB RAM, 100 GB NVMe               |
| Production application      | 4 vCPU, 8 GB RAM, 80 GB NVMe                |
| Production PostgreSQL/Redis | 4 vCPU, 8 GB RAM, at least 100 GB NVMe      |
| Reference builder           | 4 vCPU, 16 GB RAM, at least 30 GB free disk |

The staging/application host must fit both generations during a blue/green
overlap. The data host must reserve database working space, backup staging,
WAL/persistence growth, and recovery headroom.

## Review and scale triggers

Investigate rather than immediately resize when any of these hold:

- sustained steady-state CPU, RAM, or disk exceeds 70%;
- representative-load errors exceed 0.1% or agreed p95 latency is missed;
- the overlap profile approaches host memory/CPU or causes OOM/restarts;
- PostgreSQL connection use, locks, storage IO, or query latency saturates;
- Redis evicts keys or approaches its configured memory limit;
- database free-space forecast falls below 60 days; or
- production build time/disk exceeds the documented runner envelope.

First confirm the profile is representative and rule out leaks, unbounded logs,
bad queries, wrong pool sizing, and obsolete images. Scale vertically when the
workload is legitimate and the host lacks overlap headroom. Consider separating
services or adopting a stronger orchestrator only when repeated evidence shows
the single-host application model is the constraint.

After every material change, append a comparable recorded profile, regenerate
the dashboard, link the observation in the active feature/release evidence, and
update the provisional table only from measured results.
