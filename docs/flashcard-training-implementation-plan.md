---
type: implementation-plan
title: Backend-first configurable flashcard training
status: implemented
created: 2026-10-02
updated: 2026-10-02
backlog_tasks:
    - BL-002
    - BL-003
source_paths:
    - apps/backend/src/modules/learning
    - apps/backend/src/modules/dictionaries
    - apps/backend/src/modules/users
    - packages/contracts/src
    - apps/web/src/fsd/widgets/dictionary-editor
    - apps/web/src/fsd/pages/shared-dictionary
    - apps/web/src/fsd/features/flashcard-training
evidence:
    - .agent/features/033-flashcard-training-backend/EVIDENCE.md
    - .agent/features/034-flashcard-training-web/EVIDENCE.md
---

# Backend-first configurable flashcard training

Related backlog: [BL-002](backlog/002-configurable-flashcard-training-done.md)
and the flashcard-specific foundation of
[BL-003](backlog/003-personal-learning-progress.md).
Delivery checkpoint: [planning record](../.agent/improvements/flashcard-delivery-plan.md).
Implemented backend proof: [feature evidence](../.agent/features/033-flashcard-training-backend/EVIDENCE.md)
and [ADR-0024](adr/0024-flashcard-learning-state-and-revisions.md).
Design provenance: [copyable Magic Patterns prompt](design-prompt/flashcard-training.md)
and its [versioned design record](../.agent/features/033-flashcard-training-backend/DESIGN.md).
Frontend continuation: [feature 034](../.agent/features/034-flashcard-training-web/FEATURE.md),
[ExecPlan](../.agent/features/034-flashcard-training-web/EXEC_PLAN.md) and
[verification evidence](../.agent/features/034-flashcard-training-web/EVIDENCE.md).

## Delivery agreement and gates

The initial delivery agreement on 2026-10-02 requested two parts:

1. Implement and verify the backend.
2. Use the implemented backend and existing frontend code to produce a copyable
   Magic Patterns design prompt, save it with versioned provenance, then stop
   until the user returns with a design. Do not implement the frontend now.

This is a new product capability with public contracts, persistence, migrations,
and access semantics. Root instructions require explicit feature delivery
authorization before backend implementation. Saving this plan does not waive
that gate. The user authorized delivery on 2026-10-02, now owned by
[feature 033](../.agent/features/033-flashcard-training-backend/FEATURE.md) and its
[ExecPlan](../.agent/features/033-flashcard-training-backend/EXEC_PLAN.md).
Create a backend-scoped feature workspace and branch
according to the feature workflow; link its specification, execution plan,
evidence and review here. This document is a product/technical planning baseline,
not implementation evidence or an accepted ADR.

The user subsequently returned the Magic Patterns design on 2026-10-02 and
requested implementation of its training-related UI and session-start action
only. Feature 034 continues the authorized delivery using selected provider v2
artifact `db684c8f-e7a1-4f6c-804f-e0fd6a8da2d4`. The versioned design record retains
the immutable source export and four supplied rendered references. Dictionary
preview/editor redesign, prototype shell/designer and mock adapters remain out
of scope. The original stop was observed; it is no longer the current checkpoint.

Backend delivery may complete its scoped feature, but BL-002 remains incomplete
until its frontend journey is implemented and verified. BL-003 remains incomplete
because other exercise types and their progress are outside this slice.

## Scope and confirmed decisions

Support owners, signed-in shared readers, and anonymous shared readers. Signed-in
learners save independent personal progress; anonymous practice is session-only.
Ownership controls editing, not eligibility to save personal learning progress.

- Train belongs beside the editor's existing floating **Add card** action, not
  the library's Create dictionary action. Shared readers also get Train.
- Train offers Cards and a disabled Sentences item labelled coming soon.
- Archived dictionaries cannot train. Empty active dictionaries can open setup,
  with an explanation and Start unavailable.
- Default front is the target-language example; default back is the
  source-language example. Respect effective per-entry language roles.
- Front/back each select one or more unique fields. Overlap is allowed;
  identical selections produce a warning, not a prohibition.
- Default scope is every active entry, independent of editor search or pagination.
  An advanced searchable/paginated selector allows a manual subset.
- Remember front/back selections and shuffle per learner/dictionary across devices.
  Cancel saves nothing. Manual selection resets to all for each new session.
- Shuffle by default, with dictionary-order mode available.
- Missing selected examples fall back to the corresponding word. Omit other
  missing optional fields. Exclude entries when either projected side is empty.
- Save one current result per learner/entry, independent of field configuration.
- Explicitly start another round for Practise again cards; no automatic requeue.
- Interrupted sessions start a new queue next time; acknowledged ratings survive.
- Failed saves wait for retry. Never silently continue with unsaved ratings.
- Support Undo of the latest acknowledged rating, retaining content-free history.
- Any learning-relevant content change invalidates the old current result.
  Dictionary-default changes invalidate only entries whose effective content changes.
