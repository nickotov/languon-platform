# Frontend follow-up verification, 2026-10-22

This supplements `browser-final-20261022/EVIDENCE.md`; the earlier learner budget/quote and admin settings/records evidence remains scoped to its recorded sources.

- Exact decimal speech confirmation now parses public credits into integer milli-credits through the public `parseCreditMilli` contract helper, bounded by the wallet maximum 9,007,199,254,740,991milli. Display rounds to at most two places, never shows a tiny positive price as zero, and offers expandable exact price/balance. Admission compares exact values.
- Scoped runtime searches found no other web/admin/mobile direct `BigInt(decimalCredit)` consumers. Existing internal USD/operator BigInt arithmetic is already scaled correctly.
- `pnpm --filter @languon/web exec vitest run tests/speech-confirmation.test.tsx tests/speech-api.test.ts`: 11 tests passed. The quote 0.125 / balance 0.124 regression rejects admission; 0.001 / equal balance remains visible/nonzero and admissible.
- `pnpm --filter @languon/contracts exec vitest run tests/credit-amount.test.ts`: 10 cases passed, including exact maximum and one-milli overflow. Contracts build passed. Affected lint and whitespace checks passed.
- Existing shared pronunciation browser fixture now seeds synthetic reviewed USD rate/operator caps and a 0.125-credit customer price, grants 1,000,000 milli-credits for 1,000 credits, and returns canonical decimal wallet summaries. The deterministic fixture creates a test tone, never a paid-provider request. Existing real-playback assertions remain.
- Existing pronunciation Playwright configuration explicitly clears inherited live-provider voice maps for fixture backend/worker; the first startup failed safely on incompatible curated voice configuration before any test. Dynamic ESM imports follow this suite’s contracts-loading convention.
- Existing admin wallet browser journey now verifies terminal success with unknown usage releases the hold, one action/attempt and unknown provider expense remain, and no invented customer debit occurs. The first run found a stale initial input assertion 1 vs the actual new precision 1.000; corrected the assertion. Final run passed 1 test / 23.6 seconds (12.2 seconds scenario) with browser errors checked. Backend/application source was unchanged by this remediation.
- `pnpm docs:user-flows:check`: 16 validator tests passed; 28 guides/mappings validated. Shared pronunciation revision c732fe57d13e6a88 and wallet 99b7d70e3e3a8ddb synchronized. These mapped-source updates do not claim every legacy journey was rerun.

## Wallet runtime

Synthetic disposable admin target `postgresql://test:test@127.0.0.1:55445/languon_admin_e2e_test`, Redis `127.0.0.1:56445/2`, API 4015 / admin 3015 / web 3345. Existing Playwright config starts/stops real backend/worker/admin/web and applies forward migrations only; no reset. Command:

```sh
ADMIN_E2E_DATABASE_URL=postgresql://test:test@127.0.0.1:55445/languon_admin_e2e_test ADMIN_E2E_REDIS_URL=redis://127.0.0.1:56445/2 ADMIN_E2E_BACKEND_ORIGIN=http://localhost:4015 ADMIN_E2E_ADMIN_ORIGIN=http://localhost:3015 ADMIN_E2E_WEB_ORIGIN=http://localhost:3345 pnpm --filter @languon/admin exec playwright test tests/e2e/admin-user-management.journeys.spec.ts --grep 'owner grants AI credits and unknown generation usage releases its hold'
```

Console startup still reports sanitized accounting maintenance deferred/retry; root owns that independent runtime investigation. Browser trace/video in ignored test output may contain synthetic auth credentials and are not copied into durable evidence.

## Speech runtime

Final existing Playwright pronunciation suite: **4 passed in 43.8 seconds**, Chromium, against owned learner 55444/56444 containers, API 4006 / web 3336, after forward migration 0098. Real local backend, deterministic worker and Next application; no paid calls. The command uses the existing `withPreservedFile` helper around the scoped `pnpm --filter @languon/web exec playwright test tests/e2e/shared-pronunciation.journeys.spec.ts` command to restore tracked `apps/web/next-env.d.ts` after execution.

Environment: `AUTH_E2E_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test`, `AUTH_E2E_REDIS_URL=redis://127.0.0.1:56444/1`, `AUTH_E2E_BACKEND_ORIGIN=http://localhost:4006`, `AUTH_E2E_WEB_ORIGIN=http://localhost:3336`, `AUTH_E2E_RUN_ID=speech-decimal-052d`.

