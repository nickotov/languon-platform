# ExecPlan: Contextual Language Assistant and Knowledge

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-19

## Goal and specification

Implement the authorized first delivery of BL-006; acceptance IDs and exclusions are authoritative in FEATURE.md. Branch: `feature/contextual-language-assistant-and-knowledge`. Preserve existing design-interview documents. No deployment/push/branch deletion.

## Existing architecture

Backend Hono + DDD modules, shared Zod contracts, Drizzle migrations, PostgreSQL durable jobs and Redis capacity. Existing text/dictionary worker runtime owns common worker slots. AI credit participant reserves/dispatches/settles each model call. Next.js web uses pages-first FSD, CSS Modules/runtime tokens and actor-scoped query state. Source sharing uses current capability proof, never persisted raw share keys.

Relevant constraints: ADR-0002 database migrations, ADR-0016 runtime verification, ADR-0026 model selection (chat-only Auto exception captured in ADR-0037), ADR-0029 CSS integration, ADR-0033 additive enum migration handling. ADR-0037 owns independent Knowledge/proposal architecture.

## Test and review strategy

Use focused contract/unit tests, real pinned Mastra with scripted model, disposable PG/Redis concurrency/repository/role/migration tests, production API/SSE E2E and real responsive browser journeys. Automated tests never contact paid providers. Validate affected lint/typecheck/build and user-flow metadata/mappings. New guide maps owner/shared sources, note lifecycle, preferences and stream reconnect/Stop/Retry to deterministic journeys. Exact commands will be recorded in EVIDENCE.md when implemented.

Independent completion review required after author preflight. Separate tester required for durable streaming/concurrency and new memory harness. Security review required for source authorization, model tools, credits and rich-text rendering. No runtime proof replaced by compilation.

## Milestones

- [x] M1 — Shared contracts and independent Knowledge persistence/API (AC08–AC10, AC13); contract + disposable DB proof.
- [x] M2 — Durable source-scoped conversation admission/execution/replay/deletion and accounting (AC01–AC05, AC11, AC13); permission/concurrency/credit DB tests.
- [x] M3 — Tutor tools and synchronous Mastra memory (AC02, AC06, AC12–AC13); real SDK deterministic compatibility tests.
- [x] M4 — Knowledge/editor, contextual chat and profile defaults (AC01–AC03, AC05, AC07–AC10, AC14); component/static/build and browser proof.
- [x] M5 — Integrated migrations, user-flow journeys, author preflight (AC01–AC15); affected checks and mapped E2E.
- [x] M6 — Independent review, remediation, final verification and local squash integration (AC15).

## Current progress

Implementation and verification are complete. The web uses pinned Vercel AI SDK
UI with the durable backend transport; Knowledge, contextual tools, revisions,
preferences and synchronous memory are integrated. All independent completion,
security and concurrency reviews are approved after the recorded remediations.
Final post-C3b PostgreSQL28, mapped API2/browser3, backend/web compiler/build,
scoped lint and documentation checks pass. EVIDENCE.md E-final identifies the
final191-file source state and proof; earlier progress below is historical.
The verified feature is squash-integrated into the local main worktree without
conflicts; this completion record accompanies the single integration commit.

## Decisions and discoveries

- D01: User selected Tiptap 3.32.0 restricted visual editor. Versioned shared JSON contract excludes SDK imports and unsafe nodes; alternatives raw Markdown editor/HTML rejected for editable structured notes.
- D02: User selected Flash-only initial chat and task-specific Auto→Flash; preserve explicit preference/error and other tasks' Auto semantics. Update ADR-0037 with narrow ADR-0026 relationship.
- D03: Memory1.26/core1.57 aligned; latest memory imports unavailable core symbols. App-owned MemoryStorage enables transactional lease/access fences and canonical transcript; @mastra/pg rejected for lifecycle/schema split.
- D04: Canonical SDK message segments group into one visible response. Observe step-start IDs; observation rotates IDs. Persist partial output through same rows, never a separate contradictory final transcript. filterIncompleteToolCalls=true avoids synthesized historical tool results.
- D05: Synchronous compaction limits: five total calls, two memory calls, actor capacity reserved; threshold caps16k message/8k observations adjusted downward for real input budget; output2048 memory/4096 actor. Disable speculative buffering/retry dispatch after failures.
- D06: Source authority is distinct from content version. Freeze admitted turn content; revalidate live access at reads/writes. Source change refreshes next turn without invalidating old wording.

- D07: User requested Vercel AI SDK UI during implementation. Use `useChat` with a custom application transport and typed tool parts. Keep durable admission/credits/source authorization in backend. SDK disconnect is not Stop; no automatic model continuation from client tool results.
- D08: S-1 bounds transport availability through the existing shared Redis adapter: eight concurrent streams per actor, private-token atomic admission/release, 300-second expiry beyond the 240-second stream deadline, and twelve new connections per minute independently from ordinary request quota. Poll session/source revalidation remains uncharged. Setup/error/abort/deadline paths release once; outages fail closed before polling and bounded release failures fall back to expiry. The existing restricted Redis ACL example adds only ZREM within its unchanged opaque authentication namespace. Root accepted this necessary local use of established Redis infrastructure; no dependency, persisted schema, deployed configuration or strategic infrastructure choice changes.

## Validation links

[EVIDENCE.md](./EVIDENCE.md) owns acceptance mapping and results. [REVIEW.md](./REVIEW.md) owns findings/verdict.

## Remaining work

None within the authorized first-delivery scope. BL-006 stays in progress for
its deferred exercises/guided-tutoring scope. The local feature branch is retained.

## Author preflight — 2026-10-19

