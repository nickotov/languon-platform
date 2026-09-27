# ExecPlan: Inline AI Field Generation and Source Normalization

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-27

## Goal and specification

- Deliver AC-1–AC-11 from `FEATURE.md` on `feature/inline-ai-field-generation`.
- Reuse the durable dictionary-generation aggregate and existing authoring UI;
  preserve v1 drain and the separate `single-card:v1` advanced rewrite.

## Existing architecture

- `card-authoring:v1` creates cards from a cumulative proposal, excludes Source,
  and requires the first request to target all fields. Its public job has no card
  target and its database rows must have null card/version columns.
- Add/Edit share `DictionaryCardForm`, but AI authoring state is currently wired
  only for `editing === 'new'`. Saved-card AI uses a separate durable whole-card
  proposal panel with custom instructions.
- Provider routing, AI-credit reservation/settlement, leases/fencing, proposal
  expiry/redaction, and capability flags are reusable. The existing card columns
  on generation jobs allow v2 update targeting after a check-constraint migration.

## Test and review strategy

- Unit/contract: v2 schemas, source normalization result, dependency/bounds,
  prompt adapter, worker dispatch, and frontend state transitions.
- Integration/database: disposable PostgreSQL migration, create/update admission,
  predecessor/ownership/version rules, atomic acceptance, revision/authorship,
  credits, idempotency, and v1 compatibility.
- UI/E2E/browser: focused component/API tests, mapped dictionary-platform
  Playwright journeys, and real-browser desktop/320 px/200%/keyboard/locale checks.
- Static/build: affected package builds, lint/typecheck, and final repository check.
- Independent completion review: required after author preflight.
- Separate tester: required for the cross-application durable create/update and
  mapped E2E journey; bounded to evidence adequacy and unresolved integration risk.
- Security review: required for model I/O, authorization, SQL acceptance, and
  persisted provenance changes.

## Milestones

- [x] M1 — Versioned domain, contracts, provider, and persistence
    - Objective/components: v2 create/update targets, Source result/basis,
      migration, worker and rollout compatibility.
    - Acceptance IDs: AC-3–AC-8, AC-11.
    - Required checks: contracts, backend unit/integration, disposable database.
- [x] M2 — Inline Add/Edit field experience
    - Objective/components: field state machine, local/bulk actions, alternatives,
      edit orchestration, localization, advanced-action distinction.
    - Acceptance IDs: AC-1–AC-6, AC-9–AC-10.
    - Required checks: web component/API tests, stories, typecheck/build.
- [x] M3 — Guide, full verification, and author preflight
    - Objective/components: guide/E2E synchronization, browser/database evidence,
      final diff and acceptance audit.
    - Acceptance IDs: AC-1–AC-11.
- [x] M4 — Independent review, remediation, and completion
    - Objective/components: tester, correctness review, security review, focused
      remediation review, final artifacts and squash merge.

## Current progress

- 2026-09-27 — Feature authorized after read-only discovery established that
  Source and first-time field generation cross the v1 public contract boundary.
- 2026-09-27 — Feature workspace and branch created; specification and execution
  decisions recorded.
- 2026-09-27 — M1–M3 implemented and verified. Author preflight found and fixed
  two real cross-layer defects: a normalized Source could not start a second
  successor, and Accept all skipped a newly generated value after an earlier
  option had been accepted. Disposable DB regressions and mapped browser journeys
  now pass.
- 2026-09-27 — Tester, correctness, and security reviews completed. Six review
  findings and one security finding were remediated; focused remediation review,
  final package suites, exact mapped Playwright, and managed browser verification
  passed. The feature is approved for the required local squash merge.

## Decisions and discoveries

- D-1 — Add `card-authoring:v2` and retain v1 lifecycle support. Mutating v1
  would violate ADR-0012 mixed-release compatibility; no new ADR is required.
- D-2 — One v2 job kind supports create and update targets. This keeps one inline
  UI/provider contract and reuses existing job card/version columns.
- D-3 — Stored non-Source suggestions carry their Source basis. The server and UI
  can therefore enforce coherent acceptance without trusting model claims.
- D-4 — A Source result is suggested or unchanged. Correct input is never forced
  into a meaningless distinct alternative.
- D-5 — Inline review replaces the input. Accept/Reject return to the editable
  draft; old choices are opt-in. The advanced saved-card rewrite remains separate.

## Validation links

- Acceptance-to-proof mapping and checks: [EVIDENCE.md](./EVIDENCE.md).
- Review boundary, findings, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining work

- None inside the feature boundary. Perform the required local squash merge into
  `main` and rerun checks affected by merge resolution.
