# Resource profile history

`history.jsonl` is the sanitized, append-only capacity record used by the local
resource dashboard. Add an observation only through an explicit clean-revision
profile:

```sh
pnpm resources:profile -- --record
pnpm resources:dashboard
```

The first command performs clean production image builds, measures idle and
representative load, then measures both application generations during the
blue/green overlap. It writes detailed local evidence under
`.artifacts/resource-profile/runs/`. Raw logs can include host-specific build
output and are intentionally ignored. `--record` appends only normalized values;
it never records environment variables, URLs, container environment, hostnames,
credentials, request bodies, or response bodies.

The generated `.artifacts/resource-profile/dashboard.html` is self-contained and
uses no network services. A run is trend-comparable only when its profile version,
configuration fingerprint, and privacy-preserving host fingerprint match the
previous observation. Dirty revisions are labeled and cannot be recorded.

Default regression flags are sustained/peak CPU, RAM, or disk above 70%, HTTP
errors above 0.1%, and load p95 above 1 second. These are capacity-review signals,
not service-level objectives. Compare PostgreSQL storage, connection saturation,
Redis eviction, and real production latency separately.

Each run creates a dedicated local `docker-container` BuildKit worker, samples
that worker's CPU/RSS during every image build, and removes it afterward. This
avoids attributing unrelated containers to a build. If the local Docker runtime
cannot expose that worker, the normalized record fails closed to an explicit
unavailable reason. Runtime sampling includes the edge, PostgreSQL, Redis, and
active application project; overlap also includes the inactive generation.

The synthetic load alternates public web health with the Docker-private backend
readiness route, so it exercises NGINX, backend, PostgreSQL, and Redis without
creating user records. It is a repeatable capacity signal, not a replacement for
production traffic telemetry.
