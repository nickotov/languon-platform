# Correction: OpenRouter worker reachability

Status: Complete
Created: 2026-10-26
Updated: 2026-10-26

## Routing decision

Bounded existing-behavior correction found while fulfilling the explicitly
requested local admin setup. OpenRouter's completion endpoint rejects HEAD404,
incorrectly advertising unavailable workers despite a valid inference credential.
Use the same fixed-origin provider catalog endpoint for HEAD reachability only.
Preserve unverified status, current matching admin flow checks, credential policy,
budgets and all dispatch/accounting guards. No public contract, schema, dependency,
financial policy, trust-boundary expansion or new capability. Current branch;
no automatic commit. Preserve pending documentation work.

## Acceptance criteria and verification plan

- AC-1: Real completion HEAD404 does not falsely prevent OpenRouter reachability;
  only the reviewed catalog HEAD200 publishes unverified observations. Transport
  failures remain unavailable; no generation or paid calls in automated tests.
- AC-2: Complete authorized local Luna setup through existing admin, preserving
  current Free policies and matching10/.10/1/5 budgets. Add current Luna price,
  reviewed100/500/100 flow tariffs, run bounded synthetic checks, publish only
  with real current evidence and verify readiness/idempotence. Auth/key/restart
  prerequisites cannot be bypassed.

Focused production observation regression first, adjacent provider tests,
backend typecheck/scoped lint. Real non-generation HEAD evidence and actual local
admin observations verify runtime; no DB/schema change requiring disposable DB
suite. Reuse existing E2E for unchanged UI controls, record actual paid checks
separately. No fabricated readiness/probe rows or token extraction.

## Current evidence and scope

User explicitly authorized local admin configuration and signed-in Chrome use;
then replaced key and restarted. Official non-generation key diagnostic confirms
managementOnly:false, HTTP200. Native Chrome form published Luna provider price:
inputUSD.10/outputUSD.50/cache-readUSD.01/cache-writeUSD.125, no request floor,
source openrouter-luna-standard-2026-10-26. Existing action/operator budgets
already10/.10/1/5; existing Free capability policies retained. No learner balance
changes. One Quick request rejected Recent authentication required before any
provider result. Matching route revision remains0/unpublished. Native form draft
selects Luna as sole enabled/default route; tariffs not completed yet.

Read-only current worker observations show OpenRouter unavailable with sanitized
readiness failure. Live non-generation HEAD /api/v1/chat/completions returned404;
HEAD /api/v1/models returned200 with the same credential. These requests did not
generate content or spend tokens. No model-name, key or prompt content exposed
to learners. Public origins remain code-owned and unchanged.

## Remaining work

Regression/fix/checks; user worker restart after correction and fresh admin auth;
complete UI setup, read-back and doctor. Preserve original combined USD.10 paid
check authorization: previous knownUSD.000300 plus3 unknown requests cappedUSD.01
each; stop before exceeding remaining authorization. No automatic ambiguous
retry or false recovery. Runtime checks are distinct from fake test proof.

## Correction verification

Regression reproduced before fix:1 failed/17 passed in worker-observation suite.
After the fixed-origin OpenRouter catalog HEAD target:42 tests/2 files pass
(worker observations and production gateway adapters); backend typecheck exits0,
scoped ESLint and formatting/diff checks pass. Same source runtime after the user
restart now publishes all3 OpenRouter models as unverified (not available),
confirmed through read-only local observations. Existing actual flow gates remain
mandatory; no credentials or model activity inferred from the public catalog.

Orca window-id selection returned the other Chrome profile, so unrelated page
content was not acted on. Resolved using native window focus of the authorized
localhost:3001 window, an isolated Orca snapshot namespace and no window-id
override. Each form action verifies local admin URL and uses fresh native
accessibility indexes. No webpage evaluation, cookie/token extraction, auth
artifact storage or direct database writes. First tariff number100 successfully
entered/read back; not published. Existing provider price confirmed saved.
Fresh sign-in requested for batch of13 admin probes and exact form publication.
Additional batch provider budget cappedUSD.05 inside originalUSD.10 total;
unknown cost consumes its full authorized maximum and stops retries.

## Resume local admin setup

Current blocker: fresh admin sign-in requested asynchronously; no additional
restart needed. User previously authorized signed-in Chrome use and provider
checks; new key verified inference-capable. Native window-targeting issue is
resolved: focus localhost:3001 Chrome window via native window API, then use Orca
without its unreliable window-id selector and with snapshot namespace
languon-admin-setup-65eb1c7a. Helper /tmp/languon-admin-gui.mjs verifies local URL,
fresh AX indexes and read-back. Number entry tested: single-card input100 draft.
Do not read cookies/tokens or run page JavaScript.

After fresh sign-in, run from repository root:
node /tmp/languon-run-luna-admin-checks.mjs
Then only if all12 flows pass:
node /tmp/languon-fill-luna-routing.mjs

