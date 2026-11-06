---
type: backlog-task
id: BL-013
title: Dedicated learning-content generation tools
status: in-progress
created: 2026-10-31
updated: 2026-11-06
original_tasks: '2026-10-31 tutor diagnosis and generation-tool discussion'
evidence:
    - .agent/features/061-reliable-learning-content-pipeline/EVIDENCE.md
---

# BL-013 — Dedicated learning-content generation tools

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Current delivery

[Feature 060](../../.agent/features/060-intent-aware-learning-content/FEATURE.md)
implemented the initial typed authoring and intent-aware Knowledge generation
slice. Its [evidence](../../.agent/features/060-intent-aware-learning-content/EVIDENCE.md)
is historical proof of that bounded delivery, not completion of this task.

The user authorized [feature 061](../../.agent/features/061-reliable-learning-content-pipeline/FEATURE.md)
on 2026-11-06 to complete the tool/publication contract together with reliable
phase budgeting and compact model context. The
[execution plan](../../.agent/features/061-reliable-learning-content-pipeline/EXEC_PLAN.md)
owns implementation and verification. This task remains in progress until its
full acceptance is verified. Runnable Studio execution remains BL-014.

## Current security and delivery limitation

Implementation and selected verification pass. The final post-S3 registered gate
passed 308 tests across 24 files with no skips/retries. Selected browser journeys,
affected static/build checks and independent source/data/native evidence review
pass. A strict metadata allowlist and safe merge prevent provider credentials
from persisting in observational-memory configuration. One verified local unsafe
configuration was scrubbed; zero remain, with observations and other data preserved.

This task remains `in-progress` solely for S3's operational High security remainder:
rotate/revoke the affected provider key or record the user's explicit acceptance
of its residual risk. No such disposition or exfiltration evidence is recorded.
A local feature-branch implementation commit does not authorize completion or a
main merge. See feature 061's
[evidence](../../.agent/features/061-reliable-learning-content-pipeline/EVIDENCE.md)
and [review](../../.agent/features/061-reliable-learning-content-pipeline/REVIEW.md).

## Problem and outcome

The original tutor authored complete blocks inside arguments to a generic
proposal tool. The initial dedicated generation tools now share typed authoring,
but their result/publication contract and context construction need to be unified.
Give callers focused generation interfaces backed by shared validation and one
authorized publication operation, with compact references to exact stored content.

## Scope and acceptance

- Provide task-specific tools for vocabulary, grammar, bilingual text and
  exercises. Proposed names are `generate_vocabulary`, `generate_grammar`,
  `generate_bilingual_text` and `generate_exercises`; finalize names in delivery.
- Inputs are validated generation briefs, not complete model-authored document
  payloads. Include source references/material, languages and content-specific
  parameters. Exercises support format, difficulty and count. Required missing
  inputs produce an explicit result rather than invented settings.
- Authoring implementations return schema-validated blocks; tool results expose
  a typed artifact/proposal reference and useful summary. Keep generation separate
  from learner-controlled document Apply and Save. Reuse existing proposal
  persistence for this first delivery in authorized owned Knowledge contexts.
- Define a bounded capability registry for supported types/formats: input/output
  schemas, requirements/defaults, source needs, generator, semantic validators,
  renderer mapping and authority requirements. Expose only available capabilities.
- Share infrastructure and application behavior without creating an autonomous
  agent per tool or speculative generic execution framework. Select the smallest
  useful authoring seam; a new exercise format should have an explicit extension
  path without scattered prompt changes.
- Validate vocabulary coverage, valid answers/choices, duplicate questions and
  authorized source identities where practical. Preserve stable update identities.
- Use one current generation/publication contract. Move active revision, exact
  copy and prose-proposal behavior onto canonical operations, updating affected
  callers and tests together. Remove compatibility-only paths for unreleased
  versions under the root pre-release policy.
- Give execution, canonical artifact storage, model context and public activity
  separate representations. Preserve exact inputs for execution and useful read
  results for the immediate continuation; use deterministic receipts for completed
  historical exchanges. Current sources and tool-call/result dependencies remain
  intact, with exact authorized source readback for follow-ups.
- Use phase-correct input envelopes shared by admission and execution. Do not
  reserve sequential planning, authoring and possible retrieval payloads as one
  call. Reject genuinely impossible current input before hold/queue insertion;
  compactable history remains eligible. Keep the existing action limits.

## Verification and delivery preparation

Features 060 and 061 have explicit authorization for the bounded delivery above. Reconcile with
[ADR-0050](../adr/0050-interactive-workbook-content-and-learning-boundaries.md)
and current AI execution/accounting ADRs. Bound all nested model calls within
one admitted action: provider limits, aggregate allowance, deadlines,
cancellation, idempotency and settlement must remain enforced.

Verify tools and actual production composition with deterministic external HTTP,
including invalid results, missing inputs, unauthorized sources and reduced
budgets. Include proposal preview/Apply/Save browser proof, affected user-flow
mappings and security review for model tools. Keep live-provider evidence separate.

## Acceptance reconciliation — implementation verified, operational closure pending

The current implementation covers the task's product scope. Final selected
native/static/build gates and independent source/data evidence review pass. The
task remains `in-progress` for the operational S3 disposition described above.

| Acceptance area                         | Current implementation and evidence                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused tools and validated briefs      | `learning-content-tools.ts` exposes `generate_vocabulary`, `generate_grammar`, `generate_bilingual_text` and `generate_exercises`; `learning-content-operations.ts` returns clarification without authoring when required inputs are missing.                                         |
| Bounded extension registry              | `learning-content-contract.ts` and `learning-content-registry.ts` bind supported kinds/formats, requirements/defaults, input/output schemas, renderer mapping, source policy, semantic validator and owned-Knowledge authority. Registry tests check these bindings.                  |
| Atomic publication and compact receipts | Shared operations validate all requested components before a single publication. Operations tests cover invalid/incomplete results, concurrent identical calls, uncertain publication and cancellation. Full content remains in the canonical proposal for learner Review/Apply/Save. |
| Current revision/copy/prose             | Canonical operations retain these capabilities with schema version 2 bodies. Revision tests cover identity reconciliation; selected browser journeys cover revision/copy and prose. Compatibility-only paths are retired.                                                             |
| Context, fit and source authority       | Phase envelopes and historical receipt projection have focused regressions; production-composition and source-grounding tests exercise the actual boundaries. The final post-S3 registered native gate and persistence evidence pass.                                                 |
| Learner journey                         | Real Chromium evidence covers 50 entries through Review/Apply/Save/reload followed by 10 entries, with compact context and bounded fetches. See feature 061's evidence for run IDs and limits.                                                                                        |

Studio registration and runnable playground sessions remain BL-014. Cross-context
artifacts remain BL-016. Neither is an unrecorded remainder of BL-013.

## Starting points and related scope

- `apps/backend/src/modules/conversations/infrastructure/ai/learning-content-tools.ts`
- `apps/backend/src/modules/conversations/infrastructure/ai/learning-content-operations.ts`
- `apps/backend/src/modules/conversations/application/learning-content-registry.ts`
- `packages/contracts/src/learning-blocks.ts`, `packages/prompts/src/local/`
- [BL-006](006-grammar-conversations-and-learning-documents.md) and feature 059
  retain broader document/exercise scope. This task does not complete either.
- Cross-context chat artifacts belong to [BL-016](016-interactive-chat-artifacts.md).

Exact schemas, execution composition and any ADR-worthy choices are prepared
during feature discovery. Backlog creation does not authorize implementation.
