---
type: backlog-task
id: BL-016
title: Interactive chat artifacts and exact follow-up references
status: pending
created: 2026-10-31
updated: 2026-10-31
original_tasks: '2026-10-31 extensible custom-block and follow-up discussion'
evidence: []
depends_on:
    - BL-013
    - BL-015
---

# BL-016 — Interactive chat artifacts and exact follow-up references

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Problem and outcome

Typed block generation is currently coupled to an authorized Knowledge working
draft. Dictionary/text conversations lack that tool, and shared readers cannot
author the source. Separate interactive generated responses from source mutation
so learners can generate and practise content without editing the source.

## Scope and acceptance

- Define a versioned, validated conversational artifact identity and lifecycle,
  reusing existing block schemas/renderers where appropriate. An artifact can be
  reviewed and practised before insertion into a Knowledge document.
- Support owned Knowledge, dictionary and text conversations. For shared sources,
  generate private learner artifacts only within current authorized source access;
  never grant mutation authority over the original. Final surface scope must be
  explicit during feature preparation.
- Resolve follow-ups such as “these words” to exact prior artifact/item identities
  and content versions, including unapplied proposals. Retrieve structured content
  rather than relying only on prose or observational summaries. Clarify multiple
  plausible antecedents; never silently substitute newer material.
- Preserve references through reload, conversation memory compaction and supported
  retries. Define behavior for dismissed, superseded, deleted and revoked sources.
- Keep generation, practice attempts, insertion into Knowledge, explicit Save and
  saving vocabulary into a dictionary as distinct operations with their respective
  permissions. Vocabulary blocks must not replace the dictionary domain model.
- Reuse custom exercise interactions with appropriate answer/hint visibility;
  keep reusable content separate from private attempts/progress. Define retention,
  sharing/copy, cleanup and source-revocation behavior before persistence changes.
- Extend the capability registry and evaluations without exposing arbitrary HTML,
  unsupported renderers or unauthorized content references.

## Verification and delivery preparation

Requires explicit feature authorization for the new artifact lifecycle,
persistence and access semantics. Prepare architecture against ADR-0037,
ADR-0042 and ADR-0050 and propose any necessary supersession; existing constraints
remain binding until the appropriate decision is authorized.

Prove the reported Russian vocabulary-to-exercise sequence across supported
contexts with real browser interactions and deterministic provider HTTP. Include
reload/compaction, ambiguous antecedents, deletion/revocation, cross-user isolation,
copy behavior, cancellation/accounting and disposable database checks. Independent
security review and applicable mapped user-flow/critical checks are required.

## Starting points and related work

- Conversation source snapshots, memory and block proposal persistence under
  `apps/backend/src/modules/conversations/`
- `apps/web/src/fsd/features/knowledge-notes/ui/block-proposals/`
- `apps/web/src/fsd/entities/learning-blocks/`
- `packages/contracts/src/learning-blocks.ts`

Depends on BL-013/015. Coordinate with BL-003/006/007 and feature 059 without
claiming completion of their broader progress, document or manual-authoring scope.
