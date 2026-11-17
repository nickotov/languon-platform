# Evidence

Status: Complete — selected verification gates passed and independent evidence approved.

## Scope and environment

Feature branch `feature/composable-lesson-generation`, based on `ab2c5ebb`; implementation contracts began in `6b9a5800`. All automated model execution uses deterministic fake external HTTP or adapters. No paid provider was called. Verified implementation commits: `6b9a5800` (contracts), `5a114cbb` (web), `f9896f6f` (backend, persistence, grants and tests). Final frontend ownership/style remediation is commit `8103ee26`; subsequent edits are delivery documentation and inspected diagram freshness only.

Disposable integration target: loopback PostgreSQL port 55498, database `languon_auth_lesson070_test`, Redis port 56498 DB 1. Separate browser target: PostgreSQL port 55444, database `languon_auth_assistant_web_test`, Redis port 56444 DB 1. Guarded `ALLOW_DISPOSABLE_*` and exact confirmation variables were supplied. No test reset targets the normal development database.

## E1 — Contracts, authoring and unit regressions

- Contract worker: 110 focused plan/run, mixed-content proposal, interactive-body and named-exercise checks passed, with scoped typecheck/lint. Follow-up captured provenance and editor-selection contract suites passed. Root rebuilt `@languon/contracts` and `@languon/prompts` successfully after the final schema/prompt changes.
- Root focused backend selection: 8 files, 137 tests passed (`/tmp/lesson070-final-unit.log`): authoring, request resolution, accounted-model gate, generation stages, capacity, source capture and deterministic fixture boundaries.
- Proposal/workbook copy: 19 tests passed (`/tmp/lesson070-copy-tests.log`), including captured historical identities that collide with inserted local block IDs.
- Web run/source controls: `pnpm --filter @languon/web exec vitest run tests/lesson-generation.test.tsx tests/lesson-source-refresh.test.ts` — 14 passed. Covers explicit quote confirmation, no automatic reconnect dispatch, free Apply plan, source capture, expired quotes, and capacity failure disabling Continue while retaining Adjust/Refresh.

## E2 — Real persistence, production composition and accounting

Root runs use `pnpm --filter @languon/backend exec vitest run <selected files> --no-file-parallelism --hookTimeout=30000 --retry=0` with the disposable target above.

- `tests/integration/modules/conversations/conversation-action-accounting.test.ts`: 23/23 passed within `/tmp/lesson070-db-core.log`. That combined command had failures in other files; it is not reported as an entirely passing command. Covers customer-funded cumulative rounding, operator/free separation, stopped/failed actions, receipt eligibility and meter validation.
- `tests/integration/modules/conversations/generation-checkpoint-accounting.test.ts`: 2/2 passed within `/tmp/lesson070-db-focused3.log`. Real SQL proves checkpoint plus receipt/event commit before Stop charges the eligible stage, and injected publication failure rolls back artifact/eligibility/event before Stop. A separate production incident fixture failed in that historical combined run and was repaired and reverified below.
- Final `conversation-store.test.ts` and `conversation-production-execution.test.ts`: all 89 tests passed within `/tmp/lesson070-db-final.log` (70 store, 19 production). The third migration fixture in that command failed and remains separately tracked. Production coverage retains the French/Russian reading + three comprehension exercises + COD/COI grammar + four grammar exercises, real admission/default worker/provider SDK with fake HTTP, bounded homogeneous calls, paused continuation and settlement. Store coverage includes live source edit/delete → Keep snapshot → Continue → publication → Insert, canonical proposal authority, stale writes and lifecycle.
- Non-vacuous privacy regressions seed semantic task IDs, source snapshots, artifacts, plan revisions, a revision candidate and a hidden proposal before discard; all private run content is removed/tombstoned. Separate production regression seeds pending source blocks and proposal IDs before run start, verifies atomic transfer clears pending memory while retaining proposal catalog/unrelated memory, then checks Stop/discard. Another real worker case checks memory immediately after start, after budget pause and after discard.
- Minimum-next-unit admission checks passed in `/tmp/lesson070-store-final.log`; this prevents spending on an action that cannot complete even one pending unit. The two Keep-source test fixture failures in that historical combined run were subsequently fixed and passed, then included in the final 89 above.
- Migration-preservation regression: `conversation-content-proposal-migration.test.ts` stages the real 0171 schema, seeds an old proposal and applies 0172+ twice. It verifies retained IDs, ordered content, target/dependency snapshots and application receipts. Passed together with the Apply revision regression: 2/2 in `/tmp/lesson070-final-gaps.log`, using `-t 'legacy proposal identity|applies reviewed plan revisions|refreshes changed'`. The Refresh test did not match that filter and is verified separately below. Initial fixture binding/transaction-guard failures were fixed; production migration SQL did not change for those fixture repairs.
- Apply revision real-DB test in `conversation-store.test.ts` passes in `/tmp/lesson070-final-gaps.log`: order-only artifact reuse, changed task and descendant invalidation, independent progress, optimistic revision checks, idempotency, unchanged turn/action/quote counts and no admission during Apply. Refresh source passes separately: 1/1 (71 unrelated tests skipped), `/tmp/lesson070-refresh-final.log`, filter `captured source.*invalidates`. It verifies exact new source snapshot, preserved snapshot history, descendant invalidation, retained independent progress, CAS/idempotency and no execution admission. These close AC-8/9 persistence evidence gaps.

