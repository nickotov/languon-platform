# ExecPlan: AI accounting

Status: Complete
Branch: feature/ai-accounting from main d441863

## Goal and specification

Deliver [FEATURE.md](FEATURE.md) AC-1–AC-10 and approved design. This work spans backend accounting, existing feature adapters, web/admin controls and performance verification.

## Existing architecture

Dedicated ai-credits module participates in feature transactions. Current loadLots rebuilds allocations from history, model tariff current() exclusively locks and lazily seeds, text capacity performs cross-feature unions and request-time archive deletion. Current contracts are integer credits; text failure settlement currently charges consumed usage, contrary to new policy. Durable conversation worker/replay already exists. ADR0022/0027/0032/0041/0044 apply; superseding decisions needed, not edits to accepted policy text.

## Test strategy and guides

See FEATURE verification. Read specialist skills before affected work. Database changes require generated migration metadata plus explicit integrity checks; retain append-only migration history. Inspect mapped guide tests before changing their scenario/revision promises. Use synthetic isolated data, no paid calls. Independent completion/security reviewers and tester required for new performance harness/concurrency.

## Milestones

- [x] M1: Arithmetic/policy/contracts and persistence foundations (AC1,AC5).
- [x] M2: Existing capability integration, bounded holds/retries/outcomes/free quota (AC2–4,AC8).
- [x] M3: Reporting/payment/deposit APIs and admin/learner UI (AC6–7).
- [x] M4: Counter capacity, streams and performance harness (AC5,AC6,AC9).
- [x] M5: Guides, ADRs, preflight, review and verification (AC10).

## Progress

2026-10-22: Read delivery, feature-development/testing/db skills and design. Created branch and feature workspace. Beginning non-overlapping implementation ownership. Root owns composition, text capacity, migrations integration, guides, performance and final integration. No database reset performed.

## Decisions

D1: Preserve ledger audit but maintain transactional projections; no Redis authority for customer money.
D2: Keep current backend deployment and DDD feature job ownership; no universal executor.
D3: Initial interview quota30/day with one active, reports60s, load100streams/10starts/sec/p95<=100ms.

## Discoveries

Initial discovery found no cash-payment schema; the feature now adds manual payment/refund/deposit and reporting records without checkout integration.

## Validation

See EVIDENCE.md and linked final supporting records. Final completion/security reviews are READY; focused checks, browser verification, the accepted performance run and development cutover pass.

## Remaining work

All AC-1–AC-10 implementation and verification work is complete. The feature
workflow authorizes local squash integration into `main`; it does not authorize
push or branch deletion. Economic calibration remains an activation prerequisite;
no rates or pack values are invented.

## Live integration checkpoint (2026-10-22)

