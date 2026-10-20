---
type: design-prompt
title: Knowledge workspace document editor
status: current
created: 2026-10-20
feature: 047-knowledge-workspace
source_paths:
    - apps/web/src/fsd/pages/knowledge/ui/knowledge-detail-page/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/shared/ui/companion-layout/**
    - docs/user-flows/knowledge-workspace.md
---

# Knowledge workspace document editor — design prompt v002

Copy the entire block below into Magic Patterns. This revision is recorded in the [design handoff](../../.agent/features/047-knowledge-workspace/DESIGN.md). The [workspace requirements](../../.agent/features/047-knowledge-workspace/FEATURE.md) and [user flow](../user-flows/knowledge-workspace.md) remain authoritative for implementation.

```text
Design a document editing workspace for Languon, a language learning app for adults. The user writes study notes, essays and research documents while talking with an AI language tutor. Focus your design effort on the LEFT document area: its writing surface, document controls, status, and the small interactions that send document content to chat or apply a chat suggestion. Show enough of the surrounding chat to explain the layout, but do not design a full chat product or a Knowledge library page.

The app already has a navigation shell outside this workspace. In your prototype, a simple narrow left navigation rail is enough context. Inside the workspace, the document area takes the main space. On desktop a separate chat panel sits to its RIGHT. On mobile the document uses the screen width and chat opens in a BOTTOM SHEET. The document must remain useful when chat is closed, docked at a normal side width, or widened to half of the available workspace width. Chat can also be detached as a floating panel. Show these changes in available editor width without letting the writing column become cramped.

VISUAL CHARACTER
Create a calm, polished writing desk for serious study: strong typographic hierarchy, comfortable reading width, generous but efficient spacing, subtle surfaces and borders, and clear action priority. Avoid a stacked settings-form appearance. Light colors may use #f8f9fb for the surrounding background, white document surface, #1b1e24 text, #e4e7ec borders and #4f46e5 accent. Include a dark-mode example with #121417 background, #1b1e24 surfaces and #818cf8 accent. Use realistic document content, for example “Why ‘ser’ and ‘estar’ change meaning” with English explanation, Spanish examples, a short quotation, list and small table. Show how longer writing scrolls.

DOCUMENT AREA — DESIGN THESE ELEMENTS IN DETAIL
- A compact top bar with Back to Knowledge, one directly editable document title, Draft or Saved state, a quiet private recovery indicator, and a clear Save action. Secondary actions: Save a copy, Revision history, and Delete with confirmation. Avoid duplicating the title in a header and a form field.
- The rich-text editor is the visual center. Give it a focused writing surface and an accessible toolbar for paragraph/headings, bold, italic, underline, strike, lists, quote, link, table, undo and redo. Show empty-document guidance as well as filled content. Make selection and caret states legible.
- Title and nonempty body are required for Save. An Untitled draft can still be edited and used with chat before Save. Draft edits are recovered privately on the server; recovery is distinct from the explicit Save that updates the published saved version. Show unobtrusive saving, recovered, local-changes and recovery-error states. Make the Save action reachable while editing a long document.
- Summary, categories and language metadata are optional. Put them in an accessible secondary area or disclosure so they do not push the writing surface far down the page. Show a simple filled example and an empty state.
- Sharing is available only after explicit Save. Keep Enable sharing, Copy read-only link and Disable sharing subordinate to writing actions. The read-only link exposes only the last saved document, never an unfinished draft or private chat. Show how the document area communicates this clearly without turning sharing into the main focus.

DOCUMENT ↔ CHAT INTERACTIONS — DESIGN THE EDITOR SIDE
- The AI tutor receives the complete current document, including unsaved edits, when the user sends a message; it does not watch edits live. Selecting a passage lets the user send that passage as the focus of a question while preserving the surrounding document context. Design a compact contextual action near a text selection, plus a clear indication in the chat composer that a passage is attached. Do not make ordinary typing trigger a message.
- The chat can separately attach copied text references, chosen with / or Add context. A small preview chip/card can show the title, excerpt and remove action. The selected document passage and external copied references should be visually distinguishable. The full content is sent to the tutor even though the UI only previews it. The document body and copied references have separate configurable 40,000-character limits; show a concise error when a limit prevents sending or adding a reference.
- An ordinary tutor reply remains in chat. If the user chooses to use a reply in the document, present a proposal review connected to the editor with three explicit actions: Insert at the remembered cursor, Append to the current document end, or Replace the remembered selection. Acceptance makes one undoable edit. Show the original target and a preview of the proposed change. If the target paragraph changed during generation, require comparison of original, current and proposed text before replacement; moving the cursor alone does not redirect the proposal.
- A thin representation of the chat panel is enough: header, a few messages, composer, one selected-passage attachment, and a proposal card. Do not spend the design on chat history or complex chat settings. On desktop show it to the right of the document; on mobile show an open and closed bottom-sheet state with a clear launcher. The sheet and keyboard must not cover the editor caret or Save action.

IMPORTANT DOCUMENT STATES
1. New Untitled Draft: empty editor, editable title, private recovery status, chat available, Save disabled until title and body are nonempty, no sharing action.
2. Saved document with unsaved working edits: title and rich content, visible recovery status, Save, optional metadata, share controls for the last saved version, and chat docked on the right.
3. AI proposal: selected paragraph, review of Insert/Append/Replace, and an example where the target changed so the user must compare before accepting.
4. Two tabs/devices edited the same draft: preserve both versions and present a readable comparison with options to continue either, combine manually, or save one as a separate note. Never silently overwrite prose.
5. Revision history and restore, with a warning if current unsaved work may conflict; unsaved-navigation and Delete confirmations; loading and recoverable error states.

DELIVERABLE
Produce an interactive, responsive prototype centered on the document editor. Show desktop at about 1440 px with the right chat panel, a narrower desktop state with chat taking half the workspace width, and mobile at about 390 px with chat closed and open as a bottom sheet. Make title/body editing, metadata disclosure, Save, text selection → Ask tutor, proposal review, conflict comparison, history and sharing demonstrable with local demo state. Use keyboard-accessible controls, visible focus, sensible touch targets, clear status messages, long-label tolerance and reduced-motion-friendly transitions. Keep the rest of the app schematic. Do not add web search, citations, document uploads, media embeds or RAG features.
```

## Review checklist

- **KW-D01:** The left document editor is the dominant, detailed surface; the navigation shell and chat remain supporting context.
- **KW-D02:** Chat placement is clear: right dock on desktop, optional half-width/detached layout, bottom sheet on mobile.
- **KW-D03:** One editable title, rich editor, Save, private recovery, optional metadata and saved-only sharing have clear hierarchy.
- **KW-D04:** Selecting text and asking the tutor shows which passage is sent and when the full document snapshot is captured.
- **KW-D05:** Copied external references are visually distinct from selected document content and previewed without omitting their sent text.
- **KW-D06:** AI replies require explicit proposal review before an undoable editor change; stale targets require comparison.
- **KW-D07:** Concurrent draft versions, revision restore and destructive/navigation confirmations preserve user work.
- **KW-D08:** Desktop and mobile states remain usable with long content, keyboard and touch input, and error/loading feedback.

This brief is based on repository source, accepted ADR-0042 and the current user-flow guide, including the uncommitted docked tutor width control. No rendered-page capture or Magic Patterns output was available for visual fidelity comparison at prompt creation.
