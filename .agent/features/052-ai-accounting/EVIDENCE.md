# Verification evidence: AI accounting, performance and abuse controls

Updated: 2026-10-22. Feature remains In progress. Functional, build, database,
browser and AC9 performance evidence is linked below. Independent completion
review, final build refresh and remaining feature gates are outstanding.

## Acceptance coverage

| Criterion | Current proof | Remaining |
| --- | --- | --- |
| AC-1 | Exact pricing/parser tests; migrations through0106; published cached-rate propagation and worst-case reservation25 focused tests | Final independent review |
| AC-2–3 | Actual worker11; conversation action16; preparation21+restricted role1+composed2; legacy sentence1/document2; portrait32; expiry preserves charges | Final independent review |
| AC-4 | Free portrait browser, policy/quota integration, shared operator controls; actual quota mutation/cleanup denial proof | Final review of exemptions |
| AC-5 | Capacity14; compact wallet/capacity projections; maintenance expiry9 and both entrypoints pass | Independent completion review |
| AC-6 | Durable store/source/lease tests; learner browser journeys with quote, Stop, Continue and exact billing; Stop lock regression37/37 | Independent completion review |
| AC-7 | Financial9; speech49; actual purge coordinator1; seven targeted scheduled-deletion checks; earlier unchanged admin journey | Final financial/privacy review |
| AC-8 | Real Redis burst/outage proofs; checked worker dispatch, fenced financial recovery and bounded speech quota cleanup | Final security review |
| AC-9 | Final source-stable real Hono/Redis/SSE load:300/300,100 streams,1m ledger rows, loaded p95 94.457ms | Independent completion review |
| AC-10 | ADR0045, operations guide,28 guide mappings, learner/admin browser journeys 8/8; web build/typecheck/lint, backend typecheck/lint/build, clean development DB cutover | Local feature squash merge |

Final supporting evidence: [records/speech](evidence/accounting-records-speech.md),
[legacy generation](evidence/legacy-generation.md),
[frontend and speech follow-up](evidence/frontend-followup.md),
[final remediation browser proof](evidence/browser-remediation-20261022/EVIDENCE.md),
[diagrams](evidence/diagrams.md), and
[independent performance assessment](evidence/performance-tester.md).
Earlier entries below retain the scope and limitations of their original runs;
latest supporting records take precedence for affected final tests.

## Check records

### E-WALLET — Real PostgreSQL wallet invariants

Wallet worker reports31/31 passing against the dedicated loopback55481
`languon_auth_accounting_test`, using disposable safety guards. Runtime98.85s.
Includes pre/postdispatch technical failures, hold/release report-dirty behavior,
consumption/removal and purge. See [wallet detail](WALLET_EVIDENCE.md).
This predates the final operator-purge and capability adapter revisions; affected
cases must be rerun after the final migration composition.

### E-MAINTENANCE — Bounded scheduler

`pnpm --filter @languon/backend exec vitest run tests/unit/infrastructure/text-ai/accounting-maintenance.test.ts`
passed2/2. Proves no overlapping maintenance, awaited shutdown and rescheduling
after failure. Does not establish database cleanup correctness or latency.

### E-PRICING — Exact arithmetic

`pnpm --filter @languon/backend exec vitest run tests/unit/modules/ai-credits/domain/model-price.test.ts tests/unit/modules/ai-credits/domain/provider-expense.test.ts src/modules/ai-credits/domain/action-pricing.test.ts src/modules/ai-credits/domain/provider-cost-admission.test.ts`
passed16/16. No paid services.

### E-ADMISSION-UNIT — Selection and units

Focused speech policy suite passed7 tests after milli-credit/fractional tariff
expectations were corrected. Focused text-ai-admission-participant17/17 passed
after its fake overlap query recognized the new bound `conversation-turn` value
rather than a retired history-table SQL literal. Production availability checks
were preserved.

### E-FRONTEND — Learner controls

See [frontend checks](evidence/frontend-checks.md):26 focused tests and scoped lint
passed. Real browser evidence remains outstanding. No claim that component tests
establish rendered usability or end-to-end billing.

### E-ADMIN — Administrative controls

Worker reports cached-tariff contracts7/7, focused admin9/9, contracts build,
admin typecheck and scoped lint passed. Additional actual-role PostgreSQL tests
are authored and queued. Earlier broader50-test admin run predates followups.

