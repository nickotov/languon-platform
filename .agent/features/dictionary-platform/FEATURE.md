# Dictionary Platform

Status: Complete — M0 through M6 implemented, reviewed, and verified
Owner: Engineering
Created: 2026-08-21

## Problem

Languon has no user-owned vocabulary model or journey. A learner or tutor cannot
define a language pair, create a dictionary, author structured vocabulary cards,
share a read-only set, fork another user's set, or use AI and imports to prepare
cards. Later workbook, lesson, course, grammar, translation, and exercise
features need stable vocabulary identities they can reference without turning
all learning content into an unvalidated polymorphic JSON payload.

The capability crosses PostgreSQL schema and migrations, authenticated ownership,
anonymous public reads, shared contracts, backend DDD modules, public-web FSD
slices, design-source changes, Mastra agents, persistent background work, private
uploads, malware scanning, OCR/model providers, deployment topology, and external
interchange. It therefore needs one durable specification and an ExecPlan that
can be implemented and verified incrementally.

## Desired behavior

### Dictionary and card model

An authenticated user can list, create, open, edit, archive, and restore personal
dictionaries. A dictionary has a required name, optional description, one source
language, one distinct target language, ordered cards, visibility, and inherited
card-field settings. Source and target use canonical BCP 47 tags from an
expandable curated catalog. The language pair can change only while the
dictionary has no cards.

The version-1 catalog uses neutral canonical tags for Arabic (`ar`), German
(`de`), English (`en`), Spanish (`es`), French (`fr`), Hebrew (`he`), Hindi
(`hi`), Italian (`it`), Japanese (`ja`), Korean (`ko`), Polish (`pl`),
Portuguese (`pt`), Russian (`ru`), Turkish (`tr`), Ukrainian (`uk`), and
Simplified Chinese (`zh-Hans`). Display names are localized for all four
interface locales, and the catalog records left-to-right or right-to-left text
direction. Adding another supported tag is a package/catalog release, not a
database migration.

A dictionary card belongs to exactly one dictionary. It has one required source
word or phrase and one required translation. It may also contain one
transcription, one definition, one contextual example, and the example's paired
translation. Enabled optional fields may remain empty. Disabling a field keeps
its value inactive rather than deleting it.

Dictionary settings control whether transcription, definition, contextual
example, and example translation are enabled. Definition and example languages
are stored as `source` or `target` roles relative to the dictionary pair; an
example translation always uses the opposite role. A card's advanced settings
may enable or disable inherited optional fields and override applicable language
roles and transcription notation. Transcription notation is IPA, romanization,
or a bounded custom label.

New dictionaries enable the source/translation pair plus a source-language
contextual example and target-language example translation. Transcription and
definition start disabled. Cards may repeat normalized source terms because
separate senses and contexts are valid; creation and import surfaces warn about
duplicates instead of merging or rejecting them.

Current card content remains in typed relational columns suitable for validation,
search, and indexing. Immutable schema-versioned card revisions preserve
content/settings snapshots for optimistic conflicts, provenance, and future
recovery. Revision and temporary proposal JSON is not a generic learning-asset
model and is never the query source for current card content.

### Ownership, public reading, and forks

Each dictionary has one user owner in this feature. `private` dictionaries are
owner-only. `unlisted` dictionaries are anonymously readable through a
high-entropy rotatable capability URL but are not searchable or indexed by
Languon. Public responses expose no private owner data.

Capability pages and APIs are never stored in shared, static, ISR, or browser
caches and use `Cache-Control: private, no-store` plus `Referrer-Policy:
no-referrer`. Dictionary/card fields and all model-supplied warnings, reasons,
and alternatives are plain text rendered as inert text nodes; v1 supports no raw
HTML or Markdown rendering.

A signed-in reader can fork an unlisted dictionary. Forking creates a private,
independently owned dictionary with new card identities and copies the current
settings, active cards, preserved inactive values, order, and authorship. It
keeps a safe source-dictionary reference for provenance but never creates shared
mutable cards. Source edits do not update a fork.

