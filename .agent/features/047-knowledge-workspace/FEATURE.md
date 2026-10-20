# Knowledge workspace

Status: Complete
Owner: Engineering
Created: 2026-10-19

## Problem

Knowledge notes currently separate editing from tutor chat. New research cannot start from an empty note, unsaved edits are not recoverable across devices, and notes cannot be shared. Confirmed product decisions are in [BL-006](../../../docs/backlog/006-grammar-conversations-and-learning-documents.md) and accepted [ADR-0042](../../../docs/adr/0042-knowledge-workspace-document-and-context-boundaries.md).

## Desired behavior

One Knowledge note is a stable research and writing workspace. Its private recoverable editor sits beside the existing language tutor; explicit Save publishes a revision, and an unlisted link exposes only that saved note. Tutor turns use the complete current editor snapshot and selected copied Text references within configured limits. Proposed edits require review and acceptance.

## Acceptance criteria

- AC-1 — New note creates an Untitled private Draft with stable ID, empty editor, immediate chat, Knowledge listing, reopening and deletion. First user message names the draft and its chat from its first three words only while default titles remain; later chats do not rename the note.
- AC-2 — The workspace presents a rich editor left of the reused tutor on desktop and a tutor bottom sheet on mobile. It supports multiple private chats, latest-chat reopening and chat deletion without deleting the note.
- AC-3 — Working edits recover from the server across devices with visible status. Concurrent edits preserve both versions and offer continuing either, manual combination or saving one as a separate note. Neither alternative is silently overwritten or discarded.
- AC-4 — Explicit Save requires a title and nonempty editor body and updates the same note and its saved revision; summary, categories and language metadata are optional. An empty draft remains private. Save a copy uses current working content and creates an independent saved note without chats, attachments or prior revisions.
- AC-5 — An unlisted read-only link reveals only the last explicitly saved note. Signed-in recipients can copy that visible version into their own independent note before editing or chatting. Disabling sharing invalidates its link immediately; re-enabling issues a new link, while existing copies survive.
- AC-6 — Every workspace turn freezes the complete current editor snapshot, including unsaved edits, and optional selected passage. New turns use new snapshots; history, copied content and prior wording remain available through bounded Mastra compaction. The tutor follows the language-learning purpose and uncertainty rules without web search.
- AC-7 — The `/` picker copies multiple authorized Text bodies and optionally translations into one message with compact previews. The default aggregate copied-reference and editor-context limits are independently configurable at 40,000 characters each, including whitespace; exactly the limit is allowed, additions exceeding it are rejected whole with the configured-limit toast. Oversized complete model input fails clearly without silently omitting material.
- AC-8 — Editor proposals support Insert at cursor, Append and Replace selection. Target identity survives edits elsewhere and cursor movement; target changes require comparison or reselection. Acceptance is explicit, makes one undoable working edit and never implicitly Saves.
- AC-9 — Existing note revisions, dictionary/text tutor journeys, source authorization, account erasure, durable streaming, Stop/retry and model/credit accounting remain valid.

## Scope

### In scope

- Web Knowledge workspace, private drafts, text references, editor proposals and unlisted sharing.
- Coordinated contracts, persistence, API, prompt/context, locale, migration and user-flow changes.

### Out of scope

- External search, document/media uploads, RAG, media interpretation, additional Knowledge note references, exercises and guided lesson flows.

## Constraints and risks

- Preserve existing saved notes/revisions and first-delivery conversation-created draft behavior.
- Sharing and copied references require security review. Model calls, compaction and tools remain admitted, bounded and accounted.
- Existing source projection may select excerpts; workspace editor context must bypass that behavior.
- Character limits do not guarantee model token fit. The complete input must pass model capacity after compaction.

## User-flow documentation

- Create `docs/user-flows/knowledge-workspace.md` for the new browser/API journey.
- Update `docs/user-flows/contextual-language-assistant-and-knowledge.md` where shared widget, saved-note and conversation behavior changes. Preserve mapped scenario IDs and add focused workspace scenarios.
- Map repeatable journeys to backend integration and web Playwright files, then run reviewed E2E and guide synchronization checks.

## Open decisions

- None in first-version product behavior; implementation details and evidence are tracked in `EXEC_PLAN.md`.
