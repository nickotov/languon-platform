---
type: adr
id: ADR-0064
title: Review and insert logical lesson parts in the Knowledge workspace
status: accepted
date: 2026-11-23
supersedes: 'ADR-0063 per-node selection and repeat insertion while a copy remains in the draft'
---

# Review and insert logical lesson parts in the Knowledge workspace

## Context

A generated reading can contain several headings and paragraphs. A comprehension task can produce several exercise blocks. Both are single authoring decisions in the saved plan. Offering an insertion button for each editor node split those decisions and made it difficult to see where material would be inserted.

## Decision

Use the saved lesson task as the unit of review and insertion. Model output order and validated task artifacts define the membership of each part. The owner can inspect prepared material in the Knowledge editor in read-only mode. Insertion becomes available on the completed proposal. Review shares the AI companion panel so the working document can retain its cursor. Hints and answers require an explicit reveal.

Each insertion action names both its scope and destination. The owner may add one part or add the remaining parts. Prevent duplicate insertion while material from that part is present. Removing it from the working branch makes it eligible for insertion again. Apply the same check inside the transaction that updates the branch. Existing owner authorization, media grants, cursor checks, explicit Save and operation receipts apply.

## Consequences

A user can restore a removed part without regenerating the lesson or disturbing other parts. Presence represents the current document and can change after edits, undo, reload or activity in another tab. Provenance used to identify existing material grants no new access to a proposal or its sources.

## Related

[Completed lesson proposal authority](0063-completed-lesson-insertion.md) · [Feature plan](../../.agent/features/072-lesson-review-insertion/EXEC_PLAN.md)
