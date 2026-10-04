---
type: implementation-plan
title: Backend first AI model preferences and sentence translation practice
status: complete
created: 2026-10-04
updated: 2026-10-05
backlog_tasks:
    - BL-005
    - BL-004
    - BL-003
source_paths:
    - apps/backend/src/modules/dictionaries
    - apps/backend/src/modules/ai-credits
    - apps/backend/src/modules/learning
    - apps/backend/src/modules/users
    - apps/backend/src/modules/administration
    - apps/backend/src/infrastructure/worker
    - packages/contracts/src
    - packages/prompts
    - apps/web/src/fsd/pages/profile
    - apps/web/src/fsd/features/flashcard-training
  - apps/web/src/fsd/features/text-ai-preferences
  - apps/web/src/fsd/features/sentence-training
  - apps/web/src/fsd/widgets/dictionary-training
    - apps/web/src/fsd/pages/shared-dictionary
evidence: []
---

# Backend first AI model preferences and sentence translation practice

Implement the backend for [BL-005 model preferences](backlog/005-user-selectable-ai-models-done.md)
before the backend for [BL-004 sentence practice](backlog/004-ai-sentence-translation-practice-done.md).
Sentence attempts and coverage also deliver part of
[BL-003 personal progress](backlog/003-personal-learning-progress.md).
After both backends are implemented and verified, save two detailed, copyable
Magic Patterns design prompts. Stop until the user supplies the designs and
requests frontend implementation against selected design revisions.

This is the canonical planning baseline, not implementation evidence or an
accepted ADR. The user authorized implementation on 2026-10-04 after clarifying
cross-session reuse, fresh generation, retained exercises and display modes.
**Current checkpoint: both backends verified; selected design revisions are implemented
and verified in [feature 037](../.agent/features/037-sentence-practice-web/FEATURE.md).**
Verified model backend (`bcfda16`): [feature 035](../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md)
and [ExecPlan](../.agent/features/035-user-ai-model-preferences-backend/EXEC_PLAN.md).
Verified sentence backend (`8909424`): [feature036](../.agent/features/036-sentence-practice-backend/FEATURE.md)
and [ExecPlan](../.agent/features/036-sentence-practice-backend/EXEC_PLAN.md).

Documentation delivery is recorded in the
[planning record](../.agent/improvements/sentence-practice-delivery-plan.md).
Related context: [backlog index](backlog/INDEX.md),
[shared backlog constraints](backlog/README.md),
[existing flashcard delivery](flashcard-training-implementation-plan.md),
[design prompt index](design-prompt/README.md), and
[versioned design handoff rules](../.agent/DESIGN_HANDOFF.md).

## Verified backend and design checkpoint

Both backends are implemented and independently reviewed: feature035 provides
personal model preferences and pinned text execution; feature036 provides sentence
practice, typed work/accounting, personal AI feedback and free manual reference
review. Security and completion findings were remediated; detailed evidence lives
in the linked feature records. That backend checkpoint did not include frontend integration or production
enablement. The user subsequently authorized selected-design frontend delivery.

Copy these separate prompts into Magic Patterns:

- [Profile AI model preferences — v001](design-prompt/profile-text-ai-preferences.md)
- [Sentence practice — v001](design-prompt/sentence-practice.md)

Immutable snapshots, fingerprints and design-return slots are tracked in
[035 DESIGN.md](../.agent/features/035-user-ai-model-preferences-backend/DESIGN.md)
and [036 DESIGN.md](../.agent/features/036-sentence-practice-backend/DESIGN.md).
The user returned both designs on 2026-10-04 and requested bounded UI analysis.
Their provider v6 artifacts are pinned and relevant source/context is retained.
The authoritative scope inventories are
[model preferences](../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04)
and [sentence practice](../.agent/features/036-sentence-practice-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04).
Select only the Account modelPreference section and the sentence practice
journey. Exclude unrelated prototype shell/account/dictionary features and mock
services. Adapt feedback, free-reference access, retry semantics, history and
fullscreen behavior to the real contracts; replace the preferences placeholder.
Candidates are Ready for review; analysis alone does not assert visual fidelity
or frontend completion. No implementation target is selected for this
analysis-only request. At that checkpoint, Backlog003/004/005 remained in progress;
the verified frontend completion section below records the final disposition.

## Delivery phases and mandatory checkpoints

