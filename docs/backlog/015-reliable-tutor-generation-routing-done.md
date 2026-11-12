---
type: backlog-task
id: BL-015
title: Reliable tutor intent, clarification and generation outcomes
status: done
created: 2026-10-31
updated: 2026-11-12
original_tasks: '2026-10-31 Russian vocabulary and exercise response diagnosis'
evidence:
    - .agent/features/061-reliable-learning-content-pipeline/EVIDENCE.md
    - .agent/corrections/bl-015-completion.md
depends_on:
    - BL-013
---

# BL-015 — Reliable tutor intent, clarification and generation outcomes — Done

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Current delivery

[Feature 060](../../.agent/features/060-intent-aware-learning-content/FEATURE.md)
delivered initial Knowledge request resolution, clarification continuation and
typed generation outcomes. Its
[evidence](../../.agent/features/060-intent-aware-learning-content/EVIDENCE.md)
covers that bounded slice.

The user authorized [feature 061](../../.agent/features/061-reliable-learning-content-pipeline/FEATURE.md)
on 2026-11-06 to complete this behavior with BL-013's canonical tools, shared
phase budgeting, prepared history and targeted frontend reconciliation. The
[execution plan](../../.agent/features/061-reliable-learning-content-pipeline/EXEC_PLAN.md)
owns implementation and verification. Implementation and selected verification
are complete. On 2026-11-12, after the remaining key-rotation item and live-model
evidence limits were explained, the user explicitly instructed: “so mark it done”.
BL-015 is closed under that instruction; unconfirmed key rotation remains an
operational follow-up in feature 061.

## Current security and delivery limitation

Implementation and selected verification pass. The final post-S3 registered gate
passed 308 tests across 24 files with no skips/retries. Selected browser journeys,
affected static/build checks and independent source/data/native evidence review
pass. A strict metadata allowlist and safe merge prevent provider credentials
from persisting in observational-memory configuration. One verified local unsafe
configuration was scrubbed; zero remain, with observations and other data preserved.

The former backlog closure condition was S3's operational High security remainder:
rotation/revocation of the affected provider key or explicit residual-risk
acceptance. No exfiltration evidence was found. On 2026-11-11 the user committed
to updating the key and authorized main integration. On 2026-11-12 the user
explicitly requested closing this implemented task after the outstanding
rotation was explained. This closes BL-015 without claiming rotation occurred
or that the operational incident is resolved. See feature 061's
[evidence](../../.agent/features/061-reliable-learning-content-pipeline/EVIDENCE.md)
and [review](../../.agent/features/061-reliable-learning-content-pipeline/REVIEW.md).

## Problem and outcome

The user requested a vocabulary block but received a translation table, then
requested exercises and received Markdown. Source inspection found optional
tool selection, prose-oriented tutor instructions and no artifact completion
requirement. The original provider conversation was not replayed; these are
established implementation gaps, not a verified trace of that incident.

## Scope and acceptance

- Resolve turns into explanation, clarification, content generation, revision or
  an explicit capability limitation. Capture a validated generation brief with
  source, languages, content/format, difficulty, count and intended destination.
  Distinguish explicit settings, contextual inference and defaults.
- Clarify only material missing/ambiguous inputs. Use explicit language choices
  and approved context/preferences first; do not infer studied language from UI
  locale. Offer a concise format choice or stated useful default instead of a
  questionnaire. Preserve pending brief state across clarification replies.
- Use BL-013 capabilities and server permissions when choosing tools. In an
  authorized owned Knowledge workspace, requests for vocabulary/exercises produce
  corresponding typed proposals. Plain explanations remain natural prose.
- A generation plan succeeds only when its expected validated artifact exists.
  Prose-only output triggers bounded repair inside the same action allowance,
  then a clear retryable failure if unresolved. No silent Markdown substitution,
  duplicate proposal or unbounded retry/model loop.
- Align main tutor and tool prompts with this contract, preserving untrusted
  context handling, explicit Apply/Save and answer-reveal behavior.