### E-BACKEND-TYPES — Compilation

Backend `pnpm --filter @languon/backend typecheck` session46663 passed before the
latest interview/cache/speech integration. Final typecheck is still required.

## Environment and execution coordination

Database suites reset schemas and run sequentially on the shared dedicated
integration database; no concurrent reset is permitted. Separate load database
`languon_auth_accounting_load_test` and Redis56381/db3 are reserved for performance.
Private environment files are not evidence artifacts; credentials are omitted.
No development application database has been reset or switched, and no paid
provider request has been used for tests.

## Remaining evidence

Final source hashes, clean/repeated migration checks, old-ledger rejection proof,
real restricted worker/purge role checks, all feature adapter settlement paths,
real browser/E2E and load harness execution. Independent completion/security and
specialist tester assessments follow author preflight. No acceptance criterion
is marked complete solely from compilation.

### E-UNIT-REGRESSION — Backend unit regression surface

`pnpm --filter @languon/backend exec vitest run tests/unit src/modules/ai-credits/domain/action-pricing.test.ts src/modules/ai-credits/domain/provider-cost-admission.test.ts src/modules/conversations/infrastructure/ai/accounted-tutor-model.test.ts`
passed127 files /1,026 tests in48.73s. This includes the intentional milli-unit
expectation and overlap-fixture corrections. Speech's subsequent new USD adapter
and later Stop repair still need affected tests; this is not final whole-backend
proof.

### E-CAPACITY-AUTHORITY — Real compact projection and policy guards

Wallet worker reports latest14 capacity and10 authority cases passed against the
exclusive disposable PostgreSQL target (24 total,7.80s). Includes typed feature
binding and duplicate capacity suppression. Final nullable/zero-tariff refinements
were appended in0095/0096 and require affected revalidation.

### E-RECORDS — Financial retention and actual purge role

Records9/9 real PostgreSQL tests passed30.61s after correcting the restricted
role's retired charge_numerator column grant. Includes actual role script,
denial of private financial JSON, checked due deletion lease, preserved anonymous
purchase revenue attribution, immutable expenses, retained global provider spend,
and removal of private operator-day identity. Source integration of speech is
subsequent and not covered by this result.

### E-ACTION-FINAL — Atomic actions and measured partial Stop

The exclusive disposable PostgreSQL run of
`tests/integration/modules/conversations/conversation-action-accounting.test.ts`
passed all 15 cases against migrations through0096 on2026-10-22
19:45:15–19:45:22 (6.44s total). The initial unprivileged attempt failed with
connect EPERM before database access; the authorized rerun supplied this evidence.
Cases include compact shared-wallet conservation, one action settlement,
technical failure release, unknown operational liability, cross-model operator
caps, zero tariff without deposit, invalid cache meters, real queued/running Stop,
and measured partial Stop through the production accounting adapter. The latter
charges measured partial output only with aborted provenance and a durable
explicit_stop marker, while retaining an earlier measured technical failure as
ineligible. This test does not replace final restricted-role or browser coverage.

The affected conversation/interview/pricing test command passed20 files /174 tests
in7.71s after the partial Stop repair. Scoped ESLint passed for the model gate,
accounting adapters, port, and integration test. No provider service was called.

### E-CUTOVER — Genuine forward migration rejection

Isolated `languon_auth_accounting_cutover_test` on loopback55481 was provisioned
separately from the integration/load/app databases. The guarded command ran
`tests/integration/database/accounting-cutover.test.ts --hookTimeout120000 --testTimeout30000`
and passed3/3 in5.87s. Tests apply byte-identical migration prefix through0088,
seed a7-unit legacy grant or queued/running free legacy interview using its
required capacity transaction, then run the genuine remaining migrations.
They verify SQLSTATE55000 from the empty-ledger/drained-work preflight, unchanged
legacy amounts and unchanged active job state. Initial malformed job fixtures
were corrected to acquire the established capacity marker; production guards
were not weakened. No application database was touched.

### E-WORKER-ROLE — Exact restricted generation grants

`tests/integration/database/dictionary-worker-accounting-role.test.ts` passed3/3
in3.87s against current0097. Uses the actual deployment role script and
`SET LOCAL ROLE`, including exact successful200-milli charge, technical-failure
zero charge/full release, expense and operator accounting, replay deduplication,
and eight direct mutation denials (SQLSTATE42501). Subsequent speech grants and
its pending custom function require affected role verification after0098.