- Root created Feature052, branch feature/ai-accounting. No commits or app DB mutation. Approved docs/CONTEXT preexisting changes remain in feature.
- Workers: accounting_wallet_projection owns ledger projection trigger SQL and compact capacity SQL/source; accounting_records owns records/reports/provider tariffs; accounting_interview_policy owns policies/settings/interview new action adapter + speech free; accounting_action_integration owns conversation new generic action/quotes/buffer; accounting_frontend owns learner UI/confirmdialog; accounting_admin_ui owns admin UI + external credit serialization; accounting_performance_harness owns real PG/Redis/SSE loadtest.
- Root changed maxTextPrice/calculateSpeechPrice to return milliunits, preserving canonical inputrates. ALL ledger amounts now one milliunit: old-data unit conversion source credit-milli-units.sql prepared. Admin serializers parse/format updated by worker. Numeric tariff columns changed to precision18/scale3; job max amount bigint mode number.
- Migrations generated0083DDL,0084wallet projection,0085capabilityguards,0086actionfields,0087capacity+precision,0088finalaction/cache fields,0089execution invariants. Custom0089 currently concatenates source credit-milli-units.sql + policyimmutability SQL + conversation-action-accounting.sql + capacity-projections.sql. Sources can still change before final immutable migration testing; recompose0089 from final sources BEFORE final tests. Latest units source added speech credits scaling after initial0089 composition, so MUST recompose before any final claim.
- Private isolated integration env /private/tmp/languon-accounting-test.env identifies localhost55481/languon_auth_accounting_test; private load env /private/tmp/languon-accounting-load-test.env -> languon_auth_accounting_load_test. Container languon-portrait-test-postgres userportrait. Password omitted; source env without echo/xtrace. Redis56381 db3 for load. Actual app DB untouched. Docker/network calls require sandbox escalation.
- Wallet28 realPG tests PASSED prior final units/action/policy SQL sources and later purge edits; rerun affected cases after final integration. Records worker currently owns integration DB exclusively running its7cases; do not concurrently reset it. Walletworker may test capacity afterwards. Load DB independent, harness waiting root migrationready.
- Focused unit/web/admin suites passed per worker evidence; final backend tsc previously failed only capability audit action enums/fixture missingimports which policyworker fixed. Many concurrent tsc jobs caused severeCPUpressure; root stopped6 duplicate compilers, run final checks sequentially. Root41267 completed withdiagnostics, no live root tsc.
- Frontend evidence evidence/frontend-checks.md. No browser/E2E runtime yet. App localhost3333 unavailable accordingworker. Need fixture runtime after allmigrations+contracts stable.

### Immediate remaining integration

1. Root finalize units SQL (audit correctness including snapshot maxima/legacy guards/olddata amounts), compose0089, test clean migrations. Source server tables now104 plusquotes/cache fields; run db:generate only after schema stable; never handedit snapshot/journal.
2. Wire capacity maintenance off request path, reportworker separatepool already index.ts, providerprice routes nowindex. Root safety-check startupfail cleanup resources. Actionquotes expiry cleanup + actiondeadline recovery + accountingpurge integration (anonymize added) still verify.
3. All legacy dictionary/sentence/text settlement still needs full outcome-aware action integration; generic walletoperatorhook alone does not meet success-only billing. Must not report complete or silently omit. Current conversation/interview newpaths done; default freeinterview safe. Missing unknownusage estimator currently charges0 ifno trustworthyusage (defensible estimator optional).
4. Operator budget rate config and customer tariff decimal DB guard SQL must be validated. Paidpaths require admindefaultbudget/reviewedproviderprice; defaults intentionally unset noinventedeconomics. Admin settings/UI support calibration.
5. Quota configurable? currently30fixed daily1active; final agreedinitial satisfied but adminadjustability assess requirements. Actioncap10k + maxretry1. Source policy SQL had latestversion provenance checks to preserve pins.
6. Complete quoted affordableoutput confirmation UI (frontend followup inprogress), explicit limitReached/Continue path (needsactual provider finishreason), integration source fixtures oldportraitjourneys being refactored bypolicyworker.
7. Guides/ADR0045/userflowmapping/docs/test evidence/reviews/independenttester/performanceacceptance still pending. Read browser/user-flow-e2e/code-review skills before that work. Do not merge until allAC1–10 met.

## Integration checkpoint 2

