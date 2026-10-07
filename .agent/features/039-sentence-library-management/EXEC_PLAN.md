# ExecPlan: Saved sentence management and full-dictionary preparation

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-07

## Goal and execution constraints

Complete AC-1–AC-9 and the returned learner design/local responsive admin stage.
The backend-first checkpoint remains recorded below. Work stays on
feature/sentence-library-management until whole-feature verification and independent
review pass, then follows the required local squash integration. Preserve ordinary
sentence-practice behavior and its existing selected design.

## Architecture and decisions

Learning owns exercises/library/preparation and visibility. Administration owns
membership/recent-auth/audit and injects a focused learning-management port.
Existing typed generation jobs retain credit kind and capacity; new preparation
formats fence older worker binaries while execution/pricing resolve base formats.
Per-user and global archive state use separate additive tables. Database remains
durable source of truth. Explicit exercise-ID erasure avoids broad learner purges.

D1: snapshot confirmation for all-matching mutations; no expansion afterconfirm.
D2: preparation snapshots full eligible dictionary in<=100-entry partitions, first
partition intendedround scope; job candidate shortlist12 and targets<=3 retained.
D3: preparedBatchId identifies partition, aggregate progress exposes initialBatch
and batchCount rather than unbounded manifest. Child publication skips exposure.
D4: stops settle current work before paused resume; no premature refundpromise.
D5: management preview explicitly reveals reference but does not complete practice.
D6: admin permanent deletion only creator-personally-archived; busy synchronous.

## Test and review strategy

Contracts + pure units; real disposable PostgreSQL/Redis migrations, stores, worker,
admin transaction/auth/audit, credits, idempotency and deletion. Fake providers only.
Existing sentence backend journey runner is canonical registered command.
Separate tester required for concurrency/infrastructure/privileged erasure; bounded
independent testassignment. Independent backend checkpoint and security review
after author preflight. Browser newfeature coverage deferred with UI; existing UI
has no change and its valid proof is retained. Frontend later follows supplied
source fidelity/browser requirements.

## Milestones

- [x] M1: scope/contracts/persistence/migration (AC-1–AC-5/8).
- [x] M2: library/admin/archive/purge and visibility integration (AC-1–AC-4).
- [x] M3: durable background preparation/worker/prepared practice (AC-5–AC-7).
- [x] M4: real database/API proof, affected checks, author preflight and backend/security review (AC-8).
- [x] M5: portable plan + two frozen detailed design prompts and guide/backlog links (AC-9), awaiting user designs.
- [x] M6: selected-design web integration, locally composed responsive admin UI, real browser journeys and full completion review.

## Frontend resumption — 2026-10-07

User selected the returned Magic Patterns `/sentences` design and authorized
local admin design. Implement the FEATURE fidelity inventory, wire existing
contracts, extend maintained browser journeys, then perform author preflight,
independent completion/security review and remediation. Preserve previous
practice design history and backend checkpoint evidence.

## Progress

2026-10-06: Approvedplan authority recorded, preceding work locally squash-integrated,
featurebranch/workspace created. Parallel non-overlapping contracts/library/preparation/
admin workers active. Root owns integration, old practice store/service/routes,
composition, migration generation, restricted-role grants, docs and handoff.
Contracts86 tests/static/build pass; downstream integration underway.

## Validation and remaining work

Evidence: [EVIDENCE.md](./EVIDENCE.md); review: [REVIEW.md](./REVIEW.md).
All backend milestones pending integration/checks. New UI intentionally deferred.
No external blocker. Do not assert backend ready from compilation alone.

## Backend integration progress — 2026-10-06

- Prior sentence assistance/UI work was locally squash-integrated into main as
  `cb9f3ed`; this feature runs on `feature/sentence-library-management` from that
  baseline. No push or branch deletion performed.
