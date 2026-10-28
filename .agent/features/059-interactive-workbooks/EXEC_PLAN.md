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
shared saved-only reads and independent copies. Current document contracts and
normalization are rich-text-only; every reader/writer must be traced before
adding nodes. Entry seams include `packages/contracts/src/contextual-assistant.ts`,
web `features/knowledge-notes`, backend `modules/knowledge` and
`modules/conversations`. Existing dictionary/text practice remains authoritative.

Speech generation is dictionary-authorized; a knowledge source must receive its
own authorization path. Audio transcription was not found in scoped discovery.
Storage primitives exist but independent knowledge-media ownership does not.
Texts use aligned source/translation pairs; append must preserve alignment.

Architecture discovery and provider research are pending. Relevant indexed ADRs
for full review before design: 0002, 0005, 0016, 0019, 0022, 0024, 0027, 0029,
0031–0037, 0041–0043 and 0045–0049. ADR-0042 needs explicit partial supersession
for shared-reader AI and media, not an in-place decision rewrite. Current
accepted contracts remain binding until the new decision is recorded.

Parent architecture findings: use an additive version-2 document contract while
preserving the exact version-1 parser. The legacy `propose_knowledge_note` tool
must retain its version-1 schema even if the general document type widens.
Knowledge owns workbook/copy operations; learner state remains separate and media
requires typed ownership. Standalone block contracts are the first code slice;
ADR-0050 is being drafted independently and is not accepted by this record.

## Risk matrix and first proofs

| Seam | Invariant / early proof | Required final layer |
| --- | --- | --- |
| Structured content and all writers | Schema expansion cannot widen AI write authority; malicious markup never executes | Contract tests, browser XSS tests, security review |
| Workbook access/media/copy | Live authorization; copies survive original deletion; drafts remain private | Real PostgreSQL transactions and concurrent lifecycle tests |
| Exercise revisions | Material changes isolate old attempts; cosmetic edits retain progress | Domain tests and persistence integration |
| Private learner state | Owner has no reader activity access; revoke/delete applied consistently | API negative authorization and E2E |
| AI generation/translation/evaluation/transcription | Production composition uses bounded action budgets, deadlines, cancellation and settlement | Regression matrix and full critical gate |
| Library publication | Idempotent atomic publication with valid text alignment | Transaction/retry/concurrency tests |
| UI/editor | Recoverable drafts and accessible responsive reusable blocks | Real browser, existing workspace journeys |

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
skills before execution. Initial contract/writer checks are recorded in EVIDENCE.md; runtime and final
feature gates have not run.

## User-flow documentation and E2E

Create `docs/user-flows/interactive-workbooks.md` with proposed stable scenarios:
`author-blocks-publish`, `workbook-order-share-copy`, `shared-private-practice`,
`exercise-version-history`, `library-copy-append`, `audio-transcript-hints`,
`revocation-deletion-media-copy`, `hostile-content-rendering`.
New exact test files/registered command must be selected after composition setup;
these names are planned coverage, not executable evidence.

Existing metadata mappings discovered (inspect through `pnpm user-flow:e2e --
inspect <slug>` before changes; read full affected guides):

| Guide | Command ID | Exact primary test files |
| --- | --- | --- |
| knowledge-workspace | contextual-assistant | apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts |
| contextual-language-assistant-and-knowledge | contextual-assistant | apps/backend/tests/integration/modules/conversations/contextual-assistant.journeys.test.ts; apps/web/tests/e2e/contextual-assistant.journeys.spec.ts |
| texts | texts | apps/backend/tests/integration/modules/texts/texts.journeys.test.ts; apps/web/tests/e2e/texts.journeys.spec.ts |
| flashcard-training-web | web-playwright | apps/web/tests/e2e/flashcard-training.journeys.spec.ts |
| sentence-practice-web | web-playwright | apps/web/tests/e2e/sentence-practice.journeys.spec.ts |
| shared-pronunciation-playback | shared-pronunciation-playback | apps/web/tests/e2e/shared-pronunciation.journeys.spec.ts; flashcard/sentence files above; apps/admin/tests/e2e/admin-user-management.journeys.spec.ts |
| ai-accounting | ai-accounting | apps/web/tests/e2e/ai-accounting.journeys.spec.ts; apps/web/tests/e2e/ai-legacy-budgets.journeys.spec.ts; apps/web/tests/e2e/learner-portrait.journeys.spec.ts; apps/admin/tests/e2e/admin-user-management.journeys.spec.ts |

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
- Current work: foundational learning-block contracts and legacy-writer boundaries
  have initial passing checks (E1–E4); architecture/provider discovery continues.
  M1 remains incomplete without version-2 runtime integration, UI and database proof.
- Next action: keep `BoundedDocumentSchema` exactly version 1 and introduce a
  separate future version-2 parser; guard legacy whole-note proposals targeting
  version-2 notes, then integrate the runtime document/editor/persistence paths.
  Resolve media-copy and transcription assumptions before dependent slices.

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

All runtime ACs, architecture decisions, provider research, migrations, UI,
execution wiring, guide updates and verification remain. No external blocker is
established yet; unverified credentials/provider readiness are research items.
