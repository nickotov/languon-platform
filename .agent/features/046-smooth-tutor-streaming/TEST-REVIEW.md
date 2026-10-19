# Tester review: Smooth tutor streaming

Reviewed: 2026-10-19
Reviewer: independent tester
Boundary: cadence, durable AI SDK projection, delayed-provider browser proof,
lifecycle assertions, and the bounded stale-detail bootstrap remediation. No
product source or test files were changed by this reviewer.

## Reviewed state

- Base: `e83bc49`.
- Final remediation state: 36 files, manifest
  `sha256:c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c`.
- The hashes recorded in `DELIVERY.md`, `SDK.md`, `RENDERER.md`, and
  `evidence/browser-tested-files.sha256` match the reviewed streaming paths.
- The final small `TutorMessage` text-derivation cleanup is outside the cadence
  harness and its focused 13-test result is recorded by the author.

## Checks executed

```sh
pnpm --filter @languon/backend test tests/unit/modules/conversations/conversation-stream-polling.test.ts
pnpm --filter @languon/web exec vitest run tests/conversation-durable-transport.test.ts tests/tutor-streaming-activity.test.tsx
```

Result: pass — backend 18/18; web 15/15.

## What the existing evidence reliably establishes

- `conversation-stream-polling.test.ts` runs the actual Hono SSE route with fake
  clocks and deterministic authentication/store ports. It distinguishes the
  active 125ms and idle 1000ms policies, initial active seeding, replay-page
  drain, revocation, expiry and abort cleanup. This is a reliable adapter-level
  cadence proof, though not a PostgreSQL/provider timing measurement.
- `conversation-durable-transport.test.ts` instantiates the pinned real AI SDK
  `Chat` reducer, rather than a substitute reducer. It verifies public
  lifecycle chunks, suffix appends, canonical rebuilds, no ordinary live reset,
  duplicate/out-of-order filtering, reconnect cursor and terminal access
  handling. Its event source is mocked, so it isolates consumer semantics rather
  than proving HTTP transport timing.
- The mapped real app suite uses a delayed/chunked provider only at the external
  provider boundary; Mastra, worker, PostgreSQL, event persistence, SSE and the
  browser execute for real. It credibly verifies visible waiting, writing,
  pause activity, final output, Stop activity cleanup and close/reopen durable
  behavior. The existing browser record is valid for its current source hashes.

## Finding

### T-1 — Browser cadence assertion can be satisfied by the retired one-second poll

- Severity: Medium
- Location: `apps/web/tests/e2e/contextual-assistant.journeys.spec.ts`, rendered
  timing assertions after `streamingEvidence`; related fixture timing in
  `apps/backend/tests/support/contextual-assistant-fixture.ts`.
- Problem: the observer samples rendered text after `useStreamingText` smooths
  each received burst over 180ms. With provider deltas of four characters every
  140ms, the retired one-second poll could accumulate about 28–32 characters;
  the presentation hook can still produce at least ten small prefix-preserving
  DOM mutations. During the 1.1-second provider pause, the existing
  `text.length >= 40 && activity === 'working'` check can also pass after a
  delayed delivery. Therefore DOM timestamps do not prove prompt wire delivery.
- Impact: AC-1/AC-5 have no full-path timing assertion that would fail if the
  original one-second SSE cadence returned. The backend unit test proves the
  route policy and the SDK test proves projection, but neither observes the
  worker-to-persisted-event-to-SSE chain under real delayed provider output.
- Suggested fix: add an actual fixture/browser or composed-HTTP raw SSE capture
  for the progressive turn. Assert ordered growing assistant-message revisions
  and several inter-revision wire intervals below a bound that the former
  one-second loop cannot meet (for example, three intervals below 500ms during
  140ms fixture deltas). Keep the existing DOM test for user-visible smoothing;
  do not make it the wire proof.
- Disposition: Fixed in remediation below.

## T-1 remediation review

The mapped browser scenario now opens a second, independent authorized
subscription through the actual Next proxy before admitting the progressive turn.
It parses complete SSE frames from native `fetch`, validates each with the
canonical `ConversationEventSchema`, and records only growing assistant-message
contents. This observes the persisted-event/SSE/proxy chain before the React
presentation hook can smooth it.

The assertion requires at least three strictly prefix-ordered content revisions
with packet-read intervals greater than 40ms and less than 500ms. Same-packet
frames have zero elapsed time and do not qualify. A former one-second polling
loop could make visible animation frames, but cannot meet that bound through its
own delivery cadence in this local controlled fixture. The observer starts only
after its initial snapshot, is aborted and awaited in `finally`, and does not
admit another turn or account.

The final full runner evidence is valid for the reviewed hashes:

- `pnpm test:e2e:contextual-assistant` with the documented confirmed disposable
  PostgreSQL/Redis environment: composed HTTP 2/2 and Chromium 3/3 passed.
- Retained wire evidence has 23 increasing lengths (4 through 91); 21 qualifying
  intervals are 133.51–173.24ms, and the intentional provider pause is
  1150.73ms. See `evidence/wire-stream-timing.json`.
