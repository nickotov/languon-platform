# ExecPlan: Interactive knowledge workbooks

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-28

## Goal and specification

Deliver the confirmed interactive-workbook feature on
`feature/interactive-workbooks`; FEATURE.md owns AC-1–AC-22. User confirmed the
full interview scope and implementation. No further routine approval is needed.
Follow `.agent/DELIVERY.md` and `.agent/PLANS.md`; do not imply partial completion.

## Existing architecture

Knowledge notes already own recoverable private drafts, explicit Save, revisions,
shared saved-only reads and independent copies. Before this feature, document contracts and normalization were rich-text-only;
the additive v2 integration now preserves the legacy parser while supporting
typed learning nodes. Entry seams include `packages/contracts/src/contextual-assistant.ts`,
web `features/knowledge-notes`, backend `modules/knowledge` and
`modules/conversations`. Existing dictionary/text practice remains authoritative.

Speech generation is dictionary-authorized; a knowledge source must receive its
own authorization path. Audio transcription was not found in scoped discovery.
Independent knowledge media ownership now uses immutable PostgreSQL blobs and
per-note grants with scoped real-DB copy/cleanup evidence.
Texts use aligned source/translation pairs; append must preserve alignment.

Provider selection/activation and final architecture verification remain pending.
Relevant indexed ADRs examined by the implementation owners include: 0002, 0005, 0016, 0019, 0022, 0024, 0027, 0029,
0031–0037, 0041–0043 and 0045–0049. ADR-0042 needs explicit partial supersession
for shared-reader AI and media, not an in-place decision rewrite. Current
accepted contracts remain binding until the new decision is recorded.

Parent architecture findings: use an additive version-2 document contract while
preserving the exact version-1 parser. The legacy `propose_knowledge_note` tool
must retain its version-1 schema even if the general document type widens.
Knowledge owns workbook/copy operations; learner state remains separate and media
requires typed ownership. Standalone block contracts are the first code slice;
ADR-0050 has been accepted by the main agent for the confirmed workbook rules,
with relationship metadata updated on the partially superseded records. It does
not commit to or activate a transcription provider.

## Risk matrix and first proofs

| Seam                                               | Invariant / early proof                                                                    | Required final layer                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Structured content and all writers                 | Schema expansion cannot widen AI write authority; malicious markup never executes          | Contract tests, browser XSS tests, security review          |
| Workbook access/media/copy                         | Live authorization; copies survive original deletion; drafts remain private                | Real PostgreSQL transactions and concurrent lifecycle tests |
| Exercise revisions                                 | Material changes isolate old attempts; cosmetic edits retain progress                      | Domain tests and persistence integration                    |
| Private learner state                              | Owner has no reader activity access; revoke/delete applied consistently                    | API negative authorization and E2E                          |
| AI generation/translation/evaluation/transcription | Production composition uses bounded action budgets, deadlines, cancellation and settlement | Regression matrix and full critical gate                    |
| Library publication                                | Idempotent atomic publication with valid text alignment                                    | Transaction/retry/concurrency tests                         |
| UI/editor                                          | Recoverable drafts and accessible responsive reusable blocks                               | Real browser, existing workspace journeys                   |

## Test and review strategy

Read `$testing`, `$db-verification`, `$browser-verification` and applicable
specialist skills before their work. During development use selected contract,
domain and production-composition integration tests. Use deterministic external
transport fixtures, never paid/nondeterministic model calls in tests. Fixture
journeys do not prove live-provider readiness.

Before broad gates, perform focused author preflight and independent source
review. Independent security review is required for HTML/media/uploads, source
access, personal data and AI tools. A separate tester is required for the new
cross-application learner/media lifecycle and concurrency coverage; assign
coverage assessment separately from source/security review.

Final gates include affected lint/typecheck/build, real disposable PostgreSQL/
Redis and migrations, responsive/localized real-browser journeys, guide/E2E
traceability, full critical gate for shared worker/accounting/model changes,
and independent final evidence approval. Setup uses reviewed local profiles;
record concrete missing prerequisites rather than substituting mocks for DB or
browser evidence. Exact scoped commands remain to be resolved from scripts and
skills before execution. Scoped runtime and initial browser checks are recorded in EVIDENCE.md. The first
browser run exposed block-only Save and answer-state remount defects; remediation
and repeat execution precede final feature gates.