### E-ACTION — Real outcome and partial Stop

Action worker reports15/15 real PostgreSQL cases on0096, including measured
partial Stop through the actual accounting adapter with durable Stop marker;
earlier measured technical failures remain uncharged. Affected20-file unit
regression174/174 passed7.71s. The test's incomplete execution cast was replaced
by a complete typed synthetic model snapshot afterward; rerun its focused case
with the final adapter suite. See worker's E-ACTION-FINAL entry for details.

### E-PROGRESS-FINAL — Streaming fences and final action settlement

See [streaming contention](evidence/streaming-contention.md). Final real PG
conversation-store37/37 passed46.23s, including crossed shared sources, Stop,
lease takeover, deactivation/deletion/revocation. The newly added capacity-lock
regression first failed before the private progress transaction fix.
Final action-accounting15/15 passed18.77s, session41958 exit0, same isolated
integration target through0099, after the progress path change. This also reruns
the earlier complete typed synthetic model fixture. No paid provider calls.

### E-ADMISSION-FENCE-FINAL — No new unaccounted dictionary work

[Legacy generation evidence](evidence/legacy-generation.md) records final28unit,
missing-managed-snapshot PG1 and composed-route PG4 passing; backendtypecheck,
scopedlint and28guide checks also pass. Synthetic fixtures now calibrate reviewed
synthetic provider rates, operator caps and managed snapshots and explicitly use
deterministic dispatch. No unaccounted live-provider exception was introduced.
Old admitted jobs/lifecycle access remain supported.

### E-PERFORMANCE-QUALIFICATION — Raw historical artifact loss

The independent tester confirmed the initial777.568ms raw JSON was overwritten
by a subsequent invalid saturated fixture run. Historical console metrics remain
recorded for diagnosis only and are not reusable acceptance evidence. The invalid
run is explicitly named accounting-load-saturated-invalid.json. Final9running/
91queued, production5000ms heartbeat evidence uses a distinct output path and
must establish AC9 independently. No passing latency result exists yet.

### E-DEFAULT-COPY — First-use maximum remains stable

Root guarded dedicated PG run of tests/integration/database/action-budget-default.test.ts
passed3/3 in7.95s, session98738 exit0, through0099. Tests atomicconcurrentcopy,
adminraisingdefaultafterfirstcopy and explicitmanualmax/modelpreservation.
Central text admission calls helper after model/rate validation; focused existing
selection17+newtransaction-lock2 unit cases passed19/19 in678ms. Subsequent
checkedSQL/persistence migrations require fresh affected integration proof.

### E-REVIEW-REMEDIATION — Open gates

Initial [completion](evidence/completion-review.md) and
[security](evidence/security-review.md) verdicts are NOT READY. Their findings
remain open until source and valid restricted-role/consent/preparation/runtime
checks plus independent remediation verdicts close them. Earlier acceptance map
is superseded where affected; no finalclaim ormerge permitted yet.

Free portrait browser follow-up passed1/1 in15.5s with exactFree30/day/1active
notice, real202 and SQLoperator-fundedsettledaction charge0 plus independent
140USDmicro expense. See frontend-followup forsourcehashes; newremediation will
invalidate relevant admission/response paths andrequires affectedbrowserrerun.


### E-FINAL-REMEDIATION — final functional verification checkpoint

The latest source is identified by the supporting ownership manifests and final
review manifest. Applied0100–0106
are immutable;0106 SHA2565a7ec21376562bc66e56b0325bd72f1222a8948fd2c7fbaf41a8f7945686e1df.
Deployment classification remains contract/fresh-development-only, content hash
d97395b6d040c505e3c39c46c9a4fa0ea0f20ce35124eb1bb99a90affba65c83.
The fresh development DB cutover is recorded in E-DEV-CUTOVER below; the
portrait-repair database remains preserved.

- Final learner browser six outcomes pass: paid dictionary, Texts and signed-in
  shared collection maximum, paid sentence, shared preparation budget/explicit
  Continue, paid portrait and Free portrait. See final browser record; no paid
  provider was invoked. Frontend final web build23325, scoped lint69210 and
  guide validator20742 pass; generated Next declarations restored to HEAD.