Archiving a dictionary revokes public access; restoring it returns it as private.
Archived cards are omitted from ordinary reads, public views, forks, AI inputs,
and exports. Permanent purge, collaboration, and discoverable publication are
out of scope.

Future workbooks, lessons, courses, and exercises embed dictionaries or cards as
live references through explicit foreign-key link tables. They do not require a
generic `asset(type, payload)` table. A later publication feature may snapshot a
specific referenced revision without changing dictionary/card ownership.
The consuming module must authorize a live reference at link creation and every
dereference; a foreign key or unlisted capability never becomes cross-owner
authority. Archive or revoked access makes a live link unavailable unless a
separate authorized publication snapshot exists.

### Authorship and card revisions

Every current card exposes system authorship rather than a removable `ai` tag:

- `human` — created manually or imported deterministically without model output;
- `ai-generated` — created wholly from accepted AI output and never content-edited
  by a human;
- `mixed` — human content was transformed by AI, or AI output was edited before
  or after acceptance.

Forks preserve current authorship. Reordering, archiving, and inherited
dictionary-setting changes do not change it. Content or card-override changes
create immutable revisions. The server computes transitions by comparing
trusted stored snapshots; clients do not select authorship directly.
Lifecycle and order remain typed, versioned current state but do not append
content revisions; their audit history is outside the M1 revision contract.

Authorship transitions are deterministic:

| Mutation                                                    | Prior `human` | Prior `ai-generated` | Prior `mixed` |
| ----------------------------------------------------------- | ------------- | -------------------- | ------------- |
| Manual content or card-override edit                        | `human`       | `mixed`              | `mixed`       |
| Accept changed, unedited AI proposal                        | `mixed`       | `ai-generated`       | `mixed`       |
| Accept human-edited AI proposal                             | `mixed`       | `mixed`              | `mixed`       |
| Reorder, archive/restore, inherited setting change, or fork | preserve      | preserve             | preserve      |

A new manually authored or deterministic-import card is `human`; a new
untouched AI candidate is `ai-generated`; an edited AI candidate is `mixed`.
Accepting a proposal whose values and overrides are semantically identical to
the current card is a no-op: it marks the job accepted without changing the
card version, revision history, or authorship.

### Single-card AI regeneration

From an owned card, a user can enqueue AI regeneration with an optional bounded
custom instruction. The agent receives structured dictionary settings, language
roles, notation, current values, and version metadata. It fixes language errors,
adds articles when appropriate, fills empty enabled fields, and may return up to
three alternatives per relevant field.

Model output is an untrusted proposal, never an in-place mutation. A persisted
job survives navigation and reload. The web shows the original and an editable
candidate side by side with warnings, reasons, and alternatives. The user can
edit the candidate and atomically accept it, discard it, cancel work, or start a
new regeneration with another prompt. Acceptance fails with a recoverable
conflict when the card or dictionary settings changed after the input snapshot.

### Pasted-term generation

Inside a dictionary, a user can paste text representing at most 100 words or
phrases and add optional shared context such as art or ecology. An AI job splits
the input, preserves meaningful order, enriches cards according to resolved
dictionary settings, and returns bounded structured candidates.

Generated cards are not saved immediately. The user can inspect progress,
review valid candidates, see row-level failures and duplicate warnings, edit or
remove rows, retry applicable failures, select cards, and commit the selection
atomically. Untouched candidates become `ai-generated`; user-edited candidates
become `mixed`. Commit compares the dictionary and settings versions plus the
trusted source/target pair captured at enqueue; a legal empty-dictionary pair
change produces a recoverable conflict and saves no candidate.

### Document and OCR generation

A user can upload a document containing explicit terms to translate and provide
an optional custom instruction. This iteration does not discover interesting
vocabulary from arbitrary prose.