## User-flow documentation and E2E

Create `docs/user-flows/interactive-workbooks.md` with proposed stable scenarios:
`author-blocks-publish`, `workbook-order-share-copy`, `shared-private-practice`,
`exercise-version-history`, `library-copy-append`, `audio-transcript-hints`,
`revocation-deletion-media-copy`, `hostile-content-rendering`.
New exact test files/registered command must be selected after composition setup;
these names are planned coverage, not executable evidence.

Existing metadata mappings discovered (inspect through `pnpm user-flow:e2e --
inspect <slug>` before changes; read full affected guides):

| Guide                                       | Command ID                    | Exact primary test files                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| knowledge-workspace                         | contextual-assistant          | apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts                                                                                                                                                                     |
| contextual-language-assistant-and-knowledge | contextual-assistant          | apps/backend/tests/integration/modules/conversations/contextual-assistant.journeys.test.ts; apps/web/tests/e2e/contextual-assistant.journeys.spec.ts                                                                        |
| texts                                       | texts                         | apps/backend/tests/integration/modules/texts/texts.journeys.test.ts; apps/web/tests/e2e/texts.journeys.spec.ts                                                                                                              |
| flashcard-training-web                      | web-playwright                | apps/web/tests/e2e/flashcard-training.journeys.spec.ts                                                                                                                                                                      |
| sentence-practice-web                       | web-playwright                | apps/web/tests/e2e/sentence-practice.journeys.spec.ts                                                                                                                                                                       |
| shared-pronunciation-playback               | shared-pronunciation-playback | apps/web/tests/e2e/shared-pronunciation.journeys.spec.ts; flashcard/sentence files above; apps/admin/tests/e2e/admin-user-management.journeys.spec.ts                                                                       |
| ai-accounting                               | ai-accounting                 | apps/web/tests/e2e/ai-accounting.journeys.spec.ts; apps/web/tests/e2e/ai-legacy-budgets.journeys.spec.ts; apps/web/tests/e2e/learner-portrait.journeys.spec.ts; apps/admin/tests/e2e/admin-user-management.journeys.spec.ts |

Retain current scenario IDs/revisions; add coverage rather than weakening existing
workspace-share-copy-revoke, shared-reading-copy-and-revocation,
shared-learners-keep-personal-progress and paid-generation-confirmation-cancellation.
Discover dictionary/backend practice/provider guide mappings when the final
changed paths are known. Validate `pnpm docs:user-flows:check` and affected
`pnpm user-flow:e2e -- check <slug>`; execute mapped selections proportionally.

## Milestones

- [ ] M1 — Reusable contracts, safe rendering and manual editor controls.
      AC-1–3, AC-20–22. Contract, compatibility, editor and browser hostile-content proof.
- [ ] M2 — Ordered workbooks, sharing, copies and media ownership.
      AC-4–7, AC-18, AC-21–22. Transaction/lifecycle/authorization and browser navigation proof.
- [ ] M3 — Vocabulary/text reuse, bilingual reading, grammar and direct practice.
      AC-8–11, AC-16, AC-22. Atomic library integration and real practice journeys.
- [ ] M4 — Audio, transcription and grounded comprehension.
      AC-12–14, AC-19–22. Provider capability evidence, production composition,
      upload/asset isolation, transcript/hint browser proof.
- [ ] M5 — Private attempts, revisions, progress and AI learning actions.
      AC-3, AC-6, AC-15–19, AC-21–22. Replay/cancellation/settlement,
      privacy and content-version persistence proof.
- [ ] M6 — Focused preflight, independent reviews, final gates and evidence approval.
      All ACs. Resolve source/security findings, update guides/backlog, execute final
      required coverage, get final evidence review and follow local squash-merge policy.

## Current progress

- 2026-10-28 — Interview Q1–Q25 and explicit XSS requirement confirmed by user.
  Feature branch and four artifacts created. Acceptance and risk records written.
