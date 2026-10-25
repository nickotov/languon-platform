---
feature: sentence-practice-backend
title: Sentence practice backend
status: current
last_verified: 2026-10-22
surfaces:
    - api
    - system
source_paths:
    - apps/backend/src/modules/speech/**
    - apps/backend/src/modules/learning/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/src/config/environment.ts
    - apps/backend/src/config/ai-generation-environment.ts
    - apps/backend/src/config/api-environment.ts
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/drizzle/**
    - packages/contracts/src/learning/sentences.ts
    - packages/contracts/src/learning/sentence-library.ts
    - packages/contracts/src/learning/sentence-preparation.ts
    - packages/prompts/src/local/sentence-*.ts
    - infra/deploy/sql/*worker-role.sql
e2e_command: sentence-practice-backend
e2e_tests:
    - apps/backend/tests/integration/modules/learning/sentence-practice.journeys.test.ts
e2e_scenarios:
    - generate-check-reuse-private-and-shared
    - manage-saved-library-and-partial-preparation
related_features:
    - ai-accounting
    - shared-pronunciation-playback
    - user-ai-model-preferences-backend
    - flashcard-training-backend
    - ai-credit-wallet
    - dictionary-permanent-deletion
    - profile-account-controls
    - sentence-library-management
---

# Sentence practice backend

## What this verifies

Owner and authenticated shared-reader sentence practice uses current dictionary
entries, personal completion and exposure, bounded typed jobs, pinned model choice
and shared credit/provider capacity. AI checking is the default paid action.
Explicit reference reveal is a free personal manual review, without an AI grade.
Ordinary exercise and job responses keep the reference answer private. Existing
sentence practice UI is delivered. The contextual-hint, free-comparison and results
extension has its returned practice UI implemented and browser-verified; Git
integration remains tracked separately. See
the [implementation plan](../sentence-practice-implementation-plan.md) and the
[extension plan](../sentence-practice-assistance-implementation-plan.md).
Saved-example management and durable full-dictionary preparation are backend-first
extensions. Their new web/admin interfaces remain deferred until the returned
designs are selected; this guide verifies the API/system behavior, not those interfaces.
See the [sentence library plan](../sentence-library-implementation-plan.md).

## Start the development environment

Use Node 24 and the repository pnpm version. Ordinary local startup is documented
in README: start PostgreSQL/Redis/MinIO with `pnpm dev:infra`, apply reviewed migrations
with `pnpm --filter @languon/backend db:migrate`, and start with `pnpm dev`.
Use fake local accounts and dictionaries. Deterministic dictionary-worker fixture
mode does not advertise sentence generation/checking readiness and fails closed
for those provider calls; the composed sentence journey injects its own validated
counting provider. Sentence admission defaults on in development/test; use
`LEARNING_SENTENCES_ENABLED=false` to disable it locally. Staging/production default
off and require `LEARNING_SENTENCES_ENABLED=true` to enable the HTTP capability. Workers still drain
already admitted work when this flag is false. Configure managed text routing,
credit accounts and current capable worker observations before paid admission.
Do not put credentials, tokens, private prompts or share keys in logs.

For automated verification, provision a separate loopback PostgreSQL database named
`languon_auth_sentence_<purpose>_test` on a non-default port and Redis database 1–15
on a non-default port. Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
`AUTH_TEST_DATABASE_URL`, and `AUTH_TEST_DATABASE_CONFIRM` to that exact name;
set `ALLOW_DISPOSABLE_REDIS_TESTS=true`, `AUTH_TEST_REDIS_URL`, and
`AUTH_TEST_REDIS_CONFIRM` to the exact `host:port/database`. The safe runner has no
fallback target. It resets its owned fixture schemas and uses deterministic
providers, never paid models. Run `pnpm test:e2e:sentence-practice-backend`.

## API verification

1. Authenticate a verified fake learner, create a dictionary and at least one
   complete current entry. Prepare sentence learning in either direction. Confirm
   languages, available modes and personal progress; legacy flashcard capabilities
   retain their strict original shape.
2. Request Next in Saved first using an operation ID and session ID. An empty
   eligible saved pool admits a generation job; replay the same request and obtain the
   same job without another credit reservation. Poll only through live authority.
3. After deterministic worker completion, open the exercise. Source segments
   reconstruct the exact sentence, repeated target occurrences share a hint, and
   hints contain lexical mappings rather than the full reference answer. First
   exposure advances current entry coverage once; replay/opening again does not.
4. Submit a draft for AI checking. Retry the same operation and obtain the same
   pinned job. Completion saves the exact answer and validated feedback. Ratings
   follow server caps; valid morphology is allowed, missing required vocabulary
   caps the result below Good. A successful check records personal AI feedback,
   regardless of its grade; it does not exclude that exercise from later sessions.
   The provider must assess every required dictionary target exactly once; supporting
   hints are not additional grading targets. Highlight offsets are computed by the
   server from unique exact quotes in the unchanged answer, including Unicode
   grapheme boundaries. Repeated or unmatched quotes keep their issue and score
   impact without a highlight. Invalid assessments still fail closed.
5. On a different exercise explicitly reveal the reference. Confirm a reference
   and ungraded private manual review, separate manual statistics/history and no
   new job, reservation or provider call. Repeat with zero credits and unavailable
   current model: existing saved content still supports reference review. The
   draft remains available to the future client for comparison or later AI checking.
6. Saved first reuses valid saved exercises, including previously AI-checked or
   manually reviewed examples and their hints, before generating for words still
   missing in this round. Pass the current round's visited exercise IDs on Next.
   Each presented target counts once toward the selected-word round, including
   skipped sentences; no new generation is admitted once all eligible selected
   words have appeared. Review only never generates. New only bypasses saved
   selection and generates additively for the round's remaining words. Start a new
   round with empty visited IDs, even when lifetime exposure already covers every
   word. Older generations, personal progress and history remain reusable.
   Same-session reference assistance is captured at AI admission and does not
   penalize the AI score; manual review stays separate from AI feedback.
7. Enable unlisted sharing and authenticate another learner. Owner-created
   exercises are shareable; reader-created exercises and every attempt/manual
   review are creator-private. Rotate the share key or revoke access and confirm
   reads, replay, dispatch and publication fail without protected data disclosure.
8. For Repeat these exact examples, prepare with optional `replayExerciseIds`
   containing the whole previous sequence: one to 100 unique exercise IDs in
   review-only mode. Every requested exercise must be current, authorized and
   compatible with the selected dictionary, direction, languages and manual word
   scope. A bad item fails the entire preflight, not just that item. Request each
   exercise through Next's optional `replayExerciseId` in the retained sequence
   order. It returns that exact exercise or an error; no replacement saved example,
   job, reservation or provider call is allowed. Current authority is rechecked
   for each Next and on idempotent replay. The same operation with a different
   exercise conflicts; explicit replay fields in paid modes fail validation.

9. Start optional whole-dictionary preparation with a separate operation ID and
   initial practice scope. Preparation persists bounded partitions and a saved
   manifest. Generated preparation first reserves one total learner action budget,
   pins its tariffs/model/provider limits, and shares at most 10,000 output tokens
   and five calls across all child jobs, with at most one safe automatic retry.
   Review-only preparation has no AI hold. An unfunded Start fails before creating
   background work; replay never creates a second parent hold.
   Replaying the start returns the same preparation. A bounded batch-list query
   exposes every partition; its query rejects limits above 25. Background generation saves
   examples without recording exposure, completion or AI grades.
10. Stop after partial preparation and retrieve its retained ready coverage.
    Preview saved examples, translations and hints through the library without
    changing learning statistics. Archive selected examples personally, then
    verify a shared reader still sees owner-created shared content. Restore them
    using their current versions. Active library listings exclude personal and
    global archives by default; explicit archive filters support management.
11. Start practice using the prepared batch ID. It presents only the authorized
    prepared manifest, records exposure at presentation and does not regenerate
    ready New examples. Revoking or rotating shared access denies subsequent
    library and preparation reads. Administrative global archive and irreversible
    creator-archived deletion are verified through the admin boundary separately.

## System verification

1. Run the mapped journey against the owned disposable targets. It composes real
   authentication, routes, PostgreSQL persistence, Redis policy and a counting
   deterministic provider rather than mocking HTTP routes or storage.
2. Run focused real database store, capacity, credit and deletion checks. Verify
   concurrent replay/exposure, stale lease fencing, cancellations, invalid model
   output accounting and combined dictionary/sentence queue/running/provider usage.
3. Edit a contributing entry: saved content retires; authorized personal history
   reports it outdated. Permanently erase an unused copied candidate: all derived
   job input/exercise/answers/reviews disappear, including exercises using another
   target, while that surviving entry's content-free coverage remains.
4. Verify account purge cancels and drains actor work and other learners' work on
   owned dictionaries, deletes foreign personal records, and preserves established
   numerical accounting policy. Apply worker role grants after schema expansion;
   use restricted-role proofs, not migration-owner-only evidence.
5. Disable new admission and confirm capable workers finish or cancel existing
   work. Old workers cannot claim selected learning jobs or increase dictionary
   capacity during active/recent learning overlap without shared-capacity support.
6. With Russian source and French answer requested, return clearly reversed
   writing scripts from the deterministic provider. Confirm rejection and retry
   within the existing generation attempt/budget limit; only valid content is
   published. Existing wrong-script saved rows remain stored but are excluded
   from practice. Script checks tolerate ordinary names and borrowing and cannot
   identify which language is used when both languages share a writing script.
7. In the owned v2 fixture, verify additional whole-phrase hints are persisted and
   reused while required entry targets alone determine coverage and AI assessment.
   Legacy v1 examples remain usable without contextual enrichment. New v2 content
   requires at least one useful contextual hint and at most 40 extra hints; required
   hints remain bounded at three. AI check disclosure accepts all 43 hint IDs.
   Free reference review retains its existing authority and ungraded response.
8. Verify exact replay of a complete selected sequence, including an explicitly
   manually selected word outside the first dictionary batch. Confirm live
   version/visibility fences, fail-closed whole-list preparation and unchanged
   provider/credit counts with unavailable AI and zero credits. Session ordering
   belongs to the client; the existing routes provide exact identity reads without
   a new paid replay job, server cursor or comparison endpoint.

Preparation retains at most 20 content-bearing manifests per learner. Inactive
completed/failed/stale/access-lost manifests expire after seven days only when
child/provider work is settled. Resumable pauses remain available. Expiry keeps
safe operation identity while removing copied words and sharing digests; it never
removes saved examples. New preparation over quota returns capacity rather than
silently discarding work. Confirmation snapshots are bounded to five per
actor/dictionary and 25 per actor; older confirmations can become superseded.
All-matching operations exceeding 10,000 examples require narrower filters or
smaller selections. Saved reuse yields after each persisted 100-example page.

## E2E coverage

`generate-check-reuse-private-and-shared` covers real authenticated admission,
worker generation/checking, replay, reference redaction, personal shared-reader
manual work, free manual completion, zero-credit/unavailable-model review,
reuse after AI checking or manual review, finite five-word rounds, explicit fresh
rounds despite lifetime exposure, wrong-script rejection/retry and exclusion of
malformed saved content, and
separate statistics, plus version-two contextual-hint publication and legacy
compatibility. It also covers exact replay preparation/read, invalid sequence
preflight, paid-mode rejection, payload conflicts and no additional financial
work. Pinned-model selection, private reader generation, revoked
authority, assisted-check metadata and unchanged flashcard capability contracts
have focused lower-layer coverage. Domain and
contract tests cover structural hint/span validation and score rules. Real
PostgreSQL tests cover constraints, races, retention, erasure, leases, allocation
settlement and restricted worker roles. Browser evidence for existing provider
and credit screens remains in their own guides; feature 038's returned sentence
design is selected and its frontend browser verification is tracked separately.

`manage-saved-library-and-partial-preparation` covers real authenticated start
and replay, deterministic preparation worker publication, stop with retained
partial results, zero learning exposure before presentation, read-only translation
preview, selected personal archive/restore, another learner's unaffected shared
library, prepared New examples practice without another generation, and denied
library/preparation reads after share-key rotation. Real repository tests cover
whole dictionaries larger than a practice round, bulk snapshots, concurrent
mutations, one parent across multiple batches, total output exhaustion, idempotent
Continue, stale coordinator fences, unfunded Start, and content/access invalidation. Admin composed service/routes
and persistence tests cover administrative authority and permanent deletion; this
sentence API journey does not claim admin UI verification.

## AI action budgets and settlement

New generation and AI-check actions pin exact 0.001-credit customer budgets,
customer tariffs and provider cost revisions. Mandatory uncalibrated controls
fail closed. Internal integer thousandths are not display credits. At most one
safe automatic retry shares the action budget and 10,000-total-output-token
allowance across attempts; transport retries of the same operation are separate
from provider retries and cannot admit duplicate work.

Validated usable generation/check results are charged from eligible measured
usage. Technical/invalid/revoked-authority outcomes release the customer hold;
provider expense remains independently recorded. Explicit learner cancellation
is a stopped outcome, chargeable only from defensible usage within the hold.
Unknown measurement is not a full-hold debit and never becomes a surprise later
charge. Free saved-reference review and existing Free/unlimited exceptions
remain available under their established authority. See [AI accounting](./ai-accounting.md).

Whole-dictionary preparation is one learner authorization. Its background children
share the same pinned parent hold, input/output execution limits and provider-cost
allowance. A normal Resume preserves the active parent and its remaining budget.
When exhausted, expired after 15 minutes, or settled after Stop, the preparation
shows a budget pause and requires explicit Continue with a new budget. Continue
creates a separately confirmed authorization; previous action records remain
unchanged. An in-flight child is recovered through its lease before another child
can start. Already usable completed batches remain eligible for payment; a
technical failure contributes no customer usage. Review-only preparation never
creates an accounting action. The API checks reduced-allowance confirmation again
atomically, so another tab cannot silently consume a confirmed allowance.

## Expected failure and edge cases

- Disabled sentence capability, expired sessions, archived dictionaries, removed
  shares and stale entry versions fail without returning a protected reference.
- An exhausted wallet or unavailable model blocks new generation/AI checking;
  saved selection and explicit valid reference review remain free. An empty saved
  pool cannot manufacture a free reference. No error automatically reveals it.
- Combined queue/running saturation, excessive queue age or provider daily-budget
  pressure returns retryable `503 capacity_unavailable`, with `Retry-After`, rather
  than missing-content404. Existing valid free reference review remains available.
- Conflicting operation payloads fail rather than generating again. Content erasure
  invalidates old receipts; a replay cannot silently charge for replacement work.
- A sentence round contains at most 100 eligible words. The dictionary batch
  selects the first 100 eligible words in stable entry order; manual scope
  supports at most 100 selected IDs. Current-round visited exercise IDs also have
  a 100-ID limit. Sentence HTTP JSON retains its 32,000-byte bound. The dictionary's
  10,000-entry capacity and whole-dictionary lifetime progress remain unchanged.
  Over-limit practice payloads fail validation. Optional whole-dictionary
  preparation persists separate partitions of at most 100 words, including the
  intended first round; it does not expand the practice request limit or change
  provider budgets, admission rates or cost limits.
- Library preview is read-only; archiving retains saved content and numerical
  history. Personal archive does not affect other learners. Global archive blocks
  future selection for everyone. Outdated content can remain inspectable but is
  ineligible for practice. Already-admitted AI work may finish into history.
- Closing a preparation view does not stop durable work. Stop prevents new
  admissions and requests cancellation of the current child job; partial results
  remain saved. Stop settles eligible measured usage under that authorization.
  An exhausted/expired parent pauses with a budget reason; Continue requires a
  new explicit budget. A capacity pause may Resume only the still-active pinned
  authorization. Technical failures do not add customer usage. Stale entry versions
  require a refreshed preparation. Newly added words require a later preparation.
- Pending, cancelled, timed-out, retried and stale-fenced jobs never publish late
  results. Known provider expense is recorded even when generated content is invalid;
  the technical failure releases customer holds.
  Invalid sentence-generation output retries within the existing attempt and
  accounting limits; invalid AI-check output remains a terminal failure.
- Saved content must match the requested language tags and distinguishable
  writing scripts. Clearly reversed legacy examples are excluded without deleting
  their history; this validation is not universal language identification.
  Domain validation and saved-content SQL use the same Unicode letter ranges,
  including resolved writing scripts such as Thai and Armenian.
- Manual review has no percentage, rating or automatic correctness verdict. Valid
  translations can differ from the one reference; AI evaluates language quality.
  The frontend's free conservative comparison uses this existing authorized
  reference response and creates no backend correctness score or comparison job.
- Exact replay's optional prepare-list and Next-exercise fields are restricted
  to review-only mode and the existing 100-ID bounds. Current entry versions,
  direction, languages, scope and visibility are validated before returning
  content. Unsupported/stale/inaccessible IDs fail without paid fallback or
  substitution. Preparation verifies the whole list; it does not authorize
  subsequent reads after revocation. Legacy requests without replay fields keep
  their existing behavior and public response shapes.
- `LEARNING_SENTENCE_GENERATION_FORMAT` defaults to `sentence-generation:v1`.
  The backend release expands readers/workers/database support for v2 first;
  activate `sentence-generation:v2` only after compatible UI and rollback-floor
  worker processable formats are ready. The active immutable model configuration
  revision must support v2; create/activate a new revision rather than editing an
  existing pinned snapshot. The fixture explicitly selects v2. User development
  configuration and database are not changed by verification.
- Version-two jobs require policy2; version-one jobs require policy1. Saved public
  and relational policy versions must agree. Database constraints reject missing
  or mismatched versions. Contextual hints have no entry UUID and do not add
  coverage, mastery or AI target assessments. They disappear with the exercise
  under existing erasure rules. Unknown/disallowed worker formats cannot claim
  these jobs, regardless of supported model catalog capabilities.
- Revealing after an AI submission does not retroactively change its assistance
  metadata. Hints and reference assistance never reduce a valid AI grade.

## Automated regression checks

- `pnpm test:e2e:sentence-practice-backend` — owned PostgreSQL/Redis composed journey.
- `pnpm --filter @languon/contracts test` — public validation and privacy contracts.
- `pnpm --filter @languon/backend test` — deterministic domain/application tests;
  disposable integration tests require their explicit environment opt-ins.
- `pnpm docs:user-flows:check` and
  `pnpm user-flow:e2e -- check sentence-practice-backend` — guide traceability.
- `pnpm db:check` — generated migration consistency; deployment classification also
  checks the reviewed migration digest.

## Troubleshooting

For provider transport failures, worker diagnostics emit `Sentence provider request
failed.` with only an allowlisted provider/model, operation kind, fixed reason,
HTTP status, provider error code and safe SDK/network error identifiers when
available. They never include provider messages, response bodies, prompts,
answers or credentials. In particular, Kie can return HTTP 200 with an error
inside JSON: code 410 means the model was retired. This becomes the existing
terminal `model_unavailable` job failure, releases customer holds, and is not
retried automatically. The learner sees model-unavailable guidance and can open
AI preferences. Select a supported model; polling an already failed job does not
rerun it. A reachable HEAD probe cannot establish that a model still accepts
completion requests.

For `invalid_model_output` on a check, worker diagnostics now emit only the fixed
message `Sentence model output rejected.` with allowlisted `kind` and `reason`:
`input_invalid`, `schema_invalid`, `target_assessments_invalid`,
`answer_span_invalid`, `input_token_bound`, `usage_invalid`, or the fallback
`model_output_invalid`. No answer, prompt, reference, model output, user/job ID,
or error message is logged. The HTTP failure code and retry/accounting rules stay
unchanged; diagnostics do not retroactively explain an older failed job. Restart
the worker after updating code and submit a new explicit check rather than polling
the old terminal failed operation. Instrumentation failure cannot interrupt settlement.

A model-unavailable response requires matching fresh worker observations for the
requested format, selected execution, combined capacity and credit settlement;
an old selection-only observation is insufficient. Check configured model,
credentials and worker readiness without logging credentials. If credit admission
fails, inspect numerical account policy/reservations. If a previously valid shared
exercise disappears, check live share authority and current entry versions before
retrying. A migration digest mismatch on a disposable fixture needs an owned reset;
never apply that reset to a shared database.

## Cleanup

Stop only processes and containers created for the verification run. Remove fake
fixtures through supported APIs. The journey resets only its explicitly confirmed
owned test schemas and Redis database. Destructive resets are restricted to that
owned disposable target; ordinary development, shared, staging and production
infrastructure must remain untouched. Keep branches and source evidence for review.

## Related pronunciation capability

[Shared pronunciation playback](shared-pronunciation-playback.md) resolves saved
sentence sources through this module's live authorization. Prompt/library text,
explicitly revealed references and completed checked answers are playable; hidden
references, drafts and unchecked answers are not. Speech does not reveal answers,
record exposure or alter AI grades. A learner answer is spoken as written.

Source/account removal revokes bindings while successful speech derivatives remain
indefinitely under ADR-0031. The mapped sentence scenarios above retain their prior
baseline evidence; speech authorization, storage and settlement are independently
covered by the new shared guide and its disposable database checks.