| Phase                    | Deliverable                                                                                     | Exit and next action                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0. Clarifications        | Updated product and technical planning baseline                                                 | Resolved; user requested implementation on 2026-10-04                                              |
| 1. Model backend         | Shared text-AI selection, preference APIs, dictionary routing and verification                  | Complete the backend-scoped feature and review; BL-005 remains non-terminal without profile UI     |
| 2. Sentence backend      | Saved exercises, durable generation/checking, personal attempts/coverage, credits and lifecycle | Complete the backend-scoped feature and review; BL-004 remains non-terminal without learner UI     |
| 3. Design briefs         | Two source-grounded prompts, state checklists and versioned handoffs                            | Save the documents, give the user copyable links, then stop for external design                    |
| 4. Returned designs      | Preserved Magic Patterns artifacts and selected revisions                                       | Read the supplied designs; proceed when the user requests implementation of the selected revisions |
| 5. Frontend continuation | Profile preference and sentence-practice UI using the returned designs                          | Verify behavior and fidelity, resolve reviews, synchronize backlog and evidence                    |

Use backend-scoped feature workspaces followed by frontend continuation
workspaces, as established by flashcard features 033 and 034. This allows each
verified backend feature to complete without prematurely marking its full backlog
task done. Each feature starts from current `main`, uses its own four records and
branch, and is squash-merged locally only after its scoped Definition of Done.
Preserve the existing local commit on `main`. Do not push or delete branches
automatically. Allocate feature numbers at implementation time; none are allocated
by saving this plan.

Backend completion does not authorize frontend code generation. Do not create a
temporary product UI or pre-implement controls while waiting for the designer.
Existing-app regression journeys and deterministic test fixtures are permitted
within backend verification; they are not substitutes for the later frontend.

## Product decisions and boundaries

- Deliver responsive web and backend; native mobile is outside scope.
- Either dictionary language can be the front/source language; translate into
  the other. Setup also offers an explanation-language choice, defaulting to the
  selected front/source language.
- Practise all eligible active entries or a manually selected subset. Respect
  effective language roles and current learning versions.
- Initially generate short, natural, grammatically complete sentences using
  simple grammar and one to three target entries plus common supporting words.
  Phrases and senses retain separate entry identities.
- Automatic practice serves eligible saved exercises the learner has never
  completed through a successful AI check or an explicit reference-answer
  reveal, then generates one new sentence when that pool is exhausted. A successful
  AI check counts regardless of score. A reveal counts as manually reviewed; a
  failed check or failed reveal does not complete the exercise. Setup offers three explicit choices: Saved first (default), New sentences
  (always request fresh generation), and Review saved (never generate). New
  sentences is available on every session, does not delete previous generations
  and does not reset vocabulary coverage or personal history.
- Owner-generated exercises are available to currently authorized dictionary
  readers. Reader-generated exercises are private to the reader. Answers and
  feedback are always personal; practice never changes owner content or progress.
- Highlight targeted expressions in the source sentence. Hover, focus or tap
  reveals normalized target-language hints; do not show the target list upfront.
- Normalize inflected content-word hints to lexical base forms, present verb
  hints in infinitive form, and omit standalone articles/auxiliary helpers.
  Preserve meaningful multiword expressions and the complete source sentence.
- Learners type freely. AI checking is the default and assesses meaning, grammar and required target
  vocabulary, accepts natural inflections and recognizes valid alternatives.
  A synonym can convey the right meaning without satisfying the target task.
- Show a percentage, quality rating, highlighted mistakes, explanations and an
  improved translation. Ratings: 100% Perfect; 80–99% Good; 50–79% Not bad;
  below 50% Practise again later. Missing required vocabulary caps the score at
  79%; substantive mistakes prevent Perfect.
- Track hint use separately without reducing the answer score.
- Generate and store a validated reference translation in the same generation as
  the source sentence and lexical hint mapping. Offer an explicit free Show
  reference answer action with no AI analysis. It works with zero credits for an
  already generated, currently authorized exercise. Reveal counts as manually
  reviewed for that learner and is separate from AI scores and ratings.
- Persist used/remaining coverage per learner, dictionary, direction and current
  entry learning version. Successful generation counts when its exercise is
  saved; reused content counts on first presentation to that learner. Count
  each learner/exercise once so generation followed by opening is not doubled.
- All successful generations remain separate saved exercises, not a replacement
  batch. They remain reusable under visibility, live access, content-version and
  deletion rules. New generation continues to prefer uncovered entries; after
  all selected entries are covered, prefer less-exposed entries without silently
  resetting coverage. Coverage means exposure, not proven mastery.
- Start practice in fullscreen from the Start gesture, with the existing
  flashcard-style viewport fallback when native fullscreen is unavailable.
  Provide Fullscreen and Dialog controls throughout practice. Switching retains
  the current exercise, typed answer, revealed hints, feedback, job IDs, position
  and statistics and triggers no generation/check request or additional charge.
- Meaningful edits retire linked exercises from practice while retaining
  authorized personal history. Permanent deletion removes content-bearing
  exercises, answers, feedback and job inputs.