These are native GUI operations; DB access is explicitly read-only for outcome
confirmation. First script performs one quick +12 flow checks through existing
admin controls, caps added provider expense at50000microUSD, persists metadata
in /tmp/languon-luna-admin-checks.json, preserves spent allowance/passing checks
on resume, stops for failures/unknown execution/auth or changed env mtime and
never automatically retries provider work. Second script requires every passing
flow, fills100/500/100 tariffs for11 paid-capable flows, publishes Luna-only route
with no fallbacks/overrides, then reads back exact configuration. Existing Free
capability policies are preserved. It performs no duplicate publication if exact
configuration already matches. Both scripts pass node --check; not executed yet.

After success: read-only doctor runtime, exact current configuration/price and
unchanged budgets/funding comparison, native UI version read-back. Report Free
funding preserved, actual probe expense, remaining real learner-flow evidence,
and no duplicate mutations. No code/docs commit authorized by setup request.

## 2026-10-26 continued setup

Fresh user sign-in received. Native UI quick check for Luna passed in4025ms:
29 input/5 output tokens, measured provider expense6microUSD (USD0.000006).
Actual UI reads `Check result : passed`; AX represents this as a container,
not a separate `text passed` node. Helper assertion corrected without another
provider request. First single-card flow submission rejected the five-minute
recent-authentication gate before admission; no probe row/provider call.
Passing quick-check evidence and expense retained for resume, not retried.

Preparing every tariff field before another sign-in to avoid spending the
recent-auth window on data entry. Four complete tariff sections read back
100/500/100: single-card, card-authoring, pasted-terms, import-pairs.
Other sections not yet fully confirmed. No routing revision published. Native
keyboard focus interruptions stop the script; confirmed values retained, no
publication or paid work retried. A read-only baseline in /tmp confirms
10/.10/1/5 accounting settings, existing five explicit operator policies and
saved Luna provider price. Portrait uses its established Free default.
Runtime doctor still blocked by absent routing (expected), not a completed
learner generation claim. Need final fresh authentication, matching12flow
checks and exact saved routing readback before AC-2 can be complete.

All11 tariff sections now prepared through native UI and read back100/500/100;
Luna remains sole enabled/default route in the unsaved form. Reason populated.
Preparation completed successfully without publication or paid calls. Native
focus stability improved by allowing0.3s for activation before each action.
Final publication helper /tmp/languon-publish-prepared-luna.mjs requires all12
successful flow checks, unchanged empty routing state and the retained draft
reason, then saves once and verifies exact full configuration via read-only SQL.
It does not refill fields, so the fresh sign-in window is reserved for checks
and publication. If the form is reset by sign-in, stop instead of publishing
an empty/incomplete draft. Need user fresh sign-in again: previous window expired
before first flow probe admission. Quick result remains usable; provider expense
for this resumed batch so far6microUSD, not a completed route setup.

## Latest actual checks and blocker

User signed in again and left prepared AI settings tab active. Retained Quick
pass; real flow checks passed single-card, card-authoring, import-pairs,
sentence-generation and sentence-check. Pasted-terms and document-terms each
failed provider_unavailable in1643ms/1237ms; no reported usage or expense.
These flows share the production pasted-terms schema. This is evidence of a
shared contract failure, not proof of its upstream cause; no raw provider
error persisted in the probe record. Do not call these transient or schema
errors without further evidence. Failed checks were not retried.

Known total provider expense for current resumed batch1177microUSD
(USD0.001177); two unknown requests consume their USD0.01 maxima against the
budget, so authorized exposure so farUSD0.021177 of the additionalUSD0.05.
Previous Feature054 exposure remains separate (USD0.030300), combined maximum
exposureUSD0.051477 inside originalUSD0.10 authorization. No learner charges.

Before text-detection, recent authentication expired again; rejection admitted
no request. Pending five checks: text-detection, text-translation,
text-selection-card, conversation, portrait-interview. Prepared routing not
published: all12 flow checks required, two currently failed. No bypass or
fabricated probe evidence. AC-1 complete; AC-2 blocked by actual provider failures
and fresh admin auth for remaining probes. Preserve all unsaved form fields and
existing accounting policies. Do not report local generation setup complete.

Existing /tmp/languon-check-remaining-luna.mjs retains completed passing and
failed checks without resubmitting them and preserves expense exposure. It can
continue the five unattempted flows after fresh sign-in, within unchanged
budget. /tmp/languon-publish-prepared-luna.mjs must not be run until all12
matching flow checks genuinely pass. Need diagnose shared pasted-term provider
rejections before claiming activation; current generic persisted failure is
insufficient to establish HTTP status or specific provider reason.

## Shared pasted-term wire-schema correction

Two separately bounded synthetic diagnostics now establish HTTP400 and the
recognized provider schema error: `Invalid schema for response_format 'response':
[] is not of type 'object', 'boolean'.` No raw provider payload/prompts/key logged.
The first diagnostic attempt failed local price metadata validation before any
transport; its maximum released with evidence of the pre-transport Zod error.
The two actual diagnostic calls each retain USD0.01 uncertain expense exposure.
Current batch exposureUSD0.041177; combined with earlierUSD0.030300 is
USD0.071477, within originalUSD0.10. Diagnostics are not stored admin activation
proof and must never be treated as matching checks.

