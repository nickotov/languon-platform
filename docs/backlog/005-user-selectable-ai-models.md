---
type: backlog-task
id: BL-005
title: 'User-selectable AI models'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '8'
evidence: []
---

# BL-005 — User-selectable AI models

[Backlog index and shared constraints](README.md).

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
