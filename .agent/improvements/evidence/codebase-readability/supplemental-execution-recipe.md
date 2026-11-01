# BL-019 supplemental final-execution recipe (planning only)

Status: planned; no runtime command in this document has been executed.

This is a temporary runner design for the eight supplemental backend files and
seven browser selections in `final-verification-plan.json`. Start it only after
the root's serial static/test/build/check session has exited and the final source
freeze has been rechecked. If any selected source, selected test, Playwright
configuration, test fixture, or runner changes after that comparison, re-plan
the affected selection before reuse.

## Target groups and existing entry points

| Group                                                  | Existing entry point/config                                                                            | Required owned targets                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplemental backend                                   | `pnpm --filter @languon/backend exec vitest run … --no-file-parallelism --hookTimeout=30000 --retry=0` | One confirmed loopback PostgreSQL + Redis pair using `tests/integration/support/test-database.ts` and `test-redis.ts` contracts.                                                                                            |
| Standard web: Profile, Dictionary, Flashcard, Sentence | `apps/web/playwright.config.ts`                                                                        | One confirmed loopback PostgreSQL + Redis pair plus the config-owned backend, worker and Next processes.                                                                                                                    |
| Admin provider pricing                                 | `apps/admin/playwright.config.ts`                                                                      | One confirmed loopback PostgreSQL + Redis pair plus config-owned backend, admin and web processes.                                                                                                                          |
| Text share/selection                                   | `node scripts/run-texts-web-e2e.mjs -- --grep <selection>`                                             | Exact exclusive `languon_auth_texts_ui_web_test` PostgreSQL target at 55443 and Redis DB 1 at 56443; the wrapper selects `tests/e2e/support/texts-playwright.config.ts`.                                                    |
| Knowledge state/layout                                 | `node scripts/run-contextual-assistant-e2e.mjs -- --grep <selection>`                                  | Exact exclusive `languon_auth_assistant_web_test` PostgreSQL target at 55444 and Redis DB 1 at 56444; wrapper preserves `apps/web/next-env.d.ts` and selects `tests/e2e/support/contextual-assistant-playwright.config.ts`. |

The standard web config accepts an ordinary dedicated loopback database whose
name contains `test` or `e2e`; the admin config additionally requires a
non-default PostgreSQL port and a name matching `admin.*e2e.*test` or
`e2e.*admin.*test`. The backend support utility requires a loopback, non-5432
database named `languon_auth_*_test`, with exact confirmation. All Redis targets
must be loopback, non-6379 and explicitly confirm database 1–15.

## Required common environment

For every appropriate target group, the temporary driver supplies only its
owned, loopback values:

```text
APP_ENV=test
ALLOW_DISPOSABLE_DATABASE_TESTS=true
ALLOW_DISPOSABLE_REDIS_TESTS=true
AUTH_TEST_DATABASE_URL=postgresql://<owned-user>:<owned-password>@127.0.0.1:<owned-pg-port>/<owned-db>
AUTH_TEST_DATABASE_CONFIRM=<owned-db>
AUTH_TEST_REDIS_URL=redis://127.0.0.1:<owned-redis-port>/1
AUTH_TEST_REDIS_CONFIRM=127.0.0.1:<owned-redis-port>/1
AUTH_E2E_DATABASE_URL=<same-owned-pg-url>
AUTH_E2E_REDIS_URL=<same-owned-redis-url>
ADMIN_E2E_DATABASE_URL=<same-owned-pg-url>
ADMIN_E2E_REDIS_URL=<same-owned-redis-url>
AUTH_E2E_REUSE_SERVERS=false
ADMIN_E2E_REUSE_SERVERS=false
TEXTS_WEB_REUSE_SERVERS=false
DICTIONARY_GENERATION_PROVIDER_MODE=deterministic
DICTIONARY_AI_PROVIDER_FIXTURE_MODE=deterministic
```

Set `AUTH_E2E_SENTENCE_SERVICES=true` only for the selected sentence command.
Do not set it for unrelated web commands. The standard web config obtains its
synthetic provider values itself; no paid/live provider credential is needed.

## Driver safety algorithm

1. Generate one opaque run ID. Build container names from it; do not reuse
   fixed names. Before creating anything, probe every planned host port and
   inspect each proposed container name. Abort if either is occupied; do not
   stop a pre-existing process/container.
2. Start PostgreSQL 17 and Redis 7 using `docker run --detach --rm`, loopback
   port publishing only, a task-specific label such as
   `languon.bl019-run=<run-id>`, and captured container IDs. Wait with bounded
   `pg_isready`/`redis-cli ping` retries. Use a fresh pair for each target group
   rather than allowing schema resets from backend files to race browser suites.
3. Invoke one group at a time, forwarding the exact environment above. Use
   `--retries=0 --reporter=list` for direct Playwright selection. Do not run
   database-file tests in parallel: many reset/migrate their owned schema.
4. In `finally`, remove only captured IDs. For a name that was requested but
   whose ID was not captured, inspect it and remove it only when its exact
   `languon.bl019-run` label equals this run ID. Record the ID/name/port mapping
   and command result, not an environment dump.