- Supply the Knowledge planner with prepared observations and bounded history,
  preserving current requirements and exact source references. Historical
  refusals are not current capability limits; a previous task's count does not
  replace an explicitly selected count in a new request.
- Accept the complete current editor once within a phase-correct input budget.
  A valid short question after applying a large vocabulary block must reach
  planning rather than fail on a hypothetical sum of sequential call payloads.
  Report actual context limitations without blaming only the question/attachments.
- Reconcile chat through admission and durable SSE with targeted resource
  updates. Turn status changes and active generation must not repeatedly fetch
  unchanged proposal history, workspace or conversation detail.
- Add deterministic intent/brief/completion and clarification continuation tests,
  plus an opt-in model-behavior evaluation set using synthetic data. Include the
  exact two-turn Russian example, typos, paraphrases, explicit prose requests,
  ambiguous references, missing language and unsupported exercise formats.
- Score artifact selection, clarification quality, source/word coverage and
  false-positive tool use separately from transport/tool execution. Record model
  and prompt versions; do not present scripted-model tests as intent-quality proof.

## Verification and delivery preparation

Features 060 and 061 have explicit authorization for the bounded generation/failure semantics above.
Choose the smallest viable planning mechanism; a separate model call per message
is not mandatory. Define evaluation sample sizes and acceptance thresholds before
running comparative evaluations. Automated CI stays deterministic; optional live
evaluation follows the AI smoke policy without raw learner-data logging.

Exercise real production composition and default/reduced budgets, cancellation,
repair exhaustion and settlement. Add mapped browser proof of clarification and
typed proposal completion. Record readiness separately from live provider proof.

## Acceptance reconciliation — implemented and verified

Feature 060 supplies the initial intent/brief/clarification behavior; feature 061
replaces the conflicting context, publication and refresh paths. Technical
source/data/native evidence is approved. The user requested marking this task
Done; the operational S3 follow-up remains documented separately above.

| Acceptance area                          | Current implementation and evidence                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent, clarification and typed outcomes | `tutor-request-contract.ts`, request agents/execution and local resolution prompts distinguish answers, clarification, generation, revision/copy and limitations. Deterministic request-execution tests cover continuation and artifact completion.                                                           |
| Material inputs and defaults             | Capability requirements and host-applied defaults preserve explicit settings and pending brief requirements; published generation outcomes remain typed and learner-controlled.                                                                                                                               |
| Reliable completion                      | Shared authoring/publication validates requested components before publishing. Repair, reduced-budget, invalid-output, cancellation and settlement cases pass the final native production-composition selection.                                                                                              |
| Prepared history and exact sources       | The planner consumes prepared observations/history; completed tool exchanges project to receipts while selected authorized source content remains exact. The final post-S3 registered gate and persistence proof pass.                                                                                        |
| Large draft and fetch behavior           | The final Chromium 50-entry Apply/Save/reload → 10-entry journey passes with one POST, one proposal GET and no detail/workspace GET during the measured follow-up send.                                                                                                                                       |
| Intent-quality evaluation                | `tutor-request-evaluation-cases.ts` supplies a synthetic opt-in set and declared rubric, including the exact Russian vocabulary→exercise two-turn example, model/prompt revisions and separate intent, coverage and clarification fields. The set now has 17 cases; the request-execution suite has 29 tests. |

The evaluation deliverable is a reusable opt-in set with declared sample size and
thresholds. Running an automatic or comparative live-model evaluation is not a
completion requirement. No live intent-quality score is claimed; deterministic
transport and browser results prove execution behavior only. A future live run
must record model/prompt revisions and follow the AI smoke policy.

## Starting points and boundaries

- `packages/prompts/src/local/contextual-language-tutor.ts`
- `apps/backend/src/modules/conversations/application/tutor-context-budget.ts`
- `apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts`
- `apps/backend/src/modules/conversations/application/conversation-worker-service.ts`

Depends on BL-013; BL-014 is helpful for manual diagnosis but not a hard dependency.
Cross-source artifacts and durable artifact follow-up references are BL-016.
Do not claim cross-context generation support at this task's completion.