- New generation and AI checking use the learner's existing credit policy and
  model preference. Stored content/feedback reads and reference reveals are free. Existing per-provider-
  attempt retry and settlement policy remains unchanged.
- Disabled, incompatible or unavailable selections fail with actionable errors;
  preserve the preference and never silently select a different model.

Exclude difficulty controls and learner-level personalization, grammar journeys,
manual exercise editing, weak-area practice plans, wallet purchases/starter grants,
new providers, TTS/OCR preferences and production activation. Leave a versioned
generation-policy seam for later difficulty/length and knowledge-level preferences,
without adding speculative settings or implementing BL-008 now.

### Behavior across sessions

If no eligible saved content exists, the first session generates exercises as
the learner advances; a first-time shared reader may already have owner-generated
content available. Partial generation is retained between sessions.

For example, with entries A, B and C, the learner generates an exercise for A
and one for B but only completes A (by AI checking or manual reference review). The next Saved first session offers
the saved B exercise, then generates new content prioritizing C. The previously
completed A exercise remains available in Review saved. If both A and B were
completed, Saved first proceeds directly to new generation prioritizing C.

Never infer that an entry is learned because a sentence was generated, opened or
checked or manually reviewed. Coverage controls generation variety; answer quality and hint use are
separate personal attempt data. Saved first does not automatically repeat already
completed exercises; the learner can select Review saved. Weak-area scheduling
remains a later feature.

New sentences bypasses saved selection on every Next, even on second or later
sessions. Keep every successfully published generation; it does not overwrite
older exercises, answers or feedback. A failed, cancelled or stale job is not a
saved exercise. None of the session modes bypass live access or deletion rules.

## Model preference backend

### Shared ownership and admission

Create a focused backend `text-ai` module for curated selection, platform policy
access, user preferences, immutable execution snapshots and trusted provider
resolution. Dictionary and learning modules retain typed jobs, prompts, agents,
results and orchestration. Keep SDKs, credentials and database implementations
behind infrastructure boundaries; no cross-app source imports or public generic
prompt-execution endpoint.

Public seams:

- Transaction-bound admission participant resolving user preference, capability,
  active configuration, budget and immutable execution information.
- Preference service for Auto/explicit reads and optimistic-version updates.
- Sanitized catalog read model with labels, enabled choices, supported
  capabilities, availability and relative input/output credit rates.
- Infrastructure provider resolver constructing adapters from pinned snapshots.

Auto resolves the single platform default at admission, not a different model
per task. Explicit selection validates the requested capability, enabled state,
credentials and existing worker readiness checks. Missing preferences mean Auto.
Preserve unavailable stored selections with an actionable status.

Reauthorize and resolve idempotent replay before consulting today's preference.
Changes affect new admissions only. Persist model/provider, adapter version,
limits and pricing on each new job; retries retain that snapshot. Historical
jobs continue through their original execution path and are not backfilled from
current preference or prices.

Existing configuration revisions pin one global default. Add versioned selected
execution snapshots without creating a global revision per user request. Update
all current dictionary text admission paths: card generation/authoring, pasted
terms, pair import and document-term generation. Move code ownership through
focused seams while retaining physical configuration tables where practical;
preserve admin authorization and atomic audit transactions.

Register reviewed capabilities in code. Later sentence generation/checking use
this seam; future grammar/exercise operations register their own capabilities
when implemented. Do not implement those future journeys just to finish BL-005.

### Public interfaces

Add Zod-derived model summary, preference and update contracts:

| API                                 | Behavior                                                 |
| ----------------------------------- | -------------------------------------------------------- |
| `GET /text-ai/models`               | Authenticated sanitized catalog and current Auto default |
| `GET /users/me/ai-model-preference` | Stored selection or Auto and version                     |
| `PUT /users/me/ai-model-preference` | Auto or curated model update with optimistic version     |

Expose no credentials, provider URLs, credential references or worker internals.
Use existing credit units and rate conventions; do not invent exact per-request
prices. Record the shared ownership and per-user routing decision in an indexed
ADR superseding only the relevant parts of ADR-0021 while retaining its trust,
immutability and compatibility guarantees.

## Sentence practice backend

### Typed persistence and contracts

Keep sentence models in `learning`, separate from flashcard schemas:

| Model                | Responsibility                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Exercise             | Saved source, protected reference translation, hints, direction, creator, visibility and generation-policy version |
| Exercise-entry links | Exact source entry identities and learning versions                                                                |
| Personal attempt     | AI-checked answer, feedback, score/rating, hint/reference assistance, session and operation identity               |
| Manual review        | Personal explicit reference reveal, exercise/session/operation identity and review time; no AI grade               |
| Personal coverage    | Usage by learner/dictionary/direction/entry/current version                                                        |
| Exposure marker      | Exactly-once coverage for each learner/exercise                                                                    |
| Learning AI job      | Generation/checking inputs, pinned execution, credits, leases and result references                                |

