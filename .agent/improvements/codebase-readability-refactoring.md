# Improvement: Codebase-wide readability review and refactoring

Status: Complete
Created: 2026-11-01
Updated: 2026-11-01

## Scope and authorization

BL-019 selected by “let's go to next task”. Base 252de64; initial tree clean.
Improvement: behavior-preserving clarity work at established DDD/FSD/module seams.
No new product capability, public API/schema, permission policy, dependency,
provider/model choice, rollout or architecture replacement. Escalate at root
feature boundaries. Current branch; no automatic commit, merge or push.

## Acceptance

- AC-1: Deterministic source inventory with concrete per-file dispositions:
  reviewed/acceptable, refactored, or justified deferral. Read actual logic;
  formatter/metrics/search alone never count as source review. Include SQL/shell,
  config, styles and tests; exclude generated/native/migration output, frozen
  provider/design/evidence inputs and lockfiles.
- AC-2: Improve demonstrated comprehension problems with meaningful names,
  explicit decisions, cohesive helpers and reason/invariant comments. Preserve
  side effects/await placement, transactions/locks, cancellation/errors, React
  hooks/identity/dependencies, rendered states and accessibility. No hollow wrappers,
  arbitrary splitting, blanket memoization or compressed formatting.
- AC-3: Remove three exact persistence size exceptions through cohesive
  decomposition: conversation-turn-admission, text-content-mutations and
  texts-job-admission return to the ordinary 500-line limit. Preserve store
  exports and transaction authority.
- AC-4: Focused batch checks and final static/full automated/build/affected real
  browser/DB/critical checks pass. Independent completion and risk-triggered
  security reviews resolve all relevant findings.
- AC-5: Coverage, remaining deferrals, source/evidence identities and backlog
  status reflect reality. No sample-only whole-codebase claims or unrelated
  feature completion.

## Inventory and ownership

`evidence/codebase-readability/inventory.json` contains 3,155 files with before-hashes
at 252de64. Owner path lists: `/tmp/languon-bl019-<owner>-files.json`. Workers own
separate supporting ledgers under the evidence directory; root merges dispositions
and validates coverage. Record files only after reading implementation/declarations.
New helper files need audit entries. Do not omit unreviewed paths.

| Owner                       | Responsibility                                         | Initial files |
| --------------------------- | ------------------------------------------------------ | ------------- |
| backend-conversations-texts | Conversation/Text modules and corresponding tests      | 132           |
| backend-content             | Knowledge/Dictionary/Learning/Speech modules and tests | 544           |
| backend-platform            | Remaining backend/config/infrastructure/Mastra/tests   | 518           |
| web-features                | Web features/entities                                  | 578           |
| web-composition             | Web app/pages/widgets/tests/app-local config           | 686           |
| frontend-foundation         | Web shared primitives, admin and mobile                | 354           |
| root-tooling                | Packages/scripts/infra/panel/workflow/root config      | 335           |

No worker edits another owner's files, root rules/config or another ledger.
Preserve concurrent edits; coordinate shared callers through root. Root retains
scope, integration/product decisions and serial heavy-test scheduling. Serena
TypeScript symbol/reference tools are available; unsupported languages use scoped
text/AST fallback. Whole-file reading is justified by this explicit audit request.

## Verification plan before implementation

Baseline reuse: aggregate `pnpm check` passed before clean commit 252de64. BL-018
also retained 15 critical flows/819 passing cases, including real-DB contracts
68 files/791 cases. Reuse only unchanged seams; no duplicate full baseline run.

- Before editing, each worker records the concrete problem, invariants, callers,
  exact focused command/selection and setup in its ledger, then reports to root.
  Compare alternative extractions for material choices. Stay at existing seams.
- Workers may format/lint only owned changed files. Root schedules all Vitest,
  types, builds, browser/DB and critical execution; no competing package cleans,
  services or resets. Exact file filters only, no ambiguous `--` forwarding.