A fake-provider transport capture (no real provider call) localizes malformed
wire schema to warnings.items=[], produced from z.tuple([]) by installed SDK
conversion. Bounded correction: express the same optional empty-only warnings
array using a string item schema with length0. No accepted output expands:
nonempty warnings remain rejected; omitted/empty still accepted. Production
pasted-term generation and document enrichment share this schema. Automatic
schema fingerprint invalidates only affected flow evidence. Preserve domain
validation, budgets, limits, transport controls and charging semantics.

Verification: add a red actual production SDK wire test using fake HTTP for
both affected flow schemas, assert legal object items/maxItems0 and unchanged
empty-only validation; run affected generators, registry, probes and gateway
suites plus backend typecheck/scoped lint. Read-only discovery found the admin
form reason is now blank after sign-in: prior draft was reset. Do not claim
fields are retained or invoke prepared-publication helper until rebuilt. Keep
setup incomplete pending restarted runtime and real matching checks.

## Schema repair verification and infrastructure blocker

Exact cause: warnings: z.tuple([]).optional() becomes warnings.items=[] in the
installed provider SDK wire schema. Replaced with
z.array(z.string()).length(0).optional(): same accepted values, legal string item
schema and maxItems0. Two actual SDK/fake-HTTP regressions (pasted-terms and
document-terms) failed before fix,24 adjacent tests passed. After fix46tests in
4files pass: gateway-provider-adapters, pasted-terms-proposal-generators,
probe-flow-registry and text-ai-probe-executor. Backend typecheck, affected ESLint,
Prettier and diff checks pass. Test-only flowId string inference corrected with
as const; final source/test run passed after that correction.

Commands:
- pnpm --filter @languon/backend exec vitest run tests/unit/modules/text-ai/infrastructure/gateway-provider-adapters.test.ts tests/unit/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators.test.ts tests/unit/infrastructure/probe-flow-registry.test.ts tests/unit/modules/text-ai/text-ai-probe-executor.test.ts --no-file-parallelism
- pnpm --filter @languon/backend typecheck
- pnpm --filter @languon/backend exec eslint src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators.ts tests/unit/modules/text-ai/infrastructure/gateway-provider-adapters.test.ts
- pnpm exec prettier --check apps/backend/src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators.ts apps/backend/tests/unit/modules/text-ai/infrastructure/gateway-provider-adapters.test.ts

Registered node scripts/run-critical-flows.mjs --flow ai-execution-contracts was
attempted twice. Both fail before executing tests: disposable PostgreSQL does
not become ready. A separately created isolated no-port diagnostic PostgreSQL
container retained the actual initdb error: could not write pg_wal/xlogtemp:
No space left on device. Removed only this owned diagnostic container and its
own anonymous volume; runner cleaned its own containers. Existing app/test
containers and data not pruned or stopped. This is a real missing execution
verification prerequisite, not a test pass or waived requirement. No automated
paid tests ran.

Need reclaim Docker storage with user-reviewed scope (never blanket-prune app
volumes), rerun registered execution stage, restart user-owned dictionary worker
(which uses tsx without watch), then rerun two schema-affected checks and five
unattempted checks under fresh admin auth. API uses tsx watch; do not infer that
its reload also updated the worker. Five earlier unaffected passes are retained.
No real post-fix admin probe or learner generation completed, no routing active.
Preparation form reset after separate-tab sign-in; do not claim draft retained.
Current Free policies mean learner tariffs are not needed for Free execution;
consider deferring unused tariff entry to paid setup rather than spending fresh
authentication window on unnecessary input. Any change to intended setup should
be stated clearly; preserve Free funding and independent cost prices.

Author review: same accepted empty-only schema values and local validators;
shared schema covers real pasted-term/document path and probe. Automatic schema
fingerprint invalidation remains intact. No new trust boundary, SDK dependency,
public API, DB schema, pricing/charging or output acceptance expansion. Independent
review not triggered for this bounded equivalence correction. Existing native
browser evidence proves pre-fix admin failures and five successes only; post-fix
runtime evidence remains required. No commit authorized; unrelated docs preserved.

Docker storage read-only inventory:291local volumes,9active,29.67GB total,
28.18GB reclaimable; no build cache. No blanket pruning performed. Preparing an
exact unused-anonymous-volume inventory for explicit destructive-cleanup review.
Final verified content hashes:
- pasted-terms-proposal-generators.ts:7ac6ecfc9f074836460104ea2d95c4e44cd699028a0f887b00a0836d5ef9bc7e
- gateway-provider-adapters.test.ts:6133f334e26d7f8918683f665e7ec70ffaf8370734613b4e4535d1566d5b9f75

