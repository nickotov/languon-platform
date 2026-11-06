# Improvement: Complete larger vocabulary requests through bounded batches

Status: Escalated to feature 061
Created: 2026-11-04

The combined implementation and current verification now belong to
[feature 061](../features/061-reliable-learning-content-pipeline/FEATURE.md).
The diagnosis and earlier bounded delivery below remain historical evidence.
Feature 061 also fixes credential-bearing SDK memory configuration; technical
verification and local cleanup are recorded there, with provider-key rotation
still required before operational security closure. Earlier no-commit and stale
worker statements describe the earlier task, not the current authorized feature.

## Outcome, classification and scope

### Reopened incident: planner refusal and independent provider throttling

The user reported two fresh-worker clarification replies asserting that 50
French shopping entries with Russian translations exceeded generation capacity.
Read-only local metadata confirms each turn completed exactly one planning call
and returned `kind: clarification`; no authoring dispatch occurred. The persisted
pending brief has one vocabulary task, count50, languagefr, translationLanguageru.
The new worker started before the latest reply. This rejects stale-code and
authoring-batch-limit explanations for that reply. Prior assistant limitations
remain in recent chat history, while the resolver was never told that vocabulary
batching is automatic or that capacity decisions belong to the host.

Two subsequent attempts failed their first provider call. Route health records
classify both as `rate_limited` (429); admission excludes transient failures for
60seconds. This accounts for the subsequent503 independently of the semantic
planner defect. Do not reset health/circuits, alter route/funding settings or
automatically retry ambiguous submissions.

Repair scope: keep the same intent schema and execution/accounting boundaries;
give the resolver explicit host execution policy, preserve complete pending
requirements despite historical refusals, and delegate capacity checks to the
existing deterministic batch planner. Do not route via wording/regex or add
another planning call. Retain genuine requirement/source clarifications.

Verification before implementation: add real pinned-SDK regression for planner
policy in a history containing an obsolete refusal and a complete pending50-word
brief (~seconds); this proves prompt propagation, not model semantic compliance.
Run focused request/capacity/budget tests, prompt/backend typechecks, scoped
lint/format; then registered `ai-conversation` (~1min) because the planning
envelope changes. Reuse the still-valid50-entry review/apply/save browser proof:
no rendering, transport, authoring or publication mechanism changes. Readiness
doctor before/after. Matching live proof remains separate and must use existing
smoke quota/account guards and a fresh runtime; never an unguarded retry.

Earlier passing deterministic evidence below remains valid for the batch engine,
but did not prove that a real resolver would select generation after a historical
capacity refusal. Overall completion is reopened accordingly.

Fix the reported normal 50-word shopping vocabulary request. The old preflight
estimated5700 against 3584 and returned a limitation before authoring. This
conflated one model response with the entire learner request.

Classification: improvement of an existing count-based generation contract,
within previously authorized feature060 scope. No new API, persistent concept,
permission, journey type, provider, price, runtime dependency or global ceiling.
Keep five total calls, two memory calls,10000 total output tokens,4096 per author
call and the existing deadline/accounting authority. Use multiple admitted calls
inside the same action and publish one complete proposal only.

Preserve unrelated uncommitted readability refactor/tool/docs/evidence work on
current main at 0bc905fb. No commit/merge/push/branch deletion is authorized here.

## Acceptance and design

- AC-1: Topic 50 vocabulary authoring uses internally bounded parts and produces
  exactly 50distinct entries in one vocabulary block/proposal, not a 31-word cap.
- AC-2: Explicit supplied words retain every term and order. Each part and merged
  prefix/final result validate through existing schemas/semantic validators.
- AC-3: Cross-part duplicate words/identities, missing entries and invalid output
  cannot publish. At most one safe validation repair across the entire operation;
  transport failures/uncertain submissions are not automatically retried.
- AC-4: Existing parent call/output reservations constrain plan feasibility and
  every dispatch; remaining budget includes memory/planning/unknown reservations.
  No partial proposal on cancellation/failure. Actual gate stays authoritative.
- AC-5: Mixed components remain ordered and complete. Oversize vocabulary splits
  greedily; each fragment is standalone to avoid references to discarded partial
  block IDs. Other complete tasks pack when they fit; individually unbatchable
  long bilingual/exercise output still receives the existing actionable limit.
- AC-6: Standalone tools use the same engine with bounded local defaults and
  optional injected remaining budget, preserving future independent Studio use.

