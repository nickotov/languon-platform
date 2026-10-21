# Learner portrait implementation evidence

Updated: 2026-10-21

Feature status: Complete — implementation, runtime/fidelity verification and independent/security reviews pass. Historical E1–E6 describe the backend checkpoint; E7 onward describe the selected v001 UI continuation and current evidence.

## Tested state

Base main `5efaafe`; changed tracked and new runtime/test files identified by [backend-source-sha256.json](evidence/backend-source-sha256.json). Final author and independent reviewer comparisons verified all82 hashes against the tested source. Feature docs and canonical prompt/snapshot are linked separately.

## Acceptance coverage

| IDs | Implementation/proof | Status |
| --- | --- | --- |
| POR-01 | Dashboard/profile entry, manual/interview routes; E7/E8/E9/E11 | Pass |
| POR-02/03/04 | Guided/manual partial data, strict proposals, deterministic summary, explicit approval and separate use; E1/E2/E3/E5/E7/E8/E9 | Pass |
| POR-05/06/07 | Current approved policy, manual/inherited fields, per-chat/global controls, pinned context and erasure; E1/E4/E7/E8/E9 | Pass |
| POR-08/09 | Transactional versions/fences, cancellation/expiry/erasure, actual two-tab conflict reconciliation; E3/E5/E7/E8 | Pass |
| POR-10/11/14 | Strict limits, four-locale preference safeguards, independent self-described languages, scope restrictions; E1/E2/E5/E7/E9 | Pass within stated semantic/provider limits |
| POR-12/13 | Scoped zero-charge accounting, readiness, notice/replay/failure recovery and manual fallback; E3/E5/E7/E8/E9 | Pass |

## Check records

### E1 — Backend unit and deterministic SDK/agent regressions

`pnpm --filter @languon/backend exec vitest run src tests/unit`: 127 files passed, 1 skipped; **1,079 tests passed, 13 skipped**. Includes real pinned Mastra adapter execution with deterministic provider fixtures, ordinary portrait absence/override/privacy tests, worker fairness, environment validation, summary/approval/state policies. No paid model calls. After final resume remediation, the focused learner-portrait application/domain/HTTP/agent selection passed **53 tests in 5 files**.

### E2 — Shared contracts and prompts

`pnpm --filter @languon/contracts test`: **132 passed**. `pnpm --filter @languon/prompts test`: **5 passed**. Both package typechecks passed. Character bounds are Unicode graphemes; aggregate UTF-8 JSON limits (30KB items/10KB summary/90KB state) reject excessive input without truncation.

### E3 — Real PostgreSQL portrait persistence and migration safety

Persistence specialist ran the focused learner-portrait persistence file with `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, the confirmed dedicated loopback PostgreSQL target on port55481, and its database-name confirmation: **21/21 passed** after fresh migrations0076–0079. Includes atomic rollback/ownership/conflicts, concurrent writes, expiry, queued stop, lease recovery/no redispatch, locale changes, content-derived fingerprint erasure, no-worker queued purge, expired-running settlement and live-lease fencing. Final resume regressions cover persisted requested language plus later concurrent language choice, latest pending proposals with stale/base-version metadata, failed-after-success question recovery, queued/running reconnect and stop, and current edited items without inactivity extension. Terminal fixture cleanup verifies terminal rows unchanged. Restricted SET ROLE proof applies the actual deployment-role SQL: lifecycle recovery/erasure succeeds while SELECT of portrait state, interview context and operation input/context/result/fingerprint is denied. Recovery reads only lifecycle and pricing fields; lease-token reads are also denied.

Migrations are additive. No destructive down migration is supplied: remove/rollback feature code only through reviewed compatible deployment and later forward-removal work. Existing data is not rewritten. Generated schema snapshots/journal come from drizzle-kit; custom lifecycle/financial guards are authored custom migrations.

### E4 — Real PostgreSQL ordinary conversation integration

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/conversations/conversation-store.test.ts` against the dedicated disposable target: **35/35 passed**. Covers legacy/manual settings, explicit adoption/per-chat exclusion, next-message approved updates/disable, immutable in-flight portrait snapshot, SQL rejection of early snapshot removal and terminal erasure. Deterministic SDK observation/reflection tests prove portrait sentinel absent from memory prompts/state and present only on actor response context.