- Final backend typecheck at session82554 PASSED before latest technical_failure/dirtyversion/operator-budget additions. Root currently no active compiler; keep sequential.
- Records6 realPG cases passed after clean/repeated migration fixes (CASE parentheses and temphelper CREATE OR REPLACE), valid at0089 hashbab81...; action7 cases thenpassed via explicitrecordsworker handoff (not overlapping reset), but later immutablehistory/deletionguards changes invalidate affected proofs. Rerunfinal.
- Model price4 domain cases and preference/pricing9 cases passed; milliprice tests intentionally updated for new smallestunit/round-once.
- New source code approved maintenance timer infrastructure/text-ai/accounting-maintenance.ts runs compact cleanup on separate1connectionpool andcallsconversations.store.maintainAccounting; bounded100ms statement/50mslock timeout. Need tests+production rolegrant verification.
- Reportingprivatepool1, recordsdirtyversion addsnoaggwhenunchanged; dirtySQL function/rootwallet hooks need0092after0090columns. Directory custom sources remain authoritative beforefinalmigrationassembly.
- Generated0090 adds technical_failure enum separately plusdirty reportcolumns. BigIntdefaults inDrizzle MUST use sql`0`/sql`-1` (kitserializationbug). Walletworker thenamended reservationterminalcheck;0091generationinprogress. Neednewcustomguards afterenumcommitted.
- New operator-currency budget correctness gap identified: oldfive-fieldcohort changes canmultiplydailyallowance. Actionworker implementing global+owner/day USD reservationindependentmodel/pricecohort, peraction pinned max. Adds nullableadminsettings maxProviderCostUsdPerAction/PerAccountDay/PerDay (noinventedinitialprices); allnewfunding requiresreviewedproviderrates, no unknownpricenewdispatch. Legacyworker andinterviewworker mustsharehelper. AdminUI needsfields oncecontractstable. Requiredcachemeters mustreviewed (adapterdefined; currentDeepSeeknocachewrite requests).
- New accounting_legacy_generation worker owns4legacyjobstores/fullnewgeneric actions, exactmilli + honesttechnicalfailure initiallysafe. Fullgeneric integration stillinprogress; sourcelegacy-action-accounting.sql needscustommigrationafternewDDL.
- accounting_invariant_review is EARLY bounded readonlysecurityreview ofunitconversion+guards (notcompletion). Needresolvefindings thenfullreviewafterpreflight.
- performanceharness authored actualstoreadmission+realSSE/PG/Redis,100activecadence streams; syntheticworkerwrites10running+90queued,1msettledactions+1mhistory. Deliberatelynotproviderdispatch/authcrypto/TCP. TargetindependentDB localhost55481/languon_auth_accounting_load_test Redis56381/3, authorizedresetONLYtarget betweenfailedfixtureattempts. Waitsource/schemafinalbeforemeasure.
- accounting_frontend followup26tests passed: realquote409/details+frozenretry+reconfirmation+Continue noauto. Compiledcontracts refreshed23852. Allapp/browser/evidenceguidework stillpending, no falsecompletion.

## Integration checkpoint 3

- Generated0092 financial/operator/authority DDL,0093 composed custom invariant sources,
  0094 nullable operatorowner. New schema/source changes still pending finalgeneration.
- Wallet31/31 passed98.85s on disposablePG before latest0093purge rewrite; walletworker
  now exclusive integrationDB for capacity/authority. Then records9, action10,
  actualdictionaryworkerrole3, legacy4suites must execute sequentially.
- Interview adapter gap (mandatory operatorMaximumMicros andexpenseattemptFK) repaired
  byactionworker; sharedfixture now seeds3syntheticUSDcaps andcacheReadrate. Speech
  still needs reviewed providerUSD+sharedoperator integration, ownedrecordsworker.
- Root fixed stale unit tests (speech nowmilli/fractional, overlapfixture checks bound
  kind instead retired SQLtableliteral), maintenance2/2 andpricing16/16 passed.
  Backendtypecheck46663 passedbeforelatest adapters; finalcheckpending.
- Root authoredacceptedADR0045 foruserapprovedpolicy, partialsupersession relationships,
  architecturenotes andoperations/ai-accounting.md developmentfreshDBcutover.
  Removed retired .env.example interviewbypass. No actual appDBswitch performed.
- Frontendworker ownsnewai-accounting guide/mappedlearner+adminE2E andexisting guide
  updates. Browser fixture ports/DB needexclusive execution after schemafinal.
- Root source credit-milli-units preflight nowalsochecks4legacyfeaturequeues andspeech
  active states; NOTyet recomposed0089 whilecapacity/authoritytests running.
