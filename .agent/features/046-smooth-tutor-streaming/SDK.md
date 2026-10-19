# Durable AI SDK projection evidence

## Implemented boundary

Pinned `@ai-sdk/react`4.0.147 / `ai`7.0.143 now consume native public
`start`, `reset-step`, `text-start`, suffix `text-delta`, `text-end`,
`message-metadata`, safe tool lifecycle and `finish` chunks from the existing
authorized durable event transport. No model/Mastra raw stream, private tool
arguments/results, reasoning, or memory is forwarded. Tool input is always `{}`;
output is the existing public succeeded/failed lifecycle.

Canonical events still reduce TanStack Query's detail for turn/usage/draft state.
`useConversationStream` no longer resets SDK messages on every detail update:
bootstrap happens once per conversation; snapshots/user/draft canonical boundaries
explicitly reconcile. Public copied materials and draft parts survive the next
response rebuild. Ordinary live appends contain only the new text suffix and
metadata/tool changes. Truncations, restarted/completed responses, removed tools
or copied materials rebuild public parts explicitly.

The official Mastra raw-stream converter is intentionally not used at this seam:
ADR0037's worker-owned accounting/replay and sanitized application projections
are the source, rather than a direct Mastra fullStream. The pinned SDK source's
`processUIMessageStream` has distinct send/resume reset defaults; explicit
`reset-step` clears parts in either path. Actual SDK Chat tests exercise this,
without replacing SDK message state on ordinary message events.

## Checks

SDK-1: `pnpm --filter @languon/web exec vitest run tests/conversation-durable-transport.test.ts tests/conversation-api-events.test.ts tests/conversation-event-stream.test.ts`
passed 20/20 (10 transport tests + API/SSE tests), final run 2026-10-19.

Coverage includes admission exactly once with request ID; disconnect without
server Stop; canonical history/resume; progressive intermediate Hel/Hello/output;
no per-append canonical reset; suffix-only chunks; duplicate/out-of-order message
IDs, foreign-conversation frames and stale snapshots; replay cursor after transient EOF; terminal access errors
without retries; tool completion without duplication; text truncation/restart;
incomplete finish and subsequent assistant message; copied-material/tool removal;
Unicode SSE fragmentation and incomplete EOF framing. All provider operations
are deterministic mocked public API boundaries; the real pinned SDK Chat reducer
runs. Browser/real service cadence evidence is owned by the feature's integrated
runner, not claimed by these unit tests.

SDK-2: targeted ESLint for the five paths below passed. Full web
`pnpm --filter @languon/web typecheck` passed on the integrated renderer + SDK
state (2026-10-19). Earlier concurrent renderer Link type failure was fixed by
the coordinator; no SDK type errors remained.

SDK-3: `git diff --check` passed.

## Tested source SHA256

```text
f8b1f3cf1e99fe4bad878e3d9f4459408ad9cec1d34a8cbf5a27921a11fbfa12  apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts
e5b6a4f7c21d1ce765b631b6e655d063a2d5eab32d61b0f1c9711fc343629cd4  apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts
b9b83eedd4952489c41bf58537c57a552af8a1173153ea7c252177d71bd77fdd  apps/web/src/fsd/entities/conversation/lib/conversation-ui-message.ts
7e4fccf935abcd543468acca87552eab428a2dd0dfd6e06981044b59c1819797  apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
bf012551111522e03115f183c6fc3c7b86628a58b150bad7fc01c91c75e18226  apps/web/tests/conversation-durable-transport.test.ts
```

## Integration contract

No public consumer return fields changed. `messages` remains SDK UI messages;
`submit`, `reconnect`, `reconnecting`, `unavailable` keep prior meanings. Optional
transport `getDetail()` seeds canonical replay for subscriptions that resume past
the snapshot cursor. The hook provides its latest canonical detail. Long-lived
subscriptions can leave SDK status streaming while idle: product activity MUST
continue to use durable queued/running turns, not SDK status. Explicit application
Stop remains separate from SDK disconnect.

