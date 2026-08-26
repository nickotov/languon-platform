# ADR-0012: Dictionary worker and document ingestion

Status: Accepted
Date: 2026-08-21
Supersedes: None

## Context

Dictionary AI regeneration, pasted-term enrichment, document scanning,
extraction, and OCR outlive an HTTP request and depend on providers that can be
slow, unavailable, or rate-limited. Uploaded documents are adversarial input
and must not share the database-backup storage boundary. Jobs and proposals must
survive reloads, process restarts, and blue/green overlap without making API
readiness depend on a live model or OCR provider.

This choice changes runtime topology, storage and scanner trust boundaries, data
retention, deployment capacity, and rollback compatibility. The stakeholder
approved a PostgreSQL-backed worker, private S3-compatible product storage,
fail-closed ClamAV scanning, and provider-neutral OCR/model ports on 2026-08-20.

## Decision

### Durable work and proposals

- The dictionary module stores generation jobs, validated proposals, upload
  metadata, leases, attempts, progress, cancellation, expiry, and sanitized
  failures in PostgreSQL. Redis is not the durable queue or proposal store.
- HTTP operations validate and authorize bounded input, persist work in a short
  transaction, and return a job identity. They never wait for model, scanner,
  parser, or OCR completion and never mutate a card from unreviewed output.
- Workers acquire jobs with PostgreSQL row locking/skip-locked semantics,
  expiring leases, a monotonically increasing fencing token, heartbeats, bounded
  retries, idempotent stage transitions, and cooperative cancellation. Every
  stage/result/terminal write compares the current owner and fencing token;
  output from a stale worker cannot commit after recovery. Terminal transitions
  and proposal acceptance are transactional. External calls use abort signals
  and stable provider idempotency keys when supported.
- Every job and proposal carries a schema version and input dictionary/card
  versions, including `expectedDictionaryVersion`, `expectedSettingsVersion`,
  optional `expectedCardVersion`, and trusted source/target tags. Acceptance
  locks and compares the relevant rows so an empty dictionary's pair/lifecycle
  cannot change between batch/document generation and commit. Workers skip
  unsupported kinds/versions. Job formats use a
  two-release expand/activate rule: release R adds worker support while APIs keep
  enqueueing the old format; R+1 may enqueue the new format only after deployment
  preflight proves both the candidate and rollback-floor workers support it; a
  later release removes old support only after no old work remains and the
  rollback floor has advanced. Release metadata separately declares worker-
  processable, API-readable/cancellable/discardable/acceptable, API-enqueued,
  and web-wire-compatible versions. Preflight proves the entire rollback-floor
  stack can poll and resolve every version R+1 may create. A version retires only
  after its queued/running jobs and reviewable proposals are gone. Acceptance
  revalidates contracts and expected versions atomically.
- Model and OCR output is untrusted structured input. Zod contracts, size/count
  limits, content rules, and application invariants apply again before a
  proposal is stored or accepted. Custom instructions never grant model tools
  or authority and are excluded from logs, traces, and durable raw evidence.
- Completed proposals awaiting review retain bounded candidate values for at
  most seven days. Acceptance first records the accepted values in the card and
  revision transaction; accepted, discarded, cancelled, and expired jobs then
  redact proposal alternatives/reasons, raw inputs, and custom instructions,
  retaining only safe outcome/provenance metadata. Expiry is not considered
  erasure until the cleanup transaction has performed that redaction.
- Enqueue and upload authorization reserve configured per-owner and global
  queued-job, in-flight-job, pending-upload-byte, and provider-cost budgets in
  the same transaction. Fair lease ordering prevents one owner from monopolizing
  workers. Queue age, dependency health, and spend/resource circuit breakers
  reject new work with stable retry categories while cleanup remains available.
- Generation enqueue is uniquely idempotent on owner, job kind, and client key.
  The job retains a keyed canonical request fingerprint and result job identity
  after raw input redaction; same-key/different-input reuse conflicts. Proposal
  acceptance needs no second client key: its locked review state stores the
  accepted-candidate keyed fingerprint and result card/revision identity, returns
  that result for an identical retry, and rejects a different candidate after a
  terminal outcome.

