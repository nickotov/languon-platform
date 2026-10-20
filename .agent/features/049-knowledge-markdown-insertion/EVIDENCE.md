# Evidence: Knowledge Markdown insertion

Base: 297aa42 (starting HEAD; includes the user’s three committed CSS adjustments after c3091de). Checked source/dependency/test identity is recorded in verified-source-sha256.json after final verification. Tests use synthetic local data and deterministic provider boundary, no paid service or user credentials.

## Acceptance mapping

| Criterion | Evidence                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MD-1      | U1 parser/editor/preview regression tests; B1 rich French editor/preview/table rendering.                                                                                      |
| MD-2      | U1 unsupported/unsafe/Unicode/ragged-table bounds; prospective complete document and plugin-added trailing paragraph node-limit rejection; conflict fallback tests.            |
| MD-3      | U1 inline fitting/target guards/conflict format/undo; B1 original-target review and mobile fallback acceptance.                                                                |
| MD-4      | B1 working recovery, Save/reload and public rich rendering; B2 existing recipient copy/privacy/revocation; S1 static checks; independent completion and security reviews PASS. |

## Checks

- U1: `pnpm --filter @languon/web exec vitest run tests/proposal-markdown.test.ts tests/knowledge-markdown-insertion.test.tsx tests/knowledge-editor-initialization.test.tsx tests/workspace-proposal-review.test.tsx tests/workspace-proposal-conflict.test.tsx tests/proposal-target.test.ts tests/editor-target-anchor.test.ts tests/knowledge-safe-rendering.test.tsx tests/knowledge-workspace-recovery.test.tsx` — **78 tests /9 files pass**, final candidate including plugin-added paragraphs and filtered transactions. No mock parser or editor; JSDOM geometry supplied only where absent.
- S1: `pnpm lint`, web/backend `typecheck`, production `pnpm --filter @languon/web build`, `git diff --check` — pass. Build passed after final candidate hardening. Backend source untouched; fixture branch selection only.
- D1: `pnpm docs:user-flows:check` —16 validator tests and25 guides pass; `pnpm user-flow:e2e -- check knowledge-workspace` — pass, revision209ef26f5a2bc963. Existing guide extended with workspace-markdown-insertion, no new journey harness/command. Contextual guide points to workspace and its existing behavior is unchanged; full mapped contextual journeys executed too.
- B2: Full `pnpm test:e2e:contextual-assistant` with the guide's explicit confirmed loopback PostgreSQL55444/languon_auth_assistant_web_test and Redis56444/1 — backend4 tests pass; browser **10 pass /1 pre-existing responsive failure**, including new Markdown success. Existing two-tab recovery, restore conflict, reference limits, original target, sharing/copy/revocation, mobile tabs and contextual streaming/accounting remain covered. No tests weakened/skipped. Failed initial Markdown test clicked the earlier reply before second reply completed; changed synchronization to await the new code response and two completed proposal buttons, then it passed.
- B1: Final focused real-browser rerun **3/3 pass** (27.7s), plus4 backend preflight tests, with `-- --grep 'Markdown replies|persisted tutor proposal|workspace switches between mobile'`. Same safe runner and services, Desktop Chrome at1440×1000 and mobile390×844; tests assert no page errors/unexpected500s. The new scenario proves formatted preview and H1 notice, live H2/bold/italic/list/table nodes, one-step undo/redo, private recovery/reload, explicit Save and rich public saved rendering, then mobile unsupported-code-block rejection and explicit plain-text fallback. Existing proposal scenario covers original-target mapping and comparison.

## Baseline failures and evidence limitations

