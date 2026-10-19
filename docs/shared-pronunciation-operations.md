---
type: reference
title: Shared pronunciation storage and activation operations
source_paths:
    - compose.yaml
    - infra/dev/speech-storage-policy.json
    - .env.example
    - infra/deploy/lib/shared-speech.mjs
---

# Shared pronunciation storage and activation operations

## Local storage

`pnpm dev:infra` starts PostgreSQL, Redis, a separate persistent MinIO service and
an idempotent bucket initializer. The API binds to `127.0.0.1:9000`; the console
binds to `127.0.0.1:9001`. Port overrides use `SPEECH_DEV_MINIO_PORT` and
`SPEECH_DEV_MINIO_CONSOLE_PORT`. The private, versioned bucket is
`languon-speech-dev`. Initializer credentials have root administration privileges;
application credentials have access only to this bucket. Local example values
are public development defaults and must never be used in staging or production.

Copy the sanitized settings from `.env.example` to the ignored local environment.
Host application processes use `http://127.0.0.1:9000`; the Compose backend uses
`http://minio:9000`. Keep `DICTIONARY_AUDIO_STORAGE=s3`, path-style access enabled
and the S3 region `us-east-1` for local MinIO. A customized API port must also be
reflected in the host S3 endpoint. MinIO root and application credential overrides
must agree between the initializer and application configuration.

Shared playback/admission flags are `SPEECH_PLAYBACK_ENABLED` and
`SPEECH_GENERATION_ENABLED`; both default false. Existing `DICTIONARY_AUDIO_*`
provider/storage settings remain adapter configuration. Local provider `fixture`
produces a clearly labelled tone; it validates plumbing, not pronunciation.
Changing an environment example does not activate live Kie.

Use the README migration, backend, web and dictionary-worker commands after
starting infrastructure. Inspect container status and initializer completion
before enabling local playback. Ordinary stop preserves the `speech-minio-data`
volume. Deleting the volume is destructive and is never part of ordinary cleanup.
Disposable storage tests must use separate projects, buckets and credentials;
the document-test project and production backup/deletion-journal stores are not
speech development storage.

## Real pronunciation in development

A beep with `DICTIONARY_AUDIO_PROVIDER=fixture` is intentional test audio: no model
is called. Set the following in ignored `.env.local`, consistently for API and worker:

- `DICTIONARY_AUDIO_PROVIDER=kie` and `DICTIONARY_AUDIO_KIE_API_KEY`.
- A new immutable `DICTIONARY_AUDIO_CONFIGURATION_ID` for the voice/model settings.
- `DICTIONARY_AUDIO_VOICE_MAP`: JSON entries keyed by configured app language with
  `model`, `voice`, `estimatedCostUnitsPerCharacter` and `settingsVersion`.
- `DICTIONARY_AUDIO_DOWNLOAD_HOSTS`: a comma-separated allowlist of trusted provider
  result hosts; unrestricted URLs are rejected. The provisional local allowlist is
  `tempfile.aiquickdraw.com,file.aiquickdraw.com`; validate the actual result host
  through the guarded adapter, never allow a host merely because a task returns it.
- Keep `SPEECH_PLAYBACK_ENABLED=true` and `SPEECH_GENERATION_ENABLED=true`, private
  S3/MinIO storage and spend budgets. Paid-length synthesis also requires a valid
  speech tariff; its quote/confirmation behavior is unchanged.

