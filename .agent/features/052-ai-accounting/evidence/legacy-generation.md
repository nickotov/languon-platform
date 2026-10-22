# Existing dictionary, sentence and Texts action integration

Status: Integrated implementation; final disposable PostgreSQL verification in progress. Independent completion/security review remains with the root feature delivery.

## Implemented surfaces

- New dictionary generation, sentence generation/check, text detection/translation and vocabulary selection jobs pin `selected_execution_snapshot.actionAccountingVersion: 1` and preserve their feature-owned job identity, input/result validation, authorization, fencing and execution tables.
- New admissions use one generic action hold at the job id, pinned customer/operator/unlimited funding, exact canonical customer tariff, learner/default action budget and reviewed provider price. Operator rates replace catalog placeholder costs without raising configured maxima; mandatory unconfigured economics fail closed through the feature's unavailable error.
- Claim admits a durable provider attempt before returning its narrowed limits. At most two attempts and 10,000 aggregate output tokens apply through the generic participant. A conservative UTF-8 payload plus 8 KiB input ceiling (dictionary/selection framing uses 32 KiB per bounded chunk) is passed to the provider adapter as an enforced preflight ceiling; this is not an exact tokenizer claim. Adapter snapshot clones contain the same narrowed budget, preserving the existing resolver equality guard.
- Only valid terminal success or authenticated explicit stop can charge eligible measured usage; failed/invalid output, revoked access and failed technical attempts release customer funds. Internal lifecycle cancellation carries `access_revoked` metadata and cannot become a billable explicit stop. Late provider usage cannot reopen a terminal action.
- Provider facts retain independently measured expenses or unknown liability. Definite undispatched work records zero execution cost; dispatched unknown work retains conservative operator exposure. Facts link the action attempt id.
- A known rate-limit rejection may retry once within the original action. Dispatched timeouts/ambiguous lost workers terminate without unsafe replay. Exhausted action allowance terminalizes queued feature work rather than leaving an indefinitely queued hold.
- Immutable legacy per-attempt jobs keep their original guards. Their remaining measured pricing uses exact milli arithmetic; their technical failures use the explicit `settleFailedAttempt` API rather than fabricated provider-reported zero usage or full-reservation billing.
- New SQL source `legacy-action-accounting.sql` validates feature/action/policy/owner/capability/tariff/budget/provider-price agreement, matching terminal outcomes, durable attempts for running jobs, worker revision and active-action erasure protection. The dictionary schema adds a separate versioned action constraint branch. Original per-attempt and feature guards remain enabled.
- Shared provider resolver accepts valid three-decimal canonical customer rates and rejects invalid precision, negative/nonfinite values and out-of-range values.

## Checks

- Focused resolver regression: 4/4 passed using `pnpm --filter @languon/backend exec vitest run tests/unit/modules/text-ai/infrastructure/text-ai-execution-profile.test.ts`.
- ESLint passed the owned integration sources and initial new test fixtures; rerun after final edits.
- Backend typecheck after initial integration found only two concurrently edited conversation expense-fact type errors outside this work. Further final pass pending.
- An earlier test invocation accidentally executed the whole non-DB backend suite because a script-level `--` was forwarded: 1161 passed, 574 skipped, 3 failures in speech unit scaling and text admission fixture expectations. Root was notified; this is not evidence that database integration ran.
- Real PostgreSQL five-suite verification runs only against approved disposable `127.0.0.1:55481/languon_auth_accounting_test`, serially while holding the root integration slot. Each suite resets/migrates the disposable schema; no shared/staging/production target or paid service is used.
- Backend `pnpm --filter @languon/backend exec tsc --noEmit` passed after cache/document/cancellation integration. Scoped ESLint passed the final owned stores, accounting helpers, test fixtures and integration files before the last bounded assertion/admission delegation updates.
- Focused ten-file unit verification passed 104/104; subsequent affected four-file verification passed 43/43 after provider/cache/document changes.
- No paid provider calls or Git commits performed by this worker.

## Added/updated integration coverage