## Completion review R-1: detail bootstrap race remediation

The initial hook allowed an in-flight HTTP detail request to overwrite newer
stream cache state, and had not synchronously assigned bootstrap ownership when
receiving a stream reconciliation. Fixed in `use-conversation-stream.ts`:

- A canonical/reconcile frame immediately marks stream bootstrap ownership for
  the actor/conversation identity, preventing an older detail bootstrap effect.
- Every canonical frame cancels the exact in-flight detail query. Canonical cache
  publications are ordered and await cancellation before reducing the event.
  This also handles a GET whose promise resolved but whose success continuation
  was still queued. Pinned SDK transient `onData` is synchronous (does not await
  its callback), so the hook owns this small serialized publication chain.
- Deferred publications verify current actor/conversation identity. Old transport
  subscribers are aborted on switch; transport seeding checks the detail belongs
  to the selected conversation. Switching chat cannot publish old data into the
  newly selected chat.

SDK-R1-RED: temporarily disabled only stream bootstrap marking/cancellation and
ran `pnpm --filter @languon/web exec vitest run tests/conversation-stream-bootstrap.test.tsx`.
The actual QueryClient/useQuery/useChat regression failed: after the delayed old
GET resolved, cached content was `undefined` instead of `New streamed answer`.
Restored the fix immediately. This was a temporary test experiment; no baseline
source edits remain.

SDK-R1-GREEN: `pnpm --filter @languon/web exec vitest run tests/conversation-stream-bootstrap.test.tsx tests/conversation-durable-transport.test.ts tests/conversation-api-events.test.ts tests/conversation-event-stream.test.ts`
passed 21/21. The new regression uses actual TanStack Query + AI SDK React hooks,
with deferred mocked public API responses. It verifies stream snapshot+delta,
late old GET even when its transport ignores abort, a settled GET's microtask
ordering, switching IDs, and a late old subscriber. It asserts newer canonical
cache and SDK content survive. No internal hook/query/SDK implementation mocked.

SDK-R1-STATIC: scoped ESLint for hook + regression and full web typecheck passed.
`git diff --check` passed. Runtime browser revalidation is coordinated separately.

Final remediation source SHA256 (supersedes the earlier hook hash):

```text
0fd8eb6b5a382e9450f84bcd813c3f10f237099d40fd212c2699590ad40b6107  apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
7ef9ebb04108593f0671a958c7946f29be8f5fef6241246167e8b160865863b8  apps/web/tests/conversation-stream-bootstrap.test.tsx
```

## Security review S-1: invalidate deferred publications with session epochs

R-1 serialized cache publication introduced a second lifecycle dimension: a
queued publication could resume after terminal access removal, or after the same
conversation was selected again (A → B → A). Identity equality alone was
insufficient. The hook now captures a monotonically increasing publication epoch
for each canonical callback. Before any deferred cache write, epoch, accepting
state and actor/conversation identity must all still match.

Terminal 401/403/404/410 errors invalidate the epoch and close publication before
clearing SDK messages and removing the exact protected query. Reconciliation and
bootstrap are guarded while unavailable. Identity changes and subscription
cleanup invalidate the old epoch; setup/manual reconnect begin a new epoch and
queue. Actor changes create a fresh transport/replay cursor and subscription.
Old queued work cannot block the new identity's queue or resurrect its cache.

SDK-S1-RED: temporarily removed only the queued epoch/accepting guard, leaving the
identity guard, then ran the bootstrap test's terminal/ABA cases. All five failed:
401,403,404,410 each republished removed protected canonical state, and A → B → A
republished `Old A answer` into the new A session. Restored the guard immediately.
No temporary source changes remain.

SDK-S1-GREEN: final
`pnpm --filter @languon/web exec vitest run tests/conversation-stream-bootstrap.test.tsx tests/conversation-durable-transport.test.ts tests/conversation-api-events.test.ts tests/conversation-event-stream.test.ts`
passed 26/26. The six bootstrap/lifecycle tests include the prior actual useQuery
race and five adversarial deferred-publication cases with real QueryClient cache
and real useChat. The cancellation spy delegates to actual cancelQueries, then
holds its completion to reproduce the pending continuation. Terminal cases assert
the exact query remains absent, unavailable stays true and SDK messages stay
empty after release. ABA verifies the prior A cannot publish while the newly
selected A can publish fresh canonical state.