Document ingestion accepts source-language term lists only. A term is one
non-empty Markdown/DOCX list item or non-heading paragraph, single-column table
cell, or plain-text/PDF/OCR line representing one word/phrase with 1–200 Unicode
code points after trim and control-character rejection. Markdown list markers
and numbering are removed; structured Markdown/DOCX headings and blank lines are
ignored. Plain text, PDF, and OCR do not guess headings: every non-empty line is
one candidate. A row/paragraph is never split into inferred vocabulary; prose
within the limit remains one phrase, while an over-limit item is a row failure.
Multi-cell source/translation pairs are not reinterpreted and are directed to
the Quizlet/CSV import flow.
Invalid rows remain reviewable failures. A document with no logical terms after
ignored headings and blank lines finishes with a recoverable `no_terms_found`
result; a document containing only invalid logical terms publishes a bounded
failure-only review. Neither outcome retains the original or raw extraction.

Accepted formats are TXT, Markdown, DOCX, text or scanned PDF, PNG, JPEG, and
WebP. A file is limited to 20 MiB and 100 pages, with bounded decompressed size,
pixel count, and extracted text. Password-protected, macro-enabled, active,
unsupported, malformed, oversized, or unsafe files are rejected.

Uploads use private S3-compatible product storage separated from backup storage.
They must pass fail-closed malware scanning before parsing. Native text is used
when available; scanned pages and images go through a provider-neutral
vision/OCR port. Extracted terms then use the batch proposal/review flow.
The same dictionary/settings/pair snapshot conflict applies before document
candidates can be committed.

Original uploads and raw custom prompts are transient. Terminal processing
deletes them where possible, and a cleanup worker removes abandoned artifacts
within 24 hours. The application stores only bounded safe metadata, warnings,
job state, and reviewed proposal data.

### Quizlet interchange

Users can paste Quizlet export text or upload bounded UTF-8 CSV/TSV. Deterministic
parsing supports explicit delimiter and column preview, quoted fields, BOM and
common line endings, row errors, duplicate warnings, and capacity checks. The
feature never scrapes Quizlet URLs, requests Quizlet credentials, or depends on
an undocumented Quizlet API.

An import can create a new dictionary or add to an existing compatible
dictionary. Without AI, accepted cards are `human`. With optional AI enrichment,
parsed pairs enter the same review/job workflow and accepted cards are `mixed`.

Exports include active cards in current order as Quizlet-compatible copied text,
an RFC 4180 UTF-8 source/translation CSV, and a full Languon CSV containing the
language pair, settings, optional values, effective overrides, order, and
authorship. Quizlet-compatible output explicitly omits advanced fields.

### Scale, security, and operation

The initial architecture supports 10,000 active cards per dictionary through
cursor pagination, bounded bulk operations, indexed ordering, and controlled
export/fork work. Public and authenticated endpoints have explicit body,
collection, concurrency, and rate limits.

M1 admission also caps each owner at 100 retained dictionaries, 50,000 retained
cards, and 250,000 immutable card revisions. Active and archived rows both count
because archive is recoverable storage, not deletion. Create, fork, and edit
transactions lock the owner budget and fail atomically with the stable
`owner_capacity_exceeded` result before adding rows. These deliberately generous
safety ceilings bound account-driven storage amplification until a separately
designed purge/retention journey exists; support must not bypass them with direct
row deletion.

Generation admission also enforces transactional per-owner and global queued-job,
pending-upload-byte, in-flight-provider, and bounded cost budgets, with fair
leasing and circuit breakers. A request that exceeds a budget fails before
storage/provider work with a stable retry/capacity result; cleanup remains
available while admission is closed.

AI and document work executes in a separate worker process built from the
backend image. PostgreSQL is the durable queue and uses leases, heartbeats,
idempotency, cancellation, bounded retries, and sanitized failure categories.
Model, OCR, object-storage, scanner, and prompt SDKs remain behind infrastructure
ports. Tests use deterministic adapters and never invoke paid or nondeterministic
services.

No logs, traces, metrics, or durable evidence contain raw prompts, card content,
documents, share tokens, or unnecessary personal data. Operational signals cover
queue age/depth, outcomes, durations, retries, cost/token counters, scanner/OCR
failures, cleanup lag, and capacity errors without user content.

## Acceptance criteria

