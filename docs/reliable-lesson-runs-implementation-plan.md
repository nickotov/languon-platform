---
type: plan
title: Reliable lesson generation with prepared previews and bounded automatic continuation
status: complete
created: 2026-11-17
source_paths:
    - .agent/features/071-reliable-lesson-runs/FEATURE.md
    - apps/backend/src/modules/conversations
    - packages/contracts/src/generation-runs.ts
    - apps/web/src/fsd/features/lesson-generation
---

# Reliable lesson runs

The user authorized this plan and its complete implementation on 2026-11-17, explicitly requiring all changes to remain uncommitted. The feature builds on Feature070; it does not replace its reusable plans, canonical mixed proposals or accounting protections.

## Problem and evidence

A four-part French/Russian lesson saved reading, reading exercises and grammar but repeatedly failed to finish grammar exercises. Numerical execution history shows two invalid candidates below the 4096-token per-call cap and a later call consuming the entire cap. The old 3400-token estimate grouped G06, two G02s and G03 into one call. Exact validation details were discarded. Repeated Continue dispatched the same batch; it did not adapt. Private checkpoints were inaccessible to the learner even though they were saved. Balance alone could not authorize another internal action under ADR-0060.

## Outcomes

1. Generate and validate each exercise as a stable bounded unit. Persist cumulative task-prefix checkpoints, display subprogress, and resume without repeating accepted exercises. Retain logical lesson order independently of generation dependencies.
2. Classify failures safely as output limit, schema invalid, content invalid, transport, interruption, publication or unknown. Retain only bounded diagnostic codes/field paths and an opaque owner-scoped support reference, never raw provider output or user content. Older attempts without recorded diagnostics retain an honest unknown category. Give the action's one safe repair specific diagnostic guidance; ambiguous transport is never automatically retried. Repeated failure pauses with an actionable explanation.
3. Let the owner inspect validated prepared content while running or paused. A dedicated authorized read-only endpoint exposes ordered task fragments plus frozen dependencies; public run summaries and shared notes do not expose private bodies. Preview does not insert, save, copy to library, invoke paid checking or persist practice answers.
4. Continue internal stages on the server under one bounded authorization. The existing configured action credit ceiling and admitted provider-cost ceiling become the whole authorization's ceilings; do not multiply defaults or spend the entire balance. Keep each stage's existing five-call/10000-output limits and provider deadlines. Retain at most eight stages and the existing 15-minute authorization lifetime. Stop, failure, revision/source change, access revocation, expired authority, policy/route changes or exhausted ceilings stop automatic advancement.
5. Respect explicit content/explanation language separately from chat reply language. French lesson content with English chat replies remains supported; contradictory stale planner fields must not override the user's clarified language instruction.

## Product flow

A clear request starts the existing admitted first stage. Once a prepared run exists, successful stages with new checkpoints may queue the next stage automatically within the pinned remaining authorization. The server, not a page effect, owns chaining and recovery after a crash. Returning to the page only reads state. An existing paused run's explicit Retry/Resume may authorize a fresh bounded session through the normal confirmation quote.

The card shows logical parts ready and per-exercise counts. View prepared content is visible whenever a validated checkpoint exists, including failure and active states. The preview extends the approved desktop side-dialog/mobile sheet pattern and existing document renderer. It stays open during progress updates without moving focus or resetting scroll. Stop remains reachable. Technical failures use Retry remaining part; exhausted authorization uses a distinct budget-resume action. Completion exposes one complete reviewed proposal; Insert all and explicit Save retain their existing authority.

## Architecture and invariants