- Retain content-free attempts until permanent entry/dictionary deletion or learner
  account purge, rather than introducing an arbitrary expiry period.

Exclude AI sentence generation/evaluation, credits, spaced repetition, generated
audio, native/admin UI, history browsing, and progress for other exercise modes.

## Part 1 — Backend implementation

### 1. Architecture and source audit

Create an independent backend `learning` module and focused contracts under
`packages/contracts/src/learning`, following established DDD boundaries. Dictionary
content remains owned by `dictionaries`; personal attempts/preferences/progress
belong to `learning`. Do not introduce a universal asset/exercise table.

Use a narrow dictionary infrastructure transaction participant so access checks,
current learning revision checks, and learning writes share a transaction.
Reuse canonical dictionary capability rules rather than duplicating authorization.
Do not expose Drizzle or database transactions through domain/application APIs.

Before choosing interfaces, inspect actual module composition, all card writers,
dictionary settings changes, permanent deletion, account purge, and analogous
transaction ports. Relevant constraints: ADR-0002, ADR-0011, ADR-0019, ADR-0023;
ADR-0018 supplies historical account-deletion policy referenced by ADR-0019.
Scan the ADR index and read relevant records fully. Record durable cross-module,
persistence, concurrency and rollout choices in an indexed ADR; do not treat this
plan as accepting one. Strategic choices follow the root approval policy.

### 2. Monotonic learning revisions

Add an internal positive `learning_version` to dictionary entries, initially 1.
Increment only when canonical learning content actually changes:

- Source or translation changes.
- Enabled optional values change.
- Effective field enablement, visible language roles, or applicable transcription
  notation changes.

Ignore order, lifecycle, authorship, translation context, dictionary name or
description, no-op edits, and dormant disabled values/settings. Compare effective
content with a shared pure helper used by manual and AI-acceptance write paths.
Do not substitute the existing authored card revision for a learning revision.

For default-setting changes, compare old/new effective settings per entry,
including archived entries. Preserve override-protected entries. Increment only
affected learning versions in the same transaction, using bounded set-based or
batched operations suitable for the existing 10,000-entry limit. A metadata-only
learning bump must not fabricate authored revisions, authorship changes, ordinary
card-version changes, or edited timestamps.

New, imported and forked entries start at 1. A monotonic version prevents the
A→B→A case from reviving obsolete Known progress; a content hash alone does not.

### 3. Persistence

Generate migrations through project tooling; do not hand-edit generated SQL or
metadata. Add three typed tables with appropriate indexes:

| Table                    | Responsibility                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flashcard preferences    | Learner/dictionary, front/back field keys, shuffle, optimistic version.                                                                                                     |
| Flashcard attempts       | Learner, dictionary/entry, unique client operation ID per learner, session UUID, round, learning version, rating, selected field keys, server ordering/time, undo metadata. |
| Flashcard entry progress | One row per learner/entry, dictionary reference, learning version, latest rating and latest attempt reference.                                                              |

Use the existing composite entry/dictionary identity constraint. Index current
totals, latest entry attempts and latest session attempts; enforce operation-ID
uniqueness. Session IDs group attempts, not persisted resumable queues.
Store no copied words/examples, private context, or share keys. Old-version
progress counts as Unstudied without deleting historical attempts.

### 4. API contract baseline

Owner prefix: `/learning/dictionaries/:dictionaryId`.
Shared prefix: `/learning/shared-dictionaries/:shareId`, using the existing
dedicated share-key header and live capability semantics.

