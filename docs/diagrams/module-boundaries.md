---
type: diagram
title: Module and layer boundaries
summary: Composition roots connect typed business modules and app-local frontend layers.
source_paths:
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
source_fingerprint: sha256:d17ec25b39a040d98d6ed2b360d37907de2727a7a29edffb3de3c86829a7b990
reviewed: 2026-10-19
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
Text AI • AI credits"] --- App
    end
    Contracts --- HTTP
```

Arrows inside each app show allowed import/composition direction, not a network
request through every layer. Existing slices can import any permitted lower layer;
they need not create a pass-through component at each level. Root composition wires
concrete adapters into application ports. Infrastructure transaction participants
coordinate cross-module invariants while application/domain code stays free of SQL
and vendor SDKs. `app.ts` mounts the modules actually supplied by `index.ts`.

Web and admin share public framework-neutral packages rather than application source.
Admin intentionally uses its own four-layer structure under ADR-0010. This diagram
summarizes inspected composition roots; it is not an automated proof of all imports.

## Sources

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
