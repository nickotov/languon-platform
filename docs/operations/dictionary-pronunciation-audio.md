# Dictionary pronunciation audio operations

Audio runs in the existing dictionary worker process with its own queue, capacity
and spend reservations. It does not use card proposal acceptance or token budgets.
See [user flow](../user-flows/dictionary-pronunciation-audio.md) and
[ADR-0020](../adr/0020-dictionary-pronunciation-audio.md).

## Local development

Apply migrations and start PostgreSQL/Redis, API, web and the dictionary worker
using the root README commands. In ignored environment configuration set:

```dotenv
DICTIONARY_AUDIO_PLAYBACK_ENABLED=true
DICTIONARY_AUDIO_GENERATION_ENABLED=true
DICTIONARY_AUDIO_PROVIDER=fixture
DICTIONARY_AUDIO_STORAGE=postgres
DICTIONARY_AUDIO_FINGERPRINT_SECRET=development-only-audio-fingerprint-secret-change-me
```

Keep the fingerprint secret identical across API and worker and distinct from
dictionary share-link/authentication secrets. Fixture audio is a short WAV tone,
not pronunciation; web displays that limitation. PostgreSQL stores bytes in a
separate table, outside ordinary card reads. No S3 emulator is required.

## Live provider configuration

Kie is the initial live adapter; other providers implement the same application
port. Use `DICTIONARY_AUDIO_PROVIDER=kie`, a unique stable
`DICTIONARY_AUDIO_CONFIGURATION_ID` and `DICTIONARY_AUDIO_VOICE_MAP` JSON keyed
by dictionary language tag. Only the dictionary worker receives
`DICTIONARY_AUDIO_KIE_API_KEY`; the public API resolves profile metadata without
paid-provider credentials or executable submit/poll adapters. Each map value
contains `model` (`elevenlabs/text-to-speech-turbo-2-5`), a verified `voice` ID,
positive `estimatedCostUnitsPerCharacter`, and `settingsVersion`. Unsupported
languages remain unavailable; do not map them to a guessed foreign voice.

`DICTIONARY_AUDIO_DOWNLOAD_HOSTS` is a comma-separated list of exact HTTPS result
hostnames verified from provider documentation/output. There are no wildcard
hosts, private IPs or redirects. Returned media is validated and copied to owned
storage immediately; provider URLs are never returned to the browser.

Set explicit positive daily `DICTIONARY_AUDIO_OWNER_BUDGET_UNITS` and
`DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS`, plus `DICTIONARY_AUDIO_MAX_COST_UNITS_PER_CLIP`.
Use one conservative integer cost unit consistently for profiles and reservations.
These are admission estimates, not reconciliation against a provider invoice.
Limits also include `DICTIONARY_AUDIO_MAX_CHARACTERS` (at most 2000), owner queued/
active limits and global active limit. Configure rates to cover the provider's
minimum billable clip/rounding behavior conservatively before enabling production.

To change credentials/configuration without abandoning pending work, retain old
entries in worker-only ignored `DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS` JSON:
an array of `{configurationId, apiKey, allowedDownloadHosts}`. IDs must be unique
and distinct from the current default. Existing jobs carry their original profile
and use its matching retained credentials. Remove retained entries only after
their tasks have drained or reached the documented reconciliation boundary.
Unchanged ready field bindings survive changing the default provider.

## Storage and deployment

Production requires `DICTIONARY_AUDIO_STORAGE=s3`, a dedicated fingerprint secret,
and a live provider configuration. Set audio S3 endpoint, region, bucket and
path-style behavior using the audio environment example. Use private Selectel
S3-compatible storage with separate API-read, worker-write/delete and purge-delete
credentials; never reuse document quarantine, backups or recovery-journal keys.
The deployed compose mapping converts each role's credentials to its internal
adapter variables. Inspect `infra/deploy/production.env.example`,
`infra/deploy/stage.env.example` and root `.env.example` for exact names.
Retain old storage endpoints/buckets until their inventory is empty. Configure
`DICTIONARY_AUDIO_RETAINED_S3_API_CONFIGURATIONS`,
`DICTIONARY_AUDIO_RETAINED_S3_WORKER_CONFIGURATIONS` and
`ACCOUNT_PURGE_AUDIO_RETAINED_S3_CONFIGURATIONS` with role-specific credentials;
each maps to the adapter's retained namespace registry. Existing reads, pending
upload intents and purge continue through their original backend/namespace,
while new admissions use the current primary. Missing retained credentials fail
closed and preserve inventory rather than silently deleting its SQL reference.

Release manifests have an independent optional `pronunciationAudio` section
(absent means disabled); the manifest CLI accepts `--pronunciation-audio` JSON.
First expand with dormant compatible API/read/enqueue/web/worker/purge versions;
activate only when the rollback floor also understands audio inventory and purge.
Release metadata pins activation and speech budgets. The worker role can read
only required owner/card/settings columns and cannot mutate user identity.

Before enabling production, record a small explicitly authorized synthetic live
Kie test for supported languages, pronunciation, latency and actual costs, plus
a dedicated Selectel bucket's put/read/integrity/delete/all-version and least-
privilege checks. Verify provider cache/delivery rights, retention and processing
location. Selectel hosting does not establish where Kie processes text. Neither
live test has been run as part of deterministic development verification.

## Failures, retention and erasure

The two-minute client deadline ends waiting, not an upstream task. Known task IDs
are polled durably; polling/download/storage failures do not resubmit synthesis.
Ambiguous submission without a returned ID becomes `submission_unknown` and
retains its same-field binding, preventing duplicate possibly paid requests.
At the 24-hour reconciliation boundary unresolved known work becomes the same
no-resubmit tombstone; text is redacted and capacity released. Spend reservations
remain in their daily ledger. V1 intentionally has no automatic or user-facing
override for unresolved outcomes. Preserve provider/account evidence for future
operator reconciliation; do not delete SQL rows to force a retry.

Normal ready audio expires after 30 idle days and regenerates on next request.
Settled asset-less job ledgers prune after their UTC budget day; unresolved
unbound ledgers retain 30 days, while bound unresolved tombstones continue to
prevent duplicate paid requests. Reconciliation scans run on a bounded60-second
cadence; object cleanup continues between scans even when generation is disabled.
Superseded/unbound terminal assets are eligible after 24 hours. Writer deadlines
and worker leases must both quiesce before physical deletion. Object intent is
recorded before upload, so a lost publication fence remains discoverable cleanup
work; versioned buckets require removal of physical versions, not just markers.

Account deletion denies access and cancels audio work immediately. Purge uses
state-aware cancellation: work that may already have been submitted keeps its
non-retryable identity if deletion is later cancelled or an account is restored.
Definitely unsubmitted queued work may retry. Purge uses
typed document/audio inventories, verifies bytes removed, and only then finalizes
SQL erasure. Restore replay remains gated by ADR-0019. It cannot retract bytes
already delivered to a client or make claims about upstream provider retention.
Cleanup must remain configured after generation is disabled and during rollback.

## Verification evidence

The feature evidence records deterministic browser/media playback, PostgreSQL
concurrency and late-write cleanup, provider fixture/security cases, restricted
database role checks, and account purge. Live Kie and Selectel activation evidence
must be added separately before production enablement.
