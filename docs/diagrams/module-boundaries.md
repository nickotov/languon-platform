---
type: diagram
title: Module and layer boundaries
summary: Composition roots connect typed business modules and app-local frontend layers.
source_paths:
    - apps/backend/src/modules/conversations/infrastructure/conversations-composition.ts
    - apps/backend/src/modules/knowledge/infrastructure/knowledge-composition.ts
    - docs/adr/0042-knowledge-workspace-document-and-context-boundaries.md
    - apps/backend/src/index.ts
    - apps/backend/src/app.ts
    - apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts
    - apps/backend/src/modules/learning/infrastructure/learning-composition.ts
    - apps/web/src/app/layout.tsx
    - apps/admin/src/app/admin-app.tsx
    - packages/contracts/src/index.ts
    - docs/architecture.md
    - docs/adr/0005-frontend-component-and-fsd-standards.md
    - docs/adr/0010-admin-application-and-authorization.md
    - docs/adr/0045-action-accounting-and-provider-expenses.md
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-authorized-purge.sql
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-purge-recovery.sql
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
    - infra/deploy/sql/dictionary-worker-role.sql
    - infra/deploy/sql/account-purge-worker-role.sql
source_fingerprint: sha256:e584bc9c34366bf54cfedbb70344c4d808607e8179cc83d2f01c77d81dd0b0c9
reviewed: 2026-10-22
---

# Module and layer boundaries

Composition roots connect typed business modules and app-local frontend layers.

```mermaid
flowchart TB
    subgraph Web["Public web: Next.js"]
        Routes["app routes / root layout"] --> Pages["fsd/pages"] --> Widgets["widgets"] --> Features["features"] --> Entities["entities"] --> Shared["shared UI, API, theme, i18n"]
    end
    subgraph Admin["Administration: Vite + Refine"]
        AdminApp["app routes/providers"] --> AdminPages["pages"] --> AdminWidgets["widgets"] --> AdminShared["shared auth/API/UI"]
    end
    Shared --> Contracts["@languon/contracts
Zod wire schemas"]
    AdminShared --> Contracts
    subgraph Backend["Backend process composition"]
        Root["index.ts + createApp"] --> HTTP["Hono interface routes"]
        Root --> Infra["Infrastructure compositions / adapters"]
        HTTP --> App["Application services and ports"] --> Domain["Domain rules and values"]
        Infra --> App
        Infra --> DB["Drizzle / PostgreSQL, Redis, providers"]
        Modules["Authentication • Users • Administration
Dictionaries • Learning • Texts
Conversations • Knowledge • Speech
Text AI • AI credits and accounting"] --- App
    end
    Contracts --- HTTP
```

Arrows inside each app show allowed import/composition direction, not a network
request through every layer. Existing slices can import any permitted lower layer;
they need not create a pass-through component at each level. Root composition wires
concrete adapters into application ports. Infrastructure transaction participants
coordinate cross-module invariants while application/domain code stays free of SQL
and vendor SDKs. `app.ts` mounts the modules actually supplied by `index.ts`.
The Knowledge and Conversations compositions share a typed note transaction
participant for source reads, first-message draft naming and explicit proposal
publication. Knowledge owns working branches and share capabilities; Conversations
owns private turns and Mastra history.

Web and admin share public framework-neutral packages rather than application source.
Admin intentionally uses its own four-layer structure under ADR-0010. This diagram
summarizes inspected composition roots; it is not an automated proof of all imports.

AI credits now also owns action/attempt accounting, capability funding policies, reviewed
provider prices and admin financial records. These are in-process transaction participants,
not another deployment or Kafka service. Restricted workers receive checked SQL
entry points for current typed dispatch and outcome-derived settlement, not unrestricted
financial write authority. Provider expense facts derive from pinned rates and immutable
observations. Financial purge/recovery requires an active due deletion claim with matching
worker/fence; mutable session settings alone do not authorize erasure. Anonymous financial
attribution is preserved before personal wallet links are removed. This describes the new
financial boundary, not a redesign of all pre-existing domain purge permissions. Admin adds an accounting page through the existing
app/pages/shared boundaries; public contract exports remain framework-neutral.

## Sources

- [apps/backend/src/modules/conversations/infrastructure/conversations-composition.ts](../../apps/backend/src/modules/conversations/infrastructure/conversations-composition.ts)
- [apps/backend/src/modules/knowledge/infrastructure/knowledge-composition.ts](../../apps/backend/src/modules/knowledge/infrastructure/knowledge-composition.ts)
- [docs/adr/0042-knowledge-workspace-document-and-context-boundaries.md](../adr/0042-knowledge-workspace-document-and-context-boundaries.md)
- [apps/backend/src/index.ts](../../apps/backend/src/index.ts)
- [apps/backend/src/app.ts](../../apps/backend/src/app.ts)
- [apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts](../../apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts)
- [apps/backend/src/modules/learning/infrastructure/learning-composition.ts](../../apps/backend/src/modules/learning/infrastructure/learning-composition.ts)
- [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx)
- [apps/admin/src/app/admin-app.tsx](../../apps/admin/src/app/admin-app.tsx)
- [packages/contracts/src/index.ts](../../packages/contracts/src/index.ts)
- [docs/architecture.md](../../docs/architecture.md)
- [docs/adr/0005-frontend-component-and-fsd-standards.md](../../docs/adr/0005-frontend-component-and-fsd-standards.md)
- [docs/adr/0010-admin-application-and-authorization.md](../../docs/adr/0010-admin-application-and-authorization.md)

- [docs/adr/0045-action-accounting-and-provider-expenses.md](../adr/0045-action-accounting-and-provider-expenses.md)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-authorized-purge.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-authorized-purge.sql)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-purge-recovery.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-purge-recovery.sql)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql)

- [infra/deploy/sql/dictionary-worker-role.sql](../../infra/deploy/sql/dictionary-worker-role.sql)

- [infra/deploy/sql/account-purge-worker-role.sql](../../infra/deploy/sql/account-purge-worker-role.sql)
