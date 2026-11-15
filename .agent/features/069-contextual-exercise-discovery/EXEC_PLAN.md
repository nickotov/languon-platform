# Execution plan: contextual exercise discovery

## Goal and specification

Implement FEATURE.md AC1–AC7. Base main 1cf5933d, clean. Branch
feature/contextual-exercise-discovery. Related BL-006/007 remain in-progress; this is a contextual discovery slice, not
completion of their broader requirements. ADR-0059 records prompt mention semantics.

## Milestones

- [x] M1 — Record approved scope, ownership, interfaces and selected verification.
- [x] M2 — Shared preview corpus/presentation and contextual picker primitives.
- [x] M3 — Editor slash/actions, manual form and chat preparation integration.
- [x] M4 — Inline composer/contracts/admission/persistence implemented; final integration evidence in M5/M6.
- [x] M5 — Focused tests, docs, source/security review and remediation.
- [x] M6 — Required final browser/DB/static/build gates and evidence approval.

## Ownership and interfaces

Root: artifacts/ADR/guides, integration, final verification, commits/merge.
Backend worker: packages/contracts and apps/backend typed mentions/persistence/
activity constraints. Preview worker: entities/learning-blocks reusable examples
and preview; generic shared picker. Editor worker: features/knowledge-notes slash
and action wiring. Chat worker: widgets/contextual-assistant inline composition.
No overlapping ownership; coordinate public interfaces before integration.

Typed prompt metadata: optional promptMentions alongside content; non-overlapping
UTF16 start/end ranges, discriminated exercise(activityId/catalogVersion) or
block(blockId). Labels come from content ranges and carry no authority. Existing
blockReferences derive uniquely from source chips/selected contexts, max8. Typed
exercise IDs constrain generation only, default one/type absent prose quantity.
Contracts owner defines and exports Zod-derived shared types and tests first.

## Verification selections and estimates (before implementation)

Focused package/backend/web unit and contract tests, seconds per batch. Disposable
PostgreSQL migration/message admission/history/retry/authority tests, minutes.
Retain production-composition regressions for changed admission/prompt seams with
fake external HTTP; no paid services. Web/backend lint, types and builds, minutes;
one root owner, no concurrent Next build/typecheck or DB resets. Existing guarded
workbook-guide, chat-lifecycle, knowledge-document-formatting and affected
knowledge generation/reference browser flows plus new mapped slash/mention
journeys at desktop/mobile, minutes including disposable setup. Pin precise new
scenario selections after tests exist; no full regression aggregate.
Real-browser evidence via pinned wrapper or valid real-app E2E and rendered
ui-designer critique. Independent source and material model-input security review
after focused preflight; final evidence approval after final gates.

## User-flow documentation

Update knowledge-workspace, interactive-workbooks,
contextual-language-assistant-and-knowledge and workbook-guide. Preserve IDs,
update revision markers and source mappings. Validate docs:user-flows:check and
user-flow:e2e check on affected guides; execute mapped relevant journeys.

## Progress / next action

2026-11-15: Implementation, all selected final runtime/static/build gates and
source/rendered/security reviews pass. Independent final evidence approval is granted; no further implementation or
verification remains. Local delivery follows the authorized squash-merge policy. See EVIDENCE.md/REVIEW.md.

## Decisions and discoveries

D1: Extend approved existing UI patterns; no new palette/runtime dependency.
D2: Extract reusable preview below page layer into learning-blocks entity.
D3: Persist typed ranges beside canonical text; source labels never authorize reads.
D5: Server-rendered guide adapters use the dedicated public learning-blocks/examples
entrypoint, which exports pure fixtures/labels only; interactive UI stays in the
main entity exports. Production webpack enforces this separation.
D4: User explicitly selected both Generate and manual Custom, shared sources and
prompt-controlled quantities. Keep current AI budgets/publication authority.

## Validation and remaining work

All acceptance criteria and required gates pass. Independent final evidence
approval is recorded in REVIEW.md. No implementation/verification work remains.
Local delivery uses one squash commit in main, retaining the feature branch and
its stage commits. No push or branch deletion. Existing contract-release blocker
is retained; no deployment/live-provider quality claim. Retrospective follows
user acceptance and does not delay delivery.
