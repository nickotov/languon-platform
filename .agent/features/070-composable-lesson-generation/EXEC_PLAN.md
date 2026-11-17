# ExecPlan: Composable resumable lesson generation

## Goal and authority

Implement [FEATURE.md](FEATURE.md), AC-1–11, following accepted ADR-0060 and the user's explicit implementation request. Feature branch `feature/composable-lesson-generation` began from clean `main` at `ab2c5ebb`. Root owns integration and final gates; bounded workers contributed source, tests, docs and independent review.

## Milestones

- [x] M1: Reusable typed plans, mixed proposal and generated-source contracts (AC-1/3/4), commit `6b9a5800`.
- [x] M2: Clarification/failure reliability, dependency-aware bounded executor and capacity checks (AC-2/5).
- [x] M3: Durable runs, revisions, checkpoints, source choices, fenced routes and final proposal publication (AC-5/6/8/9).
- [x] M4: Atomic validated-call eligibility and cumulative stage accounting, retaining Stop charging (AC-7).
- [x] M5: Run controls, quoted continuation, revision/source UX, mixed preview and insertion (AC-10), commit `5a114cbb`.
- [x] M6: Final gates, current docs and independent source/security/evidence approval (AC-11). Local integration follows the reviewed squash policy.

Backend, migrations, SQL grants and regressions are committed as `f9896f6f`. Final reviewed frontend ownership/style remediation is `8103ee26`, with passing style, unit and production-build checks. See [EVIDENCE.md](EVIDENCE.md) for exact selections, results and their limits; [REVIEW.md](REVIEW.md) for remediation and approval.

## Binding decisions

- One canonical mixed `KnowledgeBody` proposal replaces the old block-only proposal contract. Prose-only ordinary draft editing remains narrowly scoped; mixed proposals use reviewed insertion and explicit Save.
- Run and action lifecycles remain distinct. Existing worker leases fence mutations; explicit Continue always obtains fresh admission. Reconnect never dispatches.
- Each action keeps existing call/output/deadline limits. Sequential homogeneous batches use validated dependencies; uncertain transport and truncated structured output are not retried blindly. Minimum-next-unit checks prevent paid no-progress loops.
- Stop retains eligible partial-usage charging. Technical failure makes that action free; prior accepted stages remain charged. Accounting owns cumulative exact rounding; reused artifacts are not billed again.
- Paused plan revisions reuse unchanged artifacts and invalidate changed descendants; order-only revisions reuse all matching results. Apply plan and source refresh remain paused and do not admit execution. Completed output is immutable.
- Keep captured source preserves historical provenance; Refresh creates a new snapshot/revision. Both recheck current access. Captured-block provenance never grants live document/private-run read authority.
- Discard removes private snapshots, revisions, artifacts, candidates, hidden proposals and replay data; preserves only opaque/numeric audit. Pending planner state transfers atomically into private run authority.
- No provider change, automatic research, generic workflow engine, new environment variables or paid smoke is included.

## Verification strategy and final state

Selected before coding: scoped contracts/authoring/request/accounting unit suites; actual disposable DB lifecycle, settlement and worker/SDK fake-HTTP proof; new continuation and existing mixed/vocabulary browser journeys; desktop/mobile EN/RU rendered review; scoped lint/readability/typecheck/build; relevant guide mappings, architecture viewer and capability doctor. Full repository regressions were not selected because the affected seams are covered directly. Destructive test resets use isolated PostgreSQL/Redis targets, never development data.

All selected checks pass. The original lesson incident is retained through the real production composition. Additional review-requested DB tests prove migration preservation, private-data cleanup, revision CAS/reuse and Refresh invalidation. Local development migrations have been applied and final doctor readiness is true. No live provider execution is claimed.

The original failed turns made three provider calls; the old scheduler replay was `[reading]`, `[reading-exercises + grammar]`, `[grammar-exercises]`. The new homogeneous scheduler has four authoring batches plus planning for that retained request. The exact historical exception was not persisted; no false root-cause claim is made.

## Documentation and backlog

Updated the three affected guides, ADR/index, architecture and six diagrams; all ten diagrams are current and the viewer renders them. New stable scenario: `workspace-composable-lesson-continuation`.

BL-013/015 remain Done. BL-016 remains In progress: Feature070 completes the owned-Knowledge composition slice, not dictionary/text/shared-source standalone artifact practice. Allocation is synchronized in its existing record; no unrelated backlog task is reopened.

## Handoff steps

1. Final independent evidence approval confirmed against the committed source and updated records on 2026-11-17.
2. Commit delivery docs, inspect clean scoped diff, squash-merge the feature locally into `main` as one commit.
3. Report implementation, local readiness and absence of live paid proof separately. Do not push or delete the feature branch.
