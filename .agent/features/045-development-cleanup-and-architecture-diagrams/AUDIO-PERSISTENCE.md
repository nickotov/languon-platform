# Retired dictionary audio persistence

Date: 2026-10-19. Owner: audio persistence worker. Feature 045 AC-2/AC-6.

## Scope and decision

Retire the owner-scoped dictionary audio engine's persistence, old measurement
adapter, account-purge audio object variant, provider/storage setup in the purge
worker, dictionary deletion audio fencing and old-only tests. Preserve current
shared speech source/account association deletion, settlement, globally retained
recording text/bytes, document cleanup and account tombstoning. This is authorized
preproduction retirement under ADR-0040 (owned by the main cleanup worker).

Current `PostgresAudioObjectStorage` still reads/writes `dictionary_audio_blobs`.
Move only its TypeScript schema ownership to speech (`speechAudioBlobsTable` in
`modules/speech/infrastructure/blob-schema.ts`). Preserve physical table name,
keys and namespace so current recording references remain readable. Standard
MinIO/S3 and current shared speech tables are unchanged by this persistence slice.
Remove obsolete inventory grants from dictionary/account-purge SQL role scripts;
retain dictionary worker blob rights for the supported PostgreSQL test adapter.

## Local inventory inspection

Read `.env.local` into the process without printing credentials. Explicitly
validated `APP_ENV=development`, host `localhost`, port `5432`, database `languon`.
Read-only aggregate inspection found assets=0, jobs=0, bindings=0, blobs=0.
Job state and storage backend/namespace grouped counts returned no rows. No remote
objects/provider task inventory exists in those tables, and no local data was
mutated by this worker. Network permission required sandbox escalation; granted.

Migration `0074_retire_dictionary_audio.sql` was generated with
`pnpm --filter @languon/backend db:generate --name retire_dictionary_audio`;
Drizzle generated the snapshot/journal. Reviewed migration safety SQL adds an
ACCESS EXCLUSIVE lock and DO preflight before generated DROP statements, refusing
any nonempty assets/bindings/jobs inventory until its references/tasks have been
explicitly reconciled. This prevents concurrent admission during the check/drop
transaction. The forward migration never drops blobs or shared speech tables.
No destructive migration was applied to the user database by this worker.

## Verification strategy and evidence

A dedicated owned PostgreSQL 17 Alpine container
`languon-feature045-audio-persistence`, loopback port `56458`, database
`languon_auth_audio_retirement_test`, hosts disposable tests. Never reuse the
user's database for schema reset tests. Migration tests prove refusal/rollback for
each old inventory table, then successful empty retry with current blob bytes and
shared recording data preserved. Full application schema migration validates
forward migration, existing enum/migration integrity and exact current inventory.
The old exact-table assertion was stale for 18 existing conversation/text/Knowledge
tables; it now explicitly lists all 78 current tables.

Full account purge test proves successful recording text and real PostgreSQL audio
bytes remain playable after account tombstoning. Existing dedicated purge-role,
document ownership/fork and dictionary deletion/concurrency checks remain active.
Retired old-audio generation/storage/inventory tests were removed only with the
retired implementations. Current shared speech store checks initially passed
(36 tests), but the main worker subsequently changed its HMAC fixtures; main owns
final proof for that revised test file.

Final owned check: **58 passed across four files**, 27.29 seconds, started
14:34:21 local test-runner time. Exact invocation (disposable credential omitted):

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
AUTH_TEST_DATABASE_URL=<owned-loopback-56458-disposable-url> \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_audio_retirement_test \
pnpm --filter @languon/backend exec vitest run \
  tests/integration/database/migrations.test.ts \
  tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts \
  tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts \
  tests/unit/modules/users/application/account-purge-service.test.ts
```

Backend `typecheck`, scoped ESLint for all 12 touched source/test files,
`pnpm --filter @languon/backend db:check`, and `git diff --check` passed.
Owned disposable container was removed after testing. Source reference search
finds no remaining old assets/jobs/bindings/store/measurement/purge-audio callers;
only migration safety fixtures intentionally reference retired tables.

Tested patch base: `007b9eb` plus current feature working tree. SHA-256 evidence:

- `0074_retire_dictionary_audio.sql`: `5b3d701bffa5a4ade55152fa97c7453ac4734bb1383784142f6554ff44607627`.
- `migrations.test.ts`: `8395a81f3f319bf3e19e1e5455d9c83d4ea5a835322fdec4afb0d11333b8446c`.
- `drizzle-account-purge-store.test.ts`: `f6d7d760ca4182329cc9c93526f813e2b4cdb4bb973f35dff8a6ed7a0734305d`.
- `drizzle-dictionary-repository.test.ts`: `cc851790829dab39019ba62dd583d8d8e36afb1f2664fa60a17a8d0e1c924ec9`.

## Restoration and limits

Restore removed source and generated metadata from the feature diff if abandoned
before migration. After migration, applying historical schema and restoring a
backup is required to resurrect the retired engine; there is no supported runtime
rollback into that engine. Empty-inventory guard protects outstanding remote
object/task references. No paid providers, shared object stores, or user database
mutation were used. Retained physical blob name is a current storage compatibility
requirement, not evidence that old generation remains supported.

## Additional real SQL role verification

The requested role test lives at
`infra/deploy/tests/shared-speech-roles.integration.test.mjs`. Its explicit guard
requires loopback port `55432` and database `languon_auth_speech_test`; these were
preserved. Created owned PostgreSQL 17 Alpine container
`languon-feature045-audio-roles` on that exact target, migrated it through the
existing disposable integration helper, and executed both reviewed role scripts.
No ordinary development database or another worker's database was reused.

- `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=<owned-loopback-55432-url> AUTH_TEST_DATABASE_CONFIRM=languon_auth_speech_test pnpm --filter @languon/backend exec vitest run tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts -t 'purges preferences under the dedicated role'` — **1 passed, 3 deliberately unselected**, 1.72 seconds.
- `SPEECH_DEPLOY_ROLE_TEST_DATABASE_URL=<same-owned-url> node --test infra/deploy/tests/shared-speech-roles.integration.test.mjs` — **1 passed, 0 skipped**, 289 milliseconds.

The real role test executes worker and purge grants against the fully migrated
schema, verifies current worker/model-pricing privilege queries, rejects erasure
of successful recording text/identity and administrative deletion by the worker,
allows already approved cleanup, rejects worker access to quote text and immutable
payer/rate/deadline columns, and proves purge can detach associations/release holds
while lacking retained-text/recording-deletion authority. SQL fixtures and role
creation are enclosed in a transaction and rolled back by the test. Removed the
owned container after passing. These checks supplement, rather than replace, the
58-test persistence result above.