Keep batch planning, immutable result assembly and model orchestration in small
cohesive modules. Reuse existing estimate as a per-call planning signal, not a
single-response product limit. Plans fit at most4author calls and10000estimated
reserved output including512 headroom/part; runtime remaining authority can be
stricter. Topic 50 plans 31 + 19 with 6824 planned tokens. No count/word truncation.

Later parts receive host-controlled progress and validated prior generated
content; they must avoid repeated terms and use fresh identities. Original
instruction/topic remains intact; per-part count/word slice controls that call.
Merge vocabulary into the first block identity only after prefix validation;
never mutate accepted prefix on an invalid candidate. Final validation uses the
whole original brief before the existing one-shot persistence path.

## Verification plan before integration

- Red reproduction: existing capacity function rejects count 32 and 50; real SDK
  regression expects50but sees old limitation. Languages/credentials are not cause.
- Pure planner/compiler +authoring tests:50 topic,50explicit terms/order, mixed
  blocks, duplicate second part, malformed part, one global repair, cancellation,
  reduced/unknown remaining reservations and standalone bounds (~seconds).
- Real SDK gate/request tests: planner+two authors, aggregate admission/settlement,
  exactly one persisted proposal/receipt, cancellation and preflight low budget
  (~seconds). External model transport only deterministic; no paid tests.
- Browser: mapped Knowledge50 word journey with real engine/SDK/persistence, one
  proposal, all50 unique rows, Apply/Save/reload; approved disposable fixture only
  (~1–3min after prerequisite). No shared development reset.
- Final source review before broad gate; independent completion/evidence review
  required due bounded multi-call orchestration and cancellation/accounting risk.
- Selected registered ai-conversation stage (real SDK, repositories, normal and
  reduced admission/memory/cancellation/settlement, ~1–3min); backend typecheck,
  production build, scoped lint/format and affected guide checks.
- Read-only baseline/final capability doctor; implementation/readiness/live proof
  separately. Do not restart user-owned workers, reset journals or evade prior
  task caps. No paid call without a matching reviewed guard and fresh code.

## Progress

- [x] Reproduce guard before authoring and trace parent budgets/standalone callers.
- [x] Pure bounded plan/immutable compiler and regression tests.
- [x] Engine integration, budget snapshots, cross-part validation and one repair.
- [x] Source review and focused remediation.
- [x] Browser/registered/static/docs gates and final evidence approval.

## Ownership and traceability

Root owns existing authoring service/contract/capacity tests and this record.
Planner worker owns only new application plan/compiler modules+tests. Budget
worker owns model gate, narrow runner/request wiring and SDK regressions. Browser
worker owns deterministic transport fixtures, one stable mapped50 word scenario,
and guide markers. Preserve the completed readability helpers and artifacts.

Applicable existing guides: knowledge-workspace, interactive-workbooks,
contextual-language-assistant-and-knowledge. Update observable capacity behavior
and mappings with user-flow-e2e; no new feature namespace or public journey.
ADRs0041/0045/0050/0052 and existing worker/source authority remain unchanged.

## Rollback and risks

Revert only batching engine/planner/compiler/budget wiring and related tests/docs;
do not discard unrelated readability edits. No DB/config rollback needed.
Heuristic estimates are not exact tokenization or provider quality proof. Large
requests beyond total call/output allowance still cannot be fulfilled in one
action; no unlimited generation or partial success is promised. Prior feature060
real-provider proof gap remains separate unless matching fresh-runtime proof exists.

## Evidence and review

Reproduction: synthetic count10allowed,31allowed,32/50unsupported output-capacity;
50estimate 5700 vs3584. SDK regressions reproduced failure before engine change.
Planner/compiler12 tests pass. Final evidence and independent approval are below.

## Batching engine implementation (unchanged by planner remediation)

The per-call estimate remains unchanged. A normal topic 50 request plans 31 + 19
entries, then merges immutable validated results into one vocabulary block.
Original supplied words/order remain intact, and normal small requests keep one
authoring call. Parent remaining call/output snapshots include planning, memory
and unresolved reservations. Production callbacks forward the allocated output
cap; standalone engines reserve conservatively without caller budget feedback.
At most one completed-candidate repair exists across all parts; no transport
redispatch. Partial material never reaches persistence or an applicable proposal.

