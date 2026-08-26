# ExecPlan: Dictionary Platform

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-26

## Goal

Deliver a verified web-first dictionary platform for adult learners and tutors.
Users can author structured bilingual cards, publish unlisted read links, fork
sets, review persistent AI proposals, generate cards from pasted terms or safe
document/OCR input, and exchange Quizlet-compatible data. Stable dictionary and
card identities remain directly referenceable by future workbook, lesson,
course, and exercise modules.

Milestone 0 is complete on `feature/dictionary-platform`: durable architecture,
operations, threat, and visual contracts are accepted and reviewed. Product
persistence/runtime implementation starts in M1. Continue milestone by milestone
without treating generated artifacts or the first passing check as completion.

## Specification

- In scope: all behavior and infrastructure listed in [FEATURE.md](./FEATURE.md),
  including public web, backend, contracts, persistence, design, AI jobs, worker,
  uploads/scanning/OCR, Quizlet interchange, deployment, documentation, review,
  and verification.
- Out of scope: the exclusions in `FEATURE.md`, especially native/admin UI,
  collaboration, discoverable publication, study modes, actual workbook/course/
  lesson schemas, retained documents, and direct Quizlet integration.
- Strategic constraints: accepted
  [ADR-0001](../../../docs/adr/0001-user-authentication-and-session-strategy.md),
  [ADR-0002](../../../docs/adr/0002-drizzle-schema-and-migration-strategy.md),
  [ADR-0005](../../../docs/adr/0005-frontend-component-and-fsd-standards.md),
  [ADR-0016](../../../docs/adr/0016-runtime-ui-kit-authority.md),
  and [ADR-0009](../../../docs/adr/0009-release-and-deployment-platform.md).
- New durable decisions completed in M0:
  [ADR-0011](../../../docs/adr/0011-dictionary-persistence-and-composition.md)
  governs typed dictionary/card composition, and
  [ADR-0012](../../../docs/adr/0012-dictionary-worker-and-document-ingestion.md)
  governs the PostgreSQL worker/private-upload/scanner/parser/OCR model.

## Existing architecture

- No dictionary, vocabulary, workbook, lesson, course, exercise, generic asset,
  upload, queue, product object-storage, OCR, or worker module exists.
- `apps/backend` has Hono, verified access-token principal resolution, modular
  DDD boundaries, Drizzle module-owned schema aggregation, explicit migrations,
  Redis, and canonical Mastra composition. Product modules must use
  `interface/infrastructure -> application -> domain` dependency direction.
- `apps/web` is a Next.js public app using pages-first FSD, memory-only access
  tokens, TanStack Query/Zustand/React ownership rules, app-local shared UI,
  CSS Modules, four UI locales, and Storybook. Thin `src/app` routes compose
  `src/fsd/pages` slices.
- `@languon/contracts` is the authoritative Zod source for cross-application HTTP
  request/response types. The framework-neutral language catalog is a leaf
  package consumed independently by contracts, web, and backend. Persisted-job,
  revision/proposal, and model/OCR schemas stay private to the dictionary module;
  `@languon/prompts` is consumed only by backend AI infrastructure.
  `@languon/database` owns low-level database factories, not business schema.
- PostgreSQL is the durable source of truth. Redis is disposable and must not
  become the job queue or proposal store.
- Current Mastra primitives are a development harness only. Product agents must
  live in the owning dictionary infrastructure, register in canonical
  composition, receive server-derived principal context, and use deterministic
  playground/test fixtures.
- Deployment builds immutable backend/web/admin/migrator images and promotes
  blue/green application slots after singleton expand-compatible migrations.
  There is no worker service or product upload bucket/scanner today.
- S3-compatible storage exists only for encrypted database backups. Product
  uploads require separate bucket prefixes, credentials, lifecycle, and access
  policy.
- Runtime semantic tokens, shared UI contracts, stories, tests, and rendered
  behavior are implementation authority under ADR-0016. Design artifacts are
  optional composition input and do not create a separate approval gate. The
  completed M2.5 boards remain historical references.
- Current related guides and mappings are synchronized as of 2026-08-21:
  `web-ui-kit`, `mastra-agent-development-harness`, and
  `release-deployment-platform`.

## Planned architecture and ownership

```text
packages/contracts/src/dictionaries/        Zod HTTP/import/export wire contracts
packages/languages/                         canonical learning-language catalog
packages/prompts/                           dictionary AI prompt fallbacks

apps/backend/src/modules/dictionaries/
  domain/                                   dictionary/card/settings/revision rules
  application/                              use cases, UoW/repository and provider ports
  infrastructure/persistence/drizzle/       schema, repositories, queue leases
  infrastructure/ai/                        Mastra structured agents/adapters
  infrastructure/documents/                 storage, scanner, parser, OCR adapters
  infrastructure/import-export/             Quizlet/Languon CSV implementations
  interface/http/                           authenticated/public Hono/OpenAPI routes

apps/backend/src/infrastructure/worker/      timers, signals, concurrency, readiness
apps/backend/src/mastra/composition.ts       canonical product-agent registration

apps/web/src/fsd/entities/dictionary/        contracts, queries, display model
apps/web/src/fsd/features/dictionary-*/      authoring, sharing, AI, import/export
apps/web/src/fsd/widgets/dictionary-editor/  cohesive editor composition
apps/web/src/fsd/pages/dictionaries/         library/editor/public page slices
apps/web/src/app/                            thin route files only
```

`dictionaries` owns all current business persistence. Do not place its schema in
`@languon/database`, expose database rows, or introduce a cross-domain asset
table. Reusable low-level job/storage helpers are extracted only if another
implemented module demonstrates the same stable interface; dictionary job
payloads and lifecycle remain in the dictionary module.
The root worker invokes a dictionary application worker service for every lease
transition; it never mutates job rows directly. A dictionary document adapter
launches each native parser through a credentialless, OS-confined child process
inside that worker service and returns only validated bounded IPC output. This
does not add a parser service/image; unsupported hosts keep document capability
disabled.

### Initial persistence

- `dictionaries`: UUID ID, owner user FK, name, optional description, source and
  target language tags, visibility, non-secret share locator, share-key digest/
  rotation metadata, active/archived lifecycle, optional source-dictionary
  provenance, optimistic version incremented by every dictionary mutation,
  timestamps.
- `dictionary_settings`: one-to-one defaults for field enablement, definition/
  example language roles, example-translation dependency, transcription
  notation/custom label, dedicated optimistic `version`, timestamps. Every
  settings mutation locks and increments this version.
- `dictionary_cards`: UUID ID, dictionary FK, gap-based sort key, current typed
  values, typed nullable overrides for each optional field's enablement plus
  applicable definition/example role, transcription notation, and custom label,
  current authorship, active/archived lifecycle, version, timestamps.
- `dictionary_card_revisions`: immutable revision number, card FK,
  schema-versioned current-value/raw-override/effective-settings snapshot plus
  dictionary-settings version, authorship/mutation kind, accepted generation-job
  reference when applicable, actor user ID, timestamp.
- `dictionary_generation_jobs`: owner/dictionary/card references, discriminated
  kind, state, idempotency key, schema version, bounded input/proposal references,
  `expectedDictionaryVersion`, `expectedSettingsVersion`, optional
  `expectedCardVersion`, trusted source/target tags, non-reversible keyed request
  fingerprint, attempts, lease owner/deadline/monotonic fencing token,
  heartbeat/cancellation, sanitized failure, progress, expiry, timestamps. A
  unique owner/kind/idempotency-key constraint returns the existing job for the
  same fingerprint and conflicts for different input.
- `dictionary_generation_proposals`: schema-versioned candidate cards,
  alternatives, warnings, source-version metadata, review state,
  accepted-candidate keyed fingerprint and result identity, expiry. Proposal JSON
  is validated on every boundary and is not accepted content. Locked terminal
  state makes an identical accept/discard retry idempotent without another client
  key and rejects a changed candidate after acceptance.
- `dictionary_uploads`: private object key, owner/job references, validated
  immutable object version and checksum, scan/extraction state, expiry and
  deletion status; never store a public object URL or original content in
  PostgreSQL.
- `dictionary_idempotency_keys`: owner, bounded operation kind, idempotency key,
  request fingerprint, in-progress/completed state, result/resource identity,
  expiry, timestamps, and a unique owner/operation/key constraint. Dictionary
  create, fork, and bulk commit reserve/complete this row in the same transaction;
  key reuse with a different fingerprint is a conflict. Proposal accept/discard
  use their own locked review state as the natural idempotency seam.

Use partial/compound indexes for owner lifecycle lists, dictionary card order,
card search, share-locator/key-digest lookup, current jobs, expired proposals/uploads, and
worker lease acquisition. Use database constraints for local invariants and
application transactions for cross-row resolution. Generated migration SQL and
metadata remain reviewed together under ADR-0002.

M1 owner admission serializes against the user row and enforces 100 retained
dictionaries, 50,000 retained cards, and 250,000 immutable revisions per owner.
Archived rows count until an authorized purge capability is designed. Public
reads are hard-paged at 25 cards; PostgreSQL advisory transaction permits bound
concurrent shared reads, full-window reorders, card revision writes, and forks,
while forks stream source rows in bounded chunks.

### Planned HTTP surface