### E5 — Composed authenticated HTTP/credit journey

`pnpm test:e2e:learner-portrait` passed **2 tests** against dedicated disposable PostgreSQL and temporary Redis, with both explicit safety gates and confirmations. Exercises real authentication/routes/store/accounting, owner isolation, manual draft/approve/use, missing exact interview capability rejection without reservation, paid reservation/settlement and free zero-credit settlement preserving numerical provider usage. An additional real `SET ROLE` journey proves paid dispatched-call recovery: estimated settlement updates a limited reservation/allocation, archives numerical provider usage, and then erases portrait content, with private payload and lease-token reads denied. No external provider is called. Temporary Redis was removed after verification.

`node --test scripts/run-learner-portrait-e2e.test.mjs` passed runner target/confirmation safety tests. `pnpm user-flow:e2e -- check learner-portrait` and `pnpm docs:user-flows:check` passed. The guide truthfully covers backend/API only; future UI is not declared current.

### E6 — Static checks and build

Full backend typecheck, full backend ESLint, contracts/prompts typechecks, `pnpm --filter @languon/backend db:check`, and `git diff --check` passed. Contracts/prompts/backend builds passed after the narrowed recovery-query remediation. Final backend packaging build, full backend typecheck and full ESLint passed after the complete resume remediation. Contracts were rebuilt before the backend package. Typecheck and focused role/accounting lint passed after the query/role changes. The web consumer production build and sequential post-build typecheck also pass for the shared optional contract extension; generated next-env.d.ts was restored to its exact prior tracked bytes. An initial web typecheck run concurrently with Next generation raced the regenerated .next types and failed; it is superseded by the successful sequential check, not treated as passing evidence.

Exploratory full `pnpm --filter @languon/backend test` without disposable environment was not a passing proof: two migration suites correctly refused absent safety gates, and a concurrently changed maximal fixture loaded incompatible intermediate contracts. Resolved through the final unit/src selection E1 and explicitly disposable E3/E4/E5 rather than weakening guards or claiming that exploratory run passed.

## Independent review

[REVIEW.md](REVIEW.md) owns findings/verdict. Security specialist reports no remaining material findings after erasure, no-worker cleanup and diagnostic-disclosure remediation. Initial functional review found F2/F3 resume gaps and F4 guide mapping gaps. Remediation and affected checks pass; independent focused final review passes with no remaining material findings.

## Remaining gaps and limitations

- Historical checkpoint excluded UI evidence. Current UI, runtime and fidelity checks are recorded in E7–E9 below.
- Diagnostic rejection is a bounded deterministic supported-language safeguard plus explicit review; unknown labels/euphemisms cannot be exhaustively recognized. No clinical inference or diagnostic assessment is performed.
- External provider semantics, retention/training/processing region and erasure were not verified. The provider receives necessary interview context; application cleanup is not a provider-erasure claim.
- No live-provider or paid-model checks, production deployment, push, or full feature completion.
- Feature branch starts main before separately retained sidebar work; do not silently fold that unrelated branch into this feature. Future integration must resolve independently allocated migration changes deliberately.

2026-10-21 — Restricted-role security delta passed. Contextual assistant and account-control dependency mappings now include portrait sources; their mapping checks and docs:user-flows:check (26 guides, 16 validator tests) pass. Resume findings and final functional review are closed in REVIEW.md.

Final backend checkpoint: all82 runtime/verification hashes match; canonical prompt exactly matches frozen v001 SHA-256. Backend checkpoint passes; no UI/browser or whole-feature completion is claimed. Local feature checkpoint only; no push, deployment or main integration.


### E7 — Selected-design UI continuation, current author checks

Boundary: tracked/untracked changes from `dc02e53`; the separate final manifest preserves this UI continuation without overwriting the historical backend manifest. Source design is the captured v001 artifact in DESIGN.md, with desktop/mobile rendered reference captures.

