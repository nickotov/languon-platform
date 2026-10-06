# Evidence: Sentence practice assistance

## Scope and current status

Backend checkpoint in progress; frontend and overall feature are not complete. Branch feature/sentence-practice-assistance, base e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a. Preserve pre-existing uncommitted maintenance patches; no commit/merge/push performed. Baseline completed local-default/dialog/idiomatic/reliability records remain independent.

## Automated evidence (2026-10-05)

- Contracts: 78 tests across 10 files pass, including version-aware hint inventory/association, unchanged legacy content, malformed hybrids and 43 disclosed AI-hint IDs. Free reference request remains unchanged.
- Backend focused learning/configuration/worker-observation suite: 141 tests across 11 files pass. Subsequently added source-script and full-reference protection passes in 20 domain tests including 7 contextual cases. The newly added fixture explanation was corrected and final backend typecheck passes.
- Contextual domain examples prove whole idiom segmentation, independent dictionary coverage, repeated lexical hint reuse with separate occurrences, 40-extra bound, grapheme integrity, v1 compatibility, mandatory useful v2 assistance and reference privacy.
- Provider boundary tests prove v2 schema dispositions and local aliases while v1 schema stays exact. Prompts package five tests pass; no paid or nondeterministic service called.
- Worker author's scoped 74 tests pass: processable-format configuration, v1/v2 claim fences and observation capabilities.
- Real owned disposable PostgreSQL/Redis: 22 tests across store, restricted-role and composed HTTP journey pass (10.46s). Applied generator-produced migrations0052/0053/0054. Tested 40 contextual + 3 required hints, 43 disclosure roundtrip, v2 public and relational version, unchanged legacy reuse, missing/wrong policy SQL rejection, public/relational version mismatch rejection and existing revocation/deletion/lease/budget/reference authority seams.
- Backend/contracts/prompts lint and builds pass. Backend/contracts/prompts/web typechecks pass after the fixture correction. No web UI has changed for this extension; browser proof is required at M4/M5 rather than waived.

## Infrastructure and safety

Only owned feature038 PostgreSQL55479 and Redis56429 used by the worker; user's5432/6379 applications untouched. Keep fixtures isolated and remove owned containers after review. No actual user-data mutations, paid calls, model text/prompt logs or financial-policy changes.

## Remaining proof

Final affected static/build checks, backend independent security/completion-scope review, guide revision/mapping checks and frozen design prompt. UI/browser/replay/comparison verification awaits returned design. Live model linguistic quality is not proven by deterministic tests.

## Final backend preflight supplement

Final 22 real database tests rerun with valid admission markers and precise named 23514 constraint assertions; 11.21s. Contextual-content erasure after checked saved reuse is covered. Guide mapping is synchronized at sha256:59b8fc41bf3da5e2 and metadata checks pass. Final contracts78/prompts5 and backend build pass. Independent bounded backend compatibility/security review approved after remediation; this is not overall feature completion.

## Approved backend and design checkpoint

038-R1 aggregate split-reference protection and 038-R2 intentional Studio exclusion are independently resolved. Final9 contextual units pass, including single/repeated split disclosure. Post-remediation22 real database tests pass (9.80s), with unhinted grammatical scaffolding in the maxboundfixture; final backend typecheck/lint/build pass. Canonical prompt contains20 stable SPH IDs, no concrete API paths in its portable block, and matches the immutable v001 snapshot (SHA256822226e60a700262e339e05facd10841b835c76e9a7e069999d4f5b58d165d86). Prompt index, humanplan and DESIGN.md links are current. Backend/web guide checks pass; Owned PostgreSQL/Redis containers languon-feature038-postgres and languon-feature038-redis removed; no remaining55479/56429 listeners or owned verification processes. User services untouched. M4/M5 and whole-feature completion remain pending the returned design.

## Returned-design integration author preflight — 2026-10-05

Selected v8 source is retained/digested in DESIGN.md; per-state source inventory is in FEATURE.md. UI root additions use runtime tokens and existing Button/Dialog controls. No fetched source was executed or directly copied as application code.

- Web controller/comparison/rendered-regression tests: 3 files, 60 cases passed (2.41s). Final-action completion, exact replay and fresh-results retention covered separately from rendering.
- Root affected UI/widget ESLint: passed.
- Web production build: passed, compiled and full application TypeScript validated; no generated files hand-edited.
- Exact replay backend refinement: 23 real disposable store/HTTP tests, 8 contract cases, backend typecheck and 5-file scoped lint passed. Uses existing routes with bounded optional review-only IDs and current authority; no paid work or substitution. Owned PG55489/Redis56439 released exclusively to browser tester after backend tests.
- Browser integration and final independent completion/security review remain pending. This is author preflight, not feature completion or pixel-fidelity approval.

Review remediation: C1 removed duplicate/no-op empty-state generation action with rendered interaction coverage; C2 pending reference work now participates in close/beforeunload guards with truthful localized copy; C3 results rating keys map to localized public labels, AI-check label translated, comparison ignored-difference key synchronized. Nine rendered regression cases pass, including pending empty-draft reference leave protection and Russian completion/comparison labels. A duplicate-text candidate was withdrawn after checking exact source (compressed tool-output artifact), no code change attributed to it. Actual C4 is the subsequent uncertain reference-outcome race; controller remediation and regression evidence are pending.