| Operation                                           | Contract                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /learning/capabilities`                        | Feature availability.                                                                                                                                                  |
| `GET {prefix}/entries`                              | Active source/translation previews; search, cursor, maximum 25 per page.                                                                                               |
| `GET/PUT {prefix}/flashcards/preferences`           | Signed-in only; optimistic concurrency.                                                                                                                                |
| `POST {prefix}/flashcards/prepare`                  | All/manual scope and field configuration; unique manual IDs capped at 10,000; ordered eligible ID manifest and skipped/fallback counts, not full entry content.        |
| `POST {prefix}/flashcards/items`                    | Maximum 25 requested IDs plus configuration; projected plain-text sides, language/direction, requested versus fallback field, learning version and unavailable IDs.    |
| `GET {prefix}/flashcards/progress`                  | Signed-in current totals over active entries.                                                                                                                          |
| `POST {prefix}/flashcards/attempts`                 | Client operation UUID, session UUID, entry ID, expected learning version, round, rating and configuration keys; acknowledged attempt response; totals read separately. |
| `POST {prefix}/flashcards/attempts/:attemptId/undo` | Idempotent undo request with operation ID and conflict handling.                                                                                                       |

These paths were delivered and verified by feature 033; the actual exported
contracts are authoritative for DTO/error shapes. Feature 034 consumes those
endpoints rather than substituting the prototype's mock adapter. Validate boundaries
with strict Zod schemas, export inferred types, and update OpenAPI consistently.
Reject empty/duplicate side selections, oversized batches and invalid manual IDs.
Provide stable error distinctions for stale content, unavailable access, preference
conflicts, operation-ID reuse and undo conflicts without leaking protected content.

Projection keys represent Source, Translation, Transcription, Definition,
Source-language example and Target-language example. Resolve physical example
fields through effective settings. Disabled dormant data must never leak.
Fallback to a word already explicitly selected renders it once with a fallback
explanation. Front/back order is deterministic. Shuffle is a client concern over
the prepared manifest, with an injectable random source for later tests.

### 5. Authorization, concurrency and lifecycle

- Derive learner identity from verified authentication; never accept caller user IDs.
  Invalid bearer credentials must not silently become anonymous sessions.
- Recheck owner access or live shared capability on every request, including
  idempotent replay and undo. Personal writes require an active signed-in learner;
  shared dictionaries also require active owner and live sharing policy.
- Use non-enumerating errors, no-store responses and existing no-referrer handling.
  Never persist or log share keys, raw card text, or private user context.
- Serialize conflicting learner/entry writes with a documented lock order compatible
  with dictionary edits, archive/deletion and account purge.
- A retried operation with identical payload cannot add an attempt or rating twice.
  Reusing its key with changed payload returns a conflict.
  Attempt replay may acknowledge the historical accepted rating after later edits,
  but never restores old current progress. It still requires live access and an
  active entry. Undo replay also requires the current learning version.
- Undo only the latest eligible session rating that still owns the entry's current
  state. Void, do not erase, that attempt. Restore the latest prior unvoided result
  at the same current learning version, even from another session, or Unstudied.
  Reject stale content or a newer competing result rather than overwriting it.
- Use bounded learning-specific rate limits; ordinary authenticated ratings must
  not consume the existing shared-read 30/minute bucket. Bound preparation,
  content reads and writes separately.
- Archive excludes entries from current totals but retains history. Restore can
  expose their same-version results again after live access checks.
- Permanent entry/dictionary deletion removes linked learning rows for all learners
  and participates in the existing dependency inventory.
- Explicitly purge a learner's rows on foreign dictionaries during account purge.
  Users are tombstoned, so relying only on learner-FK deletion cascades is insufficient.
- Forks have new identities and never inherit source-dictionary progress.

### 6. Rollout and verification

Use `LEARNING_FLASHCARDS_ENABLED`, initially false. Learning revisions and cleanup
must operate independently of UI activation. Activate only when every serving API,
card writer, account-purge worker and supported rollback floor implements revision
and cleanup rules. Do not allow old writers to preserve stale Known results.
Use the existing singleton migration process and forward-compatible additive rollout;
no destructive down-migration. The design has now returned; the capability stays
disabled by default. Feature 034 enables it only in disposable verification
processes, not production rollout.

Required backend evidence:

- Unit tests: canonical content comparison, effective roles/enablement, fallback,
  duplicate suppression, eligibility and current-progress aggregation.
- Contract tests: validation, access, personal isolation, optimistic preferences,
  operation replay/payload conflict, content/access conflicts and bounds.
- Disposable PostgreSQL integration tests: clean/additive migration, defaults,
  constraints/indexes, learner isolation, ratings versus content/settings edits,
  preference races, concurrent ratings, replay, undo, archive/restore, permanent
  deletion and account purge on foreign dictionaries.
- A 10,000-entry fixture: bounded manifest, query plans and selective settings
  invalidation without unbounded content responses or N+1 reads.
- Relevant existing dictionary/user regressions; affected contracts/backend tests,
  lint, typecheck and build; migration/schema checks.
- Applicable API user-flow guide and mapped automated coverage, with traceability
  checks. No paid or nondeterministic model calls.
- Author preflight, independent completion review and material SQL/auth/user-data
  security review. Assign bounded independent test review for the persistence-race
  and account-purge verification surface.

Record exact commands, tested patch/environment, results and gaps in the feature
evidence record. Compilation alone does not complete backend delivery.

## Part 2 — Design prompt and deliberate stop (completed handoff)

Only after backend contracts and behavior are verified:

1. Inspect the implemented endpoints/DTOs/errors and actual dictionary editor,
   shared reader, shared Menu/Dialog primitives and runtime design tokens.
2. Write a standalone copyable Magic Patterns prompt containing the following UX
   requirements, actual backend support/limitations, existing-screen context,
   states and accessibility constraints. Reference code-backed behavior, not
   aspirational APIs. Request a design/prototype, not backend implementation.
3. Follow [versioned design handoff](../.agent/DESIGN_HANDOFF.md): canonical prompt,
   owner `DESIGN.md`, exact immutable v001 snapshot/hash, source revision and
   relevant uncommitted changes, prompt-index entry and bidirectional links.
   Leave generated-design URL blank and status Awaiting design. Do not fabricate
   an implementation target or approval.
4. Stop. Report backend evidence and the copyable prompt path. Do not invoke Magic
   Patterns or begin frontend implementation without the user's returned design
   and applicable implementation instruction.

### Frontend behavior the design must support

Setup includes field groups, shuffle, all/manual scope, paginated/searchable manual
selection preserved across filters/pages, eligibility/skipped/fallback counts,
empty and invalid states, remembered settings, save/conflict/retry states.
Manual scope needs at least one selected entry; preference conflict preserves the
draft and offers reload or explicit overwrite at a refreshed version.

Start requests browser fullscreen synchronously from the user's gesture, enters
loading, prepares the ID manifest, saves signed-in preferences and fetches the
first bounded content batch. Unsupported/rejected fullscreen falls back to a
viewport-filling overlay. Dialog/fullscreen transitions preserve session, face
and position. Native Escape exits fullscreen into dialog; dialog Escape requests
End confirmation. Backdrop clicks must not accidentally end a session.

Card click/Enter/Space flips. Right swipe = Known; left swipe = Practise again.
Labelled buttons and arrow-key equivalents are required; ratings may occur before
or after flipping. Distinguish drag from vertical scrolling, text selection,
control clicks and small movements. Respect reduced motion, RTL and long content.

Allow one mutation in flight. Signed-in advancement waits for acknowledgment;
failure preserves card/face/pending choice and retries the same operation ID.
Anonymous practice uses local state only. Undo restores the previous card face,
session statistics and saved progress until the next successful rating or a new
round, including on results. Explain concurrency/content conflicts.

Show reviewed/Known/Practise again counts and Known percentage of reviewed cards
as self-assessment, not accuracy. Distinguish round/session figures from live
saved dictionary totals (Known, Practise again, Unstudied over all active entries).
Results offer explicit Practise again round, Start over and Finish. Retry uses the
current session's latest Again group; shuffle each round or retain dictionary order.

New entries join the next session. Skip removed/unavailable entries with notice;
reload changed entries before another rating. Closing/reloading discards queue
and undo context, not acknowledged results. Authentication/share-key changes clear
and end the session. Never silently import anonymous progress after login.

Frontend delivery requires component/state tests, mapped owner/shared/anonymous
journeys, and real browser evidence at mobile/tablet/desktop, 200% zoom and long/RTL
content, covering fullscreen fallback, keyboard/touch, retries and access/content
changes. Those checks were deferred, not waived, by the backend-first boundary;
feature 034 now owns their execution and evidence.

## Checkpoint history and current continuation

### Backend handoff — 2026-10-02

Initial source base was `b7f4fe7`; authorization was received on 2026-10-02.
Backend and code-grounded v001 prompt are implemented and verified in feature 033.
The backend capability remains disabled by default; no frontend was implemented.
At this checkpoint work stopped awaiting the user's returned design. Resume from feature evidence, DESIGN.md
and the selected returned-design revision, not conversation memory. Preserve the
confirmed product decisions unless implementation reveals a real contradiction.

### Returned design and frontend implementation — 2026-10-02

The user supplied [the Magic Patterns design](https://www.magicpatterns.com/c/1ezcc3hob8mnnnku9w26tl)
and four reference screenshots. Its selected training-only source and rendered
references are captured in [DESIGN.md](../.agent/features/033-flashcard-training-backend/DESIGN.md).
Feature 034 implements real capability-aware owner/shared Train actions,
configurable setup, fullscreen/overlay/dialog learning cards, acknowledged
ratings/retry/Undo, and round/session/saved-progress results. Existing dictionary
previews remain unchanged; no prototype mock API or production dependency is
introduced. Compact labelled mobile ratings preserve non-drag accessibility
where the prototype hides desktop side controls.

Continue from feature 034's ExecPlan, evidence and review records for outstanding
verification, remediation and completion. This plan records implementation scope
and chronology; it does not claim completed runtime fidelity or final review.
BL-002 remains in progress until its full journey is verified. BL-003 remains in
progress because sentence/grammar/manual-exercise progress is outside this slice.

## Verified frontend completion — 2026-10-02

Feature 034 completed the selected training-only design. Its evidence/review and
current web user-flow guide establish implementation; BL-002 is Done, BL-003 stays
in progress for other modes. Dictionary previews were not redesigned. The default
capability remains disabled pending intentional activation; Cards appears after
enabling the local backend flag and restarting it. Full browser-chrome zoom is
not claimed: final accessibility evidence documents CSS content scaling and
separate equivalent-viewport controls, reduced motion and native touch.
