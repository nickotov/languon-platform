# Review: Contextual Language Assistant and Knowledge

Reviewed: 2026-10-19
Verdict: Approved. All material findings are resolved and integrated verification passes.

## Review boundary

Initial review covers base `9ae467b035e135eea3b9df07d61fba2192206df7` plus the
feature worktree, including new/untracked files. The specification is FEATURE.md;
EVIDENCE.md owns exact checks and input identities. Separate tester review is
required for the new SDK/stream/concurrency harness and security review for
source authorization, model tools, credits, persistence and rendering. Completion
and security reviewers independently record findings below. Final verification
and focused remediation must finish before integration.

## Findings and dispositions

### Tester harness audit — 2026-10-19

- Scope: independent assessment of the real pinned Mastra/scripted-model harness, disposable PostgreSQL lifecycle/accounting/source-authority/lease coverage, custom AI SDK durable transport, and deterministic composed HTTP/browser fixture. This is a test-evidence and regression-surface audit, not a general implementation or security review.
- Evidence validity: `shasum -a 256 -c .agent/features/044-contextual-language-assistant-and-knowledge/evidence/lifecycle-content-hashes.txt` passed for every listed lifecycle, migration, source-authority, Knowledge, capacity and database-role input. The accounting adapter and test hashes recorded in E-accounting also match their current files. Remediation verification confirms both refreshed `memory-evidence.sha256` and `evidence/web-transport-content-hashes.txt` match every listed final input. Browser E-J03 remains outside this bounded remediation and makes no passing claim here.

### T-1

- Severity: Medium
- Location: `EVIDENCE.md` E-memory-sdk; `.agent/features/044-contextual-language-assistant-and-knowledge/memory-evidence.sha256`.
- Problem and failure/reproduction scenario: `shasum -a 256 -c memory-evidence.sha256` reports checksum mismatches for `packages/contracts/src/contextual-assistant.ts` and `pnpm-lock.yaml`. The recorded real-SDK/Mastra result therefore describes an earlier uncommitted patch and dependency graph.
- User/system impact and acceptance/risk affected: AC02, AC03, AC06 and AC11–AC13 lack final-state evidence for native tool parts, memory storage and accounting adapter compatibility. A changed transport contract or resolved package graph can invalidate runtime behavior even while the adapter files are unchanged.
- Suggested fix: after the final contract/lockfile edits settle, run `pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai`; capture final content hashes (or a complete final patch identity) and record the result in E-memory-sdk. This is the lowest-cost reliable rerun; do not repeat the valid lifecycle/database suite absent a changed listed input.
- Disposition: Fixed. E-memory-sdk records the focused real pinned SDK suite rerun after the exact Core pin and final contract/lockfile changes: 20/20 tests across 3 files, 8.93s. The refreshed manifest covers the contract and lockfile, and independent checksum verification passed.

### T-2

- Severity: Medium
- Location: `apps/web/tests/conversation-durable-transport.test.ts`, `apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts`.
- Problem and failure/reproduction scenario: the two transport tests cover initial replay de-duplication and an explicit `reconnectToStream` snapshot, but neither makes a live `conversationApi.events` subscription end or fail and verifies the transport's internal reconnect loop. The untested path must resume from the last received event ID after a transient disconnect, avoid a second admission/provider call, and deliver a subsequent event once. A regression in cursor progression, retry timing, or replay de-duplication would be hidden until a real network interruption.
- User/system impact and acceptance/risk affected: AC05's close/reopen and durable reconnect guarantee could duplicate visible canonical content or stop updating after a transient SSE break. The in-progress browser scenario demonstrates close/reopen, but it does not deterministically force an SSE transport interruption at the cursor boundary.
- Suggested fix: add one focused fake-transport test: first `events` call emits event 1 and returns/rejects; second call asserts `after === 1`, emits event 2 (and optionally replays event 1), then aborts. Assert no `submit`, exactly one rendered copy per event ID, and a reconnect indication. A companion 401/403 assertion may verify that terminal authorization errors stop retrying; production code has that branch but it currently has no direct test.
- Disposition: Fixed. The added seventh focused transport test forces a TypeError after snapshot/event IDs 1/2, requires reconnect from cursor 2, ignores replayed ID 2, and accepts IDs 3/4 exactly once with no admission. Its four parameterized terminal-access cases cover 401/403/404/410 without retry. E-WEB-RECONNECT records 7/7 passing, and its final manifest passed independent checksum verification.