- 2026-10-28 — Foundation committed as `bb9b40b`; ADR-0050 accepted for
  confirmed content/learning boundaries, with no provider commitment.
- Current work: M1 version-2 contracts, reusable block views, editor integration
  and persistence are being integrated; M2 workbook API work is also in progress.
  Initial component/domain and real persistence checks are recorded in E6–E10.
  Workbook web management routes are implemented with API/component tests (E11).
  M1 remains incomplete
  until required browser/database evidence and integrated behavior pass.
- Next action: complete integrated editor and workbook real-browser journeys,
  then remaining practice/AI/library journeys. Learner persistence and private web
  state wiring have focused proof (E13, E17). Version-2 persistence and legacy
  target guards have real database proof (E8). Preserve exact version-1 authority;
  audio-copy ownership now has DB proof; transcription/provider execution remain
  prerequisites for generated-media slices.

## Workbook web composition

Routes `/workbooks`, `/workbooks/[workbookId]` and
`/shared/workbooks/[locator]` consume real workbook APIs. Knowledge library links
to Workbooks. Existing auth/session and query patterns gate owner pages; public
pages keep access keys in fragments/session storage and show only saved notes.
Shared primitives and runtime tokens style list/create, rename, dissolve-with-
confirmation, membership/order, explicit shared-add acknowledgement, share/revoke,
previous/next saved reading and whole-copy actions. Labels cover en/ru/fr/es.
Loading/error/reload/empty states are explicit. Component checks and typecheck
pass; rendered viewport/a11y/network proof is still pending. Independent audio copy is now integrated with ownership grants, with scoped DB
proof. Shared note/workbook chat is signed-in and receives source grant only,
without draft/editor context. Saved readers compose private learner state,
versioned attempt/event submission, explicit completion, retry and library-save
controls. Anonymous practice makes no persistence claim. Audio players receive
authorized ephemeral object URLs, revoked on unmount/access loss; source keys
never enter player URLs. Latest scoped web tests are E17; real browser remains
pending.

## Decisions and discoveries

- D1 — Keep existing Knowledge note identity and extend it with reusable blocks;
  avoid a second document entity. Ordered Workbook is a grouping, not a course.
- D2 — Reuse existing accounting/execution authority. Provider selection must use
  verified native pricing and bounded compatible capabilities, not assumed STT.
- D3 — Preserve user-authorized independent snapshots and separate private learner
  state rather than live synchronized block/library references.
- D4 — Final implementation may use specialist AI tools/subagents only behind
  existing budget/permission/proposal boundaries; orchestration shape is pending.
- D5 — Provider research, not a commitment: parent research identifies direct
  OpenAI `gpt-transcribe` as a candidate from official
  https://developers.openai.com/api/docs/models/gpt-transcribe and
  https://developers.openai.com/api/docs/guides/speech-to-text, reporting
  $0.0045/audio minute and a 25 MB upload limit. Timestamp guarantees remain
  unestablished and optional. Reported legacy-model deprecation requires checking
  the research evidence before selection. Activation remains unapproved and
  unconfigured; native tariff rounding, account policy and readiness are unresolved.
  Do not copy these research claims into enabled production configuration without
  the provider-onboarding verification and source evidence.

## Backlog mapping

BL-006 (`docs/backlog/006-grammar-conversations-and-learning-documents.md`) gains
interactive documents and exercise generation; guided lesson flows remain later.
BL-007 (`docs/backlog/007-manual-exercise-creation-and-editing.md`) overlaps manual
exercise authoring, copies and versioned attempts. BL-003
(`docs/backlog/003-personal-learning-progress.md`) overlaps persisted private
exercise progress but has broader existing learning-statistics scope. Do not mark
any whole task Done from this plan. Backlog links and index were synchronized on 2026-10-28: BL-007 is now in
progress and BL-003/BL-006 remain in progress. No new completion evidence was
added. Preserve historical evidence and unresolved broader scope.

## Validation links

