---
feature: texts
title: Texts backend
status: current
last_verified: 2026-10-15
surfaces:
    - api
    - system
source_paths:
    - .agent/features/043-texts/**
    - apps/backend/src/modules/texts/**
    - apps/backend/src/modules/dictionaries/application/text-selection-*.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/*text-selection*.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema.ts
    - apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/src/modules/users/infrastructure/persistence/drizzle/**
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/drizzle/**
    - apps/backend/tests/integration/modules/texts/**
    - packages/contracts/src/texts/**
    - packages/prompts/src/local/texts.ts
    - scripts/run-texts-e2e.mjs
e2e_command: texts-backend
e2e_tests:
    - apps/backend/tests/integration/modules/texts/texts.journeys.test.ts
e2e_scenarios:
    - owner-translates-edits-and-collects
    - shared-reading-copy-and-revocation
related_features:
    - dictionary-platform
    - user-ai-model-preferences-backend
    - ai-credit-wallet
    - profile-account-controls
---

# Texts backend

## What this verifies

The backend-first checkpoint supports private folders and texts, explicit whole-text
translation proposals and saved manual pair edits, contextual vocabulary publication,
unlisted shared reading and independent copies. The web UI is deferred until the
user returns a Magic Patterns design. No browser completion is claimed here.

## Start the development environment

Use a dedicated disposable PostgreSQL database on loopback port other than 5432,
with a name matching `languon_auth_texts_test` or `languon_auth_texts_*_test`.
Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, `AUTH_TEST_DATABASE_URL` and
`AUTH_TEST_DATABASE_CONFIRM` to that exact database name. Use a dedicated loopback
Redis port other than 6379, database 1–15, with `ALLOW_DISPOSABLE_REDIS_TESTS=true`,
`AUTH_TEST_REDIS_URL` and matching `AUTH_TEST_REDIS_CONFIRM=host:port/database`.
The guarded runner refuses missing or unsafe targets before invoking tests.

```sh
pnpm test:e2e:texts-backend
pnpm user-flow:e2e -- check texts
pnpm docs:user-flows:check
```

The journey fixture uses real authentication, API routes, PostgreSQL/Redis and
production admission/credit infrastructure with deterministic model providers. It
resets only its confirmed disposable database and uses synthetic accounts. Do not
run another resetting suite against that target concurrently. No paid model calls
or shared/staging/production data are used.

## API verification

### Owner journey

1. Sign in as an active learner and create a named folder, optionally with a short
   description. List folders and open its text list.
2. Provide a nonblank source up to 20,000 Unicode code points, optional title, and
   distinct supported source/target languages. Explicit Save creates a draft.
3. Optionally submit language detection and poll its job. The result is advisory;
   the client must explicitly accept a suggestion and submit the chosen pair.
4. Submit translation with an operation ID and poll its durable job. The worker
   translates the complete submitted content, producing ordered source/translation
   arrays linked by stable pair IDs. Completion alone does not change the draft.
5. Save the returned proposal against the current text version. Paragraph whitespace
   and the complete source remain intact. Editing either side of a linked pair and
   saving marks its provenance edited-after-translation. A stale version conflicts.
6. Select a word/phrase within one sentence on either side. Its language direction
   determines eligible dictionaries. The request identifies exact UTF-16 offsets;
   the server derives the phrase and surrounding context from authorized content.
7. Add to an existing dictionary or supply a new dictionary name. Poll the durable
   collection job. On success, the generated full card and destination identities
   are returned. New dictionary/card/revision creation is atomic. Exact operation
   replay returns the same result; changed input under the same key conflicts.

### Shared reading and copying

1. Create a link for a saved translated text or a folder. Keep the secret in the
   client URL fragment and forward it only in `x-languon-share-key`; never put it in
   request paths or queries. Public responses are no-store/no-referrer/no-index.
2. Anonymous readers see translated active content. A shared folder is live and
   includes later saved translations and edits, but excludes untranslated drafts.
3. After signing in, copy one text into an owned active folder or copy the entire
   shared folder privately. Copies have independent IDs and editing/lifecycle.
   Collecting vocabulary requires an authenticated active learner and uses their
   own dictionary and AI credits.
4. Rotate/revoke the share or archive the source and retry the old capability.
   It becomes unavailable without revealing owner identity or existence details.
   Archiving a folder also hides its children. Restoring does not reactivate old
   sharing links. Previously completed copies and cards remain independent.

## Expected failure and edge cases

- Missing/inactive authentication rejects private mutations and AI work.
- Invalid languages, oversized input, unsupported selection and malformed mappings
  reject before publication. The 20,000-character input cap is distinct from the
  selected model’s complete-input/output limit; choose a suitable model or shorter
  text when preflight rejects the request. No implicit model switch/truncation.
- Insufficient credits, unavailable compatible workers/configuration, provider
  failure and rate limits return bounded safe codes. Existing saved text remains.
- Retry ambiguous HTTP admission with the same operation ID. Card creation must
  not be inferred from a timed-out request; poll the existing job.
- Known rate-limited provider work may retry within pinned attempt bounds; an
  unknown dispatched selection attempt is terminalized without blind publication.
- Cancellation and stale leases fence late completion. Source/destination edits,
  sharing revocation, archive or account deletion prevent pending publication.
- Duplicate vocabulary requires explicit confirmation. Folder copies are bounded
  at 500 visible translations; copy individual texts when that limit is exceeded.
- Temporary proposals expire after 24 hours. Save needed content before expiry;
  expired raw input/results are scrubbed while safe operation receipts remain.

## System verification

### Deployment boundary

New AI admissions default off via `TEXTS_AI_ENABLED`. Activate only after the
existing expand/activate process proves API and rollback-floor worker compatibility
for `text-detection:v1`, `text-translation:v1`, and `text-selection-card:v1`.
Publish a compatible immutable AI configuration revision with those formats and
confirm fresh namespaced execution/capacity observations. Existing jobs retain their
pinned model/pricing; workers continue draining even when admission is disabled.
Apply reviewed worker/account-purge roles after migrations. This guide authorizes
no production activation. Backend startup does not automatically deploy changes.

## Automated regression checks

Run the registered `texts-backend` journey command with the disposable target
variables above. Use the contracts and backend unit suites for validation/provider
bounds, and the `tests/integration/modules/texts/` suites with separate disposable
databases for persistence, migration, account purge, roles and concurrency.

## E2E coverage

| Scenario                              | Test file                                                             | Outcome                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `owner-translates-edits-and-collects` | `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts` | Authenticated draft, translation proposal, explicit save/edit and atomic contextual collection. |
| `shared-reading-copy-and-revocation`  | `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts` | Anonymous shared read, private copy and live capability revocation.                             |

Repository, contract, provider and worker tests add exact source reconstruction,
version/concurrency, credit settlement, cleanup, role and purge coverage. The later
frontend stage adds rendered desktop/mobile scenarios and fidelity evidence.

## Troubleshooting

If the runner rejects the environment, correct the disposable database name,
loopback port and exact confirmation values; do not bypass its safeguards.
For unavailable AI admission, verify compatible configuration and fresh worker
observations with the new formats. A stale-version conflict requires reloading the
saved text or dictionary before retrying; retain the user’s unsaved content.

## Cleanup

The tests close clients and remove their own Redis namespaces. Stop/remove only
the disposable containers created for this verification; never remove development
volumes or another worker’s active test database.