## Approved storage cleanup and reported card-authoring503

User explicitly approved deletion of the273 inventoried unused anonymous Docker
volumes. Validated exact273 unique64hex names, intersected with current dangling
inventory, checked every volume for running/stopped container references, and
used docker volume rm without force (protects against attachment races).
Removed273, skipped0, failed0. No named/unlisted/attached volumes removed.
Read-only docker system df: volume use29.67GB ->6.334GB (about23.34GB reclaimed).
Owned cleanup report /tmp/languon-volume-cleanup-results.json. Registered
ai-execution-contracts now starts Vitest against new disposable PostgreSQL/Redis;
waiting for result, not yet claimed passed.

User reported card-authoring-generations503 generation_not_available. Current
read-only local snapshot proves routing remains empty (no active revision).
Current doctor explicitly blocks card-authoring: publish approved default route;
old learner/default model settings cannot authorize work. Credits/provider price
alone do not enable dispatch. This is the unfinished admin activation, not
established evidence of credit failure or a newly failed provider call.

Asked user to restart pnpm dev:all (worker is nonwatch) and sign in fresh, leave
AI settings tab active. Prepare seven remaining/repaired probes followed by
publication. Preserve five unaffected passes, rerun two fixed-schema failures;
no ambiguous retry. Original combined provider authorization remainsUSD0.10:
prior exposureUSD0.030300, so continued batch hard maximum69700microUSD.
Existing batch exposure41177microUSD retained; increasing self-imposed batch
cap from50000 to69700 stays within original user authorization and reserves
unknown expenses fully. Diagnostic requests do not count as activation proof.

To minimize activation work, explicitly told user current Free policies require
no customer tariff entries. Publish Luna-only default, no overrides/fallbacks,
flowTariffs empty. Preserve independent provider prices/operator budgets and all
Free policies; learner tariff publication can accompany an explicit paid setup.
This avoids unused11tariff data entry and auth expiry. Prepared
/tmp/languon-luna-postfix-checks.mjs and
/tmp/languon-publish-luna-free-routing.mjs (both syntax-check), native GUI writes,
read-only SQL outcome checks only. Need user restart/auth before running them.

Post-cleanup registered execution stage passed:257tests, no skips,23files,
167.11seconds; process exit0. Deterministic production composition with fake
provider HTTP and real disposable PostgreSQL/Redis, including admitted batch
worker, gateway SDK wire and financial fencing regressions. Report
 test-results/critical-flows/f003a750-59db-4bfe-b2a7-3ea6c3615a70/ai-execution-contracts.json
(untracked generated report not committed). User confirmed worker/app restart
and fresh admin sign-in. Resuming seven repaired/remaining real admin checks
with original combinedUSD0.10 maximum, then Free route publication.

All12 real admin flow checks now passed with the current repaired schemas,
including pasted-terms/document-terms, plus retained Quick pass. Additional known
successful usage raises batch exposure42540microUSD; combined original maximum
exposureUSD0.072840 insideUSD0.10. Failed/diagnostic expenses remain unknown,
not zero. Native publication attempted once; no revision persisted. Inspection
found a separate admin UI validation defect: FlowRoutingFields force-renders
11 collapsed tariffs with unconditional required rules, even though operator-funded
flows require no customer tariffs in the existing backend contract. Validation
is hidden in collapsed sections; no server publication happened. Price/routing
state read-back still empty and form fields are populated for Luna/default/reason.
Do not retry or claim activation before resolving this form/contract mismatch.

User asks whether browser is necessary and suggests MCP. Existing dev:configure
already calls admin APIs but only accounting/provider sample profiles, no route
publication/probes. It needs LANGUON_DEV_ADMIN_TOKEN, which is not present in this
process/environment; no browser tokens extracted. Direct SQL would bypass normal
activation, revision and audit guards, so use existing verified services/API.
A future scoped dev-admin CLI/MCP adapter is a new delivery decision, not silently
authorized by a proposal question. Current setup remains active, pending valid
routing publication. Browser UI is the currently authorized signed-in transport.

## Free-flow routing form correction plan

Classification: bounded correction of existing admin/API behavior, no new API,
capability, auth policy or billing decision. Source of truth already allows
missing learner tariffs for operator-funded flows; server remains authoritative
and rejects missing paid-flow tariffs. Fix UI unconditional required checks and
strip only entirely empty tariff entries from its submission; preserve partial
and zero-valued entries for existing Zod validation. Existing top-level invalid
configuration alert handles partial tariff errors visibly, rather than silently
blocking collapsed fields. No auto-publication, rates or funding-policy changes.

Use frontend-development/testing/user-flow-e2e. Red real rendered form unit
regressions: empty tariffs permit submit; partial tariffs block submit and show
visible alert. Existing configured tariffs retain normal journey coverage.
Update mapped admin routing journey to clear one irrelevant unused-flow tariff
in an otherwise valid configuration so browser test proves no invented zero
rate and server paid-flow checks remain authoritative (use Free policy when
necessary). Run affected admin tests/typecheck/lint/build plus mapped browser
journey and docs traceability checks. No extra paid probes needed: all12current
live flow checks have passed already; preserve their valid evidence.

