# ExecPlan: Smooth tutor streaming

## Goal and specification

See FEATURE.md AC-1–AC-5. User authorization recorded there. Base e83bc49; branch
feature/smooth-tutor-streaming. Preserve prior positioning work.

## Existing architecture and decisions

Mastra1.57/Core memory1.26 streams text through an accounted durable worker and
Drizzle append/events. HTTP SSE revalidates every bounded poll; client custom
ChatTransport carries transient canonical events into TanStack Query; useChat
messages are fully replaced whenever detail changes. AI SDK7.0.143/react4.0.147.
ADR0037 requires durable execution and public-only tool projections.

D1: Preserve canonical wire events/persistence and project incremental UIMessage
parts at the client adapter. Official Mastra toAISdkStream handles direct streams,
but directly forwarding worker fullStream would expose private internals and
bypass replay/authority. No raw provider stream goes to a browser.
D2: Improve active polling cadence with bounded adaptive polling and immediate
backlog draining; retain idle bounds/revalidation. Avoid introducing pubsub or
persistent schema solely for presentation cadence. Measure deterministic timing.
D3: Streamdown with explicit safe renderer configuration and local CSS Modules;
no Tailwind, diagram/code execution, images, raw HTML or additional model calls.

## Test and review strategy

Regression tests before fixes for waiting placeholders, real SDK projection/
replay and active polling timing. Use fake clocks for cadence and chunked/delayed
external provider fixtures for real Mastra+DB+SSE/browser proof; no paid models.
Unit tests security markup/URLs, incomplete Markdown, reduced motion and status
transitions. Existing mapped contextual runner owns disposable PostgreSQL/Redis,
real auth/backend/Next, screenshot/error/network evidence. Backend/web focused
static/build checks; full root lint and user-flow validation.
Independent completion review after author preflight; separate security review for
untrusted Markdown/SDK projection and stream boundary. Separate tester assesses
new cadence/timing harness and replay/stop evidence.

## User-flow documentation

Existing contextual-language-assistant-and-knowledge guide, backend composed HTTP
and web contextual-assistant journeys, registered pnpm test:e2e:contextual-assistant.
Keep stable scenario IDs, markers and guide behavior synchronized. No new separate
product journey or DB migration. Discover related diagrams and reconcile hashes.

## Milestones

- [x] M1 — Bounded prompt active SSE delivery (AC-1).
- [x] M2 — Native SDK incremental replay-safe projection (AC-2).
- [x] M3 — Streamdown and visible activity/reveal (AC-3/AC-4).
- [x] M4 — Integrated deterministic browser/static/guide proof (AC-5).
- [x] M5 — Independent reviews, remediation and final delivery preflight.

## Progress and completion

2026-10-19: Complete. AC-1–AC-5 implemented and verified. Final37-file manifest
c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c.
Final2API+3Chromium run,29focused SDK/hook cases, affected lint/typecheck/build,
guide/mapping and9diagram checks pass. R-1 stale detail, S-1 queued terminal/ABA
publication and R-2 actual Suspense callback ownership defects are resolved.
Independent completion, tester and security reviews Pass; no open material item.

R-2 changed the repair approach after recurring lifecycle gaps: explicit session
owners bind Chat, callbacks, query key, cursor, queue and epoch; layout commit
activates an owner, speculative renders remain inert. See SDK.md and REVIEW.md.

Final delivery uses the required local feature commit and squash merge into main.
Git history owns commit IDs. Retain the feature branch; no push or deployment.

## Remaining risks and removal

No remaining implementation tasks. Deterministic fixtures establish local wire
cadence, not real-provider latency or production aggregate capacity. Active
polling permits64authorizedreads/s/owner at8streams, without a global cap; this
preproduction tradeoff remains explicit in ADR0041. HTTP(S) model links retain
user-clicked navigation risk. Re-review renderer plugins/SDK ownership on upgrade.

Rollback is a local revert of the feature squash commit plus pnpm install; no
schema migration or transformed data requires reversal. Preserve checkpoint
e83bc49 and ordinary local data. Full verification and limits: EVIDENCE.md.