- `GET /languages`
- `GET|POST /dictionaries`
- `GET|PATCH /dictionaries/:dictionaryId`
- `POST /dictionaries/:dictionaryId/archive`
- `POST /dictionaries/:dictionaryId/restore`
- `GET|POST /dictionaries/:dictionaryId/cards`
- `GET|PATCH /dictionaries/:dictionaryId/cards/:cardId`
- `POST /dictionaries/:dictionaryId/cards/:cardId/archive`
- `POST /dictionaries/:dictionaryId/cards/:cardId/restore`
- `POST /dictionaries/:dictionaryId/cards/reorder`
- `POST /dictionaries/:dictionaryId/share-key/rotate`
- `GET /shared/dictionaries/:shareId` with the fragment-sourced share key in a
  dedicated request header
- `POST /shared/dictionaries/:shareId/fork` with bearer principal and the same
  dedicated share-key header
- `POST /dictionaries/:dictionaryId/cards/:cardId/generations`
- `POST /dictionaries/:dictionaryId/batch-generations`
- `POST /dictionaries/:dictionaryId/document-uploads`
- `POST /dictionaries/:dictionaryId/document-generations`
- `GET /dictionary-generation-jobs/:jobId`
- `POST /dictionary-generation-jobs/:jobId/cancel`
- `POST /dictionary-generation-jobs/:jobId/discard`
- `POST /dictionary-generation-jobs/:jobId/accept`
- `POST /dictionary-generation-jobs/:jobId/regenerate`
- Quizlet preview/import and Quizlet/Languon export operations under the owning
  dictionary or new-dictionary import collection.

Every HTTP boundary uses `@languon/contracts`, OpenAPI success/error/security
metadata, bounded bodies/collections, request cancellation, owner authorization,
and stable error categories. Mutations carry their relevant expected dictionary,
card, and/or settings versions; create/fork/enqueue/bulk operations carry client
idempotency keys. Proposal accept/discard uses the locked review state plus a
keyed candidate fingerprint instead of a redundant key. Public private/not-found
responses do not create an enumeration oracle. Module-private Zod schemas
validate durable and provider payloads.

## M0 architecture contract

### Contract and ownership map

```text
packages/languages (framework-neutral leaf)
        +--> @languon/contracts (HTTP wire schemas only)
        +--> apps/web
        +--> apps/backend dictionaries

@languon/contracts ----------------------+
                                         v
apps/web (pages-first FSD) ----------> HTTP interface
  pages/widgets/features/              |
  entities/shared                      v
                              apps/backend/modules/dictionaries
  interface/http -> application -> domain
        |                |
        |                +-- repository / unit-of-work / generation /
        |                    storage / scanner / parser / OCR ports
        v
  infrastructure adapters -------------------------------+
        |                                                  |
        +--> module-owned Drizzle schema --> PostgreSQL    |
        +--> Mastra/model adapters (@languon/prompts)      |
        +--> private product storage / ClamAV / OCR -------+

Module-private Zod schemas validate persisted jobs, revisions, proposals,
parser IPC, and model/OCR output before mapping to application/domain values.

Future workbook / lesson / course / exercise modules
        |
        +-- explicit FK link tables --> dictionary/card stable IDs
             (no application-source import, generic asset, or shared mutable fork)
```

Current card fields remain typed relational state. The only schema-versioned
JSON at this boundary is an immutable revision snapshot or an untrusted proposal
that is validated before storage and again before acceptance.

### Settings resolution contract

Owner read models return both raw card overrides and server-resolved effective
settings. Clients render effective behavior and raw advanced controls; they do
not reimplement inheritance.

| Setting                      | Raw card override                                    | Effective resolution                                                                                          | Dormant-state rule                                                                                                             |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Optional field enabled       | `null` (inherit), `enabled`, or `disabled`           | Non-null override replaces dictionary default                                                                 | Value and subordinate overrides remain stored while disabled                                                                   |
| Definition language          | `null` (inherit), `source`, or `target`              | Non-null override replaces dictionary role                                                                    | Role remains stored while definition is disabled                                                                               |
| Example language             | `null` (inherit), `source`, or `target`              | Non-null override replaces dictionary role                                                                    | Role remains stored while example is disabled                                                                                  |
| Example translation enabled  | `null` (inherit), `enabled`, or `disabled`           | Resolved value AND effective example-enabled                                                                  | Explicit enable while the example is currently disabled is rejected; a later parent disable preserves the raw override dormant |
| Example translation language | No independent raw setting                           | Always opposite the effective example role                                                                    | Recomputed when example role changes                                                                                           |
| Transcription notation       | `null` (inherit), `ipa`, `romanization`, or `custom` | Non-null override replaces dictionary notation                                                                | Notation/custom label remain stored while transcription is disabled                                                            |
| Custom notation label        | `null` (inherit) or bounded label                    | Non-null replaces the dictionary label; a resolved label is required when enabled transcription uses `custom` | Preserved but inactive for IPA/romanization or disabled transcription                                                          |

Dictionary-setting updates and card writes are atomic and version checked; they
never cascade-delete raw overrides or inactive values. Revisions capture the raw
overrides, effective settings, dictionary-settings version, and current values
used for that mutation. The authorship transition matrix in `FEATURE.md` is the
server contract for content/override changes and proposal acceptance.

### Authoring and generation data flow

```text
manual authoring
web -- contract + expectedVersion --> HTTP -- authorize --> application tx
     <-- typed current card + version -- PostgreSQL <-- current row + revision

AI / pasted terms
web -- bounded input + idempotency --> HTTP -- persist job --> PostgreSQL
                                      worker leases / heartbeats |
                                      structured provider call   |
                                      validated proposal --------+
web <-- poll typed status/proposal <-- HTTP <-- authorized read --+
web -- edited candidate + expected versions --> atomic accept tx

document input
web -- authorize metadata --> HTTP -- short-lived scoped upload capability
web -------------------------------> private versioned quarantine object
worker --> bind exact version/checksum --> fail-closed scan
       --> credentialless parser child process --> optional OCR --> proposal
worker --> terminal object/temp deletion; cleanup reconciles within 24 hours
```

The API is never the executor for provider or parsing work. Card mutation occurs
only through manual authoring or an explicit version-checked proposal-acceptance
transaction.

### Threat and failure boundaries

| Boundary / threat                           | Required control                                                                                                                         | Verification milestone      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Owner ID or share-key spoofing              | Verified principal; non-secret locator; fragment-sourced header; key digest/constant-time check; constant not-found; rotation/revocation | M1 HTTP/PostgreSQL/security |
| Capability cache leakage                    | `private, no-store`; no static/ISR/shared cache; no-referrer; proxy-path tests for keyless/rotated/archived reads                        | M1                          |
| Cross-owner SQL reads or writes             | Repository ownership predicates plus transaction authorization and isolation tests                                                       | M1                          |
| Confused-deputy future reference            | Link-time and dereference authorization; lifecycle revocation; same-owner composite key when required; never persist a share key         | Future consumer + M1 seam   |
| Stored HTML/model content execution         | Plain-text schemas and inert text-node rendering; no raw HTML/Markdown; malicious-content component/browser cases                        | M1–M4                       |
| Generic or malformed revision/proposal JSON | Discriminated schema version, Zod validation on write/read/accept, bounded payloads                                                      | M1–M3                       |
| Model prompt injection or invalid output    | Structured input/output, no model tools/authority, size/content validation, review before mutation                                       | M2–M4                       |
| Duplicate/stale worker effects              | Skip-locked claim plus monotonic fence CAS on every write, idempotent stages, expected versions, provider abort/idempotency              | M2                          |
| Old/new job/proposal format mismatch        | Release-declared worker/API/web capabilities, two-release expand/activate, full rollback-floor preflight, drain before retirement        | M2/M6 deployment            |
| Presigned replay, leakage, or byte swap     | Signed atomic create-only/length/checksum, one data version, exact-version reads, tombstone through expiry, physical-byte accounting     | M4                          |
| Malware or parser exploitation              | Exact-byte quarantine; fresh fail-closed ClamAV; credentialless egress-denied child sandbox; resource/time/output limits                 | M4                          |
| External OCR/model data retention           | Provider-neutral port, bounded necessary input, capability disabled pending policy/config review                                         | M2/M4                       |
| Raw-content leakage in telemetry/evidence   | Sanitized categories and counters only; no prompts, cards, documents, tokens, or provider payloads                                       | M1–M6                       |
| Proposal/object/prompt retention            | Immediate terminal redaction/deletion; seven-day maximum review payload; 24-hour orphan cleanup; lifecycle backstop; fake-clock evidence | M2–M4                       |
| CSV spreadsheet execution                   | RFC 4180 serialization and safe formula-prefix handling with explicit export contract                                                    | M5                          |
| Card/job/storage/provider exhaustion        | Pagination plus transactional owner/global queue/upload/spend budgets, fair leasing, circuit breakers, scanner limits, indexed queries   | M1–M6                       |

Accepted [ADR-0011](../../../docs/adr/0011-dictionary-persistence-and-composition.md)
and [ADR-0012](../../../docs/adr/0012-dictionary-worker-and-document-ingestion.md)
are the durable source for these seams. The diagrams summarize their required
implementation and test boundaries; later milestones must update them if an
accepted superseding decision changes the flow.

## Acceptance criteria