- [x] AC-1 — The shared language catalog exposes the approved canonical BCP 47
      tags and localized display metadata without requiring a database migration
      to add a supported tag; dictionary source/target tags are distinct and lock
      after the first card.
- [x] AC-2 — An authenticated owner can list, create, open, edit, archive, and
      restore dictionaries with explicit-save, optimistic-conflict, pagination,
      loading, empty, validation, failure, retry, and accessible responsive states.
- [x] AC-3 — An owner can add, edit, archive, restore, search, and reorder up to
      10,000 cards; required and optional values, defaults, inactive-value
      preservation, example pairing, notation, and symmetric card overrides obey
      the approved invariants.
- [x] AC-4 — Current dictionary/card state is relational, typed, constrained,
      indexed, and owner-isolated; immutable card revisions cover content,
      overrides, resolved settings, and provenance, while no generic JSON asset
      becomes the vocabulary source of truth.
- [x] AC-5 — Anonymous users can read only unlisted dictionaries through opaque
      capability links, cannot enumerate private/archived content or owner data,
      and receive accessible no-index public pages.
- [x] AC-6 — A signed-in reader can idempotently fork an unlisted dictionary into
      an independent private copy with new IDs, preserved active content/order/
      settings/authorship, safe provenance, and no later shared mutation.
- [x] AC-7 — Card authorship and revisions follow the approved `human`,
      `ai-generated`, and `mixed` transitions and cannot be selected or removed by
      clients.
- [x] AC-8 — Single-card AI regeneration uses a persisted, cancellable,
      schema-validated proposal; reload, edit, alternatives, discard, regeneration,
      atomic acceptance, and stale-version conflicts do not mutate the source
      card unexpectedly.
- [x] AC-9 — The background worker safely leases and resumes jobs, limits user and
      provider concurrency, handles cancellation/retry/shutdown, exposes sanitized
      capability/status responses, and does not make API readiness depend on a
      live model provider.
- [x] AC-10 — Pasted input produces at most 100 ordered review candidates with
      bounded context, progress, per-row warnings/failures, duplicate detection,
      editing/selection, correct authorship, capacity enforcement, and atomic
      commit.
- [x] AC-11 — Document ingestion accepts only the approved formats and limits,
      uses private storage, fail-closed malware scanning, bounded parsing and OCR,
      explicit-term extraction, review-before-commit, cancellation, and verified
      transient-data cleanup.
- [x] AC-12 — Quizlet text/CSV/TSV import supports new or existing dictionaries,
      deterministic preview and no-AI import, optional AI review, malformed-row
      recovery, duplicate/capacity warnings, and no credentials, scraping, or
      undocumented API dependency.
- [x] AC-13 — Quizlet-compatible text/CSV and full Languon CSV exports preserve
      active order, quoting, Unicode, line breaks, and safe spreadsheet handling;
      omitted advanced data is clear and export remains bounded at 10,000 cards.
- [x] AC-14 — Future workbook/lesson/course/exercise modules can reference stable
      dictionary or card IDs through explicit link tables without changing current
      dictionary/card persistence or introducing shared mutable fork content.
- [x] AC-15 — Shared contracts, Hono/OpenAPI operations, DDD/FSD/package boundaries,
      design source, all four UI locales, correct mixed-language accessibility
      metadata, cancellation, and stable error shapes remain synchronized.
- [x] AC-16 — Expand-compatible migrations, worker/storage/scanner deployment,
      feature capability gating, observability, operations documentation, and
      rollback compatibility satisfy accepted ADR-0002 and ADR-0009 plus the new
      approved dictionary/worker ADRs.
- [x] AC-17 — Required unit, contract, PostgreSQL, worker, parser, component, E2E,
      browser, migration, deployment, correctness-review, and security-review
      evidence passes without paid model calls or unsafe shared infrastructure.

## Scope

### In scope

- Public web, backend, shared contracts/language/prompt packages, PostgreSQL,
  Mastra composition, background worker, product object storage, malware scanner,
  document parsers/OCR port, deployment/configuration, design source, user-flow
  documentation, E2E traceability, and operational evidence.