- Earlyreview findings remainremediationpendingfullreview: nofinancialauthority via
  spoofableGUC, expensecomplete settlement, actualrestrictedroles, anonymouspurge.

## Integration checkpoint 4

- Current migrations0089–0094 FROZEN: browser andrecordDB haveappliedthem; anyfuture
  refinement must useappend-onlyforwardSQL. Generated0095 latestNULLterminalCHECKs
  +dictcoalesce;0096 reinstallsCREATEORREPLACE authority/legacyguardfunctions only.
- Records9/9PASS30.61s inclactualpurgerole/privatefinancialdenial; walletcapacity14
  +authority10 passed7.80s. Actionworker nowexclusiveDB14+measuredpartialStopfix;
  adminworkerrole3 next, legacy5suites thenwalletcutover3.
- Root fullunit regression127files1026testsPASS48.73s. New speech/Stopchangesstill
  invalidate affectedcoverage only. Rootfound explicitStopeligiblefilter mayexclude
  measuredabortedcall (successfulfalse); actionworker investigatingrepair.
- Frontend realbrowser learner2PASS twice17.3s/34.7s; adminrealbrowser found labelID
  collisions acrossAntD forms, repairing actualforms ratherthan weakeninglocators.
  Freshowned testcontainers learner55444/56444/admin55445/56445, preserveothers.
- Recordsworker ownsspeechnewproviderUSD/operatorauth/sharedcaps+compactdailycounters;
  schemafreezepending. Legacyworker added documentupload/staging/cleanup path support,
  nochargeuntilsuccessfulpublication. Final104focusedunit casespassed.
- Walletworker updatedperformanceharness: onlyvalid1mledgerhistoryrows foractiveowners,
  noinvalidnakedactions. Explicitly excludes1mtypedaction/alloc/providerhistory claim.
  Operator/cacherates fixture configured; do notrunload untilquietsourcefreeze.

## Integration checkpoint 5 — frozen implementation, final verification

- Append-only0098 speechguards +0099 deferredspeechauthority SECURITYDEFINER fix.
  Existing0089–0097 unchanged. Financial9 actualpurgerole passes on0099; speech7,
  existingstore33, sources7, actualspeechworkerrole2 allPASS (58records/speech PG).
  Actualworkerproof foundmissingdailycounterDELETE grant rootadded; nohiddenrights.
  See evidence/accounting-records-speech.md. Standalone cutover3PASS on separate
  languon_auth_accounting_cutover_test; noappDBchange.
- Legacyall66PG casescovered by65/66fullrun +2focusedremediations. Found/fixed actual
  singlecard duplicatedadmission bypass sharedpreparation; finaldictionarycasewas
  staleexpectation ofsilentguardvsraise. All5featurepaths includingdocumentstaged
  measuredusage/cleanup-publication validated. Legacyworkerfinished.
- FrontendE2E newaccounting3 +wallet1 +speech4PASS, exactspeechdecimal0.125 supported,
  controls/sourcehash/screenshots/evidence underbrowser-final andfrontend-followup.
  Parsercontracts10tests+web11passed; all28guide mappingsvalidated. Frontendfinished.
- Rootfinal backendtypecheck13171PASS; webtypecheck57072PASS afterexplicitquote type
  +restored missingCheckimport discoveredbycompilation; admintypecheck65631PASS.
  Backendbuild77266PASS (DTS93.8s), adminbuild79825PASS, webbuild84203PASS. Backend
  srcESLint12196PASS. Buildgenerated next-env restored exactHEAD, notcommitted.
- Rootprettierformatted23affectedTSfiles exceptrecordsactive sharedspeechtest; pure
  whitespaceinvalidated6diagramfingerprints. Diagramsworker hadall9fresh andreal
  maintainedE2E2/2+safeviewerrenderpasses beforewhitespace/linkchanges; rootmust
  narrowlyrecompare/restamp finalhashes, nochangedMermaidrenderbehavior.
