---
type: diagram
title: Dictionaries and learning
summary: Authored vocabulary, review-first AI generation and personal practice use distinct ownership and revision rules.
source_paths:
    - apps/backend/src/modules/dictionaries/application/dictionary-service.ts
    - apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store.ts
    - apps/backend/src/modules/learning/infrastructure/learning-composition.ts
    - apps/backend/src/modules/learning/application/learning-service.ts
    - apps/backend/src/modules/learning/application/sentence-worker-service.ts
    - apps/web/src/fsd/features/flashcard-training/model/practice-session.ts
    - docs/adr/0011-dictionary-persistence-and-composition.md
    - docs/adr/0024-flashcard-learning-state-and-revisions.md
    - docs/adr/0025-flashcard-capability-enabled-by-default.md
    - docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md
    - apps/web/src/fsd/features/flashcard-training/api/learning-api.ts
source_fingerprint: sha256:6db722541c29a8a0f08c3f4bda1e4791d25ab69afecbe7b30b50200a71ed2607
reviewed: 2026-10-19
---

# Dictionaries and learning

Authored vocabulary, review-first AI generation and personal practice use distinct ownership and revision rules.

```mermaid
flowchart LR
    Owner["Owner authoring / import / lifecycle / share"] --> Dict["Dictionary service
live authority + versions"]
    Dict --> Content[("Typed dictionary, settings, cards
immutable authored revisions")]
    AI["Generate / regenerate / batch / document"] --> Jobs["Durable bounded generation job"] --> Proposal["Validated review proposal"]
    Proposal --> Accept["Explicit Accept
lock dictionary/settings/card versions"] --> Content
    Owner --> Fork["Reader fork with live share capability"] --> Copy["New private dictionary + new card IDs
independent content"]
    Content --> Resolve["Live dictionary participant
effective fields + monotonic learning version"]
    Resolve --> Cards["Flashcard practice
client session queue"]
    Cards --> Rating["Authenticated rating / Undo
idempotent learner operation"]
    Rating --> Progress[("Content-free personal attempts
one current result per learner/card")]
    Resolve --> Sentences["Sentence generation/check
shared bounded AI job execution"]
    Sentences --> Exercise[("Exercise + private reference
personal attempts / AI feedback")]
    Exercise --> Reveal["Explicit authorized reference review
free, no provider call or AI grade"]
    Content --> Change["Effective learning content changes"] --> Invalidate["Increment learning version
prior-version progress becomes Unstudied"]
    Invalidate --> Progress
```

Dictionary defaults and nullable card overrides resolve server-side; dormant values
are retained when disabled. Forking creates independent identities and does not
inherit personal progress. Sharing uses a random locator plus a fragment capability
forwarded in a dedicated header, with digest-only durable storage and live checks.

Dictionary AI proposals require acceptance with version checks. The separate
[selected-text Add](texts-and-vocabulary.md) is an explicit publication exception.
Learning stores content-free flashcard history, and content changes invalidate via
a monotonic learning version, not by resurrecting a prior content hash. Undo checks
ordering and version. Client session queues are not resumable server queue records.

Cards default enabled under ADR-0025 with an explicit off switch. Sentence exercises
and personal checks have their own typed storage; generated references are omitted
from ordinary projections. The free reference action records a manual review and
does not claim objective scoring. Permanent content deletion cascades linked
progress; account purge also removes personal state on foreign dictionaries.

## Sources

- [apps/backend/src/modules/dictionaries/application/dictionary-service.ts](../../apps/backend/src/modules/dictionaries/application/dictionary-service.ts)
- [apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts](../../apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts)
- [apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store.ts](../../apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store.ts)
- [apps/backend/src/modules/learning/infrastructure/learning-composition.ts](../../apps/backend/src/modules/learning/infrastructure/learning-composition.ts)
- [apps/backend/src/modules/learning/application/learning-service.ts](../../apps/backend/src/modules/learning/application/learning-service.ts)
- [apps/backend/src/modules/learning/application/sentence-worker-service.ts](../../apps/backend/src/modules/learning/application/sentence-worker-service.ts)
- [apps/web/src/fsd/features/flashcard-training/model/practice-session.ts](../../apps/web/src/fsd/features/flashcard-training/model/practice-session.ts)
- [docs/adr/0011-dictionary-persistence-and-composition.md](../../docs/adr/0011-dictionary-persistence-and-composition.md)
- [docs/adr/0024-flashcard-learning-state-and-revisions.md](../../docs/adr/0024-flashcard-learning-state-and-revisions.md)
- [docs/adr/0025-flashcard-capability-enabled-by-default.md](../../docs/adr/0025-flashcard-capability-enabled-by-default.md)
- [docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md](../../docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md)
- [apps/web/src/fsd/features/flashcard-training/api/learning-api.ts](../../apps/web/src/fsd/features/flashcard-training/api/learning-api.ts)