- Initial persistence proof: existing focused store tests, then reviewed execution
  plan for `node scripts/run-critical-flows.mjs --flow ai-conversation --flow ai-text`.
  Runner-owned disposable infrastructure retains real transactions, roles, fencing
  and settlement. Read DB/testing policy. Estimate several minutes; cold cost unknown.
- Frontend: affected existing tests/types, preserved approved UI pattern and
  output. Changed visual/interaction behavior requires corresponding browser/device
  evidence. Mapped Playwright proof may satisfy browser requirements where valid.
- AI: apply the execution regression matrix, production factory/SDK, normal/reduced
  budgets and cancellation. No paid calls; readiness/live proof remain separate.
- Final stabilized/reviewed state: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, all root test-prelude groups,
  `pnpm exec turbo run test --concurrency=1`, `pnpm build`, full
  `pnpm test:e2e:critical`, plus affected mapped journeys outside the registry.
  Run aggregate `pnpm check` on the warmed final state. Breadth is explicitly
  requested and justified by shared/app-wide impact. Prior runs suggest minutes
  for static/unit/build gates and 20–30 minutes for the full critical gate;
  source audit/refactor duration depends on actual findings.
- Preserve/restore generated Next declarations byte-for-byte. Synthetic data and
  owned disposable infrastructure only. Never raise timeouts, weaken tests or
  bypass controls for green results.

## Progress and decisions

Inventory complete, all dispositions initially pending. First implementation
priority: three temporary persistence exceptions. Independent scopes continue
with durable checkpoints. Initial persistence decompositions and first backend/frontend clarity batches implemented; broad audit remains in progress. Stabilized batches and final
evidence get independent review; material trust/data effects require security
review. Existing workflow/command/catalog authority remains unchanged.

Rollback only this task's scoped changes against 252de64, preserving unrelated
work and predecessor records. Stable public exports keep batches reversible.
Document necessary deferrals instead of silently changing accepted behavior or
declaring an incomplete audit done.

## Early integrated proof and root tooling batch

- DB-1: `node scripts/run-critical-flows.mjs --flow ai-conversation --flow ai-text`
  passed 171 tests/9 files, no skips/retries,303.040s. Run
  `557b3ce9-80b4-49af-8703-1870079dd8d6`; ignored reports under test-results/critical-flows,
  log /private/tmp/languon-bl019-persistence-preflight.log. Runner-owned local
  PostgreSQL/Redis, clean migrations, synthetic deterministic model transport.
  This proves the initial three persistence decompositions; later affected edits
  require new evidence. Source writes were paused for the whole run.
- POLICY-1: `node --test scripts/eslint-persistence-readability.test.mjs` passed9/9
  after removing all three exact-file allowances and retaining the ordinary500
  limit. Real ESLint configuration now rejects501 lines for each former exception.
- Inventory expanded by8 maintained NGINX/env/build/editor configuration files
  initially omitted by extension filtering. Total3155 original paths. Packages129
  reassigned to backend-conversations-texts worker with separate packages.json ledger;
  root remaining214 paths. Root body audit currently70 entries.
- Next root batch before editing: extract private dictionary generation and
  production data validation stages from assertDeployConfig at identical call
  positions; preserve config reads, first-error precedence, messages and exports.
  Consider separate cohesive worker-privilege policy module from deployment only
  after caller/test inspection. No deployment execution or policy changes.
  Exact proof: `node --test infra/deploy/tests/config.test.mjs
infra/deploy/tests/deployment.test.mjs infra/deploy/tests/shared-speech.test.mjs
infra/deploy/tests/production-security.test.mjs` (synthetic adapters, seconds).
  Root full release/tooling gates will include unchanged transitive consumers.