- Private and unlisted dictionaries, anonymous reading, signed-in forks, complete
  personal dictionary/card CRUD, single-card AI proposals, pasted batch proposals,
  explicit-term document/OCR proposals, Quizlet import/export, full Languon CSV,
  authorship, revisions, archive/restore, search, and reorder.

### Out of scope

- Native mobile or admin UI; collaborative/co-editor permissions; user/workspace
  ownership transfer; public discovery/search/ranking/moderation; comments,
  ratings, licensing UI, or marketplace behavior.
- Permanent purge/account erasure, revision-history UI, automatic fork syncing,
  linked cards across dictionaries, or generic learning-resource persistence.
- Study modes, spaced repetition, exercises, course/workbook/lesson schemas,
  published snapshots, media/audio/image card fields, multiple accepted
  translations/definitions/examples, or arbitrary prose vocabulary discovery.
- Retained user documents, HEIC/TIFF/archive/password-protected/macro documents,
  direct Quizlet URL/account integration, OAuth to Quizlet, OCR vendor selection,
  billing, subscriptions, or end-user AI quota purchasing.

## Constraints and risks

- Accepted ADR-0001 governs authenticated user/session identity; dictionary
  authorization must derive user IDs from verified server-side claims.
- Accepted ADR-0002 governs module-owned Drizzle schema, committed migrations,
  disposable verification, and expand/migrate/contract rollout.
- Accepted ADR-0005 governs web FSD; accepted ADR-0016 governs runtime UI-kit
  authority and makes design artifacts optional references.
- Accepted ADR-0009 governs immutable images, blue/green compatibility,
  readiness, migration ordering, and deployment evidence. A new worker service
  must extend rather than silently contradict that topology.
- Public links, HTML rendering, SQL, external model calls, uploads, parsing,
  scanner/OCR services, CSV, storage credentials, and raw user content require
  independent security review.
- The worker and upload topology is a strategic infrastructure/cost decision
  approved by the user on 2026-08-20; record it in a new accepted ADR before
  implementation changes production composition.
- Model/OCR credentials may be unavailable in local or CI environments. Product
  capability endpoints must fail closed while deterministic adapters provide
  complete automated verification.
- Parser and OCR dependencies process adversarial input. Keep them in the worker,
  reject excessive decompression/page/pixel/text work, and fail closed when the
  scanner is unavailable.
- Existing dictionary boards are optional composition references. Runtime UI
  work proceeds from shared primitives, semantic tokens, accessible behavior,
  stories, tests, and browser evidence under ADR-0016; no separate design-source
  approval gate applies.

## User-flow documentation

- Required: yes; this feature adds browser, API, and system journeys.
- Canonical guide: `docs/user-flows/dictionary-platform.md`.
- Planned E2E file: `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- Planned stable scenarios:
    - `owner-creates-edits-and-restores-dictionary`
    - `anonymous-reader-forks-unlisted-dictionary`
    - `card-ai-proposal-survives-review-and-conflict`
    - `batch-generation-review-commits-selected-cards`
    - `document-generation-cleans-original-and-commits-final-review`
    - `quizlet-import-and-export-round-trip`
- Related current guides:
    - `docs/user-flows/web-ui-kit.md` when `design/**` or shared primitives change.
    - `docs/user-flows/mastra-agent-development-harness.md` when canonical Mastra
      composition, prompt packages, or Studio registration behavior changes.
    - `docs/user-flows/release-deployment-platform.md` when worker, object storage,
      scanner, image commands, Compose, readiness, or operational behavior changes.
- Use `$user-flow-e2e` when creating the canonical guide and whenever any related
  guide's test-relevant content changes. Keep new guides `draft` until their real
  mapped journeys exist and execute successfully.

## Open decisions

- None. Product, ownership, inheritance, authorship, AI review, scale, upload,
  OCR, Quizlet, client, and rollout defaults were approved in the planning
  conversation on 2026-08-20. Provider/model and managed-environment credentials
  remain runtime configuration, not product behavior decisions.
