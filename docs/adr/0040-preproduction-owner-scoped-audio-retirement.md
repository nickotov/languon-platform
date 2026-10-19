---
type: adr
id: ADR-0040
title: Preproduction retirement of owner-scoped pronunciation
status: accepted
date: 2026-10-19
supersedes: 'ADR-0020 executable owner-scoped audio protocol; ADR-0031 additive legacy cutover and migration-only compatibility'
---

# ADR-0040: Preproduction retirement of owner-scoped pronunciation

## Context

The user authorizes preproduction stale-code and compatibility removal, with
local development data cleanup. All current dictionary/editor/shared/learning
screens use shared speech. The old dictionary audio feature has no production
frontend consumers, while its protocol, worker, migration command and table
inventory remain as a parallel implementation. Verified local development
inventory contains zero old assets, jobs, bindings and PostgreSQL blobs.

## Decision

Retire the owner-scoped dictionary audio routes, application services/worker,
persistence engine, domain state, obsolete contracts/client feature and aliases.
Remove the one-time legacy-to-shared migration CLI/class and its exclusive tests.
Keep current shared speech source authorization, recording reuse, provider/task
identity, tariff/hold/ledger settlement, indefinite retention, admin erasure and
storage cleanup. The shared speech worker remains scheduled by the existing
bounded dictionary worker coordinator.

Remove old owner-scoped queue measurements, the pronunciationAudio release
namespace/privilege preflight and obsolete playback/admission flags. Current
sharedSpeech release metadata owns speechBudget (maxCharacters,
maxCostUnitsPerClip, ownerDailyCostUnits, globalDailyCostUnits), preserving its
bounds and overlapping-worker budget invariant. Release creation accepts
--shared-speech and --model-pricing JSON; the old --pronunciation-audio option is
retired. Keep sharedSpeech/modelPricing admission and settlement version gates.
SPEECH_PLAYBACK_ENABLED and SPEECH_GENERATION_ENABLED control the shared
protocol. Existing DICTIONARY_AUDIO_* provider/storage/profile/budget names still
configure live shared adapters and are retained as current configuration.
Import reusable speech provider/storage ports and adapters from their owning
speech module, removing dictionary pass-through re-exports. Preserve supported
configuration/key rotation for current pending tasks and retained recordings.
Require the fixture/pronunciation class in canonical text HMAC identities; retire
the unscoped-key lookup format. Positively matched development recordings may be
rekeyed with dependent canonical references in a bounded maintenance transaction
without changing IDs, storage, pricing or ledger state. Do not rewrite unknown
redacted terminal identities or re-enable their reuse. Keep retained fingerprint
secrets for current scoped-key rotation.

A forward migration drops only obsolete assets/jobs/bindings tables after a
transactional guard confirms all are empty. Refuse nonempty inventory: unknown
tasks or remote objects must never disappear without reconciliation. This
retirement does not automatically delete private remote objects. PostgreSQL byte
storage remains a shared-speech test adapter with its existing physical blob
table/namespace; move its schema ownership to speech without dropping bytes.
Remove old account/content purge participants only after their obsolete tables
are safely retired. Current shared associations, closed holds and no-late-debit
invariants remain enforced.

This supersedes only the retired executable protocol and one-time cutover
requirements. ADR-0031/0032 current shared retention/billing policy remains active.
Historical migrations and completed evidence remain history. Reintroducing old
protocol data or binaries after retirement requires a deliberate restoration plan.

## Alternatives considered

### Keep a second protocol indefinitely

Maintains unconsumed frontend/client paths and an independent queue/cleanup engine
during development, contrary to the authorized simplification.

### Drop every pronunciation table and reset storage

Would destroy current shared recordings and credit state. Retirement is limited
to the empty old inventory and leaves current shared assets/accounting intact.

## Consequences

### Positive

- One current speech protocol and worker handle pronunciation.
- No obsolete API/client/migration execution remains.
- Shared storage, security and financial protections keep their current owners.

### Negative

- Old owner-scoped clients and migration commands are no longer supported.
- A database with nonempty old inventory requires explicit reconciliation before
  the guarded retirement migration can proceed.

### Risks / limitations

- Local absence does not establish absence in another database; the SQL guard
  must run on every target.
- Current retained provider/key/storage mappings protect live recovery and are
  not classified as obsolete merely because their identifiers are historical.

## Related

- [ADR-0020](0020-dictionary-pronunciation-audio.md)
- [ADR-0031](0031-shared-pronunciation-and-retained-recordings.md)
- [ADR-0032](0032-model-price-revisions-and-speech-settlement.md)
- [Feature045](../../.agent/features/045-development-cleanup-and-architecture-diagrams/FEATURE.md)
