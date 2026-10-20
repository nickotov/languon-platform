# ExecPlan: Knowledge workspace

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-19

## Goal and specification

- Outcome and acceptance IDs: [FEATURE.md](./FEATURE.md), AC-1–AC-9.
- Execute on `feature/knowledge-workspace`; preserve existing interview document edits and finish under root feature Git policy.
- Accepted ADR-0042 extends ADR-0037 for working drafts, automatic note context and sharing; ADR-0037 historical text is retained.

## Existing architecture

- Knowledge owns saved notes, revisions and version-checked publication; its current contract requires summary, categories and languages. New note identity and working branches belong to this module.
- Conversations own source-bound private chats, durable turns, copied attachments and Mastra Observational Memory. Current draft snapshot admission and source excerpt projection are insufficient for complete workspace context.
- Web Knowledge detail currently switches between preview and editing, while `ContextualAssistant` docks through CompanionLayout. Extend those seams rather than duplicate chat or editor.
- Texts already has authorized owner reads; the workspace picker copies content when selected. Existing unlisted Text shares supply the fragment/header security pattern.

## Test and review strategy

- Unit/contract: optional metadata, title derivation, character boundaries, target mapping and attachment projection.
- Disposable PostgreSQL/Redis: schema migration, autosave races, save/revisions, copy/share/revoke, account/source erasure, conversation context and model accounting.
- Deterministic pinned Mastra SDK: compaction, full editor snapshot, exact historical recall and model budget failure without paid services.
- E2E and real browser: desktop/mobile workspace, multi-tab recovery, proposal acceptance, public copy and revocation. ADR-0016 requires real browser evidence.
- Affected lint/typecheck/build and guide checks. Independent completion and security reviews are required because persistence, public sharing, private data and model execution change. A separate tester is warranted if the cross-app concurrency journey introduces a new harness.

## User-flow documentation

- Create `docs/user-flows/knowledge-workspace.md` with browser/API journeys and stable IDs mapped to exact backend integration and web Playwright tests.
- Update `docs/user-flows/contextual-language-assistant-and-knowledge.md`; current mapped command `contextual-assistant`, backend file `apps/backend/tests/integration/modules/conversations/contextual-assistant.journeys.test.ts`, web file `apps/web/tests/e2e/contextual-assistant.journeys.spec.ts`.
- Inspect mappings before edits; validate both guides and execute reviewed mapped journeys with disposable fake data.

## Milestones

- [x] M1 — Contracts and persistence: note draft identity, working branches, optional metadata, share/copy, migration. AC-1, AC-3–AC-5, AC-9. Contract, migration and disposable DB integration checks passed.
- [x] M2 — Conversation/tutor: titles, complete editor snapshots, references, limits, compaction and proposal targets. AC-1, AC-2, AC-6–AC-9. Durable target anchor, strict admission and retry persistence now pass focused contract/backend and disposable DB checks; independent source remediation review passed.
- [x] M3 — Web workspace: editor/chat layout, recovery/conflicts, references, proposals, sharing, localization. AC-1–AC-8. Final guarded browser suite passed 10/10, including all seven Knowledge scenarios.
- [x] M4 — Cross-boundary journeys/docs and author preflight. AC-1–AC-9. Mapped E2E, guide checks, affected static checks, final build and diff inspection passed.
- [x] M5 — Independent completion/security review, remediation, final verification and feature merge. AC-1–AC-9. Final reviewer verdict is Pass with no material findings; local squash merge is the final Git operation.

## Current progress

- 2026-10-19 — Authorized plan, branch and feature workspace created. Existing design-doc edits preserved. ADR-0042 accepted and indexed. Shared contracts/environment, Knowledge and Conversations persistence/API, web workspace/chat, migration and mapped E2E are implemented.
- Contracts, Knowledge/Conversations disposable PostgreSQL integration, focused web/Mastra tests, root lint and root typecheck passed. Security review resolved three findings and reports no remaining material issue. Desktop, mobile and signed-out recipient browser journeys passed.
- The architecture diagram catalog was reconciled and stamped against reviewed sources. `pnpm diagrams:check` passed; the local viewer rendered the Knowledge flow at desktop/mobile widths, exposed source inspection and produced no console/request errors.
- Initial independent completion review identified R-1 durable proposal targeting, R-2 missing conflict/proposal browser proof and R-3 restore-with-unsaved-branch deadlock. R-1/R-3 code remediation passed bounded independent source review. Knowledge restore/store/migration 32/32, Conversations store 31/31, focused target validation 19/19, web Vitest 761/761, and root lint/typecheck passed.
- R-2 browser cases were added and passed individually, then the full guarded suite passed backend 4/4 and Playwright 10/10. The new guide maps all seven Knowledge scenarios. Post-format full build passed 9/9, lint passed, and diagram/guide checks passed; reviewer closure is underway.
- Independent final remediation review returned Pass with no material finding and captured the final source patch; only verdict and feature bookkeeping changed afterward. Commit and squash-merge locally.

## Decisions and discoveries

- D1 — Keep one note ID from empty draft to published note. Add draft status and working branches in Knowledge rather than a second document identity. Alternative separate workspace entity duplicates source and revision lifecycle. ADR-0042 impact.
- D2 — Copy Text content at selection time and freeze editor plain text at Send. Tutor receives full current workspace text; other source chat behavior is preserved. Alternative live IDs/excerpts violate AC-6/AC-7. ADR-0042 impact.
- D3 — Share only saved note DTO through unlisted locator and fragment key, checked on each read/copy. Alternative owner workspace DTO risks exposing drafts/chats. ADR-0042 impact.
- D4 — Persist an editor target anchor with each workspace turn, even for an ordinary reply; an optional proposal mode alone requests editor-ready output. The anchor uses UTF-16 offsets into the exact frozen plain-text snapshot and its SHA-256 UTF-8 digest. Backend validation binds target text/offsets to that snapshot; web maps the live target through editor transactions and conservatively compares after recovery. This closes review finding R-1 without turning ordinary tutor replies into proposals.

## Validation links

- Acceptance-to-proof mapping and checks: [EVIDENCE.md](./EVIDENCE.md).
- Review boundary, findings and verdict: [REVIEW.md](./REVIEW.md).

## Remaining work

- No implementation work remains. The local squash merge is the final delivery operation.
