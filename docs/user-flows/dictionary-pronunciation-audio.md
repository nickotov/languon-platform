---
feature: dictionary-pronunciation-audio
title: Dictionary pronunciation audio
status: current
surfaces:
    - browser
    - api
    - system
source_paths:
    - apps/backend/src/modules/dictionaries/application/dictionary-audio-service.ts
    - apps/backend/src/modules/dictionaries/application/dictionary-audio-worker.ts
    - apps/backend/src/modules/dictionaries/infrastructure/audio
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/audio-schema.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-store.ts
    - apps/backend/src/modules/dictionaries/interface/http/dictionary-audio.routes.ts
    - apps/web/src/fsd/features/dictionary-audio
    - packages/contracts/src/dictionaries/audio.ts
related_features:
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
last_verified: 2026-09-21
---

# Dictionary pronunciation audio

## What this verifies

Listen to a saved card's source, translation, example or example translation.
First use prepares audio; subsequent plays reuse it. This release supports the
owner web dictionary on desktop and mobile browsers, not native dictionary
screens or shared-reader playback. Standard configured voices have no accent UI.

## Prerequisites

- Start local PostgreSQL/Redis, the backend, web and dictionary worker using the
  root README command index. Use synthetic local accounts only.
- Set `DICTIONARY_AUDIO_PLAYBACK_ENABLED=true` and
  `DICTIONARY_AUDIO_GENERATION_ENABLED=true` consistently on backend and worker.
  Local `DICTIONARY_AUDIO_PROVIDER=fixture` and
  `DICTIONARY_AUDIO_STORAGE=postgres` require neither S3 nor paid services.
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
   example translation “The house is large.” Save the card.
3. Press Play beside a field. Preparing audio indicates the durable job is pending.
   When ready, audio plays; if the browser blocks delayed autoplay, press Play
   again. The development fixture label appears for fixture recordings.
4. Press Stop to cancel listening or select another field. Only one clip plays.
   Use Playback speed to select normal or 0.8× speed.
5. Play the same field again: it uses cached audio. Edit the source to “hogar”,
   save, and play: the new text gets a new asset. Changing providers does not
   discard a ready recording for unchanged content.
6. Archive the card: its Play actions disappear and old private byte requests
   are denied. Disabled or empty examples never have a Play action.

## API verification

The server resolves each field's language from current dictionary/card settings.
Audio does not change authorship or create card revisions. Cached playback works
when new generation is disabled; unsupported configured languages show unavailable.
Accounts, card visibility and current content are rechecked on status and byte
access. Already delivered bytes cannot be retracted from a client.

## Expected failure and edge cases

- No Play actions: check playback capability, active owner/card, saved content
  and backend configuration. Shared-reader and native screens are out of scope.
- Preparing persists: check dictionary worker readiness and isolated audio queue;
  do not assume restarting requires another paid submission.
- Ready — press Play: the browser needs another user gesture. Retry playback.
- Download/playback failure: retry; an existing valid recording is reused.
- Timed out or unknown submission: the upstream task may still exist. Repeated
  Play must not duplicate a possibly paid submission. Operators reconcile its
  known task or unknown outcome before allowing a new generation attempt.
- Provider output is copied into private application storage. Kie result URLs
  are temporary and are never exposed as permanent playback URLs.
- PostgreSQL development bytes do not prove S3 behavior. Production uses private
  S3, with Selectel and live provider activation checks recorded separately.

## Automated regression checks

Inspect mapping with `pnpm user-flow:e2e -- inspect dictionary-pronunciation-audio`.
The registered command is `web-playwright`; use the disposable loopback database
and Redis E2E environment documented in the existing dictionary guide. Fixture
mode is configured by Playwright on both backend and worker. Never run the journey
against shared/production data or a paid provider.

## E2E coverage

| Scenario                                         | Observable proof                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `owner-plays-four-card-fields`                   | Four saved fields return private decodable bytes through the actual worker and play in the browser; speed/narrow-layout control works  |
| `repeat-play-reuses-audio-and-edits-refresh`     | Repeated playback reuses asset identity; changed saved source selects new audio                                                        |
| `audio-failure-retry-and-selection-cancellation` | Failed byte delivery can retry cached audio; stopped delayed selection does not play unexpectedly                                      |
| `archived-or-removed-owner-cannot-play-audio`    | Archived card loses controls and previously ready byte URL is denied; removed-owner purge is additionally tested at the database layer |

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
cleans obsolete audio; account purge removes its inventoried physical objects and
development bytes before SQL finalization. Production provider retention is a
separate policy from removing local/Selectel audio.