SDK-S1-STATIC: scoped hook/test ESLint, full web typecheck and diff whitespace
checks passed. Coordinator owns final runtime/browser evidence and review closure.
Source frozen; final hashes supersede both prior hook/test remediation hashes:

```text
eaafffad12d4b4c7b03cc7029e501161785923a3392d6f44e4a3249872c0c7b5  apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
74852078f3d1c0a081218a17fb708b24a07479bb3856f52b5f3f28f37f1f41f4  apps/web/tests/conversation-stream-bootstrap.test.tsx
```

## Completion review R-2: immutable committed subscription owner

A real pinned SDK regression demonstrated a callback-routing defect beyond
ordinary aborted HTTP requests. `@ai-sdk/react`4.0.147's ordinary useChat options
store callback wrappers in a render-mutated latestRef shared by old/new Chat
instances. React can render B under startTransition/Suspense while A is still
committed and its HTTP request is active. An actual terminal A403 then invoked
B's latest callback and removed B's query. Merely adding identity checks inside
that redirected callback would not fix its ownership.

SDK-R2-RED: the new test `keeps a committed A terminal error from purging B during
a suspended B render` failed against the S-1 hook: B cache content became
`undefined` instead of `B history`. It uses real React transition/Suspense, real
useChat and DurableChatTransport, and a rejected synthetic public API request;
no internal SDK callbacks are mocked. It verifies A's signal is still un-aborted
while B suspends, establishing the render-before-commit window.

The final design replaces render-global mutable callback/owner refs with one
memoized session per actor/id/request/share-key/QueryClient boundary:

- Each session allocates its own Chat, transport/cursor, exact query key,
  publication queue/epoch, bootstrap/detail state, admission and flag store.
- `useChat({chat})` uses an externally managed instance; immutable callbacks
  capture that session. Every callback targets its own Chat/key, never a shared
  latest message setter or latest-render callback.
- Allocating a speculative session performs no HTTP/subscription activation and
  mutates no committed session. Layout commit activates/resumes it; layout
  cleanup first invalidates publications, closes the transport, stops Chat and
  rejects outstanding local admission. External Chat is not auto-stopped by SDK.
- Terminal access errors invalidate that session's epoch before clearing only
  its own Chat/query. Held cache publications recheck own active/epoch state.
  Flags are an owner-local useSyncExternalStore, not global mutable UI state.
- Submit/reconnect and detail bootstrap operate their captured mounted session.
  Terminal bootstrap resets so explicit Reload's authorized detail refresh can
  restore readable history after access returns. No HTTP disconnect cancels work.

SDK-R2-GREEN: final focused command (same four files as SDK-S1-GREEN) passed
29/29. The nine hook/lifecycle cases retain all R-1/S-1 assertions and add:

- Suspended B: terminal A removes A's exact query; B history remains; B never
  opens a transport before commit.
- Committed A→B and A→B→A: an old HTTP request deliberately ignores abort then
  rejects403; current session cache/messages/availability remain intact.

The current transport and SDK abort fences already suppress ordinary late
rejections after committed switches; those tests preserve that real behavior.
The failing Suspense test proves why callback ownership still required correction.

SDK-R2-STATIC: scoped hook/factory/test ESLint, full web typecheck and diff
whitespace checks passed. Browser worker received the frozen source hashes for
final integrated revalidation. Final source hashes supersede prior hook/test hashes:

```text
4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749  apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
435d18ea80d129b08fda7b2c67ca82cbad9c9591c7dade25126ab15a140650aa  apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts
8b4f930c887e44246c8db2bf08d71a6bda178babe00e5b3bf1712fb805a735ac  apps/web/tests/conversation-stream-bootstrap.test.tsx
```