- [x] AC-1 — Canonical language catalog and immutable non-empty dictionary pair.
- [x] AC-2 — Complete accessible owner dictionary lifecycle.
- [x] AC-3 — Complete card lifecycle, ordering, search, settings, and scale.
- [x] AC-4 — Typed relational persistence and immutable content/provenance revision history.
- [x] AC-5 — Safe anonymous unlisted reads and no-index public page.
- [x] AC-6 — Safe independent authenticated forks.
- [x] AC-7 — Server-controlled human/AI-generated/mixed authorship.
- [x] AC-8 — Persistent single-card AI proposal and conflict-safe acceptance.
- [x] AC-9 — Durable independently deployed worker execution.
- [x] AC-10 — Bounded pasted-term generation and review/commit.
- [x] AC-11 — Safe transient document scanning/extraction/OCR generation.
- [x] AC-12 — Quizlet import with deterministic and optional-AI paths.
- [x] AC-13 — Quizlet-compatible and full Languon exports.
- [x] AC-14 — Stable future live-reference composition seam.
- [x] AC-15 — Contracts, DDD/FSD, design, locale, accessibility, and errors.
- [x] AC-16 — Compatible migration/deployment/capability/operations rollout.
- [x] AC-17 — Complete proportional verification and independent review.

The observable wording in `FEATURE.md` is authoritative. Milestones below map
implementation and evidence to these stable IDs.

## Test strategy

- Unit: Required. Cover language canonicalization/catalog, settings inheritance,
  validation limits, example pairing, notation, language-pair lock, duplicate
  warning normalization, ordering/rebalance, visibility/lifecycle, authorship and
  revision transitions, job state/lease/retry/cancel/expiry, chunk aggregation,
  parser delimiters/quoting/formula safety, extraction limits, and error mapping.
- Integration: Required. Against disposable PostgreSQL, cover schema constraints,
  owner isolation, list/card cursors, search/order, optimistic conflicts,
  archive/restore, share-token rotation, concurrent/idempotent fork, revision
  transactions, capacity, job leasing across workers, heartbeats/recovery,
  cancellation, proposal acceptance, bulk commit, and cleanup. Use disposable
  S3-compatible storage and scanner fixtures for upload lifecycle tests.
  `apps/backend/tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts`
  must inspect catalog columns/checks/FKs/indexes and prove current typed values,
  one-card/one-dictionary ownership, immutable revisions, raw/effective settings
  round trips, and absence of JSON as the current-card query source.
- Contract/HTTP: Required. Exercise composed Hono routes with real Zod contracts,
  bearer principal resolution, anonymous/public boundaries, non-enumerating
  errors, OpenAPI, `private, no-store`/no-index/no-referrer metadata through the
  representative proxy, idempotency and fingerprint conflicts, cancellation,
  body/collection/admission limits, capability gating, import/export streaming,
  and sanitized failure responses. Authorized, keyless, rotated, and archived
  public reads must prove no static/ISR/shared-cache reuse.
- AI/Mastra: Required. Use deterministic model/OCR adapters for structured input,
  output validation, alternatives, prompt-injection containment, context,
  cancellation, registry/policy discovery, and missing-credential behavior.
  Automated tests never call live models. A live synthetic staging smoke is
  optional deployment evidence, not a substitute for deterministic tests.
- Parser/upload security: Required. Test malformed CSV, delimiter ambiguity,
  Unicode/line breaks, oversized rows, formula prefixes, MIME/magic mismatch,
  password/macro/active files, decompression and pixel/page/text limits,
  malicious scanner fixture, stale/missing signatures, scan-limit/partial/
  unavailable outcomes, exact-version overwrite races, parser-sandbox egress/
  credentials/resource/output limits, parser/OCR timeout, transactional owner/
  global admission, object/version deletion, proposal redaction, and no raw-content
  logging.
- Component: Required. Cover explicit save/cancel, unsaved guard, conditional and
  advanced settings, card CRUD/reorder/search, preserved inactive values,
  public/fork states, AI progress/diff/alternatives/conflicts, batch/document
  review, import preview, export feedback, keyboard/focus/live-region behavior,
  and mixed-language `lang` metadata. Render malicious owner/model strings as
  inert text in owner, anonymous, proposal, warning, alternative, and export-
  feedback surfaces; v1 tests forbid raw HTML/Markdown rendering.
- E2E: Required for the six canonical cross-boundary scenarios in
  `FEATURE.md`. Reuse real web/backend/PostgreSQL/Redis/worker boundaries and
  deterministic local AI/OCR; do not mock the component under test. Exhaustive
  parser, SQL, job, permission, and failure matrices stay at cheaper layers.
- Browser: Required through `$browser-verification`. Exercise owner and anonymous
  journeys at 320px and expanded desktop, both themes, 200% text, keyboard,
  focus, long localization, mixed-language pronunciation metadata, refresh/
  navigation persistence, upload/progress/error states, and console/network
  audits.
- Database/migration: Required through `$db-verification`. Apply on a clean
  disposable database, inspect tables/types/checks/FKs/indexes/ledger, rerun
  idempotently and concurrently, exercise repository invariants/query plans,
  and verify rolling-version compatibility. Do not invent destructive down
  migrations; prove a safe inverse only when one exists.
- Deployment/system: Required for worker, storage, scanner, graceful shutdown,
  blue/green overlap, environment validation, image commands, readiness,
  capability gating, migration ordering, object cleanup, and local rehearsal.
  `apps/backend/tests/integration/modules/dictionaries/infrastructure/dictionary-worker-version-overlap.test.ts`
  must run two handler capability sets against disposable PostgreSQL and prove
  old work/old worker, new work skipped by old and processed by new, exclusive
  leases, stale recovery, and processable queued work after rollback. The
  deployment-level counterpart is
  `infra/deploy/tests/dictionary-worker-overlap.journey.test.mjs` under
  `node --test infra/deploy/tests/dictionary-worker-overlap.journey.test.mjs`.
- Review/security: Required. Run independent reviewer and tester passes after
  implementation, plus security review for public authorization, SQL/rendering,
  external models, uploads/parsers/OCR, storage/secrets, worker execution, CSV,
  and data retention. Resolve critical/high and material security findings.
- Static/repository: Required. Run affected package/app tests and builds while
  iterating, then format, lint, typecheck, test, build, `pnpm check`, guide checks,
  and mapped E2E commands before completion.

## User-flow documentation

- Create `docs/user-flows/dictionary-platform.md` with browser, API, and system
  surfaces, `web-playwright` registration, exact E2E path
  `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`, and the six stable
  scenario IDs from `FEATURE.md`.
- Keep the guide `draft` until every declared scenario has a real marker,
  current revision marker, and executed evidence. Add it to the guide index.
- Update `web-ui-kit.md` only for observable shared-primitive/design-contract
  changes; retain and rerun `theme-preference-persistence`.
- Update `mastra-agent-development-harness.md` for product primitive discovery,
  deterministic fixture/capability behavior, and any composition policy changes;
  retain and rerun `playground-provision-run-persist-reset`.
- Update `release-deployment-platform.md` for worker/storage/scanner topology,
  readiness, local rehearsal, cleanup, and rollback behavior; retain and rerun
  `local-deploy-verify-rollback`.
- Use `$user-flow-e2e` for every guide/test synchronization. Run
  `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check dictionary-platform`,
  and the corresponding checks and mapped journeys for every affected current
  guide.

## Runtime UI composition contract

- Primary job: let an adult learner or tutor build, understand, maintain, share,
  and reuse a bilingual dictionary while remaining in control of every manual or
  AI-assisted card change.
- Entry contexts: dictionary library, owned dictionary workspace, public
  capability page, single-card AI review, pasted-term generation, document/OCR
  generation, and Quizlet import/export.
- Primary actions: create/open a dictionary; add or edit a card; review and accept
  an explicit change. Archive, restore, sharing, forking, cancellation, discard,
  retry, and export remain secondary or destructive/contextual actions.
- Structure: treat the library as a collection, the owned dictionary as a detail
  workspace with a scannable card collection, card authoring as a focused task,
  and long AI/import/document review as dedicated review flows rather than dense
  controls inserted into the card list.
- Essential content stays visible: dictionary identity and language pair, current
  lifecycle/visibility, card source and translation, save/conflict state, and the
  next valid action. Optional fields, raw overrides, provenance details, and
  advanced generation controls use appropriate disclosure without hiding
  information required to review an AI proposal.
- Required runtime states cover the entire `FEATURE.md` as their owning
  milestones become executable, including implemented
  M1/M2 behavior and later M3–M5 behavior: loading, empty, validation, disabled,
  optimistic conflict, offline/transient failure, capacity/rate limit, archive/
  restore, private/unlisted/revoked capability, fork, duplicates, partial row
  failure, queued/running/cancelling/cancelled, editable AI comparison and
  alternatives, stale proposal, upload/scanner/OCR failure, import preview, and
  export feedback. Future AI functionality must not be made executable in web
  code before its owning milestone exists.
- Compose and verify light and dark themes, keyboard/focus behavior, 200% text, long
  localization, mixed-language `lang`/`dir`, RTL learning content, and content-fit
  transformations at representative 320–375, 390–430, 768, and 1280–1440 px
  viewports.
- Implement with runtime semantic tokens and shared UI primitives. Use design
  artifacts only as optional references. Run the rendered review checklist and
  record concrete blocker/major findings plus viewport/state evidence.

## Milestones