### Tester conclusion

- The database harness is proportionate and uses real disposable PostgreSQL for transaction, credit, source authority, deletion and lease fences. It covers the material concurrent admission, stopped/expired lease, archive/revocation-after-claim and no-resurrection cases; no additional database rerun is warranted while its complete manifest remains valid.
- The real pinned SDK harness correctly exercises the SDK with deterministic provider responses instead of mocking the component under test. The composed HTTP/browser fixture uses the production module composition, persistent SQL/Redis and real SDK runner while replacing only the paid provider boundary. The bounded T-1/T-2 remediation is complete; E-J03 browser completion remains separately required.

## Completion audit

AC01–AC15 have implementation and current focused/integrated evidence in
EVIDENCE.md. Independent completion/security reviews approve the C3b final
source state and lock graph; separate tester audits approve the new SDK,
transport, accounting, Redis and PostgreSQL concurrency harnesses. Final mapped
API2/browser3 and affected compiler/build/lint/docs checks pass. There is no
unresolved critical/high or material security/correctness/test finding.

## Remediation and final verdict

T1/T2, C1–C7 and follow-ups, A1/A1b/A2, S1 and C3b are closed. Later records below
preserve the exact review boundaries, red/green reproductions and dispositions.
E-final owns integrated proof and reuse decisions. Local squash integration preserves the verified source identity; no further
code, test or review work remains.

## Initial independent completion review — 2026-10-19

Reviewer: `/root/completion_review`. Verdict: **Changes requested**.
Boundary: base/HEAD `9ae467b035e135eea3b9df07d61fba2192206df7` plus65 tracked
modified and138 untracked files. Initial complete-patch aggregate SHA-256:
`eece77c3e1d32f74b6f5c12808e31951dc2b6bb70e291c6b5d5156db3e91438a`.
The reviewer read the complete scoped worktree and surrounding paths;
`git diff --check` passed. No source files were modified by review.

| ID  | Severity | Location                                        | Problem and impact                                                                                                                                        | Required remediation                                                                                                  | Disposition                                                |
| --- | -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| C-1 | Medium   | conversation-source.ts effective example fields | Dormant example translation can be copied to shared context when parent example is disabled. Violates active learner-visible field contract and ADR-0011. | Gate child on effective parent and child; owner/shared regression.                                                    | Resolved; E-CONVERSATION-REMEDIATION, E-C3-LOCK and E-C3b. |
| C-2 | Medium   | attachment contract, picker/composer/messages   | Card copies render opaque JSON instead of typed labeled fields required by AC02.                                                                          | Discriminated structured immutable card payload and language-aware rendering; contract/component/browser coverage.    | Resolved; E-WEB-C2-C5-C7, E-accounting and E-J08.          |
| C-3 | Medium   | store read transaction/events, stream loop      | Idle1Hz polling holds global capacity and chat write fences; empty zero-ID snapshot repeats forever.                                                      | Read-only authorized transactions with source share locks; one initial empty snapshot; lock/poll regression.          | Resolved; E-CONVERSATION-REMEDIATION, E-C3-LOCK and E-C3b. |
| C-4 | High     | ConversationService.access and SSE loop         | Each poll consumes240/min request quota. Four tabs can exhaust it and appear to lose chat access.                                                         | Session revalidation without repeated request quota; counted-limiter polling test.                                    | Resolved; E-CONVERSATION-REMEDIATION, E-C3-LOCK and E-C3b. |
| C-5 | Medium   | conversation API error adapter and panel        | Model/credit/capacity errors lose validated details and actionable localized recovery.                                                                    | Stable model/credit/capacity codes, request ID preservation and localized guidance; error regressions.                | Resolved; E-WEB-C2-C5-C7 and E-S1.                         |
| C-6 | Medium   | E2E runner and generated next-env.d.ts          | Browser dist rewrites tracked declaration to ignored fixture paths, leaving dirty/checkout-dependent state.                                               | Runner exact-byte backup/finally restore on success/failure; ordinary Next generation plus clean-output verification. | Resolved; E-J06 and E-J08.                                 |
| C-7 | Medium   | stream error callback/API control parsing       | Every exception becomes terminal404, including transient database failures, disabling reconnect.                                                          | Confirmed auth/source loss only is terminal; transient close/retry; real route/wire regressions.                      | Resolved; E-WEB-C2-C5-C7 and E-S1.                         |

