# AI accounting, performance and abuse controls

Status: In progress

## Authorization and scope

User requested implementation of the approved [accounting design](../../../docs/ai-credit-accounting-design.md) and performance/abuse plan on 2026-10-22. This feature implements both; performance controls do not narrow the underlying accounting scope. No Kafka, service extraction, Bifrost, checkout or RAG ingestion. Existing manual work in CONTEXT.md and design document belongs to this feature. No production paid rates are invented; initial economic calibration remains a documented activation prerequisite. Permission for fresh development data does not authorize an unidentified database reset.

## Acceptance criteria

- AC-1: Exact fractional credits, independent immutable customer/provider rates and capability policies; existing action snapshots remain stable.
- AC-2: Bounded affordable action admission, atomic holds, learner AI budget preference, 10,000 total output tokens and at most one safe automatic retry; failed attempts consume execution/operator allowance without customer charge.
- AC-3: Outcome-aware settlement: successful and explicit-stop usage charged, technical/invalid failures released, missing usage estimated only when defensible; no duplicate charge or later surprise debit.
- AC-4: Interviews free under admin-controlled policy, 30 admitted actions/account/UTC day, one queued/running action; quota includes failures; no duplicate quota consumption. Existing free/unlimited exceptions preserved.
- AC-5: Compact transactional wallet/grant and capacity/budget state replaces history rebuilds in admission; published tariff reads do not serialize model consumers; cleanup/reporting off generation request path.
- AC-6: Backend-owned durable streaming survives disconnect, batches text by 100ms/4KiB, replays without regeneration and presents separate execution/billing states with exact credit details.
- AC-7: Admin manual payment/refund/provider deposit/balance/reconciliation records and expense/revenue reports; admin-only USD; reporting lag <=60s; unknown !=zero.
- AC-8: Redis burst limiting before heavy DB work, bounded authenticated actions/operator budgets, fail-closed new admissions on unavailable mandatory controls, idempotency and recovery.
- AC-9: Deterministic load fixture with >=1m historical accounting records, 100 concurrent streams and 10 admissions/sec, p95 accounting admission <=100ms on documented hardware; query/lock metrics and non-history-scanning plans.
- AC-10: Applicable guides/ADRs/contracts current; focused tests, real disposable PG/Redis, browser/E2E, independent completion/security and specialist tester review complete before merge.

## Verification

Unit exact arithmetic/policy; real PG wallet/reservations/refunds/concurrency; Redis failures/quotas; HTTP authorization and validation; web/admin browser journeys; deterministic performance harness. No paid provider tests. Existing guides: ai-credit-wallet, learner-portrait, contextual-assistant, shared-pronunciation, user-ai-model-preferences-backend. New ai-accounting guide required.
