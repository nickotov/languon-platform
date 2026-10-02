---
feature: flashcard-training-backend
title: Flashcard training backend
status: current
last_verified: 2026-10-02
surfaces:
    - api
source_paths:
    - apps/backend/src/modules/learning
    - apps/backend/src/modules/dictionaries/domain/learning-content.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle
    - apps/backend/src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store.ts
    - packages/contracts/src/learning
    - apps/backend/src/config/environment.ts
    - apps/backend/src/app.ts
related_features:
    - dictionary-platform
    - profile-account-controls
e2e_command: flashcard-training-backend
e2e_tests:
    - apps/backend/tests/integration/modules/learning/learning-composed-routes.test.ts
e2e_scenarios:
    - owner-rates-replays-and-undo
    - shared-learners-save-independent-progress
    - shared-access-revocation-and-anonymous-no-writes
---

# Flashcard training backend

## What this verifies

Owners and signed-in shared readers save independent flashcard preferences and
ratings; anonymous visitors receive card content but cannot write personal state.
Preparation selects active eligible entries across the whole dictionary or a
manual subset, returning IDs rather than unbounded content. Separate bounded
requests project front/back fields, including language-role-aware examples and
word fallback. Acknowledged ratings survive a new API session. Idempotent replay
and latest-rating Undo retain content-free audit history without double counting.

This delivery is backend-only. The Train menu, setup dialog, fullscreen cards,
drag/flip interactions and browser session statistics are not implemented yet.
The [design handoff](../../.agent/features/033-flashcard-training-backend/DESIGN.md)
awaits a user-supplied Magic Patterns design. BL-002 and BL-003 are not complete.
The mapped composed HTTP journey was executed against disposable PostgreSQL and
Redis on 2026-10-02. Exact commands and remaining broader delivery checks are
recorded in the feature evidence; this API guide does not claim frontend proof.

## Start the development environment

Use the root README's reviewed local commands: `pnpm dev:infra`,
`pnpm db:migrate`, and `pnpm dev:backend`. Node24, workspace dependencies,
PostgreSQL and Redis must be available. Set `LEARNING_FLASHCARDS_ENABLED=true`
only in an ignored local environment file for manual verification; the shipped
default is false. Restart the backend after changing configuration. No model,
AI credit policy, provider credential or dictionary worker is required for card
practice. Card edits and account purge still use their normal existing flows.

Use synthetic verified local owner and reader accounts. Create an active
Spanish→English dictionary with two entries: casa/house with both enabled
examples, and caminar/walk with missing examples. Record its dictionary ID,
entry IDs and a live unlisted share link using the existing dictionary API guide.
Use the link's fragment key in the dedicated `X-Languon-Share-Key` header only;
never put it in a query parameter, body, logs or saved request collection.
Use verified bearer credentials for personal operations; do not paste real
tokens into documentation. Inspect `/health` and the actual OpenAPI operations
in `/openapi.json` before proceeding. No destructive local reset is necessary.

## API verification

Owner prefix `P`: `/learning/dictionaries/{dictionaryId}`; use owner bearer auth.
Shared prefix `P`: `/learning/shared-dictionaries/{shareId}`; use the live share
key header and optional bearer auth. Personal shared operations require bearer
auth. Responses are `private, no-store` and `no-referrer`.

1. Read `GET /learning/capabilities`. Expect `{flashcardsEnabled:true}` locally.
   With the flag false, capabilities reports false and learning operations return
   `503 service_unavailable`; disabling does not delete saved state.
2. `GET P/entries?limit=25` returns active `{entryId,source,translation}` previews
   and nullable `nextCursor`. Search and cursor affect this selector only, not
   All preparation. Follow pages before choosing a manual subset.
3. `GET P/flashcards/preferences` as signed-in learner returns configuration,
   shuffle and version. Unsaved defaults: Front `targetExample`, Back
   `sourceExample`, shuffle true, version0. `PUT` with configuration, shuffle
   and `expectedVersion` persists only that learner's settings. Reusing an old
   preference version yields `409 version_conflict`.
4. `POST P/flashcards/prepare` with
   `{"configuration":{"front":["targetExample"],"back":["sourceExample"]},"scope":{"type":"all"}}`
   returns ordered `entryIds`, `eligibleCount`, `skippedCount`, `fallbackCount`.
   Both sample entries are eligible; caminar falls back to walk/front and
   caminar/back. Fallback count counts entries, not displayed fields. Manual
   scope is `{"type":"manual","entryIds":[...]}` with unique IDs, up to10,000.
   Only active entries from this dictionary are returned. Valid but unavailable
   manual IDs (including foreign, deleted or archived IDs) count as skipped,
   without revealing their content; malformed IDs cannot expand access.
5. `POST P/flashcards/items` with configuration and at most25 unique entry IDs
   returns `{items,unavailableEntryIds}`. Each item contains entryId,
   learningVersion and projected front/back arrays. Fields have `field`,
   `requestedFields`, plain `text`, `language`, `direction`, `fallback`.
   Selecting Translation and missing Target-language example renders one word
   field with both requestedFields and fallback true. Disabled optional values
   never appear. An empty projected side makes the entry unavailable.
6. As a signed-in learner, `POST P/flashcards/attempts` with fresh UUID
   operationId/sessionId, entryId, the item's expectedLearningVersion, round1,
   rating `known` or `again`, and configuration. Expect an attemptId and the
   acknowledged entry/version/rating. Replay the exact payload: same attemptId,
   one result. Changed payload with reused operationId gives idempotency conflict.
   Operation IDs are learner-wide, not dictionary-local. A response lost after
   commit is safely retried using the same ID; no client-selected learner ID exists.