### Runtime and deployment

- A separate worker command runs from the immutable backend image. This adds a
  process/service role, not a fifth OCI image identity, and retains ADR-0009's
  manifest provenance and migration-before-process ordering.
- Native document parsing remains inside the approved worker service topology but
  runs through a credentialless child-process sandbox rather than in the worker
  process. The child receives no application environment or database,
  object-storage, model/OCR, telemetry, or backup credentials; has an OS-enforced
  network-denied namespace, non-root/read-only execution, dropped capabilities,
  bounded CPU, memory, PIDs, time, and temporary storage; and communicates only
  through narrow schema-validated IPC. Document capability remains disabled on
  a host where the sandbox adapter cannot prove these controls.
- Each blue/green application slot includes its matching worker service. During
  overlap, old and new workers may lease only supported versioned work; leases
  prevent duplicate ownership. On shutdown a worker stops leasing, cooperatively
  cancels provider calls, finishes or releases bounded in-flight work before its
  deadline, and leaves recoverable durable state.
- Root worker composition owns timers, process signals, concurrency, and
  readiness only. It invokes a dictionary application worker service that owns
  claim/heartbeat/stage/complete/cancel transitions and their fencing checks.
  Dictionary infrastructure implements lease and provider ports; root
  infrastructure never mutates job rows directly.
- Worker liveness proves process health. Worker readiness proves PostgreSQL and
  required configured infrastructure can be reached with bounded probes; it
  does not call a paid model/OCR operation. API readiness remains independent of
  model, OCR, scanner, and product-storage availability. Capability endpoints
  report unavailable features without exposing configuration or credentials.
- PostgreSQL connection budgets, worker concurrency, provider concurrency, job
  age, retries, cleanup lag, and blue/green overlap are measured separately.
  Worker capacity is included in deployment gates and the resource profile.

### Quarantined document ingestion

- Product uploads use a private S3-compatible bucket or isolated namespace with
  environment-specific least-privilege credentials, lifecycle policy, and
  object keys. It is separate from backup storage and never exposes public URLs.
- The API issues short-lived, content-length- and content-type-bounded presigned
  create capability after owner authorization. The storage adapter must prove an
  atomic create-only condition signed into the request (`If-None-Match: *` or an
  equivalent provider primitive), exact length/checksum constraints, and a
  bounded expiry; otherwise direct upload remains disabled. Parallel/replayed
  requests can create at most one authorized data object. Object identity is
  random and server-derived, bucket versioning is enabled, and completion records
  and verifies the exact immutable object version, strong checksum, expected
  size, magic bytes, and ownership. Scanning and parsing address that exact
  version and revalidate its checksum.
- Terminal cleanup first places a non-sensitive zero-byte tombstone as the
  current object, deletes every data version, and retains the tombstone until the
  signed capability has expired; only then may it delete the tombstone/key. This
  prevents recreation after cleanup. Admission/reconciliation counts every
  physical version and byte, and any provider that cannot enforce this lifecycle
  fails closed.
- New objects enter a quarantine state. No parser or OCR adapter may read them
  as trusted input until a fail-closed ClamAV adapter reports a clean result.
  Scanner unavailable, timeout, stale/missing signatures, configured scan or
  recursion limit, partial/malformed output, or positive detection is non-clean,
  rejects processing, and schedules deletion. Capability readiness requires a
  known engine/signature version within a configured maximum age of 24 hours and
  scanner limits compatible with the accepted 20 MiB input envelope.
- The scanner service has no application, database, storage, model, or backup
  credentials and no public listener. Signature updates use a separately
  constrained updater/egress path; document scans arrive only over the private
  worker-scanner boundary.
- Native parsers receive the exact clean object version through the isolated
  sandbox and enforce explicit time, decompression, page, pixel, text, and output
  limits. Active, macro-enabled, password-protected, archive, unsupported, and
  malformed formats fail closed. The worker validates sandbox output again.
