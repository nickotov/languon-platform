# Admin-owned text AI routing

Status: Complete
Created: 2026-10-25
Owner: Root agent

## Authorization and problem

User explicitly requested implementation after committing the agreed twenty-decision design. Base commit: 61a4616. Implement [the confirmed design](../../../docs/text-ai-routing-design.md); credentials EVOLINK_API_KEY and OPENROUTER_API_KEY are supplied in ignored .env.local. Credential availability alone did not authorize paid requests. The learner subsequently explicitly authorized real provider/model checks; verification is bounded to synthetic inputs, at most USD 0.01 per check and USD 0.10 combined, with no automatic paid retries.

## Acceptance criteria

- ROUTE-1: Reviewed fixed-endpoint OpenRouter/EvoLink adapters support Luna on both, Qwen3.5 Flash and Gemini3.1 Flash Lite on OpenRouter; working direct DeepSeek remains available and retired Kie stays disabled. Unified validated environment exports, no exposed credentials.
- ROUTE-2: Versioned admin default/flow overrides with compatible ordered fallback candidates; all existing text flows/supporting calls use effective server-owned selection. Existing learner choices cannot override it.
- ROUTE-3: Quick response and Test selected flow checks execute synthetic production-adapter requests, expose safe validity/latency/usage/expense results, enforce atomic configurable $0.01/probe and $0.10/UTC day limits, provider concurrency one and route cooldown ten seconds, and never debit learners.
- ROUTE-4: Matching successful checks within24h gate activation/changes. Configured state, check evidence and runtime health differ; unchanged aged evidence warns. Hard failures require recheck, transient circuits recover in bounded fashion. No submission-time paid probes.
- ROUTE-5: Pin fallback candidates, per-flow tariffs, prices, funding and execution limits. At most one safe automatic reattempt, no ambiguous retries or after visible stream output, no extra budget; necessary supporting calls remain bounded together. Emergency Disable blocks queued dispatch; running work preserves policy.
- ROUTE-6: Stable exact per-flow tariffs independent of route costs; paid flow missing tariff fails setup/admission, free interviews and exemptions retained. Preserve balances/history/snapshots and no-charge technical failures, Stop and reconnect semantics.
- ROUTE-7: Remove learner model names/selection across UI/API authority, preserving language/tone/explanation/portrait/mode/budget controls; actionable model-neutral errors and no new credit panels.
- ROUTE-8: Versioned reviewed synthetic quality cases for12 agreed languages, extensible later. Distinguish offline integration from separately authorized live quality proof; no invented passing model/language claims.
- ROUTE-9: Setup profiles/doctor/docs and mapped guides reflect actual prerequisites. Full critical gate plus production SDK regression, disposable concurrency/accounting verification, browser evidence, independent correctness/test/security review pass.
- ROUTE-10: Admission retains compact queries/no live health calls/no ledger scans; evaluate existing100ms p95 benchmark for materially changed path. Required controls fail closed.

## Scope and constraints

Existing text tasks only; no speech/OCR/embeddings/RAG/other tutor capability, scheduled paid probes, arbitrary URLs/model IDs, framework/service extraction, Kafka/Bifrost, unbounded live-model tests or data reset. Use established DDD/FSD, Mastra, exact accounting and immutable revisions. [ADR0046](../../../docs/adr/0046-admin-owned-text-ai-routing.md) replaces only stated selection/tariff rules; remaining accepted ADR invariants persist. No supplied visual design; preserve runtime UI kit and shell.

## User-flow documentation

Create admin-text-ai-routing guide; update ai-provider-management, user-ai-model-preferences-backend, ai-accounting and applicable sentence/text/chat/portrait guides and exact mapped scenarios. Current guides/tests inspected before changes; no placeholder passing markers. Critical registry must include admin checks and provider composition coverage.

## Open product decisions

None. Actual tariff/rate publication, gateway account/processing access and live evaluation budget are activation prerequisites, not implicit production activation. Bounded synthetic live verification is now explicitly authorized.