[EVIDENCE.md](EVIDENCE.md) owns results and AC mapping.
[REVIEW.md](REVIEW.md) owns independent findings and verdict.

## Remaining work

### Current integration checkpoint (2026-10-29)

This checkpoint supersedes older implementation-pending ownership notes below.
Manual blocks, workbook/sharing/copy flows, library reuse, private progress and
epochs, narration, free/direct vocabulary practice and paid sentence source
adapters are implemented. E29–E33 record recent database/production-adapter proof;
private translation is finishing its restricted-worker publication proof.

Root resumed coordination after a model-capacity interruption. Root owns final
preflight, consolidated checks and Knowledge architecture documentation.
`private_translation` owns its final tests and migration0136; shared contracts
build92278 passed and is released. `transcription_security` owns SEC-1/2/4
remediation and its independent bounded review. Its later E33 role run supersedes
E30 for the restricted transcript-read repair. `transcription_privacy` is resolving
the code-owned engineering processing review with official endpoint data-control
evidence; actual account configuration/production activation remain separate.
`verification_preflight` owns the critical registry and other atlas views.

The generated migration chain was repaired with Drizzle tooling after invalid
manual journal additions were discovered. Custom131/132 are followed by generated
schema133 and combined source authority/purge134, generated constraint135 and
private publication136. Do not hand-edit generated snapshots or race generators.
Migration check passed after135; rerun on the final chain. Serialized contracts
builds remain mandatory during consumer checks.

Current full web typecheck passed after an optional-fetch-signal correction.
The first consolidated backend typecheck found nine compatibility/type errors;
owners are fixing the remaining source/test boundary types. The Mastra tool
descriptor adapter now passes that check's relevant seam without casts. Focused
web selection passed122/123; the sole maximum-document test timed out under
parallel resource contention, then passed all7 cases in isolation in4.68s with
its unchanged timeout. Rerun affected final checks with bounded concurrency.
Tutor SDK/tool selection passed28 cases. These are preflight results, not final
approval.

Remaining: stabilize private translation and processing review, finish exact AC
evidence mapping, independent full source/security review and tester verdict,
remediate, then run final static/build/database/registered browser/full-critical
gates. Atlas inputs/rendering and backlog disposition must reflect final reality.
No feature completion or main merge is authorized by partial passing evidence.

### Active coordination checkpoint (2026-10-28)

- User explicitly requested committing and continuing implementation. Foundation
  committed as `bb9b40b`; subsequent feature work remains on the same branch.
- The first two registered real browser journeys now pass after fixing block-only
  save eligibility and renderer remounting. This is partial journey evidence,
  not full feature completion. The source, security and independent tester
  completion reviews and broad final gates have not happened.
- `workbook_backend` owns typed AI block proposals/frozen structured source context,
  then STT application worker/service/routes/pool and root backend composition.
- `v2_contracts` owns canonical duration pricing/accounting, STT job/config schema,
  receipts and store; no token-to-duration reinterpretation or parallel wallet.
- `block_views` owns the fixed-endpoint STT adapter and versioned admin configuration.
- `knowledge_v2_persistence` owns private narration, audio/media ownership, purge
  fences, batch block copying and their database tests.
- `block_editor` owns manual authoring, library/copy UI and AI proposal application.
- `workbook_spec` owns workbook/learner UI, private progress aggregate, guide/E2E
  synchronization and evidence consolidation.
- Main owns owner practice/narration integration and coordination. Root backend
  app/index files have been handed to `workbook_backend` for STT composition.
- Shared package builds are serialized. Build `66270` passed after the latest
  browser run. Avoid cleaning contracts output during any consumer typecheck or
  runtime startup. Root targeted tests `37562` passed seven cases; scoped main
  lint passed. Web typecheck `65785` found a missing new-tool UI union member and
  the learner source helper's return type; both were fixed and web typecheck
  `57096` passed. Later source edits still need affected checks.
- Remaining product coverage includes complete STT execution and UI, private
  reader translations, direct vocabulary flashcard/sentence practice independent
  of library saving, full batch-copy/narration/proposal runtime coverage, and all
  acceptance/review/final verification gaps. Do not silently defer these ACs.

