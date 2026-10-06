---
type: implementation-plan
title: Sentence practice contextual assistance and completion
status: in-progress
created: 2026-10-05
updated: 2026-10-06
backlog_tasks:
    - BL-004
source_paths:
    - packages/contracts/src/learning/sentences.ts
    - packages/prompts/src/local/sentence-generation.ts
    - apps/backend/src/modules/learning
    - apps/backend/src/config/environment.ts
    - apps/backend/drizzle
    - apps/backend/src/modules/text-ai
    - apps/backend/src/infrastructure/text-ai
    - apps/backend/src/infrastructure/worker
    - apps/web/src/fsd/features/sentence-training
    - apps/web/src/fsd/widgets/dictionary-training
---

# Sentence practice contextual assistance and completion

The user authorized this extension on 2026-10-05 and confirmed the product
choices below. Implement and verify its backend first, then save a detailed
versioned design prompt without concrete API paths. Frontend implementation
follows the user's returned Magic Patterns design and its selected revision, now
recorded at the returned-design checkpoint below.
This document is a human-readable implementation plan, not delivery evidence.

The authoritative acceptance criteria and engineering progress live in
[feature 038](../.agent/features/038-sentence-practice-assistance/FEATURE.md)
and its [ExecPlan](../.agent/features/038-sentence-practice-assistance/EXEC_PLAN.md).
Its [evidence](../.agent/features/038-sentence-practice-assistance/EVIDENCE.md)
and [review](../.agent/features/038-sentence-practice-assistance/REVIEW.md)
will record execution and independent findings. The
[earlier plan](sentence-practice-implementation-plan.md) and
[BL-004](backlog/004-ai-sentence-translation-practice-done.md) describe the
delivered baseline. BL-004 stays Done; this approved extension does not reopen
its historical delivery or complete unrelated grammar, difficulty or weakness
planning work.

## Confirmed outcomes and limits

| Outcome                    | Required behavior                                                                                                                                         | Acceptance criteria |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Contextual vocabulary help | Newly generated sentences contain useful hints for additional content words and whole contextual phrases, including idioms and phrasal verbs.             | AC-1/2              |
| Required dictionary words  | Preserve their entry identities, assessment requirements and round coverage. Additional helper vocabulary does not become dictionary content.             | AC-1/5              |
| Free reference comparison  | Explicitly reveal the authorized saved reference and conservatively compare the draft with it, without AI or a credit requirement.                        | AC-3/5              |
| Honest comparison feedback | Report a normalized match or a difference; another translation may still be valid. Do not assign a score, quality rating or semantic correctness verdict. | AC-3                |
| Session completion         | After checking, revealing or skipping the last sentence, replace the exercise with results in the current practice surface.                               | AC-4                |
| Repeat options             | Repeat exactly the examples just practised in their original order, or explicitly generate fresh examples.                                                | AC-4/5              |
| Design checkpoint          | Verify the backend, save a detailed design prompt, then wait for the returned design before frontend implementation.                                      | AC-6/7              |

The existing 100-word round limit remains. A dictionary batch uses the first
eligible entries in stable order; manual search and Load more allow selecting
other words. Lifetime progress remains dictionary-wide. Saved first includes
previously checked or manually reviewed exercises. New examples remains an
explicit generation choice. No automatic next batch is introduced.

Existing saved exercises retain their existing dictionary hints and remain
usable. Do not automatically enrich old exercises, regenerate them or charge a
learner to open them. Jev integration, new models/providers, credit purchases,
new starter grants, difficulty controls and native-mobile delivery are excluded.

## Backend representation and compatibility

Use the existing exercise JSON seam rather than creating a parallel hint store
or reference-answer service. The approved compatible representation is:

- Keep each dictionary-target segment's existing target association, entry ID,
  occurrence identity and hint ID.
- Add an optional `contextualHintId` on an ordinary source segment for additional
  help. It has no entry ID and contributes no dictionary target or coverage.
- Add optional hint `kind` values `dictionary` or `contextual`. Missing kind on
  existing saved exercises must retain legacy dictionary-hint interpretation.
- Bound contextual hints to 40 in addition to the existing maximum of three
  dictionary targets. A newly generated v2 example must contain at least one
  useful contextual helper. Keep all existing source, answer, segment and text limits.
- Increment the generation policy to 2 for newly enriched content and introduce
  the `sentence-generation:v2` worker format. Preserve reading saved v1 exercises
  and processing already queued v1 jobs according to their pinned policy.