New responsibilities are small: pure plan 147 lines, compiler 122 lines, local batch
budget helper, and authoring coordinator under 200 lines. Existing readability
extractions are preserved, including the original conditional adapter-resolution
await. No existing model ceilings, SQL/schema/API policies or dependencies changed.

## Prior batching-phase verification (historical)

- Green reproduction: real SDK sends planner +two authors and persists one block
  with 50 unique terms/entryIDs and generation metadata; both insufficient-budget
  cases refuse before authoring; cancellation after first measured part persists
  no partial proposal. Reduced 3900 output cap is actually forwarded.
- Final registered `pnpm test:e2e:critical -- --flow ai-conversation`: **250/250
  tests,16 files,zero skips**,50.60s native suite/57.408s runner. Evidence:
  `test-results/critical-flows/c0abcf03-23e2-4eae-83d6-8128b522d2d5/`.
  Actual SDK/normal+reduced admission/memory/cancellation/database/settlement
  compose together; external model transport only is deterministic. Owned test
  infrastructure cleanup completed. The new50SDK case is a mandatory retained
  scenario; planner/compiler/engine test files are registered.
- Post-padding-only lint fix:48focused SDK/gate/engine tests pass; source behavior
  unchanged relative to the registered run. Pure planner/compiler12 and prior
  authoring22 cases are included in the registered total (do not double count).
- Real Chromium: **2/2 journeys** (existing mixed17.2s, new50shopping8.5s;35.5s
  browser run), plus 4/4API prerequisites. New journey asserts one proposal/all50
  distinct rows, scrolls the final row, Apply, one vocabulary block, Save/reload
  exact terms. Screenshot inspected and runtime/HTTP500 checks clean.
  Artifact: `apps/web/.next/playwright/contextual-assistant-results/shopping-vocabulary-batches-20261104/knowledge-workspace.journe-f3c94-urvive-explicit-publication/shopping-fifty-vocabulary-review.png`.
  Services stopped, preservation lock cleared, canonical next-env restored.
- Fixture10/10 cases pass, including raw compact source/progress and quote handling.
- Node registry+guard37/37 pass (23 registry +14 guard), no paid requests.
  Fixed `--scenario shopping-vocabulary` permits no arbitrary prompts/URLs,
  uses one existing learner action and unchanged journal/cost/accounting checks,
  verifies one canonical pending 50-entry proposal and never Applies/Saves.
- Backend typecheck and production build pass (DTS172.842s). Scoped ESLint and
  Prettier pass;13 padding fixes only, no behavior modification. Final whole
  changed-file checks/diff check are recorded after metadata reconciliation.
- `pnpm docs:user-flows:check`:33 guides valid; knowledge-workspace,
  interactive-workbooks and contextual-language-assistant mappings pass. New
  stable scenario `workspace-large-vocabulary-generation` and critical selection
  `knowledge-large-vocabulary-generation` are registered; guide revision updated.

## Prior batching-phase readiness and live proof (historical)

Read-only capability doctor baseline ready=true: existing configuration/migrations
match; no settings changed. `pnpm ai:smoke` preflight passes with paidCalls 0.
Matching real-provider50-word proof is **not executed/claimed**: inspected existing
worker processes 59718/59786 started 21:35 on Nov 4 without watch, while this fix was
written after 22:00 (latest core 22:15:31). Do not spend against known stale code.
No user-owned worker was stopped/restarted, no paid calls, quota reset or task-key
evasion. The caller must restart the existing dictionary worker to activate this
fix. The named guarded scenario is ready for a genuinely fresh runtime.

## Review and handoff

Initial independent source review approves the batching boundary with no material
correctness/security/architecture finding, excluding unrelated readability work
except two narrow wiring points. Optional 3-part invalid-middle coverage was not
required for this reported two-part regression; generic immutable-prefix/global
repair tests already cover the invariants. The fixed smoke helper and all final evidence are independently approved.
There are no material unresolved findings in the batching boundary.

Changes remain uncommitted on main. No commit/merge/push/deletion, environment
change, production activation or unrelated work reversal. Whole-request limits
remain finite, so this is not unlimited generation.

## Retrospective

Pending user acceptance; does not delay technical handoff.

## Final independent evidence approval