Runtime ACs are partially under implementation; integrated UI/database/browser
proof, media/provider research, remaining persistence/worker wiring, guide updates
and final verification remain. No external blocker is
established yet; unverified credentials/provider readiness are research items.

## Integrated browser verification checkpoint

The draft interactive-workbooks guide maps two real Playwright scenarios into the
existing critical assistant runner. Its production fixture now composes workbook,
learner, media and library services without mocked internal boundaries. First
run reached actual block authoring/upload and shared ordered reading, then failed
on legacy save eligibility and lost answer state. Main fixed save eligibility;
the editor implementer fixed renderer reconciliation. The same two scenarios
then passed without dummy prose or removed assertions; E20 retains every failed
attempt and the passing tested hashes. A separate tester must still review this
new harness.

After the two repaired browser journeys passed, the learner-private workbook
progress aggregate was implemented (explicitly completed saved notes and
updated-since-completion counts). Scoped contracts, HTTP, UI and real PostgreSQL
checks passed in E21; overview browser assertions remain pending. Actor identity
and workbook access/membership resolve in one database transaction; no author
view of other learners’ activity is added.

## Direct vocabulary practice discovery (AC-8, AC-16, AC-17)

Read-only trace found reusable frontend API ports: flashcard PracticeSession and
setup consume LearningApi; sentence setup/session consume SentenceApi. The
flashcard launcher currently constructs a dictionary transport internally and
needs an API-fed composition entry. The existing finite-round, gesture, rating,
Undo and conservative sentence-reference comparison behavior must be reused.

Both backend persistence families contain real dictionary/card foreign keys.
Do not assign note IDs to dictionaryId or create a hidden dictionary. A bounded
Knowledge vocabulary source adapter can resolve live saved note/block authority
through readLearnerNote and project existing flashcard contracts (already source
neutral). Note-specific progress and receipts remain private and cascade with
source/actor cleanup. Preserve established dictionary stores and APIs.

ADR-0024 requires monotonic learning epochs: semantic hashes alone resurrect
mastery after A→B→A. Maintain entry identity/semantic epochs at explicit saved
publication/restoration, preserving unchanged entries across movement/title/style
changes. Copies start with fresh identities and no practice state.

SentenceExercise and generation snapshots still require dictionaryId. A typed
Knowledge source alternative is necessary; frontend sentence algorithms do not
otherwise depend on dictionary identity. Prepared bilingual examples can support
free manual-reference practice. Full AI generation/checking needs the existing
accounting/worker boundary extended with real source authority and deletion
provenance; unsupported callback stubs cannot count as delivery. Training uses
existing supported-language contracts. Widget/page composition supplies training
actions to document blocks without forbidden same-layer feature imports.

Implementation is in progress: note-bound flashcard storage/service/HTTP, injectable existing launcher, header-only transport and sentence transaction port are present. Contract/transport/HTTP tests pass (E24); real database flashcard tests and complete sentence lifecycle/paid source integration remain pending. Migration129 creates seven private tables; migration130 adds restricted actor erasure. Aggregate workbook browser assertions remain folded
into the final registered critical stage, not waived.

### Free sentence lifecycle continuation checkpoint (2026-10-29)

`sentence_free` implemented free note-bound prepared sentence practice, private
next receipts/reference review/history/progress and HTTP service/routes, with
SQL epoch filtering and bounded selection/history. HTTP4/4, scoped lint and
bounded strict TypeScript source+test checks passed (E29). Five real database
cases await integrated migration134 before execution. No full feature completion
or paid execution claim follows. `sentence_practice` owns paid source adapters
and production wiring. After root hit model capacity, `private_translation`
coordinated the serialized contracts build and owns integrated migration134;
other workers must not race its journal/schema generation.

### Independent review remediation checkpoint (2026-10-29)

Initial completion review found seven Medium product defects, recorded in REVIEW.
REV01/02/04/05/06/07 source fixes are reviewed; REV03 still needs actual private
SDK multi-passage publication/overlay/Text proof with SEC5's canonical SQL. Root
manual translation editor now preserves target order and supports explicit
prepared-language selection/add;13 editor tests pass. Root library projection
adds paragraph boundaries with contiguous offsets;6 unit tests pass and its
existing real database case now covers two passages/create/append.