Free-routing form regression: red1failed/8passed before correction. Final form
suite10passed including omitted tariffs and visible partial-tariff error;
all admin75tests/11files passed. Admin typecheck/lint/build passed. Build retains
existing nonfatal large-chunk advisory; JSDOM emits known pseudo-element notice.
Mapped critical admin-text-ai-routing real Chromium journey passed1test/no skips
in47.5seconds on owned disposable infrastructure. Its real API fixture switches
its synthetic account's capability policies to operator funding, publishes the
actual form with no learner tariffs, verifies flowTariffs={}, then exercises
existing emergency disable/restoration/recovery. Desktop/narrow observations,
console errors, page errors and unexpected failed HTTP assertions remain active.
No current learner account/policy changes and no paid provider calls in tests.

Guide updated for Free omission and partial-tariff error; mapped marker revision
86900ede05e932e9, docs:user-flows:check passes and E2E check validates1guide.
Existing cookbook clarified optional tariff table for Free capabilities. Runtime
backend execution257pass evidence remains valid: only frontend/docs/tests changed
after it, no backend/schema/provider/runtime changes.

All actual live Luna flow checks passed before form repair; they remain valid,
no paid check repetition needed. User asked about programmatic setup/MCP; answered
scoped dev-admin services/CLI adapter is appropriate, direct writes would bypass
normal audit/activation gates. No MCP server or new authentication mechanism
implemented without feature authorization. Current CLI lacks admin credential.
Asked for final fresh owner sign-in only for live route publication after all
repairs/tests complete; previously expired5minute window not bypassed.

## Final live publication (2026-10-26)

After user fresh sign-in, native admin UI published Luna-only default routing
version1. Exact configuration read back through read-only SQL:
enabledRouteIds=[openrouter/openai/gpt-6-luna], same default primary, no
fallbacks/overrides, flowTariffs={}. Existing Free funding policies, provider
price and10/.10/1/5 budgets compared deeply with pre-setup baseline: unchanged.
Reapplying setup detects exact match and returns Already matches; no mutation
needed. No paid checks repeated for publication, no learner credit changes.

Current actual card-authoring runtime readiness passes: approved active route,
matching successful flow check, current provider price/credentials and fresh
compatible worker. This clears the missing-routing prerequisite behind the
reported card-authoring503. Does not assert a new learner generation was run.
All12synthetic provider flow checks passed; actual check expense measurements
and uncertain diagnostics remain separate. Original combined max exposure
USD0.072840, insideUSD0.10 authorization.

Final full runtime doctor initially reported only three excluded batch formats:
pasted-terms:v2, import-pairs:v2, document-terms:v2. They were absent entirely from
the explicit ignored .env.local worker mask, while card-authoring and other
runtime checks passed. Completed authorized local setup by appending exactly
these three existing supported formats, preserving every existing format and
credential. Configuration-phase doctor now exits0 with no blocked prerequisites.
User-owned worker/process was not restarted automatically. Need user restart
pnpm dev:all to load updated formats, then full runtime doctor; this is the sole
remaining setup verification. Card authoring requires no additional restart.
No further sign-in or paid flow checks needed. Status remains In progress only
for that worker-restart confirmation; source fixes, tests and live route save
are complete. No commit/push performed.

Native publication performed real save plus exact DB read-back. A later optional
rendered-version lookup returned no matching local lines; no claim of that extra
observation. Mapped real-browser regression already proves same form save and
rendered version1 on disposable infrastructure. Saved live revision and
idempotence verified independently via read-only database.

## Startup regression after enabling document format

User's restarted dev:all fails in the real worker config loader because the
newly appended document-terms:v2 requires document object storage plus scanner/
parser/runtime dependencies not provisioned in this local environment. Earlier
configuration doctor did not validate those process-specific prerequisites;
its pass was insufficient startup evidence. This configuration mistake was
introduced by our local setup and is being corrected immediately.

Bounded fix: remove only document-terms:v2 that we added; retain pasted-terms:v2,
import-pairs:v2 and all original formats. Do not add fake/deterministic document
storage or weaken runtime validation. Document ingestion remains unavailable
until separately provisioned. Validate the actual production worker environment
loader before/after and run its focused regression suite, then worker healthcheck
against the existing local target without consuming queued jobs or paid AI.
No app-service restart performed without authority; healthcheck is bounded and
not the long-running generation worker. Preserve live routing/version1/Free
policies and unrelated changes.