2026-11-04: independent source and bounded final/remediation review approved the
implementation with no material correctness, security or architecture findings.
Reviewed actual parent reservations/settlement, per-part/full-prefix validation,
word order, copy/reference authority, cancellation and one global repair. Final
registered artifact independently confirms 250/250 tests across 16 files without
skips; the inspected browser screenshot shows Vocabulary · 50 and the last row.
The fixed named smoke guard retains all account/origin/route/quota/no-retry and
canonical publication checks. Post-review source changes are padding only.
Matching real-provider proof remains explicitly unclaimed pending a fresh worker;
no paid checks, service restarts or quota manipulation occurred. Approved for
handoff after final formatting/diff checks.

Terminal checks: whole changed-file ESLint and Prettier pass; backend and web
TypeScript checks pass; canonical next-env has no diff and `git diff --check`
is clean. Final read-only doctor again reports ready=true for configuration
prerequisites only. No additional runtime mutation or provider dispatch occurred.

## Reopened incident: final remediation evidence

BR-1 (high): real resolver incorrectly chose clarification for the complete
50-word brief, before host batching. Fixed by explicit local system instructions
and a server-owned static `hostExecutionPolicy` frame. Only the host determines
capacity; automatic vocabulary parts publish as one complete block; previous
assistant refusals cannot establish current capacity. No new call, schema,
regex, intent auto-promotion or limit increase. Missing requirements/conflicts
and ambiguous source clarifications remain intact.

BR-1-R1 (medium, independent remediation review): an initial computed pending
preflight flag mixed content validation and capacity. Removed the flag entirely
before final verification. The frame states static policy only; pending data
retains exact count and languages. No material source findings remain.

- Red SDK regression failed because the planning envelope lacked execution
  policy. Green regression proves actual pinned-SDK propagation of both trusted
  policy/system instruction and synthetic obsolete-refusal history, preserves
  complete pending count50/fr/ru, then uses the existing3-call generation flow.
  Scripted planner output does **not** establish natural-model intent accuracy.
  Added an opt-in semantic evaluation case for the actual failure pattern.
- Final `pnpm test:e2e:critical -- --flow ai-conversation`:251/251,16 files,
  zero skips,33.75s test duration/40.338s runner. Exact artifact:
  `test-results/critical-flows/928f1a4c-10a3-4af7-9eee-02a207c7ae83/`.
  The earlier251 run was superseded because remediation changed the planner
  frame during that run. Production admission, SDK, reduced output limits,
  worker, settlement and unrelated interview regressions remain included.
- Focused60 tests passed; prompts build/typecheck, backend typecheck, scoped
  ESLint/Prettier and diff checks pass. No new backend build needed: prompt
  package rebuilt successfully, executor changes only planning data, runtime
  provider/authoring/output packaging unchanged from prior verified build.
- Earlier browser50-entry review/Apply/Save/reload evidence remains applicable
  to unchanged rendering, authoring, proposal and publication behavior. Existing
  guide's expected50-entry outcome and mappings are unchanged by this repair;
  no new journey or documented behavior is introduced.
- Baseline/final read-only knowledge-actions doctor reports ready=true. This
  only proves configuration prerequisites, not provider response quality.
- Read-only historical route gate checks confirm dispatch blocked immediately
  after both recorded `rate_limited` observations and allowed again now. The
  supplied503 request ID has no admitted turn. The60-second transient exclusion
  expired naturally; no health, circuit, quota, credentials or settings changed.

Runtime activation and matching paid semantic proof remain pending: the running
non-watching worker predates this latest prompt patch. No worker was restarted,
no paid dispatch attempted, and no quota journal was reset. Restart the existing
`pnpm dev:dictionary-worker` process to load the rebuilt prompts before another
live check. Existing guarded shopping scenario remains the only permitted
paid verification route. Overall record stays In progress until activation/live
verification is resolved; deterministic implementation approval is separate.

Final remediation patch identities relative to main0bc905fb:

- `packages/prompts/src/local/tutor-request-resolution.ts`: `809236eb510caab7c17f401b68916955387a54b90fb97784566628941d46c2d9`.

- `apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-execution.ts`: `92ec82dc90f8afa1d1fd3d8b3969a7efccda8196669bffe855db7e504a2c2a3d`.

- `apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-execution.test.ts`: `5f1263a9ab236dc461451a43c879c6c621bd6ed0e0ef4570ebc9529aaba24ea2`.