## Author finding during remediation

A-1 — Medium, source resolver/worker context assembly: long Text source and
translation are one giant JSON material entry, injected wholesale and returned
whole by retrieval. This exceeds conservative provider/tool bounds and prevents
asking about supported long texts. Backend owner must build bounded passages,
retain frozen full admitted material, provide relevant/surrounding retrieval,
and clearly mark excerpt coverage. A long translated-text regression is required.
Status: Resolved; E-memory-source-context, E-memory-A1b and E-C3b.

## Initial independent security audit — 2026-10-19

Reviewer: `/root/security_review`. No material exploitable defect was identified
in that static pass. Security-critical91-file aggregate SHA-256 was
`642c5eae5eee261f7a1a45353d3df1c33cb80694db9461f72b47d89a8ef5217a`.
The reviewed scope included owner/shared capability checks, live lease/access
fences, frozen/copied context, draft-only tools and explicit publication,
per-call pinned credit settlement, deletion/purge grants, safe PM/Markdown/URL
rendering, scoped middleware and private no-transform SSE. It reused valid
recorded deterministic database/SDK evidence and did not inspect production
provider retention or deployed roles/proxies. Prompt obedience is not an
authorization boundary. Completion-review C-1 field visibility and subsequent
C-2/C-3/C-4/C-5/C-7/A-1 changes require a focused security remediation pass;
this initial result is not a final security approval of later changes.

## Focused review follow-up batch

- **S-1 — Medium, stream availability.** The C4 repair correctly stops charging
  every poll, but 240 initial connections/minute with 240-second streams permits
  approximately 960 simultaneous polling streams for one actor. A shared atomic
  active-stream lease cap and separate connection-admission limit must bound
  this work across API replicas, release on all exit paths, expire after crashes,
  and fail closed when admission storage is unavailable. Accepted; backend owner
  implementing a cap of eight active streams per actor and focused concurrency,
  isolation, release and expiry regressions. Per-poll session checks stay active.
- **C-5 follow-up — Medium, late provider capacity.** Per-call accounting admission
  still throws an untyped error when capacity changes after HTTP admission. The
  worker consequently persists `generation_failed` instead of
  `capacity_unavailable`. Accepted; accounting owner adding a typed domain error
  and late-admission failure regression.
- **A-2 — Medium, usage presentation.** The transcript ignores the existing
  `usage.estimated` flag, so maximum reserved tokens after missing provider usage
  appear indistinguishable from reported usage. Accepted; web owner adding
  localized input/output token and charged-credit labels plus an Estimated
  indicator, with component and rendered-browser proof.

These are bounded extensions of the existing availability, error and cost
visibility invariants. The recurring cause is that the initial tests covered
individual successful admission and failure mapping, but not accumulated idle
subscriptions or capacity changing between admission and dispatch. This batch
adds cross-instance lease tests and a late-capacity regression rather than
repeating only the successful journeys. Source-authority and memory designs
remain unchanged. Final affected checks and focused review of these fixes are
required before completion.

A-1b — Medium, current-message input frontier: source retrieval was bounded, but
an otherwise-valid 80k copied attachment (or several attachments and a long
question) could exceed the 64k conservative provider input gate after queuing.
Memory threshold reservation also omitted this current message. Accepted;
implement a synchronous aggregate UTF-8 model-message budget before admission,
retain whole accepted copies, return actionable `context_too_large` for rejected
input without a queued turn/credit reservation, and reserve accepted current
message bytes for compaction. Require both pre-admission rejection and an actual
SDK near-boundary retrieval/answer regression. This extends the same bounded-input
test seam diagnosed above rather than allowing asynchronous invalid-input failure.

