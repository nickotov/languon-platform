---
type: adr
id: ADR-0042
title: 'Knowledge workspace document and context boundaries'
status: accepted
date: 2026-10-19
supersedes: 'Partial extension of ADR-0037 for workspace draft context and Knowledge sharing'
superseded_in_part_by: 'ADR-0050 media exclusion and copy-before-shared-conversation rule'
---

# ADR-0042: Knowledge workspace document and context boundaries

## Context

The learner wants an editor beside the existing contextual assistant to develop
language-learning documents, reuse replies and continue work later. Introducing
another saved document entity would duplicate Knowledge identity, editing and
revision behavior. Automatically using current editor content and sharing notes
also extend the private-note and explicitly selected draft-context baseline in
ADR-0037. These are durable ownership and context choices with consequences for
privacy, stale proposals, copying and conversation memory.

This record captures workspace interview decisions Q1–Q21 and the deferred-media
follow-up. The learner authorized implementation of the resulting plan on
2026-10-19. ADR-0037 and ADR-0041 continue to govern their remaining scope.

## Decision

Use the existing Knowledge note as the saved document. Its workspace is an
editing view with the reused contextual assistant. Notes include learner-written
essays, study documents and language-learning research notes. Save updates the
same note; Save a copy creates an independent note. Do not couple the saved note
body to the survival of its originating conversation. Recover private working
edits automatically on the server, across devices, with visible recovery status.
Concurrent edits preserve both versions for resolution: continue with either,
manually combine them or save one as another note. Alternatives remain until
explicit resolution; do not automatically merge prose or discard a draft. Explicit Save updates
the saved note and its shared view; accepted editor proposals change the working
draft only.

Research can use an empty editor. New note creates an Untitled private draft
with stable note identity, listed as Draft and supporting immediate chat/reopen/
deletion. Sharing requires the first explicit Save. The first user message
supplies the default title's first three words unless the learner has renamed it.
Each new chat gets its own title using the same rule; later chats never rename
the note. Titles need no model call. Explicit Save requires a title and nonempty
body; summary, categories and language metadata are optional. An empty-body
research draft stays private and recoverable without enabling sharing.
This introduces a draft state of the same note, not a second document entity.

Each note supports multiple private conversations with the latest resumed by
default, plus New conversation and deletion. New conversations receive current
editor context but no other thread's history or copied attachments.

Ordinary assistant replies remain chat content. Editor proposals support Insert
at cursor, Append and Replace selected text, with explicit learner acceptance
and undo. Applying a proposal edits the working document; it does not implicitly
publish or save it. If its target changed during generation, require comparison
before replacing newer wording. Track target identity through edits above and
below it; raw offsets that silently point to another paragraph are insufficient.
Moving the cursor does not redirect a proposal. If the target disappears, request
a new target. Append inserts at the current document end when accepted, and each
acceptance is one undoable edit. Preserve version checks for saved note updates.

Capture the current editor content, including unsaved edits, at each message
submission. Generation uses that turn's immutable snapshot; subsequent editing
is reflected in a later turn. Include the complete editor snapshot within its
configured allowance; never silently substitute excerpts. Automatically compact
older conversation history. If the current snapshot and attachments still cannot
fit the request budget, explain the limit and require smaller input before an
answer proceeds. Explicit passage selection focuses the question
without silently discarding surrounding editor context. This automatic snapshot
policy is specific to the new Knowledge workspace; dictionary/text draft policy
is not implicitly changed.

Additional Texts selected through `/` are copied content in one message, with a
compact UI preview. Send actual content to the tutor. Originals may subsequently
change or disappear without changing those copies. App-assisted selection checks
access when obtaining the copy; message processing does not depend on resolving
live source identifiers. Attachments are untrusted learning material and do not
grant additional tool permissions.

