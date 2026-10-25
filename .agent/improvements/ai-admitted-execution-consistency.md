# Improvement: Consistent admitted AI execution

Status: Complete
Created: 2026-10-25
Updated: 2026-10-25

## Scope and routing

Fix repeated existing AI generation failures without new capability, public API,
charging policy, migration or dependency. User explicitly requests sentence fix
and audit of other affected AI flows. Preserve all pre-existing uncommitted work.
Use improvement flow for cohesive admission→provider consistency repair; escalate
only if a strategic boundary is needed. No commit authorized.

## Evidence and hypotheses

Sentence job4f00928e-588e-480e-932d-306bdc64ce49 logs `input_token_bound`.
Read-only local metadata: sentence-generation:v2, input JSON808 bytes, admitted
input8954/output8192; provider preflight requires prompt+schema+16384 framing.
Sentence accounting uses default8192 overhead at reserve/claim. This mismatch
rejects valid work before any model call, then maps it as invalid_model_output.
Audit independently identified top-level maxOutputTokens in three dictionary
adapters and remaining own batch-factory minimum-envelope checks. Other checked
text/interview/tutor adapters use modelSettings correctly.

## Acceptance and plan

- AC1: sentence reserve/claim and provider preflight use a consistent input envelope
  for generation/check/preparation without weakening token/cost/balance controls.
- AC2: real sentence provider reaches fake HTTP with admitted budget, outgoing cap,
  validated draft/usage, and rejects insufficient input bounds before HTTP.
- AC3: correct evidenced equivalent dictionary failures; audit other AI callers
  and document coverage and remaining limits. Tests use real default factories.
- AC4: focused tests, disposable real DB integration for changed persistence,
  relevant guide traceability, full critical gate, static checks and independent
  review pass. Reuse unchanged UI evidence. No paid diagnostic calls.

Root owns sentence/persistence/record; dictionary_adapter_limits owns3 dictionary
adapters and their focused tests. Follow existing accepted architecture/financial
policy; all customer charging decisions and budget ceilings stay authoritative.

## Verification

Pending. Use synthetic fixtures only; normal DB metadata read-only. New DB tests
run only on owned disposable infrastructure. Reload normal worker after verified
fix; never silently retry old jobs or submit extra paid work.

## Review, risks and rollback

Pending. Rollback restores scoped code/tests; no migration. Original failed jobs
are retained; free/paid policies and charging semantics stay unchanged.

## Implementation and regression evidence

Sentence schemas/framing calculation extracted into a pure infrastructure helper,
shared by reserveSentenceAttempt, worker claim and real provider preflight. It
accounts for the actual selected generation v1/v2 or check schema and local prompt
plus the existing16384 framing reserve. Original retained payload bytes remain a
conservative bound for aliased provider input. Normal/preparation child jobs use
the same claim path; parent preparation aggregate hold remains unchanged.

- RED: two real PG reserve→claim→realMastra fake-HTTP tests fail with
  `Input exceeds pinned token bound` when only the two overhead parameters are
  removed. Fixed parameters restored immediately; no normal data was mutated.
- GREEN: four real PG cases pass for generationv1/v2 and preparation childrenv1/v2;
  normal generation also proceeds through real check admission/provider. Explicit
  too-small bounds still reject before HTTP. Existing unit44 passed.
- Dictionary audit/fix: 3 adapters now use modelSettings.maxOutputTokens and
  maxRetries0; batch factories require per-chunk envelopes instead of five chunks
  during every construction. Existing full-envelope capability activation and
  aggregate worker/cost enforcement remain.38 focused tests pass, real router/
  factories/Mastra/fakeHTTP for DeepSeek and Kie and reduced65536/9000 budgets;
  outgoing max_tokens and one request onHTTP500 asserted. No paid calls.
- Text detection/translation, portraits and tutor audited: correct output option
  placement and sufficient current normal input overhead. Selection had a separate
  admission/provider framing and model-cap mismatch; it is fixed and covered by
  the real-PG boundary regression described below.
- Added existing owner/shared sentence-practice browser journey to critical gate
  with a narrowly allowlisted deterministic sentence-services flag. Registry now
  requires9 flows. Critical tooling10 tests pass; registry validator passes.

Test setup limitation: an initial sentence test attempted a
synthetic-key HTTP request and received401 because fetchProvider is a readiness
probe seam, not the Mastra transport. No real credential or paid generation was
used. Corrected to strict globalfetch fake before provider construction; restored
in afterEach. Final regression uses only fake externalHTTP.

Full critical gate and broader sentence integration checks are running.

## Review remediation and explicit deferred scope

Independent review CR-01 identified selection admission's actual model-cap gap.
Remediated with shared exact card-authoring envelope and min(model, aggregate)
preflight before job/hold. RED old enqueue admitted64001 bytes and held94.001
credits; GREEN63999 bytes proceeds through real PG/router/Mastra/fakeHTTP,64001
rejects with zero job/action/attempt/reservation/HTTP. Reviewer remediation passes.
Full selection15 pass; final sentence4 provider regressions pass after explicit
known-usage assertion (typecheck); earlier full sentence/preparation49 passed.

Real DB one-chunk pasted/import→worker→default router/Mastra/fakeHTTP tests2 pass.
Final retained dictionary unit/wire/router/worker56 pass. Backend type/lint pass.
The user explicitly deferred the larger accounting repair on2026-10-25. Recorded
as [BL-011](../../docs/backlog/011-dictionary-batch-call-accounting.md), Pending.
21+row batches still hit aggregate-vs-per-call accounting input authorization,
then the legacy8192-per-chunk output assumption. No checked accounting function,
migration or financial policy changed. Unfinished multi-chunk worker/output
changes were removed; worker source/tests match their pre-task state. Only the
verified SDK settings and one-chunk constructor corrections remain in this patch.
No failing or skipped multi-chunk tests are presented as passing coverage.

