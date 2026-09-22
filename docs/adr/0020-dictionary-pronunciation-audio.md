# ADR-0020: Dictionary pronunciation audio

Status: Accepted
Date: 2026-09-21
Supersedes: None

## Context

Learners need playback of saved source/translation/example text. The user wants
replaceable TTS providers including Kie, PostgreSQL byte storage in development,
and private S3-compatible production storage likely hosted by Selectel. Provider
jobs may be asynchronous; their output URLs are not durable application storage.
The user requested a plan for review before implementation.
The user subsequently authorized implementation of the reviewed feature plan
on 2026-09-21. Production activation remains subject to its explicit checks.

Existing dictionary AI jobs return reviewable card proposals and use token
budgets. Audio is derived data and has different lifecycle/cost semantics.
Existing account purge explicitly enumerates jobs and external objects; audio
must participate in erasure, deployment rollback and historical restore safety.

## Decision

Propose a dictionary-owned pronunciation subsystem with typed metadata/jobs and
two independent application ports: speech synthesis and audio-object storage.
Application services own saved-field authorization, effective language, current
content checks, admission, cache bindings and lifecycle. Infrastructure owns
provider HTTP/SDKs, PostgreSQL bytea and S3 implementations. Contracts expose
domain states and authorized bytes, never provider credentials or object URLs.

Use the existing dictionary worker process with a narrow application coordinator
and separate speech queue/state/budgets. Preserve leases, fencing, scheduled
polling and bounded work; do not force speech into AI proposal acceptance.
Support both immediate and pending provider results, starting with Kie and a
deterministic fixture adapter. Persist original provider configuration identity
and task IDs. Unknown submission without upstream idempotency requires
reconciliation rather than automatic repeated billing.

Generate on demand and reuse a valid card-field binding before selecting the
current provider. Keep logical content identity separate from immutable
provider/model/voice/settings rendition identity. This preserves existing audio
across provider changes. Deduplication is scoped to the same owner/card/field;
cross-owner or cross-card sharing is not part of this decision. Audio generation
does not alter authoritative card text, revision history or authorship.

Development/test audio bytes may reside in a separate bytea table. Production
requires private S3-compatible storage and rejects fixture/bytea configuration.
Both storage adapters implement only required bounded operations, not an S3
emulator. Give audio its own namespace/credential/lifecycle boundary, distinct
from document quarantine, database backup and deletion-recovery journal.

Stream bytes through current authorized backend requests. Initial web clients
use bearer-aware fetch and short-lived Blob URLs. Recheck active owner/current
field visibility and content on status/bytes; no anonymous playback/generation
in the first release. No public S3 URLs or browser persistent audio cache.
Already-delivered bytes cannot be revoked retroactively.

Inventory object intent before upload; reconcile failed publication and late
writes. Extend purge work guards, typed storage dispatch, all-version deletion,
bytea cleanup and SQL finalization. Do not erase inventory before proving external
removal and writer quiescence. Preserve ADR-0019 restore replay and journal policy.

Add a separate optional pronunciation capability/version/budget section to release
metadata; absence means disabled. Follow ADR-0012 expand/activate rules and include
audio-aware purge workers in the rollback floor. Rollback disables admission but
retains cleanup and compatible reads. This adds no new worker process topology.

## Alternatives considered

### Native speech synthesis only

Least infrastructure and no application TTS bill, but voices/quality differ by
device and it does not meet the requested centrally stored reusable recordings.
Optional native fallback can be evaluated later without changing these ports.

### Dedicated generic media service or universal asset table

Would put authorization/language/card lifecycle across an additional boundary
and introduce abstractions without a second implemented consumer. Retain typed
dictionary ownership under ADR-0011; extract only after concrete reuse emerges.

### Existing AI proposal job executors and document object storage port

Their acceptance/discard/token and quarantine/scanner/capability-expiry semantics
are incorrect for audio. Reuse infrastructure libraries/runtime, not these domain
contracts. This avoids incidental dependencies on model agents and document tools.

### Local S3 emulator for all development

Useful for adapter conformance, but adds infrastructure to every local session.
The requested PostgreSQL dev adapter is sufficient for routine journeys; real S3
and Selectel conformance remain required production evidence.

### Direct provider URL playback or TTS per play

Couples playback to expiring provider URLs, availability and repeated charges.
Copy output to application-owned storage; serving a cached asset requires no
provider call and remains possible during provider outages.

## Consequences

### Positive

- Provider/storage changes are isolated and existing audio remains reusable.
- Local development needs no S3 or paid service.
- Authorization and deletion stay aligned with existing dictionary/account rules.
- Future mobile clients can use the same contracts with their own player.

### Negative

- Additional schema, cleanup inventory, job state and release compatibility work.
- First play waits for upstream queue/synthesis; caching only speeds repeat plays.
- Unknown upstream submissions require reconciliation instead of effortless retry.

### Risks / limitations

- Model language coverage, listening quality, latency, cost, caching rights,
  provider retention and processing location must be verified before activation.
- Selectel hosting does not imply TTS data remains in Russia.
- PostgreSQL/local S3 tests do not prove actual Selectel compatibility.
- Native dictionary UI is explicitly deferred; mobile-browser support is not
  native-device feature completion.

## Related

- [Feature](../../.agent/features/027-dictionary-pronunciation-audio/FEATURE.md).
- [ExecPlan](../../.agent/features/027-dictionary-pronunciation-audio/EXEC_PLAN.md).
- [ADR-0011](./0011-dictionary-persistence-and-composition.md).
- [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md).
- [ADR-0019](./0019-account-deletion-journal-commit-and-replay.md).