- `apps/backend/src/modules/conversations/application/tutor-request-evaluation-cases.ts`: `6476d64d2e5d75bf41f57c0262b136af74f6987f3669bb15c95e48b3ee42477c`.

Independent final remediation evidence approval: `/root/batching_review` inspected the final251-test native artifact and source hashes, confirmed no material findings, accepted reuse of the unchanged browser evidence, and explicitly excluded real-model intent quality from deterministic approval.

## 2026-11-06 expanded incident review

Reviewed runtime source at HEAD89ff4193 with independent backend context-budget
and frontend refresh reviewers. User supplied a successful50-entry generation
followed by repeated10-entry generation failures after applying that block to
the editor. Current phase is diagnosis and a concrete repair proposal, following
the latest request to review deeply and propose an adequate solution. No runtime
source changed in this review; no paid calls, service restarts, data changes or
health/quota resets. Only this existing record is updated.

### Confirmed reproduction

Read-only local DB metadata for the five latest failed turns shows
`failure_code=context_too_large`, `provider_dispatched=false`, zero provider
attempts and admitted input64000. Recomputed the actual61b1a73f turn using
`projectConversationSource`, `tutorReservedInputBytes`, and
`tutorMemoryThresholds` without invoking a model. Printed numeric metadata only:

| Component                                  | UTF-8 bytes conservatively charged as input units |
| ------------------------------------------ | ------------------------------------------------: |
| Current message, including complete editor |                                             16740 |
| Base contextual instructions and metadata  |                                              6519 |
| Prospective structured-source retrieval    |                                             21015 |
| Largest planner/authoring/legacy framing   |                                             19940 |
| Generic reservation padding                |                                             10000 |
| Total                                      |                                             74214 |
| Admitted per-call ceiling                  |                                             64000 |

The learner question is71characters. Its model parts are71,14887 and288bytes
before envelope escaping/overhead. The source has4available material fragments.
The memory threshold calculation receives available=-10214 and throws before
observation, planning or authoring. Repeated retries cannot change this arithmetic.

### Findings and required repair

- KB-1 High: `application/tutor-context-budget.ts:91-126` reserves inputs from
  different execution phases together; `contextual-tutor-runner.ts:73-88` treats
  that hypothetical sum as one mandatory model call before determining intent.
  The applied50-entry block both enlarges the complete editor and activates the
  prospective21KB retrieval reserve. Replace this with shared phase-specific
  envelope construction/budgeting. Planning must receive the complete immutable
  editor once, resolver schema and bounded context; authoring receives its own
  brief/schema/source registry; tool-result allowances belong to the continuation
  where those results are actually needed. Preserve ADR0042 full editor snapshots
  and the exact dispatch gate; do not raise route/global limits or silently omit
  editor text. Do not require every possible legacy/tool path to fit before the
  planner can resolve which path the learner actually needs.
- KB-2 High: `conversation-turn-admission.ts:326-391` accepts a current-message
  envelope up to170KB, while accounting caps the allowance at the route ceiling
  (`conversation-accounting.ts:243-246`) and worker preflight then fails. Share
  minimum-fit checks for noncompactable phase inputs between admission/worker,
  rejecting genuinely impossible input before quote/hold/queued-turn insertion.
  Keep the accounting quote upper bound separate from execution minimums. Do
  **not** reject simply because the existing history-inclusive admission upper
  bound exceeds64000: history can compact and must remain eligible.
- KB-3 Medium: all context-too-large failures render question/attachment guidance
  (`entities/conversation/lib/copy.ts:104-108`, `conversation-error-notice.tsx:60`).
  This misidentifies an editor/model-envelope failure as a large short question.
  Render accurate context guidance using existing safe product error semantics;
  any new public reason field requires explicit contract/scope review.
- KR-1 Medium: `assistant-panel.tsx:123` includes conversation timestamp and latest
  turn ID/status in proposal refresh identity; the proposal-list effect immediately
  reloads on key/active changes and polls every2seconds while active. Thus queued,
  running and failed transitions each download proposal history. The backend only
  exposes succeeded-turn proposals, so none of these reads can discover a new
  proposal. The effect-local loading flag does not deduplicate restarts. Use one
  cached query owner, initial history load, and one invalidation when a successful
  proposal-producing turn is durable. Preserve explicit Apply refresh and reconnect
  recovery; do not add a new SSE/public event merely to implement this correction.