- Texts: exact measured success charge, revoked/undispatched releases, ambiguous dispatched timeout without replay, one hold across one safe rate-limit retry.
- Vocabulary selection: invalid output/duplicate publication releases, bounded action admission, safe retry shares a single action.
- Sentence: action settles after validated publication; safe typed retry keeps one action rather than old independent reservations.
- Dictionary: action funding and immutable admission identity across revision replay; SQL routing flags cannot bypass durable attempt admission. Single-card rewrites now delegate the shared admission method, closing an observed duplicated legacy admission path.
- Document: known usage at staged proposal keeps the action active/uncharged; original-byte cleanup and publication commit settle exactly once. Terminal extraction/cleanup failures release the customer hold.
- Cache usage: provider SDK scalar/V7 meters preserve reported ordinary/cache categories, reject impossible/conflicting categories and retain known expense facts on invalid structured output.
- Authenticated cancellation records private explicit-stop metadata required by financial authority guards; public nonfailed DTOs do not leak internal failure markers. Access revocation remains technical failure.
- Wallet browser testcase now verifies generic success/unknown with zero customer charge and independent unknown provider expense, accepts the proposal, and rejects fabricated estimated full-hold debit. A separately guarded synthetic admin fixture supplies reviewed prices/operator limits; browser execution is coordinated by the frontend worker.
- Synthetic calibration fixture supplies explicit customer/operator limits and reviewed rates for all catalog models; it is test-only and establishes no production rate.

## Remaining verification

Final five-suite result and bounded remediation result will be recorded below. Root owns independent financial/security review, central migration composition and remaining cross-feature verification. Do not infer complete feature verification from this scoped evidence.

## Final disposable PostgreSQL result (2026-10-22)

Command (approved environment loaded without printing secrets):

```sh
pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts tests/integration/modules/texts/text-selection.test.ts tests/integration/modules/learning/infrastructure/drizzle-sentence-stores.test.ts tests/integration/modules/dictionaries/infrastructure/dictionary-card-authoring-generation-store.test.ts tests/integration/modules/dictionaries/infrastructure/dictionary-document-store.test.ts
```

Final five-suite run: 65/66 passed, four files fully passed, duration150.16s.
The remaining dictionary assertion expected an unauthorized routing update to
throw; its established routing guard instead suppresses the update and returns
no rows. Remediation asserts no rows and unchanged queued state. A subsequent
mutation with all routing flags is separately required to fail without the new
durable provider attempt; the normal store claim then creates the attempt and
completes against the pinned original model. Removed the stale final assertion
that expected an unlimited legacy reservation; the new proof checks settled
unlimited action, unknown meter and zero customer charge.

Bounded final remediation command:

```sh
pnpm --filter @languon/backend exec vitest run tests/integration/modules/dictionaries/infrastructure/dictionary-card-authoring-generation-store.test.ts tests/integration/modules/texts/text-selection.test.ts -t 'pins the active AI revision|Feature052 keeps one bounded'
```

Result:2/2 passed (19 unrelated cases skipped by selection), duration7.41s.
The second case additionally proves invalid structured output releases the
customer hold while independently retaining measured100 input/40 output tokens
and220 provider USD micros. Together final runs verify all66 cases. No guard was
disabled or changed to accommodate a failing assertion. All five files use the
real migrated PostgreSQL schema and feature-owned stores. Root was notified when
the exclusive disposable database slot was released; no DB process remains.

## Follow-up admission fence audit

Read-only trace confirmed API `index.ts` passes the default-false
`DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED` into dictionary composition, while
legacy Auto admission may return no selected snapshot and the worker's live
Mastra process-model fallback can execute legacy jobs. Leaving new admissions
open under the disabled flag would bypass mandatory operator accounting.

Dictionary API composition now treats disabled accounting as an admission
rollback: new enqueue capabilities and document upload authorization are off;
read/accept/cancel/discard capability lists remain mounted. When enforcement is
enabled, dictionary and document stores reject a missing managed execution
snapshot rather than insert an unaccounted job. Already admitted jobs retain
existing worker drain paths. Composition unit proof4/4 passed, including default
and explicitly disabled settings rejecting enqueue before persistence, and
configured enabled capabilities remaining visible, and retained read/cancel
operations still reaching their stores. Focused real PostgreSQL missing-snapshot
rejection passed1/1 in4.77s against the approved disposable integration target;
no job or action is inserted.

No synthetic API exception or new fixture schema is added. Root chose accounted
calibration for deterministic fixtures. The guarded web E2E startup requires
APP_ENV=test, explicit fixture opt-in, matching database variables and a loopback
nondefault-port test target; it seeds a managed model revision, synthetic
reviewed prices/settings and dictionary operator funding. API enforcement and
managed routing are enabled. Worker fixture mode is explicitly deterministic
with a synthetic credential: a managed snapshot cannot accidentally fall back
to a live SDK. Administrator Playwright also explicitly enables accounting,
matching the already verified wallet scenario. Existing feature job drain is
unchanged. The composed-route integration fixture now uses that accounted
calibration and closes its queued document action before cleanup. Root is
coordinating its next disposable PostgreSQL slot; the frontend worker verifies
two existing dictionary generation browser scenarios on separate owned services.