Startup correction verified: actual local worker config loader reproduced
storage-required failure before change, then passes after removing only
our added document-terms:v2. Remaining17formats include card-authoring:v3,
pasted-terms:v2 and import-pairs:v2; documentMode remains unavailable.
No document-storage/security checks weakened and no fake document dependencies
provisioned. Existing worker environment/command suites26tests/2files pass.
Actual production dictionary-worker-command.ts healthcheck with ignored local
env exits0 after constructing real worker and checking local readiness. It did
not start job processing or stop/restart user-owned services. Fallback notices
are sanitized warnings, not startup errors. Source runtime unchanged, only
ignored local format mask corrected. Need avoid treating optional disabled
document ingestion as enabled merely to make doctor fully green.

Exact dev:all startup verification now passed. With all three app ports proven
free first, an owned process group launched pnpm dev:all against the corrected
local configuration. API /readyz returned200, admin3001/web3333/API4000 all
listened, and the command stayed running through an8second observation after
readiness. We then intentionally stopped only the owned verification process
group; exit130 in its redirected log is that explicit SIGINT cleanup, not a
startup failure. PostgreSQL/Redis retained. Post-cleanup app ports are free for
user manual startup. No further changes to routes, rates or funding.

Current authorized local text-AI setup and startup correction are complete.
Document ingestion is explicitly unavailable because its storage/scanner/parser
infrastructure is not configured; synthetic document-enrichment schema checks
never proved that infrastructure. Do not enable a document worker format solely
to silence the doctor. Any full-document provisioning is a separate scope,
not a remaining mandatory step for card/text/chat/interview/sentence or pasted/
imported term generation. Full doctor's document-flow warnings remain a known
limit while that optional pipeline is disabled. Current live user generation
was not manually run; real12flow synthetic checks and deterministic257backend/
75admin/browser-journey evidence remain valid for their documented boundaries.
No new source/runtime behavior, dependencies or public contracts changed in
this final config-only repair; no new guide journey/marker changes needed.

## Free admission500 regression (reopened)

Current user card-authoring POST returns500. Ranked hypotheses: Free zero-tariff
arithmetic/admission error; request-to-job Zod validation; response mapping.
Rolled-back synthetic real-store enqueue against the reported dictionary and
current owner's metadata faithfully reproduces an AiCreditInvalidAmountError
at maximumTextPrice, called by computeAdminTextAiRouting. All writes were
inside an outer transaction that rolled back; no visible job/provider call/
charge. The route computes zero customer rates for intentionally omitted Free
flow tariffs, then maximumTextPrice rejects amount<=0. Existing resolver permits
maxCreditsPerAttempt=0, rates are nonnegative, and operator-funded policy is
already authoritative; zero is a valid required result. Backend tests had not
exercised Free admission with an omitted tariff, although publication and model
checks passed. The earlier assertion that cleared routing alone fixed500 was
insufficient. No amount of additional admin configuration should be required.

Bounded correction: accept valid zero maximum in the pure arithmetic helper,
retain unsafe/negative guards, customer tariff requirement and all provider/
operator limits. No public/persisted contract, billing policy or exemption
changes; restores established Free semantics. Red unit arithmetic regression,
real disposable DB Free card-authoring admission regression with no tariffs/
wallet hold, existing paid rejection checks, affected execution gate, static
checks and same live rolled-back reproduction after fix. Independent focused
review warranted for the arithmetic invariant; paid behavior must remain gated.

Free zero-price fix: unit regression red1failed/6passed before guard change,
then7passed. Same real current-account synthetic enqueue now succeeds and returns
queued inside the deliberately rolled-back transaction; no job, reservation,
profile default or charge persisted. Backend typecheck/scoped ESLint pass.
First registered execution run257passed/1failed: new snapshot assertion proved
the fixture silently kept an earlier default tariff. seedLegacyActionFixture
already seeds routing; add replace:true explicitly when omitting card-authoring
tariff. Assertions not weakened: maxCreditsPerAttempt0, tariffPublishedfalse,
operator-funded action, zero held credits, no wallet reservation and pinned
provider price. Rerunning complete critical gate, sequentially under its workspace
lock (parallel runner rejected before startup, lock not bypassed). New test fixture
option changes only disposable test setup; no production route/policy writes.
Independent reviewer is assessing only newest four-file zero-price delta and
associated invariants, preserving unrelated pending work.

Independent initial review by /root/free_admission_review completed with no
material findings. Scope: four-file zero-credit patch only at base395bccca,
review hashes f175fe17(model-price),a8391670(unit),7f115cec(fixture),
2cdd99c4(integration). Reviewer traced omitted paid-tariff rejection in routing
and prepareLegacyAction, provider pricing and operator-limit/capacity guards,
valid nonnegative exact arithmetic, operator-funded zero learner hold and
positive output allowance. replace:true test correction confirmed necessary.
No security/billing-policy expansion. Only remaining evidence is final complete
registered critical gate; first257/1failed run cannot be reported as passing.
Asked user to retry actual UI while automated verification continues, to verify
current authenticated HTTP result without reading their browser tokens or
creating a real persistent job ourselves.

## Final Free-admission verification

