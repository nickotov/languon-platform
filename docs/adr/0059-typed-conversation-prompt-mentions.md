---
type: adr
id: ADR-0059
title: Typed conversation prompt mentions
status: accepted
date: 2026-11-15
supersedes: 'None'
---

# ADR-0059: Typed conversation prompt mentions

## Context

Feature069 introduces inline exercise-catalog and current-document block tokens.
Their placement belongs to the learner's message, while identities must remain
independent of translated display names. Existing conversation content, source
snapshot authorization and publication rules remain canonical.

## Decision

Keep plain message content and add optional typed prompt mention metadata. A
mention records an ordered, non-overlapping UTF16 range and either a catalog
activity/version or document block ID. Ranges are validated against actual text,
including surrogate boundaries. Display text is not authority and is never parsed
to recover privileged identities. Existing ordinary text messages have no mentions.

Persist metadata in message history and admitted execution. Include it in request
fingerprints and retries. Source mentions resolve only against the host-authorized
snapshot and current source authority, never by arbitrary cross-document lookup.
Historical labels remain text; they do not grant ongoing access to source content.

Activity mentions constrain generated activity identities, not every conversational
intent. Multiple mentioned types share the selected source set. Prompt quantity
applies, or defaults to one per type. Explicit advanced generation settings keep
their existing conflict/clarification contract. Missing/incompatible sources require
clarification rather than substitution or silent dropping of selected activities.

This extends established source-bound conversation architecture under the approved
feature. It changes no provider budget, authorization or automatic publication.

## Alternatives considered

### Parse displayed names from plain text

Rejected: translations, ordinary prose and renamed labels cannot reliably convey
stable activity identities or authorized source IDs.

### Send editor-specific rich document JSON

Rejected: leaks editor framework details across the API and increases the accepted
input surface. Small SDK-independent range metadata preserves canonical text.

## Consequences

### Positive

- History, retries and the model pipeline share explicit identities.
- Native and plain-text consumers retain useful readable content.
- Source authority remains host-owned under ADR-0052/0058.

### Negative

- Message persistence and idempotency include additional metadata.
- Composer serialization must map Unicode ranges and trim operations precisely.

### Risks / limitations

Validate identities, ranges, limits and current authority at admission; exclude
labels from privileged lookup. Clipboard text cannot create typed authority.
Deterministic tests prove wiring, not live provider pedagogical quality.

## Related

- [ADR-0052](0052-source-bound-knowledge-ai-actions.md).
- [ADR-0058](0058-named-activity-content-and-source-provenance.md).
- [Feature069](../../.agent/features/069-contextual-exercise-discovery/FEATURE.md).