### Admission fence final verification

- Focused admission/worker composition/worker command/environment tests passed
  28/28 across four files. The four composition cases cover default/disabled new
  admission, enabled capabilities and retained read/cancel operations.
- Real PostgreSQL missing-managed-snapshot case passed1/1 (8 unrelated cases
  skipped),4.77s; new job/action tables remain empty after rejection.
- Real composed dictionary routes passed4/4,18.50s, using the same approved
  disposable loopback55481 test target. This includes a managed accounted
  document upload admitted before accounting is disabled, then completion and
  cancellation through retained lifecycle endpoints. Initial harness corrections
  supplied the route's required empty JSON cancellation body and included the
  existing card-authoring capability in an exact response expectation.
- Final backend `pnpm --filter @languon/backend exec tsc --noEmit` passed, as did
  scoped lint and `git diff --check`. Initial strict optional-property and test
  context typing errors were corrected before that final pass.
- `pnpm docs:user-flows:check` passed16 validator cases and all28 guide mappings;
  `pnpm user-flow:e2e -- check dictionary-platform` passed with revised marker
  e6a3d2ee25c55c2d. README/environment changes are limited to clarifying disabled
  accounting disables new admissions rather than permitting unaccounted work.
- Frontend worker reports actual accounted card AI browser journey passed29s on
  separately owned loopback55444/56444 services. Pasted-term generation and reload
  succeeded; its final320px/200% layout assertion exposed pre-existing empty-card
  and review-grid overflow. The assertion remains intact, the root was notified,
  and this scoped evidence does not claim that complete browser scenario passed.
  See frontend follow-up evidence for the exact browser results/diagnostics.
- All owned DB/compiler processes reached real terminal exit before returning
  the exclusive integration slot and source freeze to root. No paid model calls,
  new fixture schema, synthetic admission bypass or Git commit was introduced.

### Completion-review remediation — consent and learner billing (in progress)

ACC-COMP-002 now uses a shared server-owned allowance quote for customer-funded
legacy generation and paid portrait interviews. New reduced admissions roll back
the feature transaction before retaining only the non-spending quote. Explicit
Send repeats the original payload and idempotency key with `confirmedQuoteId`;
transport middleware removes that field before established domain fingerprints.
The wallet owner fence atomically rechecks the available balance and immutable
model/tariff/funding/budget authorization. Concurrent spending refreshes the
quote; top-up never widens the first accepted terms. Zero customer tariffs and
operator-funded actions retain their existing funding semantics. No fundable
output remains an insufficient-balance rejection rather than a fabricated
minimum charge.

The accepted allowance is pinned on the generic action and used by checked
worker dispatch. Parent sentence preparation can reserve a bounded aggregate
input allowance while quoting against the actual first child input; its child
calls share the parent action, with original child job/lease witnesses retained.
The preparation and checked-dispatch implementations are independently owned
and verified in their dedicated remediation records.

ACC-COMP-005 adds one exact learner-safe billing projection to dictionary,
sentence, text-processing/selection and interview DTOs: held, charged, released
or Free, with decimal held/charged credits and measurement status. Provider USD
and internal units are excluded. Existing unversioned drained jobs may omit the
optional metadata. Frontend owns rendering and browser evidence.

Current author checks: shared contract cases passed2/2; middleware/error-boundary
unit cases passed3/3; affected unit selection passed27/27; scoped consent,
helper, fixture, contract and integration-test lint passed; `git diff --check`
passed. Backend `pnpm --filter @languon/backend exec tsc --noEmit` reached real
terminal exit0 with no diagnostics (session10319). The new real PostgreSQL quote
suite and actual paid Texts dispatch proof are pending the root-coordinated
exclusive database slot and final checked-dispatch migrations. This entry does
not claim those pending checks or completion of the review findings.

### Consent transaction verification — 2026-10-22

On root's exclusive loopback55481 `languon_auth_accounting_test` slot, with
migrations through0103 applied by the test harness:

- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/ai-credits/action-allowance.test.ts`
  passed8/8 in2.77s. The four capability namespaces cover dictionary, sentence,
  text and interview; real wallet transactions verify rolled-back feature work,
  no pre-consent action/attempt, exact accepted terms, identical concurrent offer
  nonce convergence, refreshed consent after concurrent balance removal,
  unchanged first terms after top-up, changed authorization and no affordable
  output. Namespace cases prove the shared primitive; they do not substitute
  for each feature adapter's browser/API evidence.
- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts -t 'quotes paid translation before creating work'`
  passed1/1 in2.73s (14 unrelated cases skipped). Actual paid Texts admission
  retains no job/action/attempt before confirmation, returns held metadata after
  explicit Send, pins the quoted output cap on the action, dispatches that exact
  cap through the checked live lease, then exposes released/0 billing after
  cancellation and failure cleanup.
- Both processes reached real terminal exit0 before returning the shared DB slot.
  No additional full legacy suite was run: root explicitly bounded this pass to
  the new quote primitive and actual paid Texts regression. Logs remain private
  at `/private/tmp/legacy-consent-quote-pg.log` and
  `/private/tmp/legacy-consent-texts-pg.log`.

Frontend representative paid dictionary/sentence/text/interview browser runs,
preparation parent-budget evidence and final independent remediation review
remain coordinated separately. This record does not claim their results.

### Composed chunked-request correction

Preparation's real composed API journey exposed a transport regression before
its service/store: consent inspection consumed and locked the original request
stream, while a later mounted module's body-size guard still needed to read it.
A request with a browser-supplied Content-Length bypassed that streaming branch,
so the earlier single-middleware check did not establish composition safety.

Added two real Hono regressions with bodyLimit → consent → bodyLimit → consent →
JSON handler, without a Content-Length header, for both initial and confirmed
requests. Both failed500 before the change. Consent now inspects a cloned raw
request and preserves the original stream; the existing stripped Hono text cache
still keeps confirmation metadata out of domain fingerprints. All5 consent
transport cases passed after the fix (570ms), and focused lint plus diff checks
passed. No PostgreSQL process was started for this narrow transport fix.
Preparation owns rerunning its composed journey; frontend owns its current
browser worker diagnostics. The successful PostgreSQL quote proofs exercise the
unchanged financial helper and remain applicable; their metadata middleware
composition claim is limited to these new regression cases until composed API
verification completes.

Subsequent coordination: the authority worker reports checked-dispatch denial
mapping now uses a nested transaction/savepoint and exact23514 cause messages;
its real restricted-role8/8 suite through0104 includes financial denial followed
by successful outer-transaction failure settlement and hold release. Legacy
admission therefore retains its established null/terminalization disposition
without catching arbitrary witness or replay failures. This is sibling-owned
evidence, not an additional legacy test run.

Frontend reports the representative paid dictionary and Texts browser cases
passed together in22s: dictionary output with intentionally absent provider
usage showed released/0 and unknown measurement; the deterministic Texts
provider's measured1-input/1-output usage showed charged0.004 credits. Its later
sentence fixture startup failed with sanitized SQL42883 for the newly added
speech-maintenance helper before migration0105 existed. Root identified that
source/schema ordering issue; frontend stopped its services pending migration.
No legacy accounting mutation or waiver was introduced for that failure.

### Sentence Next confirmation contract correction

Real browser verification exposed that Sentence Next omitted the optional
`confirmedQuoteId` declaration while Prepare and Check already exposed it. The
client boundary consequently could not preserve Send's confirmation metadata.
Added the missing optional UUID to Next and a focused original-request plus
confirmed-request roundtrip/invalid-nonce regression. The new test failed before
the correction; action-allowance and existing sentence contracts then passed
11/11 across2files. Contracts ESM/declarations build reached exit0, as did scoped
lint and formatting. Audited the remaining paid request schema variants:
Check, card V1/V2/V3/update/regenerate, pasted/import/document, detection,
translation/selection, portrait submit and preparation Start/Continue retain
optional confirmation metadata. No backend production change or PG run was
needed. Frontend owns the resumed actual sentence browser verification.

### Durable sentence/document offers and final fixture calibration

The resumed real paid Sentence Next browser flow exposed a second omission:
`DrizzleSentencePracticeStore.run` used a plain transaction, so its reduced-offer
exception rolled back without retaining the server nonce. A real finite-wallet
sentence store regression reproduced the repeated offer with the same original
operation. Wrapped that transaction in shared quote persistence. The regression
then passed1/1 (23 unrelated skipped),7.35s: one retained quote, no initial
job/action/attempt, exact first nonce confirmation and matching action cap.
Frontend subsequently reports the real sentence browser flow passed7.2s and
showed exact measured0.2-credit charge; preparation also passed.

