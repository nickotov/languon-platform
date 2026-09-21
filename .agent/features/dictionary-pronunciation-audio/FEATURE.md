# Dictionary pronunciation audio

Status: Complete — locally verified; production activation remains gated
Owner: Product owner; implementation agent
Created: 2026-09-21

## Problem

Learners cannot hear dictionary card text. Device speech varies by platform;
repeated cloud synthesis adds unnecessary cost and latency.

## Desired behavior

An owner presses Play beside saved source, translation, example, or example
translation. Missing audio is generated asynchronously, stored, and played;
repeat requests reuse it. The server resolves language from dictionary/card
settings, never the interface locale. Standard default voices are sufficient;
no special Ukrainian accent or accent selector is required.

Development stores audio bytes in PostgreSQL and uses deterministic fixtures by
default. Production stores bytes in private S3-compatible storage, targeting
Selectel. TTS uses replaceable backend adapters; Kie is the first live candidate,
subject to coverage, quality, latency, processing policy, and pricing validation.

## Scope

### In scope

- Owner web playback on saved active dictionary cards, including mobile-browser
  layouts: source, translation, enabled nonempty example/example translation.
- Play, stop, replay, normal/0.8× playback speed; accessible localized states.
- Dictionary-owned audio jobs/cache, Kie and fixture adapters, PostgreSQL bytea
  dev storage, private S3 production storage, limits, cleanup, account purge,
  release compatibility, guides and tests.
- Mobile-compatible API and audio format, with no platform-specific business
  assumptions in backend/contracts.

### Out of scope

- Native dictionary screens: mobile currently has only a static home screen.
  Native playback needs a later approved dictionary/auth journey.
- Anonymous shared-dictionary audio, unsaved drafts, definitions/transcription,
  recording/upload, cloning, custom pronunciation, accent UI, automatic native
  or provider fallback, offline downloads, import pre-generation, admin provider
  UI, cross-card/owner deduplication, automatic regeneration on provider switch.
- Paid calls and production provisioning require separate explicit authorization.
  The user approved feature implementation after reviewing and committing the plan;
  normal local feature commits and final squash-merge follow repository policy.

## Acceptance criteria

- AC-1 — Owners play all four in-scope fields. Example language follows effective
  source/target role and its translation uses the opposite role. Empty/disabled
  optional fields and archived cards have no playable action.
- AC-2 — Only one clip plays. Loading, playing, stopped, failed, unavailable and
  autoplay-blocked states are accessible/localized. Stop/navigation/logout/new
  selection prevents late responses from playing old content. Normal and 0.8×
  playback preserve pitch where supported. Retry playback does not regenerate
  valid cached audio.
- AC-3 — Concurrent/repeat requests for the same saved field/content/profile
  reuse one asset/job. Changed text/language invalidates the binding. Existing
  valid audio survives provider-default changes. Audio does not change card
  revisions, versions, or authorship. Evicted audio can regenerate on request.
- AC-4 — Dev bytea storage requires no S3 service. Production rejects bytea and
  fixture modes and requires private S3. Both adapters pass the same bounded
  byte-integrity/deletion contract; a dedicated Selectel bucket proves production
  compatibility independently of local emulation.
- AC-5 — Kie submit/status/download and failures stay behind a provider contract
  supporting immediate or asynchronous results. Approved model/voice/language
  combinations are explicit; unsupported languages are unavailable, never read
  in a wrong language. Client contracts contain no provider credentials/URLs.
- AC-6 — Jobs survive restart with leases/fencing, persisted upstream task IDs,
  bounded retries and deadlines. Known tasks resume with their original provider
  configuration. Ambiguous submission without upstream idempotency is held for
  reconciliation, not automatically resubmitted or switched to another provider.
- AC-7 — Generate/status/bytes independently enforce current active owner access,
  current field content and effective visibility. Other owners, guessed IDs,
  archived cards/dictionaries and deletion-pending accounts cannot retrieve audio.
  No public provider/S3 URLs. Already-delivered bytes cannot be retracted.
- AC-8 — Admission atomically reserves configured per-owner/global spend and
  concurrency budgets. Text/audio/time limits apply. Metrics exclude content,
  credentials and result URLs. Provider outage blocks synthesis but not cached
  authorized playback or cleanup.
- AC-9 — Cleanup removes abandoned/superseded objects and terminal raw input.
  Account removal immediately denies access. Purge drains/fences audio writers,
  deletes all physical versions/dev bytes, and verifies removal before deleting
  inventory. Restore replay cannot reactivate removed accounts or audio.
- AC-10 — Dev/CI uses genuine decodable audio fixtures through API/worker/database
  and browser playback without paid TTS. Fixture sound is labeled as development
  audio, never claimed to pronounce arbitrary text correctly.
- AC-11 — Additive schema and versioned protocol/job changes follow expand/activate
  deployment with an audio-aware rollback floor including purge workers. Separate
  generation/playback gates permit safe disablement. Existing authoring, sharing,
  generation, export and account deletion retain their contracts.
- AC-12 — Guides/mapped E2E, database and browser proof, provider/storage contracts,
  independent completion and security review are recorded. Live voice quality,
  latency/cost and Selectel checks are explicit activation gates, not fixture claims.

## Constraints and risks

Follow ADR-0011 dictionary ownership, ADR-0012 durable workers, ADR-0019 deletion,
ADR-0009 release compatibility and ADR-0016 real-browser evidence. Proposed
ADR-0020 defines audio-specific boundaries without changing document quarantine
or recovery-journal storage policy. Exact model selection remains configuration.

Kie tasks are asynchronous and result URLs expire; copy successful output promptly.
Short-clip latency/pricing need measurement. Selectel storage location does not
imply TTS processing in Russia. Validate caching/delivery rights, provider
retention/processing location before activation. Isolated homographs and mixed
language text require listening evaluation; no universal accuracy claim.

## User-flow documentation

Implemented `docs/user-flows/dictionary-pronunciation-audio.md`
for browser/API/system journeys and `web-playwright` mapping. Update existing
dictionary-platform and profile-account-controls guides where behavior/mappings
change. Release-deployment-platform documents rollout changes. Guide revisions
and mapped scenarios are synchronized; evidence is recorded in EVIDENCE.md.

## Approved scope and activation decisions

1. Owner web playback is v1; native screens and shared-reader playback
   are explicitly deferred rather than implied complete.
2. Kie is the first live adapter, subject to activation checks; production
   credentials, chosen model/voice map and spend ceilings are supplied later.
3. Retention/limits and ADR-0020 are approved for implementation. Approval does not
   authorize paid experiments or production provisioning.

## References

- [Plan](./EXEC_PLAN.md), [evidence](./EVIDENCE.md), [review](./REVIEW.md).
- [Kie TTS](https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5).
- [Kie tasks](https://docs.kie.ai/market/common/get-task-detail).
- [Selectel S3](https://docs.selectel.ru/en/cloud/object-storage/).