## C-3 follow-up — verified lock-order failure

Medium, draft publication versus stream polling. Final mapped run
`assistant044-final-remediated` passed both API scenarios and the copied-card and
mobile browser scenarios, but desktop publication returned500. The real
PostgreSQL log reports40P01: publication owns chat UPDATE after a user SHARE
fence, then Knowledge publication upgrades the user to UPDATE; the polling
transaction owns a user SHARE fence and waits for chat SHARE. This is a confirmed
cycle, not an assumed timing failure. The transaction rolled back and preserved
the draft.

Accepted remediation: fence the publishing actor for mutation before source/chat
locks; retain Knowledge's existing mutation semantics and read-only non-global
polls. Audit sibling admission/worker/Knowledge paths for the same upgrade order,
and add a deterministic two-connection PostgreSQL regression. The original
browser scenario must pass after this correction. No blind rerun or relaxed
assertion can close this finding.

This additional cycle exposes incomplete lock-hierarchy reasoning across the
new read-only transactions and the existing Knowledge owner mutex. The approach
now explicitly audits owner→source→chat→note/credit lock acquisition and tests
concurrent publication, rather than treating each repository's passing isolated
suite as proof of their composition. Completion/security review expands only to
that affected lock hierarchy. Prior unrelated test evidence remains reusable.

## Focused remediation completion review — 2026-10-19

Reviewer: `/root/completion_review`. Mode: **remediation**, expanded only for the
confirmed C-3 publication/poll lock cycle and its sibling mutation callbacks.
Verdict: **Approved for code and test remediation; final feature completion is
conditioned on root's in-progress final mapped browser run and integrated static/
build checks.** No unresolved material correctness, architecture, concurrency,
security, performance or test-coverage finding remains in the reviewed surface.

Boundary: base/HEAD `9ae467b035e135eea3b9df07d61fba2192206df7` plus the
uncommitted tracked and untracked remediation state. The exact reviewed source/
test boundary is the 191 entries in
`evidence/final-source-content-hashes.txt`; all entries passed independent
checksum verification. Manifest SHA-256:
`74ac47ce95d86c38aa9713a8e114bb3e30ba4a8ec25bacf33aafc5b552264856`.
The focused C-3 and S-1 manifests also independently matched all 119 and 16
inputs, with SHA-256
`76776b832a2ad1c9479f77eec00e4c82d7bbbc9798b07519a9d73b9ca9f61556`
and `4a0d97834a5ba2208d105c36b1fcedd1643185a3e9a4be5e23e1e17864cd63ac`.
`git diff --check` passed. The review changed no production or test source.

Disposition:

- C-1/C-2 are fixed: copied dictionary material follows effective parent/child
  visibility, uses a validated immutable typed-card contract, preserves all
  active fields once for the model, and renders labeled language-aware safe text.
- C-3 and its follow-up are fixed: ordinary authorized reads retain short shared
  source/user/chat locks without the global capacity or chat-write fence.
  Mutations and `withOperation` acquire the active actor update fence before
  source/chat locks, and both HTTP and worker compositions use the read-only
  Knowledge source participant. Deterministic real-PostgreSQL tests first
  reproduced `40P01`, then passed dictionary publication, Knowledge publication,
  and a worker callback overlapping an SSE read; the full store suite passed
  21/21. This ordering preserves draft rollback, note revisions, source authority,
  provider accounting and unrelated actor progress.
- C-4/C-7/S-1 are fixed: polling revalidates the live session without spending
  request quota, transient failures end as reconnectable EOF, terminal access
  errors use bounded control frames, and empty snapshots are suppressed. A
  separate connection rate plus atomic Redis leases caps active streams at eight
  per actor across replicas, expires crash leaks, releases token-specifically on
  every exit path and fails closed. Real Redis passed 5/5 and route/service tests
  passed 14/14, including a late validation completing after the deadline.
- C-5 and its follow-up are fixed: validated error details and request IDs reach
  localized recovery UI; model, credit, capacity and rate failures retain stable
  codes. Capacity disappearing after HTTP admission now persists
  `capacity_unavailable` with no provider call or credit reservation; the real-PG
  accounting suite passed 15/15.
