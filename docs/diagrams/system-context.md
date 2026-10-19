---
type: diagram
title: System context
summary: Applications, durable state and external services in the implemented development system.
source_paths:
    - apps/backend/src/index.ts
    - apps/backend/src/app.ts
    - apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
    - apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts
    - apps/web/next.config.mjs
    - apps/admin/vite.config.ts
    - apps/mobile/src/screens/home-screen.tsx
    - compose.yaml
    - docs/architecture.md
    - docs/adr/0040-preproduction-owner-scoped-audio-retirement.md
    - apps/backend/src/modules/speech/infrastructure/composition.ts
source_fingerprint: sha256:ef8a047d1ebe7ceb63716fab9556c44284c1b08e07aca560bde92c04639a4a10
reviewed: 2026-10-19
---

# System context

Applications, durable state and external services in the implemented development system.

```mermaid
flowchart LR
    Learner["Learner browser"] --> Web["Next.js web
Dictionaries, Texts, Knowledge, learning"]
    Operator["Operator browser"] --> Admin["Vite / Refine admin
Users, AI settings, audit, recordings"]
    Web -->|"/api proxy: typed JSON and event replay"| API["Hono HTTP backend"]
    Admin -->|"/api proxy: admin-authorized requests"| API
    API -->|"Content, sessions, jobs, accounting"| PG[("PostgreSQL")]
    API -->|"Rate limits and WebAuthn challenges"| Redis[("Redis")]
    Worker["Separate backend worker process"] -->|"Lease typed work; persist results"| PG
    Worker -->|"Trusted adapters; configured execution"| Models["DeepSeek / Kie / fixture providers"]
    API -->|"Authorized private audio and configured uploads"| Storage["Private S3-compatible storage
MinIO for standard development speech"]
    Worker -->|"Read input / write output"| Storage
    Worker -->|"Document mode only"| Scan["ClamAV + isolated parser
configuration gated"]
    Mobile["Expo home screen scaffold
no product API flow yet"]
```

The speech module now owns the sole executable pronunciation protocol; the former
owner-scoped dictionary audio routes/worker/client are retired under ADR-0040.
Current speech storage and provider configuration still uses `DICTIONARY_AUDIO_*`
names. Read [AI job lifecycle](ai-job-lifecycle.md) for the asynchronous boundary and
[development and deployment](development-and-deployment.md) for runtime topology.
This is an implementation map, not a claim that every flag or external service is
currently enabled. The user confirms the project has no production deployment.

**Reconciliation:** the opening sketch and backend paragraph in `docs/architecture.md`
still call document storage/scanning/parsing planned. The worker command already
composes S3 storage, ClamAV and a sandbox parser when document mode is configured.
Those adapters exist; activation and external-service health remain separate facts.
The mobile source renders a static home screen and does not implement the browser
journeys shown here.

## Sources

- [apps/backend/src/index.ts](../../apps/backend/src/index.ts)
- [apps/backend/src/app.ts](../../apps/backend/src/app.ts)
- [apps/backend/src/infrastructure/worker/dictionary-worker-command.ts](../../apps/backend/src/infrastructure/worker/dictionary-worker-command.ts)
- [apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts](../../apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts)
- [apps/web/next.config.mjs](../../apps/web/next.config.mjs)
- [apps/admin/vite.config.ts](../../apps/admin/vite.config.ts)
- [apps/mobile/src/screens/home-screen.tsx](../../apps/mobile/src/screens/home-screen.tsx)
- [compose.yaml](../../compose.yaml)
- [docs/architecture.md](../../docs/architecture.md)
- [docs/adr/0040-preproduction-owner-scoped-audio-retirement.md](../../docs/adr/0040-preproduction-owner-scoped-audio-retirement.md)
- [apps/backend/src/modules/speech/infrastructure/composition.ts](../../apps/backend/src/modules/speech/infrastructure/composition.ts)
