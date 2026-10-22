# Preparation parent budget remediation

Status: Implemented and verified through0104; frontend browser and final independent feature reviews remain with the coordinator.

## Review scope

ACC-COMP-006 and preparation child-admission portion of SEC-052-02.

API Start for generated preparation admits one pinned parent action and customer
hold. Review-only preparation creates no action. Necessary background children
carry the parent action ID, share its total input/output, credit and operator
allowance, and retain stable individual call identities. Parent mapping history
survives explicit Continue. Resume cannot replace a parent budget. Exhausted or
expired authorization pauses; Continue requires a new explicit authorization and
any reduced-allowance confirmation. A running/ambiguous call must be recovered
before the parent can settle or another budget can start.

The checked child SQL function derives owner, authority, batch candidates, model,
price, provider limits and customer fields from persisted locked rows. It checks
live actor/source authority, parent deadline against the real clock, and a
coordinator fence. It inserts the job, provenance, child link and coordinator
pointer atomically. Restricted worker direct INSERT and immutable-field grants
are owned by the worker-authority remediation. Root owns generic parent terminal
and legacy accounting guards and numbered migrations.

A usable completed child determines parent success. Failed/invalid child usage
is excluded from customer eligibility while still consuming execution and
operator limits. Explicit Stop requires the API command receipt bound to the
particular parent; prior Stop receipts cannot authorize a later parent.

## Authored verification

Real PostgreSQL preparation suite now covers unfunded Start rollback, one hold,
multiple batches under one parent, stale coordinator rejection, exhausted total
output, no automatic new authorization, idempotent explicit Continue, and expired
paused-parent recovery. Existing composed sentence journey asserts held parent,
charged Stop, and rejection of Resume after settlement. It counts generic actions
and attempts rather than retired per-attempt reservations. Synthetic calibration
and current test clock replace obsolete legacy fixture assumptions; no paid calls.

## Executed checks so far

- Contracts build: passed (session 96509).
- Backend typecheck: session 18452 found no preparation diagnostics; failed only
  the unrelated performance harness exact-optional-property diagnostic at line61.
  Later SQL/security/retry edits still require final affected verification.
- Focused preparation source ESLint: passed (session47870).
- `pnpm user-flow:e2e -- check sentence-practice-backend`: passed after guide
  revision and semantic assertion updates. Traceability is not runtime evidence.

## Real PostgreSQL evidence

The coordinated disposable target was `localhost:55481/languon_auth_accounting_test`.
Private environment values were sourced without logging. No ordinary application
database was changed. Exact command:

```sh
pnpm --filter @languon/backend exec vitest run tests/integration/modules/learning/sentence-library-preparation.integration.test.ts --hookTimeout 120000 --testTimeout 30000
```

PG71232: **20/20 passed**, process exit0, duration7.72s, migrations through0103.
The captured patch manifest is `preparation-budget-pg-manifest.json` (base d441863).
The preceding failing runs found a real parent payload issue: passing whole
candidate objects leaked BigInt sort metadata into input JSON serialization. The
fix projects only entry ID, learning version, source text and target text. Two
subsequent fixture failures reflected obsolete Stop/Resume semantics and an
unordered SELECT assumption; the final tests exercise real cancellation,
preservation of earlier usable content, and explicit new-budget Continue.

No paid model was called. The suite applies forward migrations from an empty
owned test schema. Reverse data conversion is intentionally unsupported under
the approved fresh-development-data contract.

## Subsequent authored case

A 21st test now covers one shared automatic retry across different children and
an exact 0.001-credit parent charge for only the usable call. The failed first
and last calls remain operator expenses; charging all three would round to a
different amount. PG19614 subsequently passed **21/21**, process exit0, duration11.05s,
through0104, on the separately owned sentence accounting fixture. Its exact
charge assertion confirms failed child attempts do not inflate the learner charge.

## Composed mapped journey

Registered command `pnpm test:e2e:sentence-practice-backend`: session12756,
**2/2 passed**, process exit0, duration7.40s, through0104. A new separately owned
`localhost:55481/languon_auth_sentence_accounting052_test` was created only after
confirming it did not exist; the shared accounting test database was untouched.
Redis used `localhost:56381/12` with a unique namespace and scoped cleanup. Private
configuration remained in a mode0600 temporary environment file, not the repository.

The composed runner found a genuine chunked-body bug before reaching sentence
storage: the consent middleware consumed the original request body before a later
mounted body-size guard tried to read it. A minimal real Hono reproduction returned
`TypeError: Invalid state: ReadableStream is locked`. The legacy accounting owner
fixed this by inspecting a clone and added five passing middleware regressions.
The final composed suite passes with the real fix; temporary diagnostic wrappers
were removed. Both mapped guide scenarios and approved Stop/Continue assertions
remain intact, with synthetic providers and no paid calls.