Transaction audit found document authorization's identical omission. It now
uses the existing price-aware transaction wrapper. Normal and quoted40-credit
variants of the staged-document/publication test passed2/2 in2.43s, retaining the
same0.036-credit measured final charge only after cleanup. The fixture now gives
each case a distinct actor and retains immutable prior wallet facts; assertions
scope financial rows to the current actor. Source/schema guards were preserved.
The sentence reproduction ran on root-authorized disposable
`languon_auth_worker_authority_052_20261022_test`; document follow-ups use
`languon_auth_sentence_accounting052_test`, both loopback55481. The authority DB
was released before another worker used it; shared integration DB was untouched.

Root assigned the final portrait-persistence/capacity fixture failures. These
needed current canonical portrait worker readiness, not a model-policy bypass.
Added a test-only shared readiness seed with reviewed DeepSeek rates and current
execution namespace/revisions. The purge-role fixture now derives all timestamps
from one MATERIALIZED database-clock instant, avoiding microsecond ordering of
separately evaluated equal purge/retry deadlines. The stopped-action test now
issues explicit learner Stop before cancellation completion. Capacity expenses
are derived from the authoritative immutable pin/meters, and capacity reads use
the actual reviewed execution-budget cohort instead of an obsolete zero-price
policy. All five originally failing cases passed focused verification. Complete
two-suite results follow below when the active process reaches terminal exit.

The complete two-suite pass initially exposed a real portrait expiry lifecycle
bug beyond fixture calibration. Cleanup revisited an explicitly stopped terminal
operation and attempted to settle its immutable action again as failure. Root
authorized a bounded production correction: `settleInterviewAction` now acquires
the existing wallet owner fence and action row lock, and cleanup returns when
the action is already terminal. Generic mismatched-replay rejection is unchanged.
Cleanup also carries the persisted errorCode so a still-active explicit_stop
retains stopped semantics; cancelRequested alone does not authorize a charge.
Paid success and explicit Stop tests now expire the interview and assert the
entire settled action, exact charge and provider expense rows remain unchanged.
Focused expiry selection passed4/4 in7.24s (28 unrelated skipped).

Capacity's expanded authoritative portrait case left immutable financial and
account-deletion facts that its older row-deletion fixture could not erase. The
capacity suite now isolates the full disposable schema between cases. A first
complete attempt hit its default10s hook timeout under concurrent compiler load;
that timeout let pending migration work overlap the following hook. It was not
an accounting assertion pass. The final complete two-suite run therefore uses
the established integration hook120000/test30000 limits, preserving all cases
and assertions. Final terminal results are recorded below.

Final results on the separately owned disposable sentence-accounting DB:

- Complete capacity14/14 passed in the combined two-file run (29.19s total),
  with the established hook120000/test30000 limits. One portrait role test in
  that combined run exposed that projecting error_code exceeded the deployment
  purge role's intentionally restricted column grants. The final cleanup
  projection uses literal NULL under authenticated purge authorization and reads
  error_code only for ordinary owner cleanup; purge retains its checked recovery
  function. No role permission or SQL guard changed.
- Final complete portrait32/32 passed14.32s after that projection correction,
  including paid success/failure/explicit Stop, immutable charge/expense retention
  after expiry, old expiry behavior and real restricted deployment purge role.
- Capacity runtime/test behavior did not change after its14/14 result; only an
  unused import was removed. No duplicate full capacity run was added.
- Exact full commands: `pnpm --filter @languon/backend exec vitest run tests/integration/modules/learner-portraits/portrait-persistence.test.ts tests/integration/modules/text-ai/text-ai-capacity.test.ts --hookTimeout 120000 --testTimeout 30000`,
  then the same command selecting only portrait-persistence.test.ts after the
  role projection correction. Private logs:
  `/private/tmp/portrait-capacity-fixture-final2.log` and
  `/private/tmp/portrait-fixture-final.log`.
- All final DB processes reached real terminal exit before returning the slot
  for the source-stable load run. Scoped runtime/fixture lint and diff checks
  passed. Root owns the final combined compiler and independent verdict; this
  record does not substitute earlier static checks for that final source state.
