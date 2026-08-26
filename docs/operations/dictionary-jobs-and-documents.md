# Dictionary jobs and document operations

This document is the operations contract for dictionary AI jobs and transient
document ingestion. M2 supplies the durable worker command and single-card
format; M3 adds the independently gated pasted-terms format. M4 implements the
upload, scanner, sandboxed-parser, and OCR seams, but production document
activation remains disabled until the gates below are proven. ADR-0012 is
authoritative if this design diverges.

## Service and trust boundaries

```text
browser -- authorized metadata --> backend -- transaction --> PostgreSQL
   |                                  |                       jobs/proposals
   |-- short-lived create upload ---->|                              |
   v                                  v                              v
private versioned storage: quarantine object <--------------- dictionary worker
          exact version/checksum             scan exact bytes        |
                                         ClamAV service <------------+
                                                                     |
worker-local parser child <------ bounded IPC ------------------------+
      no egress/secrets; validated output                            |
                                                    optional OCR <----+
                                                                     |
                                      reviewed proposal --> PostgreSQL
```

- The public edge routes only web/backend traffic. Product storage remains
  private except for narrowly scoped short-lived upload capabilities, and the
  scanner has no public listener.
- The API and worker use different least-privilege credentials where supported.
  Deployment passes `DATABASE_URL` only to the API and
  `DICTIONARY_WORKER_DATABASE_URL` only to the worker. Production must use a
  worker database user distinct from both the API and migrator users, grant it
  only dictionary generation/dictionary access, and deny auth/admin tables.
  Apply `infra/deploy/sql/dictionary-worker-role.sql` as the migration owner
  after schema expansion. Production deployment checks the effective grants
  before the candidate worker starts. The check rejects missing required grants,
  extra generation/settings grants, public-schema CREATE, any unrelated
  dictionary-table privilege, and any auth/admin table privilege.
  Neither receives backup-bucket credentials. Scanner and parser-sandbox
  child processes receive no application credentials. The child has an
  OS-enforced network-denied namespace and communicates only through bounded
  worker IPC. ClamAV signature updates use a separate allowlisted updater path
  rather than general scanner egress.
- Raw object keys, presigned URLs, share keys or their dedicated request header,
  prompts, terms, document text, card content, and provider payloads are excluded
  from logs, traces, metrics, deployment evidence, and job failure messages.
- `DICTIONARY_HMAC_SECRET` is a dedicated API secret for persistent dictionary
  share-key digests and request fingerprints. It must be at least 32 bytes,
  independent from both authentication secrets, and never logged. Rotating
  `AUTH_CODE_HMAC_SECRET` must not affect dictionary links or idempotent replay.
  Do not rotate `DICTIONARY_HMAC_SECRET` without a separately designed versioned
  multi-key verification and data-migration procedure.

## Deployment contract

- Keep the four-image ADR-0009 manifest. Start a dictionary worker service from
  the exact backend digest in each blue/green slot after the singleton migration.
- The image command is
  `node dist/infrastructure/worker/dictionary-worker-command.js run`; its private
  Compose healthcheck invokes the same command with `healthcheck`. The healthcheck
  performs bounded PostgreSQL/application-store readiness and, for every
  worker-processable format, bounded provider and format-dependency probes. The
  run command starts on baseline database/cleanup readiness so provider,
  scanner, extractor, or OCR outages cannot prevent expiry and private-object
  cleanup; its healthcheck still fails closed during those outages. Neither path
  starts Hono, requires Redis or authentication secrets, or performs paid
  generation.
- Gate a candidate slot on worker process liveness, PostgreSQL lease-table
  access, required non-secret configuration shape, and bounded dependency probes.
  Never perform a paid model/OCR call as readiness.
- During overlap, both worker versions may run only against compatible job
  schema versions. Release metadata declares worker-processable,
  API-readable/resolvable, API-enqueued, and web-wire-compatible versions.
  Formats use two-release expand/activate: add worker plus API/web read/cancel/
  discard/accept support first, activate enqueue only after the candidate and
  rollback floor support the entire lifecycle, and remove old support only after
  old queued/running jobs and reviewable proposals drain. The removal manifest
  must name the exact removed formats in `retireFormats`; deployment queries the
  active slot with its worker credential and rejects the release before migration
  if either database count is non-zero.
  An `expand` manifest cannot add an enqueue format relative to its rollback
  floor, and an `activate` manifest must add at least one. Rollback keeps the
  symmetric lifecycle and drain gates without applying forward-only phase or
  retirement-declaration policy to the older manifest.