The default total reference-body allowance per message is 40,000 characters of
plain text including whitespace. Explicit translations count toward this total.
Allow exactly the limit; reject an addition atomically if it exceeds the limit,
preserve existing selections and explain the configured allowance in a toast.
Environment configuration owns the effective allowance, consistently applied in
the UI and backend. Model-specific allowances are later scope. Editor context
has a separate environment-configured default allowance of 40,000 plain-text
characters. Notes exceeding that AI allowance remain editable/saveable within
normal document storage limits, but cannot be submitted wholesale to the tutor.
Total model input capacity must account for context, memory, instructions, tools
and reserved output as well.

Notes may be shared through an unlisted read-only link. Signed-in recipients can
save independent copies. Public sharing and recipient copying expose saved note
content only, never private drafts, conversations or their copied attachments.
The owner's Save a copy instead saves the current working draft, title and
metadata as a new note; it leaves the original unchanged. Neither copy operation
includes chats, message attachments or earlier revisions. Permission to view a note
does not grant editing rights to its original. Shared readers must make their
own copy before starting tutor work. Their copies and private chats survive
later changes to or revocation/deletion of the original. Disabling sharing
invalidates the link immediately; enabling again creates a fresh link. Previously
issued links stay invalid, while existing independent copies remain usable.

Preserve the current language-learning task constraints, safe content rules and
model/credit authority. Initial research uses model knowledge and supplied
material without web search. Automatic Mastra compaction is required, preserving
readable history and access to exact historical wording while distinguishing
current editor state. Memory work remains bounded and accounted. Future uploaded
images, PDF/DOCX and retrieval are separate scope; selecting notes as additional
references remains a possible future extension. Media in documents, including
video/YouTube/TikTok, audio, images and article references, is also deferred.
Ordinary hyperlinks remain ordinary text/link content in the first iteration;
the tutor must not claim to fetch or interpret their remote media. Future media
processing, extraction and context representation require a separate design.

## Alternatives considered

### Separate workspace document exported into Knowledge

This would add independent identity, save and revision behavior for essentially
the same learner document. The learner selected Knowledge note identity directly.

### Live references to added Texts

These would require later source resolution and access/lifecycle decisions when
originals change or disappear. The learner selected immutable message copies,
consistent with existing copied attachments. The note itself remains the primary
conversation source.

### Persistent workspace reference list

This could reuse material across turns but adds a separate attachment lifecycle.
The learner chose references accompanying individual messages.

### Direct assistant edits or implicit saving

This can overwrite learner work or publish content without review. The learner
selected accepted proposals with undo and explicit saved-note updates.

## Consequences

### Positive

- Knowledge identity and the existing editor/chat capabilities remain reusable.
- Copies and per-turn snapshots make the wording used by an answer stable.
- Sharing a document does not reveal private research conversations.
- Explicit proposal acceptance preserves learner control over the document.

### Negative

- Copied references can become outdated; revoking their original cannot retract
  personal copies already made.
- Repeated editor snapshots can increase model input/storage pressure; history
  compaction and current-turn capacity need coordinated handling.
- Private working drafts, conflict alternatives and explicit publication require
  distinct lifecycle handling alongside revocable sharing links.

### Risks / limitations and delivery boundaries

- Product decisions Q1–Q21 are resolved and implementation is authorized.
- Server draft recovery, conflict preservation, relaxed note metadata and unlisted
  sharing extend persistence/API/access behavior and require feature delivery.
- Actual full-request capacity and Mastra compaction need integration evidence;
  configured character allowances do not establish runtime compatibility.
- Target tracking must survive surrounding edits, without conflating positional
  changes with edits to the selected content or silently retargeting proposals.
- Future uploads/media/RAG and model-dependent allowances are explicitly deferred.
- No runtime verification or delivery completion is claimed by this record.

## Related

- [Workspace interview in BL-006](../backlog/006-grammar-conversations-and-learning-documents.md)
- [Learning-assistance glossary](../../CONTEXT.md)
- [ADR-0037](0037-independent-knowledge-and-agent-proposals.md)
- [ADR-0041](0041-durable-tutor-streaming-presentation.md)
