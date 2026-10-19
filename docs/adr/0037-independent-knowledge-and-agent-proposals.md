---
type: adr
id: ADR-0037
title: 'Independent knowledge and agent proposals'
status: accepted
date: 2026-10-18
supersedes: 'ADR-0026 only for contextual-conversation Auto model selection; other selection guarantees remain active'
---

# ADR-0037: Independent knowledge and agent proposals

## Context

BL-006 design discovery introduces contextual language conversations on
dictionaries, texts, and saved knowledge notes. The learner wants a later AI
tutor to reuse explanation and knowledge-saving capabilities. Coupling saved
learning material to chat history or granting agents direct write authority
would make future reuse, ownership, revision safety, and deletion harder to
reason about.

The learner explicitly selected independent notes with no origin links and
confirmed separate Knowledge ownership, structured agent proposals, and
learner-controlled publication in interview Q17–Q18. This record captures that
direction together with the confirmed copy/lifecycle rules and Mastra Observational
Memory choice. On 2026-10-19 the learner authorized implementation of the plan,
including Tiptap editing and Flash-only initial chat support. Acceptance records a
design decision; implementation and verification are tracked in feature044.

## Decision

Knowledge owns notes, saved revisions, validation, and explicit publication
through its own application service. Conversation orchestration remains
separate. A note contains a title, short summary, formatted explanation with
necessary examples, categories, studied language, and explanation language.
It has no link to an originating dictionary, text, or conversation. Opening a
conversation about a note makes the note an input to that conversation; it
does not make the note depend on conversation history.

Agents may retrieve authorized learning material and propose a structured new
note or note revision. Ordinary chat replies remain prose. Draft content is
untrusted input validated against a bounded application-owned schema. The
application presents an editable draft; a learner's explicit Save command
invokes the Knowledge service with authenticated ownership and version checks.
Saved updates preserve prior saved versions.

Unsaved drafts persist privately with their conversation, labeled Draft and
excluded from Knowledge until explicit Save. Discard or conversation deletion
removes those drafts. Saved notes remain independent of draft/conversation
lifecycle.

A stale draft cannot overwrite newer saved edits. The learner can compare it
with the latest note or save it as a new note. Restoring a historical version
creates a new current revision; confirmed deletion removes the note and its
revisions. A pending agent operation must not implicitly recreate a deleted note.

Conversation access follows primary-source availability: archiving or lost
shared access suspends conversation access; restoring access restores it.
Permanent source deletion removes associated conversations, while independently
saved notes survive. The primary source is the dictionary, text, or note from
which the conversation is opened; it remains a live authorized reference.
Memory summaries, buffers, and recall must follow the same access/deletion
boundary as their conversation.

Explicit attachments are copies of selected learner-visible content stored
with the message, shown as distinct content blocks in the composer and history.
They have no live resource link and introduce no additional source dependency.
Access is authorized when the app reads material for copying; after copying,
edits, revocation, or deletion of the original do not change the stored copy or
the unrelated host conversation. Primary-source deletion still removes the host
conversation, including any copies inside it. These are explicit personal
copies, not retained source caches used to bypass current access checks.

New turns use the latest saved primary-source content and indicate changes
since the preceding turn. Historical messages/copies remain unchanged; memory
must distinguish past wording from current content. Using unsaved source edits
requires the learner's explicit selection.

Each conversation has at most one active response. Reconnection attaches to
the existing operation without duplicate generation. Navigation does not
cancel work; explicit Stop cancels further work where possible. Failed partial
answers are visibly incomplete, and retrying generation is a learner action.

Agent tools do not silently publish, overwrite, or delete notes. Model-provided
identifiers or assertions cannot establish ownership, source access, or save
authority. Read tools enforce current source authorization in application code;
the language-tutor prompt does not replace permission checks. Dictionary reads
include only active learner-visible fields, preserving private authoring data.

The contextual assistant and future tutor share these specific application
capabilities and typed draft contracts. They do not share a generic public
prompt/schema/tool executor, and notes do not become a universal learning-asset
payload. Exact tool names and public API shapes remain implementation design
work under ADR-0011 and ADR-0026.

AI work uses the existing text model-selection, capability, credit, and
operational-limit boundaries. Each admitted unit must have bounded execution
and preserve applicable immutable model/pricing and settlement rules. An
unavailable explicit model never silently falls back. Generating or rewriting
a draft consumes AI usage; saving an existing draft or manually editing a note
does not invoke model execution. This introduces no second wallet, free
allowance, pricing change, or implicit credit-enforcement activation.