Complete registered critical gate passed on the final zero-price patch:
- setup-to-generation1,admin-text-ai-routing1,authentication3,
  admin-session-refresh3,dictionary-generation1,sentence-practice2,
  text-generation2,chat-lifecycle1,insufficient-credits1,free-interview1:
  16 real Chromium tests total, no skips.
- ai-execution-contracts258tests/23files, no skips, including actual omitted-tariff
  Free card-authoring admission and prior paid rejection/credit/operator/fencing
  regressions. Full runner exits0 and cleans its own services; generated web
  next-env file restored. Report root
  test-results/critical-flows/6e727bdb-e8c9-478b-b62a-cfbb9b43efe7.
- Pure maximumTextPrice unit suite7passed; scoped lint, final backend typecheck,
  Prettier and diff checks passed. Runtime source unchanged after verified fix.
- Current-account real-store synthetic admission succeeds with queued result,
  outer transaction rolled back. No actual persistent learner job or provider
  generation was created by diagnosis; optional learner UI confirmation not
  received and is not claimed as evidence.
- Independent review no findings, including test-clock remediation. Final hashes:
  model-price.ts f175fe17a8908bbc1bdf876f357f44ba5d8f2229d56ae0b11a5994e96e7601dc;
  model-price.test.ts a8391670a4772c902c9480a0865d10253ca35f2f4a13a018585dba9d330d422f;
  routing fixture 7f115cec6665364a8d3bac9c6ce480039c7900b5b48b5a6ac29e196404ff4ef5;
  card-authoring integration f5cbb58acae1c5b371ea90c5b615bc894ce8b04bfbc347571c8737564f093dda.

No new API, schema/migration, billing/funding policy, credit grant, route revision,
provider price or production dependency. No paid calls in these automated tests.
Established Free semantics restored; missing paid tariffs remain forbidden and
operator subsidy remains capped. Existing guides/commands/response contract
unchanged, so no additional guide revisions or E2E markers needed for this
bounded correction; retained mapped critical entries executed. Earlier source
fixes and unrelated documentation preserved, no commit/push.

API watch reloads the change; user should restart pnpm dev:all once so the
nonwatch dictionary worker also loads the shared helper for every capability.
No administrative reconfiguration, new sign-in or paid model checks required.
Correction code and verification complete; normal runtime reload is the only
operational action handed back to user. Document infrastructure remains an
explicit existing unavailable capability, not silently enabled.

## Reopened: namespaced model completion and delivery gate

Status for this follow-up: Complete. User explicitly requested the diagnosed
repair and delivery-gate changes after the admission-only fix. Reuse Feature054
provider-integration authorization for the necessary forward constraint migration;
this is remediation of its established namespaced catalog, not a new capability.
No data reset, historical migration editing, new MCP/service, or new financial
policy. Previous completion evidence proves admission only, not this worker path.

Reported job: read-only metadata establishes one dispatched attempt, unknown
usage, then lease recovery. PostgreSQL error headlines at 09:33:54.999 and
09:33:55.052 identify dictionary_generation_provider_circuit_format rejection.
Current schema and migration0044 prohibit slash-containing model IDs even though
Feature054 catalog includes them. Both complete and fail write the circuit within
their transactions; rejected bookkeeping rolls back terminalization, then the
expired dispatched lease is recovered as retry_exhausted. Provider success itself
is not established by retained evidence. Actual key regexp comparison is false.

Acceptance: preserve all existing keys/rows and safety bounds; accept catalog
namespaced keys through a generated forward migration; real PostgreSQL worker,
router and SDK completion/failure regressions with synthetic external HTTP;
Free/no tariff/zero hold plus settlement/provider-expense and circuit readbacks;
registered critical gate, migration-history/static checks, independent review.
Strengthen existing authoritative delivery instructions without adding another
workflow. No automatic paid calls in tests. Live verification remains separately
budgeted; prior authorized diagnostic exposure USD0.072840 of USD0.10 maximum.

### Namespaced completion remediation evidence

Generated0109_namespaced_provider_circuit via drizzle-kit from the schema;
existing migrations untouched. Regex retains the3–192 bound, legacy format-only
and provider/model/format keys, and extends model path segments to the reviewed
catalog namespace form. Generated snapshot/journal and reviewed deployment hash
updated; original deployment compatibility requirements retained.

Regression evidence: new real PostgreSQL tests initially rejected the same
circuit constraint (2failed). Fixed the synthetic SDK response fixture to unwrap
its delta; after migration Free success/failure both passed. Expanded to Paid
success/failure: initial fixture had an underfunded input allowance (1000/3000
synthetic tariff vs20-credit action cap), then an incorrect bigint matcher.
Corrected setup to documented100/500 tariff and funded100-credit synthetic grant;
no runtime financial guards changed. Final four worker/SDK cases pass, Paid
success charges25milli for100input/30output, failure0, Free0. Catalog key test and
existing cases passed earlier; full critical run will reverify the final14-case
file with no filter/skips.