Full security review found a repeated new-worker raw-permission pattern (SEC5–8),
so remediation now audits capability authority systematically rather than adding
raw grants to make happy-path tests work. Sentence owner implements139 fenced
private result publication and output validation (SEC6). Financial owner implements
140 requested-target schema and141 hidden-lease/one-shot private Text publication
(SEC5), and retains STT138 financial/purge fixture adaptation responsibility. Root
owns142 live-turn/lease/owner/branch-target/media-bound block proposal publication,
metadata-only branch reads and revoked narration provenance writes (SEC7/8).

Root added actual restricted-worker proof to the existing conversation typed
proposal case: raw branch/provenance reads/inserts denied while proposal succeeds.
It awaits stable141/142 migration execution. Root separately created explicitly
disposable `languon_auth_feature_review_test` on retained port55559 (confirmed
absent first), owned exclusively by root; no other agent may reset it.

Privacy137/138 is implemented with documented code-owned engineering review,
separate time-bounded data-sharing-disabled account attestation and actual-key
fingerprint pinning. No external legal/org approval or region/ZDR activation is
claimed. Its focused24 backend/6 admin tests and full backend/admin typechecks
passed; independent source review found no remaining exploit, actual-role financial
proof after138 remains pending. Contracts build14192 passed; no build active.

Private translation owner owns final TS/UI/request-boundary fixes, multi-passage
SDK fixture proof and workbook draft-copy regression; no migration generators.
Financial140/141 generator metadata is created, root142 custom metadata is
created. Do not hand-edit generated metadata or start DB gates against WIP SQL.
Final static, browser, atlas/rendering, full critical, evidence approval and local
commit/squash remain pending. No feature completion claim.

### Current source freeze / final-gate preparation (2026-10-29)

