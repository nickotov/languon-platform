---
type: adr
id: ADR-0057
title: Dictionary-chat snippets and manual-style application
status: accepted
date: 2026-11-11
supersedes: 'ADR-0011 generation-time acceptance version pin only for dictionary-chat snippets; other rules remain active'
---

# ADR-0057: Dictionary-chat snippets and manual-style application

## Context

The dictionary contextual assistant currently reads dictionary context but cannot
propose typed cards for insertion. The requested extension generates complete
cards using dictionary settings and existing grammar/article rules. The learner
has chosen read-only chat results, selection before insertion, and ordinary card
editing after insertion.

The learner also rejected stale-snippet notices and mandatory refresh after
dictionary settings change: inserting the reviewed content is their choice.
Existing AI batch acceptance instead compares generation-time dictionary/settings
versions and language tags under ADR-0011. Reusing that acceptance path unchanged
would reintroduce a workflow the learner has rejected.

This difference matters after card content and provenance are persisted: a future
reader must understand why a snippet generated under older settings could be
inserted without automatic regeneration. The trade-off is manual-style learner
control versus guaranteed compatibility with the generation-time settings.

Accepted on 2026-11-11 after the user confirmed the full design and explicitly
requested implementation. The [design record](../../.agent/improvements/dictionary-chat-snippet-design.md)
retains the decisions; [feature063](../../.agent/features/063-dictionary-chat-snippets/FEATURE.md)
owns authorized implementation. No production deployment or paid call is authorized.

## Decision

Use a dictionary-owned explicit application contract for chat-generated card
values, distinct from accepting an existing asynchronous batch-generation job.

- Generate complete word/phrase cards using authoritative dictionary settings,
  relevant authorized context and the existing appropriate-language grammar,
  gender, inflection and article rules. Retain generation provenance faithfully.
- Chat card content is read-only. The learner selects all or some cards and
  explicitly chooses Append, Prepend or Replace. Editing uses the ordinary
  dictionary editor after insertion; application performs no AI request.
- Retain the original read-only snippet in private conversation history across
  reload/navigation under ordinary conversation/source access and retention
  rules. It is reusable: the learner may apply different subsets later or
  deliberately insert the same cards again. Do not add editable chat drafts or
  per-card consumed-state management. Retries of one application are idempotent;
  a later deliberate application is a distinct operation.
- A conversational refinement generates a new read-only snippet from the exact
  retained source content, preserving the earlier snippet and dictionary content
  until the learner applies a result.
- Treat application as inserting the reviewed values under the current
  dictionary settings, subject to ordinary ownership, active-source, field,
  capacity and transactional concurrency validation. Do not add a generation-age
  or stale-settings gate, force regeneration, silently translate/correct values,
  or modify dictionary settings. The learner is responsible for whether previously
  generated content is suitable after their settings changes.
- Do not confuse generation provenance with write authority. The application
  still uses current trusted dictionary state and ordinary optimistic write
  versions; the model cannot choose an owner, target dictionary or permissions.
  No concurrency or authorization guard is waived by this decision.
- Apply the selected ordered set atomically. Replace concerns the entire current
  active card list, with confirmation of the affected count, preserving dictionary
  title/settings and existing archived content. Archive replaced cards rather
  than permanently deleting them; their identities/history survive. Inserted
  cards have new identities and fresh progress, as with manual creation.
- Permit duplicates with a non-blocking notification; the learner is responsible
  for keeping them. Do not silently merge, skip, prevent deliberate repeated
  insertion or inherit matching cards' progress. Preserve trusted AI authorship.
  Initially expose this capability only for the dictionary owner.

This exception applies only to dictionary-chat snippet application. Existing asynchronous generation-job acceptance, other AI proposals,
dictionary ownership and learning-version rules remain governed by their existing
decisions. ADR-0011 is superseded only for this narrow generation-time pin; its
accepted body remains historical and unchanged.

## Alternatives considered

### Require unchanged generation-time settings for every application

This is appropriate for existing batch jobs but would force a stale-state
notification or recovery step the learner explicitly rejected for chat snippets.

### Regenerate or correct content automatically on insertion

This incurs additional AI work and could change the reviewed result without a
fresh learner request. It also differs from ordinary manual card insertion.

### Provide an editable, recoverable draft inside chat

This adds a second card-editing surface and draft lifecycle. The learner chose
selection in chat and the existing dictionary editor after insertion.

### Let the AI tool mutate the dictionary directly

This bypasses the chosen explicit selection/application step and cannot establish
write authority from model behavior.

## Consequences

### Positive

- One card-editing surface; insertion itself is deterministic and incurs no AI use.
- The learner controls reuse of generated content and dictionary configuration.
- Replacement preserves recoverable old content and its learning history.

### Negative

- Previously generated content may no longer suit current language/field settings;
  ordinary validation cannot establish linguistic correctness.
- Chat snippets cannot simply reuse the current generation-job acceptance gate.

### Risks / limitations

- Required transaction/version checks, provenance, live ownership and source
  availability must be retained; this is not permission for blind writes.
- Archived cards can be restored through the existing lifecycle. No one-click
  replacement Undo or restoration of old positions has been agreed.
- Selected cards retain their generated order and apply atomically. Empty
  selection is not an application. Request/capacity limits cannot trigger silent
  truncation or automatic additional paid generation.
- Acceptance authorizes the design; implementation/execution evidence remains in feature063, not this decision record.

## Related

- [ADR-0011](0011-dictionary-persistence-and-composition.md)
- [ADR-0023](0023-archived-dictionary-content-deletion.md)
- [ADR-0024](0024-flashcard-learning-state-and-revisions.md)
- [ADR-0037](0037-independent-knowledge-and-agent-proposals.md)
- [Learning glossary](../../CONTEXT.md)
- [Design interview](../../.agent/improvements/dictionary-chat-snippet-design.md)