The existing critical runner now requires all four named execution outcomes and
the catalog/legacy/malformed-key regression, independently of aggregate counts.
Tooling test replaces one required title with unrelated passing admission test
and proves rejection. Gate tooling exact count retained in log; no paid calls.
Backend AGENTS and authoritative critical-workflows guide now require affected
configuration/provider full completion and safe failure persistence, separate
live evidence, explicit cost authority and honest enqueue/probe limitations.
Existing reviewed setup profiles preferred; no new setup CLI or MCP introduced.

Normal pnpm db:migrate applied0109 to the validated local development database;
no reset/row deletion. API/worker remain running; this repair needs no restart.
Live synthetic learner used normal public signup/verification and dictionary
creation, then exactly one card-authoring:v3 all-fields fr→ru action through the
existing approved OpenRouter Luna route. First script stopped at local Zod fixture
validation (boolean instead of public enum) before any generation; corrected
request used enabled enums. Second script authenticated a separate synthetic
learner; no existing learner credentials/content read. Tokens stayed in memory.
Queued job7336a14f-bb0b-440e-b62e-6b142822bf41 reached persisted review with5
suggestions; repeat authenticated GET remained review. No automatic resubmit.
Metadata-only readback: one successful settled attempt,1046input/315output,
measured/calculated expense263microUSD, settled operator action success,
held0/charged0, circuit failures0/openUntilnull. Total diagnostic exposure now
USD0.073103 of originalUSD0.10 cap (previous unknown expenses still counted at
maximum). Synthetic accounts/dictionaries remain clearly labelled; no cleanup of
existing user content or synthetic paid balance grants in normal database.

Logs: /tmp/languon-circuit-live-smoke-final.log (safe stage metadata only),
/tmp/languon-circuit-funded-green.log (4focused passes),
/tmp/languon-circuit-typecheck-final2.log, /tmp/languon-circuit-dbcheck.log,
/tmp/languon-circuit-gate-tooling.log. Full critical evidence pending at
/tmp/languon-circuit-full-critical.log; review by /root/circuit_completion_review
in progress. No commit requested or performed.

### Final completion evidence for namespaced remediation

Complete. Exact final scoped10-file patch(base395bccca) SHA256:
9034035e6be0cf27d589cfd740f309c7b278e876bec747aa38a55bbaa9fdbe36.
Files: backend AGENTS; dictionary schema; migration0109, its generated snapshot,
journal and deployment classification; card-authoring generation-store integration
test; critical registry and its tests; critical-workflows operations guide.
No source changes after this fingerprint; evidence-only record update excluded.

- `node scripts/run-critical-flows.mjs` exits0. Final report directory:
  test-results/critical-flows/da50a445-a4f1-474f-a40a-408f0b271142.
  16 browser checks across all10 browser entries pass; ai-execution-contracts
  262tests/23files pass, no skips/retries. Changed card-authoring file14/14 pass,
  including all5 explicitly required incident scenarios. Backend stage298.89sec.
- `node --test scripts/critical-flows/registry.test.mjs`:14pass,0skipped;
  `pnpm critical-flows:check`:11valid entries.
- `pnpm --filter @languon/backend typecheck`, scoped ESLint and Prettier pass.
  `pnpm db:check` and `node scripts/migration-classification.mjs` pass.
- Disposable old-constraint→0109 upgrade in always-rolled-back transaction
  preserves legacy row IDs, counters and timestamps and permits namespace key.
  Generated0108→0109 snapshot deep diff contains only id/prevId and intended CHECK.
- Existing local application forward migration and one live synthetic learner
  public-API persisted review passed, as detailed above. No environment or admin
  changes required; no app restart required. Prior failed job remains historical;
  a new generation request uses the repaired constraint.
- Independent initial review /root/circuit_completion_review: no material
  correctness, security, performance or coverage findings for the exact patch.
  Reviewer verified final aggregate report, required scenarios, migration and
  live-smoke scope. No remediation or separate tester/security review needed:
  existing runner reused, no new trust/billing policy, SQL interpolation or
  concurrency design. SQL CHECK expansion remains bounded and validated.
- No API/response/UX contract or mapped guide behavior changed. Existing full
  browser journeys passed; developer gate docs metadata retained. No new user
  journey, ADR, setup CLI, provider pricing revision or financial policy added.
- Owned diagnostic PostgreSQL container5ac386f6 and its volume removed after label
  and fullID ownership check. Critical runner cleaned its services and restored
  generated next-env file. No user services stopped, no broad Docker cleanup,
  no user data reset/deletion, no secrets/token files, no temporary runtime
  instrumentation. Live script removed; only safe metadata logs retained.
- Final git diff --check clean. Prior unrelated pending changes preserved.
  No commit/push requested or performed.

All accepted remediation criteria complete. Remaining operational limit: external
provider availability/quality can change after a successful observed request.
The gate distinguishes deterministic regressions from separately authorized live
smoke evidence; it cannot guarantee third-party uptime. Paid/transport-failure
coverage uses controlled synthetic HTTP; live smoke uses operator-funded Free.
