---
type: diagram
title: Conversations and independent Knowledge
summary: Durable contextual chat produces editable private drafts; only an explicit learner command publishes an independent note.
source_paths:
    - docs/adr/0041-durable-tutor-streaming-presentation.md
    - apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
    - apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts
    - apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.tsx
    - apps/backend/src/modules/conversations/interface/http/conversation.routes.ts
    - apps/backend/src/modules/conversations/application/conversation-service.ts
    - apps/backend/src/modules/conversations/application/conversation-worker-service.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts
    - apps/backend/src/modules/knowledge/application/knowledge-service.ts
    - docs/adr/0037-independent-knowledge-and-agent-proposals.md
    - apps/web/src/fsd/entities/conversation/api/conversation-api.ts
    - apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts
    - apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts
source_fingerprint: sha256:b7f2580a99122176b042bb54f26086c1cbd7670f76026e9dad1dea7a7ce2bd39
reviewed: 2026-10-19
---

# Conversations and independent Knowledge

Durable contextual chat produces editable private drafts; only an explicit learner command publishes an independent note.

```mermaid
flowchart TB
    Source["Live primary dictionary, text or Knowledge note"] --> Open["Open private conversation
current source authority"]
    Open --> Send["Send message + optional explicit copied attachments"] --> Admission["One active durable turn
Flash Auto / compatible explicit model
model, capacity and credit snapshot"]
    Admission --> Worker["Existing worker slot claims turn
lease + latest source snapshot"]
    Worker --> Tutor["Mastra contextual tutor
accounted answer + synchronous memory calls"]
    Tutor --> Read["read_source_context
bounded authorized material"]
    Tutor --> Memory["Thread-scoped Observational Memory
application Drizzle storage and lease fences"]
    Tutor --> Reply["Persist prose deltas / tool exchanges"] --> Replay["Durable replay to useChat transport
reconnect without duplicate generation"]
    Tutor --> Propose["propose_knowledge_note
validated structured private draft"]
    Propose --> Review["Editable draft / discard"]
    Review --> Save["Explicit learner Save
owner + note version checks"] --> Note[("Independent Knowledge note
restricted rich text + saved revisions")]
    Save -->|"Stale revision"| Conflict["Compare latest or save as new"]
    Note --> Source
    Stop["Explicit Stop"] --> Worker
    Source --> Lifecycle["Archive/lost access suspends;
permanent primary deletion removes conversation + memory"]
    Lifecycle --> Open
```

Navigation or disconnect does not cancel worker-owned generation; explicit Stop is
a separate command. Failed partial output remains incomplete; learner retry starts
new generation rather than automatically repeating an ambiguous provider request.
The model gate bounds each turn to five provider calls and two memory calls;
observation/reflection run synchronously inside accounted work, with background
buffering and vector recall disabled. Full readable history remains canonical.

Tools can read the current authorized source and propose one bounded note draft;
they cannot publish, overwrite or delete Knowledge. Store-backed Save delegates
publication to the Knowledge transaction participant with ownership/version checks.
The Knowledge service also supports independent manual create/edit, revisions and
restore; restoring a version makes a new saved revision.

Explicit attachments are personal copies authorized when read, not extra live source
links. A saved note has no origin dependency and survives conversation deletion.
Unsaved drafts and memory remain conversation-owned. The diagram's note-to-source
edge means a later conversation can use that note as its primary source; it does
not create a back-reference from the note to its old conversation.

## Sources

- [docs/adr/0041-durable-tutor-streaming-presentation.md](../../docs/adr/0041-durable-tutor-streaming-presentation.md)
- [apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts](../../apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts](../../apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts](../../apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts](../../apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.tsx](../../apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.tsx)
- [apps/backend/src/modules/conversations/interface/http/conversation.routes.ts](../../apps/backend/src/modules/conversations/interface/http/conversation.routes.ts)

- [apps/backend/src/modules/conversations/application/conversation-service.ts](../../apps/backend/src/modules/conversations/application/conversation-service.ts)
- [apps/backend/src/modules/conversations/application/conversation-worker-service.ts](../../apps/backend/src/modules/conversations/application/conversation-worker-service.ts)
- [apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts)
- [apps/backend/src/modules/knowledge/application/knowledge-service.ts](../../apps/backend/src/modules/knowledge/application/knowledge-service.ts)
- [docs/adr/0037-independent-knowledge-and-agent-proposals.md](../../docs/adr/0037-independent-knowledge-and-agent-proposals.md)
- [apps/web/src/fsd/entities/conversation/api/conversation-api.ts](../../apps/web/src/fsd/entities/conversation/api/conversation-api.ts)
- [apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts](../../apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts)
- [apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts](../../apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts)

Streaming presentation follows [ADR-0041](../adr/0041-durable-tutor-streaming-presentation.md):
active125ms/idle1000ms SSE delivers committed canonical state, then the browser
projects native incremental AI SDK parts and restricted Streamdown Markdown.
Each committed conversation session owns its SDK Chat, callbacks, cache key and
publication epoch; speculative React renders start no subscription. Terminal
access loss purges only that owner and invalidates queued publications.
Snapshots/reconnect still reconcile canonical history; UI reveal and activity
indicators do not execute tools or change durable turn state. The graph's
authority and data-flow relationships remain unchanged.
