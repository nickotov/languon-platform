# Backend durable SSE delivery evidence

Owner: stream_delivery worker. Base: e83bc49. Date: 2026-10-19.

## Scope and design

The HTTP SSE adapter now polls every 125ms while at least one canonical turn is
queued/running and every 1000ms otherwise. Initial authorized detail seeds the
active set; authoritative snapshots replace it and turn events update it.
This bounds normal active reads to eight/second/subscriber plus read latency;
idle subscriptions retain one/second. Existing read transactions still authorize
the conversation and source; session revalidation occurs before every poll.
The existing 100-event persisted page limit is unchanged. A saturated page drains
without delay only when its cursor advances; the next page still goes through
session revalidation, abort and finite-deadline checks. Empty or repeated zero-id
snapshots cannot spin. Existing identical zero-id snapshot suppression remains.

The finite 240-second stream deadline, 300-second lease, admission charging,
capacity limit, auth/source checks, Last-Event-ID/query cursor reconciliation,
heartbeat framing, no-buffer/private headers and once-only release remain.
Additional guards reject an event read returning after expiry and stop per-frame
emission after expiry/abort. Client disconnect releases capacity, never cancels
worker generation. No wire schema, persistence, provider or worker change.

## Regression strategy and results

- DEL-RED: Before implementation, four new regressions failed on the old fixed
  one-second loop: active cadence, initial active seed, prompt replay drain and
  active revocation timing. Existing 11 polling cases passed. The revocation case
  timed out because no 125ms poll existed. Exact command:
  `pnpm --filter @languon/backend test tests/unit/modules/conversations/conversation-stream-polling.test.ts`.
- DEL-UNIT: `pnpm --filter @languon/backend test tests/unit/modules/conversations`
  passes 32 tests/5 files. The 18 polling cases exercise 125ms active delivery,
  completed-turn return to 1000ms, initial queued state, immediate saturated replay
  with cursor and revalidation, revoked session, unchanged active zero-id snapshot,
  nonprogressing full pages, expired in-flight reads, denied/unavailable admission,
  initial failure/abort cleanup, finite expiry, no per-poll admission charge,
  source/session failure classification and four idle subscriber bounds.
  Neighboring HTTP/header assertions remain intact; their minimal detail fixture
  now supplies the `turns` array the real store always returns.
- DEL-LINT: `pnpm exec eslint apps/backend/src/modules/conversations/interface/http/conversation.routes.ts apps/backend/tests/unit/modules/conversations/conversation-stream-polling.test.ts apps/backend/tests/unit/modules/conversations/conversation-routes.test.ts` passes.
- DEL-TYPE: `pnpm --filter @languon/backend typecheck` passes. Initial run caught
  an incorrectly inferred zero-argument test mock; fixture now types events against
  ConversationStore's existing method signature.

These real HTTP stream tests use fake clocks and deterministic store/auth ports
for timing and failure control. They do not claim production load performance,
real PostgreSQL throughput or provider timing. No database implementation changes
require new persistence verification; main owns composed disposable DB/browser
journeys proving this adapter alongside the durable worker and UI projection.

## Tested content

Final source hashes recorded after checks below; main may incorporate them into
its final feature manifest. Any subsequent runtime/test edits invalidate affected
checks. No commits were made by this worker.

```text
075ca7bdc3b66b024b1aa92020c7c9f23c039768287d7ed3cf9579c9ff58b6fd  apps/backend/src/modules/conversations/interface/http/conversation.routes.ts
f6dbe3e30f557c40cb3fc1249d8189ef439deb783c37a2c60ec35b46ca2f802b  apps/backend/tests/unit/modules/conversations/conversation-stream-polling.test.ts
65c0b0dc4b69ef7705f714509b9139ff5da488fe9801b59955de817d608ab1b4  apps/backend/tests/unit/modules/conversations/conversation-routes.test.ts
```
