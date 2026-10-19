# Evidence: Smooth tutor streaming

Updated: 2026-10-19
Base: `e83bc49`; branch: `feature/smooth-tutor-streaming`.

## Acceptance coverage

| ID | Implementation | Evidence | Result |
| --- | --- | --- | --- |
| AC-1 | Active125ms/idle1000ms authorized SSE and replay drain | DELIVERY.md; E1, E4 | Pass |
| AC-2 | Native SDK suffix projection, explicit reconciliation and monotonic bootstrap | SDK.md; E2, E4 | Pass |
| AC-3 | Localized queued/empty/tool/writing activity and pause detection | E2, E4; BROWSER.md | Pass |
| AC-4 | Restricted Streamdown2.7.1, bounded grapheme reveal and reduced motion | RENDERER.md; E2–E4 | Pass |
| AC-5 | Integrated app/static/guide proof and independent reviews | E1–E6 | Pass |

## Verification

E1 — Backend conversation units:32cases/5files, including18polling cases.
Old1000ms policy failed4new regressions; active cadence passes. Expiry, access,
capacity, replay and abort remain enforced. Backend build and typecheck pass.
No schema/store change or migration. Exact commands and hashes: DELIVERY.md.

E2 — Web integrated scope:54cases/10files pass, covering real pinned SDK Chat,
API/SSE parser, Streamdown safety/incomplete Markdown, activity, grapheme reveal,
fast-chunk painting/final flush/reduced motion, scroll, usage and CSS guard.
Counts overlap SDK/renderer checks and are not summed. Final hook remediation
suite:29cases pass, including actual QueryClient/useQuery/useChat races. Scoped
lint and full web typecheck pass. Red/green details and hashes: SDK.md. Actual
browser covers responsive/motion behavior; JSDOM supplies media-query capability.

E3 — Root pnpm lint, web typecheck/styles:check, backend build/typecheck pass.
Final web webpack production build passes with the R-2 owner refactor
(`AUTH_E2E_DIST_DIR=.next-stream046-build pnpm --filter @languon/web build`,
exit0; log `/tmp/languon-stream046-r2-web-build.log`). Original next-env restored.
Streamdown pinned2.7.1 via pnpm; unused direct react-markdown removed, remark-gfm
retained. No other dependency versions intentionally changed; lockfile is pnpm
output. CSS guard permits SDK protocol strings outside class contexts, with a
regression proving utility classes in class attributes remain rejected.

E4 — Final registered `pnpm test:e2e:contextual-assistant`, run
`stream046-r2-final`:2API/9.38s and3Chromium/1.7min (23.8/18.5/50.4s), all pass.
Only the external provider is deterministic:900ms first-text wait,4char/140ms
updates and1100ms pause. Mastra, worker, PostgreSQL/Redis, persisted events,
authenticated SSE, Next proxy, SDK and browser execute for real. Assertions cover
empty working, small prefix-preserving UI updates, pause working, exact final
text, activity cleanup, previous docking/shared-source behavior and mobile
Stop/reopen/retry without duplicate generation. No paid services used.

A second authorized raw SSE subscription observes the actual Next proxy before
React smoothing. Full canonical schema validates frames; timestamps are per
network read, so coalesced zero-interval frames do not qualify. Final evidence:
23 ordered lengths4→91,19 qualifying intervals139.64–199.15ms, intended pause
maxgap1088.96ms. This distinguishes retired1s delivery without claiming paid
provider latency. See evidence/wire-stream-timing.json and BROWSER.md for exact
environment, screenshots, identities, cleanup and prior valid runs.

Owned55444PG/56444Redis and fixture servers removed. Ordinary local databases
and caches untouched; generated next-env restored. Main visually inspected
waiting/pause desktop and reconnect-mobile screenshots: readable text/status,
Stop/composer accessible, no overlay/clipping; worker verified remaining states,
including RTL/reduced motion. No unexpected page/console/network errors.

E5 — Existing contextual guide updated, stable IDs retained, guide and both test
markers `sha256:933d796afdfaae27`.24guides/16validator cases and selected mapping
pass. ADR0041 preserves ADR0037 durable authority and documents presentation/
polling tradeoffs. Architecture/conversation diagram current; all9graphs parse
and sources are fresh. Mermaid relationships unchanged, so prior atlas rendering
proof remains valid. Hook source was inspected before final fingerprint refresh.

