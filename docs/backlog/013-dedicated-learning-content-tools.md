---
type: backlog-task
id: BL-013
title: Dedicated learning-content generation tools
status: in-progress
created: 2026-10-31
updated: 2026-11-04
original_tasks: '2026-10-31 tutor diagnosis and generation-tool discussion'
evidence: []
---

# BL-013 — Dedicated learning-content generation tools

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Current delivery

The user authorized [feature 060](../../.agent/features/060-intent-aware-learning-content/FEATURE.md) on 2026-11-04. It implements dedicated tools and intent-aware generation in owned Knowledge workspaces. Verification is in progress; this entry is not complete. Runnable Studio execution remains BL-014.

## Problem and outcome

Today the tutor authors complete blocks inside arguments to one
`propose_learning_blocks` tool. That tool validates and persists proposals;
it does not delegate generation. Give the model focused content-generation
interfaces backed by typed authoring, with shared validation and proposal logic.

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
- Resolve compatibility with the existing proposal tool deliberately. Do not
  remove support relied on by admitted operations or existing integrations.

## Verification and delivery preparation

Feature 060 has explicit authorization for the bounded delivery above. Reconcile with
[ADR-0050](../adr/0050-interactive-workbook-content-and-learning-boundaries.md)
and current AI execution/accounting ADRs. Bound all nested model calls within
one admitted action: provider limits, aggregate allowance, deadlines,
cancellation, idempotency and settlement must remain enforced.

Verify tools and actual production composition with deterministic external HTTP,
including invalid results, missing inputs, unauthorized sources and reduced
budgets. Include proposal preview/Apply/Save browser proof, affected user-flow
mappings and security review for model tools. Keep live-provider evidence separate.

## Starting points and related scope

- `apps/backend/src/modules/conversations/infrastructure/ai/contextual-block-tools.ts`
- `apps/backend/src/modules/conversations/application/learning-block-tool-contract.ts`
- `packages/contracts/src/learning-blocks.ts`, `packages/prompts/src/local/`
- [BL-006](006-grammar-conversations-and-learning-documents.md) and feature 059
  retain broader document/exercise scope. This task does not complete either.
- Cross-context chat artifacts belong to [BL-016](016-interactive-chat-artifacts.md).

Exact schemas, execution composition and any ADR-worthy choices are prepared
during feature discovery. Backlog creation does not authorize implementation.