- Deploymentclassification updatedthrough0099 SHA withcompatibilitycontract and
  explicitfreshdevelopmentDBrationale; ordinaryproductionreleasegate intentionally
  CLOSED. No productionoverlap allowed. AlloldAPI/workersstop before newDBcutover.
  Speechversion0oldadmissionbinary againstnewDBunsupported boundaryrecorded; current
  API1/oldworkerclaimfence tested. NoappDBswitch yet.
- Performanceindependenttester reviewedandfixed measuredpath torealHonoPOST+Redis,
  noledgerhistorySQL assertion, countunchanged. Source/schemaquietfreeze nowinforce.
  Followuptaskrunning dedicatedloadDB55481/languon_auth_accounting_load_test Redis
  56381/3; firstattempt exitedPromiseRejectionHandledWarnings/noartifact. Tester
  fixingimmediatepromisehandling+harnessdiagnostics, noappsourceedits untilresult.
- Remaining: validloadproofp95<=100ms; finalformat/unitchecks asjustified, diagram
  narrowrefresh, fullauthorpreflightstatecapture, independentcompletion+security
  review/remediation, developmentfreshDBcutover (preserveold), localfeaturecommit
  andsquashmergeonlyafterAC1–10done. No commits/push/branchdeletion yet.

## Integration checkpoint 6 — admission fence and measured contention

- First valid real-route load run completed300 admissions,100SSE and1m unchanged
  ledger rows, but loaded p95=777.568ms fails AC9<=100ms. Keep the failed artifact;
  no performance acceptance claim. Architect identified global capacity lock
  contention in append/heartbeat/SSE fencing. Harness heartbeat was100ms versus
  production5000ms; independent tester corrected cadence and is running a fresh
  quiet full fixture before application optimization. No concurrent heavy jobs.
- Root found new dictionary API jobs could bypass mandatory accounting when
  enforcement was false or snapshot missing. Strict composition/store fence
  implemented; old admitted job drain/read/cancel preserved. Deterministic tests
  must use calibrated accounted fixtures, with no unmarked exception or schema
  change. Focused unit cases pass; affected PG/E2E verification pending load end.
- No development DB switch, feature commits or merge yet. Preserve old database.

## Integration checkpoint 7 — final functional freeze

- Root reproduced append blocked behind unrelated global capacity, then factored
  private append/heartbeat path with actor SHARE and unchanged source/chat/turn,
  lease and Stop fences. Public arbitrary withOperation retains global capacity
  and actor UPDATE. Independent architect caught crossed-source UPDATE deadlock
  risk before implementation; actual crossed-source regression added.
- Final conversation-store37/37PASS46.23s, action-accounting15/15PASS18.77s on0099;
  scoped source/test lintPASS. Disposable fixture projection TRUNCATE cleanup
  corrected; no production invariants weakened. See streaming-contention evidence.
- Strict dictionary admission fence and fully accounted deterministic fixtures:
  unit28PASS, missing-snapshot PG1PASS, composedroutes4PASS, backendtypecheckPASS,
  lint/docs/mappingPASS. Defaultdisabledflag denies new generation; lifecycle
  access and old admitted work remain available. No synthetic unaccounted bypass.
- All9 diagram freshness checks pass after narrow source reconciliation. Changed
  conversation/dictionary view browserE2E rerun waits for quiet load terminal.
- Relevant legacy card browser passes. Existing320px/200%font batch test fails on
  unchanged baseline layout; no runtimeCSSscope expansion or weakened assertion.
  Focused desktop accounted batch path verification pending; record residual.
- Source frozen for corrected9running/91queued,5000msheartbeat performance test.
  No app DB cutover or Git commit/merge yet; final review follows author preflight.

## Integration checkpoint 8 — initial independent review and expanded remediation

