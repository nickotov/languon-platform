---
type: backlog-task
id: BL-001
title: 'Streamlined dictionary editing'
status: done
created: 2026-10-01
updated: 2026-10-02
original_tasks: '1–2'
evidence:
    - .agent/improvements/inline-ai-auto-accept.md
    - .agent/improvements/dictionary-word-pair-columns.md
    - .agent/corrections/dictionary-word-pair-divider.md
---

# BL-001 — Streamlined dictionary editing — Done

[Backlog index and shared constraints](README.md).

Detailed plan for original task 1:
[AI auto-accept and regeneration controls](../inline-ai-auto-accept-plan.md).
Original task 1 is implemented and verified; see the
[delivery record](../../.agent/improvements/inline-ai-auto-accept.md).
Original task 2 is also implemented and verified; see the
[responsive columns delivery record](../../.agent/improvements/dictionary-word-pair-columns.md).
The Add/Edit pair uses equal columns at viewport >=768 px and content >=36 rem;
owner lists use columns at container >=40 rem. Narrow layouts remain stacked,
and the desktop editor is capped at 880 px.
Example and Example Translation follow the same equal-column responsive layout;
a single enabled form example or single populated list example uses full width.

## Confirmed requirements

- Apply successfully generated field values automatically, without an Accept or
  Reject step. Remove the corresponding field and bulk acceptance/rejection controls.
- Show an AI generation action on empty fields. If a field already contains a
  value, replace the plain AI action with a regeneration action bearing an AI symbol.
- For an existing entry, successful generation saves the complete visible form,
  including preceding unsaved manual edits, and keeps the editor open.
  This is an immediate change to persistence behaviour, not just
  automatic population of an unsaved draft.
- For a new entry, generation fills the form, but Create remains explicit.
- Preserve the preceding version whenever successful field or whole-form
  regeneration creates a new version. First generation on an existing entry
  preserves its pre-generation form as version 1 and opens version 2; subsequent
  regenerations append further versions.
- For a new entry's first generation, preserve version 1 only if a non-Source
  content field already has a non-whitespace value. Source-only initial drafts
  receive their first generated content in version 1.
- Version navigation previews local form history without writing. Explicit Save
  restores the displayed version; history disappears on close/reload. Use only
  whole-form history, not previous field-option pickers.
- During generation/automatic saving, pause editing and version navigation;
  generation cancellation remains available. Inline Add/Edit is the only scope;
  advanced rewrite, batch, document, and import review flows remain unchanged.
- Place source and translation in two columns on wide screens in both the
  Add/Edit form and dictionary card list. Stack them on small screens.

## Existing behaviour and implementation context

The [current dictionary guide](../user-flows/dictionary-platform.md) now describes
inline automatic application/saving and local preview history. The earlier
[Inline AI Field Generation](../../.agent/features/031-inline-ai-field-generation/FEATURE.md)
introduced explicit review and Save and excluded automatic saving; the linked
delivery supersedes that inline behaviour, not the other review flows.

[Form versions](../../.agent/improvements/dictionary-card-authoring-form-versions.md)
and [first saved-card generation versions](../../.agent/improvements/saved-card-source-normalization-versions.md)
already exist. Their history is local to the open editor and disappears on closing
or reloading. Immutable persisted card revisions are a separate mechanism; local
form history must not be presented as durable recovery history without new design.
Historical form versions currently disable generation, and explicit Save uses
the displayed version.

Generation has dependencies. Translation generation currently regenerates every
enabled non-Source field; Example generation also regenerates its enabled paired
translation. Whole-form generation normalizes Source before generating dependent
values. Auto-application must keep those values coherent and respect the
effective translation context, enabled fields, and existing Source normalization.
An unchanged provider result is already supported and must not make novel fields
from the same response unusable.

Saving must preserve existing ownership checks, optimistic dictionary/settings/card
conflict checks, server-computed authorship, provenance, and retry-safe mutations.
Invalid or failed generation must not become a successful saved change.

## Delivery notes

Both original tasks are delivered. Responsive layout preserves coherent Source
application, full-form saving, version/provenance handling, cancellation,
conflicts, and retry-safe recovery. Public sharing remains unchanged.

## Verified acceptance scenarios

Generate an empty field; regenerate a populated field; generate all; observe a
second version on an existing entry; return to previous content; verify immediate
saved changes and explicit new-entry creation; handle failure and conflicts;
verify both wide-screen surfaces and narrow-screen layouts.

## Implementation evidence

- [Inline AI auto-accept delivery record](../../.agent/improvements/inline-ai-auto-accept.md) — automatic application/saving, regeneration controls and version behavior; Complete.
- [Responsive word/example columns delivery record](../../.agent/improvements/dictionary-word-pair-columns.md) — Add/Edit and active/archived owner list layouts, tests and browser evidence; Complete.
- [Word-pair divider correction](../../.agent/corrections/dictionary-word-pair-divider.md) — matching desktop divider and narrow stacking checks; Complete.