The format is an engineering compatibility boundary, not a learner-facing
setting. A worker must claim only formats it explicitly advertises. Retry uses
the job's pinned format, execution and budget; it must not silently switch a v1
job to v2 or resolve a different model. Inspect catalog/selection constraints,
worker capability observations and deterministic fixtures together before
admitting v2 jobs. Unsupported workers must leave incompatible work unclaimed.

Exact replay extends existing request schemas compatibly: prepare accepts an
optional `replayExerciseIds` list of one to 100 unique IDs, and Next accepts an
optional `replayExerciseId`, both restricted to review-only mode. Existing routes
validate the whole preparation list and each exact read against live dictionary
authority, scope, direction, language and entry versions. No new endpoint,
server replay cursor, provider call or financial admission is introduced. Keep
requests without these optional fields and public response shapes compatible.

Hint content uses additive fields in existing exercise JSON, with no new hint
table. Generated migrations `0052_mature_freak`, `0053_omniscient_killmonger` and
`0054_good_pet_avengers` expand and constrain the supported generation format and
policy version. The final constraints bind v1 jobs to policy 1, v2 jobs to policy
2 and stored public exercise policy to its relational version, rejecting missing
or mismatched policy values rather than allowing SQL unknown/null to pass.
Verify generated migration consistency, compatibility and live constraints
against owned disposable infrastructure; generated SQL must not be edited by hand.

### Expand first, activate after compatible UI

`LEARNING_SENTENCE_GENERATION_FORMAT` defaults to `sentence-generation:v1`.
Deploying compatible schema and backend worker support does not silently switch
new admissions to enriched v2 content while the existing frontend only understands
dictionary hints. Retain v1 admission until the returned design has been
implemented and the compatible UI verified. Explicitly select
`sentence-generation:v2` only after that checkpoint and matching capable-worker
evidence; environment configuration is an engineering gate, not a product toggle.

The actual configured worker processable-format list remains authoritative.
Adding code support does not automatically advertise a format excluded from that
list. Include the needed v1/v2/check formats in the reviewed worker configuration
and verify corresponding observations before activation. Unsupported workers must
not claim incompatible jobs. Rollback disables new v2 admission while compatible
workers finish or cancel already admitted pinned v2 jobs; it does not reinterpret
them as v1. Stored v1 examples and queued v1 work remain supported throughout.

## Generation and validation

Update the generation prompt, typed model response and trusted adapter together.
Continue to request a short natural sentence in the chosen source language and
its private reference in the chosen answer language. Preserve the existing
protection against unnatural borrowing, forced dictionary combinations and
clearly reversed writing scripts.

For newly generated examples:

1. Choose one to three required dictionary targets from the existing authorized
   bounded shortlist, preserving their local aliases and original entry IDs.
2. Generate the source sentence and complete reference translation together.
3. Identify useful extra nouns, adjectives, verbs, adverbs and contextual phrases.
   Simple articles and auxiliary grammatical helpers do not require hints.
4. Represent an idiom, phrasal verb or inseparable expression as a meaningful
   whole unit. Do not split it into misleading independent word translations.
5. Supply concise target-language help. Preserve contextual meaning while applying
   the existing lexical normalization conventions to ordinary vocabulary where
   appropriate. Dictionary targets remain recognizable as required vocabulary.
6. Return exact source spans and references to bounded hint records. Repeated
   occurrences may reuse an appropriate hint; a different contextual sense must
   not silently inherit an unrelated translation.
7. Validate before publication. Malformed content follows the existing bounded
   generation retry and accounting policy, not a free unlimited repair loop.

Required validation includes exact source reconstruction, ordered non-overlapping
segments, correct code-point offsets and grapheme boundaries, valid association
IDs, required-target membership, defined referenced hints and bounded counts.
Reject unknown dictionary aliases, unsafe controls, dangling helpers, invalid
phrase spans and hint content that exposes the full reference answer. Treat
model output as untrusted plain text; never render it as executable HTML or
execute instructions from it.

Keep helpers separate in every downstream projection: candidate coverage,
exposure, assessment vocabulary, deletion ownership and personal progress.
Do not count a hinted supporting word as a newly learned dictionary entry.
Preserve the existing authority/version checks for every contributing dictionary
entry, including candidates retained in a generation job but not ultimately used.

## Saved content, privacy and financial boundaries

