# ExecPlan: User AI model preferences backend

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-04

## Goal and specification

Implement AC-1 through AC-6 for the authorized BL-005 backend prerequisite. The
shared [delivery plan](../../../docs/sentence-practice-implementation-plan.md) owns
cross-feature product decisions and backend → design prompt → returned design →
frontend checkpoints. User resumed implementation on 2026-10-04.

## Existing architecture

Dictionary catalog/router and immutable configuration are current execution
sources. Admission reads the global revision; reservations guard dictionary jobs.
Users have no model preference. Reuse typed ports, transactional user checks,
optimistic versions, canonical configuration and existing deterministic fixtures.
ADRs 0011, 0012, 0019, 0021 and 0022 constrain implementation.

## Test and review strategy

Unit/contracts for selection and public redaction; HTTP/service checks; disposable
PostgreSQL migration/preferences/admission races; current routed-generation,
provider-management and credit integration/E2E evidence. Required static checks:
changed workspaces lint/typecheck/build, database classification/check, docs and
mapped guide checks. No new UI/browser fidelity proof before the designer returns.
Independent completion review and security review required after author preflight.
Separate tester required: bounded independent migration/concurrency and durable
worker fixture validation because execution snapshots and routing cross boundaries.

## Milestones

- [x] M1 — Shared selection, preferences/contracts/HTTP, persistence and pinning (AC-1–AC-5).
- [x] M2 — Disposable checks, deterministic critical journey and docs/ADR (AC-6).
- [x] M3 — Author preflight, independent review/security/test audit and remediation.
- [x] M4 — Final verification, evidence and verified backend handoff.

## Current progress

- 2026-10-04 — Feature 035 allocated and feature branch created from current main;
  existing uncommitted planning-only documents are part of this authorized scope.
- 2026-10-04 — Shared text-AI selection, authenticated preferences, dictionary
  admission pinning, additive migrations 0041–0043, mixed-worker guards and
  account-purge cleanup implemented. Contracts, focused database/journey checks,
  backend unit suite and build passed. Existing provider/credit browser regressions
  and least-privilege purge/SQL guard proofs are being completed before review.

## Decisions and discoveries

- D1 — Backend-scoped delivery matches flashcard precedent. BL-005 stays in
  progress until profile UI is implemented; sentence backend follows this feature.
- D2 — Shared infrastructure reuses configuration storage; no table rename or
  generic job registry. Explicit selection requires per-job pinned execution.
- D3 — No new allowance/pricing or automatic model fallback; inherited gates stay off.

## Validation links

[EVIDENCE.md](EVIDENCE.md) owns results and tested state.
[REVIEW.md](REVIEW.md) owns findings/dispositions.

## Remaining work

Complete existing provider/credit browser regressions, raw-SQL selected-job guard
proofs and real account-purge-role compatibility; update evidence, perform author
preflight and independent correctness/security review, remediate, then merge the
backend feature locally and begin the sentence backend. Design prompts remain
pending until both backend feature scopes are verified.

- 2026-10-04 — Author preflight passed: final backend/contracts lint/typecheck,
  backend/database builds, real SQL guards, restricted purge role, deterministic
  preference API/worker, existing provider and credit Chromium journeys, migration
  classification and user-flow traceability. Independent reviews requested.

- 2026-10-04 — Security review passed. Completion review requested two fixes:
  capability observations must not be refreshable by legacy worker upserts, and
  provider circuits must be scoped by pinned model/provider rather than format.
  Both remediations and focused regressions assigned; M3 remains open.

- Remediation decision: keep historical format-only circuit rows for unpinned
  unmanaged jobs. Managed Auto and explicit jobs derive provider/model/format
  circuit keys from immutable execution snapshots. Historical failures are not
  assigned speculatively to a provider; fresh scoped circuits prevent cross-model
  poisoning or recovery. Exact-format capability evidence uses a versioned
  observation identity and the runtime worker's configured format list.

- 2026-10-04 — Both review fixes and exact-format readiness are implemented.
  Migration 0044 generated and classified expand. Preferences PG10, circuit+SQL
  guard PG2, routing units37, text-AI units19, composed API/worker1 and both
  Chromium journeys1 each passed; default backend679, static/build/docs checks
  passed. Refreshed73-file preflight digest recorded, scoped follow-up reviews
  requested. No frontend delivery occurred.

- 2026-10-04 — Scoped completion and security remediation reviews passed against
  the exact73-file digest, with both findings resolved and no new material issue.
  Backend scope Complete; final local feature commit/squash handoff follows.
  Next: sentence backend feature from updated main, then both versioned prompts.