- Independent completion review returned NOT READY: ACC-COMP001 performance,
  002 missing paid legacy/interview consent,003 unstable first-use budgetcopy,
  004 missingRedis text/speech bursts,005 missing learnerbilling metadata,
  006 unbounded automatic sentencepreparation freshbudgets. Independentsecurity
  SEC05201 spoofablepurgeGUC/rawDELETE,02 workerfinancialadmission authority,
  03 expenseprovenance/preemption. See REVIEW and separate reports; allaccepted.
- Valid final9/91 source-stable load artifact loaded300/300 butp951056.446ms,
  baseline99/100 andp953828.373ms; noAC9acceptance. Original777msrawartifact was
  overwritten andisnonreusable; historicalconsolemetrics retainedonlydiagnostic.
  Architectdistinguished grantedoperatorlocks from actualwaiters (mostlyglobal
  capacity). Nextfixture8running/92queued leavesadmit+finalizerheadroom; keeps
  100streams/10postssec/1mhistory andaddsboundedinterquerytiming. No targetchange.
- Rootbatchedmessage/eventinserts, memoisedsame-transactioncapacitylock only,
  reused selectedpolicy/settings; lock2+selection17unitPASS. No capacity or
  permissions cached. No terminalcapacitylock removed: audit found queue/operator
  reverseorderdeadlock ifdonepiecemeal. Finalperformance pendingallremediation.
- RootensureActionBudgetDefault atomicconditionalUPSERT copiedonfirstmanaged
  admission/profilefirstread, neveroverwritesmanualbudget/model; PG3PASS7.95s
  coversconcurrency/defaultraise/manual. Sharedselectionunit17PASS.
- Redisworker adds requiredfailclosedguard text/speech beforeDB/resolver,realRedis
  5PASS+HTTP11PASS incl3x100bursts10accepted90rejected andoutage503beforework.
  Rootindexwiringdone. No PGorpaidprovidertraffic inthatproof.
- Legacyowns genericdurableconsentoffers/DTOmetadata and4claimreorders; frontend
  owns sharedexplicitquote/SendTopup +billing allcapabilities; contractsbuild and
  webtypespassmidremediation, finalbrowserpending. Preparationworker ownsoneparent
  hold/pins/shared10k+5callbudget, explicitContinue +fencedderivedchildcreation;
  rootownsnewtypedauthoritysourceandlegacyparentguards.
- Recordsowns checkedpurge/expense/providerobservations; worker_authority owns
  checkeddispatch/settlement/roles/reportdirty/operatoractualsettings guards.
  NewforwardDDL (attempt execution_job_id, expense source_kind, speech outcome,
  preparationparentmapping/currentaction/fence/command scopedauthorization) awaits
  finalrecordsschemafreeze, thenrootgenerated0100+appendcustom0101. Neverrewrite
  applied0083–0099. No app DB cutover or commits yet.
- Source securityboundary materiallyexpanded bycheckedSQLhelpers andpreparation
  parentauthorization. Requiredfinalreviewmode expands affectedfinancial/worker/
  preparation/provenance paths; unchangedinitialsurfaces reusepreviousreview.


## Integration checkpoint 9 — bounded remediation and user scope correction

- User questioned complexity and requested Luna. A Luna read-only review confirmed
  keeping accounting as a narrow seam over typed jobs, avoiding new orchestration,
  service infrastructure, generalized role redesign, or broader load-test goals.
- Expanded security audit separated SEC-052-04 (pre-existing broad nonfinancial
  purge-role permissions, unchanged/narrowed by this feature) from introduced
  SEC-052-05 (generic monetary settlement EXEC grants to purge role) and
  SEC-052-06 (raw mutation of new speech admission counters). The former is a
  documented follow-up, not a feature regression; no RLS/domain-purge redesign.
  Records owns claim-scoped financial recovery; authority owns bounded counter
  cleanup and live speech lease witness. Only introduced defects block this work.