- `pnpm --filter @languon/web exec vitest run --maxWorkers=2`:129files/947tests pass. This covers real API parsing/bounds/cache, manual approval/conflicts/owner changes, editor fields/summary, interview recovery, portrait chat preferences, home entries and auth refresh owner pins. Later interview error-message remediation must rerun its focused selection.
- `pnpm --filter @languon/contracts test`:138tests pass, including independent preference contracts, optional mixed-language/notes fields and duplicate interviewer option rejection.
- `pnpm --filter @languon/backend exec vitest run src/modules/learner-portraits src/modules/conversations/application/portrait-context.test.ts src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts`:7files/82tests pass. Full backend typecheck passes.
- Combined security remediation selection:6files/52tests pass (auth refresh, owner-scoped request, portrait entry, application chrome, management and privacy disclosure). Full root ESLint passes after the partial-mock type import correction.
- Current portrait persistence integration:27/27 real PostgreSQL tests pass, extending historical E3 with private status, safe failed-input recovery, ownership, expiry and erasure coverage. Exact final harness results below will supersede provisional UI execution notes.
- All seven affected guide inspect/check selections pass (learner-portrait, global-app-shell, web-i18n-support, user-authentication, magic-profile-page, profile-account-controls, contextual-language-assistant-and-knowledge). `pnpm docs:user-flows:check`:26guides and16validator tests pass. These mapping checks alone do not claim execution of every mapped browser suite.

Styling guard limitation: `pnpm styles:check` reports10existing untokenized-length violations in untouched Knowledge workspace-controls.module.css and shared companion-layout.module.css. `git diff` is empty for both files. No new portrait CSS is reported. This existing baseline is recorded rather than waived or opportunistically rewritten.

Exploratory failures and disposition: an initial parallel full-web run timed out the unchanged large Markdown fixture; bounded-worker full run passes. An existing workspace-assistant spy expected3arguments although checkpoint code already supplies optional fourth `undefined`; expectation now reflects that unchanged call contract. Owner-hardening initially invalidated5entry tests that mocked away its newly imported helper; a partial mock preserves the actual guard and all5pass. The standalone interview initially nested `<main>` landmarks; its chrome wrapper is now a div and the real page owns the main landmark. Browser model_unavailable was traced to deterministic fixture policy omission, not loosened production selection guards; the repaired real fixture/browser journeys pass in E8.


### E8 — Real web journeys and independent tester

`pnpm test:e2e:learner-portrait`, with both explicit disposable database/cache gates, the confirmed exclusive PostgreSQL55481 portrait test database and Redis56381/db1, passes **backend2/2 and browser2/2**. Final run ID `portrait-final-reviewed` at15:13–15:14 on2026-10-21. No live or paid provider is called; real auth/routes/queues/PG/Redis/persistence/UI execute, with deterministic adapters only at external model boundaries. The fixture migrates but never resets a schema and cleans only its unique Redis namespace.

The manual browser case creates partial confirmed data, saves/approves with global use off, reloads, separately enables, opens a real Knowledge note/settings, verifies global off disables per-chat use, and checks mobile deletion warning/cancel/overflow. It also uses two real tabs to prove stale save conflict, both versions, blocked reconciliation without a choice, explicit draft selection and successful save. The interview browser case verifies the visible free notice, start/reload/resume, real queued response, explicit proposal Add, editable review and Save with use still off. Page errors, console errors and unexpected5xx are absent.

Durable screenshots copied from the final runner output to [ui-runtime/final](evidence/ui-runtime/final). Desktop viewport1440x900; mobile390x844. Compact changed-field conflict values and suppression of the misleading connection error are included in this final passing run and recapture. Mapped guide/revision and all26guide checks pass. The independent tester reports PASS for the actual mapped interaction surface; this alone is not visual fidelity proof.

### E9 — Author real-browser and supplied-design comparison

Source: pinned v001 artifact; rendered reference [capture manifest](designs/learner-portrait/v001/reference/capture-manifest.json), with17new reference captures and historical captures retained. Matched desktopCSS1440x900; mobileCSS390x844/DPR3. The provider exports some shared primitive files as empty; actual DOM measurements and screenshots establish their appearance. Only the supplied fake prototype account/scenarios were captured. No design changes/publishing were performed.