- [x] M0 — Durable architecture and visual contract
    - Objective: establish approved cross-feature rules before schema, worker, or
      runtime UI commits depend on them.
    - Components: two new accepted ADRs, `docs/architecture.md`, related operations
      design, `design/DESIGN_SYSTEM.md`, dictionary boards/symbols in
      `design/main.pen`, initial contract/data-flow/threat diagrams in this plan.
    - Acceptance criteria: planning support for AC-4, AC-9, AC-11, AC-14–AC-16.
    - Required tests: ADR/index/link/docs validation, design-source inspection,
      architecture/product/security/tester review of the milestone contract.
    - M0 completion checklist:
        - [x] ADR-0011 and ADR-0012 are Accepted, indexed, and all local links
              resolve.
        - [x] `docs/architecture.md` and dictionary jobs/document operations
              distinguish approved target topology from deployed reality and
              align with ADR-0002/0009.
        - [x] `design/main.pen` parses with unique IDs and contains the reusable
              library, settings, card editor/list, compact editor, public sharing,
              proposal comparison, progress, batch, and document symbols.
        - [x] `design/DESIGN_SYSTEM.md` defines inheritance, mixed-language,
              public/fork, AI provenance, compact, conflict, and upload states.
        - [x] Contract, data-flow, settings-resolution, and threat boundaries are
              recorded above and match the two ADRs.
        - [x] Independent architect, product-owner, tester, and security reviews
              are recorded; every high and material medium finding is resolved.
        - [x] Exact formatting, link, guide-mapping, and design-structure commands
              and results are recorded in `EVIDENCE.md`.
    - Status/evidence: Complete on 2026-08-21. See `EVIDENCE.md` and `REVIEW.md`.
      No runtime, migration, or deployment implementation is claimed by M0.

- [x] M1 — Core dictionary data, contracts, API, and web authoring
    - Objective: deliver owner dictionary/card CRUD, settings, revisions, search,
      ordering, archive/restore, unlisted reading, and independent forks.
    - Components: language package, dictionary contracts, backend domain/
      application/persistence/interface, Drizzle migration, web entity/features/
      widgets/pages, locales, stories, canonical guide/E2E foundation.
    - Acceptance criteria: AC-1–AC-7, core AC-14–AC-15.
    - Required tests: domain/contract/component tests, disposable PostgreSQL
      repository/HTTP integration, migration verification, owner/public/fork E2E,
      real-browser responsive/accessibility checks, security review. The
      repository integration test named in the global strategy must assert typed
      columns/checks/FKs/indexes, one-owner card membership, immutable revisions,
      raw/effective inheritance round trips, and no current-card JSON source.
    - Status/evidence: Complete on 2026-08-21. AC-1–AC-6 and AC-14 are
      complete; M1 establishes the human/fork portion of AC-7 and the core
      contract/DDD/FSD/accessibility portion of AC-15. AI authorship and later
      cross-milestone validation remain with M3–M6. See `EVIDENCE.md` and
      `REVIEW.md`.

- [x] M2 — Persistent worker and single-card AI proposal
    - Objective: add safe durable job execution and the complete regenerate/review/
      accept/discard/cancel/conflict journey for one card.
    - Components: job/proposal schema and services, worker entry point/deployment,
      prompt fallback, Mastra product agent/composition, capability/status routes,
      web proposal UI, related Mastra/release guide changes.
    - Acceptance criteria: AC-7–AC-9, AI portions of AC-15–AC-17.
    - Required tests: job/authorship unit tests, multi-worker PostgreSQL integration,
      deterministic structured-agent and registry/policy tests, deployment/shutdown
      checks, proposal E2E/browser journey, correctness/security review.
      Include the named two-capability-set worker integration fixture and
      deployment overlap journey from the global strategy; rollback must leave
      every queued supported job processable exactly once. Assert fencing rejects
      a paused stale worker, release metadata follows expand/activate across
      worker/API/web read/cancel/discard/accept behavior, R+1 work remains
      resolvable after an R rollback, and a settings change makes
      `expectedSettingsVersion` acceptance conflict. Use a
      fake clock to redact accepted/discarded/cancelled/expired proposal payloads
      while retaining only safe outcome/provenance metadata.
      Concurrent enqueue tests prove owner/kind/key uniqueness and same-versus-
      different keyed-fingerprint behavior after raw-input redaction. Proposal
      tests prove an identical accept retry returns the stored result and a
      changed-candidate retry conflicts.
    - Status/evidence: Complete on 2026-08-21. Additive migrations 0009–0012,
      fenced jobs/proposals, immutable per-job provider budgets, deterministic
      and Mastra adapters, the independently deployed worker, rollout capability
      preflight, review UI, three mapped Chromium journeys, real-browser
      acceptance, full disposable PostgreSQL/deployment rehearsals, and final
      correctness/testing/security approvals are recorded in `EVIDENCE.md` and
      `REVIEW.md`.

- [x] M2.5 — Retired design approval gate
    - Objective: recompose and validate the complete web-first dictionary and card
      experience on the current design system before additional UI implementation.
    - Components: `design/main.pen`, affected dictionary guidance in
      `design/DESIGN_SYSTEM.md`, the complete `FEATURE.md` screen/state inventory,
      and design-review evidence. Use `$ui-ux-composition` in Implement mode and
      Pencil as the only editor/inspector for `.pen` content.
    - Acceptance criteria: visual planning and interaction coverage for AC-2–AC-3,
      AC-5–AC-8, AC-10–AC-13, and the web/design/accessibility portions of AC-15.
    - Required design coverage:
        - dictionary library creation/list/empty/archive/restore and owned
          dictionary header, settings, visibility, share, and language-pair lock;
        - card collection search/order/duplicate/capacity states plus focused
          create/edit with inherited optional fields, inactive-value preservation,
          overrides, notation, validation, save/cancel, and conflict recovery;
        - public unlisted read, revoked/keyless absence, sign-in/fork, and clear
          independent-copy outcome without private owner disclosure;
        - single-card AI queue/progress/cancel, original-versus-editable proposal,
          warnings/reasons/alternatives, retry/regenerate, discard, accept,
          authorship, semantic no-op, and stale-version conflict;
        - future pasted-term, document/OCR, Quizlet import, and export journeys,
          including progress, partial failures, duplicates, selection, preview,
          cleanup/error, and completion feedback without implying unavailable
          runtime capability;
        - light/dark, 320–375/390–430/768/1280–1440, 200% text, keyboard/focus,
          long localization, mixed-language metadata, and RTL-content examples.
    - Required verification: inspect current tokens, reusable symbols, comparable
      product screens, and implemented M1/M2 runtime before composing; render and
      inspect every representative surface; run the complete UI/UX screen review
      checklist; fix all blocker/major design findings; validate Pencil layout,
      clipping, component references, naming, and reusable patterns; record
      screenshots/viewport/state evidence in `EVIDENCE.md`.
    - Supersession: on 2026-08-25 the user removed the design-source approval
      requirement and authorized implementation from the shared UI kit. The
      completed boards remain optional reference material under ADR-0016.
    - Status/evidence: Closed as a retired gate. Its historical design evidence
      remains in `EVIDENCE.md`; it is not an implementation prerequisite.

- [x] M2.6 — Actualize implemented web UI from the shared UI kit
    - Objective: align the existing M1/M2 dictionary, cards, public/fork, and
      single-card AI web surfaces with the runtime UI composition contract.
    - Components: dictionary FSD pages/widgets/features/entities, four locales,
      Storybook stories, component tests, canonical user-flow mapping, and
      browser evidence. Future M3–M5 surfaces are composed only as their owning
      backend/application behavior becomes implemented.
    - Acceptance criteria: the currently executable portions of AC-2–AC-8 and
      AC-15 use a coherent shared-kit composition without adding placeholder execution,
      fabricated AI results, or browser-owned business authority.
    - Required tests: affected component/story tests, locale and mixed-language
      assertions, existing mapped dictionary E2E, and `$browser-verification` at
      320 px, 390 px, 768 px, and desktop in both themes with keyboard, 200% text,
      console, and failed-network inspection. Update design/runtime evidence and
      affected guides together.
    - Status/evidence: Complete on 2026-08-25. Shared-kit dialog/sheet and action
      menu composition, responsive and mixed-direction authoring, pending-save
      safety, modal conflict recovery, stories, component tests, three mapped
      Chromium journeys, real-browser evidence, and independent review passed.

- [x] M3 — Pasted-term batch generation
    - Objective: turn bounded pasted terms and optional context into reviewed,
      partially recoverable card candidates and atomically commit selected rows.
    - Components: batch input/proposal contracts, chunk orchestration, duplicate/
      row-failure handling, bulk repository transaction, web batch review UI.
    - Acceptance criteria: AC-10 plus relevant AC-7, AC-9, AC-15, AC-17.
    - Required tests: split/chunk/order/partial-failure unit tests, capacity and
      atomic-commit integration, deterministic model tests, batch E2E/browser
      journey, reviewer and security regression pass. An empty-dictionary case
      enqueues under one source/target pair, changes the pair before commit, and
      requires `expectedDictionaryVersion` plus trusted-pair conflict without
      saving any candidate.
    - Status/evidence: Complete on 2026-08-26. Versioned contracts, 20-row
      chunk orchestration, durable partial proposals, context-preserving failure
      successors, atomic selected-card commit, final duplicate warnings,
      responsive shared-kit review, migration/rollout compatibility, mapped
      Chromium and real-browser acceptance, disposable PostgreSQL verification,
      and independent correctness/testing/security review passed.

