---
feature: dictionary-pronunciation-audio
title: Dictionary pronunciation audio
status: current
surfaces:
    - browser
    - api
    - system
source_paths:
    - apps/web/src/fsd/features/speech-playback/**
    - apps/backend/src/modules/speech/**
    - apps/backend/src/modules/speech/infrastructure/audio/**
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/audio-schema.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-store.ts
    - apps/backend/src/modules/dictionaries/interface/http/dictionary-audio.routes.ts
    - apps/web/src/fsd/features/dictionary-audio
    - packages/contracts/src/dictionaries/audio.ts
related_features:
    - shared-pronunciation-playback
    - dictionary-platform
    - profile-account-controls
    - release-deployment-platform
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/dictionary-pronunciation-audio.journeys.spec.ts
e2e_scenarios:
    - owner-plays-four-card-fields
    - repeat-play-reuses-audio-and-edits-refresh
    - audio-failure-retry-and-selection-cancellation
    - archived-or-removed-owner-cannot-play-audio
last_verified: 2026-10-14
---

# Dictionary pronunciation audio

## What this verifies

Listen to a saved card's source or translation. Examples and their translations
remain readable text and never display playback controls.
First use prepares audio; subsequent plays reuse it. Owners and authenticated
shared readers can play accessible saved fields on desktop and mobile browsers.
Native screens are deferred. Standard configured voices have no accent selector.
The shared pipeline also supports flashcards and sentences; pricing, global reuse
and retention are described in [Shared pronunciation playback](shared-pronunciation-playback.md).
The four migrated scenarios passed initially on 2026-10-13 and again on
2026-10-14 after final source-authorization guards and retention copy changes,
through the shared API and private playback handles in desktop/narrow Chromium. The separate
shared guide records cross-user reuse and paid confirmation/settlement evidence.

## Prerequisites

- Start local PostgreSQL/Redis/MinIO, the backend, web and dictionary worker using the
  root README command index. Use synthetic local accounts only.
- Set `SPEECH_PLAYBACK_ENABLED=true` and `SPEECH_GENERATION_ENABLED=true`
  consistently on backend and worker. Keep `DICTIONARY_AUDIO_PROVIDER=fixture`
  and `DICTIONARY_AUDIO_STORAGE=s3` with the private local MinIO configuration
  from `.env.example`. These flags do not enable paid Kie calls.
- Fixture sound is a short decodable tone; the UI labels it as a development
  sound. It verifies playback plumbing, not pronunciation of arbitrary text.
- Real Kie mode requires explicit credentials, model/voice/language mapping,
  permitted download hosts and budgets. Never put secrets in a guide or browser.

## Start the development environment

Use the reviewed root commands `pnpm dev:infra`, `pnpm dev` and
`pnpm dev:dictionary-worker`. Apply migrations using the README database command
before starting the worker. Keep the local audio flags above in ignored environment
configuration. Production generation stays off until capability/rollback metadata,
provider evaluation and dedicated Selectel verification meet the feature gates.

## Browser verification

1. Sign in as a verified owner and create a Spanish → English dictionary.
2. Add source “casa”, translation “house”, example “La casa es grande.” and
   example translation “The house is large.” Save the card. Open its sharing link
   as an authenticated reader: only source and translation have Play controls,
   while both examples remain visible as text.
3. Verify that exactly source and translation have speaker icons; neither example
   has one. The icon-only control exposes **Play [field]** through its tooltip and
   accessible label. Preparing audio shows a spinner while the durable job is pending.
   When ready, audio plays; if the browser blocks delayed autoplay, press Play
   again using the same field control. Ready/error and development fixture notices
   appear in the tooltip and accessible live status, without inline button text.
4. Press Stop to cancel listening or select another field. Only one clip plays.
   Playback uses normal speed; the design does not expose a speed selector.
5. Play the same field again: it uses cached audio. Edit the source to “hogar”,
   save, and play: the new text gets a new asset. Changing live providers does not
   discard ready pronunciation for unchanged content. Fixture tones cannot be
   reused as real pronunciation when switching to Kie.
6. Archive the card: its Play actions disappear and old private byte requests
   are denied. Examples never have a Play action, regardless of whether they are populated.

## API verification

The server resolves each field's language from current dictionary/card settings.
Audio does not change authorship or create card revisions. Cached playback works
when new generation is disabled; unsupported configured languages show unavailable.
The shared `/api/speech` API resolves saved field references; learner handles
expose no S3/provider URL or originating account. Accounts, card visibility and
current content are rechecked on status and byte access. Already delivered bytes cannot be retracted from a client.

## Expected failure and edge cases

- No Play actions: check playback capability, authenticated source access,
  saved content and configured language/voice support. Native screens are deferred.
- Long uncached text requires an exact quote and confirmation; cancelling creates
  no reservation. Cached playback and joined generation are free.
- Preparing persists: check dictionary worker readiness and isolated audio queue;
  do not assume restarting requires another paid submission.
- Ready — press Play: the browser needs another user gesture. Retry playback.
- Download/playback failure: retry; an existing valid recording is reused.
- Timed out or unknown submission: the upstream task may still exist. Repeated
  Play must not duplicate a possibly paid submission. Operators reconcile its
  known task or unknown outcome before allowing a new generation attempt.
- Provider output is copied into private application storage. Kie result URLs
  are temporary and are never exposed as permanent playback URLs.
- Standard development uses private MinIO; byte-storage compatibility tests do
  not prove S3 behavior. Selectel and live Kie activation need separate evidence.

## Automated regression checks

Inspect mapping with `pnpm user-flow:e2e -- inspect dictionary-pronunciation-audio`.
The registered command is `web-playwright`; use the disposable loopback database
and Redis E2E environment documented in the existing dictionary guide. Fixture
mode is configured by Playwright on both backend and worker. Never run the journey
against shared/production data or a paid provider.

## E2E coverage

| Scenario                                         | Observable proof                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner-plays-four-card-fields`                   | Owner and authenticated shared reader have exactly source/translation icon actions and tooltips; examples remain text; private bytes play through the actual worker and narrow layout works |
| `repeat-play-reuses-audio-and-edits-refresh`     | Repeated playback reuses asset identity; changed saved source selects new audio                                                                                                             |
| `audio-failure-retry-and-selection-cancellation` | Failed byte delivery can retry cached audio; stopped delayed selection does not play unexpectedly                                                                                           |
| `archived-or-removed-owner-cannot-play-audio`    | Archived card loses controls and previously ready byte URL is denied; removed-owner purge is additionally tested at the database layer                                                      |

## System verification

Use disposable PostgreSQL integration tests for pending task resumption,
submission ambiguity, budget races, publication fencing, orphan cleanup and
account purge. Confirm storage adapter integrity and physical-version deletion
separately; no browser fixture can prove external Selectel behavior.

## Troubleshooting

Inspect content-free worker readiness/errors and audio capability state. If
fixture playback fails, verify the worker uses the same isolated database and
audio flags as the API. Do not log card text, credentials or temporary result URLs.

## Cleanup

Use fake text/accounts only. The disposable test harness owns its database/Redis
namespace; clean up only those explicitly named resources. Application retention
removes failed/temporary uploads only. Successful normalized text and recordings
remain indefinitely after content/account removal; bindings and associations are
removed. Audited admin removal is the successful-recording deletion mechanism.
Provider-side retention is separate from this application policy.