C4 remediation: paid-operation uncertainty and reference uncertainty are tracked separately; public uncertain combines them for leave/UI guards. Unknown reference outcomes block draft mutation/AI checks/skip/next/new/exact until the retained same operation resolves; intermediate capacity errors do not remove uncertainty. Final 62 controller/comparator cases pass (2.32s), affected typecheck/lint pass, independent reviewer notified. Nine rendered regressions remain passing. Browser proof remains pending, not replaced by these checks.

Independent browser checkpoint: tester's focused owner/reader v2 journey passed (`sentence038owner8`, Chromium, about22s journey, isolated PG55489/Redis56439). Verified one preferences control, solid required/dashed contextual hint, owner AI check, zero-credit reader402 with free normalized comparison/noAIscore, counts/history, reachable mobile results actions, revoked access clears protected content. Intermediate owner8 capture directory was subsequently overwritten by Playwright; that run remains valid test execution evidence but does not provide retained fidelity captures. Final full mapped journey/fidelity inventory and queued-fresh remediation proof remain pending. No user development services or paid model calls used.

Runner diagnosis correction: persistent log showed actual finite test failure (exit1 after3min) on stale v1 hint-name regex, not an established process-lifetime limit. Test uses the updated accessible name now. Root is rerunning the guarded fixture in attached TTY12525 and will retain final captures before another Playwright invocation overwrites output. No verification layer waived.

### Final author preflight, 2026-10-06

Fresh focused execution passed: `pnpm --filter @languon/web exec vitest run tests/sentence-training-state.test.ts tests/sentence-training-review-regressions.test.tsx` (53 tests) and `pnpm --filter @languon/web exec vitest run tests/reference-comparison.test.ts` (20 tests). An initial command included a nonexistent comparison filename; that selection ran only the existing two files and is not counted as comparison coverage. The correct comparison file was then executed explicitly. Total: 73 passing focused tests.

`pnpm docs:user-flows:check` validated 19 guides, and both `pnpm user-flow:e2e -- check sentence-practice-web` and `... sentence-practice-backend` passed. `git diff --check` passed. Prior affected backend/frontend typecheck, scoped lint, build and real disposable database evidence remain valid: no production code changed during final fixture remediation.

`sentence038final-design` was another diagnostic full run (5 passing, 2 failing): owner/access-revocation and finite/exact/saved/fresh/C5 passed. Remaining cancellation next-429 countdown and RTL source/history assertions were corrected in the harness; production limits and API responses were retained. Thirty screenshots from passing scenarios only are retained under `evidence/sentence038final-design-diagnostic/`, with an explicit partial-run manifest. This run is not full-suite completion proof.

### Consolidated browser proof and cleanup — 2026-10-06

Final run `sentence038final-complete`: all seven Chromium journeys passed in 2.5 minutes, exit 0, against local fake providers and task-owned disposable services. The complete source is the final v8 implementation; no product code was changed during fixture remediation. Proof includes persisted/conflicting model preferences; owner dark/full-viewport/mobile UI; contextual hover and required keyboard hint focus restoration; zero-credit shared-reader reference/normalized comparison and access-loss erasure; finite Russian→French rounds; exact saved replay/whole-list preflight and fresh generation with queued-results retention; shared sign-in; real running cancellation with bounded real retry countdown; Arabic/Japanese, reduced-motion, viewport/keyboard/zoom simulations, inline RTL history; dirty preferences without Navigation API. No simulated rate-limit policy bypass or paid provider calls. Browser observers assert no unexpected console/page errors.

The retained manifest `evidence/sentence038final-complete/manifest.json` records tested-spec SHA-256 and hashes for 72 PNG files (including attachment duplicates). Root inspected representative mobile inline-preferences, completed-results and RTL inline-history captures; independent reviewer inspected v8 source-to-runtime inventory and hover/focus evidence. This establishes source-adapted implementation fidelity, not a pixel comparison to external rendered reference screenshots. Earlier partial runs remain explicitly diagnostic. A standalone complete RTL journey also passed (11.3s), with six retained captures.

Cleanup: final Playwright fixture processes exited; no listeners remained on owned web3359/backend4059. Removed only `languon-feature038-exact-postgres` and `languon-feature038-exact-redis`. User development ports/services were not changed. Restored `apps/web/next-env.d.ts` using Next's generator; its Git diff is empty.

Implementation and verification are ready for review. Feature lifecycle remains in progress solely pending Git scope authority: prior uncommitted local-default, idiomatic-generation, shared learning-dialog, and sentence-reliability maintenance cannot be safely separated from this feature commit using the available baseline. No commit, merge, push, user environment change, or v2 model-revision activation was performed.

Final traceability: web guide is Current, last_verified 2026-10-06; revision `sha256:6277d8003b6baf7f` is synchronized. The only post-run spec edit is its verification-prose revision comment; the final manifest preserves the actual executed spec hash. Independent final product/security approval is recorded in REVIEW.md; C6 Git scope is the only remaining delivery blocker.