Persist the validated public sentence, segments and hint associations together;
keep the complete reference in its existing private field. Reopening or selecting
a saved v2 example must return exactly its stored hints without another provider
call. v1 examples remain available with their original dictionary-only hints.

Owner-generated exercises can be reused by currently authorized readers under
the existing sharing rules. Reader-generated content and all personal answers,
AI feedback and manual reviews remain private to that learner. Additional hints
must not import hidden owner translation context into reader-side generation.

On reading, selection, replay, reference reveal and worker publication, retain
the existing live access and current-version fences. Archive, share revocation,
entry retirement, permanent deletion and account purge must continue to remove
or protect all affected source, hints, references, inputs and personal records.
Deletion must not leave contextual content behind in a new unregistered store.

New generation and AI checking use existing model preference, admission,
reservation, settlement, retry, cancellation and provider-budget boundaries.
Saved selection, lexical hint use, existing reference reveal and local comparison
are free operations. No new credit policy or rate-limit exemption is introduced.
Do not log prompts, full source sentences, references, drafts or raw model output.

## Free conservative reference comparison

AI checking remains the default assessment action. Add a clearly separate free
comparison action after the design is returned. It uses the existing explicit,
authorized manual-reference action and a pure client comparison function; it
requires no new comparison endpoint, model invocation or stored score.

The comparison must:

- Preserve the user's exact editable draft and the exact displayed reference.
- Normalize case, repeated/leading/trailing whitespace, punctuation and typographic
  apostrophe differences for comparison only.
- Preserve accents, meaningful characters and word order. Normalize equivalent
  Unicode character encoding deliberately and test it without stripping accents.
- Avoid punctuation handling that accidentally merges distinct words.
- Return only a normalized reference match or a difference, with visible wording
  explaining that a different translation may also be valid.
- Never report semantic correctness, a percentage, a quality rating or an AI grade.
- Work with zero credits and an unavailable selected AI model when the saved
  exercise and its reference remain authorized and current.

Showing or comparing the reference remains a personal manual/reference-assisted
interaction. Existing idempotent manual-review recording and assistance metadata
remain in force. Repeating the comparison must not create duplicate manual counts.
AI checking after reference disclosure must retain reference-assisted metadata
without imposing an extra score penalty. A failed reveal exposes no reference
and adds no synthetic completion or successful comparison.

Keep the normalization function independent of transport and rendering. Before
frontend implementation, record concrete test cases for accents, apostrophes,
punctuation, word boundaries, non-Latin text, emoji/symbols, whitespace and changed
word order. Do not broaden the product promise into synonym or grammar analysis.

## Completion, results and replay

Continue tracking round coverage by dictionary targets appearing. When the last
selected word first appears, mark coverage exhausted but keep the final sentence
answerable. The new completion transition occurs after the learner successfully
checks that sentence, explicitly reveals/compares its reference, or skips it.
An AI job pending or failing must not prematurely complete the session; a failed
reference request must leave the draft and available recovery intact.

At completion, results replace the exercise within the same dialog/fullscreen
surface. Do not stack a second results modal over the learning dialog. Present
clear session counts for examples, selected words covered, AI checks, manual
reviews and skips, keeping scores and free interactions distinct. Exact count
definitions must follow the feature's accepted semantics and avoid double-counting
idempotent reveals, repeated hints or repeated target occurrences.

Offer two explicit continuation actions:

| Action                      | Content and ordering                                                             | Generation and state                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Repeat these exact examples | The precise exercise sequence from the completed session, in its original order. | No generation or silent replacement from another saved example. Start new round interaction state and preserve personal history. |
| Generate new examples       | Fresh examples for the configured eligible dictionary words.                     | Use explicit New examples mode and the existing paid admission/recovery rules. Preserve earlier saved examples.                  |

Retain the exact sequence in the session controller, outside components that
change presentation. A replay must reset the appropriate per-round counts,
drafts, revealed hints and reference state without deleting persisted personal
history. Every read/reference action still reauthorizes access. If an example
has become stale or inaccessible, show an actionable failure; do not silently
substitute content and claim exact replay succeeded.

Fence old async results when starting replay, fresh generation, cancellation,
reset or access loss. Preserve idempotent operation identities during recovery.
Switching dialog/fullscreen or opening inline AI preferences must continue to
preserve the current exercise and draft without an additional generation/check.

## Ordered delivery milestones

