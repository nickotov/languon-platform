---
feature: shared-pronunciation-playback
title: Shared pronunciation playback and model prices
status: current
last_verified: 2026-10-19
surfaces:
    - browser
    - admin
    - api
    - system
source_paths:
    - apps/web/next.config.mjs
    - apps/web/src/fsd/shared/api/api-url.ts
    - apps/backend/src/modules/speech/**
    - apps/backend/src/modules/ai-credits/**
    - apps/web/src/fsd/features/speech-playback/**
    - apps/admin/src/pages/speech-recordings/**
    - apps/admin/src/pages/ai-settings/**
    - packages/contracts/src/speech/**
    - compose.yaml
    - infra/dev/**
    - infra/deploy/**
e2e_command: shared-pronunciation-playback
e2e_tests:
    - apps/web/tests/e2e/flashcard-training.journeys.spec.ts
    - apps/web/tests/e2e/sentence-practice.journeys.spec.ts
    - apps/web/tests/e2e/shared-pronunciation.journeys.spec.ts
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
e2e_scenarios:
    - visible-flashcard-playback
    - anonymous-playback-hidden
    - sentence-surfaces-playback
    - unsupported-language-controls
    - free-generation-and-shared-reuse
    - paid-generation-confirmation-cancellation
    - paid-generation-confirmed-success
    - admin-private-preview-and-impact-removal
    - admin-library-filters
    - admin-model-price-publication
related_features:
    - dictionary-pronunciation-audio
    - sentence-practice-backend
    - sentence-practice-web
    - flashcard-training-web
    - ai-credit-wallet
    - profile-account-controls
    - admin-user-management
    - release-deployment-platform
---

# Shared pronunciation playback and model prices

## What this verifies

Play authorized saved dictionary fields, the visible flashcard side, accessible
sentence prompts/previews, revealed references and completed checked answers.
Generation begins only on Play, with explicit confirmation for chargeable misses.
Identical conservatively normalized text/language shares private audio across
actors without revealing the originating source. Cached playback and joins are
free; successful text/audio remains indefinitely after content/account deletion.

The primary learner/admin journeys passed on 2026-10-13 against real local
services and disposable databases. The final eight-case web run passed again on
2026-10-14, covering the dictionary's four migrated scenarios and the four shared
reuse/finance/unsupported-language cases. Three additional existing flashcard/
sentence journeys passed their targeted audio assertions on 2026-10-14. The three
admin journeys passed on 2026-10-13. Desktop and 390-pixel layouts were exercised.
Native clients, unsaved drafts, hidden references, unchecked answers and live
provider pronunciation quality are outside these local journeys. Deterministic
fixture sound proves storage/playback, not correct spoken pronunciation.
Fixture and real pronunciation caches are isolated: switching to Kie never reuses
a test tone, including older retained recordings and in-flight fixture jobs.

## Start the development environment

Use the README's reviewed commands from the repository root: `pnpm dev:infra`,
`pnpm db:migrate`, `pnpm dev`, `pnpm dev:dictionary-worker`, and `pnpm dev:admin`.
Check the package scripts and active test safety settings before execution.
Use synthetic accounts and dictionaries only.

In ignored local settings, enable `SPEECH_PLAYBACK_ENABLED=true` and
`SPEECH_GENERATION_ENABLED=true` consistently for backend/worker. Retain
`DICTIONARY_AUDIO_PROVIDER=fixture`, S3 storage, the local MinIO endpoint and
bucket-scoped application credentials from `.env.example`. This requires no Kie
key or paid calls. MinIO initialization must exit successfully; console/API are
loopback-only and the bucket is private/versioned. See
[storage operations](../shared-pronunciation-operations.md).

The backend readiness endpoint must report ready, the asynchronous dictionary
worker must be running, and MinIO must be reachable through the host/container
endpoint appropriate to each process. Create verified synthetic learner accounts
and one existing owner administrator through the established auth/admin guides.
Set a finite test wallet and provisional fixture speech tariff for long-text
confirmation. Never point these checks at staging/production wallets or storage.

## Browser verification

1. Save an existing-language dictionary card with source `casa`, translation
   `house`, example `La casa es grande.`, and matching translated example.
2. Only source and translation have icon-only Play buttons; examples and example
   translations remain text. Focus or hover reveals an action tooltip. The control
   shows a spinner while work is pending,
   then plays one clip or exposes ready Play if the browser blocks delayed
   autoplay. Status and fixture-tone notices appear in the tooltip and are
   announced accessibly. A fixture tone proves transport, not pronunciation.
3. Inspect browser Network: requests and protected audio use same-origin
   `/api/speech/...`; internal backend `/speech/...` paths sit behind the proxy.
   A provider task failure retains its safe cause after failed-inventory cleanup.
   Temporary provider failure appears in the tooltip/live status; failed paid work
   releases its hold and joiners do not see the initiator's billing state.
   Play another field while one is playing; only the newly selected clip remains
   active. Navigate away during preparation; a late result must not autoplay.
4. Save equivalent text with surrounding/repeated horizontal spaces in another
   synthetic actor's dictionary. Play and verify cached reuse without another
   provider submission or credit debit. Case/accent/punctuation/language changes
   must remain different identities.
5. Save a source phrase exceeding 10 language-aware words or 100 Unicode code points.
   Play and confirm that the dialog gives a compact credit price and an expandable
   Exact values disclosure for the price and available balance. Decimal transport
   retains 0.001-credit precision; integer milli-credits decide affordability.
   Display rounding never changes admission, and a nonzero price below 0.01
   appears as <0.01 rather than zero. The dialog says payment occurs
   only after successful storage, with generation continuing after departure.
   Cancel once (no reservation), then confirm. Successful publication charges once;
   repeat playback is free. Insufficient balance starts no provider task.
6. Start flashcard training; only the currently visible side has playable text.
   Open sentence practice: play the prompt, verify hidden reference access remains
   unavailable, explicitly reveal the reference, then play it.
7. Complete an AI check and play the saved learner answer as written. Draft or
   unchecked answers cannot use saved-answer playback.
8. Choose a language lacking a configured and model-supported voice. No generation control
   appears, unless an approved reusable recording is already available.

## Admin verification

1. Sign in through the existing owner-admin boundary and open the audio library.
   Search normalized text and filter language/provider/model/status plus linked
   or unlinked recordings. Preview uses protected audio, not an S3 URL.
2. Select a bounded set of recordings, provide a deletion reason and review the
   current link impact. Cancelling changes nothing. Confirming makes playback
   unavailable immediately and queues removal of all storage versions.
3. Confirm that changed link/version state refreshes confirmation rather than
   silently deleting newly linked data. Existing learner bindings never grant a
   public cache browser or reveal another actor's origin.
4. Open model pricing and publish a bounded speech character rate or text
   input/output token rate with a reason. An immutable new revision appears;
   stale concurrent edits fail and historical job rates remain unchanged.

## API verification

Use authenticated clients against the real local backend and saved-source IDs.
The API resolves source text/language; never send arbitrary text for synthesis.
Check availability, prepare, paid confirmation, polling and byte delivery through
`/api/speech`. Verify source access on every status/byte request, including archived
content, revoked reader access, hidden reference answers and logout.

Concurrent equivalent cache misses must admit one provider task and one payer.
A ready/in-flight recording appearing after quote issuance must be reused/joined
without reserving another user's credits. Quoting alone holds nothing. Duplicate
confirmation and completion cannot duplicate financial settlement.

## System verification

Use disposable PostgreSQL/MinIO with the deterministic provider for persistence
and worker checks. Validate billing deadline/publication races, unknown submission
without blind retry, late results without charges, immutable historical profiles,
account-association removal and administrative all-version cleanup. Development
storage, backup journals and production retained recordings are distinct stores.

Release manifests add independent `sharedSpeech` and `modelPricing` compatibility
namespaces. A compatibility release provides readers/workers before an enabled
release admits version-one jobs; older rollback floors fail closed. Production
roles can update speech execution and read tariffs but cannot mutate tariffs or
erase shared recording inventory. Account purge cannot read retained text. Already admitted shared work may finish
under its pinned task identity after account removal; actor associations and holds
are removed, and no late debit is permitted. A late valid recording can remain
reusable without granting the deleted actor access.

## E2E coverage

- `visible-flashcard-playback`: real authenticated flashcard browser journey in
  `apps/web/tests/e2e/flashcard-training.journeys.spec.ts`, checking saved fields on
  both visible sides and protected fixture audio delivery.
- `anonymous-playback-hidden`: anonymous shared flashcard practice in the same
  file proves no Play control or audio request is available.
- `sentence-surfaces-playback`: real owner/reader sentence journey in
  `apps/web/tests/e2e/sentence-practice.journeys.spec.ts`, checking prompt, revealed
  reference, checked-answer history and library preview audio.
- `unsupported-language-controls`: learner journey in
  `apps/web/tests/e2e/shared-pronunciation.journeys.spec.ts`, proving an unconfigured
  Hebrew language omits playback controls.

The four additional surface scenarios passed on 2026-10-14 against the frozen
fixture environment: both flashcard faces, anonymous omission, sentence prompt/
revealed reference/checked-answer history/library preview, and unsupported Hebrew.
The primary learner/admin six passed on 2026-10-13; the final dictionary/shared
web eight-case rerun and three ancillary surface journeys passed on 2026-10-14.
The verification date records the final broader mapped capability.

- `admin-private-preview-and-impact-removal`: real admin/API journey proving
  authenticated private fixture preview, changed-impact reconfirmation and audited
  administrative deletion through the supported backend fixture harness.

- `paid-generation-confirmed-success`: real browser/backend journey proving exact
  confirmed payment after private audio publication, no remaining reservation,
  the expected wallet reduction and free replay without another charge.

- `free-generation-and-shared-reuse`: browser/backend journey in
  `apps/web/tests/e2e/shared-pronunciation.journeys.spec.ts`, proving queued fixture
  generation and equivalent reuse across two authenticated actors.
- `paid-generation-confirmation-cancellation`: browser/backend journey in the same
  file, proving the exact quote/disclaimer and cancellation without admission.

- `admin-library-filters`: real admin/browser journey in
  `apps/admin/tests/e2e/admin-user-management.journeys.spec.ts` proving audio
  inventory filtering and protected preview behavior.
- `admin-model-price-publication`: real admin/API journey in the same file
  proving publication and stale revision conflict handling.

The primary six scenarios executed successfully with deterministic fixture audio,
real authentication, backend, PostgreSQL and private object-storage boundaries.
The paid-success journey verifies exact ledger settlement after publication and
free replay; cancellation verifies no confirmation/admission. Admin preview and
delete verify authorization, stale impact, auditing and unavailability.

Sentence reference/checked-answer authority, concurrency, account-association
removal and deadlines also have real disposable PostgreSQL evidence. The four additional surface cases have their own actual browser proof, including
native playback and private bytes; their behavior is not inferred from the primary six cases. Unit playback tests
remain complementary evidence, not substituted E2E coverage.

## Expected failure and edge cases

- Unsupported or unconfigured language: hide generation; allow valid cached audio.
- Exhausted free daily allowance: fail clearly without silently charging short text.
- Stale/expired quote: refresh the exact price before confirmation.
- Provider failure or ten-minute billing deadline: release the hold permanently.
- Unknown submission: retain reconciliation state; no automatic new submission.
- Late successful output: may become reusable, but never debit or autoplay late.
- Deleted/revoked/changed source: old handles fail fresh authorization/revision checks.
- Administrative physical deletion failure: leave an unavailable retryable inventory
  state rather than restoring playback.

## Automated regression checks

Focused persistence tests live in
`apps/backend/tests/integration/modules/speech/shared-speech-store.test.ts` and
`shared-speech-sources.test.ts`; pricing persistence coverage is in
`apps/backend/tests/integration/database/model-price-participant.test.ts`.
Use the backend package's existing disposable integration harness with these files.

`node --test infra/dev/speech-services.test.mjs` checks rendered development
storage isolation/credential policy. `node --test infra/deploy/tests/shared-speech.test.mjs`
checks admission/read/billing rollback compatibility and derived environment flags.

After runtime scenarios and markers are synchronized, run
`pnpm docs:user-flows:check`,
`pnpm user-flow:e2e -- check shared-pronunciation-playback`, and the registered
shared-pronunciation-playback composite runner. Keep mapped markers and coverage descriptions synchronized whenever these
journeys change; passing traceability checks alone is not runtime evidence.

## Troubleshooting

Missing controls: inspect flags, current source access, language/voice mapping and
cached availability. Host MinIO uses localhost; containers use service name
`minio`. Wrong endpoint/credentials or failed initialization makes storage fail.

Persistent loading: check worker readiness and known task status before retrying;
restart/recovery is not permission for a duplicate paid submission. Ready Play
usually means another browser user gesture is needed. Stale quote/conflict means
content, profile, tariff or inventory version changed; reload confirmation.

## Cleanup

Stop local application processes and ordinary infrastructure without deleting
volumes. Keep the development speech volume for cache reuse. Disposable tests
remove only their own isolated containers, database and bucket. Administrative
recording deletion is intentional destructive product behavior and requires the
in-app reason/impact confirmation. Never use shared/staging/production storage for
test resets or delete retained successful audio as ordinary age-based cleanup.

Provider failure diagnostics: a failed request with `speech_provider_unavailable`
means the provider reported a terminal temporary/internal error, not missing S3
bytes. `speech_generation_failed` is another terminal generation failure. Failed
inventory cleanup preserves these safe outcomes. `speech_recording_unavailable`
continues to mean an otherwise usable recording was removed/unavailable. The UI
never displays vendor fail messages or task/result URLs; operators can inspect an
already known provider task without resubmitting it. No automatic fallback or paid
resubmission occurs. Successful live Kie pronunciation depends on provider health.