For an initial evaluation, Kie lists Bella (`hpp4J3VqNfWAUOO0d1Us`) as a warm,
professional voice for the currently curated `elevenlabs/text-to-speech-turbo-2-5`.
This is a provisional starting voice, not a pronunciation-quality certification.
The official Turbo price is six Kie credits per 1,000 characters; an estimate of
`0.006` budget units per character measures these budgets in Kie credits. Learner
credits remain a separately configured tariff.
[Official voice contract](https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5),
[official model pricing](https://kie.ai/elevenlabs-tts?model=elevenlabs/text-to-speech-turbo-2-5).

Every configured language must already be in the curated app/model capability set;
Hungarian is not currently an app language. Do not add a language solely by editing
environment JSON. Review actual pronunciation per language before production use.

Fixture and real pronunciation have separate, mandatory class-scoped canonical
identities. Existing test tones remain retained for development evidence but
are never reused for new live requests. Real recordings remain reusable across
live provider/model changes and if their language is no longer generatable. No
bucket reset or audio deletion is necessary. Historical requests keep their pinned
recording; changing providers does not retarget an already issued playback handle.

Pause admission and restart API and dictionary worker together when deploying
this identity repair or switching providers. Do not overlap older and repaired API
writers: older binaries cannot recognize the new scoped canonical keys and may
otherwise admit duplicate generation. Then enable generation on repaired processes.

## Model and provider adapters

The model catalog in `speech/domain/speech-models.ts` owns reviewed capabilities
and feeds configuration validation and administrative tariff discovery. Add a
model definition plus its request strategy in `kie-model-strategies.ts` when the
Kie submit/poll protocol applies. A new provider implements `SpeechSynthesisProvider`,
adds a factory/metadata resolver in `speech-provider-registry.ts`, and adds reviewed
credential validation in the environment adapter. HTTP/SDKs remain infrastructure;
learners never supply endpoints, voices or settings. No automatic paid fallback.

Kie `google/gemini-3-8-flash-lite-tts` uses one preset speaker, `dialogue_turns`,
fixed temperature 1 and a separate language/pronunciation style. Only saved text
is spoken. The initial tutor preset is `Zephyr`, with settings revision
`gemini-pronunciation-1`. WAV output is documented as PCM16/24 kHz/mono. The guarded
downloader validates bounded PCM16 WAV or MP3 before private storage.
[Exact Kie API contract](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts),
[upstream language table](https://ai.google.dev/gemini-api/docs/speech-generation).

Enabled Gemini mappings intersect the current app catalog and documented support:
`ar,de,en,es,fr,he,hi,it,ja,ko,pl,pt,ru,tr,zh-Hans`. Ukrainian is absent from the
current Flash-Lite table and cannot be configured for this model; Turbo retains
its existing Ukrainian support. Existing approved Ukrainian audio remains playable.
Hungarian is supported upstream but requires a separate app-language addition.
Language coverage is distinct from reviewed pronunciation quality.

Example voice-map entry (repeat only for verified supported app languages):

```json
{
    "fr": {
        "model": "google/gemini-3-8-flash-lite-tts",
        "voice": "Zephyr",
        "settingsVersion": "gemini-pronunciation-1",
        "estimatedCostUnitsPerCharacter": 0.02
    }
}
```

The `0.02` is a conservative local planning estimate in Kie-credit budget units,
not a published per-character price or guaranteed spend bound. Gemini is billed
by input and audio-output tokens: currently 70 and 840 Kie credits per million
respectively, with promotional pricing through December 31, 2026. Measure actual
usage before production activation. Customer speech tariffs remain independent,
starting with the existing provisional 100 app credits/1,000 characters.
[Model-specific pricing](https://kie.ai/gemini-3-8-flash-lite-tts).

Change `DICTIONARY_AUDIO_CONFIGURATION_ID` when changing defaults. Preserve the old
identity in ignored `DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS`, containing its
`configurationId`, credential and exact `allowedDownloadHosts`, before restarting
API and worker together. Retained jobs poll their pinned model/voice/settings; they
never use replacement defaults. Ready live recordings are reused first, even if
the new model cannot generate that language. Existing quotes may require refresh.
A new catalog model receives an immutable provisional tariff on first discovery;
old revisions and admitted charges are not rewritten.

## Retention and administration

Successful normalized text and audio remain indefinitely, even after originating
content/accounts disappear. Bindings and user associations are removed; retained
text may still contain personal information. This is an explicit product policy,
not automatic anonymization. See [ADR-0031](adr/0031-shared-pronunciation-and-retained-recordings.md).

Administrative removal is audited, confirms current link impact and first blocks
playback. Physical cleanup must remove all object versions and retain inventory
until successful. Automatic temporary/failed-upload cleanup must not age-delete
successful recordings. A failed cleanup remains visible/retryable rather than
making audio available again.

## Production activation checklist

This reference describes required evidence, not a claim that production has been
provisioned or tested. Keep admission disabled until the feature evidence records:

- Exact Kie model/route, configured application-language and voice mappings,
  output limits, trusted download hosts and retained profile identities.
- Deployment-environment provider connectivity, terms/caching permission,
  reviewed real pronunciation samples and bounded measured cost/latency.
- Selectel private bucket/prefix and scoped runtime/cleanup credentials; isolated
  conformance proof for upload, checksum validation, authorized read and complete
  version deletion. Never point disposable destructive checks at retained data.
- Current schema migration, shared-worker claim/admission fencing and verified
  absence of retired owner-scoped pronunciation inventory.
- An effective immutable price revision and a compatible speech settlement worker.
- Account/content deletion removes associations without erasing retained successful
  speech, and without allowing a late debit to a removed account.

`sharedSpeech` declares version-one enqueue, API/web/admin/purge
readers, workers and `speech-generation:v1` settlement support. Its `speechBudget`
contains positive integer `maxCharacters` (at most 2000),
`maxCostUnitsPerClip`, `ownerDailyCostUnits` and `globalDailyCostUnits`; retain
the existing clip/owner/global cost relationships and unchanged budgets while
worker releases overlap. Release creation uses `--shared-speech` JSON and
`--model-pricing` JSON. The retired `--pronunciation-audio` option is rejected.
`modelPricing`
declares revision-aware API admission and workers. Missing namespaces are dormant.
Ship a compatibility release with complete readers/workers before an enabled
release admits work. Both the active release and rollback floor must cover the
new versions. Production worker privilege preflight verifies scoped execution
and immutable tariff reads. Runtime transactional version fences remain required.

Deployment derives `SPEECH_API_ENQUEUED_VERSIONS`,
`SPEECH_WORKER_PROCESSABLE_VERSIONS`, `AI_MODEL_PRICE_API_ADMITTED_VERSIONS` and
`AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS` from the manifest rather than trusting
stale operator values. Deployed shared generation requires version one in all four lists, including
both API admission and worker processing declarations for speech and pricing.
Deployed configured text-AI admission/catalog readiness likewise requires both
price-version declarations. Verify every actual worker pool and rollback image is
revision-aware before enabling either admission path; the environment declaration
is not a substitute for that observation. Missing declarations fail closed.
Local development/test follows its non-deployed defaults.

## Rollback and recovery

Disable new shared admission first. Keep compatible reads, settlement, known-task
polling and object cleanup running. Do not roll back to workers that can reinterpret
newly priced jobs or owner-delete global successful assets. Do not revert schema
by dropping retained audio, price revisions or ledger history.

A lost submission response is uncertain, not permission to resubmit. Known tasks
retain original model/profile identity; unknown outcomes require operator
reconciliation. Repeated downloads/publication retries reuse the same output.
Ten-minute billing closure is permanent even if audio arrives later; late results
may become reusable but cannot debit the learner. See
[ADR-0032](adr/0032-model-price-revisions-and-speech-settlement.md).

## Configuration changes

Use [$speech-model-configuration](../.agents/skills/speech-model-configuration/SKILL.md)
for curated provider/model changes. Publish a new profile identity, retain old
identities for outstanding tasks and preserve approved recording reuse. Tariff
publication is a separate authorized admin action; it changes future admissions
and invalidates stale unconfirmed quotes, not historical accounting.

## Fingerprint-key rotation

`DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS` is a JSON array of at most 16
historical/next secrets, each 32–4096 characters. The default is `[]`. Keep this
field in the protected deployment configuration/secret pipeline, not manifests,
audit records, source control or commands that print resolved Compose secrets.
The API and dictionary worker receive it; web, admin and account purge do not.
Invalid configuration errors never include secret values. JSON normalization
preserves escaped newlines and quotes before passing values as process environment,
without shell evaluation or double escaping.

Rotate in two phases:

1. Keep the old write key active. Distribute the new key as a retained lookup alias
   to **every** API and worker instance, including the rollback-floor release and
   any inactive slot that could become active. Keep older aliases needed for
   retained recordings. Verify both keys are recognized before changing writers.
2. After per-node verification, switch the active write key to the new key while
   retaining the old key as an alias. During mixed deployment every node must
   recognize the same old/new set. Confirm cache reuse and single admission under
   concurrent requests from both writer configurations before finishing rotation.

The admission implementation rechecks known aliases while holding the shared
operational-budget lock, so mixed canonical write identities cannot independently
admit work **when every participant knows both keys**. This does not repair a
node with missing aliases. If distribution cannot be established, stop new
admission until it can; do not blindly retry or discard recording identities.

Keep a redacted operator receipt per API/worker/rollback node: release identity,
normalization/HMAC algorithm revision, rotation batch identifier, alias count,
recognized old/new logical key labels and verification time. Compare actual
values through the authorized secret manager in memory. Never publish keys,
key-derived fingerprints/digests, sample private text or resolved configuration.
Manifest capability fields cannot prove secret equality; equal alias counts alone
are insufficient evidence. Verify protected values explicitly before phase two.

Successful recordings retain indefinite reuse requirements. Do not retire an old
lookup key merely because jobs drained: first establish a reviewed identity
migration or continued historical lookup support. Rollback restores the old
writer only while keeping the new writer's key as a lookup alias.

## Preproduction protocol retirement

ADR-0040 retires the owner-scoped dictionary audio API/worker and its one-time
migration command. All current dictionary, flashcard and sentence playback uses
the shared speech protocol. The retirement migration refuses nonempty old audio
inventory rather than discarding unaccounted provider tasks or remote objects.
The authorized local preflight found no old assets, jobs, bindings or blobs.
Shared recordings, source bindings, prices, holds and ledger history remain.

The PostgreSQL byte adapter remains test infrastructure under speech ownership;
standard development uses private persistent MinIO. Provider/storage settings
named DICTIONARY_AUDIO_* still configure the current shared adapters. Playback
and admission use only SPEECH_PLAYBACK_ENABLED and SPEECH_GENERATION_ENABLED.

## Terminal provider failures

Kie can accept submission, then mark the known task as failed with `failCode` 500.
No result URL or audio exists in that case. Only safe classification is persisted:
429/500/502/503/504 map to `speech_provider_unavailable`; other terminal codes map
to `speech_generation_failed`. Raw provider messages/URLs/prompts are never exposed
or stored as the learner error. Failure cleanup removes recording bytes/text but
preserves the request's safe cause and caller-specific billing: refunded payer
sees `released_no_charge`, joining actors see `free`.

Inspect only the already-known task when diagnosing; do not create a replacement
paid task or change model/voice blindly. Current Turbo/Bella/French request matches
the documented contract. Successful Kie generation remains externally blocked by
its terminal internal error in the verified request. Another model/provider needs
separate capability, voice, price and pronunciation evidence before activation.
