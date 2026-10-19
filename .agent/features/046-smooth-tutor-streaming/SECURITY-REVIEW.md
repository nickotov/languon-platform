# Security review: Smooth tutor streaming

Reviewed: 2026-10-19
Reviewer: independent security reviewer (read-only; verdict recorded by root)
Verdict: Pass — S-1 and R-2 fixed; no open material security findings.

## Boundary and final state

Base `e83bc49`, Feature 046 implementation and final test/document remediation.
Initial 35-file manifest: `3979acf1b963ddac51eaa4f75247de7c43163911a7f654dafb310c9893d0022c`.
Intermediate S-1 36-file remediation manifest:
`55aba38514d80c32d1e5974eaabae0ec2950c12a71e83bd759fa46766f941a1d`.
The reviewer confirmed each recorded manifest and the bounded hook remediations below;
renderer, route and public projection hashes remain unchanged. Separate completion review and
tester audit are recorded in REVIEW.md and TEST-REVIEW.md.

## Verified controls

- Pinned Streamdown 2.7.1 replaces default rehype processing with an empty plugin
  list and skips raw HTML. App-owned elements exclude images, embeds, SVG,
  iframes and inputs. Code and tables are inert; optional execution plugins and
  controls are disabled. Animation uses generated constant styles.
- Links require absolute HTTP(S), reject credentials, are checked again by the
  anchor renderer and use opener isolation. No automatic external asset fetch.
- Canonical event schemas validate transport input. The SDK projection exposes
  only public state, empty tool inputs and generic result state. Raw provider
  reasoning, tool payloads and memory are not forwarded. Automatic continuation
  is disabled; stale and foreign events are filtered.
- SSE authenticates before admission, enforces owner leases, authorizes initial
  detail and revalidates tenant/source access on every page. Full replay pages
  drain only with cursor progress. Expiry and abort checks precede frames.
- Existing limits remain: 12 admissions/minute, 8 concurrent streams/owner,
  240-second response, 300-second lease TTL and idempotent lease release.
  Responses remain private/no-store/no-transform. Disconnect does not cancel
  generation or admit duplicate work.
- No new SQL interpolation, upload/payment/webhook path, server-side external
  fetch or secret logging. Raw-wire timing tests retain only synthetic lengths
  and intervals, validate full schemas, bound execution to 30 seconds and abort,
  cancel/release and await cleanup. They add no model turn.

## Residual risks and limits

- Eight streams at eight active polls/second permit 64 authorized reads/second
  per owner. This seam has no separate global cap. Production aggregate database
  and authentication capacity is unmeasured; deterministic fixtures do not prove
  production capacity. ADR-0041 records this preproduction tradeoff.
- Model-generated HTTP(S) links retain the prior user-clicked social-engineering
  and local-network navigation risk. They are not automatically fetched.
- This verdict covers pinned Streamdown 2.7.1. Upgrades or enabling raw HTML,
  images, math, Mermaid or code plugins require another security review.
- Fixtures do not establish real-provider prompt-injection quality or production
  concurrency. Unchanged Feature 044 tool implementations were not fully
  reaudited; changed projection and rendering boundaries were traced.

Initial test/document delta passed independently. Subsequent R-1/S-1 hook
remediation is assessed below.

## S-1 — Queued cache publication can outlive access revocation

- Severity: Medium.
- Location: use-conversation-stream.ts canonical publication chain and terminal
  onError cache purge in R-1 remediation (hook hash 0fd8eb6b5a382e9450f84bcd813c3f10f237099d40fd212c2699590ad40b6107).
- Problem: a canonical callback awaits query cancellation; terminal access error
  removes the cache, then the queued same-identity callback can restore old data.
  A→B→A identity changes can also let obsolete A work pass an equality guard.
- Impact: intended access-revocation purge can be undone locally after terminal
  authorization failure; durable server authorization remains enforced.
- Suggested fix: publication epoch invalidated before terminal removal and on
  every identity transition, checked before queued publication; deterministic
  delayed-cancellation terminal and identity-cycle regression tests.
- Disposition: Fixed. Independent security reviewer confirmed the final hook
  `c5aca54473dca847f0c53c41b56b2c8d86e3cb499698b530699525221607191d`.
  Publication tokens capture identity, monotonic epoch and accepting state;
  queued callbacks check all three after cancellation. Terminal 401/403/404/410
  invalidates the epoch and disables publication before purging SDK/query state.
  Identity transitions and cleanup/setup advance the epoch; reconnect starts a
  fresh generation. Actual QueryClient/useChat tests hold cancellation pending,
  cover all four terminal statuses and A→B→A with fresh-A progress.
  Bounded independent security verdict: Pass, no security regression. Root
  records the read-only verdict. Renderer/route/projection hashes unchanged.

## Final dependency delta confirmation

Independent reviewer confirmed final hook SHA256
`eaafffad12d4b4c7b03cc7029e501161785923a3392d6f44e4a3249872c0c7b5`
and final 36-file manifest above. Relative to the earlier S-1 inspection, only
actorId transport memo and identity subscription-effect dependencies changed.
These rebuild the private cursor/auth transport and advance publication epochs
on actor-only transitions. Terminal purge and epoch/accepting/identity guards
remain intact. Final bounded security verdict: Pass, no new finding.

## R-2 — SDK latest callback leaks across an uncommitted conversation switch

Actual pinned SDK/transport test with React startTransition and Suspense renders
B while A remains committed and not aborted. A real API403 then dispatches
through useChat's shared latest callback ref into B's onError, purging B's cache.
Abort guards cover post-cleanup errors, but not this concurrent-render window.
Root accepts the material lifecycle finding. Fix uses per-session externally
managed Chat/callback/key/queue ownership and commit-aware cleanup. Tests must
retain suspended-render reproduction; previous act-flushed switching evidence
alone is insufficient. Bounded security/completion follow-up required.

## R-2 final bounded verdict

Independent security review: Pass. The defect crossed client conversation
ownership (integrity/availability), without server authorization bypass or
cross-conversation disclosure. One external Chat owner now captures actor/id/
request/shareKey/client and the exact query key. Constructor-bound callbacks
mutate only that owner's Chat/key, gate active state and use the owner epoch.
Terminal errors disable publication before purging only that owner. Layout
commit activates; committed cleanup deactivates, advances epoch, closes the
transport and explicitly stops external Chat. Speculative owners remain inert.

Reviewer independently ran the 9-case hook regression file: Pass. Actual React
startTransition/Suspense verifies A stays committed/open, speculative B starts
no HTTP, A403 purges A only and B history survives. Ignored-abort late A403 after
committed switching or A→B→A cannot corrupt the current conversation. Prior
held-cancellation and all-four-terminal tests remain. Worker29related tests,
lint and typecheck pass; final runtime/build recorded in EVIDENCE.md.

Final 37-file manifest:
`c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c`.
Frozen hook `4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749`,
factory `435d18ea80d129b08fda7b2c67ca82cbad9c9591c7dade25126ab15a140650aa`,
test `8b4f930c887e44246c8db2bf08d71a6bda178babe00e5b3bf1712fb805a735ac`.

Additional residual: ownership relies on pinned SDK external-Chat constructor
callbacks and explicit lifecycle cleanup. Re-review this boundary on SDK upgrade.
Prior renderer, clicked-link and production-capacity limits still apply.
