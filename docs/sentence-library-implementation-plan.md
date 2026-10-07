---
type: implementation-plan
status: complete
feature: sentence-library-management
related_features:
    - sentence-practice
    - administration
source_paths:
    - apps/backend/src/modules/learning
    - apps/backend/src/modules/administration
    - packages/contracts/src/learning/sentence-library.ts
    - packages/contracts/src/learning/sentence-preparation.ts
    - apps/web/src/fsd/features/sentence-training
    - apps/web/src/fsd/features/sentence-library
    - apps/web/src/fsd/pages/sentence-library
    - apps/admin
---

# Sentence library management and preparation

Owning [feature](../.agent/features/039-sentence-library-management/FEATURE.md),
[live execution plan](../.agent/features/039-sentence-library-management/EXEC_PLAN.md),
[evidence](../.agent/features/039-sentence-library-management/EVIDENCE.md),
[review](../.agent/features/039-sentence-library-management/REVIEW.md) and
[backlog task](./backlog/010-sentence-library-management-done.md).
[ADR-0028](./adr/0028-sentence-library-visibility-and-preparation.md) records the
accepted visibility and execution boundaries.

## Delivery sequence

1. Implement and verify contracts, persistence, authorization, library management,
   preparation orchestration and administrative API operations.
2. Independently review the backend and remediate findings.
3. Save two detailed versioned design prompts: dictionary library/preparation and
   per-user administrative sentence management. Prompts contain no concrete API paths.
4. Hand the prompts to the user. The learner design was returned on 2026-10-07;
   the user selected its `/sentences` surfaces and authorized local responsive
   admin composition. The existing practice presentation remains the selected
   design for the practice journey.
5. Inventory the returned designs, integrate their controls and states with these
   verified contracts, perform browser/E2E verification and final review, then
   complete the feature lifecycle. Backend readiness is a checkpoint, not whole
   feature completion.

## Confirmed product behavior

### Dictionary sentence library

List saved examples available to the authenticated learner in the dictionary.
Support bounded cursor pagination and direction, archive, currentness filters. Details show the source sentence, an expandable reference translation,
all contextual hints and whole-phrase hints, and dictionary-word mappings.
Preview must never create exposure, a review, a score or a practice result.

A personal archive hides an example from this learner's future practice while
preserving history and availability for other learners. Restore reverses that
marker. An example may remain ineligible because it is globally archived or stale.
Public responses must not reveal another learner's personal archive choices.
Selected operations pin each item's version. All-matching operations obtain a
short-lived frozen server-side confirmation set, including items beyond the
visible page, and reject stale changes instead of silently changing scope.
Mutation receipts support safe retries without repeating work.

Bulk confirmation storage is bounded: at most five live snapshots for one actor
and dictionary, 25 retained snapshots per actor, and 10,000 examples in one
all-matching confirmation. Larger selections must be narrowed with filters or
processed in smaller selections; the UI must explain this limit. Expired
confirmations are pruned under an actor-level lock.

### Optional preparation before practice

Preparation is off by default. When enabled it covers all eligible dictionary
entries in the chosen direction, including dictionaries larger than one round.
Ordinary practice rounds remain limited to 100 entries. Snapshot the intended
first round first, then remaining dictionary entries in deterministic partitions
of at most 100. New or edited words are handled by a new preparation.

- Saved first: reuse eligible saved examples, including previously completed ones,
  and generate only for missing coverage.
- New examples: generate fresh additive examples. Older examples remain saved.
- Saved only: reuse without generation or spending credits; show missing coverage.

Snapshot entry versions, sharing authority and direction. A durable coordinator
admits at most one child generation per preparation through the existing bounded
worker, credit reservations and provider budgets. Preparation publication saves
content without recording exposure. Keep aggregate and first-partition readiness
separate. A ready or partially ready partition can start practice with its exact
manifest and no implicit generation fallback, even when originally prepared as
new examples. No eligible saved examples is an explicit empty state. A bounded batch-list API
exposes later partitions so each ready partition can be practiced, rather than
leaving the second and subsequent partitions unreachable.

Navigation does not cancel background work. Stop prevents another child admission
and waits for the current child to settle before reporting paused. Resume is
explicit and revalidates access, currentness, credits and capacity. Distinguish
user stop, insufficient credits, capacity, model/provider failure, stale content
and lost access. Show partial usable results and retained examples. Normal credit
and generation rules still apply; no preparation surcharge or separate executor.