The implemented slices account for AC01–AC14. Evidence now includes real SDK20,
conversation store12, accounting13, lifecycle8, upgrade1, KnowledgePG7, scoped
contract/HTTP/unit suites and composed API journeys. Backend build passes.
Tester findings T-1/T-2 are closed with refreshed evidence and forced replay
coverage. Browser found an additional real heartbeat/wire boundary defect; its
fix passed actual API SSE regression and transport tests. Final browser rerun,
combined typecheck, web build, consolidated source hashes and documentation
mapping remain explicitly pending; none are reported passing. No known product
scope or implementation gap is hidden by these lower-layer results. Initial
completion and security reviews assess this scoped worktree, including all new
files, while final verification finishes. Material findings require remediation
and affected re-verification before completion/merge.

2026-10-19 remediation batch: initial independent review requested C-1–C-7
(one High stream quota issue; six Medium visibility/typed-copy/read-lock/error/
fixture-hygiene/reconnect issues). Root additionally found A-1 long-text context
was not bounded into retrievable passages. See REVIEW.md for authoritative
findings. Assigned backend source/read/stream fixes, typed card/error web fixes,
accounting error codes, and harness cleanup to their existing non-overlapping
owners. Prior full mapped API2/browser2 run passed before these fixes; final
changed-surface proof and focused completion/security remediation review remain
required. M2–M4 evidence must be reconciled with this new batch before completion.

2026-10-19 focused-review follow-up: C1–C7/A1 fixes passed sourcePG16,
stream/source/routes9, realSDK25, contracts20, KnowledgePG7 and web34. Final
mapped API2/browser3 passed, including keyboard and 320/390px checks. Focused
review identified S1 accumulated stream subscriptions, C5 late per-call capacity
classification, and author A2 estimated usage presentation. See REVIEW.md for
accepted findings and the test-seam diagnosis. Owners are implementing one
bounded batch; repeat only affected integration/browser/static checks after
stability, then focused completion/security verification. Do not mark prior
whole-patch evidence final until inputs are reconciled.

D08: Bound concurrent SSE subscriptions per actor with the existing shared Redis
adapter: eight active private-token leases, twelve connection admissions/minute,
300-second crash TTL for a 240-second stream. Release at setup failure, request
abort, stream abort and normal/error/deadline exit. Add only the existing-key
namespace's ZREM ACL capability; no production command is executed. Session and
source authorization remain live on every poll. This necessary resource bound
uses the established Redis deployment and adds no dependency or persisted schema.

D09: Preserve complete accepted copied attachments and reject aggregate current
messages that cannot safely fit before queue/credit admission. The projection
counts UTF-8 serialization, including escapes and an envelope allowance, and
memory reserves those bytes in addition to source/tool overhead. The safe bound
is derived by the A1b owner and documented in the user-flow guide; no content is
silently truncated.

2026-10-19 C3 lock-order diagnosis: final API2/C2/mobile passed, desktop publish
failed with confirmed PostgreSQL40P01 (owner SHARE→chat UPDATE→owner UPDATE
versus poll owner SHARE→chat SHARE). Owner fixes the early mutation fence and
adds a deterministic PG regression plus sibling lock-order audit; see REVIEW.md.
Reopened M2 remains pending. Previous source manifests/builds covering the changed
store/route are invalidated; final scoped rebuild/mapped rerun and focused
lock-hierarchy review follow stability. The draft survived rollback.

2026-10-19 E-C3-LOCK: Final mapped desktop publish exposed a real actor/chat
lock inversion with a concurrent stream read. Deterministic dictionary and
Knowledge primary-source regressions first failed with PostgreSQL40P01. Mutating
authorization and operation callbacks now acquire the active actor update fence
before source/chat locks; pure reads retain shared fences and no global capacity
lock. Worker Knowledge source resolution uses getForSource. Final conversation
PG21/21 and scoped lint pass; source/tests stable. Root final mapped/static checks
and independent remediation verdict remain required. See EVIDENCE E-C3-LOCK.

2026-10-19 C3b security follow-up: different-actor shared dictionary reads lock
resource→source-owner, opposite lifecycle owner→resource. The source resolver
must fence a candidate owner before locking/revalidating the dictionary. Add a
real shared-reader/lifecycle deadlock regression and explicitly audit source-kind
lock pairs against archive/revoke/delete/account scheduling/purge. The original
actor/chat fix and prior integrated API/browser passes stay historical. Affected
source/store/build/mapped evidence is reopened; no merge before focused lock-graph
review. See REVIEW.md C3b.

2026-10-19 E-C3b: Security found a foreign shared-dictionary reader could retain
dictionary SHARE while waiting for its source owner, opposite actual account
scheduling/purge. Source resolution now discovers owner ID without a row lock,
locks owner SHARE first, then locks/revalidates dictionary owner/lifecycle/live
capability before material. Actual account scheduling events/detail plus stale
pending-account purge regressions first failed40P01 and now pass. Four post-read
owner/archive/digest/version races retain immutable turn snapshots and deny late
writes. Source-owner graph audit covers dictionary/text/Knowledge lifecycle and
share writers. Full conversation PG28/28 and scoped lint pass; no further source
or test edits planned. Root final integrated checks and focused reviews remain.

## Completion and integration

All acceptance criteria, applicable checks and independent reviews are complete.
Feature commit0d2a158 was squash-applied onto local main from base9ae467b without
conflicts. Its191 business/source/test/configuration inputs retain the verified
final manifest identity; only these four delivery records change at integration.
No conflict resolution invalidated execution evidence. The required single main
commit includes this completion record. No remote publication is part of this
local delivery.