- [x] M4 — Safe document upload, extraction, OCR, and proposal
    - Objective: process explicit term-list documents through private upload,
      scanning, bounded native extraction/OCR, existing generation, review, and
      verified transient cleanup.
    - Components: S3-compatible product-storage port/adapter, local disposable
      storage, ClamAV scanner port/adapter, document parsers, vision/OCR port,
      upload/job APIs, worker stages, web upload/progress/review, Compose/operations.
    - Acceptance criteria: AC-11 plus relevant AC-9–AC-10, AC-15–AC-17.
    - Required tests: adversarial file/parser/scanner/OCR unit tests, disposable
      storage/scanner/PostgreSQL integration, cleanup/expiry/failure recovery,
      deployment readiness, document E2E/browser journey, independent security
      review and remediation. A fake-clock cleanup fixture must prove immediate
      terminal deletion, sanitized retry state after object-delete failure,
      idempotent deletion of an orphan older than 24 hours, and that quarantined,
      infected, stale-signature, scanner-limit, or scanner-unavailable objects
      never reach parser/OCR adapters. Also prove a post-completion overwrite
      cannot change the exact version/checksum scanned and parsed; parallel and
      replayed creates before completion and after cleanup produce at most one
      data version; a zero-byte tombstone blocks recreation through capability
      expiry; every physical byte remains quota-accounted; parser child processes
      have no application environment/egress and reject over-limit output; and
      owner/global admission reservations release on terminal cleanup.
      Parser table cases cover Markdown/DOCX lists, non-heading paragraphs,
      headings/blanks, single/multi-cell tables, plain/PDF/OCR lines, over-limit
      rows, and `no_terms_found` without vocabulary inference.
      An empty-dictionary case changes its source/target pair after enqueue and
      must conflict on `expectedDictionaryVersion`/trusted pair before proposal
      acceptance saves any candidate.
    - Status/evidence: Complete on 2026-08-26 for the fail-closed local and
      deterministic capability. Private versioned upload, exact-byte identity,
      scanning, bounded sandboxed extraction/OCR orchestration, cleanup-gated
      single final review, failure successors, atomic acceptance, expiry and
      indefinite cleanup reconciliation, disposable PostgreSQL/MinIO plus
      fail-closed ClamAV readiness,
      mapped Chromium, and independent correctness/testing/security review are
      recorded in `EVIDENCE.md` and `REVIEW.md`. Production document activation
      remains unavailable until the selected product-storage provider, pinned
      ClamAV runtime limits, narrow Bubblewrap/seccomp resource and escape proof,
      and live OCR privacy/cost policy pass the M6 activation gates.

- [x] M5 — Quizlet import/export and full Languon CSV
    - Objective: add deterministic paste/CSV/TSV preview/import, optional AI
      enrichment, Quizlet-compatible export, and full structured export.
    - Components: parser/exporter domain services, contracts/routes, streaming and
      bounded files, import/proposal composition, web preview/review/export UI.
    - Acceptance criteria: AC-12–AC-13 plus relevant AC-7, AC-10, AC-15, AC-17.
    - Required tests: parser/serializer table and property cases, Unicode/escaping/
      formula safety, capacity/atomic import integration, AI/no-AI provenance,
      import/export E2E/browser journey, security and correctness review.
    - Status/evidence: Complete on 2026-08-26. Deterministic and optional-AI
      import, sampled preview, lossless spreadsheet-safe export, bounded browser
      streaming, guarded PostgreSQL, mapped E2E, responsive browser evidence,
      independent review, and security re-review all passed after remediation.
      See `EVIDENCE.md` and `REVIEW.md`.

- [x] M6 — Full validation, review, rollout evidence, and integration readiness
    - Objective: verify the complete platform, resolve all material findings,
      synchronize every guide/ADR/operation, and prepare the verified feature
      for the repository-required local squash integration into `main`.
    - Components: complete diff, migrations, design/runtime stories, canonical and
      related guides, `EVIDENCE.md`, `REVIEW.md`, deployment/local rehearsal.
    - Acceptance criteria: AC-1–AC-17 and repository Definition of Done.
    - Required tests: all affected suites, disposable database/storage/scanner,
      mapped E2E and real-browser journeys, repository `pnpm check`, deployment
      rehearsal, independent reviewer/tester/security-reviewer reruns after fixes.
    - Status/evidence: Complete on 2026-08-26. The full repository check,
      disposable PostgreSQL/storage suites, six mapped Chromium journeys,
      migration/deployment classification, independent correctness/testing and
      security reviews, operational snapshot, documentation synchronization,
      and final hygiene all pass. External live-provider and document-production
      activation prerequisites remain fail-closed rollout gates rather than
      enabled feature behavior. See `EVIDENCE.md` and `REVIEW.md`.

## Progress

- 2026-08-21 — Classified as a feature; created branch
  `feature/dictionary-platform` and generated the four durable artifacts.
- 2026-08-21 — Converted the approved 2026-08-20 product/architecture roadmap
  into `FEATURE.md` and this decision-complete ExecPlan. Inspected governing
  AGENTS instructions, ADRs, architecture, design authority, existing schema/
  Mastra/deployment seams, and related user-flow mappings.
- 2026-08-21 — Completed M0: accepted and indexed ADR-0011/ADR-0012,
  synchronized architecture and operations contracts, extended the authoritative
  design system and `.pen` source, and recorded the required contract, data-flow,
  settings, and threat diagrams.
- 2026-08-21 — Completed independent architecture, product, testing, and
  security review. Remediated every high and material-medium M0 finding; no
  finding was waived. Exact focused checks are recorded in `EVIDENCE.md`.
- 2026-08-21 — Completed M1 typed persistence, migration, shared languages and
  HTTP contracts, owner/card authoring, unlisted capability reading, independent
  fork, localized responsive web UI, guide/E2E, scale and admission controls.
- 2026-08-21 — Remediated independent correctness, testing, and security
  findings covering pagination snapshots, resource exhaustion, transaction
  consistency, cancellation, idempotency replay/expiry, capability caching,
  duplicate warnings, FSD boundaries, error recovery, and quota concurrency.
- 2026-08-21 — Made mapped E2E repeatable without deleting Redis state by
  assigning every Playwright invocation a validated opaque authentication
  namespace; the exact two-scenario command passed twice on the same disposable
  Redis logical database. Reorder now projects only IDs and sort keys at the
  10,000-card boundary, and fork admission fails before acquiring potentially
  blocking owner/idempotency/source locks.
- 2026-08-21 — Completed M2 durable single-card generation: public contracts,
  jobs/proposals, server-owned authorship, fenced worker execution, bounded
  provider adapters, review/conflict UI, four-locale copy, and mapped E2E/browser
  acceptance.
- 2026-08-21 — Completed the independent M2 correctness, testing, and security
  cycle. Remediation added atomic cancellation/expiry redaction, per-attempt and
  rolling provider budgets, immutable job policy envelopes, bidirectional
  rollback-floor compatibility, exact worker database privileges, and a usable
  32,768-token minimum enforced through PostgreSQL.
- 2026-08-21 — The full local four-image deployment rehearsal exposed and then
  verified fixes for a reused-image release-SHA mismatch and an orphaned worker
  shutdown timer. Expand, injected migration failure, second release, rollback,
  sub-second worker drain, and cleanup now pass end to end.
- 2026-08-23 — Merged local `main` into `feature/dictionary-platform`. The merge
  introduced the accepted UI/UX composition skill and the consolidated current
  design-system canvas. The old dictionary boards remain recoverable in feature
  history and are inputs, not a mechanically merged component tree.
- 2026-08-23 — Added M2.5 and M2.6. Comprehensive design now precedes further web
  UI work, covers later AI/batch/document/import/export states, and requires the
  user's explicit acceptance before runtime actualization.
- 2026-08-23 — Composed the complete M2.5 dictionary experience as 19 current-
  system Pencil screens covering library, creation, owned workspace/settings,
  focused card editing, public read/fork, AI review, batch generation, document/
  OCR, Quizlet transfer, compact transformations, dark theme, RTL content, and
  required recovery/limit/confirmation states. Rendered review found and fixed
  editor and metadata clipping, open select menus, narrow table selection
  clipping, and collapsed state headings. Final Pencil audit reports 15 screens,
  no placeholders, and zero layout problems.
- 2026-08-23 — Revised M2.5 after user review. Card editing now uses a desktop
  dialog and mobile bottom sheet; card-level actions use an adjacent three-dot
  popover; compact batch candidates expose separate Definition and Example
  fields; document generation is split into file/text input, durable processing,
  extracted-term review, proposal review, and terminal recovery states. Added a
  design-only journey map and node context comments. Reduced doubled field/
  settings spacing, fixed mobile input overflow, button contrast, and cancel/edit
  icon semantics. Final re-audit reports 19 screens and zero layout problems.
- 2026-08-25 — The user removed the design-source approval gate and authorized
  runtime UI composition from shared primitives. ADR-0016 now makes runtime
  tokens, component contracts, stories, and browser evidence authoritative;
  M2.5 is retained only as historical design work.