7. `GET P/flashcards/progress` returns `{total,known,again,unstudied}` over all
   active entries at their current learning versions, not just the manual subset.
   Sign in as another shared reader: their progress and preferences are separate.
   Changing front/back does not create a second saved-result dimension.
8. `POST P/flashcards/attempts/{attemptId}/undo` with a new operationId reverses
   only the latest eligible rating and retains the voided attempt. It restores a
   prior unvoided same-version rating (even another session's), or rating null
   meaning Unstudied. Exact Undo replay is idempotent. A newer competing rating,
   changed content or nonlatest session rating returns a conflict rather than
   overwriting current state. Refresh totals separately; attempt/Undo responses
   do not contain totals, resumable queue or frontend counters.
9. As anonymous shared visitor, entries/prepare/items work with a valid live key.
   Preferences/progress/attempts/Undo require sign-in and create no anonymous
   learning rows. A supplied invalid bearer must not degrade to anonymous access.
10. Change source or enabled example content through the normal authoring API:
    learningVersion increases and old Known counts as Unstudied. Changing content
    back does not revive old progress. Stale attempt writes conflict. Change
    defaults: only effective-learning changes invalidate, not protected overrides.
    Archive removes an entry from totals; restoring unchanged content can restore
    same-version progress. Rotate/revoke sharing: every old-key request, replay
    and Undo is denied even for a signed-in reader.

## E2E coverage

The mapped file is `apps/backend/tests/integration/modules/learning/learning-composed-routes.test.ts`.
It composes real authentication, dictionaries and learning HTTP routes with
disposable PostgreSQL and Redis. All three scenarios passed on 2026-10-02. Do not
treat mocked route/service unit tests as end-to-end proof. Stable scenarios:

- `owner-rates-replays-and-undo`: real owner content projection, personal settings,
  persisted rating, exact replay and Undo through HTTP and PostgreSQL.
- `shared-learners-save-independent-progress`: signed-in shared learners cannot
  see or overwrite one another's progress/preferences.
- `shared-access-revocation-and-anonymous-no-writes`: anonymous content access
  cannot write personal rows; live revocation fences content/replayed writes.

Exhaustive projection/contract limits, SQL constraints, racing preferences,
concurrent ratings, selective learning revisions, archive/restore, permanent
deletion, foreign-dictionary learner purge and 10,000-entry/query-plan checks
belong to lower-layer tests. Browser training coverage is deliberately deferred,
not waived, until frontend implementation after design handoff.

## Expected failure and edge cases

- Missing/bad live share key, private/archived dictionary or inactive owner:
  non-enumerating unavailable errors; no retained share authority.
- Personal endpoint without auth: authentication required. Invalid supplied
  bearer never silently becomes an anonymous request.
- Nonempty unique front/back arrays required; malformed/duplicate IDs,
    > 25-item content batches, >10,000 manual IDs and oversized bodies rejected.
    > Valid foreign/deleted/archived manual IDs are unavailable and counted skipped;
    > items returns their IDs as unavailable without disclosing foreign content.
- Missing example uses corresponding word; missing transcription/definition is
  omitted; both projected sides must remain nonempty. Effective language roles
  decide source/target example, not raw storage column names.
- `409 version_conflict`: reload preferences without discarding the user's draft.
  Explicit overwrite must use a refreshed version.
- `409 learning_version_conflict`: fetch fresh projected content before rating.
- `409 idempotency_conflict`: do not alter the pending request body/operation key.
- `409 undo_conflict`: newer state wins; do not silently roll it back.
- `429 rate_limited` carries bounded retry information/Retry-After. Learning
  uses separate admission scopes; ratings do not consume the shared-reader30/min
  dictionary read bucket. Infrastructure failures return unavailable, not success.
- Reopening practice needs a new local queue/session ID; only ratings/preferences
  are persisted. Fork creates new entry identities with no inherited progress.
- Permanent entry/dictionary deletion cascades all linked learners' history;
  account purge explicitly removes that learner's rows on others' dictionaries.

## Automated regression checks

Run focused contracts, projection, HTTP/service unit and guarded disposable
PostgreSQL learning tests using repository package scripts. Relevant examples:

```sh
pnpm --filter @languon/contracts test
pnpm --filter @languon/backend test tests/unit/modules/learning
pnpm --filter @languon/backend typecheck
pnpm db:check
pnpm docs:user-flows:check
pnpm user-flow:e2e -- inspect flashcard-training-backend
```

Database tests require `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
`AUTH_TEST_DATABASE_URL` naming a dedicated loopback `languon_auth_*_test`
database on a nondefault port, and matching `AUTH_TEST_DATABASE_CONFIRM`.
The reviewed harness validates these guards before resetting schemas. Never set
these variables to a normal development, shared, staging or production database.
Missing guards mean skipped tests, not database verification. Exact executed
commands and infrastructure identity belong to feature033/EVIDENCE.md.

## Troubleshooting

False capabilities: verify ignored local flag and restart backend; do not enable
production merely to run tests. Missing operations: confirm rebuilt contracts
and backend composition/migration revision. Authentication problems: use verified
active local users and current bearer credentials. Shared unavailable: check live
visibility, lifecycle, owner status and fragment-to-header handling. Retry limits:
wait for Retry-After rather than changing keys or identities to bypass admission.
Stale progress: inspect learning version and lifecycle, not authored card version.
Report correlation IDs only; do not log tokens/share keys, prompts or card text.

## Cleanup

Stop only processes started for this local verification. Remove synthetic data
through existing app lifecycle actions if desired; disabling the local flag leaves
history intact. Disposable database resets destroy schemas and are owned only by
the validated test harness. Do not manually reset the ordinary development or
any shared database. Revert temporary local flag configuration after checking.
