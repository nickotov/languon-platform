# ExecPlan: Flashcard training backend and design handoff

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-02

## Goal and specification

Deliver the backend-only scope explicitly authorized on 2026-10-02, then save a
grounded Magic Patterns prompt and stop for the returned design. FEATURE.md owns
AC-1–AC-9; [baseline](../../../docs/flashcard-training-implementation-plan.md) records
resolved product decisions. Frontend and other exercise modes remain outside scope.

## Architecture and decisions

- D-1 — Independent learning module/contracts; dictionaries retain vocabulary and
  live authority through an infrastructure transaction participant. ADR-0024 records
  persistence/epoch/lifetime decisions within existing DDD/Drizzle constraints.
- D-2 — Monotonic learning revision, not authored version/hash. Effective enabled
  learning settings participate even where optional values are absent; inactive
  retained values do not. Defaults invalidate only effectively affected entries,
  including archived ones, without authored metadata changes.
- D-3 — One current result per learner/entry and content-free attempt history.
  Learner-wide transaction serialization protects operation IDs/session/entry order.
  Historical accepted-attempt replay can acknowledge without restoring stale state;
  Undo replay requires current learning version. No persistent queue resume.
- D-4 — Explicit foreign-dictionary learner purge because user rows are tombstoned.
  Composite cascades remove state on permanent content deletion; all referencing
  learning FKs have indexed lookup prefixes.
- D-5 — Backend feature completes only its bounded scope. BL-002/BL-003 remain
  in progress; design handoff deliberately stops before frontend implementation.

## Test and review strategy

Unit/contracts and real disposable PostgreSQL for migrations, epochs, isolation,
idempotency, preferences, concurrency, Undo, cleanup, 10k preparation/invalidation
and 5k-progress lookup plans. Actual auth/JWT/session + Redis + PostgreSQL HTTP
journeys, safe runner tests, affected static/build/schema checks and guide mappings.
Independent completion and material SQL/auth/personal-data security review; separate
tester assesses purge/deletion race. No paid model calls or UI implementation.

## Milestones

- [x] M1 — Scope, source audit, interfaces and ADR; AC-1–AC-8.
- [x] M2 — Learning revisions and lifecycle integration; AC-1/6/7.
- [x] M3 — Learning contracts, persistence and API; AC-2–AC-7.
- [x] M4 — Code-grounded versioned design prompt; AC-9.
- [x] M5 — Final checks, independent-review closure and evidence; AC-1–AC-8.
- [x] M6 — Local feature squash merge, verified handoff and stop.

## Progress and remediation

- 2026-10-02 — Created feature/flashcard-training-backend from main b7f4fe7 and
  feature workspace033, preserving planning edits. Bounded workers owned contracts/
  projection, dictionary revisions, learning storage, API and documentation.
- Implemented manual/two AI writer learning epochs, selective batched defaults,
  preferences/attempts/progress/Undo, owner/shared access, admission, cleanup and flag.
- Real HTTP journeys exposed forbidden colon rate-limit scopes. Dotted scopes and
  a concrete Redis adapter-validation regression fixed the integration gap.
- Broad verification hit local high-load timeout variance: unfinished timeout
  callbacks overlapped later fixtures. Isolated tests and read-only DB inspection
  ruled out lingering locks; bounded setup/teardown/max-import and HTTP journey
  budgets preserve every assertion. Final dictionary31 passed80.98s; only two
  explanatory comments changed afterward.
- Initial completion review R1: removed entries wrongly looked like missing
  dictionaries. Distinct entry error/HTTP404 plus PG and real HTTP regression resolve it.
- Initial review R2: progress card/attempt cascade lookup indexes were missing.
  Generated migration0040 and all-FK audits/natural5000-row plans resolve it.
- Independent security initial and narrow R1 reviews found no material security
  issue; independent tester verified foreign purge and deletion-pending lock race.
- v001 prompt is immutable, matches canonical SHA256, and has no frontend target.

## User-flow and design evidence

[API guide](../../../docs/user-flows/flashcard-training-backend.md) maps owner rating/
replay/Undo/removed entry, independent shared learners, and anonymous/revocation
scenarios to learning-composed-routes.test.ts, revision sha256:4a4c05b26fc6dd4e.
Reviewed runner owns ephemeral PostgreSQL/Redis and refuses pre-existing containers.
[DESIGN.md](DESIGN.md) owns frozen prompt and returned-design slot.

## Current checkpoint and remaining work

Backend-only scope is complete. Final checks and independent completion/security
reviews passed; R1/R2 are resolved. The feature was squash-integrated onto local
main without conflicts; the final local commit includes this closure record.
Owned disposable PostgreSQL/Redis containers were removed. Development containers
were preserved. No push or branch deletion was performed.

Stop until the user supplies the design. Frontend implementation is untouched;
browser/frontend checks are deferred, not waived. BL-002/BL-003 remain in progress.
The copyable prompt and immutable v001 snapshot match. No external blocker affects
the completed backend slice.
