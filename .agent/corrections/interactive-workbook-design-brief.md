# Correction: Interactive knowledge sheet design brief

Status: Complete
Created: 2026-10-29
Updated: 2026-10-29

## Routing decision

- Outcome: save a copy-ready, source-grounded design-agent prompt for the existing
  interactive knowledge sheet and contextual chat, with required versioned handoff.
- Documentation-only correction: no application behavior, product capability,
  contract, schema, dependencies, permissions, billing or deployment changes.
- Feature owner: F059; this record covers brief preparation only. Generated design
  and subsequent implementation are not authorized by the brief itself.

## Scope and acceptance

- AC-1: one self-contained English prompt in docs/design-prompt, with product
  context, six reusable block families, chat/sheet/practice variants, interaction
  logic, roles, availability, errors, recovery and responsive/accessibility states.
- AC-2: distinguish approved product behavior from unresolved activation and
  explicitly deferred course/group-context/grammar-library capabilities.
- AC-3: prompt index, bidirectional F059 DESIGN handoff and exact versioned prompt snapshots
  agree, with source commit/hash and an empty returned-design URL slot.

## Plan

- [x] Inspect F059, existing workspace/chat briefs, source components and rules.
- [x] Write canonical brief and checklist; preserve older prompt/handoff histories.
- [x] Create owner handoff, exact snapshot and index link.
- [x] Verify source alignment, links, formatting and snapshot identity.

## Verification

Documentation-only: runtime/browser/database/tests/build are not required because
no executable behavior or user-flow guide changes. Validate new Markdown and
handoff links/hash; check the brief against current source and
accepted product decisions. No new UI or external design generation is claimed.

## Remaining risks

F059 remains in progress. Transcription activation/provider approval is unresolved;
the brief must design conditional availability rather than promise activation.

## Initial outcome and evidence (v002)

- Saved canonical prompt: [Interactive knowledge sheets and AI chat](../../docs/design-prompt/interactive-knowledge-sheet-and-chat.md), initial delivered v002 (superseded by v003 below).
- Added [F059 design handoff](../features/059-interactive-workbooks/DESIGN.md), prompt-index entry, and exact immutable v001/v002 snapshots. Initial snapshot retained when the brief was refined; no earlier 044/047 handoff or implementation pointer changed.
- Source baseline: def891808c6995efb0d5aac107422419f4eef184; no application changes.
- Current prompt/snapshot SHA-256: a8a30b08652b6889ade786b69d370ceeb40a1ba48764c427d26e5f4aa1c92f4f.
- Prettier checks pass for canonical/handoff/snapshots/record. Link/structure validation confirms 21 stable IDs, one portable copy block, current snapshot byte equality, both recorded hashes and prompt-index discovery. git diff --check passes.
- Manual source review reconciled owner/shared/anonymous authority, draft/Apply/Save, all six block families, practice/private progress, library copies, workbook order, safe media and deferred scope against F059 and the current runtime. Current rendered practice-style vocabulary previews are a baseline; the brief deliberately requests more compact review-specific presentation.
- No executable journey or user-flow guide changed, so browser, database, E2E, build and runtime review are not applicable. No design generated, deployed, committed or selected for implementation.

Remaining limitation: the returned design is still pending. Transcription activation and full F059 delivery remain separately pending; the prompt does not promise activation.

## Additive-design clarification — v003

- User clarified that existing chat/editor design is established. Updated the prompt to extend its content blocks and overlays, preserving the shell instead of redesigning it.
- Added word/text-snippet playback using existing Dictionary/Texts patterns; per-field AI check/translation with preview, acceptance and stale-field protection; desktop side-dialog/mobile bottom-sheet block editing; inline collapsed/expanded exercises with feedback, hint and reference below the task.
- Future pronunciation assessment, transcript-plus-description comprehension and difficulty are separate conceptual designs, not enabled launch capabilities or claims of completed implementation. No runtime code changed.
- Canonical and immutable v003 snapshot SHA-256: `78a48680147fe9aedefccd02ffdee5b8cac93b2de89473d555f9676b324b6435`. Previous v001/v002 snapshots retained unchanged; latest handoff/index now select v003 for generation only. Implementation pointers remain None.
- Verification: formatting, relative-link/requirement/snapshot checks and git diff whitespace check; runtime/browser/tests remain not applicable to this documentation-only clarification.
