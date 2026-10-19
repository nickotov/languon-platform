# Review: Smooth tutor streaming and activity states

Reviewed: 2026-10-19
Reviewer: independent completion reviewer
Verdict: Pass

## Review boundary

- Mode: Initial completion review followed by bounded remediation review. The
  remediation review expanded once to the complete client session lifecycle when
  R-2 proved the callback owner itself was part of the race.
- Trigger and question: author preflight for Feature 046; determine whether the
  complete scoped change satisfies AC-1–AC-5 without regressions across the
  durable SSE, AI SDK, activity, reveal and Markdown-rendering paths.
- Reviewed state: base `e83bc49` plus the complete tracked/untracked feature
  patch. Initial review used the 35-file manifest
  `sha256:3979acf1b963ddac51eaa4f75247de7c43163911a7f654dafb310c9893d0022c`.
  Final remediation review uses the 37-file
  `evidence/tested-files.sha256` manifest at
  `sha256:c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c`;
  feature records and captured evidence were also read as review inputs.
- Scope and invariants: backend active/idle polling, replay draining, cursor and
  terminal handling; AI SDK lifecycle projection, canonical reconciliation and
  conversation switching; queued/running/tool activity; grapheme reveal,
  selection and scroll behavior; restricted Streamdown rendering; FSD/package
  boundaries; changed ADR, architecture diagrams and user-flow traceability.
- Inputs: `FEATURE.md` AC-1–AC-5, `EXEC_PLAN.md`, `DELIVERY.md`, `SDK.md`,
  `RENDERER.md`, `EVIDENCE.md`, `BROWSER.md`, ADR-0037, ADR-0041, applicable
  repository/backend/web instructions, the full scoped source diff and affected
  tests/callers.
- Separate tester review: required for the new real-app timing harness and
  cross-layer cadence claim. `TEST-REVIEW.md` closed T-1 after a raw authenticated
  proxy-SSE timing remediation and returned Pass for the final manifest.
- Separate security review: required because the change replaces the Markdown
  renderer and changes canonical model-stream projection. `SECURITY-REVIEW.md`
  returned Pass for the final manifest with documented capacity and clicked-link
  residual risks.
- Expansion reason: R-2's real pinned SDK/Suspense reproduction showed that the
  first ordering repair also depended on callback binding before React commit.
  The follow-up therefore covered allocation, speculative render, layout
  activation/cleanup, terminal errors, submit/reconnect, queued publication and
  A-to-B-to-A ownership. Backend cadence, renderer and unrelated feature paths
  were not reopened because their source and validated invariants were unchanged.

## Findings

### R-1 — A late detail response can regress newer streamed canonical state

- Severity: Medium
- Location: `apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts:57-60`,
  `:71-74`, and `:93-102`; caller
  `apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation.ts:50-66`.
- Problem and failure/reproduction scenario: the detail query and
  `resumeStream()` start concurrently. There is no ordering/version guard between
  them. A detail request can capture an older running/partial conversation, then
  a newer SSE snapshot can reconcile SDK messages and update the TanStack cache,
  after which the in-flight detail request can resolve and overwrite that cache
  with its older response. If the first bootstrap effect has not committed, it
  can also replace the already reconciled SDK messages with the stale history;
  even if it has committed, `useConversation` derives active-turn/activity state
  from the regressed query detail. A deterministic reproduction can delay the
  detail response until after a newer snapshot/final message is processed.
- User/system impact and acceptance/risk affected: text can visibly move
  backwards, completed activity can return or remain stuck, and canonical
  metadata/history can stay stale when no later event repairs it. Durable server
  state is intact, but this violates AC-2's snapshot/reconnect rule that history
  must reconcile without regressing text and weakens AC-3 terminal cleanup.
- Suggested fix: establish one monotonic owner for initial canonical state.
  Mark stream reconciliation as the bootstrap winner and cancel or gate the
  in-flight detail publication once the first newer stream snapshot/canonical
  state wins. Add a hook-level regression test with a real QueryClient that
  releases an older detail response only after the newer SSE snapshot/deltas and
  proves messages, canonical detail and terminal activity cannot regress.
- Disposition: Fixed. The final implementation gives each actor/conversation
  session its own Chat, transport, detail/bootstrap state, exact query key and
  serialized publication queue. A canonical frame takes bootstrap ownership,
  cancels the in-flight exact detail query and publishes only while its owner and
  epoch remain active.
- Resolution evidence IDs and affected follow-up review: `SDK.md` SDK-R1/S1/R2;
  `apps/web/tests/conversation-stream-bootstrap.test.tsx`. The real QueryClient,
  useQuery and pinned Chat test delays a stale detail response until after a
  newer snapshot/delta, covers a success continuation already queued at
  cancellation, and proves messages and canonical cache remain monotonic.
  Bounded source remediation review passed for hook
  `4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749`,
  session factory
  `435d18ea80d129b08fda7b2c67ca82cbad9c9591c7dade25126ab15a140650aa`
  and regression test
  `8b4f930c887e44246c8db2bf08d71a6bda178babe00e5b3bf1712fb805a735ac`.