- C-6 is fixed: the guarded E2E runner restores the exact prior `next-env.d.ts`
  bytes on success and failure, including a missing-file baseline. Its three guard
  tests pass and the current declaration matches the canonical tracked content.
- A-1/A-1b are fixed: long sources are frozen as bounded Unicode-safe passages,
  initial/retrieved context is explicitly partial and byte-bounded, and the
  aggregate current model message is rejected synchronously before queue or
  credit admission when it exceeds 8,000 encoded bytes. Accepted copies remain
  whole; memory reservation includes the current message. Real SDK/unit proof
  passed 29/29 with near-boundary source retrieval and all four calls within the
  64k dispatch cap; real PostgreSQL coverage is included in the final 21/21 run.
- A-2 is fixed: terminal usage distinguishes localized Estimated versus Reported
  values and labels input tokens, output tokens and charged credits. Oversized
  context gives localized corrective guidance without retrying the same invalid
  request. Current focused web evidence passed 37 tests.

The independent concurrency tester found no remaining gap in S-1, A-1b,
late-capacity or the C-3 lock hierarchy. Focused security remediation approved
the final trust/resource boundary. Remaining verification is execution evidence,
not an open code-review defect: root must record the complete post-C-3 mapped
browser result and final integrated lint/typecheck/build/docs checks against the
same stable source identity before marking the feature complete.

## C-3b — Shared source-owner/resource lock order

Medium, shared dictionary resolution versus owner lifecycle. Security review
found dictionary resolution takes dictionary SHARE before source-owner user
SHARE, while account deletion scheduling/dictionary deletion takes owner UPDATE
before dictionary UPDATE. A reader belonging to a different learner can therefore
hold the resource while waiting for its owner, opposite the lifecycle writer.
The earlier actor-before-chat correction does not cover this distinct source
owner. Accepted; use a nonlocking candidate owner lookup, fence that owner first,
then re-read/lock the resource and revalidate its owner, active state and access.
A deterministic real shared-source/lifecycle regression is required.

This repeated pair-order issue changes the diagnostic approach again: explicitly
inventory actor/source-owner/resource/container/share/chat/target-note lock pairs
for every source kind and compare them with archive, share revocation, resource
delete, account scheduling and purge writers. Completion/security review will
check the full affected lock graph, not merely the latest patched pair. No
unrelated product/refactor scope is added. Final completion remains pending.

## C-3b focused remediation recheck — 2026-10-19

Reviewer: `/root/completion_review`. Mode: **remediation**, bounded to the C-3b
source-owner/resource lock-order fix, its affected conversation callers, the
dictionary/text/Knowledge lifecycle writer graph, and the new PostgreSQL
regressions. The prior completion review remains reused for all other feature
surfaces. **No material correctness, concurrency, authorization, architecture,
performance, or test-coverage finding remains in this reviewed boundary.**

Boundary: base/HEAD `9ae467b035e135eea3b9df07d61fba2192206df7` plus the
current uncommitted tracked and untracked state identified by the 126 entries in
`evidence/conversation-lock-order-content-hashes.txt`. Independent checksum
verification passed 126/126; manifest SHA-256 is
`2f86bd5f2cd3ff8aa8bffbcf66e0ba7d61f30ded66ba93ef6318f5cd9c951155`.
This manifest supersedes the stale 119-entry C-3 boundary for the affected
source/test state. `git diff --check` passed. This review changed no production
or test source.

Disposition: `conversation-source.ts` now uses the unlocked dictionary row only
to discover a candidate owner, acquires that owner's active SHARE fence, then
locks and revalidates the dictionary owner, lifecycle, locator, digest, version,
and visibility before reading settings/cards or granting access. Account
scheduling and purge retain owner UPDATE before dictionary mutation/deletion.
Text already follows owner then folder/text/share, and Knowledge follows owner
then note; their archive, revoke, delete, publication, and conversation callers
introduce no inverse resource-to-owner blocking edge. Actor/source-owner
crossing is SHARE/SHARE for reads, while conversation mutations retain the
earlier actor UPDATE before source/chat order.