- Bind the five-field generation budget to every schema-v2 manifest and to the
  identical API/worker runtime configuration. For each enqueued format, the
  immutable job envelope's input/output token maxima must fit both overlapping
  workers, and its price rates and maximum cost must cover both workers. When
  either release may still have work for an overlapping worker format, keep the
  complete tuple identical so a stop-enqueue release or rollback cannot strand
  queued work after a price-policy reduction. Drain and retire the old format
  before changing its tuple and re-expanding support.
- Schema-v2 manifests declare `single-card:v1`, `pasted-terms:v1`, and
  `import-pairs:v1`
  independently in
  `workerProcessable`, API read/cancel/discard/accept, API enqueue, and web-read
  capability sets. Each format's first supporting release is `expand` without
  adding that format to API enqueue. Activation is a later manifest change after
  the deployed rollback floor advertises that format's complete lifecycle.
  Illustrative single-card deployment tests need not activate pasted terms.
  Historical schema-v1 manifests normalize to empty job capabilities.
- Claims return a monotonically increasing fencing token. Every heartbeat,
  stage/result, proposal, release, and terminal write compares current owner,
  token, state, and deadline; stale output is discarded.
- Before stopping a slot, stop new leases, signal in-flight adapters, allow the
  configured bounded drain, then release or expire incomplete leases. A forced
  stop must be visible in sanitized deployment and job metrics.
- Size PostgreSQL connection pools and application-host memory for both worker
  generations during overlap. Worker concurrency is explicit per environment
  and independent of HTTP replica count.
- Configure the worker pool with
  `DICTIONARY_WORKER_DATABASE_URL`,
  `DICTIONARY_WORKER_DATABASE_MAX_CONNECTIONS`,
  `DICTIONARY_WORKER_CONCURRENCY`, `DICTIONARY_WORKER_POLL_INTERVAL_MS`,
  `DICTIONARY_WORKER_READINESS_TIMEOUT_MS`, and
  `DICTIONARY_WORKER_DRAIN_TIMEOUT_MS`. The drain timeout must remain below the
  Compose stop grace period. `DICTIONARY_GENERATION_PROVIDER_MODE` defaults to
  fail-closed `unavailable`; deterministic generation is restricted to
  local/test execution. A reviewed live configuration uses `mastra` plus a
  `provider/model` ID, credential-free HTTPS base URL with an optional bounded
  provider path such as `/v1`, and worker-only API key. Query strings, fragments,
  localhost, and private literal addresses are rejected in deployed environments.
  Those values never enter HTTP readiness or capability responses.
- Every currently supported worker format (`single-card:v1`,
  `pasted-terms:v1`, `import-pairs:v1`, and `document-terms:v1`) depends on the
  generation provider. Provider mode and its bounded readiness probe therefore
  follow `workerProcessable`, not API enqueue. A stop-enqueue release must keep
  live Mastra configuration and credentials while queued or retryable jobs can
  still be claimed; provider configuration may be removed only with the format's
  drained `workerProcessable` retirement release.
- A document stop-enqueue or rollback floor retains the API lifecycle formats
  and private S3 configuration so an already authorized upload can complete.
  New document authorization follows API enqueue and returns unavailable after
  stop-enqueue; completion remains available until document lifecycle retirement.
- The reusable deterministic M6 build manifest publishes empty
  `workerProcessable`, API lifecycle, API enqueue, and web-readable capability
  sets. Enabling an AI format requires a separately reviewed expand release
  with live Mastra configuration and readiness, followed by a compatible
  activation release that enables enqueue. Do not turn the reusable default
  manifest into implicit live-provider activation.
- Configure the same five token/pricing ceilings on API and worker. Input tokens
  must be 32,768–262,144, output tokens 128–40,960, each micros-per-million rate
  1–1,000,000,000, and maximum attempt cost 1–10,000,000 micros. The maximum
  must be at least the sum of each token ceiling multiplied by its rate and
  rounded up independently per million tokens. Live mode fails closed when a
  value is missing, out of range, or internally inconsistent.
  The general input minimum includes the fixed 16,384-token provider framing
  reserve plus room for the prompt, output schema, and smallest valid card
  request. Enabling `pasted-terms:v1` or `import-pairs:v1` requires the full
  262,144 input-token and 40,960 output-token aggregate attempt envelope. The worker divides that
  immutable envelope across at most five ordered 20-row calls, records stable
  chunk idempotency keys, requires live usage for every chunk, and persists only
  aggregate usage within the job budget. Import-pair calls send only language
  roles, effective settings, the bounded instruction, and source/translation
  rows; dictionary IDs, versions, fingerprints, and retry lineage stay
  server-side. Smaller envelopes fail capability validation before either batch
  format is activated. A bounded 120-second whole-batch deadline covers those sequential calls while the normal
  heartbeat continues to renew the lease; shutdown and lease loss still abort
  the active call immediately. Single-card calls retain their 20-second bound.