## E3 — Browser and rendered interface

`pnpm test:e2e:contextual-assistant -- --grep 'paused composable lesson|capability replies stay|fifty shopping words'` with separate guarded services: **3/3 browser journeys and 4/4 HTTP prerequisites passed**, `/tmp/lesson070-e2e5.log`.

The new mapped journey proves a paused lesson continues from checked stages, completes one mixed proposal, inserts prose and four custom blocks, and survives explicit Save/reload. Existing mixed-content and fifty-word vocabulary generation journeys passed. Earlier fixture failures (duplicate synthetic exercise questions, obsolete labels, modal still open during Save) were repaired without weakening production assertions.

Independent UI reviewer used the safe pinned browser at desktop 1440px EN/light and mobile 390px RU/dark. Reviewed paused/expanded/running/stopped/completed/reconnecting/error/source-choice/revision/quote states and mixed preview. No blocking or major finding; localized quote/discard close labels were fixed afterward. No browser JS errors. Representative screenshots:

- `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794858354613.png` — mobile source choices.
- `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794858407912.png` — revision review.
- `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794858492927.png` — mixed preview.
- `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794858599215.png` — desktop budget dialog.

Stories demonstrate presentation; the database/browser journeys above demonstrate behavior. Storybook's automatic prop-doc extraction was disabled after it stalled transformation at full CPU; component stories remain the source of explicit controls/examples.

## E4 — Static, documentation and architecture

- Backend production build passed (`/tmp/lesson070-backend-build.log`); web production build passed (`/tmp/lesson070-web-build.log`), including web TypeScript and static page generation.
- Final `pnpm --filter @languon/backend typecheck` passed after new test additions (`/tmp/lesson070-backend-tsc-final2.log`); scoped ESLint/readability checks pass (`/tmp/lesson070-lint-final.log`). Prettier applied only changed maintained files; `git diff --check` passes. Generated Next declarations were restored after build.
- `pnpm docs:user-flows:check` passed: 36 guides, 16 tooling tests. `pnpm user-flow:e2e -- check` passed separately for `knowledge-workspace`, `interactive-workbooks`, and `contextual-language-assistant-and-knowledge`.
- All 10 architecture diagrams current after inspected-source stamping. Independent docs worker rendered six changed views with the safe browser, checked selection/zoom/source disclosures; empty console/errors, local 200/204 responses. Dense diagrams require zoom/scroll. Representative screenshot `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794860336802.png`. Viewer/browser closed after verification. Final inspected-source freshness check passed again after the revision/migration tests were added (`/tmp/lesson070-diagrams-stamp-final.log`); only the affected conversation diagram review date advanced.

### Final frontend convention remediation

`pnpm --filter @languon/web styles:check` initially identified component-folder ownership, story dimension literals and a diagnostic ID matching the utility-class detector. Commit `8103ee26` fixes those conventions: components and styles have dedicated folders, exact story widths use existing tokens, and only the diagnostic fallback ID changes. The style gate and scoped ESLint pass. `pnpm --filter @languon/web exec vitest run tests/knowledge-content-proposals.test.tsx tests/knowledge-proposal-audio.test.tsx tests/knowledge-proposal-refresh.test.tsx tests/lesson-generation.test.tsx` passes all 30 tests across four files (worker tool session 94482, completion 3a332f). Final web build (including TypeScript) exits 0: `/tmp/lesson070-web-build-final.log`. Generated Next declarations were restored.

Independent reviewer compared the moved component bodies and used CSS with `9df92432`: behavior and rendered declarations are unchanged; only four unused selectors were removed. The 420/768px story widths remain identical. Prior real-browser evidence therefore remains valid; no redundant browser rerun was required. Bounded remediation review is approved.

## E5 — Readiness and live proof

Baseline `pnpm dev:doctor -- --capability conversation --json`: exit 0, `ready:true`, `/tmp/lesson070-baseline-doctor.json`.

After the migration-preservation test passed, `pnpm db:migrate` succeeded against the configured local development database (`/tmp/lesson070-local-migrate.log`). Final `pnpm dev:doctor -- --capability conversation --json` exited 0 with `ready:true` (`/tmp/lesson070-final-doctor.json`): migration hashes, routing, configured credentials, prices, tariffs, budgets and fresh worker capability pass. No new environment variables are required. Earlier pre-migration readiness correctly reported four pending migrations.

No paid live-provider proof is claimed. Feature scope excludes a paid smoke; deterministic production-composition evidence and local configuration readiness remain distinct.

## E6 — Independent review

See [REVIEW.md](REVIEW.md). Source remediation findings are closed. Security evidence is approved. All selected gates now pass. Final completion reviewer approved the identified implementation commits on 2026-11-17; no implementation or verification gap remains pending.