- Root policy extraction selected after reading all deployment/manifest bodies and
  callers: move only stateless privilege validation/query construction into
  worker-database-privileges.mjs; retain every public export through deployment.mjs
  and exact SQL output. The existing source-authority test reads both modules after
  the move and keeps all schema-name/retired-name assertions. No deployment phase,
  await or policy edits. Verify literal query/column export equality against base,
  then rerun focused root checks39 cases and existing disposable role contracts in
  final broader verification. Config helper extraction already passes39/39 focused
  root tests; log /private/tmp/languon-bl019-root-preflight.log.

- READINESS-BASE: read-only `node scripts/dev-doctor.mjs --json` reports runtime
  ready=true, all 119 prerequisite checks pass. Sanitized report retained
  /private/tmp/languon-bl019-baseline-doctor.json. This inspects existing local
  configuration only; deterministic proof and live provider execution stay separate.
- WEB-1: nine focused profile/media/learning/style files passed88 tests, no skips
  (5.96s); /private/tmp/languon-bl019-web-preflight.log.
- BACKEND-1:11 focused MCP/worker/learning/Knowledge unit files passed105 tests,
  no skips (7.11s); /private/tmp/languon-bl019-backend-preflight.log.
- ADMIN-1: four existing provider-price/accounting files passed14 tests, no skips
  (7.19s); /private/tmp/languon-bl019-admin-preflight.log.
- WORKER-1: fixture and Text worker files passed16 tests, no skips (5.69s);
  /private/tmp/languon-bl019-conversation-worker-preflight.log.
- Config differential preservation:1402 deterministic stage/production config
  mutations match base252de64 outputs/errors and exact property-read order.
  Existing39 root preflight cases pass again after policy extraction; SQL strings,
  column arrays, validator body and public export keys are identical to base.
  Later affected source edits invalidate these preflight results; full final gates
  remain pending.

- Next bounded root decisions batch: replace workerSupports nested capability-to-
  readiness selection with a private ordered selector after its existing shape
  conversion; expand release manifest repeated-value decisions into explicit
  branches; replace identical Codex event status branches with the same literal.
  Preserve short-circuit order, option truthiness/list identity, public exports and
  event projection. Existing checks: node --test scripts/dev-readiness/checks.test.mjs
  scripts/dev-readiness/cli.test.mjs scripts/release-manifest.test.mjs
  web-dev-panel/test/codex-events.test.mjs (deterministic, synthetic, seconds).

- Audit rebalance: foundation's354 original bodies complete; the worker now owns
  read-only audit of211 exact web-test paths (web-tests.json). Four already-reviewed
  test paths stay with web-composition. Composition finishes original source, then
  takes116 untouched Knowledge feature paths (web-knowledge.json); features retains
  other462 originals. Exact lists under /private/tmp/languon-bl019-{web-tests,web-knowledge}-files.json.
  Inventory owner mappings reflect these disjoint handoffs; original total unchanged.