- Luna independently bounded scope and repaired only dictionary test cleanup;
  final dictionary repository31/31 passes. Conversation authority10/10 passes;
  its negative expense test now deliberately bypasses the canonical observation
  helper, which correctly creates expense atomically. Terminal fixture clears
  the actual lease before testing permitted erasure; no runtime guard relaxed.
- Domain owners verified final conversation action16/16, portrait32/32,
  capacity14/14, actual sentence quote1/1 and document quote/publication2/2.
  Missing transaction wrappers caused offered sentence/document quotes to roll
  back; scoped wrappers preserve nonspending offers and explicit confirmation.
- Maintenance diagnostic reproduced a raw JavaScript Date serialization TypeError
  in quote expiry cleanup. New PG regression failed before the one-line ISO
  timestamp binding fix; all allowance/maintenance9/9 now pass (36744,3.16s).
  Both actual maintenance entrypoints then pass on the disposable database
  (text71.4ms, conversation9.5ms); these single timings are diagnostic, not AC9.
- Published cached-input rates were omitted from the central snapshot. Two unit
  regressions failed first; propagation and maximum pricing now use the higher
  possible input tariff with exact arithmetic. Selection/domain/metric25/25
  pass (24978). Backend final typecheck84236 and source/affected-test lint14729
  exit0 after this change. Earlier1027-unit run had1026 passes and one outdated
  signal-forwarding assertion; that assertion was corrected and its six-test
  suite passes. Changed readiness helpers separately have34 focused passes.
- Backend build2699 passed, but final expiry/cache body changes require a final
  emitted bundle refresh. No further broad tests are justified without new
  failures or source changes. Final actual store/authority47-case run passed.

### E-LATEST-AC9 — Global capacity lock remains the blocker

After the 750–1000ms queued-poll spread and 2s stream warm-up, the latest source-
stable run `4f219692-5b5d-4441-9b73-1c8457682eab` still fails AC9. It retained
100 SSE streams, 8 running and 92 queued turns, 10 admissions/second and one
million immutable ledger history rows. There were no stream or writer failures.
The baseline admitted 33/100 with p95 6071ms; the loaded phase admitted 176/300
with p95 4578ms. Capacity rejections remain in the results.

The run records low Node scheduling lag (max 53ms baseline, 9ms loaded), while
the global PostgreSQL advisory-lock query p95 was 3534ms and 1893ms. Independent
Luna read-only diagnosis attributes this to global lock serialization and a
near-full static queue in the fixture; it found no evidence that the latest
source micro-optimization caused the regression. Existing transaction paths
serialize admission and Stop under the same global capacity lock. SSE/progress
share locks can extend a mutation's time in that critical section, though the
samples do not establish which specific reader held which lock.

The final source change skips a dictionary settings query when resolving a
dictionary without material; that query is unused in this branch. Backend
typecheck passed after the change. The load result does not support an AC9 pass.
The accepted 100ms target is not credible for this topology without a safe
capacity-lock redesign. A 200ms threshold alone would not address the observed
seconds-long queueing or capacity rejections.


### E-AC9-LOCK-REDESIGN — Final accepted workload

The user explicitly chose to preserve the100ms p95 acceptance target and
authorized a larger lock redesign. Conversation admission now prepares source
material in an unlocked read transaction, closes it before final admission, then
reauthorizes the actor/source/chat under the existing global-first lock order.
The final path compares chat and source revision witnesses before any billing or
write. Dictionary settings revision is read without loading its full settings
row. Explicit Stop no longer acquires the global capacity fence; persisted row
locks, cancellation intent and transactional projection triggers still settle
its capacity and eligible partial usage.

The real PostgreSQL conversation-store suite passed37/37. It includes a regression
in which Stop proceeds while an unrelated transaction holds the global capacity
fence. Backend typecheck and scoped ESLint passed.

Final calibrated AC9 artifact:
`evidence/accounting-load-staged-final.json`, run
`6661b4e3-8f75-4d3a-9c6f-af2d36903f4d`. The source hash remained unchanged during
the run. It used100 real SSE subscriptions (8 running and92 queued),10 admissions
per second, and one million immutable policy-history rows. Baseline100/100,
p95 81.118ms. Loaded300/300,p95 93.280ms; no admission failures. Maximum sampled
advisory waiters2; loaded scheduling-lag p95 7.964ms. The run satisfies AC9.