## Restricted role and final scoped checks

Actual-role command:

```sh
pnpm --filter @languon/backend exec vitest run tests/integration/modules/learning/infrastructure/sentence-worker-role.test.ts --hookTimeout 120000 --testTimeout 30000
```

PG20979: **1/1 passed**, process exit0, duration2.94s, through0104, same separately
owned sentence fixture. It executes normal generation/check settlement and the
checked preparation child seam under an actual newly created restricted role;
learner/private mutation denials remain asserted. Raw financial-admission denials
are covered by the separate worker-authority suite, not claimed from this case. The previous
run reached all positive preparation proofs and failed only an obsolete final
assertion that dictionary translation-context reads were forbidden. The combined
text/dictionary worker already had whole-dictionary SELECT in base commit d441863;
the final assertion records that existing read contract, without changing grants.
User handles, account/status changes, vocabulary writes, personal visibility,
private snapshots and command deletion remain denied. The role and its grants
were dropped by fixture cleanup.

Scoped preparation runtime ESLint passed (session98271). Formatting and
`git diff --check` passed; a final test-file formatting adjustment changes no
assertion or behavior. The final source/SQL/test hashes are captured in
`preparation-final-manifest.json`. Backend compiler runs found no preparation
diagnostics, but the coordinator must retain the final complete backend build/
typecheck after all other remediation sources settle.

## Remaining coordination

No worker-owned database or compiler process remains active. The ordinary app
and shared accounting database were not changed during the separate fixtures.
Keep the new disposable sentence database for reproducibility; no cleanup/reset
of shared data or application data is authorized by this record. Frontend browser
verification, full feature preflight and independent remediation/security review
remain coordinator responsibilities. Subsequent changes to relevant shared
helpers or migration authority must be compared to these captured checks before
reusing evidence.

## Follow-up: composed browser fixture readiness (2026-10-22)

Frontend delegated a bounded diagnosis of sentence/preparation browser run44967
(`model_unavailable`) after migration0105 removed the earlier missing speech
cleanup helper. Read-only synthetic metadata in the frontend-owned loopback test
database showed both text and conversation capacity overlap active. The sentence
fixture published only a sentence-execution observation, which cannot satisfy
those shared capacity checks even while fresh. This explains the admission503
without changing production model availability rules.

The guarded `tests/support/sentence-web-worker.ts` now publishes a separate
`conversationCapacityObservationId` observation for the same sentence formats,
with text and conversation capacity revisions. It does not claim text or
conversation execution. Direct assertions against the canonical readiness
functions passed: sentence execution and both shared capacity checks accept the
combined row; unrelated text/conversation execution remains unavailable
(10 assertions, process exit0). Formatting and `git diff --check` passed.

A separate six-second, fixture-only process (session47325, exit0) on that owned
test database logged completion of fixtures, preparation, sentence and speech
stages for its first two loops. No loop stall reproduced in isolation. The
sanitized stage logs contain no identifiers or prompt data and stop after two
loops. The wrapper terminated only its own child, and a metadata-only session
check confirmed no remaining database connections. No shared accounting database,
application data, production source or numbered migration was changed.

These fixture edits supersede the fixture-file hash in the prior manifest;
they do not replace its successful parent-budget/actual-role/database proofs.
The final composed sentence/preparation browser rerun remains frontend-owned.

### Preparation-specific overlap regression

The next composed browser run reached normal sentence admission but preparation
Start still returned503. Its required worker format is `sentence-preparation:v2`,
which is intentionally an executor marker rather than a provider catalog format.
The sentence readiness predicate accepted a marker plus its registered base,
while shared text/conversation capacity predicates rejected that same valid
combination through their common `supports` function. The preceding ten direct
assertions covered generation/check formats and did not establish preparation
compatibility; they must not be used as evidence of that case.

Root explicitly authorized the bounded production correction. Canonical
`supports` now recognizes only preparation v1/v2 by requiring both the explicit
preparation marker and matching registered generation base. Namespace and
revision checks remain unchanged. Pure regressions for both versions reject
missing markers, absent/unregistered/mismatched base formats and incomplete
capacity/executor revisions, and preserve rejection of unrelated execution.
Both new cases failed before the fix. An existing selection assertion changed
to accept the now-consistent explicit executor evidence; capacity namespace
isolation remains asserted.

Final command: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/text-ai/infrastructure/text-ai-worker-observations.test.ts tests/unit/modules/text-ai/infrastructure/text-ai-admission-participant.test.ts`
(session51689): **34/34 passed**, exit0. Scoped ESLint on the helper and test
(session74219) passed, as did formatting and `git diff --check`. No database or
application process was launched for this correction. Final composed browser
verification remains frontend-owned.
