---
feature: dictionary-platform
title: Dictionary Platform
status: current
last_verified: 2026-08-26
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/dictionary-platform/**
    - apps/backend/drizzle/**
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/src/modules/dictionaries/**
    - apps/backend/tests/integration/modules/dictionaries/**
    - apps/web/src/app/dictionaries/**
    - apps/web/src/app/shared/dictionaries/**
    - apps/web/src/fsd/entities/dictionary/**
    - apps/web/src/fsd/features/dictionary-*/**
    - apps/web/src/fsd/pages/dictionaries/**
    - apps/web/src/fsd/pages/shared-dictionary/**
    - apps/web/src/fsd/widgets/dictionary-editor/**
    - apps/web/tests/e2e/dictionary-platform.journeys.spec.ts
    - packages/contracts/src/dictionaries/**
    - packages/languages/**
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/dictionary-platform.journeys.spec.ts
e2e_scenarios:
    - owner-creates-edits-and-restores-dictionary
    - anonymous-reader-forks-unlisted-dictionary
    - card-ai-proposal-survives-review-and-conflict
    - batch-generation-review-commits-selected-cards
    - document-generation-cleans-original-and-commits-final-review
    - quizlet-import-and-export-round-trip
related_features:
    - user-authentication
    - web-i18n-support
    - web-ui-kit
---

# Dictionary Platform

## What this verifies

This current guide covers the complete Dictionary Platform feature: an
authenticated owner creates and manages a private dictionary, configures
inherited card fields, authors and reorders
cards, archives and restores content, and deliberately creates an unlisted
capability link. An anonymous reader can use that complete link without seeing
owner data, then sign in and make an independent private fork. An owner can also
run persistent single-card AI regeneration, review an editable proposal, and
recover explicitly when the source card becomes stale. Pasted terms can enter a
persistent batch proposal, where valid rows are reviewed and selected while
failures and duplicate warnings remain visible before one atomic commit.
An owner can also upload an explicit term-list document through private
versioned storage, follow durable scan/extraction/enrichment progress, and edit
one final generated-card review after the original bytes have been deleted. A
Quizlet-compatible pair list can also be previewed, imported atomically, and
exported again with formula-safe CSV cells and preserved Unicode/quoted data.

## Start the development environment

Use Node.js 24, the repository pnpm version, and loopback-only disposable local
PostgreSQL and Redis. Follow the safe setup in the
[authentication guide](./user-authentication.md), then run from the repository
root:

```sh
pnpm dev:infra
pnpm db:migrate
```

Keep the backend and web app running in separate terminals:

```sh
pnpm dev:backend
```

```sh
pnpm dev:web
```

AI generation additionally requires the local dictionary worker with the
deterministic provider and both `single-card:v1` and `pasted-terms:v1` enabled for
API enqueue and worker processing. Optional AI pair enrichment additionally uses
`import-pairs:v1`. The mapped Playwright configuration supplies
those local-only settings and starts the third process automatically; it never
calls a live model.

The document scenario additionally uses the guarded disposable services in
`infra/test/document-services.compose.yaml`. Start its versioned private MinIO
bucket with separate test-only API/worker identities, then run the mapped E2E
with `AUTH_E2E_DOCUMENT_SERVICES=true`. Local E2E uses deterministic scanner,
parser, and OCR adapters and never calls a live OCR/model provider. The real
MinIO and ClamAV adapter conformance suites are separate integration evidence;
production document enqueue remains disabled until the storage and sandbox
activation gates in the operations guide pass.

```sh
DOCUMENT_TEST_COMPOSE_PROJECT=languon-document-e2e \
DOCUMENT_TEST_MINIO_ACCESS_KEY=languon-document-root-test \
DOCUMENT_TEST_MINIO_SECRET_KEY=languon-document-root-test-secret-2026 \
docker compose -f infra/test/document-services.compose.yaml up -d minio minio-init
```

After the mapped journey, remove only that disposable project and its test data:

```sh
DOCUMENT_TEST_COMPOSE_PROJECT=languon-document-e2e \
DOCUMENT_TEST_MINIO_ACCESS_KEY=languon-document-root-test \
DOCUMENT_TEST_MINIO_SECRET_KEY=languon-document-root-test-secret-2026 \
docker compose -f infra/test/document-services.compose.yaml down --volumes
```

Expect the web app at `http://localhost:3333`, backend health at
`http://localhost:4000/health`, and OpenAPI at
`http://localhost:4000/openapi.json`. Use only unique `@example.test` accounts
and the development verification code `0000`. Never run this guide against a
shared, staging, or production database.

## Browser verification

### Owner authoring and lifecycle recovery

1. Sign up with a fresh fake account and use `/dictionaries` as the return path.
   Verify the email with `0000`. Expect **My dictionaries**.
2. Select **New dictionary**, name it `Studio Spanish`, choose English to
   Spanish, add a description, and create it. Expect a private dictionary editor.
3. Enable **Definition**, **Context example**, and **Example translation**, then
   save. Select **Add card** and expect a focused desktop dialog or mobile bottom
   sheet. Add source, translation, definition, example, and translated example,
   then save. Expect the overlay to close and the card to inherit those settings
   and display each value with the correct language metadata.
4. Open the card's labelled actions menu to edit it, archive it, select archived
   cards, and restore it. Return to
   active cards and expect its values to be unchanged.
5. Return to the library, search for the dictionary, archive it, select archived
   dictionaries, and restore it. Restored dictionaries are private and editable.

The source/target pair becomes locked after the first card, including when every
card is archived. Disabled optional fields preserve dormant values. Version
conflicts stay visible and require an explicit reload; the client does not
silently overwrite or replay a stale edit.

### Unlisted reading and independent fork

1. As the owner, open a populated private dictionary and select
   **Create sharing link**. Copy the newly shown link before leaving; the secret
   is after `#` and is shown only for this rotation.
2. Sign out and open the complete link. Expect the dictionary and cards, no owner
   identity, an **Unlisted · no index** status, and **Sign in to fork**.
3. Confirm the fragment secret is absent from document/API request URLs,
   referrers, browser storage, and server-rendered HTML. The public API request
   sends it only in `X-Languon-Share-Key` and uses `no-store` responses.
4. Select **Sign in to fork**, create and verify a second fake account, and expect
   to return to the same fragment link. Select **Fork privately**.
5. Expect a new private dictionary with new dictionary/card IDs and the copied
   active content. Editing or archiving the source does not mutate the fork.
6. Rotate, revoke, or archive the source and retry the old link. Each case uses
   the same non-enumerating **Dictionary unavailable** presentation.

### Persistent single-card proposal and stale recovery

1. As an owner, open an active card's labelled actions menu and select
   **Regenerate with AI**. Optionally
   provide a custom instruction of at most 1,000 characters and start generation.
   Expect known queued, generating, and validating stages with a cancel action;
   the source card remains unchanged.
2. Reload or leave and return to the review URL. Expect the same persisted job
   and reviewable proposal from the server, with no prompt or proposal payload in
   browser storage.
   If new generation is rolled back while retained jobs remain readable, the
   card action becomes **Open AI review**: the same proposal can still be opened
   and reviewed, while start and regenerate controls remain disabled.
3. Review the original beside the editable proposal. Field changes, reasons,
   up to three alternatives per field, and warnings remain associated with plain
   text fields. Mixed-language values expose their own `lang` metadata.
4. Edit the proposal, then change the source card from another page before
   accepting. Expect a persistent **Card changed since generation** state. Select
   **Reload and compare** to see the current card without replaying the stale
   proposal or losing the local candidate edit.
5. Regenerate from the current versions, edit the new proposal, and select
   **Accept reviewed card**. Expect one atomic saved card, server-controlled
   **Human + AI** authorship for the edited candidate, and a redacted accepted
   job outcome. Discard and cancel likewise leave the card unchanged.

At 320 px and 200% text, original, current-conflict, and proposal cards stack in
document order without horizontal page overflow. Buttons and fields remain
keyboard reachable, warnings are not color-only, and live status text announces
completion or cancellation without rereading the multilingual card.

### Pasted-term batch review and atomic commit

1. In an editable dictionary, select **Generate cards from pasted terms**. Expect
   a focused desktop dialog or mobile bottom sheet. Paste one term or phrase per
   line, up to 100 rows, and optionally add shared context. Blank lines are
   ignored; the server owns trimming, row order, and validation.
2. Start generation. Expect a persisted URL and bounded queued, generating,
   validating, and review-ready progress. Reload during or after processing and
   expect the same server-owned job without raw pasted formatting or proposal
   data in browser storage.
3. In **Review generated cards**, inspect row-level candidates, failures, and
   duplicate warnings. Exclude or remove a candidate and edit another. Select
   retryable failures and choose **Retry selected failures**; this enqueues a new
   successor from only those rows, preserves the original shared context, and
   leaves the prior review history immutable.
4. Select at least one candidate and choose **Add _n_ cards**. Expect the selected
   cards to be created together in source-row order. Untouched candidates display
   **AI generated** authorship; edited candidates display **Human + AI**. Excluded,
   removed, and failed rows create no cards.
5. For conflict recovery, enqueue against an empty dictionary, change its language
   pair before accepting, and retry the commit. Expect a visible dictionary-change
   conflict and zero cards. Reload current data or start a new batch; the client
   never silently replays the stale selection.

At 320 px and 200% text, the input and review sheet reflow without horizontal
page overflow. Candidate selection, editing, retry, discard, and commit remain
keyboard reachable; warnings and failures have textual labels; multilingual
fields preserve their own `lang` and writing direction.

### Document generation and one final review

1. In an editable dictionary, select **Generate cards from a document**. Choose
   a non-empty TXT, Markdown, DOCX, PDF, PNG, JPEG, or WebP file no larger than
   20 MiB. Image upload is disabled when OCR is unavailable. Optionally enter a
   bounded generation instruction.
2. Select **Upload and generate cards**. The browser computes the exact SHA-256,
   receives one short-lived create-only capability, uploads with only the signed
   headers, and completes that exact immutable version. Only the durable job ID
   enters the URL; the signed URL, object key, filename, checksum, bytes, and
   instruction do not enter browser storage/history/log output.
3. Expect durable awaiting-upload, queued, scanning, extracting, optional OCR,
   generating, validating, cleaning, and review-ready progress. Reload during
   processing and expect the same owned dictionary-bound job. A non-clean scan,
   invalid/active file, limit breach, or unavailable required OCR never reaches
   the final review and requires a safe retry or new upload as indicated.
4. Expect exactly one **Review generated cards** step. The original object has
   already been tombstoned and every data version deleted before this review is
   public. Edit, exclude, or remove generated cards; extraction failures remain
   visible with bounded codes/locations and no raw over-limit content. Select
   retryable enrichment failures and choose **Retry selected failures** to open
   a server-owned pasted-term successor containing only those rows. The prior
   document review stays immutable; predecessor lineage is retained, while the
   raw document instruction remains redacted and is not replayed.
5. Select **Add _n_ cards**. Expect one atomic commit in extracted order,
   server-derived AI versus Human + AI authorship, duplicate warnings, and the
   same dictionary/settings/pair conflict recovery as pasted-term generation.

At 320 px and 200% text, the input/progress/review sheet reflows without page
overflow. File, instruction, selection, editing, cancellation, discard, close,
and commit controls remain keyboard reachable, and multilingual fields preserve
their own language and writing direction.

### Quizlet-compatible import and export

1. From **My dictionaries**, select **Import cards**. Name the new dictionary,
   choose its source and target languages, then paste tab- or comma-delimited
   source/translation pairs or choose a bounded UTF-8 TXT, CSV, or TSV file.
2. Explicitly choose the separator, whether the first row is a header, and the
   source/translation columns. Select **Preview import**. Expect a bounded sample,
   total/ready/error counts, duplicate warnings, and remaining-capacity guidance.
   Edit the original text or mapping and preview again; a stale preview cannot be
   committed.
3. Without AI, select **Import _n_ cards**. Every valid row is reparsed on the
   server and committed atomically as Human-authored cards in input order. With
   AI available and optional fields enabled, choose at most 100 previewed pairs,
   optionally add an instruction, and enter the persistent one-final-card-review
   flow; the trusted source and translation cannot be silently replaced.
4. In the dictionary editor, select **Export**. Copy Quizlet-compatible text or
   download Quizlet CSV or full Languon CSV. Expect only active cards in current
   order. Quizlet output discloses that advanced fields are omitted; CSV preserves
   Unicode, quotes, and line breaks while formula-like cells are neutralized.

At 320 px and 200% text, the import and export sheets reflow without horizontal
page overflow. File/paste input, mapping, preview, AI selection, import, copy, and
download controls remain keyboard reachable. Previewed source and translation
carry their own `lang` and writing direction.

## API verification

Use a short-lived local access token obtained through the authentication guide;
do not paste it into shell history or documentation. Owner endpoints require
`Authorization: Bearer <token>`. Create and fork also require a unique
`Idempotency-Key` of 16–128 characters.

1. `GET /languages` returns catalog version `1` and canonical BCP 47 choices.
2. `POST /dictionaries` creates a private dictionary. Repeat the identical
   request with the same idempotency key and expect the same resource; reuse that
   key with different input and expect a conflict.
3. Use `PATCH /dictionaries/{dictionaryId}` and the card create/update/lifecycle/
   reorder routes with the returned dictionary, settings, and card versions.
   Stale expected versions return `version_conflict` without a partial write.
4. `POST /dictionaries/{dictionaryId}/share-key/rotate` returns a capability once.
   `GET /shared/dictionaries/{shareId}` succeeds only with that key in
   `X-Languon-Share-Key`; private, archived, rotated, revoked, wrong-owner, and
   invalid capability reads do not disclose which condition occurred.
5. `POST /shared/dictionaries/{shareId}/fork` requires both bearer identity and
   the capability header. The response is a private independent copy.
6. `GET /dictionary-generation-capabilities` independently reports whether
   single-card and pasted-term enqueue are active without revealing provider
   configuration. This does not gate discovery of retained readable jobs.
   `POST /dictionaries/{dictionaryId}/cards/{cardId}/generations` uses expected
   dictionary/settings/card versions plus a unique idempotency key.
7. `GET /dictionaries/{dictionaryId}/cards/{cardId}/generations/latest` restores
   the newest retained job. Read, cancel, discard, accept, and regenerate use
   `/dictionary-generation-jobs/{jobId}` and its named action endpoints.
   Acceptance sends only the edited candidate, never authorship, and returns a
   durable result identity rather than replaying retained proposal content.
8. `POST /dictionaries/{dictionaryId}/batch-generations` accepts bounded raw text,
   optional context, expected dictionary/settings versions, and a unique
   idempotency key. The server persists validated indexed rows and the trusted
   language/settings snapshot. Batch acceptance sends selected row indexes and
   candidates, never authorship, and creates all selected cards or none.
9. `POST /dictionaries/{dictionaryId}/document-uploads` authorizes one exact
   upload and awaiting job using dictionary/settings versions, media type, size,
   SHA-256, instruction, and an idempotency key. The response is `private,
no-store` and its signed capability must never be logged or persisted by the
   browser. `POST /dictionary-document-uploads/{uploadId}/complete` may supply
   the observed immutable version ID as a hint; the server re-lists and verifies
   size, checksum, media/magic, ownership, and sole-current-version identity
   before queueing. This reconciles a committed PUT whose browser response was
   lost without weakening create-only or exact-byte checks.
   `POST /dictionary-generation-jobs/{jobId}/retry-document-terms` creates a
   pasted-term successor from selected retryable persisted failures. Generic job
   read/cancel/discard and document acceptance reuse the durable job endpoints.
10. `POST /dictionary-imports/preview` authorizes the requested new/existing
    target and returns a bounded sample plus advisory capacity. `POST
/dictionary-imports` reparses the original bounded text and uses an owner-
    scoped idempotency key for either one deterministic atomic commit or a
    distinct `import-pairs:v1` job. `GET /dictionaries/{dictionaryId}/export`
    streams the selected fixed format with private no-store attachment headers.

Inspect response headers as well as bodies: public and owner dictionary reads
must be `private, no-store`; public responses reveal no owner identity or raw
capability. Use the OpenAPI document for the exact bounded request schemas.

## E2E coverage

- `owner-creates-edits-and-restores-dictionary` proves authenticated creation,
  inherited optional fields, card editing, card archive/restore, dictionary
  archive/restore, and owner-only recovery through the real web/API/database stack.
- `anonymous-reader-forks-unlisted-dictionary` proves explicit publication,
  anonymous capability reading, fragment-only secret transport through signup,
  and an authenticated independent private fork.
- `card-ai-proposal-survives-review-and-conflict` proves deterministic worker
  execution through the real API/database stack, reload-safe proposal review,
  editable mixed-language fields, stale acceptance rejection, reload/compare,
  regeneration from current versions, and atomic acceptance with server-owned
  authorship.
- `batch-generation-review-commits-selected-cards` proves server-owned line
  parsing, deterministic chunked generation, persisted review restoration,
  row-level failure/duplicate handling, candidate editing and selection, and one
  atomic commit with server-derived AI versus mixed authorship.
- `document-generation-cleans-original-and-commits-final-review` proves an exact
  private TXT upload, durable automatic scan/extraction/enrichment, reload after
  cleanup-gated publication, a server-owned failure successor and return to the
  immutable original review, one editable/selectable final review, responsive
  keyboard access, and atomic mixed-authorship commit through the real web/API/
  worker/PostgreSQL/MinIO stack.
- `quizlet-import-and-export-round-trip` proves target-aware preview, malformed
  row and duplicate guidance, atomic ordered Human import, formula-safe quoted
  Unicode CSV export, responsive keyboard access, and authenticated streaming
  through the real web/API/PostgreSQL stack.

Version-conflict matrices, typed persistence constraints, owner isolation,
idempotency reuse, no-current-card-JSON assertions, and malicious text rendering
remain at contract, repository integration, HTTP integration, and component
test layers where their failure conditions are deterministic.

## Expected failure and edge cases

- Empty names, equal language pairs, invalid catalog tags, oversized fields, and
  malformed headers return bounded validation errors without writes.
- A language pair cannot change after any card has existed, even if archived.
- Duplicate normalized source phrases are allowed with a warning because senses
  and contexts can legitimately differ.
- A stale mutation shows a persistent conflict recovery state. Network failures
  preserve loaded pages and offer retry instead of clearing the library.
- Generation capability, admission, and provider failures expose bounded safe
  messages. Disabling enqueue leaves **Open AI review** available for retained
  server-readable jobs and disables start/regenerate. A transient polling
  failure preserves an already loaded proposal;
  missing, cancelled, discarded, expired, and failed jobs never expose redacted
  original or proposal content.
- A generation accept conflicts if its dictionary, settings, or card snapshot is
  stale. Reload compares current content but never retries acceptance
  automatically. Identical accepted retries return the stored result identity;
  a changed candidate retry conflicts.
- Pasted input rejects more than 100 non-empty rows, rows over 200 Unicode code
  points, and control characters before enqueue. Partial provider failures keep
  valid rows reviewable. Duplicate normalized source terms warn but are not
  rejected. Batch acceptance conflicts on stale dictionary/settings versions or
  a changed trusted language pair and writes no partial cards; exact accepted
  retries return the stored batch outcome while a changed selection conflicts.
- Missing, malformed, rotated, revoked, private, or archived public links share
  one unavailable response and UI; none reveal owner data.
- At 10,000 cards, creation is rejected, while indexed cursor search and loaded-
  window keyboard/tap reorder remain available.
- Account storage is bounded at 100 retained dictionaries, 50,000 retained cards,
  and 250,000 immutable revisions. Archived content still counts; reaching a
  ceiling leaves existing content readable/exportable and rejects the new
  create, fork, or edit atomically with a capacity message.
- Import rejects binary/invalid UTF-8, NUL or disallowed controls, more than 1
  MiB, more than 10,000 logical rows, more than 100 columns, invalid mapping, and
  zero valid rows. Preview capacity is advisory; commit rechecks owner,
  dictionary, settings, pair, and capacity under lock. Changed idempotency-key
  reuse conflicts. Export is active-only, bounded, ordered, cancellation-aware,
  and never interpolates user content into attachment headers.

## Automated regression checks

Run the focused deterministic checks:

```sh
pnpm --filter @languon/languages test
pnpm --filter @languon/contracts test
pnpm --filter @languon/backend test
pnpm --filter @languon/web test
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check dictionary-platform
```

Run the mapped Playwright journey only with the disposable loopback PostgreSQL
and Redis variables required by `apps/web/playwright.config.ts`:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts
```

Database migration/repository evidence uses the guarded disposable database
harness described in the feature `EVIDENCE.md`; it refuses ambiguous or
non-test database names.

## Troubleshooting

- A redirect to login means the refresh cookie is absent or expired. Sign in and
  keep `/dictionaries` as the safe return path.
- A migration failure means the disposable database is stale or the committed
  Drizzle SQL/metadata history is inconsistent; do not edit generated migration
  output by hand.
- A generic unavailable share screen usually means the fragment was omitted or
  the link was rotated, revoked, or archived. Obtain a fresh link from the owner.
- Browser CORS failures usually mean `AUTH_ALLOWED_ORIGINS` does not exactly
  match `http://localhost:3333`.

## Cleanup

Archive test dictionaries through the library and sign out. Stop the app
processes normally. Stop only the task-owned disposable containers you started.
If a full local reset is necessary, confirm the exact database/container names
first; never delete volumes or data belonging to another task, shared stack,
staging, or production.