- M1 contracts/schema/migrations are implemented and verified.
- M2 library/admin/archive/purge and ordinary-practice visibility are verified.
- M3 preparation uses the existing worker, credit policy and paginated manifests.
- M4 real DB/API proof and independent backend/security reviews are approved.
- M5 plan/backlog/guide links and two frozen design briefs are saved.
- M6 new web/admin controls await the returned selected Magic Patterns designs.

Decision: existing backend guide and its registered runner cover the extended
sentence-management journey. New browser scenarios belong to the later design
integration; current browser guides link the backend checkpoint without claiming
unimplemented controls.

## Independent review remediation

Initial completion/security reviews requested changes. Addressed in the same
feature scope: live preparation capability publication, capacity-before-user
lock order for destructive admin operations, opaque content-aware confirmation
versions, admin-only creator identifiers, completed-stale projections, paginated
later partitions, bounded durable saved-scan steps and retained-copy quotas/TTL.
Generation stop now explicitly settles an admitted child instead of cancelling it.

Schema migration 0056 adds the saved-scan cursor and actor/dictionary snapshot
retention index. Restricted worker grants add only manifest deletion and snapshot
identity/deadline cleanup permissions; confirmation contents remain unreadable.
Fresh real-database concurrency/retention tests and narrow reviewer reassessment
are required before the backend checkpoint is verified.

## Verified backend/design checkpoint — 2026-10-06

M1–M5 are complete for the authorized backend-first checkpoint. Final dedicated
DB proof: 56/56; maintained authenticated API journeys: 2/2; contracts: 90;
deterministic backend: 823 passed; affected static/build/guide checks passed.
Completion and security reviewers approved the remediated backend. All material
R1–R7 / SEC1–4 findings are closed; low SEC05 trusted-worker hardening is documented.
See EVIDENCE and REVIEW for precise scope and proof.

Saved two detailed canonical design prompts, frozen exact portable v001 briefs,
hashes and source manifest in DESIGN. Neither design has a returned provider URL
or selected implementation target. M6 remains pending: wait for the user's Magic
Patterns designs, inventory them, implement the new web/admin controls, verify
real-browser/E2E behavior, and perform final whole-feature review. Do not merge
this feature into main or mark it Complete at this checkpoint.

## Frontend implementation and verification progress — 2026-10-07

Web library/preparation and admin management controls are implemented. Production
frontend review found a later-round pagination regression; retained-depth refresh
and its regression test resolve it. Browser testing corrected a custom-header
dialog accessible name and a decorative admin icon contaminating button labels.
All 487 web unit tests and 30 admin unit tests pass. Preparation reconnect and
prepared-round launch pass against real disposable infrastructure. Library/admin
browser scenarios and final rendered-state comparisons are being completed.
No paid model service or normal development data is used.

## Final frontend preflight — 2026-10-07

Current web lint/typecheck and 53 files / 494 tests pass; admin lint/typecheck
and 5 files / 31 tests pass, including lazy dictionary discovery. Frontend
architecture tests pass 9/9. The prior full browser run proved persistent
selection, exact mobile viewport geometry and prepared launch; final full runs
follow the library settings action and unavailable admin-account guard fixes.
Required owner flashcard regression passes 1/1. Completion remains pending final
browser results, final web build and independent verdict.

## Verified completion — 2026-10-07

M6 and the whole-feature Definition of Done are complete: learner browser 9/9,
admin browser 9/9, owner flashcards 1/1, web 494 unit tests, admin 31 unit tests,
affected lint/typecheck/production builds, architecture and guide mappings pass.
Independent completion/security verdict approves all frontend remediation.
Source-based fidelity and locally authorized admin composition are recorded with
runtime captures; no reference screenshot pixel claim. Backend checkpoint proof
remains valid because production backend code is unchanged in this frontend stage.
Backlog BL-010 is Done; BL-007 remains pending. Required local feature commit and
squash integration follow final artifact/diff checks; no push or branch deletion.
