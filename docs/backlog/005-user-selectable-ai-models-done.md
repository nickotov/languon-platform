---
type: backlog-task
id: BL-005
title: 'User-selectable AI models'
status: done
created: 2026-10-01
updated: 2026-10-05
original_tasks: '8'
evidence:
    - .agent/features/035-user-ai-model-preferences-backend/EVIDENCE.md
    - .agent/features/037-sentence-practice-web/EVIDENCE.md
    - docs/user-flows/sentence-practice-web.md
---

# BL-005 — User-selectable AI models — Done

## Completed delivery — 2026-10-05

The agreed backend and selected frontend scope is implemented and verified.
[Feature 037](../../.agent/features/037-sentence-practice-web/FEATURE.md),
[evidence](../../.agent/features/037-sentence-practice-web/EVIDENCE.md),
[review](../../.agent/features/037-sentence-practice-web/REVIEW.md), and
[current browser guide](../user-flows/sentence-practice-web.md) substantiate the
frontend. Six real-app journeys and final unit/static/build checks pass; all
material independent review findings are resolved. Prior backend-only/design
checkpoints below are historical. The broader BL-003 task remains in progress.

## Returned design analysis — 2026-10-04

The user returned the profile prototype and explicitly selected only the
modelPreference section in Account. Provider v6 is pinned in the
[handoff](../../.agent/features/035-user-ai-model-preferences-backend/DESIGN.md);
the [source inventory](../../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04)
selects the picker, saved/draft summary, availability/conflict/recovery states
and related actions. Account management, security, billing and shell redesign
are excluded. Backend Complete is unchanged; frontend remains pending, so this
task stays in-progress.

[Backlog index and shared constraints](README.md).

## Delivery planning

The [backend-first implementation plan](../sentence-practice-implementation-plan.md)
delivers model routing/preferences before the BL-004 sentence backend. The user
authorized implementation on 2026-10-04. The backend is owned by
[feature 035](../../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md). Once both backends are
verified, save separate model-preference and sentence-practice design prompts,
then wait for the user's Magic Patterns designs before frontend code generation.
The profile prompt covers loading, saving, conflicts, availability and recovery
without concrete API paths. Backend-only delivery does not complete BL-005;
the plan is not implementation evidence.

## Confirmed requirements

- Add an AI model preference in the user profile, with Auto selected by default.
- Auto uses the platform's configured default model, rather than automatically
  selecting a different model for every task.
- Apply the preference to all text AI features: dictionary generation, sentence
  generation/checking, grammar conversations, and exercise generation.
- Present model capability and relative request cost clearly. Explain that a
  more capable model may consume more AI credits.

## Existing behaviour and implementation context

[AI Provider Management](../../.agent/features/028-ai-provider-management/FEATURE.md)
already provides a curated catalog, admin-enabled models, a global default, and
immutable configuration pinned to admitted jobs. It has no learner model picker.
[AI Credit Wallet](../../.agent/features/029-ai-credit-wallet/FEATURE.md) already
provides model-specific credit accounting, but learner wallet UI, starter grants,
subscriptions, purchases, and user model selection were outside that delivery.

Model preferences must respect supported/enabled models and preserve admitted
job/retry configuration. Credentials and arbitrary provider URLs remain server-side.
Text model preference does not establish a pronunciation/TTS or OCR preference.

## Resolve before implementation

Eligible model choices across different text tasks, unavailable/disabled or
incompatible selections, when preference changes take effect, and cost display.
Extending routing beyond dictionary generation needs deliberate module boundaries;
do not import application internals across apps or assume dictionary-owned
configuration already applies to grammar. Keep new billing/allowance policy
separate from the model preference unless explicitly included in delivery.

## Acceptance scenarios to refine

Persist Auto and explicit selection; apply the preference across text features;
retain the admitted model during retries; handle a disabled or incompatible
selection and insufficient credits; display capability/cost without exposing secrets.

## Verified backend checkpoint

[Feature 035](../../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md)
is complete: authenticated preferences, sanitized catalog, per-job dictionary
selection, mixed-worker guards, exact-format readiness and model-isolated circuits
passed database/API/worker/browser checks and independent correctness/security
reviews. This backlog task remains in progress for profile UI and final design
integration. The design prompt waits until the sentence backend is also verified,
as specified in the [delivery plan](../sentence-practice-implementation-plan.md).

## Verified backend / design checkpoint — 2026-10-04

Backend delivery is implemented, verified and independently reviewed. The detailed
[implementation plan](../sentence-practice-implementation-plan.md) records completed
backend and deferred frontend scope. Copy the
[profile-text-ai-preferences v001 prompt](../design-prompt/profile-text-ai-preferences.md) into Magic Patterns;
return its generated design/source before frontend implementation continues.
[Versioned handoff](../../.agent/features/035-user-ai-model-preferences-backend/DESIGN.md) preserves the
snapshot and selection history. This task remains In progress; backend completion
does not mark the deferred UI/product work done.
