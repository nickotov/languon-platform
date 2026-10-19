---
type: diagram
title: Speech reuse, generation and pricing
summary: Saved-source authorization precedes shared recording reuse or confirmed generation with success-only settlement.
source_paths:
    - apps/backend/src/modules/speech/application/speech-service.ts
    - apps/backend/src/modules/speech/application/speech-worker.ts
    - apps/backend/src/modules/speech/infrastructure/composition.ts
    - apps/backend/src/modules/speech/infrastructure/drizzle-speech-store.ts
    - apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts
    - apps/backend/src/modules/speech/infrastructure/audio/speech-provider-registry.ts
    - apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
    - compose.yaml
    - docs/adr/0031-shared-pronunciation-and-retained-recordings.md
    - docs/adr/0032-model-price-revisions-and-speech-settlement.md
    - docs/adr/0034-speech-model-adapter-registration.md
    - apps/web/src/fsd/features/speech-playback/api/speech-api.ts
    - apps/backend/src/modules/speech/domain/speech-policy.ts
    - docs/adr/0040-preproduction-owner-scoped-audio-retirement.md
    - apps/backend/drizzle/0074_retire_dictionary_audio.sql
    - apps/backend/src/modules/speech/infrastructure/blob-schema.ts
    - apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-environment.ts
    - apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts
    - apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-budget.ts
source_fingerprint: sha256:cc5b017849b79328460785aede73d9c3e172fb52496da779441c004dbc27404a
reviewed: 2026-10-19
---

# Speech reuse, generation and pricing

Saved-source authorization precedes shared recording reuse or confirmed generation with success-only settlement.

```mermaid
flowchart TB
    Click["Play saved dictionary / sentence source"] --> Resolve["Resolve authorized current source/revision
normalize text + language"]
    Resolve --> Reuse{"Approved equivalent recording
or active generation?"}
    Reuse -->|"Recording hit"| Playback["Fresh source/binding/inventory checks
private backend audio delivery"]
    Reuse -->|"In-flight"| Join["Join existing request for free"]
    Reuse -->|"Miss"| Short{"At most 10 words AND 100 code points?"}
    Short -->|"Yes, allowance available"| Admit["Atomic admission: recheck reuse, profile, source
pin synthesis policy and price"]
    Short -->|"No"| Quote["Exact expiring quote
reserves nothing"] --> Confirm["Learner confirms charge"] --> Admit
    Admit --> Hold["Reserve exact charge for a new paid job
no extra reservation for joined requests"]
    Hold --> Job[("Durable speech job + private object inventory")]
    Job --> Worker["Existing bounded worker
submit once / poll known task"]
    Worker --> Audio["Validate complete bounded MP3/WAV
store private object"]
    Audio --> Success["Publish immutable recording
settle only inside billing deadline"] --> Playback
    Worker --> Failure["Definitive failure or billing deadline
release hold permanently"]
    Audio -->|"Late success after billing closure"| Retain["Retain reusable recording with no late debit"]
    Admin["Authorized admin confirmed erasure"] --> Delete["Revoke playback immediately
durable deletion of every object version"]
    Success --> Delete
```

Recording reuse precedes today's default model selection. The first new paid
admission pays; cache hits and joined requests are free. Exhausted short-text free
allowance rejects a new admission rather than silently charging. Credits use the
same ledger as text work, but speech only settles after validated audio publication.
Quotes expire after five minutes; billing closes ten minutes after admission.
Known task recovery and retained late output do not reopen billing.

Source/account removal revokes bindings and associations. Successful normalized
text/audio remains retained under ADR-0031, including text that may contain personal
data; retention is not an anonymization claim. Admin erasure handles object versions.
Provider URLs and canonical identities stay private. Standard development storage
is private versioned MinIO; fixtures are deterministic and do not prove pronunciation
quality. ADR-0040 retires the former owner-scoped dictionary-audio HTTP protocol, worker,
client feature and one-time migration command. Shared speech is the current path.
`SPEECH_PLAYBACK_ENABLED` and `SPEECH_GENERATION_ENABLED` gate it; retained
`DICTIONARY_AUDIO_*` names configure its current provider/storage/profile/budgets
and are not evidence of an executable old protocol.

Migration 0074 locks and refuses nonempty old inventory before dropping the three
obsolete assets/jobs/bindings tables. The physical `dictionary_audio_blobs` byte
table remains owned by speech for the live PostgreSQL test-storage adapter; its
name does not make the stored references obsolete. No remote-object deletion is
implied. Current retained key/provider/storage configuration protects pending
tasks and reusable recordings. The worker coordinator now alternates dictionary
generation with shared speech only.
No arbitrary-text synthesis API is represented.

## Sources

- [apps/backend/src/modules/speech/application/speech-service.ts](../../apps/backend/src/modules/speech/application/speech-service.ts)
- [apps/backend/src/modules/speech/application/speech-worker.ts](../../apps/backend/src/modules/speech/application/speech-worker.ts)
- [apps/backend/src/modules/speech/infrastructure/composition.ts](../../apps/backend/src/modules/speech/infrastructure/composition.ts)
- [apps/backend/src/modules/speech/infrastructure/drizzle-speech-store.ts](../../apps/backend/src/modules/speech/infrastructure/drizzle-speech-store.ts)
- [apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts](../../apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts)
- [apps/backend/src/modules/speech/infrastructure/audio/speech-provider-registry.ts](../../apps/backend/src/modules/speech/infrastructure/audio/speech-provider-registry.ts)
- [apps/backend/src/infrastructure/worker/dictionary-worker-command.ts](../../apps/backend/src/infrastructure/worker/dictionary-worker-command.ts)
- [compose.yaml](../../compose.yaml)
- [docs/adr/0031-shared-pronunciation-and-retained-recordings.md](../../docs/adr/0031-shared-pronunciation-and-retained-recordings.md)
- [docs/adr/0032-model-price-revisions-and-speech-settlement.md](../../docs/adr/0032-model-price-revisions-and-speech-settlement.md)
- [docs/adr/0034-speech-model-adapter-registration.md](../../docs/adr/0034-speech-model-adapter-registration.md)
- [apps/web/src/fsd/features/speech-playback/api/speech-api.ts](../../apps/web/src/fsd/features/speech-playback/api/speech-api.ts)
- [apps/backend/src/modules/speech/domain/speech-policy.ts](../../apps/backend/src/modules/speech/domain/speech-policy.ts)
- [docs/adr/0040-preproduction-owner-scoped-audio-retirement.md](../../docs/adr/0040-preproduction-owner-scoped-audio-retirement.md)
- [apps/backend/drizzle/0074_retire_dictionary_audio.sql](../../apps/backend/drizzle/0074_retire_dictionary_audio.sql)
- [apps/backend/src/modules/speech/infrastructure/blob-schema.ts](../../apps/backend/src/modules/speech/infrastructure/blob-schema.ts)
- [apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-environment.ts](../../apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-environment.ts)
- [apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts](../../apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts)
- [apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-budget.ts](../../apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-budget.ts)
