---
type: adr
id: ADR-0050
title: 'Interactive workbook content and learning boundaries'
status: proposed
date: 2026-10-28
supersedes: 'Proposed partial extension of ADR-0037 restricted document content and ADR-0042 media and shared-reader conversation boundaries'
---

# ADR-0050: Interactive workbook content and learning boundaries

## Context

The user confirmed the interactive workbook discovery scope after decisions
Q1–Q25, including reusable blocks, ordered workbooks, private reader practice,
independent copies and protection against XSS. Existing Knowledge notes already
have stable identity, recoverable private working branches, explicit publication,
revision history and revocable unlisted links. Creating a second document kind
would duplicate those boundaries.

ADR-0037 currently restricts saved documents to prose without embeds. ADR-0042
defers media and requires readers to copy a shared note before tutor work. The
confirmed extension permits interactive content and read-only explanation and
evaluation on shared originals. Their remaining ownership, proposal acceptance,
publication, source lifecycle and accounting constraints remain applicable.

This record is proposed engineering design for the confirmed product scope. It
does not claim implementation, verification or acceptance of the architecture.

## Decision

### Content and reusable blocks

Keep Knowledge note as the saved document identity. A workbook orders notes;
each note belongs to at most one workbook and may stand alone. Workbook deletion
defaults to dissolving the group while preserving its notes. Removing notes
themselves requires a separate explicit action.

Define bounded, SDK-independent block contracts for video, vocabulary, bilingual
text, audio, grammar and exercises. Blocks contain authored content rather than
learner attempts or private conversations. Vocabulary and Text library saves,
and insertion from those libraries, create independent copies with no live sync.
Grammar-library saving remains deferred. Reusable frontend block presentation
and interactions must not depend on Knowledge editor or route internals; editor
node views adapt those components to authoring.

Introduce a versioned block-capable Knowledge body contract while retaining
version 1 readers and explicit legacy validation. Version 2 publication requires
compatible persistence, editor normalization, fixed renderers, copying, revision
restoration and text projection. Extend the database version constraint before
writers emit version 2. Preserve old revisions without rewriting their content.
Unsupported or malformed content is rejected rather than silently stripped.

### Writer authority and AI

Widening a document read contract must not widen an existing writer's authority.
Keep legacy prose proposal inputs explicitly constrained until the corresponding
writer is deliberately upgraded. Typed block proposals require owner authoring
authority, validated content and asset access, preview and explicit application.
Applying a proposal changes the working draft; explicit Save publishes it.

Shared readers can ask for explanations and answer evaluation but cannot change
the original document. Derive tool capabilities from server authorization, omit
authoring tools from shared-reader execution and reject unauthorized writes at
application/persistence callbacks as well. Model claims, source instructions and
client-selected identifiers cannot establish authority. Shared conversations use
authorized saved content, never an asserted owner working draft.

AI execution uses existing routing, admission, action budgets, cancellation,
worker fencing and credit settlement. The requesting signed-in learner pays
under the applicable policy. Revealing prepared answers invokes no model.
Specialized generation capabilities may compose within that bounded execution;
this record does not require autonomous subagents or a generic tool executor.

### Sharing, copies and media lifetime

Publish only saved content. A workbook link covers its current saved notes and
later additions with a clear notice; removing a note removes workbook-based
access while independent note links remain separately governed. Live access
checks must fence reads, AI work and writes against revocation and deletion.

Copies of blocks, notes and workbooks receive independent identities and exclude
learner state, private chats and prior revision history. Copied exercises receive
fresh identities. Copying authorized uploaded media establishes durable access
for the destination before the copy is considered successful; deleting or
revoking the source cannot invalidate a completed independent copy. Shared
storage may deduplicate bytes, but a source note must not be the destination's
only asset ownership reference. Physical cleanup must respect every surviving
authorized reference and existing deletion-journal rules.

Media playback is separate from AI understanding. Initial video sources are
YouTube and direct browser-playable URLs; unsupported providers remain links.
External media availability remains dependent on its host. Uploaded audio and
generated speech use authorized asset references, not arbitrary storage keys.
Transcription needs an explicit provider capability and accounting integration.
Comprehension questions and hints are grounded in supplied or prepared
transcripts, with replay timestamps where available. Automatic remote-video
understanding is deferred.