- Native extraction precedes vision/OCR. Only bounded required page/image data
  is sent through the provider-neutral OCR port. Providers receive no storage
  credentials or application tools, and provider retention/training settings
  must satisfy the environment's data-processing policy before enablement.
- Original objects, parser temporaries, and raw custom instructions are
  transient. Terminal work attempts immediate deletion; a cleanup job removes
  abandoned objects and raw input within 24 hours, while bucket lifecycle is a
  backstop. PostgreSQL retains only bounded safe metadata, sanitized warnings,
  job state, and proposal values during their bounded review window.

## Alternatives considered

### Synchronous HTTP processing

This is simpler for one card, but request timeouts, reloads, provider latency,
cancellation, document work, and blue/green drain would make outcomes
unreliable. Persisted jobs provide an observable recovery boundary.

### In-process fire-and-forget work

Starting promises from the API avoids another service, but loses work on
restart, couples provider load to HTTP capacity, and cannot safely coordinate
multiple replicas. It was rejected.

### Redis-backed or managed queue

Redis queues are common and a managed broker can simplify scheduling. Launch
work already requires PostgreSQL transactions and durable proposal state;
adding another durability/operations contract is not justified yet. A future
ADR may replace the queue after measured contention or throughput evidence.

### Reuse backup object storage and credentials

This reduces configuration, but mixes interactive adversarial uploads with
encrypted recovery artifacts and expands compromise scope. Product storage is
an independent least-privilege boundary.

### Parse before scanning or rely only on parser sandboxing

Early parsing can reduce scan latency, but exposes parsers to unclassified
content. Mandatory scanning plus parser resource isolation provides layered
defense and a clear fail-closed state.

### Retain original documents as user assets

Retention would enable reprocessing, but introduces a permanent document
library, erasure/export behavior, storage cost, and a larger privacy boundary
outside the requested feature. Only reviewed card proposals persist.

## Consequences

### Positive

- Jobs and proposals survive navigation, restart, and bounded deployment overlap.
- HTTP capacity and readiness do not depend on variable provider latency.
- Versioned leases allow multiple workers without duplicate job ownership.
- Uploaded documents remain private, scanned, bounded, and transient.
- Existing backend image provenance is reused while worker capacity can scale
  independently by process count.

### Negative

- PostgreSQL carries queue polling, lease, and cleanup load in addition to
  product queries.
- Deployment and local development gain worker, scanner, and product-storage
  services, a worker-local child-process sandbox dependency, separate
  credentials, and readiness checks.
- Blue/green compatibility now includes job and proposal schemas, not only HTTP
  and database compatibility.
- Fail-closed scanning and provider capability gating can make document features
  unavailable while ordinary dictionary authoring remains healthy.

### Risks / limitations

- Long provider calls can outlive a lease or shutdown deadline. Heartbeats,
  fencing tokens, idempotent stage records, abort signals, bounded timeouts, and
  recovery tests are mandatory; external side effects must use provider
  idempotency when offered.
- PostgreSQL polling can contend at scale. Index lease acquisition, add jittered
  bounded polling, observe queue/query latency, and revisit the queue only from
  measured evidence.
- Malware scanning does not make a document safe. Parser isolation and resource
  limits remain required after a clean result.
- Presigned uploads are temporary capabilities. Keep TTL and scope minimal,
  never log them, bind downstream work to the verified object version/checksum,
  and reject completion metadata that does not match the authorized upload.
- External OCR/model processing is unavailable until privacy, retention,
  residency, cost, and credential configuration are explicitly enabled for the
  environment.

## Related

- [Architecture](../architecture.md)
- [Dictionary jobs and document operations](../operations/dictionary-jobs-and-documents.md)
- [ADR-0002: Drizzle schema and migration strategy](./0002-drizzle-schema-and-migration-strategy.md)
- [ADR-0009: Release and deployment platform](./0009-release-and-deployment-platform.md)
- [Dictionary Platform feature](../../.agent/features/dictionary-platform/FEATURE.md)
- [Dictionary Platform ExecPlan](../../.agent/features/dictionary-platform/EXEC_PLAN.md)