- Functional completion reviewer source-closed all REV01–09. E39 (renamed from
  financial writer's E37) proves hardened private Text SDK→overlay→independent
  Text plus positive hidden-result loading/Apply and revoked negative. E34 is
  private translation implementation; the former duplicate browser E34 is E40.
  E37 remains reserved for Sentence; E38 STT is current.
- Full security reviewer bounded-closed SEC3 with E38 (22real DB tests plus29
  units), SEC5 with E39 (2actual SDK/restricted-role cases). SEC7/8 source closed
  with142; SEC6 source reviewed satisfactory after143/145/146, actual proof pending.
  The inherited raw saved-note/revision grant is a documented baseline trust
  residual, explicitly not a newly introduced059 regression.
- Root first focused real DB run46579 passed2 selected cases (50 intentionally
  filtered) in8.03s: multi-passage library copy/append and actual restricted-worker
  typed proposal. Root then strengthened wrong-lease input to a valid block (the
  old empty-array negative was insufficient) and sanitized proposal SQL failures.
  Rerun full45conversation+7library cases on final source; root exclusively owns
  disposable `languon_auth_feature_review_test` on55559.
- Root142 SQL is canonical conversation-block-authority.sql copied into custom
  migration142; metadata generated by Drizzle. Worker only reads branch identity/
  version, and proposes via live-turn/lease/owner/branch/media authority. No raw
  proposal or narration-marker grant. Full prospective body validation remains
  authenticated Apply's responsibility.
- Root manual translation picker/add/order fix passes13 editor tests; full web
  remediation typecheck62407 passed. Added real browser prepared-language add/edit
  steps; current interactive guide/test revision f2910f990b347691, mapping check
  passed. Actual browser execution still pending.
- Registry now adds transcription-admin8, library7, workbook7 and conversation45
  suites plus existing count deltas; backend minimum449. Registry15/15 passes
  with authorized loopback collision test. Verify final counts/new Sentence tests
  before execution; required scenarios pin key remediations.
- Sentence worker owns143 metadata projection/private claim capabilities/typed
  lifecycle/publish/immutable financial facts. Translation worker owns145generated
  private Sentence source-link schema and146app/private retention/redaction/purge.
  Both source sets are reviewed; paid Sentence5-case/actual-role runs next, serial
  with other SDK work. Neither source link nor cap is worker-readable.
- SQL140/141/144 private Text authority/retention is frozen and tested. STT privacy
  owner finished E38 and released DB/SDK slot. No contracts build active; last
  shared build14192 passed. Source-check full backend/admin passed before latest
  Sentence delta; final consolidated checks still required.
- ADR0051 accepted as necessary ADR45/49 extension under root policy, with no
  provider activation, default tariff or paid-service commitment. Atlas inputs
  need final reconciliation/stamp and actual viewer proof after source freeze.

Remaining order: stabilize/verify143/145/146; rerun root142+library on final role;
review closure/harness adequacy; format/check all changed source and docs; final
static/build/realDB/mapped browser/full critical execution; reviewer final evidence
approval; update all durable/backlog/guide records, local commits and squash merge
only when Definition of Done holds. Preserve failures and do not claim completion.

## User constraint: provider/model approval (2026-10-29)

The user rejected treating `OPENAI_API_KEY` as a required feature setup step.
Reuse existing approved providers/models wherever their actual execution
capabilities fit. Any new provider or model requires explicit user approval
before onboarding/selection, not merely before paid activation. The previously
implemented optional OpenAI-only transcription route is an unapproved candidate,
not an accepted provider decision or launch prerequisite. Do not enable it,
request credentials for it, or claim transcription provider selection complete.
Existing adapter/tests are implementation evidence only, not user approval.
Reconcile provider-specific contracts/configuration and delivery claims before
final completion; retain audio playback, author-supplied transcripts and existing
speech generation independently. Exact current alternatives, including routes
through existing providers, require official capability/pricing/privacy research
and a concrete proposal before any new provider/model is added. Web search in
this turn failed at transport (HTTP405); no alternative was verified or selected.

## Editor UI remediation requested 2026-10-29

User screenshot exposes intrusive prerequisite messages above title, authoring
controls inside placeholder layout, and oversized disabled document-wide actions.
This is presentation remediation within existing AC2, not new feature scope.
Use document-first hierarchy: title/metadata/prose remain uninterrupted; compact
Add block menu after prose/empty starters, quiet library action, copy action only
when blocks exist; collapse block management and eligible audio preparation.
Reuse Menu, Button, Dialog and runtime semantic/geometry tokens. No automatic
content insertion, provider activation or changed publication semantics. Verify
blank/populated states, menu keyboard/dismissal, authoring/upload and 390/desktop
rendering through mapped browser journey; focused component checks and lint/types.

Editor verification checkpoint: actual registered browser run
7ae2418b-285a-4778-a846-d09798ddf778 passed2/2, no skips,37.2s after
private-learning readiness race fix. Source review then found UI-REV12:
conditional eligibility could unmount in-flight media widgets. Bounded
remediation must preserve widget hooks across draft eligibility changes and
keep confirmation/job/preview reachable; no paid provider call required for
regression proof. Do not claim final UI approval until this lifecycle fix and
its delayed-request regressions are reviewed and current browser reverified.
Original feature completion/build/full critical/approved transcription route
remain separate pending work.

Editor UI remediation final checkpoint: E44 now records final frozen-source
browser2/2/no skips (run c15aa822-b532-496f-99a1-879fd66faaa9), desktop/mobile
visuals, type/style/lint/docs checks, and targeted regressions. UI-REV10/11/12
remediated; both hint readiness and in-flight media preservation proved.
Original F059 status stays In progress; continue from outstanding feature-wide
gates and user-required provider/model approval, not a completed-feature claim.

## Reported owner-chat generation failure — 2026-10-29

User reports accepted queued Knowledge-chat turn followed by generic conversation
error and subsecond generation_failed, no model/tokens/output. Read-only local
metadata proves all four turns failed before provider_dispatched, approved
OpenRouter route and configured credential. Strict no-HTTP factory probe reproduces
Text AI provider execution snapshot unsupported: admission final budget maxCost
32831/reviewed rates125000/500000 differs original selection aggregate maxCost
400000/catalog rates1000000/3000000. Worker preserves final cost cap but resets
rates from stale snapshot; strict resolver correctly rejects mismatch. Do not
relax validation, increase allowance, replay failed turns or alter real data.

Fix final admission snapshot to contain final admitted aggregate budget, retaining
route/model identity/per-call caps/source and native accounting authority. First
retain failed production admission→worker/defaultfactory/MastraSDK→proposal/result
readback regression with only external HTTP fake. Prove Free operator without
customer tariff and Paid plus controlled provider failure/no customer charge.
Productioncomposition test closes existing gap (old browserfixture fake runner
and native tests manual lifecycle did not exercise this real seam). Validate
focused DB/accounting/provider cases, source/security review and registered AI
execution gate per critical regression matrix; mapped browser proves actual chat
authoring preview/apply path. Provider credentials/models remain unchanged.

Three GET block-proposals calls are read polling (initial+2s active interval), not
three provider submissions. Frontend generic error source is investigated
separately; no defensivesuppression without confirmed failing seam.

E45 verification checkpoint: source/security approved; production4/4, UI15/15,
backend finaltype1478 and web81215 pass. Read-only current-config factory57523
accepts fixed in-memory budget with HTTP0 (historical data unchanged). Core
critical21585/run59e374f4-e0b0-4c7e-b3eb-c073bf4d6cac has browser passes through
chat-lifecycle including new failure-copy/retry assertion and mobile proof;
backend67-suite stage ongoing. It found two Texts job-store failures (changed
version/stale scrub, explicit safe rate-limit retry/one hold). Private_translation
agent assigned read-only diagnosis and may reproduce on released exclusively
owned languon_auth_chat_execution_regression_test:55559, never critical DB.
No final global-gate claim until remediated/classified. Admin routing test-only
selector/virtual-option fixes still require separate rerun; registry orders flows
independently of requested order. After core: run admin flow separately and any
failed backend stage plus suffix speech/adminMCP as required. Full feature still
In progress; requested chat runtime/copy bug is fixed but final evidence pending.

E45 latest: secondaryTextsfind regression fixed with immutable-identity projection,
source/security approved; stale retry fixture uses explicit distinct authorized
fallback. FullTexts17/17 and finalbackendtype64868 pass. First67-suite report
745/748 with3failures retained. Final4-flow critical93135/run3962ac15-b74e-4349-
aa89-b74eb49595db running; admin2/2 passed,67/748executionstage in progress then
speech/adminMCP. Other10 browserflows already passed in59e374f4…; after final
4 succeed record union14 coverage and reviewer incident evidence approval.
Manifest12files62fb5c4ff8dd24ae752c29ce53c8a44e6e0130ca25614c8c83b5892e706efb58
verified by reviewer. Source frozen; no realuser changes/paidmodelcalls.

E45 registry checkpoint:3962 finished67/748 allpassed, but commandfailed on stale
unversioned sentence title. INC-REV14 fixed by requiring BOTH exact v1/v2 titles;
regression proves neither can disappear behind passing counts. Registry16pass;
preserved3962 report independently validates748. Final manifest13files
ed5b544c74a94061518662e92be08b2a663696b57b6d345e1955315b559acd4b.
Suffix47537/run0549232b… now reruns full backend dependency then speech/adminMCP.
Retain3962command as failed; admin2pass stillvalid. Await suffix + boundedreview.

E45 final gates green:47537 EXIT0, run0549232b… backend67/748, speech4, adminMCP3.
Union artifact revalidates14flows/774tests with raw report hashes; previousfailed
commands retained. Source manifested5b… unchanged, next-env restored/diffcheckpass.
Bounded incident implementation/verification complete; final reviewer approval
requested. F059 stillInprogress with previously recorded broader delivery work.

E45 bounded incident COMPLETE: independent final evidence approval received,
all14reports774tests revalidated plus browser/source hashes. No material scoped
finding. External liveprovider availability not tested; existingconfiguration
factoryready and deterministic productioncomposition proved. ParentF059 open.