## Verification environment and critical-flow remediation

Docker exhausted its VM disk during a combined43-case integration run. That run
was interrupted and is not counted as passing. Removed only owned stopped test
containers/volumes; no shared prune or normal app volume deletion. Re-executed
selection15 +sentence4 against owned memory-backed PG successfully; cleaned it.
Earlier full49 sentence/preparation tests passed; unchanged preparation21 evidence
remains valid. Host disk had73GiB free; Docker reported239 unused volumes from
older runs, which were not deleted without ownership evidence.

Newly registered sentence browser journey exposed stale test prerequisites:
ambiguous sidebar/main New dictionary locator (now scoped to main), CommonJS
static contracts import (aligned with existing async import convention), and
missing synthetic speech provider price. Added a guarded speech-only fixture
setup action that calibrates synthetic speech prices and leaves text settings,
tariffs and budgets unchanged. Existing full
speech setup behavior and finite-wallet checks remain; no real provider is used.
Initial full fixture setup reset the text budget, causing a test-only failure;
provider-only setup avoids that. All red browser evidence is retained. Final
focused/full critical reruns are pending, not waived.

## Final retained-scope preflight

- Sentence provider44 unit cases, full sentence/preparation49 integration cases,
  final4 real-provider sentence regressions and selection15 integration cases pass.
- Dictionary56 focused unit/wire/router/worker and2 real-PG one-chunk worker
  regressions pass; the separate22 card/router/wire check also passes. Counts are
  not summed because repeated selections overlap.
- Backend/web typechecks, scoped lint, formatter, guide traceability and whitespace
  checks run on final retained source. No UI runtime code changed in this task.
- Critical sentence owner/shared generation, AIcheck, pronunciation and free saved
  reference journey passed with complete fixtures, no retries/skips. Final required
  nine-flow gate is running at
  `test-results/critical-flows/872319a6-8e4d-44d6-b713-1ba15a9a53f5/`.
- Reloaded normal dev:all after a clean stop in its existing terminal so the
  nonwatching worker loads fixes. Normal user data/infrastructure are preserved;
  no new generation is submitted or failed job retried automatically.
- No schema, checked accounting function, product charging rule or model cap was
  altered. BL-011 remains Pending per explicit user decision.

## Docker cleanup correction within verification tooling

Final full gate872319a6-8e4d-44d6-b713-1ba15a9a53f5 passed first3flows then failed
startup migration withSQL53100 Docker diskfull, not an application test failure.
Removed unused rebuildable Docker build cache only (402.1MB older than24hours,
then4.946GB remaining unused cache). Images, normal containers and every data
volume were preserved. Unidentified old anonymous volumes remain untouched.

Identified critical-runner cleanup omitted `--volumes` when forcibly removing its
owned containers, leaking anonymous PG/Redis volumes across repeated runs. Fixed
only that owned-container removal command. Ownership label validation and foreign
container refusal remain. RED command assertion fails without the flag; GREEN
cleanup regression and all10toolingtests pass. Actual Docker proof created one
UUID-labelled Redis container and empty anonymous volume, invoked cleanupOwned,
and verified both removed. No existing resource was touched by that proof.

Operations doc now states anonymous-volume cleanup. Final gate restarted under
`test-results/critical-flows/0fb0ef72-4df4-40cc-b19b-ac8fe2f9cd49/`; previous red
reports retained and not counted as successful execution.

## Final outcome

Final required critical gate0fb0ef72-4df4-40cc-b19b-ac8fe2f9cd49 exited0:
all9flows and14tests passed with no retries/skips/flakes/unexpected failures.
Owned containers/anonymous volumes and runner lock cleaned. Normal backend
`GET /livez` reportsok and reloaded dictionary/sentence worker is running.
Backend/web typechecks, scoped lint, formatting, guide checks and final
`git diff --check` pass. Reviewed/tested retained source hash against1583902:
`3408edd3c24bf18c70ca2ac4911ff424b18c6845d59e222346502b9eb5992d99`.

Independent initial and remediation reviews pass, including CR-01 selection
boundary, final scope/fixture safety, deferredBL-011 and owned-volume cleanup.
All required current-scope findings closed; final critical evidence is retained
in the summary and individual reports. No paid generation or valid provider
credential was used in these verification runs.

AC1/2: sentence admission/provider envelope mismatch reproduced and corrected,
verified through actual reservation/claim and real adapter for generation/check/
preparation; deliberate insufficient input still fails beforeHTTP.
AC3: SDK output/retry options and one-chunk factory bounds corrected; selection
nearmodelcap fails early beforeholds. Other inspected text/interview/tutor paths
use correct configuration. Larger-batch accounting is explicitly excluded by
user decision and recorded asPending BL-011; no incomplete patch retained.
AC4: static, realPG, realadapter/fakeHTTP, criticalbrowser and independent review
evidence complete for retained scope. New sentence critical journey and fixture
cleanup protect future runs. No product UI, API, schema or charging policy changed.

Remaining limitation: batches above20rows are not fixed in this delivery; see
BL-011. No claim of post-fix live model availability or output quality is made.
Older unidentified unusedDocker volumes remain; they were not deleted.
Normal user data is preserved. No commit made. Restore scoped code/tests/tooling
and reload worker to roll back; no data conversion is needed.