- Scoped lint and guide/mapping checks are recorded in `BROWSER.md`. The earlier
  focused rerun remains valid for the unchanged backend route and SDK paths.

T-1 is therefore closed. The real provider's latency and production concurrency
remain outside deterministic fixture coverage, as already documented by ADR-0041.

## R-1 remediation review: stale detail bootstrap

The new `conversation-stream-bootstrap.test.tsx` mounts the real
`useConversationStream`, real TanStack Query client and real `useChat` hook. It
delays the initial detail GET, delivers a newer stream snapshot and append, then
resolves the stale GET while deliberately ignoring its abort signal. The test
would reproduce the previous race because that late query result replaced the
newer cache/UI state. It also switches conversations and confirms a late event
from the former subscription cannot publish into the newly selected chat.

The hook fix establishes stream ownership before publishing canonical events,
cancels the exact detail query, serializes cache publications after cancellation,
and guards them with the current conversation identity. `data-reconcile` becomes
the only stream-originated UI rebuild and stale detail bootstrap is skipped once
that identity has received stream state. This is sufficient for the observed
ordering without changing durable transport, persistence, or server behavior.

Author evidence reports the new focused regression and related worker tests
passed (21 focused tests), with targeted lint and web typecheck green. Its source
hashes match the reviewed files:

```text
4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749  apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
435d18ea80d129b08fda7b2c67ca82cbad9c9591c7dade25126ab15a140650aa  apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts
8b4f930c887e44246c8db2bf08d71a6bda178babe00e5b3bf1712fb805a735ac  apps/web/tests/conversation-stream-bootstrap.test.tsx
```

R-1 is adequately covered. The prior raw-wire harness is unchanged, so its
result can be reused for this client-side ordering repair. The full browser rerun
is still author-owned final evidence.

## S-1 follow-up review: queued terminal and ABA publications

The new terminal-status parameterized regression holds `cancelQueries`, causes a
canonical event to queue a publication, then injects each terminal access error.
It proves the terminal path removes the protected cache/UI state and invalidates
the held publication before it can republish. The A→B→A case separately proves
the epoch prevents a held publication from the first A session applying in the
new A session, while that new subscription can still publish fresh state.

### T-2 — Cross-identity late terminal callback during an uncommitted transition

- Severity: High
- Location: `apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts`,
  and the pinned `@ai-sdk/react` `useChat` latest-callback ownership model.
- Problem: the earlier lifecycle analysis assumed an identity switch had already
  committed and stopped A. A real SDK reproduction shows React can render B in a
  suspended `startTransition` while A remains committed and subscribed. During
  that window `useChat` has refreshed its shared latest callback to B, but A's
  signal is not yet aborted. An A terminal 403 is therefore dispatched to B's
  callback and can purge B cache/UI.
- Impact: a transition can erase or disable the newly selected conversation's
  presentation state and queued publications, violating conversation isolation.
- Remediation: callbacks, cache key, replay cursor and publication queue now
  belong to an immutable per-session `Chat` owner. `useChat({ chat })` consumes
  that externally managed owner, so an uncommitted render can allocate an inert
  owner but cannot overwrite the committed owner's callbacks. Layout effects
  alone activate/deactivate the owner and start/stop its subscription.
- Regression: the pinned real SDK test uses `startTransition` plus a permanently
  suspended B render. It proves A remains subscribed while B has rendered,
  injects A's real terminal 403, and verifies B history remains in the cache,
  A alone is purged, and B has not opened an HTTP subscription before commit.
  Separate committed A→B and A→B→A late-403 tests cover an abort-ignoring old
  request and all terminal status/held-publication cases.
- Evidence: worker reports
  `pnpm --filter @languon/web exec vitest run tests/conversation-stream-bootstrap.test.tsx tests/conversation-durable-transport.test.ts tests/conversation-api-events.test.ts tests/conversation-event-stream.test.ts`
  passed 29 tests; targeted lint and web typecheck also pass. The red reproduction
  failed by purging B before this ownership repair.
- Disposition: Fixed and adequately covered.

## Lifecycle coverage and remaining limits

- Waiting and the deliberate provider pause are exercised in the real browser.
  Empty-placeholder, writing-to-working, stop cleanup and reduced-motion state
  are covered by focused component tests plus the mapped browser journey.
- Stop and close/reopen are exercised in the real mobile durable journey;
  transient SSE reconnect and cursor deduplication are exercised in the real
  SDK `Chat` test. There is no separate real-server forced EOF/reconnect timing
  fault injection, which is acceptable once T-1 supplies direct real-wire
  cadence evidence; the current client reconnect behavior already has focused
  reducer coverage.
- No paid provider call, ordinary database mutation, or production test was
  performed by this review.

## Verdict

Pass. The remediation directly covers the previously missing real-wire timing
claim while retaining independent adapter, SDK reducer, presentation and durable
lifecycle coverage.