- 2026-08-25 — Completed M2.6 shared-kit UI actualization. Independent review
  found and verified remediations for pending-save dismissal races, inaccessible
  modal conflict recovery, missing RTL field direction, all-disabled menus,
  ambiguous mixed-language action labels, and stale top-of-plan design authority.
  Focused tests, typecheck, guides/mappings, browser evidence, and all three
  mapped Chromium journeys pass.
- 2026-08-25 — Started M3 discovery and implementation. The accepted job ADR
  and current code support a discriminated format evolution, while the existing
  single-card-only wire/store/provider assumptions require explicit batch
  payload, proposal, acceptance, and rollout handling.
- 2026-08-26 — Completed M3 pasted-term generation. Independent review found
  and verified remediations for worker-role/card-read drift, API/worker budget
  split-brain, ambiguous enqueue retries, cross-dictionary URL restoration,
  edited duplicate warnings, and context-free failure retries. The final
  contract, unit, disposable PostgreSQL, deployment privilege, mapped Chromium,
  real-browser, and repository checks are recorded in `EVIDENCE.md`.
- 2026-08-26 — Completed M4 read-only seam, test, product, and security
  discovery. The implementation boundary is a separate upload aggregate plus a
  `document-terms:v1` generation job that reuses fenced work and atomic
  multi-card acceptance. Direct upload, OCR, and document enqueue remain
  capability-gated until real storage, scanner, sandbox, and policy proofs pass.
  A production-like Bubblewrap spike confirmed Docker's default seccomp blocks
  namespace creation; removing only that filter allowed namespace creation when
  `/proc` remained absent, so a narrow production seccomp profile still needs
  an escape-suite proof and unconfined seccomp is not acceptable.
- 2026-08-26 — User selected automatic scan/extraction → AI enrichment → one
  editable final generated-card review. D-18 is resolved; no separate durable
  extracted-term review or pre-AI editing state will be implemented.
- 2026-08-26 — Completed M4's fail-closed document capability and remediated
  independent parser, upload-recovery, cleanup, admission, retry, and sandbox
  findings. Production activation remains deliberately unavailable behind the
  external conformance and policy gates recorded above.
- 2026-08-26 — Began M5 and resolved D-20–D-23: server-authoritative sampled
  preview/all-valid atomic import, distinct 100-pair AI enrichment, reversible
  spreadsheet-safe full CSV, and a 320 MiB bounded snapshot/streaming export.
  Independent product, persistence, testing, and security discovery found no
  remaining user-choice blocker after the recorded safest defaults.
- 2026-08-26 — Completed M6 after full repository, disposable infrastructure,
  mapped-browser, deployment, correctness, testing, and security verification.
  Final remediation separated cleanup runtime readiness from activation health,
  preserved document completion across stop-enqueue releases, introduced a
  dedicated dictionary HMAC secret, added bounded operational signals and
  observation indexes, classified migrations through 0017, and synchronized
  every durable feature/design/guide artifact.
- Current work: M0 through M6 are complete and the feature is ready for the
  repository-required local squash integration into `main`.
- Immediate next action: preserve the verified fail-closed production gates,
  complete final Git hygiene, and squash-integrate the feature without enabling
  unapproved live providers or document infrastructure.

## Decisions

- D-1 — Typed vocabulary records, not generic assets
    - Context: cards require relational validation, querying, indexing, revisions,
      ownership, and stable references; future content kinds are not yet modeled.
    - Choice/rationale: `dictionaries` and `dictionary_cards` are first-class typed
      records. JSON is limited to validated revisions/proposals. Future modules add
      explicit FK links, preserving integrity and performance.
    - Rejected: `asset(type, payload JSONB)` and a speculative universal learning-
      object hierarchy.
    - ADR impact: accepted
      [ADR-0011](../../../docs/adr/0011-dictionary-persistence-and-composition.md)
      in M0.

- D-2 — One owning dictionary and explicit future links
    - Context: shared mutable cards would require membership, fork, conflict, and
      upstream-sync semantics before a demonstrated need.
    - Choice/rationale: a card belongs to one dictionary; forks copy; workbooks/
      lessons reference stable dictionary/card IDs live, but every consuming
      module authorizes link creation and dereference; FK existence never grants
      access and share keys are never durable cross-owner authority.
    - Rejected: many-to-many card libraries, linked forks, and implicit snapshots.
    - ADR impact: included in ADR-0011.

- D-3 — Relative settings and curated BCP 47 catalog
    - Context: language variants and assistive pronunciation require stable tags,
      while definition/example roles must survive catalog expansion.
    - Choice/rationale: approved catalog in `FEATURE.md`; source/target are distinct;
      roles are `source|target`; optional settings inherit through the recorded
      raw/effective precedence table with preserved dormant values; one accepted
      value per field; notation is IPA/romanization/custom; settings have a
      dedicated optimistic version.
    - Rejected: database language enum, arbitrary user tags, mixed-language cards,
      and multiple accepted values in v1.
    - ADR impact: feature-local/package contract; no separate ADR beyond D-1.

- D-4 — Private/unlisted sharing and independent fork
    - Context: the first release needs public read links and copies without full
      discovery, collaboration, licensing, or moderation.
    - Choice/rationale: capability URL, anonymous read, noindex, signed-in fork to
      private independent copy, safe provenance, archive revocation. The URL
      fragment carries the secret key; API request URLs carry only a non-secret
      locator and the client forwards the key in a dedicated header. Capability
      content is always `private, no-store`, no-referrer, inert plain text, and
      absent states are non-enumerating.
    - Rejected: public discovery, shared mutation, snapshot-free linked forks.
    - ADR impact: included public/fork authorization in ADR-0011; retain
      implementation security review.

- D-5 — Immutable revisions and server-computed authorship
    - Context: AI acceptance, manual edits, forks, and stale proposals need honest
      lineage and conflict checks.
    - Choice/rationale: current typed card plus immutable snapshots and
      `human|ai-generated|mixed` state computed from trusted revisions.
    - Rejected: removable `ai` tag, client-selected provenance, no history.
    - ADR impact: feature-local under dictionary aggregate decision.

- D-6 — Persistent PostgreSQL jobs in a separate worker
    - Context: AI/OCR work must survive reload, timeout, restart, and blue/green
      overlap without coupling API health to provider latency.
    - Choice/rationale: PostgreSQL fenced leases/heartbeats/idempotency/cancellation,
      application-owned transitions, two-release job-format activation, and a
      separately scalable worker command in the backend image.
    - Rejected: synchronous HTTP work, in-process fire-and-forget, Redis durability,
      and a managed queue vendor at launch.
    - ADR impact: accepted
      [ADR-0012](../../../docs/adr/0012-dictionary-worker-and-document-ingestion.md)
      in M0; architecture and operations extend ADR-0009 without rewriting it.

- D-7 — Review-first, version-bound AI proposals
    - Context: model output is untrusted and may race human edits.
    - Choice/rationale: structured persisted proposal, editable whole-candidate
      atomic acceptance, up to three alternatives, expected card/settings
      versions plus expected dictionary version/trusted pair, seven-day maximum
      review payload, immediate terminal/expiry redaction, scrubbed raw custom
      prompt.
    - Rejected: automatic mutation, field-by-field permanent merge state, transient
      request-only output.
    - ADR impact: feature-local application behavior.

- D-8 — Private transient documents with mandatory scanning
    - Context: OCR requires adversarial file parsing and external model data while
      originals need not become user assets.
    - Choice/rationale: separate private versioned S3-compatible product storage,
      exact-version/checksum-bound upload, fresh fail-closed ClamAV scanner,
      worker-local credentialless egress-denied parser child sandbox, native extraction then
      vision/OCR, transactional admission budgets, immediate terminal deletion
      and 24-hour abandoned cleanup.
    - Rejected: retained documents, parser isolation without scanning, managed
      scanner vendor, local OCR deployment, direct public URLs.
    - ADR impact: included in ADR-0012 and the dictionary jobs/document
      operations contract.

- D-9 — Deterministic Quizlet text interchange
    - Context: official Quizlet behavior is copy/import text and export arrangement,
      not a stable public API contract.
    - Choice/rationale: paste and bounded CSV/TSV upload, deterministic preview,
      optional AI enrichment, core-pair Quizlet export plus full Languon CSV.
    - Rejected: URL scraping, Quizlet credentials/API, flattening advanced fields.
    - ADR impact: feature-local external-format adapter.

- D-10 — One feature workspace and canonical user-flow guide
    - Context: the user requested one durable feature/plan for the approved roadmap;
      repository guides require a canonical slug matching the primary workspace.
    - Choice/rationale: keep all product milestones in `dictionary-platform` and
      own one canonical guide with stable milestone scenarios; related current
      guides change only when their observable contracts change.
    - Rejected: five disconnected specs with duplicated architecture and guide
      ownership, or one guide per milestone without matching feature workspaces.
    - ADR impact: none; delivery organization only.

- D-11 — Explicit capability publication
    - Context: an idempotent create/update response cannot safely replay a newly
      generated share key because PostgreSQL stores only its digest, while
      persisting the raw key would violate the capability contract.
    - Choice/rationale: dictionary creation is always private. Publishing and
      key rotation use the explicit share-key rotation operation, which sets the
      dictionary unlisted and returns the new capability once. Updating visibility
      to private revokes the capability. If a publish response is lost, the owner
      rotates again rather than retrieving or retaining the prior raw key.
    - Rejected: returning no key for an unlisted create, storing a replayable raw
      key, deriving a key from an idempotency value, or hiding key rotation inside
      a general settings update.
    - ADR impact: implementation-level clarification of ADR-0011's digest-only,
      rotatable capability rule.