E6 — Independent completion review: REVIEW.md. Separate tester: TEST-REVIEW.md.
Separate read-only security reviewer: verdict recorded by root in
SECURITY-REVIEW.md. Findings and evidence disposition are summarized below.

## Review remediation

- T-1: DOM smoothing could conceal stale1s delivery. Fixed by actual authenticated
  raw proxy-SSE capture independent of React. Tester closed after inspecting full
  canonical schema, packet timing, order and cleanup. Final full run above retains
  the proof; earlier layers remain valid for their unchanged source hashes.
- R-1: late detail GET could overwrite newer stream cache/bootstrap. Stream
  receipt now owns bootstrap synchronously, cancels exact detail queries before
  ordered canonical cache publication, and seeds only matching detail. Actual
  QueryClient/useChat delayed-response test fails without the fix and passes.
- S-1: queued publication could outlive terminal cache purge or an A→B→A identity
  cycle. Root cause was incomplete lifecycle ownership in the first ordering
  fix. Before another review, extended publication invariant to identity, epoch
  and accepting state; terminal removal and every session transition invalidate
  prior work. Reconnect starts a fresh generation, actor changes rebuild the
  cursor/auth transport. All4terminal-status and ABA tests fail with the queued
  guard removed and pass restored. Independent security confirmed final hash
  and manifest Pass. SDK.md records29focused passes and exact red/green evidence.

## Final source boundary and author preflight

37-file source/test/document manifest:
`c3c2ac273865220bdae49c7145d839e7f879a81ee19a936a3af81fd40e12073c`.
See evidence/tested-files.sha256. Feature records/screenshots are excluded to
avoid self-reference. Final hook:
`4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749`.
No production source changes after final integrated run.

No API schema, persistence, model routing, wallet, publication or deployment
change. Worker still owns generation; raw Mastra/private tool data never reach
the browser. SDK stop disconnects; explicit application Stop cancels. Historical,
terminal, rewritten, hidden or reduced-motion text flushes immediately. No
unrelated/generated changes, secrets, paid requests, remote deployment or push.
Full repository tests were not run: affected units, real SDK/hook, real app,
static and build layers cover this feature; no schema requires migration proof.

## Limits and removal

Per-owner8streams x8activepolls/s permits64authorizedreads/s/owner. There is no
separate global cap here; aggregate production database/authentication capacity
was not measured. ADR0041 records this preproduction tradeoff. User-clicked
HTTP(S) model links retain prior social-engineering risk; no assets auto-fetch.
Streamdown upgrades or enabling raw HTML/images/math/Mermaid/code plugins need
another security review. Fixtures do not establish real-provider latency or
prompt-injection quality. Unchanged tools were not fully reaudited.

Removal is a local revert of this feature's squash commit plus pnpm install;
there is no persisted migration or data transformation to undo. Preserve the
preceding positioning checkpoint. No remote rollout is part of this delivery.

## R-2 remediation and verification

Final completion review reproduced cross-session error routing under actual
React transition/Suspense: B renders without committing, A remains active, A403
invokes the SDK latest B callback and purges B's query. Earlier ordinary switch
regressions flush effects and miss the window. Root cause is shared mutable
callback ownership across SDK instances plus publication refs mutated during
uncommitted render. Fixed with explicit per-session Chat/callback/cache ownership and layout-commit
activation/cleanup. Speculative renders allocate inert owners, so committed A's
real403 clears A only, preserves B history and opens no B HTTP subscription.
Committed switching and A→B→A tests retain late errors even when the HTTP mock
ignores abort. The actual red Suspense reproduction now passes; all29focused
checks, lint and web typecheck pass. Completion, tester and security bounded
source reviews pass with the final manifest above. Final real-app run passes
2API+3Chromium as recorded in E4. Final production build passes (E3). All37manifest paths rechecked OK after
restoring next-env; final diff check clean.

## Final verdict

Independent completion, tester and security reviews Pass. R-1, S-1 and R-2 are
fixed, T-1 timing coverage closed; no open material findings. Final source hashes
match the tested manifest, all affected checks pass, and generated next-env is
restored. Feature status Complete. Git history records the required local commit
and squash integration; no push, deployment or branch deletion is authorized.