- Preserve the existing turn/worker/lease pipeline. Persist run automation authority and safe failure metadata, and perform every admission with current access, capacity and accounting checks.
- Pin a stable authorization fingerprint over funding, policy, model route, tariffs and provider pricing. Internal stages clamp numeric budgets to remaining cumulative customer/provider ceilings. Unknown liability prevents another stage. Idempotent server request IDs, run locks and current revisions prevent duplicate chains.
- Settle the finished action before granting follow-up work. Successful budget pause requires new validated progress; failed/no-progress work cannot loop automatically. Existing Stop charges eligible partial usage; technical failure releases the current learner hold, and prior accepted charges remain.
- Keep receipt eligibility atomic with checkpoint/proposal persistence. Reusing artifacts never bills them again. No paid provider calls in tests.
- Preview rechecks current owner/source access, uses current-revision accepted artifact IDs, validates hashes, and respects the existing 100000-character aggregate payload limit. Discard/revocation/deletion remove access immediately.
- Preview and private artifact provenance never grant document-writing or source-reading authority.
- Accepted ADR-0061 partially replaces ADR-0060's per-stage manual confirmation and hidden-checkpoint presentation. Other ADR-0045/0050/0055/0058/0060 rules remain binding.

## Implementation stages

1. Contracts and plan: safe diagnostics, unit progress, automation projection and preview response. Add focused contract tests; record approved UI direction and ADR.
2. Authoring reliability: durable exercise-unit planning, stable resumable prefixes, safe SDK error normalization, specific bounded repair and language resolution. Prove the exact mixed activity allocation through deterministic tests.
3. Durable automation: authority persistence, admission clamps/fingerprints, successful-settlement chaining, crash-safe queue recovery and Stop/revocation fences. Generate one current forward migration; preserve existing prepared runs and saved content.
4. Preview and interface: owner-only endpoint, frozen dependency projection, existing-renderer preview, progress/failure/budget controls and isolated stories. Client never schedules generation automatically.
5. Evidence and handoff: focused real PostgreSQL production-worker/accounting tests, affected browser journey with partial preview and automatic completion, responsive EN/RU rendered review, security/completion review, guides/architecture freshness, scoped static/build checks and final readiness.

## Verification

Root owns database resets and compilers. Dedicated disposable PostgreSQL/Redis targets from Feature070 may be reused after identity/guard checks; tests must never reset development data. Focused unit/contract suites take seconds; guarded integration setup and cases are estimated 2–5 minutes; browser startup/journey 1–3 minutes; affected builds/typechecks a few minutes. Estimates do not waive failed gates.

Required proof includes original mixed G06/G02/G03 task, partial exercise resume, malformed keys and nested SDK truncation errors, no transport redispatch, customer/operator/zero-tariff funding, overall ceiling exhaustion, duplicate continuation recovery, Stop races, changed source/access denial, preview confidentiality and discard, and complete proposal Insert/Save/reload. Existing valid unaffected accounting/provider evidence can be reused only after a source/consumer comparison.

Current execution, results and review live in [Feature071](../.agent/features/071-reliable-lesson-runs/EXEC_PLAN.md). Finish with an uncommitted reviewed patch on `feature/reliable-lesson-runs`; do not commit, merge, push or delete branches.

Implementation and selected verification completed on 2026-11-18. Independent completion/security reviews approved. All changes remain uncommitted on `feature/reliable-lesson-runs`, as requested. See the [evidence record](../.agent/features/071-reliable-lesson-runs/EVIDENCE.md) for exact checks and the live-provider limitation.

## Recovery after an interrupted stage

The November 18 follow-up traced an idle stream reconnect, a rejected Continue targeting an older run, and the limits used to admit a new stage. The detailed implementation and verification plan is maintained with feature 071. [Incident recovery plan](../.agent/features/071-reliable-lesson-runs/INCIDENT_RECOVERY_PLAN.md)

## Single-submission generation

ADR-0062 updates the recovery rules above. A settled exercise rejection is a durable checkpoint for choosing the next strategy. The scheduler can repair it or move to a different fallback within the same finite lesson authorization. Reopening the lesson observes that progress. On a persistent failure the learner can still preview completed material and see which exercise stopped. Older paused runs retain their current revision and require deliberate resumption.

The implementation plan and acceptance case cover the French reading, three comprehension exercises, COD/COI grammar and five grammar exercises. Operational queries report how many lessons finish without manual commands, recovery by activity and strategy, completion time and settled provider expense. [Implementation plan](../.agent/features/071-reliable-lesson-runs/SINGLE_SUBMISSION_PLAN.md) · [Decision](adr/0062-single-submission-lesson-recovery.md) · [Operational checks](operations/critical-workflows.md#measuring-single-submission-lesson-completion)