- D-12 — First job format uses expand-then-activate rollout
    - Context: the current rollback floor has no dictionary worker/API/web job
      decoder. ADR-0012 forbids enqueueing a format until both the candidate and
      rollback floor can process its complete lifecycle.
    - Choice/rationale: M2 implements and deterministically verifies
      `single-card:v1`. The reusable deterministic M6 manifest advertises no AI
      lifecycle capabilities. The first provider-approved production expand
      release may advertise lifecycle support with `apiEnqueued=[]` only with
      live Mastra readiness; a subsequent compatible release manifest activates
      enqueue after preflight proves the rollback floor supports worker processing
      plus read/cancel/discard/accept and web rendering. Stop-enqueue retains live
      provider readiness until drained retirement. Local disposable E2E may
      explicitly enable the deterministic adapter.
    - Rejected: special-casing the first format, activating against an incapable
      rollback worker, or coupling ordinary API readiness to a live provider.
    - ADR impact: direct implementation of accepted ADR-0012; no new decision.

- D-13 — Immutable priced provider envelope per job
    - Context: API and worker containers can overlap across a model/pricing/config
      change; process-local limits cannot safely price or cap an already queued
      job after rollback.
    - Choice/rationale: enqueue persists the exact input/output maxima, token
      rates, and maximum cost per attempt. Claims, retries, provider calls,
      cancellation/stale settlement, and acceptance use that tuple. Release
      metadata binds the candidate and rollback floor to a mutually claimable
      conservative envelope; active overlapping formats require the same tuple.
    - Rejected: process-local pricing, zero-cost cancellation after dispatch,
      unbounded provider estimates, or allowing policy changes to strand queued
      work.
    - ADR impact: implementation of ADR-0012 admission and rollback contracts;
      no new strategic provider or billing commitment.

- D-14 — Design-first stakeholder approval gate (superseded)
    - Context: the initial dictionary visual contract and implemented M1/M2 UI do
      not yet represent a user-approved, end-to-end composition on the current
      design system, while later milestones add materially more AI and review
      states.
    - Choice/rationale: design all in-scope dictionary/card journeys and states in
      `design/main.pen` now with `$ui-ux-composition`; require explicit user
      acceptance; only then actualize implemented web surfaces. Later capabilities
      follow the accepted patterns when their owning milestones implement real
      behavior.
    - Rejected: continuing M3 UI incrementally without one coherent composition;
      updating runtime before design approval; implementing nonfunctional AI UI
      merely because its future design exists.
    - Superseded: removed by explicit user direction on 2026-08-25 and ADR-0016.

- D-15 — Runtime UI-kit implementation authority
    - Context: the design gate prevented continued implementation even though
      the web app has shared primitives, semantic tokens, stories, tests, and
      browser verification.
    - Choice/rationale: compose executable dictionary surfaces directly from the
      shared UI kit and established runtime patterns. Keep prior design boards as
      optional references and require rendered accessibility/responsive evidence.
    - Rejected: adding a new bottom-sheet dependency before proving the existing
      native-dialog `BottomSheet` insufficient; retaining a separate approval gate.
    - ADR impact: implements accepted ADR-0016.

- D-16 — Discriminated batch format on the durable generation lifecycle
    - Context: pasted-term work needs the same owner authorization, admission,
      fencing, cancellation, expiry, rollback, and review guarantees as
      single-card generation, but has kind-specific input, partial row results,
      and an atomic multi-card outcome.
    - Alternatives: (A) create a parallel batch-job/proposal subsystem, which
      duplicates lifecycle and rollout invariants; (B) overload the existing
      single-card payload and acceptance method, which makes callers branch on
      optional fields and weakens validation; (C) extend the existing job
      aggregate with a new versioned format and discriminated payload/proposal/
      outcome plus kind-specific enqueue and accept interfaces.
    - Choice/rationale: choose (C). Shared lease/review lifecycle stays behind
      the existing generation store, while contract, provider, and acceptance
      boundaries discriminate by kind. The bounded maximum-100-row review
      proposal remains one versioned JSON payload in the existing proposal row;
      no caller needs row queries or durable per-row mutations before commit.
      An accepted batch stores a bounded typed outcome JSON, and retrying selected
      failures enqueues a successor batch rather than mutating review history.
      Batch commit remains one dictionary-owned transaction with its own
      idempotency fingerprint/result identity. This minimizes caller burden and
      keeps failures and rollout compatibility local without inventing a second
      queue or speculative row table.
    - Test seam: pure split/chunk/order and proposal validation tests; composed
      HTTP/contract tests; disposable PostgreSQL atomicity, capacity,
      idempotency, authorship, and empty-dictionary pair-conflict cases; worker
      deterministic partial-result tests; component, mapped E2E, and browser
      review evidence.
    - ADR impact: implements accepted ADR-0011/ADR-0012; no new strategic
      persistence, provider, or deployment choice.

- D-17 — Server-owned pasted-row parsing and immutable generation snapshot
    - Context: admission must enforce the 100-term/200-code-point limits before
      provider work, and browser parsing or free-form model splitting would make
      ordering and limits inconsistent.
    - Choice/rationale: the HTTP boundary accepts bounded pasted text and optional
      shared context. The application deterministically treats each trimmed
      non-empty line as one ordered term, rejects invalid controls/rows/counts,
      and persists only validated indexed rows plus the trusted language pair,
      versions, and resolved dictionary settings within a 20,200-code-point
      CRLF-safe transport bound. The worker chunks those rows in groups of at
      most 20. This keeps the browser non-authoritative and makes admission,
      retries, ordering, and provider inputs deterministic.
    - Rejected: client-supplied parsed arrays as authority; comma/semantic model
      splitting that cannot enforce admission before paid work; retaining raw
      pasted formatting after validation.
    - ADR impact: feature-local implementation of AC-10 and ADR-0012 input bounds.

- D-18 — Automatic extraction and one final generated-card review
    - Context: the authoritative feature text describes automatic extraction into
      the existing generated-card review, while the later historical design
      section describes a durable extracted-term review followed by generated-
      card review. The choice changes provider-spend timing, cancellation,
      retention, URL restoration, authorship for edited extracted rows, and E2E.
    - Choice/rationale: automatic scan/extraction → AI enrichment → one editable
      final card review. Extraction is a transient processing stage, not a user-
      editable durable review. This matches `FEATURE.md`, minimizes raw-content
      retention and provider-spend states, and reuses M3 proposal editing,
      selection, authorship, duplicate warning, retry, and atomic acceptance.
      Retryable enrichment failures create a server-owned pasted-term successor
      from selected persisted failure rows. It records predecessor lineage and
      current dictionary/settings snapshots, leaves the original document review
      immutable, and never replays the terminally redacted raw instruction.
    - Rejected: a separate editable extracted-term review before AI. It adds a
      second durable state/action contract and ambiguous pre-AI edit authorship
      without a required user outcome.
    - Status: selected by the user on 2026-08-26.

- D-19 — Versioned M4 resource policy
    - Context: file-size and page-count limits alone do not bound adversarial ZIP,
      PDF, image, parser, scanner, or OCR work consistently across contracts,
      adapters, deployment readiness, and tests.
    - Choice/rationale: `documentIngestionLimitsV1` fixes a 10-minute upload
      capability; 20 MiB file; 100 pages and 100 extracted units including
      failures; 200 code points per unit; 2,048 ZIP entries, no nested archives,
      64 MiB expanded bytes and 100:1 expansion ratio; 16,384-pixel dimension,
      25-megapixel page and 250-megapixel document; 1 MiB extracted UTF-8 and
      2 MiB parser IPC output. A parser child receives 15 seconds wall/10 seconds
      CPU, a 256 MiB virtual-address/V8 envelope, 8 PIDs, and 128 MiB bounded
      parser output/temporary accounting. Production activation additionally
      requires a reviewed cgroup/container RSS and tmpfs proof because
      `RLIMIT_AS` is not an RSS limit. Scanner limits are
      30 seconds, 25 MiB stream, recursion 10, 2,048 files, and signatures no
      older than 24 hours. Deterministic OCR is bounded to 8 MiB/25 megapixels/
      20 seconds per page and 100 pages/250 megapixels/120 seconds per document.
      Live OCR remains unavailable until separately reviewed cost/privacy policy.
      Admission reserves at most five/100 MiB pending uploads per owner and
      50/1 GiB globally; physical bytes stay reserved until verified deletion.
    - Boundary behavior: 101 or more extracted units is terminal
      `too_many_terms`, never truncation. `no_terms_found` means zero extracted
      units after ignored headings/blanks. A document containing only invalid
      units reaches failure-only review without retaining raw over-limit content.
    - ADR impact: feature-local executable defaults under accepted ADR-0012;
      changing the security envelope requires synchronized contract, operations,
      deployment, and verification updates.

