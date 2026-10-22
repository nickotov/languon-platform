# Independent AC-9 performance-harness review

Status: final source/app concurrency correction pending before the accepted run.

## Scope reviewed

- `FEATURE.md` AC-5, AC-6, AC-8 and AC-9.
- `EXEC_PLAN.md` performance checkpoint and the current accounting evidence.
- `apps/backend/tests/performance/accounting-load.test.ts` and metric helper.
- Conversation HTTP, Redis rate-limiter, durable SSE, admission and policy code.

## Findings and remedy

The initial harness measured `DrizzleConversationStore.submit` directly. That
omitted the real `POST /conversations/:id/turns` boundary and its mandatory
`ConversationService` Redis burst-limit admission, so it could not substantiate
the required end-to-end accounting-admission latency.

The harness now measures the real in-process Hono POST route with validated JSON
and bearer input. The measured interval includes identity revalidation, Redis
request limiting, source authorization, database admission/commit and response
creation. The instrumented Drizzle client also records the revalidation query.
The fixture still uses the direct store only to seed and settle synthetic work.

It now asserts that the million policy-update history count remains unchanged
through the measured phase and that every captured admission SELECT contains no
`ai_credit_history` reference. EXPLAIN ANALYZE remains recorded for every distinct
captured admission SELECT.

The fixture's million rows are valid immutable zero-value ledger policy-update
facts for the same 100 owners. This is adequate to test that customer-ledger
history does not enter the admission query path. It does not establish
performance with a million generic action, allocation, or provider-expense rows;
the harness records that limitation explicitly.

The 100 subscriptions are real Hono SSE route executions with real Redis stream
leases and persisted event polling: 10 claimed/running turns receive real
heartbeat/append batches and 90 stay queued. This is in-process and deliberately
does not make a TCP, proxy, provider-dispatch, or provider-throughput claim.

## Focused check

`pnpm --filter @languon/backend exec vitest run tests/performance/accounting-load-metrics.test.ts`

Passed: 2 tests. This proves nearest-rank p95 handling and target safety
validation only. It does not execute the opt-in million-row fixture.

`pnpm --filter @languon/backend exec prettier --check tests/performance/accounting-load.test.ts tests/performance/accounting-load-metrics.ts tests/performance/accounting-load-metrics.test.ts`

Passed.

## Required execution evidence

Do not run until root confirms a source/schema freeze and no parallel heavy test
jobs. Then run only against the explicitly confirmed disposable target in
`/private/tmp/languon-accounting-load-test.env`: loopback PostgreSQL database
`languon_auth_accounting_load_test` and Redis database 3 on its non-default
loopback port. The harness refuses other targets and never calls paid providers.

Acceptance still requires a saved JSON artifact containing source hashes,
hardware, phase p95, scheduling/lock/query metrics and plans. Re-run if any
hashed source or test changes after the execution.

## Executed diagnostic attempts

The first valid 100-stream run used an unrealistic fixture lease-renewal cadence:
it called `store.heartbeat` for ten running turns every 100ms. It produced a
loaded p95 of 777.568ms (target is 100ms), with 212 lock-wait samples and up to
18 waiters. The million ledger rows remained unchanged, all admissions succeeded,
and source hashes remained stable. Run ID `95d7e560-8fdb-45ff-a613-24f134e6d97a`
ran from `2026-10-22T17:21:36.214Z` to `2026-10-22T17:23:52.681Z`; loaded
p50/max were 575.518ms/969.664ms and baseline p95 was 3798.561ms. This result
identified contention but is not the accepted measurement because production
renews a turn lease every five seconds, not every 100ms.

The original JSON artifact was subsequently overwritten by a deliberately
invalid saturated-capacity attempt before artifact naming was separated. Its
measured values and run identity above are retained here, but it is not reusable
final evidence. The saturated raw artifact is retained separately as
`accounting-load-saturated-invalid.json`; the final calibrated run will write a
distinct `accounting-load-final-9-running.json` artifact.

The fixture now keeps output persistence at 100ms but renews leases at the
production `ConversationWorkerService` default of five seconds.

A following saturated 100-stream run was source-stable but deliberately rejected
as a workload calibration error: it seeded ten running attempts, which is the
configured global maximum, so strict capacity admission correctly returned 503
for measured starts. The approved calibrated workload seeds nine running and
ninety-one queued turns, retaining 100 active subscriptions while leaving one
real provider-attempt slot for each measured admission.

The harness supports opt-in lock diagnostics for the next run. It records a
bounded set of advisory lock identities, lock modes, blocker counts and
transaction ages; it never copies `pg_stat_activity.query`, which could contain
request data in another PostgreSQL protocol configuration.
