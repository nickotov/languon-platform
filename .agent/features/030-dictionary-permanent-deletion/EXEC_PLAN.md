# ExecPlan: Dictionary Permanent Deletion

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-26
Branch: `feature/dictionary-permanent-deletion`
Base: `main` at `ff3d1b0`

## Goal and architecture

Deliver AC-1 through AC-14 with one dictionary-owned deletion capability. The backend performs synchronous, atomic logical deletion after prerequisite checks. It returns retryable `deletion_busy` while generation/document state cannot be removed safely. Existing audio cleanup continues asynchronously from retained object inventory. A focused deletion service/store owns orchestration; existing dictionary read/write APIs remain unchanged except list responses expose lifecycle-wide archived counts needed for discoverability.

The API uses preview-plus-command semantics:

- owner-scoped dictionary and dictionary-card preview endpoints return exact eligible count and opaque snapshot;
- command endpoints accept selected IDs/versions or an all-archived preview snapshot plus `Idempotency-Key`;
- single deletion is a one-item selected command;
- receipts retain only opaque IDs/count/version and request fingerprint.

The migration is additive. Existing create/fork/import idempotency rows gain an invalidated terminal state. A content-free provider-usage archive preserves the rolling budget contribution of removed generation jobs. No migration deletes existing content.

## Test and review strategy

- Domain/unit: selection validation, snapshot/fingerprint stability, archived-only rules, error mapping, idempotency replay/conflict/invalidation, retained usage aggregation.
- Contract/HTTP: strict request/response schemas, owner authorization, selected/all preview commands, busy/conflict/non-disclosure behavior, OpenAPI registration.
- Disposable PostgreSQL: clean migration; selected-set rollback; cross-owner/membership/version races; preview staleness; idempotent replay; import/fork invalidation; job/document guards; revisions/proposals; audio cleanup inventory; provider/credit accounting; share revocation; fork preservation.
- Web: selection state and API mapping tests, confirmation validation, mutation success/error/conflict behavior, query refresh, localization.
- E2E/browser: deterministic local owner journeys for single/selected/all dictionary and card deletion, stale/busy preservation, keyboard/focus, desktop/narrow and 200% zoom.
- Static/build/docs: affected package/backend/web lint, typecheck, tests and builds; migration and user-flow checks.
- Independent completion review: required after author preflight.
- Separate tester: required for multi-table transactional, provider-budget, document/audio cleanup, and cross-page browser journeys.
- Security review: required for destructive owner authorization, content erasure, retained data, idempotency, and object cleanup.

## Milestones

- [x] M1 — Contracts, persistence, and deletion invariants (AC-4–AC-10)
    - Add accepted ADR-0023, strict contracts/errors, additive migration/schema, usage archive, idempotency invalidation, deletion receipts, deletion service/store, cleanup coordination, routes, and focused unit/HTTP/PostgreSQL tests.
    - Prove atomic rollback, concurrency fences, object inventory safety, and accounting preservation.
- [x] M2 — Archived-library deletion UX (AC-1, AC-2, AC-5, AC-6, AC-11–AC-13)
    - Add lifecycle-wide count/preview API client support, row/toolbar selection, single/selected/all confirmation, typed dictionary confirmation, localized states, and focused web tests.
- [x] M3 — Archived-card deletion UX (AC-3–AC-6, AC-11–AC-13)
    - Add per-dictionary archived-card selection and toolbar, acknowledgement dialog, success/conflict/busy recovery, query refresh, and focused web tests.
- [x] M4 — Cross-boundary evidence (AC-2, AC-3, AC-7–AC-14)
    - Add/update user-flow guides and mapped deterministic E2E; execute disposable DB, browser desktop/narrow/zoom, affected lint/typecheck/test/build and traceability checks.
- [x] M5 — Author preflight, independent reviews, remediation, completion (AC-14)
    - Reconcile acceptance/evidence, inspect final diff, run separate tester plus completion/security reviews, remediate findings, rerun invalidated proof, complete artifacts, squash-merge into `main`.

## Current progress

- 2026-09-26 — User explicitly authorized permanent archived dictionary/card deletion with selected and all-archived bulk operations.
- 2026-09-26 — Created Feature 030 branch and artifacts from clean `main`.
- 2026-09-26 — Product discovery fixed archived-only eligibility, dictionary child semantics, atomic bulk behavior, confirmations, selection, and exact-count behavior.
- 2026-09-26 — Architecture discovery rejected broad cascades and a new deletion saga. Selected synchronous prerequisite checks plus existing async audio cleanup, retained content-free usage, and idempotency invalidation.
- 2026-09-26 — Implemented strict preview/command contracts, a focused transactional deletion store, additive persistence, provider-budget union accounting, account-purge support, owner routes, and archive-only web controls in four locales.
- 2026-09-26 — The first enum-based migration exposed PostgreSQL `55P04` because the project migration runner applies all pending statements in one transaction. Replaced it with an existing-state content-free tombstone and regenerated one clean migration; fresh migration and 31 disposable PostgreSQL tests pass.
- 2026-09-26 — Contracts, backend and web affected suites/static/build checks pass. Three mapped Playwright journeys pass against isolated PostgreSQL/Redis, and real-browser card/dictionary deletion passes at desktop and narrow width with no runtime errors.
- 2026-09-26 — Initial correctness/security review found invalid retained-job redaction, lock-order, stale-cache, empty-control, recent-authentication, contention, and evidence gaps. Remediation now stores readable null payloads, follows generation admission/owner lock order without the global audio lock, narrows selected queries/cleanup, evicts deleted caches, hides empty controls, requires recent authentication, and expands database/E2E proof.
- 2026-09-26 — Final disposable evidence directly proves admission-before-row locking, provider-usage budget retention, document/audio busy fencing and cleanup handoff. Completion and security re-reviews approve with no material findings.
- Immediate next action: squash-merge the completed feature to `main`.

## Decisions and discoveries

- D-1 — Product term is **Delete permanently**. “Remove” is ambiguous in draft/import/review contexts.
- D-2 — Only archived parent targets are directly deletable. Deleting an archived dictionary includes every child card; deleting cards requires each selected card to be archived and its dictionary active/owned.
- D-3 — Selected requests are all-or-nothing. All-archived uses a preview snapshot so confirmation cannot silently expand under concurrent lifecycle changes.
- D-4 — Unsafe generation/document state returns retryable `deletion_busy`. A persistent deletion queue was rejected because it adds a second lifecycle, hidden-resource filtering, cancellation/recovery APIs, and wider race surface without being required.
- D-5 — Audio object inventories/jobs outlive logical content long enough for existing fenced cleanup to remove all physical versions; job text is scrubbed and accounting fields remain.
- D-6 — Settled generation usage moves to content-free operational history before job removal. AI-credit ledger records remain; deletion is not a refund.
- D-7 — Original create/fork/import idempotency records become invalidated and payload-free. Deleting them would allow a network retry to recreate erased content.
- D-8 — ADR-0023 is required because deletion disposition and remote-writer/accounting coordination are durable cross-component rules.
- D-9 — Idempotency invalidation uses the existing `completed` state with null result fields. Adding and immediately using a PostgreSQL enum value is incompatible with the repository's single-transaction migration runner.

## Validation links

- Acceptance-to-proof mapping: [EVIDENCE.md](./EVIDENCE.md).
- Review boundary, findings, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining work

M1 through M5 are complete. No implementation work remains.