- D-20 — Server-authoritative deterministic interchange
    - Context: browser preview rows cannot authorize a later import, and arbitrary
      delimiter/header inference makes malformed or hostile files ambiguous.
    - Choice/rationale: M5 transports at most 1 MiB of decoded UTF-8 text over
      JSON for paste and browser-read CSV/TSV files. Delimiter (`comma`/`tab`),
      header presence, and source/target column indexes are explicit. The server
      reparses the original content for preview and commit; commit fingerprints
      content, mapping, target, and expected versions, then locks
      owner/dictionary/settings and creates all human cards/revisions atomically.
      New-dictionary import uses ordinary default settings. No URL, credential,
      scraping, multipart, filename, or browser-preview authority is accepted.
      Preview is a target-aware bounded sample: the user edits the raw content
      and mapping, and deterministic commit imports every valid reparsed row.
      Zero valid rows fail; deterministic import does not pretend a 100-row
      sample is a complete 10,000-row selection surface.
    - Bounds: 10,000 data rows, 100 columns, 8,192 code points per raw cell,
      bounded preview/errors, fatal NUL/lone-surrogate/disallowed C0/C1 controls
      except tab/CR/LF, RFC doubled quotes and quoted line breaks, and existing
      card-domain validation for the mapped source/translation pair. Browser file
      reads use fatal UTF-8 decode; the API strips one initial BOM and enforces the
      byte limit after UTF-8 re-encoding. Structurally blank records are ignored,
      and generic pair import rejects the full Languon v1 header.

- D-21 — Pair-preserving optional AI import
    - Context: `pasted-terms:v1` contains source-only inputs and cannot preserve
      a trusted imported translation or mixed provenance across worker overlap.
    - Choice/rationale: optional AI uses distinct `import-pairs` /
      `import-pairs:v1` jobs. Server-parsed source and translation are immutable
      provider baselines; the provider enriches enabled optional fields only.
      The user may edit every candidate in the final review, and accepted cards
      are always `mixed`. One AI import is capped at 100 pairs (five 20-row
      chunks) and is unavailable when no optional fields are enabled. A new
      target atomically/idempotently creates its default-settings dictionary and
      queued job; enqueue failure rolls both back, while later cancel/failure/
      discard leaves the visible empty dictionary. The format reuses bounded batch chunking, proposal,
      conflict, cleanup, and atomic selection semantics without changing
      `pasted-terms:v1`.
    - Rollout: deterministic import/export stays available independently; AI
      enqueue remains capability-gated until API/worker/rollback-floor lifecycle
      and budget compatibility include the new format.

- D-22 — Spreadsheet-safe export profiles
    - Context: RFC 4180 quoting preserves delimiters and line breaks but does not
      prevent spreadsheet formula execution.
    - Choice/rationale: every user-controlled CSV cell whose first code point
      after leading Unicode whitespace is `=`, `+`, `-`, or `@` receives one
      leading ASCII apostrophe before RFC 4180 quoting. Ordinary Quizlet CSV is
      safe but intentionally not byte-round-trip exact. Full Languon CSV v1 also
      escapes literal leading apostrophes and emits a paired boolean escape flag
      for every user-controlled field, so one prefix can be removed
      unambiguously. Third-party import never strips apostrophes and no `sep=`
      directive is emitted or accepted. Quizlet copied text is not a spreadsheet
      format; embedded tab/CR/LF in its core fields normalize to spaces with an
      explicit warning so tab/newline separators stay Quizlet-compatible.
      Full Languon CSV v1 starts with a fixed header and exactly one
      `record_type=dictionary` metadata row, followed by active-card rows. The
      metadata row preserves name/description with escape flags, language pair,
      and dictionary settings even for an empty dictionary; card rows use
      1-based position, `inherit` for null overrides, and contain values, raw
      overrides, effective settings, and authorship but no IDs, timestamps,
      share/job/actor data.

- D-23 — Bounded snapshot export and browser streaming
    - Context: a legal 10,000-card full export can exceed 250 MiB; server streams
      are insufficient if the bearer-only web client later builds one Blob.
    - Choice/rationale: export reads active cards in `(sort_key,id)` order from
      one bounded repeatable-read snapshot, serializes bounded chunks under a
      320 MiB hard ceiling, a 15-minute deadline calibrated above the full
      envelope at 512 KiB/s, prompt cancellation, and fixed safe download,
      no-store, no-referrer, nosniff headers. The browser pipes `response.body`
      to the File System Access API when available; a separately bounded fallback
      is offered only for smaller exports. Quizlet copied text is capped low
      enough for explicit clipboard use. No owner/share/search/job/actor metadata
      leaves the backend.

## Discoveries

- The repository has no product persistence beyond users/auth/admin and no
  existing vocabulary or generic asset concept to migrate.
- Canonical Mastra composition exists, but product agents and durable Mastra
  memory/jobs do not. Dictionary jobs must not repurpose the playground.
- S3-compatible code is backup-only. Product uploads require isolated credentials,
  lifecycle, and local disposable verification rather than reuse of backup paths.
- ADR-0009 fixes four immutable image identities. A worker can reuse the backend
  image with another command, but Compose, readiness, capacity, drain, and local
  rehearsal still change and require a new approved topology ADR.
- The prior UI design source contained the required primitives but excluded
  dictionary patterns. M0 added reusable authoring, compact, public/fork,
  proposal, batch, and document states; runtime implementation remains M1–M5.
- Capability URLs, durable job overlap, direct-upload replay, and adversarial
  document parsing required explicit cache, version, fencing, quota, retention,
  and worker-local sandbox contracts before implementation could safely begin.
- Quizlet's official flow is text interchange. Direct URL/account integration is
  neither required nor safe to assume.
- The approved product text referred to a curated language catalog without
  enumerating it. M1 records a reversible version-1 starter set in `FEATURE.md`;
  later catalog additions do not require persistence migration.
- Authentication E2E cannot share a long-lived production-equivalent rate-limit
  namespace across repeated synthetic signup runs. A per-invocation hashed
  namespace isolates only test keys, preserves expiry and production limits,
  and avoids destructive Redis flushes.
- A `Promise.race` timeout must be cancelled when the useful worker shutdown
  operation wins. Otherwise Node retains the losing 295-second timer and Docker
  consumes the entire grace period even after leases and connections are gone.
- A rehearsal manifest that reuses immutable images must retain their baked
  source SHA. Release identity/workflow metadata may change, but static admin
  readiness correctly rejects a manifest that claims a different image revision.
- The current `main` design canvas replaced the earlier design-system component
  identities, so the historical M0 dictionary boards cannot be safely appended as
  raw nodes without broken references. M2.5 will recompose them against the
  current reusable symbols while preserving the feature requirements and using
  the pre-merge boards only as visual/product input.

## Validation

| Check                       | Status | Evidence                                                                                                   |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Feature artifact generation | Passed | `pnpm feature:new -- dictionary-platform "Dictionary Platform"`                                            |
| Artifact format             | Passed | Repository `pnpm format:check` after M0 remediation                                                        |
| Documentation validation    | Passed | 16 guide-validator tests and eight current mappings                                                        |
| ADR/index/local links       | Passed | ADR sequence/index and relative-link checks recorded in `EVIDENCE.md`                                      |
| Runtime UI composition      | Passed | M2.6 shared-kit implementation, responsive browser evidence, and independent re-review                     |
| M0 independent review       | Passed | Architect, product-owner, tester, and security-reviewer approved the remediated M0 contract                |
| Unit                        | Passed | Languages 3, contracts 47, prompts 4, backend 448, web 122                                                 |
| Integration                 | Passed | Disposable PostgreSQL migrations 5/5, batch 11/11, repository/document 25/25, MinIO 1/1                    |
| Contract/HTTP               | Passed | Shared schema tests plus composed owner/public/fork HTTP integration                                       |
| E2E                         | Passed | Six mapped Chromium journeys through optional-AI import review and formula-safe export                     |
| Browser/device              | Passed | M1 plus M2 agent-browser acceptance and 320 px/200% responsive checks                                      |
| Typecheck                   | Passed | Languages, contracts, backend, and web                                                                     |
| Lint                        | Passed | Languages, contracts, backend, and web                                                                     |
| Build                       | Passed | Package, backend/web production, and Storybook builds                                                      |
| Database migration          | Passed | Additive migrations 0008–0017, classification, clean/rerun/concurrent/overlap verification                 |
| Worker/deployment           | Passed | Fencing, privilege, expand/activate/retire, overlap, full rehearsal, rollback, and shutdown evidence       |
| User-flow guide             | Passed | Current canonical guide synchronized, indexed, and validated                                               |
| Related guide inspection    | Passed | `web-ui-kit`, `mastra-agent-development-harness`, `release-deployment-platform` synchronized on 2026-08-21 |
| User-flow E2E               | Passed | Dictionary, Mastra harness, and release mappings plus all six dictionary scenarios                         |
| Final implementation review | Passed | M1–M6 approved after remediation with no waived material finding                                           |
| Final security review       | Passed | Enabled deterministic/runtime release approved; external production activation gates remain fail-closed    |

Detailed implementation evidence belongs in [EVIDENCE.md](./EVIDENCE.md), not
in this table.

## Remaining work

- No feature implementation or verification work remains.
- Live provider and document-production activation stays intentionally disabled
  until the provider privacy/cost review, product-storage conformance, immutable
  scanner configuration, parser confinement/resource proof, and live OCR policy
  recorded in `EVIDENCE.md` pass. Those are future rollout prerequisites, not
  incomplete deterministic feature behavior.
- Preserve the current capability-overlap, drain, cleanup, and observability
  contracts when a later approved release enables any production format.