Use explicit foreign keys and indexed provenance. Include deletion provenance
for all content-bearing inputs, including unused generation candidates. Internal
reference translations are absent from ordinary exercise, generation-result and
job responses. Only explicit authorized reveal exposes the stored reference,
without a provider call or credit admission. Attempts and manual review records are readable
only by their learner. Do not introduce a universal exercise table, generic job
registry or detached learning-history archive.

Extend existing owner and shared learning prefixes:
`/learning/dictionaries/{dictionaryId}` and
`/learning/shared-dictionaries/{shareId}`.

| Relative operation                                        | Behavior                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /sentences/prepare`                                 | Validate direction, scope, explanation language and practice mode; return eligibility/saved-pool information          |
| `POST /sentences/next`                                    | Follow Saved first, New sentences or Review saved; return saved content, admit generation or report review exhaustion |
| `GET /sentences/jobs/{jobId}`                             | Authorized durable status/result                                                                                      |
| `POST /sentences/jobs/{jobId}/cancel`                     | Cooperative cancellation and existing credit settlement                                                               |
| `POST /sentences/exercises/{exerciseId}/checks`           | Admit checking of the exact answer                                                                                    |
| `POST /sentences/exercises/{exerciseId}/reference-answer` | Reveal the saved reference free of AI/credits and idempotently record a personal manual review                        |
| `GET /sentences/attempts`                                 | Paginated personal history                                                                                            |
| `GET /sentences/reviews`                                  | Paginated personal ungraded manual-reference history                                                                  |
| `GET /sentences/progress`                                 | Directional current coverage and attempt summary                                                                      |

Expose sentence availability through its separate capability contract; preserve
the legacy flashcard capability shape for strict existing clients. Reuse shared-key
transport, pagination and request bounds. Temporary queue, queue-age or provider
daily-budget pressure returns retryable503 `capacity_unavailable`, never missing
content404. Admission limits count combined queued plus running dictionary and
sentence work globally and per learner. Each new AI request uses a unique
operation ID; identical replay returns existing work and changed payloads conflict.
These paths belong only to engineering documents. **Do not copy them into either
portable design prompt.** Confirm final interfaces against implementation and ADRs.

### Selection, generation and checking

Saved-first selection reauthorizes the learner/dictionary, restricts visibility
and direction, requires every linked entry to remain active/current, fits all
targets within the selected scope and excludes exercises completed by AI checking or manual reference review,
plus current-session visits. The client tracks visited IDs locally; exclusions never confer authority.
Review uses valid saved content regardless of prior AI checks or manual reviews, least recently
practised first, and finishes without generation when its pool is exhausted.
New sentences bypasses saved selection and admits one fresh generation per Next
using the same unused/less-exposed priority and existing credit/model rules.
Published generations are additive; choosing this mode never replaces the saved
pool or clears personal progress.

If generation is needed, prefer unused entries then less-exposed entries; supply
a bounded candidate shortlist and require one to three targets including the
priority entry. Generate the reference translation in the same validated generation, not on reveal.
Construct a public-safe vocabulary projection; omit private
dictionary/card translation context even for owner-generated shared exercises.
After final live/version checks, persist validated exercise content, links and
creator coverage atomically.

Generate exact source segmentation and stable occurrence/hint IDs. Validate
sentence reconstruction, admitted target IDs, target presence and non-overlapping
renderable spans. Repeated words and phrases require explicit mappings rather
than client substring matching. Validate lexical normalization through language-
aware deterministic fixtures, preserving meaningful phrase components.

Checking receives the exact answer, current authorized exercise, target
expressions, explanation language and revealed hints. Validate structured meaning,
grammar, target assessment, corrections, explanations and percentage. Highlight
ranges must match the immutable answer and Unicode boundaries; omissions can
have global issues. Invalid output cannot become a completed attempt.

Derive rating labels/caps on the server. Each completed check is a separate
personal attempt. Edited rechecking is a new operation; transport retries retain
the old operation ID. Stored feedback is reopened without calling AI.

### Free reference review and default AI checking

AI Check answer remains the primary/default assessment action. Show reference
answer is an explicit secondary action available regardless of wallet balance,
model availability or AI worker readiness. Never reveal automatically after a
credit error or substitute manual review silently for a requested AI check.

A reference is one valid target-language translation, not the only acceptable
answer. Display the learner's retained draft next to the reference for comparison.
Manual review performs no exact-string pass/fail, percentage, grammar analysis,
correctness probability or quality rating. Do not label it AI checked or award a
synthetic score. Required target vocabulary still applies to the reference itself.

Generation validates and saves source, complete reference translation and target
hint mapping together. Revealing an existing exercise requires active identity,
current source versions and live owner/share authority, but does not resolve the
current model, require a credit balance, reserve/settle credits, enqueue a job or
call a provider. New generation still requires credits; zero-credit users can
practise and reveal existing authorized saved exercises. An empty saved pool does
not grant free generation.

Record manual reviews personally and idempotently by operation, exercise and
session. Successful reveal completes that exercise for the learner's Saved first
pool. Review saved can revisit it, and later paid AI analysis remains available.
Retries must not duplicate manual review counts. Reference reveal never increments
vocabulary exposure a second time, resets coverage or changes another learner's
completion. Retain the draft, hints and reference across fullscreen/dialog changes.

Separate AI attempts/ratings from manual-review events and totals in progress,
history and session summaries. Record reference disclosure separately from lexical
hint usage; AI analysis requested after revealing a reference in that session is
reference-assisted, without an extra score penalty. Manual review does not prove
mastery. Exercise retirement and permanent deletion apply to reference content and
manual records, with live authorization on replay and no stale-content disclosure.

Future assessment engine: Jev from TypeSafe AI is a researched candidate for
structured semantic judgments, separate from this implementation. Its official
[overview](https://docs.typesafe.ai/introduction) describes Choice, Score and Noul
primitives returning typed decisions/probabilities. Jev does not generate textual
feedback or reference translations. Its
[Choice documentation](https://docs.typesafe.ai/primitives/choice) distinguishes
option probabilities from confidence; neither is automatically our learner quality
percentage. The official
[model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) document
literal interpretation, adversarial-input and numerical-calibration limitations.

A later evaluation can ask separate meaning/grammar/required-target questions from
source, reference, answer and target vocabulary, then combine results in reviewed
server policy. Test multilingual valid alternatives, inflections versus synonyms,
ambiguous sentences, deliberate instruction injection, calibration and low-confidence
fallback. Keep numeric rating boundaries/caps in code. Generative feedback still
needs a generative model if explanations/corrections are required. No Jev dependency,
provider credentials, model choice, pricing, production integration or probability
conversion is part of the current feature. Research verified2026-10-04 from primary
documentation; live Jev calls were not made.

### Jobs, credits and compatibility

Run learning-owned workers in the established worker process topology, with
bounded scheduling, leases, fencing, heartbeat, timeout, cancellation and stable
provider idempotency. Revalidate authority/content before dispatch and publication.
Every result/terminal write verifies the lease/fence; save result and settle
credits atomically. No locks are held during external calls.

Extend reservations with a closed immutable job kind, defaulting old writes to
dictionary generation and explicitly identifying learning AI work. Resolve
authoritative fields from typed dictionary/learning jobs. Update both reservation
admission and deferred allocation/lifecycle guards, including owner, policy,
accounted state, attempts and maximum reservation. Kind-qualify replay/policy
queries; unknown kinds fail closed. Do not introduce permanent ledger FKs that
prevent eligible content erasure.

Shared readers use their own credits and preferences. Preserve reported/estimated
settlement and existing retry charging. Release undispatched reservations as
appropriate. Aggregate dictionary/learning admission usage so learning cannot
duplicate global budgets or concurrency allowances.

Use expand → capability preflight → activate → drain. Old workers must not claim
new selected-snapshot or learning job versions. Rollback disables admissions and
drains supported work; it does not rewrite pinned snapshots or drop retained data.
Do not enable production paid generation or credit enforcement as a side effect.

### Live authority, history and deletion

Reuse transactional live authorization for reads, admission, replay, dispatch
and publication. Capture only server-derived queued-work provenance and recheck
current sharing; never persist the raw share key or treat a job as indefinite
authority to read a dictionary.

- Meaningful entry edits retire linked exercises; retain history only under
  current authorization and identify outdated content.
- Archive hides exercises without destruction; unchanged restore makes valid
  content available again. Restore does not restore previous sharing.
- Share rotation/revocation immediately blocks reader access and queued results,
  including private reader exercises.
- Forks inherit no exercises, attempts or coverage.
- Deleting one entry removes every content-bearing exercise containing it,
  associated answers/feedback and eligible job inputs, without deleting unrelated
  exercises. Link cascades alone would leave deleted vocabulary in sentences.
- Join job cancellation, deletion-busy/quiescence checks, dictionary cleanup and
  explicit account purge of learning content on foreign dictionaries.
- Retain only permitted existing content-free credit accounting after erasure.

Create an indexed ADR for typed sentence content, personal state, live authority,
credit job kinds and lifecycle. Follow ADRs 0011, 0012, 0019, 0021, 0022, 0023 and
0024; a planning document does not override accepted constraints.

## Implementation refinements frozen before sentence delivery

- Keep the existing flashcard capability response unchanged: deployed clients parse
  it strictly. A separate sentence capability response advertises sentence support.
- Persist narrow Next receipts keyed by learner and operation. Saved selections,
  empty results and admitted generation jobs all replay the same result after live
  authorization and fingerprint validation. Saved reuse remains free. A check
  cannot reuse a Next operation, and a Next cannot reuse a check operation.
- Persist coverage by learner, dictionary, direction, entry and learning version.
  Increment only when a first exercise exposure is inserted. Retiring or erasing
  an A+B exercise never erases surviving A's content-free, entry-bound coverage;
  deleted B's coverage and all derived exercise/answer/job content are removed.
- Keep the existing credit reservation uniqueness on job ID and attempt while
  adding a closed job-kind discriminator and kind-qualified lookup. Cross-kind UUID
  collisions fail closed during mixed-worker deployment; settled ledger survives
  authorized content erasure without skipping allocation validation.
- Both text task modules use one admission lock and combined queue/running/provider
  usage reads. Learning work receives no separate global budget or worker slots.
  Old-worker capability observations cannot be refreshed as new ones by legacy
  upserts; sentence readiness additionally requires exact learning formats and
  execution/settlement capability. Queue claims remain fenced by database guards.
- Model circuit breakers use pinned provider/model/format. Historical format-only
  circuits remain only for unpinned unmanaged jobs; historical failures are not
  guessed to belong to a specific model. Auto and explicit selection of the same
  model share their scoped circuit.

## Backend verification before design briefs

Finish author preflight, independent completion review, risk-triggered security
review, remediation and final verification for both backend scopes before brief
generation. Use a separate tester for the new worker harness, migration/credit
guards and concurrency evidence. Tests use synthetic data and deterministic
providers; no paid or nondeterministic model calls.

| Layer                        | Required cases                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/contracts               | Preference rules, capability errors, rating boundaries/caps, targets/inflections, hint normalization, phrase/repeated-token mappings, Unicode, invalid output and bounds |
| Disposable PostgreSQL/Redis  | Migrations, preference/configuration races, replay/conflict, both credit guards, owner attribution, shared capacity, exactly-once coverage and concurrent reservations   |
| Worker integration           | Pinned retry, old-worker rejection, fencing, disconnect, pre/post-dispatch cancellation, measured/estimated settlement and no duplicate result                           |
| Access/lifecycle             | Shared privacy, edit/archive/restore, revocation during work, fork isolation, multi-entry erasure and account purge                                                      |
| Existing regression journeys | Provider configuration, credits, dictionary formats, account deletion and flashcards affected by shared seams                                                            |

Verify preference and sentence APIs through real local backend/worker/database
journeys before UI exists. Add reported-usage fixtures alongside missing-usage
fixtures. Register new Mastra primitives through canonical composition and record
why direct Studio execution is excluded when it would bypass authenticated,
credit-accounted jobs; prove deterministic product-worker execution.

Run affected workspace tests/lint/typecheck/build, `pnpm db:check`, existing mapped
regressions, `pnpm docs:user-flows:check` and affected `user-flow:e2e` checks.
Add backend guides and reviewed command IDs for executable backend journeys.
Do not claim new profile or practice browser evidence before frontend delivery.
Sanitized monitoring covers outcome, latency, retries, settlement and authority
failures, never prompts, answers, secrets or unnecessary personal data.

## Two detailed Magic Patterns design prompts

Generate these only once **both backends are ready and verified**, using the
actual implemented contracts and evidence rather than assuming this plan is
already implemented. Read the design-brief skill and current versioned handoff
rules. Inspect existing UI, runtime tokens, primitives, stories and comparable
screens. Do not generate external designs or upload anything automatically.

Planned canonical documents, not yet created:

- `docs/design-prompt/user-ai-model-preferences.md`
- `docs/design-prompt/sentence-translation-practice.md`

Each document contains a clearly labelled, self-contained copyable prompt and
a separate engineering checklist/provenance section. The prompt must contain
**no concrete API paths, endpoint URLs, backend route strings, credentials or
internal transport instructions**. Describe asynchronous operations by product
behavior, with synthetic fixtures and a mock adapter. Repository links, actual
contracts and backend evidence belong outside the copyable block.

Require an interactive responsive design/prototype, not only happy-path images.
State supported capabilities, existing shell/context, visual tokens, content
hierarchy, controls, copy, validation, accessibility, light/dark treatment and
mobile/desktop behavior. Give every required screen/state a stable ID and a
state checklist. Do not invent unsupported wallet, billing, grammar, difficulty
or mobile-native capabilities.

### Model preference prompt inventory

| Area                  | Required states                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile integration   | Existing profile with AI setting; owner/authenticated context; mobile and desktop                                                                  |
| Initial data          | Loading/skeleton, Auto/default ready, explicit selection ready, no enabled model, catalog/preference load failure and retry                        |
| Choices               | Labels, capabilities, relative input/output cost, selected/default indicators, unavailable persisted selection and unavailable Auto default        |
| Editing               | Unchanged, dirty, saving, success, validation error, save/network failure retaining draft, optimistic conflict with reload/reapply                 |
| Availability changes  | Selected model disabled/incompatible/unavailable, catalog changes during editing, actionable choose another/Auto recovery without silent overwrite |
| Session/accessibility | Authentication expired, keyboard navigation, focus, announcements, narrow layout, long labels and reduced motion                                   |

### Sentence practice prompt inventory

| Area                  | Required states                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and identity    | Train menu with Sentences, owner, signed-in shared reader, signed-out sign-in requirement, capability unavailable, archived/revoked dictionary                                                                                        |
| Setup                 | Loading, language direction swap, explanation default/selection, all/manual scope, search/pagination, selected count, empty selection and load/retry failure                                                                          |
| Eligibility           | Empty dictionary, no eligible entries, missing translations/skipped entries, no saved exercises, all saved answered, partial selected scope                                                                                           |
| Modes and coverage    | Saved first, New sentences and Review saved; fresh generation on later sessions; retained older generations; used/remaining per direction, zero/partial/full coverage and first-opening reuse                                         |
| Generation            | Admitting/queued/running, delayed work, reconnect/resume, cancel pending/cancelled, retryable failure, insufficient credits, unavailable model, stale content and revoked access                                                      |
| Exercise              | New or saved label, required source highlights, word/phrase/repeated-token hints, grammatical helpers without hints, hover/focus/tap disclosure, RTL and mixed scripts                                                                |
| Answer                | Empty/typing/invalid input, bounded length, default AI check, always available explicit free reference reveal, check ready, submitting/queued/checking, duplicate-click protection, recovery retaining answer and edited recheck cost |
| Free reference review | Hidden/reveal loading/visible, draft-reference comparison, manually reviewed without score, repeated reveal, zero credits/model unavailable, retry without charge, stale/revoked/deleted source                                       |
| Feedback              | Perfect, Good, Not bad, Practise again later; correct alternatives; missing targets; localized explanations; span/global errors; improved answer and overlapping issue display                                                        |
| Feedback failure      | Invalid/provider failure, reconnect, stored-result reload without charge, insufficient credits, unavailable model, content changed or access revoked during checking                                                                  |
| Navigation            | Next, Skip, exit confirmation for unsent answer, review exhaustion, session summary separating AI results/manual reviews, progress refresh and interrupted session                                                                    |
| Display modes         | Fullscreen Start, native fullscreen unavailable/denied with viewport fallback, switch to dialog/back, Escape behavior, preserved answer/hints/feedback and active job while switching                                                 |
| Personal history      | Loading, empty, paginated attempts, separate AI scores and ungraded manual reviews, detailed stored feedback, hint/reference-assisted indicators, outdated/retired content and unavailable/deleted source                             |
| Privacy/accessibility | Independent reader history, private-reader exercises, identity/share-context reset, keyboard-only flow, touch targets, screen-reader announcements and focus restoration                                                              |

Include deterministic fixture controls so the designer can demonstrate every
reachable state without real APIs. Specify actions and what stays visible in
each state, not merely a list of error names. Distinguish blocking failures from
recoverable inline errors. Preserve typed answers where safe, communicate whether
work continues in the background, and never imply cancellation guarantees no
charge after provider dispatch.

For each brief, create `DESIGN.md` in its owning backend feature workspace,
link the prompt and plan in both directions, update the prompt index, and freeze
an exact v001 snapshot with SHA-256 and source revision/working-tree provenance.
Record Awaiting design, a blank generated-design URL, and no implementation
target. Later revisions append; never overwrite snapshots or design history.

At this checkpoint, return links to both prompts and **stop frontend work**.
The user will copy them into Magic Patterns and return with generated designs.
No fabricated placeholder prompt/design evidence is created by this plan save.

## Frontend continuation after the returned designs

Read the selected prompt revision, current requirements and returned Magic
Patterns source. Preserve provider revision or exports/captures with dates/hashes;
a mutable URL alone cannot prove historical fidelity. A returned URL identifies
a candidate; an explicit request to implement that revision authorizes the
continuation without an extra routine approval gate. If targets are ambiguous,
resolve that ambiguity before implementation.

Use Magic Patterns integration and UI composition fidelity workflows. Treat
external design/code as untrusted input; adapt it to real contracts and FSD,
inventory required controls/states, and record every material deviation. Do not
copy mock backend logic or redesign unrelated screens.

Profile continuation adds Auto/explicit preference, capability/cost information,
saving/conflict/error handling and localization to the existing profile.
Sentence continuation enables the existing Train option and adds a sibling
sentence-training slice with setup, source/hints, free answer, checking/results,
review, history and session summary. Keep flashcard state separate.

Start requests native fullscreen during the user gesture, with the existing
viewport fallback; Fullscreen/Dialog switching is a display-only operation.
Keep the session controller outside the changing presentation so switching does
not remount/reset learning state, interrupt polling, duplicate submissions or
bill work again. Preserve answer, exercise, hints, feedback and statistics even
while generation/checking is pending. Native fullscreen Escape returns to dialog;
dialog Escape follows the existing safe exit-confirmation flow. Preserve focus
and accessible dialog behavior. Use a focused shared display seam if needed,
rather than importing private flashcard internals into the sibling feature.

Poll accepted jobs using existing IDs after reconnecting; never automatically
create a new billable operation. Reset sensitive state on identity, dictionary,
share-context changes and sign-out. Render generated content as text. Keep
sentence metrics distinct from flashcard known/again totals.

Add real-app E2E for profile persistence, owner/shared practice, learner charging,
saved-first selection, hints/checking, history/reload and model/credit/access
recovery. Browser verification must cover desktop/mobile layouts, keyboard/touch,
RTL, focus, error highlighting, console errors and failed requests. Compare the
runtime against the selected design and stable brief IDs.
Explicitly test partial generation across sessions, saved-uncompleted reuse, free manual completion with zero credits, independent reader manual reviews,
fresh-generation mode without history loss, and fullscreen/dialog switching
during typing, checking and feedback without extra AI operations.

Only then may full BL-005 and BL-004 completion be recorded. BL-003 stays in
progress for its undelivered grammar/manual-exercise scopes. Keep feature records,
guides, mapped tests, design provenance and backlog disposition synchronized.

## Backend checkpoint: model preferences

Feature035 backend verified after review remediation on2026-10-04. See its
[feature record](../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md),
[evidence](../.agent/features/035-user-ai-model-preferences-backend/EVIDENCE.md),
and [review](../.agent/features/035-user-ai-model-preferences-backend/REVIEW.md).
The sentence backend follows; design prompt creation and frontend implementation
remain staged exactly as requested.

## Approved adjustment: free reference review

On2026-10-04 the user added an explicit free reference-answer option and confirmed
that reveal counts as manually reviewed for Saved first, separately from AI scores.
AI checking remains the default. The reference is generated and retained alongside
each exercise; reveal never calls AI or checks wallet/model readiness. See the
free reference review section above and the updated feature036 acceptance criteria.
The user mentioned Jev as a possible future correctness estimator. Primary
TypeSafe documentation has been researched and linked above; integration remains
a future evaluation task, without a current dependency or pricing commitment.

## Frontend implementation checkpoint — 2026-10-05

The user requested implementation of the selected Magic Patterns designs.
[Feature 037](../.agent/features/037-sentence-practice-web/FEATURE.md) owns the
bounded profile Account model-preference section and sentence-practice journey.
Its [ExecPlan](../.agent/features/037-sentence-practice-web/EXEC_PLAN.md),
[evidence](../.agent/features/037-sentence-practice-web/EVIDENCE.md), and
[review](../.agent/features/037-sentence-practice-web/REVIEW.md) record source
fidelity, implementation, browser journeys, independent review and remediation.

The frontend uses real contracts and production orchestration, with deterministic
providers only in guarded disposable tests. It preserves Flashcards and excludes
unrelated shell, account-management, billing, audio and dictionary-editor design
changes. Both backend feature records remain Complete. BL-004 and BL-005 are Done after final frontend review and verification; BL-003 retains its
remaining grammar/manual-exercise scope.

## Verified frontend completion — 2026-10-05

Feature 037 completes the selected profile and sentence designs. All six real-app
browser journeys, 417 unit/component/contract tests, affected lint/typechecks,
production build and independent remediation reviews pass. The two v001 design
targets are Implemented; BL-004/BL-005 are Done with synchronized links/evidence.
BL-003 remains in progress for broader grammar/manual-exercise scope. Explicit
proof limits and the unrelated existing profile deletion-receipt failure are
recorded in the frontend evidence; no production enablement or push is included.