Local: project-pinned safe `pnpm browser` wrapper, task session `languon-learner-portrait-visual-099a5be8c57faa8e753af2014eb10fb7`, reviewed disposable fixture4007/web3337, synthetic learner only; session closed and owned processes stopped. Checked desktop1440x900 and mobile390x844, light/dark, manual empty/populated, approved-off/in-use, actual delete confirmation→empty, home and profile entries, real Knowledge chat settings, interview opening and preview, Russian interview-language switch independent of explanation preferences. Browser errors are empty; console contains only development/HMR messages. Network contains only localhost; the only4xx were expected refresh401 while signed out before synthetic signup.

Author comparisons fixed: manual top padding24, empty-list gap, source placeholders/group legends/counts, Add icons, disabled primary Save appearance; interviewer teal bubbles/avatar geometry; single composer without invented purpose selector; correct preview hierarchy/heading/arrow/expiry; exact source textarea rows/padding/lineheight; header and question spacing, preserving visible Skip/Continue at900height. Main source dimensions are retained through CSS Modules/runtime tokens. Historical message timestamps are omitted because the API has none. Root captures under [ui-runtime](evidence/ui-runtime) identify the inspected intermediate/final states; final runner captures supersede intermediate English desktop pictures. Native dialog/backdrop/focus behavior adapts prototype mechanisms, and the existing response-settings popover retains the designed section hierarchy plus real model/default controls.

Coverage reconciliation (all rows refer to FEATURE.md; final review remains pending):

| Inventory | Runtime / lower-layer proof | Outcome |
| --- | --- | --- |
| MGMT01/05 | Intro-final1440x900, free/cost/expiry/data-use source; four-locale privacy render tests and opening browser path | Implemented, accurate provider/deletion copy adaptation |
| MGMT02/06/07/08 | Overview-saved-off, home-saved-off, mobiledelete, real enable/globaloff/actualdelete/empty, settings entry observed | Implemented, no silentenable/history-erasure claim |
| MGMT03 + EDIT01–08 | Final manual empty/populated desktop, mobile populated, all17editor tests,35interview/editor regressions, deterministic API save | Implemented, independent fields/partial summary preserved |
| MGMT04 + EDIT09 | Final two-tab conflict and review/proposal/save browser cases; domain/PG optimistic concurrency | Implemented; compact per-field final browser recapture passes |
| INT01–06/08 | Final interview+preview1440x900, mobilelight/dark+Russian sheet, real proposal→review→save,18interview tests | Implemented; no fabricatedtimestamps |
| INT07 | Real restart/resume, earlier503diagnosis,16then18recovery regressions,27PG lifecycle/erasure cases and billingHTTP proof | Implemented, source-style runtime recovery additions documented |
| CHAT01–06 | Real Knowledge desktop/mobile settings, globaloffdisabled case,22chat tests + resolver/runner contracts and historical35realPGconversation cases | Implemented; mode/model/default contracts preserved |
| ALL | Representative wide/narrow/light/dark/translated captures, semantic controls/dialogs, no-overflow assertions, owner-race/security checks | Representative coverage; no exhaustive viewport/locale cross-product claim |

Source mobile bottom-sheet PNG/full-PNG captures have a host compositor duplication artifact. Supplemental `reference/interview-preview-mobile-dom.json` and `.txt` record actual390x844 rendered geometry: sheetx0/y415/w390/h429, summaryy488/h156, countsy660/h68, CTAy744/h44, expiryy804/h16. All controls are within the viewport. Comparison uses these actual source DOM measurements, available visible source regions and clean local browser sheet rendering; no full-body pixel-equivalence claim is made from corrupted reference images.


### E10 — Final author preflight

The final reviewed runtime/contract/test boundary is identified by [final-source-sha256.json](evidence/final-source-sha256.json), separate from the historical backend manifest. Final focused editor/interview/conflict/management run:4files/46tests pass. Compact-conflict rendered regressions exercise all4locales and changed-field formatting, and the actual two-tab browser flow passes with current presentation. Full root ESLint, web/backend/contracts/prompts typechecks and contracts/backend production builds pass. Final web production build passes on the exact last presentation patch, and sequential post-build web typecheck passes. Generated next-env.d.ts was restored byte-for-byte to HEAD after reviewed fixture/build execution. Source delivery contains no new runtime dependencies or hand-edited generated migrations.