Covered real free shared reuse, paid quote cancellation with no confirmation request, exact decimal price/admission/successful storage/debit/free replay, unsupported Hebrew controls, and the existing provider-unavailable recovery scenario. Browser console/page errors, unexpected HTTP errors and non-navigation failed requests are asserted clean. The paid quote is 0.125 credits, compact 0.13, exact disclosure 0.125; successful wallet consumption is exactly 125 milli-credits. No charge comes from display rounding.

Visually inspected screenshot `browser-final-20261022/decimal-speech-confirmation-narrow.png`, 390×844/light: dialog, compact/exact amounts, disclaimer and both buttons visible, no horizontal overflow or clipping. Native summary is keyboard accessible; existing Generate/Cancel controls retain accessible names. Unit coverage supplies the additional 0.001 tiny-price and exact insufficient-balance states.

Pre-execution harness remediation: explicitly clear inherited voice map; load ESM contracts dynamically as this suite already does for auth; scope New dictionary to the main landmark to distinguish the current sidebar shortcut. No application behavior changed for those harness fixes. All owned browser application/worker processes stopped after success, generated Next declarations restored (including the earlier direct admin run’s `.next-admin-e2e` rewrite), disposable containers retained for parent verification.

Hashes of final speech/wallet sources are recorded in `browser-final-20261022/followup-source.sha256`. Broad final compilation and independent completion review remain parent-owned.


## Strict accounted dictionary browser follow-up

The guarded startup CLI requires APP_ENV=test, explicit fixture opt-in, equal DATABASE_URL/AUTH_E2E_DATABASE_URL, and a named loopback test/E2E database on a nondefault port. Its synthetic managed snapshot, customer/provider rates and operator funding go through real accounting admission. The API enables enforcement+managed routing; the worker uses deterministic provider mode and a synthetic key. No unaccounted exception or paid model call was introduced. The legacy worker owns these backend fixtures; frontend verification changed only test locators, diagnostics and the separate desktop proof below.

Owned target remained learner PostgreSQL 55444 / Redis 56444 (API 4006 / web 3336); parent’s 55481 services untouched. Existing preserved-file wrapper surrounds each scoped Playwright invocation; no schema reset.

- Existing card AI proposal/reload/manual conflict/stale acceptance/recovery journey **passed in 29.0 seconds** under strict accounted admission after correcting two stale locators: New dictionary scoped to main, and Card actions menu items found at their real document portal.
- Existing pasted-term review journey successfully admitted, generated and reloaded the real batch. Its **unchanged 320px / 200% font no-overflow acceptance assertion fails**, also with a short normal run identifier. Actual document scrollWidth 478 vs clientWidth 320; diagnostic bounds: unchanged dictionary-editor emptyCards right 477.94, emptyHelp/emptyAction right 428.94, and batch review grid right 2667.88. This is a residual existing layout defect, not a passing full batch journey.
- Relevant dictionary-editor/batch panel/shared Dialog/Card runtime sources are byte-identical to HEAD; exact comparisons recorded in `browser-final-20261022/baseline-layout-source.sha256`. This is source-based baseline attribution; a separate baseline application checkout was not executed. Inspected failure screenshot retained as `browser-final-20261022/baseline-batch-320-text200-overflow.png`. No runtime CSS changed, no assertion removed/skipped/weakened, and no narrow-layout success claimed.
- Parent requested a separate focused normal-desktop accounted generation/reload/accept proof while preserving that legitimate residual failure. Added to the same maintained dictionary journey file. An initial explicit 202 waiter used the wrong endpoint; corrected to actual `/dictionaries/:id/batch-generations`, recorded interruption, stopped only the identified owned Playwright process, and reran only that proof. Final desktop proof **passed: 1 test in 29.6 seconds, 8.2-second scenario**, Chromium at 1280×900. It observes the actual 202 admission, durable review URL/reload, edited translation, successful atomic Add 2 cards confirmation, one bank card row (source and synthetic translation may both equal bank), and persisted cards after final reload. Console/page/unexpected HTTP checks passed. Early authoring issues (wrong waiter endpoint and duplicate synthetic bank text locator) were corrected; only the final clean terminal is counted as passing evidence.

Final scoped command: `pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts --grep 'accounted batch desktop generation'`, with the same preserved Next declaration wrapper described above. Environment target PostgreSQL 55444 / Redis 56444, backendorigin localhost:4006, weborigin localhost:3336, final run identifier d52f. Original two-scenario run used d52c; only its card scenario passed, and its real batch overflow failure remains recorded.