An immediately preceding post-Stop-fence run measured loaded p95 103.474ms and
is retained separately; the final result follows the additional two query
reductions. Another earlier run had baseline p95 818.330ms, loaded277.089ms and
one capacity rejection. These artifacts remain diagnostic failures, not acceptance
results. The mixed legacy/current `conversation-accounting.test.ts` fixture was
updated to use its pinned historical tariff, clear trigger-maintained capacity
projections when truncating, and seed provider usage against the queued action's
pinned budget. Its final isolated PostgreSQL result is 15/15 passed; the AC9
artifact remains valid because runtime source hashes are unchanged.

### E-AC9-CLAIM-ORDER — final source with lock and preprocessing guards

After the independent review identified opposite lock-order and unbounded
preflight risks, Claim now performs its cheap capacity checks before source
authorization and stops after candidates that cannot safely proceed. Stop takes
shared lifecycle locks and reserves operator settlement locks before the status
update and capacity projection trigger. The conversation POST endpoint bounds
source preprocessing through learner/global Redis leases plus a dedicated rate
limit; all request paths release the leases.

Verification passed on the isolated disposable test infrastructure:

- PostgreSQL conversation-store and action-accounting suites: 55/55, including
deterministic Claim/Stop and operator/projection lock-order regressions.
- Redis concurrent-request suite: 6/6 across two clients.
- Conversation service/route unit suites: 9/9, including concurrent POST
rejection and lease release on success and failure.
- Backend typecheck, scoped ESLint and `git diff --check` passed.

Fresh AC9 performance artifact:
`evidence/accounting-load-claim-order-final.json`, run
`ae53ad48-d711-47ab-905e-accc509111bf`. It exercises 100 SSE streams (8 running,
92 queued), 10 admissions/second, and one million immutable ledger-history rows.
The loaded phase admitted 300/300 with no failures at p95 94.457 ms (median
53.510 ms); the source hash stayed unchanged during the run. This satisfies the
user-confirmed 100 ms AC9 target. Baseline latency is diagnostic; the acceptance
measurement is the million-history loaded phase.

### E-FINAL-BROWSER — learner and admin journeys

The guarded runner exercised the dedicated loopback learner PostgreSQL/Redis
targets with real web/API/worker processes and deterministic model fixtures.
Passed: budget/profile and output-limit journeys 2/2; paid dictionary and paid
text billing journeys 2/2; paid sentence and sentence-preparation budget
journeys 2/2; portrait interview approval journey 1/1. The paid-text test now
waits for the shared-reader source sentence to be visible after navigation; its
previous failure was a detached-element race, not a product failure.

The first admin run found its dedicated admin E2E database had stale schema and
old synthetic rows, so migration0105 could not add a required field. That
database was preserved. A second empty database in the dedicated admin E2E
container was created, and the accounting budget/payment browser journey passed
1/1 there. No paid provider was called. The existing application database was
not used by these browser journeys.

### E-DEV-CUTOVER — preserved-old/fresh-development database

Created empty local PostgreSQL database `languon_ai_accounting_dev_20261023`,
applied all107 migrations, and verified users, credit grants, and actions are
empty. Updated only `DATABASE_URL`, `DICTIONARY_WORKER_DATABASE_URL`, and
`POSTGRES_DB` in ignored `.env.local`. The existing
`languon_portrait_repair_20261021` database remains present and untouched. The
old admin and web development servers were stopped after confirming they were
from this workspace and predated the cutover; `pnpm dev:all` now starts the web,
admin, backend, and dictionary worker on the fresh DB. Backend `/readyz` reports
PostgreSQL and Redis ready; `/profile` returns200. No login account was created.

### E-FINAL-ACCOUNTING-TESTS — last fixture repair

`conversation-accounting.test.ts` passes15/15 against isolated disposable
PostgreSQL. The accounting suite uses a pinned synthetic 1000/3000
credits-per-million tariff (matching its immutable legacy action expectations),
resets compact test projections alongside source rows, and archives provider
usage in the exact queued action budget cohort. Backend typecheck and scoped
ESLint pass. Final `pnpm --filter @languon/backend build` exits0; declaration
generation completes. It retains the existing unused-import warning in the
dictionary document-ingestion module.
