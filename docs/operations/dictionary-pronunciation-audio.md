---
type: reference
title: Dictionary pronunciation operations
source_paths:
    - apps/backend/src/modules/speech/**
    - infra/deploy/**
    - .env.example
---

# Dictionary pronunciation operations

The shared speech module now serves dictionary fields, flashcards and sentence
learning through the existing dictionary worker process. Its authoritative
storage, retention, pricing and rotation runbook is
[Shared pronunciation operations](../shared-pronunciation-operations.md).
[ADR-0031](../adr/0031-shared-pronunciation-and-retained-recordings.md) partially
supersedes ADR-0020's owner-scoped deduplication, development storage and erasure
policy; [ADR-0032](../adr/0032-model-price-revisions-and-speech-settlement.md)
adds success-only speech billing and immutable editable tariffs.

## Local development

Apply compatible migrations and start the README's reviewed `pnpm dev:infra`,
API, web and dictionary worker commands. Infrastructure includes private,
persistent MinIO on loopback ports 9000/9001. Use ignored local settings:

```dotenv
SPEECH_PLAYBACK_ENABLED=true
SPEECH_GENERATION_ENABLED=true
DICTIONARY_AUDIO_PROVIDER=fixture
DICTIONARY_AUDIO_STORAGE=s3
DICTIONARY_AUDIO_S3_ENDPOINT=http://127.0.0.1:9000
DICTIONARY_AUDIO_S3_BUCKET=languon-speech-dev
DICTIONARY_AUDIO_S3_REGION=us-east-1
DICTIONARY_AUDIO_S3_FORCE_PATH_STYLE=true
DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS=[]
```

Use the scoped development application credentials from `.env.example`; never
reuse them in production. The Compose backend uses `http://minio:9000` rather
than the host endpoint. Fixture audio is a labelled WAV tone and proves plumbing,
not correct pronunciation. PostgreSQL byte storage remains a test adapter. Current `DICTIONARY_AUDIO_*`
settings configure shared provider/storage adapters; playback and admission use
only the `SPEECH_*` flags.

## Live provider configuration

Kie is the initial live adapter. Its stable configuration identity and voice-map
JSON pin the exact model, voice, language and settings revision. The public API
resolves capability metadata without the paid-provider key; only the dictionary
worker receives `DICTIONARY_AUDIO_KIE_API_KEY`. Use curated application-language
mappings, never guessed foreign voices. Unsupported generation can still reuse an
approved cached recording. Adding a provider/model follows
[$speech-model-configuration](../../.agents/skills/speech-model-configuration/SKILL.md).

`DICTIONARY_AUDIO_DOWNLOAD_HOSTS` contains exact verified HTTPS result hosts.
Private addresses, redirects and wildcard hosts are disallowed. Provider output
is bounded, validated and copied into private application storage; its URL is not
a permanent learner playback handle.

Operational owner/global budgets and maximum clip cost remain separate from
customer credits. Estimates must conservatively cover provider rounding/minimums.
Admin-published customer tariffs change future admissions, not provider estimates
or historical jobs. The current 2,000-code-point input ceiling, bounded queue,
active limits, file-size and duration validation remain required.

Retain original configuration IDs for pending tasks using worker-only
`DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS`. A credential/model change must not
reinterpret an existing provider task. Never blindly resubmit unknown work.

## S3 and release compatibility

Use private S3 in production, with distinct scoped API-read and
worker-write/delete credentials. Preserve current/retained namespace registry
entries while inventory still references them. See deployment examples for
`DICTIONARY_AUDIO_RETAINED_S3_API_CONFIGURATIONS` and
`DICTIONARY_AUDIO_RETAINED_S3_WORKER_CONFIGURATIONS`. Account purge receives no
audio storage credentials: account removal detaches owner links and retains
successful shared recordings.

Shared admission requires `sharedSpeech` and revision-aware `modelPricing`
support in active and rollback-floor releases. `sharedSpeech.speechBudget` owns
`maxCharacters`, `maxCostUnitsPerClip`, `ownerDailyCostUnits` and
`globalDailyCostUnits` with the current bounds and overlap invariant. Operational flags cannot bypass
release-derived version lists. The old owner-scoped protocol is retired by ADR-0040.

Scoped worker grants and database guards permit execution and approved cleanup,
but reject ready-recording erasure or immutable identity changes. Runtime keys,
normalized text and key-derived digests never belong in release metadata.
Fingerprint rotation must distribute both lookup aliases to every API, worker and
rollback node before switching the writer; the detailed two-phase checklist is
in the shared operations runbook.

## Failure and retention

Known provider tasks continue under their original identity across restarts.
Download/publication retries reuse output. Unknown submissions retain a
reconciliation marker and never trigger automatic resubmission. Closing the page
stops waiting/playback, not an admitted generation. Definitive failure or the
ten-minute billing deadline permanently releases speech holds; a late recording
may be reusable but never creates a late debit.

Successful normalized text and audio remains indefinitely after content/account
removal. Bindings, quotes and account associations are removed; pending holds are
closed without later charging the removed actor. Admitted shared work may still
finish. Only audited administrative inventory deletion erases successful speech;
failed/temporary cleanup has its own bounded lifecycle. Already delivered bytes
cannot be retracted and provider-side retention is a separate policy.

The old owner-scoped API, worker and one-time migration CLI are retired.
The retirement migration refuses nonempty old inventory; never bypass that check
or erase unaccounted provider tasks/objects. Shared recordings and billing state
remain governed by ADR-0031/0032 and their current cleanup paths.

## Verification evidence

Feature 042 records real browser/media playback, paid quote/cancellation/success,
cross-user reuse, admin preview/price publication/impact deletion, disposable
PostgreSQL financial/source tests, MinIO integrity/version deletion and
actual least-privilege SQL roles. These checks use deterministic fixtures.

Before live activation, separately record a bounded authorized Kie quality,
connectivity/cost/terms check and isolated Selectel conformance using the built
release. No local fixture or generic S3 emulator proves live pronunciation,
provider access from Russia, Selectel behavior or deployment-host activation.