| Milestone                               | Work and verification                                                                                                                   | Exit condition                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Compatible representation            | Contract/domain/schema fixtures for helpers, phrase spans, legacy content and v1/v2 compatibility.                                      | Representation is bounded and tested; requirements remain separate from helpers.                                |
| 2. Generator and worker                 | Prompt, response projection, validation, policy version, supported worker formats, catalog and pinned retry routing.                    | Deterministic v2 output validates and incompatible workers cannot claim it; v1 remains supported.               |
| 3. Persistence and free seam            | Stored v2 round-trip/reuse, protected reference action, privacy/version/deletion/accounting fences against disposable PostgreSQL/Redis. | Reuse needs no provider call and free reveal needs no credits or model; live-authority and erasure proofs pass. |
| 4. Backend review and design checkpoint | Affected tests/static/build checks, backend journey, independent correctness/security review and remediation.                           | Backend evidence is recorded before the detailed versioned design prompt is saved.                              |
| 5. Returned design                      | Preserve source/export identity, inventory required controls/states and select the user's returned revision.                            | Frontend implementation is authorized against a specific retained design.                                       |
| 6. Frontend implementation              | Accessible contextual hints, free comparison, final-action completion, inline results and exact/fresh replay.                           | Controller and rendered behavior meet the selected design and real contracts.                                   |
| 7. Verified feature delivery            | Mapped guides/E2E, real Chromium, affected checks, independent completion/security review and scoped integration.                       | Feature records satisfy Definition of Done; no historical maintenance is accidentally committed.                |

The backend checkpoint is not full feature completion. Retain explicit remaining
frontend work while awaiting the returned design. Do not mark new user-flow
behavior current or claim browser evidence before that behavior is delivered.
Activate new v2 admissions only after the compatible frontend and configured
capable workers are verified; backend readiness alone does not activate this gate.

## Design-prompt checkpoint

The [versioned design prompt](design-prompt/sentence-practice-assistance.md)
contains the portable two-screen brief and 20 stable SPH requirements. Its exact
v001 snapshot and reviewed backend boundary are recorded in the
[design handoff](../.agent/features/038-sentence-practice-assistance/DESIGN.md).
It was ready to copy into Magic Patterns with no generated design or implementation
target at the original handoff checkpoint. The returned design below is now the
selected implementation target; the frozen v001 prompt stays unchanged.

After backend proof, root saves a portable prompt under `docs/design-prompt/`
with source-grounded requirements and a versioned handoff owned by feature 038.
Follow [DESIGN_HANDOFF.md](../.agent/DESIGN_HANDOFF.md): canonical document,
immutable revision snapshot/hash, bidirectional links, prompt index and separate
latest-candidate/implementation-target/last-implemented pointers. Preserve prior
feature 036/037 design revisions; they are not proof of the new interactions.

The copyable prompt must describe behavior without concrete API paths, endpoint
names, credentials or implementation machinery. Its state inventory includes:

- New contextual hints, ordinary content words, whole phrases, repeated spans,
  required-target distinction, legacy examples without extra hints and no-hint words.
- Desktop hover, keyboard focus, touch disclosure, mixed scripts/RTL, visible
  focus, supported locales and reduced motion.
- Draft editing, normalization match, reference difference and valid-alternative
  disclaimer; unchanged draft, empty draft and unavailable/free-action loading.
- AI checking, queued/running work, reference-assisted feedback, zero credits,
  unavailable models, retry timing, cancellation and uncertain recovery.
- Final sentence before completion, check/reveal/skip completion, results replacing
  practice, separate statistics and exact/fresh replay actions.
- Replay loading, stale/inaccessible example, fresh generation failure, empty
  eligible scope and current 100-word batch selection.
- Dialog/fullscreen, responsive narrow layouts, reachable close/back controls,
  inline AI preferences, guarded unsaved work and focus restoration.
- Authentication loss, sharing revocation, archived/deleted content and protected
  state clearing; no automatic reference disclosure on an error.

One prompt may cover the cohesive sentence journey. Multiple briefs are permitted
if needed to keep distinct design surfaces understandable; each needs its own
named revision series. No additional profile feature is assumed. Wait for the
user's returned design before generating frontend code; that gate is now met for
the selected v8 source below.

### Returned design and frontend continuation — 2026-10-05