This is the same ownership principle used by
`scripts/run-critical-flows.mjs` (`assertFreePorts`, task labels, captured IDs,
and label-verified cleanup). It is deliberately a temporary external runner;
do not add a permanent project script for one final verification pass.

## Browser selections

Run in separate target groups where an existing wrapper has stricter ports:

```sh
# Standard web config (runner supplies owned AUTH_E2E_* values).
pnpm --filter @languon/web exec playwright test tests/e2e/profile.journeys.spec.ts \
  --grep 'saves a unique handle, keeps Security real and email mock honest, then schedules removal' \
  --retries=0 --reporter=list

pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts \
  --grep 'previews a Quizlet import and exports formula-safe ordered CSV|automatically saves full inline forms while history remains preview-only and advanced rewrite remains available' \
  --retries=0 --reporter=list

pnpm --filter @languon/web exec playwright test tests/e2e/flashcard-training.journeys.spec.ts \
  --grep 'owner configures a session, rates a card, undoes it, and preserves preferences' \
  --retries=0 --reporter=list

AUTH_E2E_SENTENCE_SERVICES=true \
pnpm --filter @languon/web exec playwright test tests/e2e/sentence-practice.journeys.spec.ts \
  --grep 'previews saved hints and archives or restores an example without a review|reconnects to background preparation and practises the saved batch without regeneration' \
  --retries=0 --reporter=list

# Admin config (runner supplies owned ADMIN_E2E_* values).
pnpm --filter @languon/admin exec playwright test tests/e2e/admin-user-management.journeys.spec.ts \
  --grep 'owner publishes routing tariffs and queued jobs retain their selected revisions' \
  --retries=0 --reporter=list

# Strict existing wrappers; they select their own config and fixture process.
node scripts/run-texts-web-e2e.mjs -- \
  --grep 'anonymous reader views and authenticated visitor copies before owner revokes|phone reader selects and collects without horizontal overflow' \
  --retries=0 --reporter=list

node scripts/run-contextual-assistant-e2e.mjs -- \
  --grep 'an empty workspace recovers edits, names itself from the first tutor question, and saves one note|the workspace switches between mobile document and tutor tabs and uses a tablet overlay' \
  --retries=0 --reporter=list
```

The contextual wrapper intentionally also runs its maintained backend
contextual-assistant integration preflight and restores the generated Next type
declaration; do not bypass it by invoking its support config directly.

## Dictionary document MinIO prerequisite

Confirmed: the browser document selection needs only the `minio` and
`minio-init` services from `infra/test/document-services.compose.yaml`. The
guide explicitly says scanner/parser/OCR are deterministic local adapters for
this journey; ClamAV conformance is separate integration evidence. Do not start
`clamav`, its signature updater, or parser sandbox for this selection.

Use a unique `DOCUMENT_TEST_COMPOSE_PROJECT` and a runner-supplied test-only
root access key/secret. Start only MinIO, then run the one-shot initializer to
completion (starting `minio-init` detached is not sufficient evidence that the
private bucket and API/worker policies exist):

```sh
docker compose -f infra/test/document-services.compose.yaml up -d minio
docker compose -f infra/test/document-services.compose.yaml run --rm --no-deps minio-init
```

Set `AUTH_E2E_DOCUMENT_SERVICES=true`; retain the config defaults or pass a
loopback `AUTH_E2E_DOCUMENT_S3_ENDPOINT`, and ensure API/worker key variables
match the initializer values. Then run only this missing dictionary scenario:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts \
  --grep 'document generation cleans the upload before one final editable review' \
  --retries=0 --reporter=list
```

Cleanup uses the same project and the exact compose file:

```sh
docker compose -f infra/test/document-services.compose.yaml down --volumes
```

The driver must execute that cleanup in `finally`, including after an initializer
or Playwright failure. It must not call broad Docker prune commands.

## Supplemental backend batch

With the backend group environment, run these exact files serially:

```sh
pnpm --filter @languon/backend exec vitest run \
  tests/integration/modules/conversations/conversation-lifecycle-capacity.test.ts \
  tests/integration/modules/texts/infrastructure/text-content-store.test.ts \
  tests/integration/modules/learning/sentence-library-safety.integration.test.ts \
  tests/integration/modules/learning/sentence-library-preparation.integration.test.ts \
  tests/integration/modules/authentication/infrastructure/redis-authentication-controls.test.ts \
  tests/integration/database/administration-store.test.ts \
  tests/integration/modules/text-ai/text-ai-provider-circuit.test.ts \
  tests/integration/modules/speech/shared-speech-sources.test.ts \
  --no-file-parallelism --hookTimeout=30000 --retry=0
```

The batch contains all eight gaps identified in the verification plan and no
critical-registry duplicate. If an individual file fails due to fixture or
environment setup, diagnose that condition first and rerun that file alone;
do not widen or weaken the suite.

## Evidence to capture after execution

For every group, record final source/test/config hashes or a final patch identity,
the exact command/grep, target class (never credentials), run ID, test count,
skip/retry count, browser/config when applicable, MinIO initializer completion,
cleanup result, and any retained Playwright artifact path. Passing interaction
tests establish their asserted rendered states only; no general visual-fidelity
claim follows from this recipe.