Evidence is sufficient at the database layer. The actual account-deletion
schedule through both events and detail plus actual account purge first failed
3/3 with PostgreSQL `40P01` under the old order and passed 3/3 after the fix.
Four owner/archive/digest/version races prove the post-candidate revalidation
denies stale worker appends, preserves the admitted source snapshot, and writes
no rejected delta. The final full real-PostgreSQL conversation-store suite
passed 28/28, with scoped lint and whitespace checks green.

The focused security recheck independently verified the same 126/126 content
boundary and source-kind/lifecycle graph and approved C-3b with no unresolved
material security issue.

Verdict: **C-3b code and test remediation approved.** Final feature completion
still depends on root refreshing the integrated source identity and recording
the affected static/build and mapped application reruns after this source
change; those are verification gaps, not open defects in this focused review.

## Final security reconciliation

`/root/security_review` approved the final C3/C3b source-owner and lifecycle
boundary after explicitly auditing the dictionary, text, Knowledge, account
scheduling/purge, archive/revoke/delete, chat and worker lock graph. The sole
remaining dictionary resource→owner edge is corrected; the locked reread checks
owner, lifecycle and live capability after the owner's fence. No unresolved
material security finding remains. Verified current C3b manifest126/126,
SHA256 `2f86bd5f2cd3ff8aa8bffbcf66e0ba7d61f30ded66ba93ef6318f5cd9c951155`;
S1 manifest16/16, SHA256
`4a0d97834a5ba2208d105c36b1fcedd1643185a3e9a4be5e23e1e17864cd63ac`.
Focused eight-file review aggregate:
`981163ae21b4e5d42a5ca87482f454bfc2fc67935a1ccc2f6da50af19d9b9709`.
Earlier review remains applicable outside this narrow change. No reviewer
modified production/test source or reran already valid broad suites.

The late S1 auth-await deadline guard remains approved: it checks cancellation
and deadline before beginning another SQL poll, preserving session/source checks
and all release paths. Deployment-specific role/proxy configuration and paid
provider retention were outside local verification; deterministic fixtures make
no factual-answer-quality claim. Prompt injection grants no tool authority and
cannot publish notes automatically.

Final separate tester C3b audit: /root/independent_tester verified126/126
manifest entries and found no material test-harness gap. The new scheduling
cases use actual account-deletion beforeCommit, real purge claimDue/finish,
latches and observed PostgreSQL waits; the four candidate-owner races prove
locked reread outcomes and frozen-content preservation. There are no sleeps or
fake lifecycle stores in these schedules. Owner-reported three red40P01 cases,
three repaired passes and full28/28 are valid, without redundant re-execution.
This complements the prior T1/T2, S1, A1b, late-capacity and C3 tester audits.

## Final C3b security and tester reconciliation

Security approved the complete affected owner/resource lock graph, with current
C3b126/126 manifest SHA256
`2f86bd5f2cd3ff8aa8bffbcf66e0ba7d61f30ded66ba93ef6318f5cd9c951155`
and S1 sixteen-input manifest
`4a0d97834a5ba2208d105c36b1fcedd1643185a3e9a4be5e23e1e17864cd63ac`.
The focused eight-file aggregate is
`981163ae21b4e5d42a5ca87482f454bfc2fc67935a1ccc2f6da50af19d9b9709`.
No second source-owner inversion remains. Completion review independently
approved the same current126 inputs and recorded its verdict above.

The separate tester verified126/126 current identities and found no material
harness gap: schedule events/detail uses the actual account-deletion store's
beforeCommit seam; purge uses actual claimDue/finish plus a third real lock
controller; pg_stat_activity proves the owner/resource waits. Four candidate
races reject late writes while preserving frozen snapshots. No scheduling sleeps
or fake lifecycle stores enter those schedules. Historical focused3x40P01 red,
repaired3/3 and full28/28 are valid evidence. Final191-source manifest identity
is E-final; source changes since the older broad review are covered by these
focused reviews, and all post-C3b mapped scenarios pass.

Final author closure: all review conditions are satisfied by E-final and the
post-C3b mapped API2/browser3 run. The localsquash integration has no conflicts
or business-source changes; delivery-record completion is included in the same
main commit. No unresolved material finding or required verification gap remains.