- Forward migrations0100–0104 are applied and immutable. 0104 SHA256
  6b115c9ae1bf62d9039c751e21d59f32199030ce0c5b12aa118415be6f7a5b3d
  installs DB-clock observation/dispatch and corrected speech wallet lock order.
  Actual restricted dictionary-role8/8 passes in3.85s through0104, including
  savepoint denial recovery, current operational caps and denied direct report
  invalidation. Final speech witness/counter/recovery changes require0105+.
- Preparation parent library20/20 PG cases passed through0103; actual role,
  safe-retry and composed journey checks remain in progress. Legacy allowance
  consent8/8 and actual paid Texts dispatch1/1 passed; composed sentence testing
  exposed a request-stream middleware defect now assigned to its owner.
- Paid dictionary and Texts browser2/2 pass through0104 (22.0s). Sentence/preparation
  and portrait browser checks remain in progress. No production/provider calls.
- AC9 remains failed pending final quiet-source load run. No development DB
  cutover, commit or merge. Existing development data remains preserved.


## Integration checkpoint 10 — Luna and bounded performance follow-up

- User requested Luna and questioned complexity. Luna performed independent
  simplicity/harness review and the bounded dictionary fixture repair. Main
  conversation model has not been switched. No new service/framework scope.
- Functional remediation and independent financial/security review are complete;
  security verdict READY against manifest6000b1719759db4d486dfcb7a49574ab3a4eb20ef21d3a3da65b88d119abecfc.
  Existing unrelated purge-role residual is documented, not expanded here.
- Actual final conversation-store/authority47/47 pass. Latest SSE route/metric
  seven tests, scoped lint and backend typecheck73821 pass.
- Queued SSE polling backs off after four unchanged polls, preserving fresh
  authorization each poll and125ms running updates. The proposed750–1000ms
  deterministic spread and two-second fixture warm-up were independently reviewed
  by Luna without finding a weakened workload.
- New source-stable run99515045-420d-42ae-8f01-8661db143ab6 is retained as
  evidence/accounting-load-final-jittered-poll.json:100streams,8running/92queued,
  1m history unchanged, no stream/writer errors. Baseline79/100,p951580.395ms;
  loaded300/300,p95164.202ms. It FAILS AC9 and is not acceptance evidence.
  Prior adaptive run remains failed at123.903ms. No cherry-picked pass or target
  change. Luna owns a bounded read-only contention diagnosis before more changes.
- No application database switch, commit or merge. Preserve old development data.

- Follow-up source change skips the unused dictionary-settings read in SSE
  `includeMaterial=false` resolution. Backend typecheck passed. New source-stable
  run4f219692-5b5d-4441-9b73-1c8457682eab regressed to baseline33/100,p95
  6071ms and loaded176/300,p95 4578ms, with no stream failures. The file is
  retained as `evidence/accounting-load-final-no-settings.json`; do not use it
  as acceptance evidence or infer that the one-query removal caused the result.
- Luna read-only diagnosis: Node scheduling lag stayed <=53ms, while PostgreSQL's
  single global capacity advisory lock reached p953534ms baseline/1893ms loaded.
  Admission and explicit Stop both serialize through this lock; fixture keeps
  92 queued/8 running turns and finalizes admitted turns through Stop. SSE locks
  may extend a mutation's lock duration but sampled evidence cannot identify a
  specific reader as blocker. There is no evidenced simple threshold-only fix.
- The user directed preserving the100ms AC9 target and authorized the larger
  capacity-lock redesign. See checkpoint11 for implementation and final evidence.
- No database cutover, commit or merge pending final review and remaining gates.


## Integration checkpoint 11 — bounded capacity-lock redesign and AC9 pass

- Conversation source material is prepared in an unlocked read transaction,
  fully closed before admission. The final transaction keeps global-first lock
  order, reauthorizes actor/source/chat, compares source/chat witnesses, and only
  then admits or writes. A changed snapshot returns a conflict before billing.