Mastra Observational Memory manages long-conversation context, with observations
and raw-message recall scoped to the current conversation. Full readable history
is preserved. Its model is explicitly selected through application policy, and
compaction runs when needed inside a bounded admitted chat operation with its
usage accounted for. Speculative background compaction is excluded initially.
Memory is internal conversation state and cannot publish Knowledge automatically.
The initial integration pins Memory1.26.0 with Core1.57.0 and implements the
MemoryStorage port over application-owned Drizzle tables. Every memory write
shares the operation lease and live source authorization fence. Synchronous
observation/reflection share the actor model and credit boundary, with at most
five provider calls in a turn and at most two memory calls. Background buffering
is disabled. Full history and genuine tool exchanges remain canonical.

### Initial model and web transport

Contextual conversation Auto selects DeepSeek Flash. Explicit user selection
still must support the requested task and be enabled and available; incompatible
selection errors without fallback. Other tasks continue to use the platform
Auto default from ADR-0026. Chat capability is registered only for Flash and
requires current conversation execution/capacity evidence.

The web client uses Vercel AI SDK UI `useChat` and a custom transport over the
application’s durable admission and replay endpoints. UI message/tool parts are
projections; they grant no tool or publication authority. Subscription cancellation
is separate from the explicit application Stop operation. HTTP disconnects must
never cancel worker-owned generation or trigger duplicate dispatch.

Knowledge uses a versioned restricted ProseMirror JSON contract with Tiptap3.32.0
as the web editor. Server validation and fixed safe renderers permit a documented
node/mark set and HTTP(S) links, excluding raw HTML, images and embeds. The
contract remains SDK-independent. Chat Markdown is a separate presentation.

## Alternatives considered

### Store notes as chat messages or source-linked summaries

This simplifies an initial save action but makes learning material depend on
the source or conversation lifecycle. The learner instead chose standalone
notes whose necessary context is in their content, with no origin links.

### Give each agent its own note storage and save tool

This duplicates ownership, validation, version checks, and revisions across
the contextual assistant and future tutor. A shared Knowledge service keeps
these invariants consistent while allowing different agent experiences.

### Let the model directly publish through a write tool

This weakens the explicitly confirmed draft-review-save interaction and makes
prompt behaviour part of mutation authority. Structured proposals followed by
authenticated learner commands preserve the intended publication boundary.

### Require every assistant reply to be a note-shaped object

Ordinary clarification and discussion need not create saveable learning
material. Separate prose replies and typed proposals support both interactions
without forcing all conversation into a document structure.

### Keep every attachment as a live resource dependency

This allows refreshing and navigating attached resources, but extends shared
access and deletion dependencies into otherwise unrelated conversations.
The learner selected explicit copied content for initial attachments. Live
links are deferred; the primary conversation source retains its own live
authorization and lifecycle contract.

## Consequences

### Positive

- Saved learning material can be used independently by later learning features.
- The learner controls publication and can preserve edits through revisions.
- Tool authority and source access are enforceable without trusting prompts.
- Conversation and note experiences can evolve independently.

### Negative

- Draft generation, validation, review, and publication require distinct states.
- Notes deliberately lose direct navigation and provenance links to their origin.
- Version checks, retained revisions, and associated conversation removal add
  persistence and lifecycle responsibilities.
- Copied attachments can become stale and lack navigation to the original;
  sharing revocation cannot retract independently copied content elsewhere.

### Risks / limitations

- Independence is not a blanket retention exception. Automatic retrieved
  context remains subject to the primary source's access rules; account erasure
  and explicit snapshot-copy publication semantics need technical integration
  consistent with ADR-0011, ADR-0023, and ADR-0035.
- Safe formatting/rendering, operational retry/cancellation and durable recovery,
  and storage limits need technical specification under the agreed UX rules.
- Mastra Observational Memory is selected for thread-scoped context compaction;
  the adapter integration and limits require deterministic real-SDK evidence.
  Its own model calls and memory stores must honor application usage, isolation,
  and source-lifecycle rules, rather than inheriting library defaults implicitly.
- Tool-using turns may involve several model calls; admission and settlement
  must account for the complete bounded operation, not just the final reply.
- Model uncertainty and topic restrictions require evaluation; saving a note
  never certifies its factual accuracy.
- Production activation requires migrated schemas, compatible worker capability
  observations and the existing routing/credit gates. No deployment is implied
  by accepting this record.

## Related

- [BL-006 design decisions](../backlog/006-grammar-conversations-and-learning-documents.md).
- [Learning-assistance glossary](../../CONTEXT.md).
- [ADR-0011: Dictionary persistence and composition](0011-dictionary-persistence-and-composition.md).
- [ADR-0022: AI credit ledger and generation settlement](0022-ai-credit-ledger-and-generation-settlement.md).
- [ADR-0023: Archived dictionary content deletion](0023-archived-dictionary-content-deletion.md).
- [ADR-0026: Shared text AI selection and user preferences](0026-shared-text-ai-selection-and-user-preferences.md).
- [ADR-0035: Texts ownership and contextual vocabulary publication](0035-texts-and-contextual-vocabulary-publication.md).

- [Feature044 implementation and verification](../../.agent/features/044-contextual-language-assistant-and-knowledge/FEATURE.md).