Independent security review closes UI-S1/UI-S2; the separate tester reports current backend2/browser2green. Author acceptance mapping covers POR01–14 using E1–E10 and current source inventory. Independent completion review follows this preflight; full-feature Complete and local squash integration are not yet claimed.

Frozen-source formatting: the retained external capture includes blank lines at EOF, so whole-diff Git whitespace diagnostics report those captured files. Their82hashes are preserved. `git diff dc02e53 HEAD --check -- . ':(exclude).agent/features/051-learner-portrait/designs/learner-portrait/v001/source/**'` passes for authored runtime, tests, configuration and documentation. No frozen capture whitespace is normalized after capture.

Final broad web regression before UI-C1 remediation: `pnpm --filter @languon/web exec vitest run --maxWorkers=2` passes130files/955tests on7f0fbbe. The subsequent UI-C1 change will use deferred-owner regressions and affected hook/component checks; unchanged view/layout and backend evidence remains linked above.


### E11 — UI-C1 owner/request mutation remediation

Final scoped command: `pnpm --filter @languon/web exec vitest run tests/portrait-owner-mutation-state.test.tsx tests/learner-portrait-entry.test.tsx tests/learner-portrait-management.test.tsx tests/portrait-owner-scoped-request.test.ts` passes4files/22tests. It uses actual owner transport helper/query hooks and deferred mutations, with only external API responses controlled. New regressions prove A→B usability, no inherited A error, late A rejection/success cannot clear B/newA pending or change its cache, B settlement works, and synchronous duplicate starts are rejected. Full web typecheck and scoped lint pass. No UI layout, backend, public API or design change. Final manifest now221paths; prior219path pre-review version remains in7f0fbbe history. Final web production build and sequential post-build web typecheck pass, with generated next-env restored byte-for-byte. Current real runtime run `portrait-final-owner-scoped` passes backend2/browser2 with no product/test changes during execution; final8captures are bound by `evidence/ui-runtime/final/capture-manifest.json`. Focused independent remediation review passes and closes UI-C1.


### E12 — Final source/evidence validity and completion

Independent full-feature review of dc02e53..7f0fbbe and focused remediation review of7f0fbbe..d823163 pass. Security UI-S1/UI-S2 and functional UI-C1 are closed. Reviewer independently confirms221current source hashes and82captured design-source hashes. Final runtime/test bytes match `d823163`; final completion documentation and screenshot-run metadata do not alter those bytes. Generated Next entry is restored exactly, and no authored-source whitespace, temporary logs, secrets, unrelated code or unresolved conflicts remain. Frozen external snapshot EOF whitespace is retained as explained above.

Accepted final evidence: fullweb130files/955tests before the bounded owner-state remediation;22focused deferred-owner regressions afterward; contracts138; backend focused82 and historical1079unit/src coverage; current portrait PostgreSQL27 and unchanged conversation PostgreSQL35; final registered real backend2/browser2; contracts/prompts/backend/web typechecks, contracts/backend/web builds, root/affected lint,26guides and16guide-validator tests. Final source and test selection are unchanged after these checks. No additional paid/live provider, production deployment or push was performed.

Residual limitations are deliberately unchanged: live provider behavior/retention and external backup erasure are not proven; natural-language diagnosis recognition is non-exhaustive; visual coverage is representative rather than the full locale/theme/viewport cross-product. The corrupted source mobile PNG is supplemented by actual rendered DOM measurements and clean local runtime evidence. The global style guard has10pre-existing findings in two untouched stylesheets; no new feature stylesheet finding is present. Independent reviewers accept these bounded evidence limits.

Local integration completed as one squash commit into main from the original5efaafe base, without conflicts or runtime changes. The integrated tree initially matched the completed feature tree exactly, and all221runtime/test hashes still match the verified source. This integration note is the only post-squash bookkeeping change; validation remains applicable. Feature/sidebar branches and the recovery stash are preserved. Nothing was pushed or deployed.