After actual exit 0, read-only lsof verified no listeners 4006/3336; owned API/Next/worker processes were gone. Pre-existing unrelated dictionary worker PIDs 29851/29967 were preserved. next-env is clean. Parent notified the quiet load window is available. Final test-scoped ESLint, mapping and whitespace checks passed. This is not a passing full dictionary guide or an accessibility-layout waiver.
- Dictionary guide revision e6a3d2ee25c55c2d marker synchronized; mapping check passed. Earlier full 28 guide checks remain separately recorded; they prove traceability, not execution of every scenario.


## Free portrait composer browser proof

After the parent explicitly released the quiet-load window, ran only the existing `interview resumes, uses a deterministic queued response, and keeps proposal approval explicit` scenario. **1 passed in 15.5 seconds, 8.3-second scenario**, real Chromium/Next/backend/accounted deterministic interviewer. Exact intro Free copy and composer notice `Free · Up to 30 actions per account per UTC day, including failed actions. One action at a time.` are asserted. Added an explicit 202 response assertion for the Free branch; existing reload, proposal approval and save assertions passed. Runtime console/page/server errors are checked by the maintained scenario.

Testfixture guard now permits exactly two named pairs: original PostgreSQL 55481/languon_auth_portrait_test+Redis 56381/1, or explicitly authorized owned PostgreSQL 55444/languon_auth_assistant_web_test+Redis 56444/1. APP_ENV=test, opt-in flags, matching database/Redis confirmations, nondefault ports and loopback hosts remain required. No arbitrary target support. No production application or contract source changed for this proof. Fixture appends migrations; the schema-reset integration runner was not invoked.

Command used the existing preserved-file helper around `pnpm --filter @languon/web exec playwright test --config tests/e2e/support/learner-portrait-playwright.config.ts --grep 'interview resumes, uses a deterministic queued response'`. Environment: `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, `ALLOW_DISPOSABLE_REDIS_TESTS=true`, `AUTH_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test`, `AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test`, `AUTH_TEST_REDIS_URL=redis://127.0.0.1:56444/1`, `AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1`, `APP_ENV=test`, `LEARNER_PORTRAIT_WEB_RUNNER=true`, `LEARNER_PORTRAIT_WEB_FIXTURE=true`, `LEARNER_PORTRAIT_TEST_PAID=false`, `AUTH_E2E_RUN_ID=p52a`.

Inspected screenshot `browser-final-20261022/portrait-free-policy-desktop.png`, 1440×900/light: Free counter and full 30/day/1active notice visible beneath message composer, controls legible. Read-only aggregate SQL on the owned learner database found exactly 1 portrait-interview action: funding operator, settled success, charged_milli 0, measurement measured; exactly 1 independent provider expense, 140 USD micros under synthetic reviewed fixture rates. No identifiers, tokens or raw prompts were returned.

After actual exit 0, lsof found no listeners 4007/3337, and tracked next-env was clean. No further services/build/tests started. Incidental whole-test formatting was removed only after comparing full parsed TypeScript structure/literals for equality; final test behavior is identical to the successful runtime. Fixture guard and test changes are confined to tests; source hashes in `browser-final-20261022/portrait-free-source.sha256` identify the proof. Parent owns later performance-source changes and final checks; this does not claim the whole portrait suite passed.

## Completion-review remediation — author checks, browser pending

Implemented a shared learner action-consent boundary using actual validated
`error.details.quote`: explicit Send/Top up/Keep editing, exact maximum,
approximate output and expiry. Each caller freezes original payload/version and
request identity before confirmation. A subsequent409offer requires another
Send. No legacy output-limit fact is invented. Dictionary authoring/rewrite/
pasted/document, text translation/detection/collection, sentence next/check and
paid interview admissions now use this boundary. Declining consent keeps drafts
and does not invoke sentence's automatic transport recovery.

Actual optional server billing is rendered separately from execution, including
held/charged/released/Free, exact details and estimated/unknown measurement.
Nonzero amounts below0.01 show `<0.01`; USD remains administrative. Preparation
shows one total maximum, remaining output, parent billing, and explicit
Continue with a new budget when server `requiresNewBudget` is true. Resume
retains the existing parent. Review-only setup/progress does not claim paid work.
Manual max-budget edits remain intact on settings cache refresh (regression test).

Author checks before real-browser freeze:

- `pnpm --filter @languon/web typecheck`: PASS, final29754 after fixing the setup
  controller access to `configuration.mode`. Minor cancellation-display guards
  added afterward require the final affected pass.
- Scoped ESLint85522: PASS for shared action entity, new browser/support files,
  portrait journey, preference/job/preparation tests and setup/progress UI.
- Focused Vitest53068:5files/59testsPASS3.93s (action consent, preference state,
  text workspace, preparation notice and portrait interview). Earlier remediation
  checks cover8files/63tests and6files/62tests; no backend test substitution.
- `pnpm docs:user-flows:check`:16validator tests +28guides/mappingsPASS.
  `pnpm user-flow:e2e -- check ai-accounting` and `check learner-portrait`:PASS.

Authored four additional repeatable `ai-legacy-budgets.journeys.spec.ts` cases:
dictionary40→39credits reoffer with frozen key/body and exact0.004reload;
text20credits preserving source/operation; sentence20credits with actual0.2
billing; three synthetic preparation entries consuming8192+1808 shared output
then requiring explicitContinue. Existing portrait paid scenario now separates
policy notice from allowance quote, forces a new quote after balance19, and
asserts actual0.14billing. The defaultFree variant asserts Free/exactzero.
These are authored, **not executed yet**: latest0100/0101 backend/DDL must freeze
first. No paid provider calls or services were started during backend remediation.
The combined accounting runner now invokes these guarded harnesses sequentially
and continues preserving Next declarations. Existing320px baseline overflow remains
separate and its strict assertion has not been changed.

Remediation author preflight finalized: affected web typecheck39557PASS;
scoped lint62842PASS; dictionary generation/coordination15554:2suites16testsPASS,
including Keep editing preserving the review without displaying a failed request.
Runner syntax checkPASS and Playwright `--list` loads all4newcases without
starting services. Dictionary, sentence-web, texts, portrait and accounting
mapping checksPASS. All owned frontend production source frozen; no app services
were started. Actual new browser evidence remains pending root's0103+source GO.

## Real-browser remediation checkpoint through0104 (superseded freeze pending)

Owned learner DB55444 was explicitly authorized for a schema reset because
0100 NOT NULL changes reject historical fixture rows. Verified exact DBname and
loopback container, reset only public/migration schemas there, then canonical
public configuration migrated forward through0104. No other DB was touched.

- First run50778 failed only test display assumptions (`100` vs actual100.00).
- Second46872 reached real quote, generated review/text and billing. Dictionary
  deterministic adapter intentionally omits measurement: actual Completed,
  No charge, Usage unknown, exact0. Test had incorrectly expected0.004. Text
  actually showed Completed/Charged<0.01, but the test scoped its lookup to the
  document main instead of the enclosing workspace header. Assertions corrected
  to actual contracts; no runtime source changed.
- Third39889: dictionary+text2/2PASS22.0s, real exit0. Dictionary40→39 requires
  another quote/Send, retains original body/key across3requests; real released0/
  unknown billing survives reload. Text real quote preserves source/operation,
  then displays measured charge0.004. Screenshots inspected in
  browser-remediation-20261022 (1280×720), no overlapping billing controls.
- Next sentence/preparation63677 terminalexit1. The guarded sentence worker
  crashed at SELECT languon_cleanup_speech_admission_counters(1000), emptyparams,
  PostgreSQL42883 undefinedfunction. UI correctly showed modelunavailable; no
  paid quote/parent progress was reached. Root identified source/helper mismatch
  pending0105, so these failures do not establish frontend completion.
- The dictionary worker also logged loop0failure repeatedly despite completing
  paid jobs. Root requires diagnosis/final rerun; sanitized speech cleanup cause
  supplied rather than treating this as an accepted residual. All owned API4006/
  web3336/worker processes stopped; lsof ports returnednone. Further browser
  execution paused until root0105GO. Prior2PASS scope retained but affected
  final reruns remain required.

## Final learner remediation verification

All six scoped learner outcomes now have passing real-browser evidence,
including default Free and explicitly paid portrait, actual changed-balance
consent, exact billing, signed-in shared collection maximum and preparation's
shared10,000-output pause/explicitContinue. Final build/type/lint/docs pass and
all owned application processes stopped. Next declarations restored to HEAD.
See the compact final record:
`browser-remediation-20261022/EVIDENCE.md` and numerical SQL proof files.
Root retains operational maintenance-warning diagnosis, final review and
feature-wide completion authority; these browser passes do not waive them.