- Explicit Stop no longer takes the global text-AI capacity fence. Row locks,
  persisted cancellation intent, and trigger-maintained queue/provider counters
  remain authoritative. A real PostgreSQL regression confirms Stop can proceed
  while an unrelated transaction holds the global fence.
- Final conversation-store suite37/37 PASS; backend typecheck and scoped ESLint
  PASS. An unrelated standalone conversation-accounting suite still fails14/15
  due fixtures missing current budget/funding configuration; it does not exercise
  the modified path and is recorded for review rather than hidden.
- AC9 final artifact: `evidence/accounting-load-staged-final.json`, run
  `6661b4e3-8f75-4d3a-9c6f-af2d36903f4d`, source unchanged. Exact workload:
  100 SSE streams,8 running/92 queued,10 admissions/sec and1m immutable ledger
  rows. Baseline100/100,p9581.118ms. Loaded300/300,p9593.280ms, no failures;
  peak advisory waiters2 and scheduling-lag p957.964ms. AC9<=100ms passes.
- No development DB cutover, feature commit, merge, push, or branch deletion.
  Independent completion/security review, remediation if needed, and remaining
  feature gates are pending.

## Integration checkpoint 12 — final lock-order and preprocessing bounds

- Claim checks compact capacity projections before acquiring actor/source/chat
  locks. A candidate that becomes stale, is cancelled, or fails authorization
  ends that claim transaction so skipped candidates cannot accumulate locks
  across shared-source owners.
- Stop authorizes with shared lifecycle locks. For action-accounted terminal
  updates it acquires owner and global operator settlement locks before the turn
  update fires queue-projection triggers. Real PostgreSQL regressions cover both
  claim-vs-Stop ordering and operator-lock-vs-projection ordering.
- Conversation POST source preparation is bounded by a 30/min learner rate,
  one active preparation per learner, and ten globally, with 300-second Redis
  lease expiry. Routes release leases in `finally`; failures are fail-closed.
  Unit route tests and two-client Redis integration tests cover rejection and
  cleanup.
- Focused PostgreSQL suites pass 55/55; Redis limiter suite passes 6/6; route
  and service unit suites pass 9/9. Backend typecheck, scoped ESLint and
  `git diff --check` pass.
- Fresh exact AC9 run `ae53ad48-d711-47ab-905e-accc509111bf` is recorded in
  `evidence/accounting-load-claim-order-final.json`: loaded phase 300/300,
  p95 94.457ms, no failures, unchanged source. The 100ms gate passes.
- Completion/security review, final build, browser/user-flow checks and
  development database cutover are closed in the final checkpoint below. Only
  the final feature squash merge remains.

## Final completion checkpoint (2026-10-23)

- The corrected mixed legacy/current conversation accounting suite passes 15/15;
  backend typecheck, scoped backend/web E2E lint, docs/user-flow checks and
  `git diff --check` pass. The final emitted backend build succeeds.
- Learner browser journeys pass 7/7 across profile budgets, output limits, paid
  dictionary/text/sentence flows, sentence preparation and portrait interview.
  The admin accounting/payment journey passes 1/1 on a fresh isolated admin E2E
  database. No real provider calls or app DB were used.
- AC9 passes at 94.457 ms p95 for 300/300 loaded admissions under the unchanged
  100 ms target. Independent completion and security reviewers are READY; see
  REVIEW.md and EVIDENCE.md for exact artifacts and residual risks.
- Fresh local database `languon_ai_accounting_dev_20261023` has all 107
  migrations and no user, grant or action data. `.env.local` points the app,
  dictionary worker and `dev:all` guard at it. The prior portrait-repair DB is
  preserved. `dev:all` starts; API readiness reports PostgreSQL/Redis ready and
  the profile page returns 200.
- Production economic calibration and reviewed role-script reapplication remain
  deployment prerequisites. The feature has no invented economic defaults.
