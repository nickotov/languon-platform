# Verification evidence: OpenRouter speech generation and local activation

Updated: 2026-10-27
Base: main29d5e0f; feature/openrouter-speech. Evidence for feature source;
source fingerprints and final activation evidence E-17/E-18 below.

## Acceptance coverage

| ID   | Implementation and proof                                                                                    | State                                    |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| AC-1 | Curated catalog, new adapter;73unit cases and realPG execution                                              | Pass; live adapter returns valid MP3     |
| AC-2 | Unified child environment loader/registry; role+timeout configuration and existing adapter suites           | Pass                                     |
| AC-3 | Existing retainedKie registry, new OpenRouter-primary polling regression; cached/protected content readback | Pass                                     |
| AC-4 | Normal localDB appended cost+customer revisions and repeated no-op                                          | Pass                                     |
| AC-5 | Eight realPG full service/worker/adapter/storage/settlement cases; critical registry requires exact titles  | Pass; full critical E-12 and mapped E-14 |
| AC-6 | Local env applied idempotently; restart permission and live publicAPI proof pending                         | Pending                                  |

## Historical checks and discovery

E-1: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/speech/openrouter-speech-provider.test.ts tests/unit/modules/speech/openrouter-speech-configuration.test.ts tests/unit/modules/dictionaries/infrastructure/audio-adapters.test.ts`:113pass/3files. Includes61adapter,8config,44existing+retained-adapter cases. Synthetic HTTP only. Log /tmp/languon-openrouter-speech-units.log. Adapter worker additionally reports61/61 after HTTP408/409/499 classification refinement.

E-2: Guarded disposable PostgreSQL ownedcontainer61addf63 on127.0.0.1:55491,
languon_auth_openrouter_speech_test. New openrouter-speech-execution.test.ts
8/8pass after remediation. Uses actual environment/factory/source resolver/store/service/worker,
Postgres private audio storage and financial participants; global externalfetch
only synthetic. ExactUSD0.04/1000characters, Free zero-hold/no customer tariff,
Paid exact charge, protected bytes, repeated cached playback, definitive HTTP
rejection0expense and ambiguous transportunknown expense. Unknown submission
holds remain reserved until existing billing deadline, then real releaseDeadlines
releases with no learnercharge. No runtime financial-policy change. First run
4failed due bare dictionary fixture missing settings; replaced with real store
creation. Next3pass/1failed exposed an incorrect immediate-release assumption;
corrected test to established delayed uncertainty reconciliation, not runtime.

E-3: `node --test scripts/critical-flows/registry.test.mjs`:15pass. Added mandatory
speech execution title checks and speech-playback browser entry depending on
ai-execution-contracts. Existing incident guard remains. Full stage includes new
adapter/config/execution and existing Kie adapter/speech-accounting/worker suites.

E-4: Backendtypecheck passes at /tmp/languon-speech-055-typecheck-final.log.
Scopedlint/Prettier pass. Initial build passed; post-lease-remediation build pending; logs /tmp/languon-speech-055-lint.log,
/tmp/languon-speech-055-format.log. Full critical run in progress:
/tmp/languon-speech-055-critical.log. No skipped/fixture browser result will be
reported as live pronunciation proof.

E-5: Local user-authorized database setup only, no source/schema changes. Live
publiccatalog/endpoints show openrouter/elevenlabs/eleven-v4-turbo USD0.00004 per
character,21presetvoices; expiredpromotion ignored. Append provider pricev1
USD0.04/1000characters and separately copy existing Kie customer speech tariff
100credits/1000,min1,provisionaltrue. Validated normalcontracts, same publication
lock keys, nullablecreatedBy(no impersonation), no existingrate overwrite.
Repeated application reports costChangedfalse/tariffChangedfalse. Existing Free
policy, budgets, balances and records untouched. API discovery receives no key.

## User-flow evidence

Reuse shared-pronunciation-playback guide rather than duplicate existing learner
journey. Existing10stable scenarios unchanged. Relatedfeature055 and provider
startup/operations added; markers synchronized in four mappedfiles to
sha256:4432d47d2e2be1db. `pnpm user-flow:e2e -- check shared-pronunciation-playback`
passes. Browser/corecritical/fullmapped command still pending final evidence.
Opsdoc corrected authorpreflight typo: missingtimeout warns+fallback, invalid
values abortstartup. This documentation-only edit does not change runtime/tests.

## Reviews and remaining gaps

Independent correctness/security/test reviews approve implementation. Full critical,
all mapped cases, build/typecheck and final startup regressions pass. User restart
and live learner API proof completed. MinIO startup omission was repaired with
bounded initialization and independently reviewed. Remaining diagnostic allowance
USD0.025417. No user data deletion or production deployment.

## Remediation evidence

E-6: Independent review found provider45sec plus S3 storage20sec exceeded the
original60sec lease. `storing()` now renews60sec atomically under original token
and unexpired ownership. New realPG test blocks the real blob insert past the
original near-expired lease, proves concurrentclaim returnsnull and publishes
once; expired/replaced owner variants cannot renew or publish. Focused8/8pass;
full gate also executed final8/8pass. Security finding fixed by paired-bracket
rejection before dispatch,73adapterunitcases pass in full gate. Both independent
focused remediation reviews approved. Request flags do not imply account-wide
OpenRouter privacy; operations explicitly requires account-settings verification.

E-7: Initial full critical run d27c47ed-7cd9-4f7d-b8c3-a7254f61b576: all preceding
browser flows pass; backend411pass/5fail out of416tests/29files. All five failures
are pre-existing dictionary-card-authoring beforeEach database-reset hooks reaching
10sec while build/browser work overlapped; contention causality is not proven. These
are hook deadlines, not provider/execution assertions.
No threshold changed and no failure hidden. Serial backend+speech-browser rerun
started with final source: /tmp/languon-speech-055-critical-remediation.log.

E-8: First exact mapped speech composite: sharedspeech4/4pass, sentence1pass,
flashcard2fail due pre-existing ambiguous New dictionary selector matching both
sidebar and main page. Scoped both helper variants to main; assertions unchanged.
Composite rerun waits for backend-only run to avoid resource contention.

Speech circuit-write requirement is explicitly N/A: existing speech has no
circuit. Existing speech failure persistence, immutable expenses, operator/Free
quota/capacity and no-auto-retry remain tested. Existing dictionary circuit
regressions remain mandatory; this exception does not waive their execution.

E-9: Authorized isolated real-provider diagnostic (not a normal automated test):
production OpenRouterSpeechProvider submitted only synthetic Bonjour. (8chars)
with the implemented MP3/language/privacy contract. Ready after938ms;16,343bytes,
MP3 integrity validation passed, duration1019ms. Calculated published-rate expense
USD0.00032, not an invoice measurement; original cumulative diagnostic exposure
USD0.073423, remainingUSD0.026577. No retry. Log
/tmp/languon-speech-055-live.log, synthetic audio /tmp/languon-speech-055-live.mp3.
This proves actual adapter/provider compatibility; it does not prove learner API
admission, persistence, account-wide privacy or listening quality. User service
cutover and full public-API live proof remain pending.

E-10: Serial rerun45f7636a-1fe2-486f-86f8-02f1c8429452 still had one dictionary
beforeEach10sec setup failure (415/416passed); original build-contention theory
is not established. Inspected fixture rebuilds110migrations and legacy routing
for every independent case. Separate tester approved bounded suite-local
beforeEach30sec; test/assertion/product limits remain unchanged. Focused14/14pass
in42.13sec on owned disposable55491, log
/tmp/languon-speech-055-dictionary-setup.log. Independent narrow review approved.
Final backend+speech-browser stage now running against this final test state:
/tmp/languon-speech-055-critical-final.log. Earlier failed runs are retained and
must not be presented as a clean full-critical pass.

E-11: Final source/test/runner/env-example freeze (17 affected files, excluding
transient generated next-env.d.ts and delivery prose): SHA-256
3a322d62cc569763308c891fccadb2d724e24e7eb5985cc9f90ef89137c3d430.
Per-file manifest /tmp/languon-speech-055-final-source-manifest.json. Full critical
run and subsequent mapped/build checks must match this state; compare hashes at
handoff. Ignored real local env has not switched yet. Normal provider/customer
price publications are unchanged. Pending full critical evidence now at
/tmp/languon-speech-055-critical-complete-final.log; deliberate earlier scoped
run was interrupted to run the required complete gate instead.

E-12: Complete final critical gate PASS, exit0:
`node scripts/run-critical-flows.mjs`, run12443c00-2a8c-402b-8ac6-0ec8909305bb,
log /tmp/languon-speech-055-critical-complete-final.log. All12registry entries,
416backendtests/29files and20browsercases pass with no skips/flaky/retries.
Includes final8speechPG,73adapter,8config and44retained/Kieadapter cases. Every
required exact title validated. Source manifest E-11 comparison unchanged after
this run. Prior hook/selector failures are superseded by explicit reviewed fixes,
not erased. Owned runner containers cleaned; user services untouched.

E-13: Exact mapped composite after locator correction passed learner4+3cases,
then admin bootstrap failed against reused test database (existing owner requires
an active actor). This was test-target setup, before speech UI assertions. No
admin authorization rule was weakened. Recreated neither normal nor reused data;
instead created two fresh independent databases inside owned61addf63 container:
languon_auth_speech_055_final_e2e_test and
languon_admin_speech_055_final_e2e_test, Redis namespaces2/3. Exact mapped command
rerun /tmp/languon-speech-055-mapped-fresh.log. Existing development data/services
remain untouched. Complete critical E-12 already passes on independently fresh
runner-owned services.

E-14: All10 mapped scenarios pass across precise selections:7 web cases passed
from exact composite at freeze A; its admin stage exposed missing fixture-only
accounting prerequisites. Corrected only tests/support/admin-speech-fixture.ts
(18th-file delta B), then3admin cases passed fresh (37.6sec), log
/tmp/languon-speech-055-admin-final.log. No single clean composite-command pass
is claimed. Independent reviewer and tester verified helper reachability: only
these3admin cases call it; it cannot affect earlier7web or any E-12critical case.
E-12 full-critical pass remains valid. Helper seeds only missing synthetic price
and operator caps under existing disposable-target guards; no customer tariff,
grants, policy, authorization or production changes. Independent review approved.

Final18-file manifest:63b637c2b473832c7641e69875ba8b044d2618b24877bea22b029f9e433bb258,
/tmp/languon-speech-055-delivery-source-manifest.json. Only difference from E-11
is the helper above. Backend typecheck, helper lint/format pass after this delta.
Generated next-env.d.ts restored to HEAD; no generated output is in feature diff.
Guide last_verified updated2026-10-27, unchanged revision; mapping check passes.

E-15: Authorized ignored .env.local now selects openrouter, configuration
openrouter-eleven-george-v1,45sec timeout and George profiles for unchanged15
languages. Existing S3, keys, fingerprints and limits retained; two historical
Kie configurations available. Both API/worker production factories validate.
Apply1 changed settings; Apply2 changedfalse (no rewrite). Sanitized receipts
/tmp/languon-speech-055-config-applied.log and -config-idempotent.log. Neither
user-owned services nor processes restarted. Current running workers may retain
Kie until a coordinated dev:all restart. Public-API live proof is still pending;
direct live adapter proof E-9 is not substituted for that acceptance criterion.

E-16: Final backend build PASS (ESM and DTS),110.4sec DTS, exit0;
/tmp/languon-speech-055-build-final.log. Backend typecheck after helper correction
passes (execution worker session42360). Scoped ESLint/Prettier, git diffcheck,
critical registry15toolingtests/12entries and user-flow mapping checks pass.
Only18th-file helper delta from full-critical freeze, independently reviewed.
Owned PG61addf63 and Rediscd7294b1 container IDs/feature labels verified before
removing only those containers/anonymous volumes. User services remain running.

E-17: User confirmed dev:all restart. Initially their historical Kie job remained
storing because MinIO was stopped; worker was running and polling normally.
Started existing MinIO and ran existing idempotent initializer (private/versioned
bucket, original credentials/policy); retained Kie job became ready. No reset,
manual job rewrite, new provider submission or learner charge for that recovery.
Fresh synthetic account/card through public web API then queued new OpenRouter
speech request3fecb927-2b83-4f57-9cbd-a0403d016cca. Ready2210ms; validMP3
82798bytes/5172ms. Stored profile openrouter-eleven-george-v1 / George / French.
Unauthenticated content401; authenticated content audio/mpeg. BillingFree,
credits0/reservationnull. One persisted provider expense1160USDmicros, explicitly
estimated at published character rate (29chars); no invoice-level accuracy claim.
Repeated prepare returns same playback with exactly1job/1expense. Receipt
/tmp/languon-speech-055-learner-receipt.json, synthetic audio
/tmp/languon-speech-055-learner-live.mp3. Original cumulative diagnostic exposure
USD0.074583, remainingUSD0.025417. No further paid calls required.

E-18: Fixed discovered startup omission in scripts/dev-all.mjs and its tests.
Infrastructure up--wait includespostgres/redis/minio; attached one-shot minio-init
runs separately beforebuild/migrations/apps. Nonzero exit or120sec timeout aborts
startup and cleans owned processes; infrastructure retained. Native suite15/15
PASS4.33sec, /tmp/languon-speech-055-startup-final.log; scopedESLint/format/diff
pass. Independent reviewer R-3 closed after timeout regression verifies no later
stages, child exit and removed signal handlers. Reviewer initially lacked process
inspection permission (13/14); escalated complete15/15 and focused review pass.
Critical runner never invokes dev-all; prior full critical E-12 remains valid,
with this separate native/runtime proof. Relevant guides/README updated; revision
checks pass unchanged scenario markers. No browser UI change. Additional optional
web-dev-panel:check reports pre-existing package/catalog drift: both files
unchanged from29d5e0f; unrelated catalog reconciliation was not included.

Final completion source manifest (20 files):
148f45557d910af6d20bdd8ba30e7e4e7376c094fbb40512b9b802e9080a865d,
/tmp/languon-speech-055-completed-source-manifest.json. Only dev-all and its test
changed after E-14; independent review confirms no critical-runner dependency.
Documentation-only startup clarifications preserve mapped scenario revisions;
all29guides validate. All acceptance criteria, including live API/storage and
retained Kie recovery, are satisfied. No secrets or generated output committed.