### R-2 — AI SDK callback rebinding can apply an old session error to a new chat

- Severity: Medium
- Location: the R-1 remediation in
  `apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts:27-36`,
  `:66-76`, and `:121-139`, interacting with the pinned `@ai-sdk/react`
  `useChat` callback-ref and passive-cleanup lifecycle.
- Problem and failure/reproduction scenario: the pinned hook keeps stable Chat
  callbacks which read the latest render's callback refs. During a concurrent
  A-to-B render, B can update those refs before old Chat A's passive cleanup calls
  `stop()`. A terminal A response delivered in that window remains A's current
  request inside the SDK, but invokes B's latest `onError`. The remediation's
  shared publication ref then disables B, clears B messages and marks B
  unavailable. The implementation owner reproduced this with the real pinned
  `useChat` and `DurableChatTransport` under `startTransition`/Suspense; the old
  transport was still un-aborted when its 403 was delivered.
- User/system impact and acceptance/risk affected: switching conversations or
  actors while an access failure arrives can erase the newly selected chat and
  display the wrong unavailable state. It violates AC-2 conversation/reconnect
  isolation and the terminal-state guarantees used by AC-3.
- Suggested fix: bind transport, callbacks, cache-publication queue and terminal
  cleanup to an immutable per-session owner instead of mutable latest callback
  refs. Commit and retire owners at a React lifecycle boundary which cannot let
  an uncommitted render mutate the active session. Preserve epoch invalidation
  for queued publications, and test the real pinned SDK/transport across
  concurrent A-to-B, A-to-B-to-A, terminal error, delayed cancellation,
  reconnect and unmount paths.
- Disposition: Fixed. The hook now supplies an externally managed Chat with
  immutable owner callbacks. Speculative owners are inert; layout commit
  activates the selected owner and layout cleanup invalidates its publications,
  closes its transport, stops its Chat and rejects its local admission.
- Resolution evidence IDs and affected follow-up review: `SDK.md` SDK-R2 and the
  final bootstrap/lifecycle test above. The pinned-runtime transition/Suspense
  regression now proves terminal A purges only A while suspended B remains inert
  and intact. Committed A-to-B and A-to-B-to-A tests prove late aborted A errors
  cannot alter current cache, messages or availability. The 29 focused
  SDK/bootstrap/parser cases, scoped lint and full web typecheck passed. Bounded
  review traced render, layout commit/cleanup, submit, reconnect, terminal error,
  held publication, actor/id switching and transport cursor ownership; no further
  material source finding remains.

## Completion audit

- AC-1 has credible route-level and final raw proxy-wire evidence: active polling,
  replay progress, abort/expiry/access and 19 qualifying 139.64–199.15ms wire
  intervals were independently assessed.
- AC-2's projection and replay behavior is well covered by the pinned real AI SDK
  tests. R-1 and R-2 now prove initial query/stream ownership, terminal purge,
  queued-publication invalidation and concurrent session isolation with the real
  QueryClient, pinned Chat and React transition/Suspense lifecycle.
- AC-3 and AC-4 are supported by focused component tests and real Chromium proof,
  including waiting, pause, Stop cleanup, responsive, RTL and reduced-motion
  behavior. Streamdown is pinned and constrained to the app-owned safe renderer.
- FSD/package boundaries remain intact. ADR-0041 documents the durable/public
  projection and the preproduction 64 authorized reads/second/owner upper bound;
  no production-capacity claim is made.
- The user-flow guide, accepted ADR index, architecture text and all nine current
  diagrams were reconciled. The final tester and security Pass records match the
  reviewed 37-file manifest.
- No accidental secret, generated output, schema/migration change, paid-provider
  call or unrelated implementation scope was found.
- Existing lint, focused tests, typechecks, backend/web builds and real-app
  evidence were assessed rather than duplicated. Final remediation added the
  previously missing race checks: 29 focused lifecycle/SDK/parser cases pass,
  followed by the complete 2-API/3-Chromium mapped run and a production web build.

## Remediation and final verdict

Initial verdict was **Changes requested** for R-1 and R-2. Both findings are
fixed. Security S-1, found during the first repair, is also fixed by owner-local
epoch invalidation before terminal purge and every session retirement. The
expanded remediation review found no further material defect.

Final verdict: **Pass** for manifest
`c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c`.
Final evidence includes backend cadence/replay checks; 54 web cases across the
integrated feature scope; 29 remediation lifecycle/SDK/parser cases; lint,
typecheck, styles and backend/web production builds; nine current diagrams;
guide/mapping checks; tester and security Pass; and the final real-app run with
2/2 composed API plus 3/3 Chromium journeys. The final diff check is clean and
all 37 manifest paths rehash correctly after generated Next files were restored.

Remaining accepted limits: deterministic fixtures do not measure paid-provider
latency or production aggregate capacity; the SSE seam has no global cap beyond
the documented per-owner lease limit; HTTP(S) model links remain user-clicked
navigation. These are explicit preproduction residual risks rather than defects
in the reviewed scope.