The user returned [Magic Patterns v8](https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4),
identity `c9d7bdb9-7c33-4960-b2da-776b5f4091c2`, for feature 038 prompt v001.
The 33 retained source files under
`.agent/features/038-sentence-practice-assistance/designs/sentence-practice-assistance/v001/source`
are the reviewable input. Root owns the selected target/fidelity inventory and
its final status in [DESIGN.md](../.agent/features/038-sentence-practice-assistance/DESIGN.md).
Do not overwrite the frozen prompt, old feature 036 design or returned source.

Frontend integration preserves required solid versus contextual dashed hints,
whole-phrase/repeated-trigger accessibility, conservative free comparison,
replacement results after the final successful action, separate AI/manual/skip
counts, final-result details and inline settings/history with Back. Exact replay
preflights the entire saved exercise sequence and retains its IDs/order under
current authority. Fresh examples target the same round's required words; failed
admission preserves previous results unless content/access is invalid. No helper
becomes a dictionary entry or assessment target. The prototype is a design input,
not a substitute for live contracts, authorized privacy or browser verification.

## Verification and evidence

Use deterministic local providers only. Unit and contract tests cover helper
bounds, exact spans/graphemes, malformed/unknown associations, reference leakage,
dictionary coverage isolation, legacy v1 and v2 behavior and normalization.
Worker tests cover format capability, pinned execution, invalid-output retry,
settlement, cancellation and stale publication fences.

Owned disposable PostgreSQL/Redis checks cover persisted segment/hint round-trip,
saved reuse, shared privacy, zero-credit manual reveal, version retirement,
permanent erasure and compatible queued work. Reuse the reviewed backend journey
runner rather than creating a parallel harness. Never reset actual development,
shared, staging or production data, and never call a paid model in tests.

After frontend delivery, extend the existing reviewed Playwright harness for
whole-phrase hints, free reference comparison, final-action results, exact replay
and fresh replay. Verify reachable controls and focus in dialog/fullscreen and
narrow viewports with a real browser. Browser proof remains required, not replaced
by controller tests, compilation or design screenshots.

Update [backend](user-flows/sentence-practice-backend.md) and
[web](user-flows/sentence-practice-web.md) guides only when their corresponding
behavior is implemented. Inspect existing scenario mappings, preserve stable IDs,
review assertions before changing revision markers, execute proportional mapped
journeys and run documentation traceability checks. Independent reviewers must
assess correctness, model-output/privacy boundaries, financial invariants,
compatibility, actual test evidence and remaining risks.

## Current state

Milestones 1–4 are verified at the backend checkpoint: contract/domain/provider
regressions, persisted legacy/v2 compatibility, real disposable database/cache
and restricted-role tests, affected static/build checks and independent
compatibility/security review pass. Review caught and resolved aggregate
reference disclosure across hints and recorded the intentional Studio exclusion.
The detailed prompt is frozen as v001 and linked from the prompt index/backlog.

Milestone 5 is unblocked by the selected returned v8 design. Milestone 6's
contextual hints, conservative free comparison, replacement results, exact/fresh
replay and inline settings/history are implemented and browser verified against
the selected returned design. Author verification includes
73 focused frontend tests (53 state/render and 20 reference-comparison tests),
affected static checks and 23 real disposable backend replay/compatibility tests.
The final `sentence038final-complete` Chromium run passed all seven mapped
scenarios on 2026-10-06, with exit code 0 in 2.5 minutes. Its 72 retained PNG
captures include attachment duplicates; the SHA manifest is preserved at
`.agent/features/038-sentence-practice-assistance/evidence/sentence038final-complete/manifest.json`.
Earlier partial diagnostic runs are not this completion proof. Independent final
product/security review approved AC-1–7 and SPH-01–20, with C1–5 resolved. The
remaining C6 Git-scope finding concerns integration authority for the four prior
maintenance changes; it is not an unresolved product/security defect. The review
verdict is recorded in [REVIEW.md](../.agent/features/038-sentence-practice-assistance/REVIEW.md).
The compatible exact-replay backend returns current authorized identities without
substitution or paid admission, while recoverable fresh/replay errors retain the
completed result state. Final feature integration and scoped Git hygiene remain
pending only for the scoped Git decision, commit and merge. This plan stays
In progress until those integration gates close; it does not mark the feature
Complete before the Git scope is resolved.
V1 remains the admission default; user development configuration and database
were not changed. Feature 038 is not Complete. Historical BL-004 delivery and
prior maintenance evidence retain their separate status.