- Keep pasted input rows and shared context only while a proposal is reviewable.
  Retrying failures is an owner-scoped server action over persisted retryable row
  indexes: it locks the predecessor, preserves its shared context, records the
  predecessor job and original row indexes in the successor input, and snapshots
  current dictionary/settings versions. Accept, discard, cancel, expiry, and
  terminal failure redact the predecessor input. Accepted outcomes retain only
  card/version identities and final server-derived duplicate warnings.
- Launch every parser through a non-root, read-only child-process sandbox with no
  application environment, an OS-enforced network-denied namespace, dropped
  capabilities, `no-new-privileges`, bounded CPU/address-space/PIDs/time/output,
  and narrow stdio/pipe IPC. Validate and bound every response again in the
  worker. Disable document capability when the host cannot prove this
  confinement; measured RSS and tmpfs bounds remain activation gates below.
- Capability gating isolates failure: ordinary dictionary CRUD remains ready
  when AI, OCR, scanner, or product storage is unavailable. Enqueue endpoints
  return stable unavailable/retry categories without configuration details.

## Upload and cleanup lifecycle

```text
authorized -> uploaded/quarantined -> scanning -> clean -> extracting -> proposed
                         |                |          |           |
                         +-------------- rejected / failed / cancelled
                                                  |
                                                  v
                                   immediate object/temp deletion
                                                  |
                               24-hour cleanup and lifecycle backstop
```

M4 uses versioned `documentIngestionLimitsV1`: 10-minute upload capability;
20 MiB file; 100 pages and 100 extracted units including failures; 200 Unicode
code points per unit; 2,048 ZIP entries, no nested archives, 64 MiB expansion,
100:1 expansion ratio; 16,384-pixel dimension, 25-megapixel page, 250-megapixel
document; 1 MiB extracted UTF-8 and 2 MiB parser IPC output. Parser children are
bounded to 15 seconds wall/10 seconds CPU, a 256 MiB virtual-address/V8
envelope, 8 PIDs, and 128 MiB bounded parser output/temporary accounting.
`RLIMIT_AS` is not an RSS limit: production document activation additionally
requires the M6 cgroup/container RSS and tmpfs proof plus the narrow-seccomp
escape/resource rehearsal. Scanner bounds are 30 seconds, 25 MiB stream, recursion 10,
2,048 files, and signatures at most 24 hours old. Deterministic OCR permits at
most 8 MiB/25 megapixels/20 seconds per page and 100 pages/250 megapixels/
120 seconds per document. Live OCR remains unavailable until its cost and data-
processing policy is reviewed. Admission reserves at most five/100 MiB pending
uploads per owner and 50/1 GiB globally until physical deletion is verified.

The extraction grammar counts at most 100 document units including invalid
units. A 101st unit produces terminal `too_many_terms`; nothing is truncated.
`no_terms_found` means there were zero units after ignored headings and blanks.
An all-invalid document may produce a failure-only final review with safe
location/error codes, never raw over-limit content.

1. Transactionally reserve owner/global pending-job and physical upload-byte
   quota, then authorize one random object key with expected format and a maximum
   of 20 MiB. Sign exact length/checksum and atomic create-only semantics into a
   short-lived request. Disable direct upload when the adapter cannot prove them.
2. Allow exactly one successful data create and completion; record the exact
   storage version, strong checksum, size, ownership, magic bytes, and current
   job. Every later read rechecks that immutable version/checksum. Reconciliation
   lists/counts every physical version and treats extras as an invariant breach.
3. Scan the exact quarantined bytes. Positive, unavailable, timeout, partial,
   limit-exceeded, stale/missing signatures, or ambiguous means non-clean and
   reject. Signature age must remain within 24 hours; scanner CPU/RAM/time,
   recursion, expansion, and scan-size limits are explicit and compatible with
   the accepted input envelope.
4. Send only a clean exact version through the credentialless sandbox with time,
   page, pixel, decompression, text, and output budgets. Prefer native text; send
   only bounded necessary image/page input to the provider-neutral OCR adapter.