- Packages129 and Conversation/Text132 original body audits complete with current
  hashes, no deferred paths. That worker now owns read-only audit of155 untouched
  backend-platform tests/** paths (~47.6k lines), separate backend-platform-tests.json.
  Platform retains363 source/config/colocated-test originals. Both owners confirmed
  no read/edit overlap; inventory mapping updated from exact path list.

- Root embedded-script finding: resources/dashboard.mjs contains handwritten
  browser logic compressed into a few long template lines, outside normal JS
  formatter coverage. Expand only that script with pinned Prettier after rendering
  synthetic empty observations; preserve the data-escape insertion and every AST
  operation. Compare normalized TypeScript ASTs before/after and run existing
  resources.test.mjs (CSP/injection + synthetic runtime checks). Preserve HTML/CSS
  and runtime behavior; retain a rendered artifact observation if needed.

- Composition original475 and Knowledge116 body audits complete. Composition now
  owns15 untouched sentence model/API/hook paths after finishing form extraction;
  separate sentence-model.json. Features retains447 original paths. Exact source
  list /private/tmp/languon-bl019-sentence-model-files.json; inventory synchronized.

- Platform363 original body audits complete; independent source/security review
  follows focused author preflight. To balance actual remaining volume,63 unread
  content tests (~44k lines) transfer read-only to platform worker after review,
  and60 unread dictionary source files (~24k lines) transfer read-only to composition
  worker after review. Exact manifests exclude durable content dispositions; owner
  confirmed no in-flight writes/reads. Content retains421 original paths, including
  all existing changes; new ledgers backend-content-tests and backend-dictionary-source.

- Test audit found one concrete baseline cleanup omission: provider-circuit suite
  enables three environment flags and captures all three, but restores only two.
  Add the missing DeepSeek restore tuple (no assertion/runtime changes) to keep
  subsequent tests isolated. Provider-circuit DB case will run as supplemental repository proof
  because the fixed critical registry omits that file; the independent finder will inspect the fix.

- Foundation web-test211 actual-body audits complete. Worker takes29 unread panel
  source/test/config paths (~10k lines) read-only, separate panel-audit.json; root
  retains185 original tooling paths and existing changed files. This is an audit,
  not a catalog reconciliation or command authorization.

- Independent initial reviews: review-platform.json (root/Conversation/Text/contracts)
  and review-composition.json (backend platform/content) report no material findings,
  with exact source identities and independent authority/AST checks. Final evidence
  approval remains pending. Later source changes receive bounded remediation review.
- Web early typecheck passes. WEB-2 integrated12 files pass174 tests (7.86s),
  WEB-3 shared/auth/practice8 files pass90 (5.06s), contracts2 files pass30 (361ms),
  worker/parser/route/Redis5 files pass61 (3.25s). Logs under matching bl019 preflight
  paths in /private/tmp; future affected edits invalidate these early results.
- Dashboard final existing10 tests pass; normalized rendered script syntax matches
  base (ignore grouping and single-return optional braces), surrounding HTML/CSS
  byte-identical on empty and malicious-value fixtures. Proof
  /private/tmp/languon-bl019-dashboard-ast.json and dashboard-final-preflight.log.
- Six unread infrastructure test files (~3k lines) transferred read-only to the
  Conversation/Text worker after independent frontend review; separate infra-tests.json.

- Source review-conversations.json independently reports no material findings for
  foundation/admin/shared and composition/Knowledge/sentence changes (36 paths),
  with exact hashes and remaining final/browser evidence explicit.
- Features447 source audit/static checks complete; foundation independently reviews
  its77 changed paths now. Features worker takes56 unread root/tooling source/test
  paths (~14.5k lines), read-only tooling-remainder.json. Root retains the already
  reviewed tooling and changed source; exact inventory owner mapping synchronized.

- Independent finding INFRA-AUDIT-1 (medium, pre-existing): the opt-in deployment
  overlap DB fixture predates current schema/grants/column decoding. It cannot
  prove current deployment privilege behavior. Defer dedicated fixture actualization;
  do not weaken its policy assertions or claim this skipped optional harness passed.
  Modified privilege SQL/validator remain byte/body-identical to base and have
  independent proof; current real production-role/AI execution selections still run.
- Tooling baseline finding: deploy-remote scp argv appears to reuse SSH lowercase
  -p instead of scp uppercase -P. No remote action executed. Record separately from
  readability; deployment behavior is outside current improvement authority.
- First backend typecheck exposed a private user-profile error mapper parameter
  typed unknown while its unchanged fallback expects Error. Original Hono callback
  is Error; author restored that private input type, preserving branches/shared
  mapper and passing scoped lint/format. Backend typecheck rerun pending.
- Final25 unread colocated content tests (~11.6k lines) transfer read-only to
  composition after its completed60 dictionary audit; content retains396 originals.
  Exact list /private/tmp/languon-bl019-content-colocated-tests-files.json, separate
  content-colocated-tests.json. All transfer boundaries confirmed no in-flight writes.
- Root final readability batch: validateRegistry's negated app-kind ternary mixes
  exact backend selection and browser shape predicates. Extract ordered private
  predicates and retain identical first-error/read order and all guards; run existing
  scripts/critical-flows/registry.test.mjs and differential malformed-flow proof.

## Final verification progress

Source freeze: all 3,220 maintained files (3,155 originals plus 65 helpers) match
inventory hashes; all 188 changed maintained paths have current independent
source/security review coverage (`source-freeze-platform.json`). All 881 frozen
historical artifacts remain byte-identical. Final focused Texts checks pass:
2 files / 9 cases. Backend typecheck remediation passes.

Serial final gates 1–18 passed: formatting, lint, all workspace type checks,
root tooling suites, serial full workspace tests, production builds, critical
registry and user-flow documentation validation. Exact commands/timings/logs:
`/private/tmp/languon-bl019-final-gates.json`. Normal suite explicitly removes
optional deployment/live DB flags; skipped disposable integration tests are not
claimed as runtime proof. Dedicated critical and supplemental runs supply that
proof. No paid model or remote deployment call was made.

Gate 19 (`pnpm diagrams:check`) correctly reported nine stale source fingerprints.
Reconcile each affected diagram against final changed inputs/new helper seams
before stamping; independent source owners have disjoint diagram assignments.
No runtime source is reopened. Full critical regression now runs serially while
this documentation reconciliation proceeds. Aggregate `pnpm check` follows the
reconciliation; its earlier planned step 20 has not yet run.

Final critical invocation `afeaba9a-e36c-44c1-8704-357f7e1ff153` stopped after
12 browser groups passed and AI contracts reported 790/791 passing, zero skips.
The one failing accounting case was unchanged baseline code: it reports October
2026 while helpers create provider expenses using PostgreSQL's real November
clock. Exact zero-expense mismatch and SQL clock/deadline proof are recorded in
`diagnose-accounting-clock.json`. Independent review rejects fake Date/timers:
SQL timestamps and lease expiry require the real clock. The bounded test-only
fix aligns manual facts and its shared report/invoice window to one DB-clock
reference, ±one day (within the public 366-day limit), retaining every financial
and cached-snapshot assertion. All other payment helper calls retain their
original default. No production source changes. Inventory updated: 124 original
refactors plus 65 new helpers; 3,029 acceptable originals and two deferrals.

Rerun the complete accounting test file and the remaining speech critical flow.
Reuse only unaffected passing evidence with matching source/test/config hashes;
do not describe the failed comprehensive invocation as passing. Supplemental
8-file DB/cache batch runs independently; final aggregate remains pending.

Supplemental runtime findings and bounded remediation:

- Eight-file DB/cache run `b6cfd56e-75a4-41dd-9a94-c2f473257d08`: 70/94 pass,
  24 fail across four unchanged/stale fixtures. Independent diagnoses are in
  `diagnosis-supplemental-{platform,content}.json`. Actual isolated 252de64 source
  comparison reproduces all 24 failures: 23 in the initial four-file comparison,
  plus the same purge permission failure after supplying its baseline role SQL
  and rerunning the full 8-case purge file. See `baseline-supplemental-comparison.json`.
  These are baseline failures, not passing evidence; 21 preparation setup failures
  and the circuit setup failure leave their intended assertions unexecuted. No
  privilege relaxation, assertion removal or production fix is authorized here.
- Full accounting file now passes 10/10 with no skips/retries and clean owned
  infrastructure cleanup: `9330ada1-d32f-4d4a-9a96-f7b13bc8d840`. A first local
  remediation run exposed raw PostgreSQL timestamp strings; explicitly decoding
  with `new Date` fixes only that fixture conversion. Independent review and
  inventory hashes include the final conversion.
- Remaining speech critical selection passes its prerequisite contracts and all
  4 browser cases with zero skips/retries (`final-runtime-first.json` in /tmp).
- Combined supplemental web fixture was an execution-planning error: sentence
  mode replaces the dictionary worker, and the sixth signup hit the existing
  IP limiter. Re-run separate owned fixtures; do not relax limits. Profile passed
  originally. With normal dictionary worker, import and inline-authoring both
  pass; their exact report is in supplemental run `87f0dd72-d39d-447d-8eaf-84287f577584`.
- Two baseline browser fixture corrections preserve all assertions/timeouts:
  sentence fault injection now targets the browser's same-origin `/api` URL
  instead of direct backend fixture URLs; flashcard playback seeds existing
  guarded synthetic prices for its verified actor (same helper used by sentence
  and shared-pronunciation journeys). Independent source reviews cover both.
  Root temporary driver isolates sentence selections, preserves Next declarations,
  and gives future artifacts unique output paths. Document MinIO uses a temporary
  compose overlay allowing only the owned loopback browser origin on port 3435;
  checked-in storage/security configuration remains unchanged.

Current source inventory: 3,220 audited; 126 refactored originals plus 65 new
helpers, 3,027 acceptable originals, two documented source deferrals. Final
runtime/aggregate approval remains pending; baseline harness failures stay visible.

Additional final runtime evidence:

- Accounting10/10, flashcard1/1, sentence history1/1 and full background
  preparation1/1 now pass with no skips/retries after independently reviewed
  fixture-only corrections. The history fix also follows refreshed tokens through
  the browser proxy. Preparation injected notices explicitly clear the unrelated
  exhausted-budget flag; existing budget-required notice coverage remains intact.
- Texts2/2 and Knowledge2/2 pass via the existing guarded critical runner's
  explicitly supported alternate ports55487/56487 and55488/56488; strict wrapper
  default ports were occupied by unrelated existing fixtures and remain untouched.
  Evidence: `/private/tmp/languon-bl019-extra-browser-f6a56ead-be24-487c-a022-914295f4129a`.
- Document upload/cleanup/review1/1 passes with owned MinIO; all owned resources
  cleaned. Diagram viewer browser test renders every diagram at desktop/mobile
  widths and passes (including the corrected admin-routing label).
- Isolated admin tariff fixture required its existing price calibration, relative
  selected-tag detection (prevent repeated configuration from deselecting the
  route), explicit validated server-quote confirmation, and API-matching synthetic
  worker credentials. Every original tariff/snapshot/acceptance assertion remains.
  Intermediate run `502c4d6b-f220-432f-9ef6-a1e51f8d9f4f` passed all pinned-SQL
  assertions but correctly failed execution at the mismatched-credential fence.
  Source proof and each causal step are in `diagnosis-admin-tariff.json`; final
  full scenario plus affected setup/routing checks remain pending.
- First aggregatecheck attempt stopped at one padding-rule violation in the
  sentence fault matcher. Added the required blank line; scoped lint passes.
  This is not a behavior change; no runtime repetition justified for that line.

Final source inventory now193 changed maintained paths:128 refactored originals
plus65 helpers;3025 acceptable originals;two source deferrals. No new product
capabilities, dependencies, paid model calls, remote deployment or credential/
permission policy changes. Unrelated baseline24 failures remain explicitly open.

Final browser closure:

- Complete tariff journey passes in `6e3a822d-61f6-41f8-812f-443582c52db8`:
  strict pending-report helper requires schema-valid same-period200 before leaving
  Accounting and validates every observed503's exact pending protocol, origin,
  method and Retry-After2. No generic reporting-error whitelist. Validation
  failures are caught immediately and awaited/asserted at the end. The dedicated
  cohesive helper keeps this protocol out of the tariff scenario body.
  Successful traces are discarded by maintained Playwright policy; executed
  assertions prove mandatory200 plus validation of any observed503, not an
  independently retained503-to200 network count. Earlier failed trace documents
  actual pending503 and navigation cancelling its retry; reporting modules are
  byte-identical to baseline (`diagnosis-admin-report.json`).
- Affected critical setup/routing selection passes3 browser cases, zero skips,
  110717ms: `/private/tmp/languon-bl019-admin-critical-remediation.log`.
- Both sentence journeys pass together on final sentence-source revision in the
  final owned batch (`/private/tmp/languon-bl019-sentence-final-driver.log` plus
  its summary/report). Whitespace-only lint correction changes no behavior.
- Final aggregate invocation now runs after all source corrections are frozen;
  no further source implementation is planned. Source-review remediation covers
  all193 changed maintained paths; evidence/metadata are the remaining edits.

Resource-bound aggregate strategy:

The default aggregate reached unit tests but seven admin cases hit their unchanged
5s limit under workspace parallelism. Workspace serialization alone subsequently
suffered web fork-start stalls and seven failures over2894s (six failed files plus
five worker-start errors), while backend1855 passed. Preserve both failed logs:
`/private/tmp/languon-bl019-aggregate-contention.log` and
`/private/tmp/languon-bl019-serial-worker-stalls.log`. Do not reclassify them as
passing. Host inspection showed scarce free memory; installed Vitest4.1.10
uses available CPU count for its default worker pool. No unrelated service/app
was stopped and no timeout/assertion was weakened.

Final runner now uses a minimal environment whitelist (PATH,HOME,PNPM_HOME,TMPDIR,
CI), CI=1, VITEST_MAX_WORKERS=1 and TURBO_ENV_MODE=loose; the latter is verified by
Turbo dry-run metadata and is required to pass the worker cap through. No provider,
credential or opt-in deployment variables are inherited. It runs the same complete
workspace suites serially, then the actual `pnpm check` with the same bounded
worker environment and preserved Next declaration, then read-only JSON doctor.
No permanent source/configuration change is needed. Distinguish this documented
bounded invocation from the host-contended default attempts. Final results pass and are recorded in
`evidence/codebase-readability/final-verification.json`.

## Final closure — Complete

BL-019 is complete with the baseline limitations below. Independent completion
approval is recorded in
[evidence/codebase-readability/final-evidence-approval.json](evidence/codebase-readability/final-evidence-approval.json).
Source and evidence hashes are bound there; no material introduced findings remain.

- Audited all 3,220 maintained files: 3,155 originals and 65 new helpers.
  Refactored 128 originals, accepted 3,025, and documented two source deferrals.
  All 193 changed maintained paths have current independent review coverage.
- Final complete workspace suites passed: backend 1,855, web 1,303, admin 106,
  contracts 237, plus shared packages and Node tooling. Normal opt-in DB skips
  remain distinct from runtime evidence. The actual `pnpm check` passed with
  the documented sanitized, single-worker environment; default host-contended
  attempts remain recorded failures. No assertion or timeout was weakened.
- Runtime evidence reconciles 791 unique critical backend assertions using the
  failed raw 790/791 invocation and the exact passing ten-case accounting-file
  replacement. The raw invocation is not relabelled green. Remaining speech
  contracts and browser checks, affected admin setup/routing, 12 additional
  product browser cases, and the all-diagram browser render passed.
- All nine diagrams and 33 user-flow guides/mappings validate. The capability
  doctor is ready with 119 passing checks. No live paid-provider proof is claimed.
- All 881 frozen historical files and the tracked Next declaration are unchanged;
  no conflicts or unexplained changed paths remain. No dependencies, production
  contracts, permissions, deployment, UI content or model/prompt behavior changed.

The 24 baseline supplemental failures remain unresolved and reproduced against
252de64: 21 preparation cases fail during setup, one circuit test fails before
its intended assertions, and two stale readiness/purge expectations fail. Modern
passing coverage does not replace those 22 unexecuted assertions. Separate
fixture actualization should retain all assertions and use current route seeding,
fenced purge authorization, immutable revision identities and named active models.
The optional deployment-role fixture and existing SCP port-flag problem are also
separate follow-ups; their deferrals are retained in the audit evidence.

Rollback: revert only this improvement's source/helper changes and associated
mappings as one scoped change, preserving unrelated work. No data migration,
production rollout or cleanup is needed. Git commit was not part of this turn.
User acceptance/retrospective is pending; technical completion does not wait for it.
