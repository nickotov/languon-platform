---
type: adr
id: ADR-0063
title: Repeatable insertion from completed lessons
status: accepted
date: 2026-11-23
superseded_in_part_by: 'ADR-0064 logical part selection and document-aware insertion'
supersedes: 'ADR-0061 requirement to insert a completed lesson only as an entire mixed proposal'
---

# Repeatable insertion from completed lessons

## Context

An owner may want a single exercise from a generated lesson or want to restore a block they removed. The original application receipt belongs to the proposal. It survives edits to the draft, so using it to disable future copies ties a new editing decision to an earlier one.

## Decision

Generate and validate the complete lesson once. Before completion, the owner can read validated checkpoints in the preview. After completion, the owner may copy the full published lesson or one of its ordered top-level nodes into its working branch. End-of-document and resolved editor-cursor positions use the same server-side checks. Saving the document is a separate action.

The client sends a selection and operation ID. The server resolves the content from the owner’s completed run and published proposal, includes any required frozen block dependencies, allocates fresh block identities, remaps references, and validates the resulting document and its media grants. Commit the branch update and operation receipt together. A replay with the same operation identity and arguments returns the current branch. A new deliberate insertion receives a new operation identity.

## Alternatives considered

Reopening the original apply receipt would make a network retry indistinguishable from a second editing decision. Local clipboard duplication supports simple prose but cannot establish permission for all media and source-dependent exercises.

## Consequences

Removing or editing a copy leaves the original lesson available to review and copy again. Copying a single exercise may insert supporting source blocks. Ordinary proposal updates keep their existing stale-target and one-time application semantics. No generation request or AI charge is involved in copying.

## Related

[Original lesson publication](0060-composable-generation-runs.md) · [Private prepared previews](0061-bounded-automatic-lesson-continuation.md) · [Feature plan](../../.agent/features/072-lesson-review-insertion/EXEC_PLAN.md)
