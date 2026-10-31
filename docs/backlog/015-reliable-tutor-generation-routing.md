---
type: backlog-task
id: BL-015
title: Reliable tutor intent, clarification and generation outcomes
status: pending
created: 2026-10-31
updated: 2026-10-31
original_tasks: '2026-10-31 Russian vocabulary and exercise response diagnosis'
evidence: []
depends_on:
    - BL-013
---

# BL-015 — Reliable tutor intent, clarification and generation outcomes

[Backlog index](INDEX.md) · [Shared constraints](README.md).

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
- Add deterministic intent/brief/completion and clarification continuation tests,
  plus an opt-in model-behavior evaluation set using synthetic data. Include the
  exact two-turn Russian example, typos, paraphrases, explicit prose requests,
  ambiguous references, missing language and unsupported exercise formats.
- Score artifact selection, clarification quality, source/word coverage and
  false-positive tool use separately from transport/tool execution. Record model
  and prompt versions; do not present scripted-model tests as intent-quality proof.

## Verification and delivery preparation

Requires explicit feature authorization for generation/failure semantics.
Choose the smallest viable planning mechanism; a separate model call per message
is not mandatory. Define evaluation sample sizes and acceptance thresholds before
running comparative evaluations. Automated CI stays deterministic; optional live
evaluation follows the AI smoke policy without raw learner-data logging.

Exercise real production composition and default/reduced budgets, cancellation,
repair exhaustion and settlement. Add mapped browser proof of clarification and
typed proposal completion. Record readiness separately from live provider proof.

## Starting points and boundaries

- `packages/prompts/src/local/contextual-language-tutor.ts`
- `apps/backend/src/modules/conversations/application/tutor-context-budget.ts`
- `apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts`
- `apps/backend/src/modules/conversations/application/conversation-worker-service.ts`

Depends on BL-013; BL-014 is helpful for manual diagnosis but not a hard dependency.
Cross-source artifacts and durable artifact follow-up references are BL-016.
Do not claim cross-context generation support at this task's completion.