5. Store validated candidate values for review, not raw extraction artifacts.
6. On every terminal state, atomically establish a zero-byte current tombstone,
   delete all data versions, and retain the tombstone until the upload capability
   expires so replay cannot recreate bytes. Then delete the tombstone. Reconcile
   abandoned database rows/objects within 24 hours; use bucket lifecycle only as
   a backstop, not proof that application cleanup works.
7. Redact proposal values, alternatives, raw inputs, and instructions immediately
   after accept/discard/cancel and after the at-most-seven-day review window.
   Retain only content-free outcome/provenance metadata outside card revisions.

Cleanup is idempotent. An object-delete failure retains a sanitized retryable
state and alert signal; it does not resurrect processing or expose the object.

## Minimum operational signals

| Area      | Content-free signals                                                                              |
| --------- | ------------------------------------------------------------------------------------------------- |
| Queue     | queued/running count and oldest runnable age by canonical format, expired running-lease depth     |
| Outcomes  | completed/failed/cancelled/expired and review outcomes, retries, sanitized failure, duration      |
| Providers | settled reservation attempts, conservative budget settlement, fixed failures, circuit/concurrency |
| Uploads   | authorization/completion count, size bucket, scan outcome/duration, parser/OCR failures           |
| Cleanup   | pending/running/waiting depth, oldest age, deletion retries/failures, 24-hour breach              |
| Capacity  | worker CPU/RSS/restarts, PostgreSQL pool/lock/query latency, overlap headroom                     |
| Admission | owner/global queue headroom, pending upload bytes, provider reservation/circuit pressure          |
| Scanner   | latest attested signature age and fixed limit/unavailable/infected/timeout outcomes               |

The dictionary worker emits one fixed-schema, content-free operational
measurement at startup and every 60 seconds. The snapshot reports queue depth
and oldest age only for the four canonical versioned formats, expired running
leases, retry depth/attempts, terminal and review outcomes, a fixed allowlist of
failure counters, settled provider reservation attempts and conservative
admission-budget token/cost settlement, active reservations/circuit pressure,
upload counts/bytes/scan duration, scanner/parser/OCR failures, cleanup depth,
retries, oldest lag, and the 24-hour cleanup breach count. Settlement counters
must not be interpreted as actual provider calls, tokens, or spend because
pre-provider terminal paths conservatively settle their reserved budget. Unknown database
format or failure strings are never promoted to log keys or values. The worker
reconstructs the logged object field-by-field, so prompts, cards, documents,
object keys, owner/job IDs, and provider payloads cannot enter this signal.
Observation windows are accepted only from 10 seconds through five minutes;
production uses 60 seconds. Terminal-job, terminal-review,
upload-authorization, upload-completion, and scan windows use dedicated
timestamp indexes, while current queue, lease, reservation, quota, circuit, and
cleanup gauges use their bounded lifecycle indexes. Formats, failure
categories, scan outcomes, and size buckets are a compile-time fixed field set
rather than dynamic metric labels.

Process CPU/RSS/restarts and PostgreSQL pool, lock, and query latency remain
deployment/resource-profile signals rather than claims made by the application
snapshot. Exact HTTP capacity-rejection counters likewise require the API
process operational logger; the worker snapshot exposes only persisted queue,
provider-reservation, pending-upload-byte, owner fair-share, and circuit
pressure.

Alert urgently when no compatible worker can process the oldest ready job,
leases repeatedly expire, scanner failures block all document work, or cleanup
approaches 24 hours. Provider unavailability should disable only the affected
capability unless durable state or cleanup is at risk.

## Verification required before enablement

- Prove multi-worker lease exclusion, recovery, idempotent terminal transitions,
  fencing rejection of stale results, cancellation, schema-version skipping,
  two-release activation/rollback, and graceful/forced shutdown against a
  disposable PostgreSQL database.
- Prove private storage policy, presigned scope/expiry, quarantine enforcement,
  exact-version/checksum binding under overwrite races, clean/infected/stale/
  limit/unavailable scanner paths, parser-sandbox isolation and output limits,
  transactional quota release, proposal redaction, and terminal plus abandoned
  cleanup with disposable services and synthetic files.
- Exercise old/new worker overlap and rollback-compatible job formats in the
  local deployment rehearsal, including R+1 enqueue/process followed by rollback
  to the R API/web and successful poll/cancel/accept. Record connection/memory
  overlap in the resource profile before shared-environment enablement.
- Review the chosen model/OCR provider's retention, training, residency, cost,
  and deletion controls; capability configuration remains disabled until that
  review and credential setup are complete.
- Run independent security review for upload authorization, object isolation,
  parsers, external processing, log redaction, cleanup, and capability failures.