### Private learning state

Store attempts, feedback, hint/reveal observations, private translations and note
completion separately from published content and scoped to the learner. Authors
cannot inspect this state. Practice is available directly from blocks without
requiring library saving. Attempted, revealed and correct are distinct states;
note completion is explicit rather than inferred from opening a page.

Exercise identity survives movement and presentation changes. A semantic
revision changes when question, choices, accepted answers, evaluation criteria
or supporting source passage/audio changes; explanation-only corrections do
not reset progress. Derive revision identity from validated content on the
server. Historical attempts remain tied to the version answered. Note changes
show updated-since-completion without silently clearing completion.

Loss of source access suspends shared-source conversations and practice history.
Permanent note deletion removes associated conversations, attempts, progress and
private translations. Independent copies and library saves survive. These rules
also apply to caches, generated feedback and retained source excerpts; access
cannot be recovered through a secondary history endpoint.

### Safe rendering and untrusted content

Accept only documented typed content and attributes at server boundaries. Treat
AI output, clipboard payloads, stored documents, translations and transcripts as
untrusted. Render text through escaped React text and explicit node mappings;
do not inject arbitrary HTML, scripts, event handlers or embed code.

Validate URL schemes and media source forms. Construct YouTube player URLs from
validated identifiers with constrained permissions. Do not convert arbitrary
links into executable frames. Upload handling and any server-side retrieval
must bound size/type and prevent private-network access. Schema validity does
not prove asset ownership: reauthorize assets for publish, copy and restore.

Verify malicious content across editing, persistence/reload, proposals,
translation, copying and shared rendering, including browser behavior and
applicable CSP boundaries. Require independent security review before completion.

## Alternatives considered

### One unrestricted document payload for every writer

This minimizes schema changes but silently expands legacy agent tools and
permits unexpected media references. Versioned content plus explicit writer
capabilities preserves reviewable authority and compatibility.

### Store progress inside block content

This makes initial UI persistence convenient but conflates author publication
with private learner activity, leaks data through sharing and breaks independent
copies. Separate learner state supports multiple readers and future lessons.

### Live library references and source-owned media copies

These avoid duplication but make copied learning material depend on edits,
revocation or deletion elsewhere. Independent content snapshots and durable media
references implement the confirmed copy semantics.

### Arbitrary HTML or iframe blocks

These maximize embed flexibility but create executable-content and permission
surfaces that cannot be justified by the requested learning blocks. Explicit
schemas and provider-specific renderers bound the supported behavior.

## Consequences

### Positive

- Notes retain established publication and recovery behavior while blocks can
  serve future lesson contexts.
- Private practice and shared authorship have enforceable separate authority.
- Independent copies remain usable after source deletion or revocation.
- Strict writer contracts and fixed renderers preserve the existing XSS boundary.

### Negative

- Version compatibility, asset lifetime and semantic exercise revisions require
  coordinated migration, transaction and concurrency coverage.
- Media copying and private learning history increase lifecycle/storage work.
- Each new block type needs deliberate validation, projections and UI support.

### Risks / limitations

- Provider selection, transcription limits and compatible narration capacity
  still require bounded research; existing synthesis is dictionary-source-bound.
- A valid proposal or contract test does not establish publication authority,
  actual browser safety or database lifecycle behavior.
- Course generation, group-wide AI context, teacher dashboards, grammar-library
  saving and automatic remote-video understanding remain out of scope.
- Proposed status does not supersede accepted ADRs until explicitly accepted
  and indexed by the integrating agent under repository policy.

## Related

- [Confirmed discovery decisions](../interactive-workbook-discovery.md).
- [Domain glossary](../../CONTEXT.md).
- [ADR-0037](0037-independent-knowledge-and-agent-proposals.md).
- [ADR-0042](0042-knowledge-workspace-document-and-context-boundaries.md).
- [ADR-0035](0035-texts-and-contextual-vocabulary-publication.md).
- [ADR-0019](0019-account-deletion-journal-commit-and-replay.md).
- [ADR-0045](0045-action-accounting-and-provider-expenses.md).
- [Existing Knowledge workspace](../../.agent/features/047-knowledge-workspace/FEATURE.md).