- Original empty-workspace layout test fails at verifyDesktopPaneSizing line307 during the1023px overlay containment check. Reproduced with **all task-changed tracked frontend runtime files temporarily restored from c3091de**, while retaining unreferenced new files/dependency. Those files are identical at starting HEAD297aa42 (its changes are exclusively the three retained CSS files), so this reconstructs the actual baseline297aa42 runtime. Same assertion/location failed. Every changed runtime file was restored byte-for-byte in a finally block. The layout/control CSS and implementation are unchanged by this feature. This is an existing baseline issue, not a passing full-suite claim.
- `pnpm --filter @languon/web styles:check` reports10 untokenized lengths in unchanged workspace-controls.module.css and companion-layout.module.css; changed proposal CSS yields no violations. Both files exactly match starting HEAD297aa42. Existing peer dependency warnings also remain unrelated.
- Initial production build was started beside browser tests; Next cleanup collided with ignored Playwright output under .next. Reran build serially after runner completion and it passed. Final visual evidence will be retained outside ignored build output.
- Official package remains beta; no claim of arbitrary Markdown feature completeness. Source and resulting document limits are enforced without truncation. No media/formula/code-block nodes or general Markdown paste were added.

## Retained runtime evidence

Final deterministic Chrome run retained [formatted desktop preview](runtime/formatted-preview.png) and [mobile literal fallback](runtime/mobile-literal-fallback.png). Checked new heading and formatting notices, formatted headings/paragraphs/marks/tables, enabled/disabled acceptance and fallback control. Console/page exceptions and unexpected500 responses are asserted by the maintained journeys; no new external network requests are introduced. Full runner run ID assistant-mvgnz6kd; baseline reproduction assistant-mvgo3e1n. Final scoped run retained source-identical acceptance paths plus plugin preflight.

Author preflight complete: all four criteria mapped, scoped diff inspected, existing JSON/public API unchanged, guide traceability current, no generated output intended for commit.78 focused tests and final3 browser journeys pass; only proven unchanged baseline layout/style failures remain. Independent completion/security reviews PASS; findings and remediation in REVIEW.md.

Author security hardening: the original quote-prefix regex exceeded a1-second worker-thread deadline on80k bounded adversarial whitespace. Replaced it with a linear prefix scanner, and added a full parser rejection regression.78 focused tests pass after this change; final build/browser revalidation recorded below when complete.

## Review remediation

MD049-R1 (Medium): empty heading/list/link constructs could yield no meaningful rich content; token-only detection also missed decoded whitespace entities. Addressed by rejecting empty heading/link tokens and validating decoded heading/list subtrees and contiguous link-label spans before normalization. This preserves valid synthetic nested-list tokens with no `.text` field and links with several formatting marks/space spans. Added raw/decoded empty constructs, used/unused references, valid marked labels and actual editor atomic-rejection/literal-fallback coverage.78tests/9files pass. Root cause was checking lexical source instead of parsed visible-content semantics; remediation now checks both appropriate boundaries rather than maintaining an entity decoder.

Definitions follow standard Markdown metadata resolution; original raw Markdown remains in private chat. The adapter additionally rejects definition destinations absent from any link. Duplicate metadata that Marked consumes is not promised as lossless document source; no visible supported prose is truncated.

Final remediation verification:78tests/9files, final production build (5.9s TypeScript phase) and affected ESLint pass after decoded-content checks. Final Markdown browser rerun:1pass (15.6s) and4 backend preflight tests pass on the exact final source manifest; screenshots refreshed from this run. Previous3 browser proofs remain valid for unchanged valid input/target/layout paths: subsequent parser changes only add unsupported-input rejection, with exhaustive new guard cases at parser/editor layers. All28 source/test/dependency hashes match final reviewer state.

Local review complete. No source, migration, environment, external-service or package-version verification remains. Local Git integration completed: feature commit ea5280c, conflict-free squash onto main, with final status prose updated for the main commit. No push or branch deletion.

Final integration identity: implementation/test/dependency bytes are identical to feature commit ea5280c and the28-file verified manifest. The squash changes no reviewed source. Local main retains starting297aa42 user CSS unchanged. Final documentation-only status changes do not invalidate runtime/static/browser evidence.