At most 20 preparations per learner retain content-bearing manifests. One active
preparation per dictionary/direction prevents concurrent duplicate work. Inactive
completed, failed, stale or access-lost manifests expire after seven days when
no child/provider work is unsettled. Resumable user/credits/capacity/model/provider
pauses are preserved. Expiry removes copied content and shared authority digests,
retains content-free operation identity for safe late retries, and never deletes
the saved examples. Expired manifests cannot resume; start a new saved-first
preparation or use the library. Quota and expiry have explicit UI states.

### Administrative management

Within a user's existing admin detail area, discover the bounded set of relevant
dictionaries through ownership, generation, recorded exposure or preparation.
Do not enumerate all unlisted dictionaries simply because their keys could exist.
Show examples currently available to the target learner and examples generated by
that learner. Filter generated-by-target, creator-archived, direction, currentness,
personal/global archive. Inspect the same reference/hints/mappings.

Administrators can personally archive/restore on behalf of the target learner,
globally archive/restore, or permanently delete creator-archived examples. They
cannot edit sentence text, references, hints, answers or scores in this feature.
"Creator archived" means the generator personally archived the example, which
can differ from the learner whose admin page is open.

Every mutation requires live active admin membership, a current session, recent
authentication and a reason. The success audit is atomic with the mutation and
contains identities/counts, never sentence or answer text. Rejection audits stay
content-free. Permanent deletion requires a separate explicit confirmation and
removes associated content and answers for every affected learner. Busy unsettled
work blocks deletion retryably. Retain permitted numerical accounting, remove
content-bearing receipts/snapshots/manifests, and preserve unrelated dictionary
words. Restoration cannot recreate permanently deleted content.

## Implementation seams

Learning owns library and preparation ports, schemas, stores and orchestration.
Administration owns its authorization/audit policy through transaction hooks;
learning does not import administrative service orchestration. Shared Zod
contracts validate HTTP inputs and outputs. Product source remains within its
application; no app-to-app imports are introduced.

Preparation uses separately fenced typed job formats while resolving provider
catalogs, execution snapshots and pricing through the existing base generation
formats. New workers explicitly advertise preparation support; old workers cannot
claim it. Existing generation-format configuration selects the matching version;
no separate model settings are required. Runtime command, migration and role-grant
changes must deploy together.

The deletion participant accepts an explicit exercise set independently of broader
account/dictionary deletion scopes. Both personal and global visibility checks
apply at pool selection and new review/check admission, including cached receipts.
Historical attempts remain history after ordinary archive. Account/dictionary
purges include all new tables and foreign manifests without granting the restricted
purger access to copied vocabulary or raw model input.

## Verification and handoff

Use deterministic providers and task-owned PostgreSQL/Redis, never paid generation
or shared development data. Verify archive isolation, global exclusion, stable
bulk selection, idempotency, creator-version races, permanent deletion and busy
rejection, history/accounting retention, partitions above 100, one child at a time,
no preparation exposure, stop/resume and partial practice. Verify restricted worker
and purger grants plus admin recent-authentication, revocation and audit rollback.

Maintain the [backend journey guide](./user-flows/sentence-practice-backend.md) and
its composed authenticated API tests. Contracts, affected unit/integration/E2E
checks, lint, typecheck and backend build must pass. Independent completion and
security reviews must resolve material findings before the design handoff.

At the frontend stage, follow the returned selected design and current runtime UI
primitives. Verify desktop/mobile, loading, empty/error, selection, confirmation,
access-loss, low-credit, partial/stopping/paused/completed preparation and admin
recent-auth/busy-deletion states in the real browser. Update corresponding user
and admin journey guides and mapped tests at that stage.

## Rollback and operational notes

New API operations and preparation capability can be disabled by removing their
composition wiring. Existing ordinary sentence practice remains compatible.
Do not drop the new persistence tables as an operational rollback: they contain
archive choices and ongoing preparation state. Settle or stop active children
before worker replacement. Restoring archives reverses their visibility effects;
permanent deletion cannot be rolled back. No automatic production deployment is
part of this work.

## Current delivery checkpoint

Backend implementation, real database/API verification and independent reviews
are complete. The returned learner design is retained by provider artifact and
source manifest in [DESIGN.md](../.agent/features/039-sentence-library-management/DESIGN.md).
Frontend implementation now includes the saved library, responsive preview,
versioned archive/restore confirmations, background preparation and prepared-round
launch. The admin composition includes dictionary discovery, filters, preview,
reasoned visibility changes and guarded permanent deletion. Final browser evidence,
fidelity reconciliation and independent completion/security review pass; see the live plan.

The [learner prompt](./design-prompt/sentence-library-and-preparation.md) and
[admin prompt](./design-prompt/admin-sentence-library-management.md) remain frozen
scope references. The admin prompt no longer requires an external design because
the user explicitly authorized local composition.