- KR-2 Medium: successful admission invokes list/detail invalidation and a separate
  workspace reload (`use-conversation-admission.ts:100`, `use-conversation.ts:99`,
  `use-assistant-panel.ts:413`, `use-knowledge-page-actions.ts:259`). SSE already
  reconciles canonical detail; this creates redundant fetch/cancellation work.
  Split invalidation by changed resource. Ordinary admission should not reload an
  unchanged workspace; preserve first-send server auto-title synchronization
  (`conversation-turn-admission.ts:260-292`) and explicit snapshot/replay recovery.
  Keep at most one sidebar/list update or patch that cache from canonical state.
- KT-1 Medium: mandatory Knowledge SDK cases use100000input units, while production
  route uses64000. Existing production-composition cases have small editor sources.
  The50-entry browser journey verifies output/publication, not the next question
  after Apply. No frontend regression asserts request counts/lifecycle changes.

### Distinctions and constraints

The extra GETs do not admit model calls or feed response bodies into the model.
One POST is one admission; the SSE GET is expected durable replay. The prior
proposal returned by repeated GETs belongs to its original successful turn and
is filtered by turnId in rendering. Its full content is not serialized into the
new planner prompt: bounded descriptors are sent, though the server eagerly
loads blocks into a local map. Its applied editor text is what affects KB-1.
Retained failed-turn snapshots are a separate compaction risk, not the observed
cause: this failure happens before memory runs. Preserve exact stored snapshots.

### Proposed verification before implementation

1. Add a red64K production-composition regression: realistic50-entry applied
   vocabulary block, ~16.7KB full current message,4materials/~21KB retrieval bound,
   then a10-entry topic request. Assert planning occurs, full editor survives,
   output is valid and every actual provider call respects the same admitted gate.
2. Verify true irreducible overflow fails synchronously with no turn/hold/provider
   dispatch; large compactable history and repeated failed snapshots can still
   complete. Include normal/reduced budgets, source authority and cancellation.
3. Add lifecycle request-count tests: initial proposal history load once; queued,
   running and failed cause no refresh/polling; successful proposal completion and
   Apply invalidate once. Preserve StrictMode, reconnect/replay and auto-title.
4. Registered ai-conversation selection (~1min) and focused frontend tests/static
   checks. Real browser journey: Apply50entries, send next10-entry request, verify
   successful proposal and bounded network requests. Update affected existing
   Knowledge/contextual-assistant guide/mappings via user-flow-e2e. Broader suites
   only for evidenced shared impact; external providers remain deterministic.
5. Readiness/live proof remain separate under standing smoke policy. The user's
   reported50-entry success is useful incident evidence, not a newly authorized
   unguarded replay of their private conversation.

Implementation and its final evidence remain pending. This review does not mark
the incident fixed or reuse earlier251tests as proof of the missing64K journey.

## Tool-context research follow-up

2026-11-06: user requested Mastra and other agent-project research on compact
tool input/output context. Saved the primary-source comparison, source audit,
installed-version compatibility and proposed policy in
[the survey](../../docs/surveys/agent-tool-context-compaction.md); indexed under
docs/surveys. This is a proposal, not runtime implementation or an accepted ADR.

Key distinction: public tool events already expose onlyID/name/state, and
proposal writes already return small receipts. Private SDK history can retain
large tool arguments/results; dedicated host-authored proposals take a different
path. Use exact data for execution/canonical artifacts, relevant results for the
immediate continuation, and concise source-bound outcomes for completed historical
exchanges. A necessary source read cannot be replaced by anID-only receipt.

Pinned core1.57.0 supports `toModelOutput` and transient `processLLMRequest`.
Its built-in ToolCallFilter and TokenLimiter use earlier MessageList hooks,
unlike newer online documentation; the limiter does not protect tool pairs or
count schemas. Prefer a focused pair-aware transient projection for historical
context, preserving current exact editor data and active tool dependencies.
Reusing OM for semantic older facts must retain admitted accounting and must
not turn historical capacity failures into current capability limits. Validate
persisted raw data, provider prompt shape and exact source follow-ups before
adopting a filter. This complements KB-1; it does not fix the false74214unit
preflight reservation on its own.

Research used official Mastra, Anthropic and LangChain pages fetched over HTTPS
and installed package declarations/runtime; search connector unavailable405.
No paid benchmark, runtime change, framework upgrade or user data upload. Scoped
Prettier, local survey-link checks and diff checks pass.
