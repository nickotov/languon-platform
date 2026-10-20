# Verification evidence: Knowledge workspace

Updated: 2026-10-19

## Acceptance coverage

| ID   | Implementation                                                        | Evidence                | Current result                                                                         |
| ---- | --------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| AC-1 | Private draft, stable ID, first-message naming, library Draft state   | E-1, E-2, E-3, E-5      | Draft/chat/Save/reopen browser journey passed.                                         |
| AC-2 | Reused assistant, responsive editor, private conversation list        | E-3, E-5                | Desktop and mobile browser journeys passed.                                            |
| AC-3 | Versioned working branches and explicit conflict resolution           | E-2, E-3, E-5           | PostgreSQL race, recovery tests, two-tab conflict and restore browser journeys passed. |
| AC-4 | Explicit Save/revision and independent working copy                   | E-1, E-2, E-5           | Persistence, draft/Save/reopen and revision journeys passed.                           |
| AC-5 | Saved-only share, recipient copy, revocation                          | E-2, E-5, E-6           | Store/route/security and signed-out recipient browser journey passed.                  |
| AC-6 | Full editor snapshots, focus, bounded Mastra history                  | E-1, E-2, E-4           | Deterministic application/runner tests passed.                                         |
| AC-7 | Copied Text lookup, character and model budget gates                  | E-1, E-2, E-3, E-4, E-5 | Boundaries, owner scope and exact-limit browser picker journey passed.                 |
| AC-8 | Explicit editor proposal and mapped target                            | E-3, E-5                | Editor tests and persisted-target browser compare/replace/undo journey passed.         |
| AC-9 | Existing context, revisions, deletion, streaming, model/credit bounds | E-2, E-3, E-4, E-5, E-6 | Focused regressions and final combined guarded suite passed.                           |

## Check records

### E-1 — Contracts and static checks

- `pnpm --filter @languon/contracts test -- contextual-assistant.test.ts`: 123 passed, including a 40,000-character Unicode reference boundary.
- `pnpm lint`: passed full workspace after final formatting. `pnpm typecheck`: passed 14 tasks across 10 workspaces after the last behavioral edits. `pnpm build`: passed 9/9 after final formatting, including the web production build and backend declaration build.
- Repository-wide `pnpm format:check` reports 170 pre-existing unrelated formatting failures. All changed and new format-supported files pass a scoped `prettier --check` after final formatting.

### E-2 — Disposable database and backend

- Isolated PostgreSQL on loopback port 55447: final Knowledge restore/migration/store group 32/32, with earlier post-security Knowledge store/HTTP and account-deletion/Knowledge groups each 18/18. The disposable container was stopped and removed; ordinary development data was untouched.
- Conversation store integration 31/31 after durable target persistence and frozen retry. Tests cover owner-scoped Text references, immutable copied material, draft snapshots, share read/copy/revoke and account-deletion link invalidation. The revoke/read race has a deterministic PostgreSQL concurrency test. A final rerun after a narrow retry null-anchor guard could not connect because the disposable service had already stopped; focused validation and backend typecheck pass on that last change.
- Guarded contextual-assistant backend API journeys passed 4/4 in the final combined command. A flaky fixture poll was repaired to wait for the admitted target turn rather than one global worker tick; its focused regression passed 2/2.

### E-3 — Web and editor

- `pnpm --filter @languon/web test`: proxy test 1/1 and Vitest 761/761 across 109 files on remediated source. Web typecheck, lint and style contract passed; root lint and typecheck also passed after R-1/R-3.
- Focused tests cover proposal target mapping/undo, recovery, conversation title editing and transport projection.

### E-4 — Tutor admission and deterministic model behavior

- Focused runner/unit group passed 37/37; security boundary group passed 5/5. Remediated editor target validation/runner unit group passed 19/19. Workspace turns count every copied body regardless of client supplied kind, freeze unsaved editor text and target, and reject oversized editor/reference/model input before generation. Mastra tests use local fixture models without paid calls.

### E-5 — Guarded real-browser journeys

- `pnpm test:e2e:contextual-assistant` uses disposable PostgreSQL `127.0.0.1:55444/languon_auth_assistant_web_test`, Redis `127.0.0.1:56444/1`, synthetic accounts and real web/backend/worker processes.
- Final `pnpm test:e2e:contextual-assistant` exited 0: backend API journeys 4/4 and Playwright journeys 10/10 in 1.7 minutes. Seven Knowledge journeys cover draft/chat/Save/reopen, two-tab conflict and Resolve, restore with unpublished branch/re-Save, the exact 40,000-character reference boundary and atomic rejection, persisted proposal target comparison/replacement/Undo, saved-only share/recipient copy/revocation, and the mobile tutor sheet. The other three journeys retain contextual assistant and Knowledge revision coverage. The browser suite checks console errors and failed requests.
- Before the combined run, focused guarded remediated journeys each passed 1/1 with backend fixtures 2/2: conflict, restore, Text boundary and proposal target. These isolate the reviewer’s R-2 coverage concern.

### E-6 — Security and diagrams

- Independent security review verified repairs for share read/revoke race, deletion-cancellation link revival and attachment-kind budget bypass. No unresolved material security finding; see [REVIEW.md](./REVIEW.md).
- `pnpm diagrams:check -- --stamp` after reviewing source inputs, then `pnpm diagrams:check`: all nine diagrams current after final source formatting. The local read-only viewer rendered the Knowledge diagram at 1440×900 and 390×844. Source inspection opened, diagram labels appeared in its accessible view, and the browser reported no errors, console messages or failed requests. Viewer/browser sessions were closed. At fit the dense flow is small; zoom/scroll expose detail.

## User-flow evidence

- New [workspace guide](../../../docs/user-flows/knowledge-workspace.md) maps seven stable browser scenarios to `apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts` and the guarded `contextual-assistant` command; status is `current` with `last_verified: 2026-10-19`.
- Updated [contextual assistant guide](../../../docs/user-flows/contextual-language-assistant-and-knowledge.md) retains established scenario IDs and direct-edit revision behavior.
- `pnpm user-flow:e2e -- check knowledge-workspace`, `pnpm user-flow:e2e -- check contextual-language-assistant-and-knowledge`, and `pnpm docs:user-flows:check` passed after the final scenario mapping and combined browser run.
- [BL-006](../../../docs/backlog/006-grammar-conversations-and-learning-documents.md) stays `in-progress`: exercise generation and guided lesson flows remain future scope.

## Tested state and remaining gaps

Checks ran on uncommitted `feature/knowledge-workspace` based on `main` commit `ed2b7b1d9a9490a259197bc7c2ea1af1913da093`. The final patch manifest/hash and reviewer verdict are in [REVIEW.md](./REVIEW.md). Browser and database results are reused across formatting-only web changes; no behavior changed after their runs. The broad backend Vitest command could not run meaningfully without its default PostgreSQL service; its affected suites instead passed with disposable PostgreSQL and the guarded E2E fixture. The Next-generated `apps/web/next-env.d.ts` was restored to the tracked source after the production build.

Findings and verdict: [REVIEW.md](./REVIEW.md).
