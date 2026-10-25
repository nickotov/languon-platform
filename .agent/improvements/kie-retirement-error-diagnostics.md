# Improvement: Diagnose Kie retirement and preserve actionable model failures

Status: Complete
Created: 2026-10-25

## Scope and routing

Existing-provider diagnosis and established error classification/diagnostic
improvement. Preserve public job schemas, existing model_unavailable failure code,
charging policy, validation and provider selection. No replacement model integration,
new failure codes, persistence fields, production dependencies or paid calls beyond
one explicitly approved synthetic request capped at USD 0.01. Preserve prior setup
record and all unrelated user work. No commit authorized.

## Evidence and root cause

Reported job 7a35879c-af7e-403b-bfac-dd3c0517e513 passed admission and failed in 1.6s.
Offline execution snapshot validation passed. Existing worker suppresses raw SDK
errors and published only provider_unavailable; no safe HTTP/body error metadata
survived. One authorized synthetic real sentence check (app prompt/schema, no user
content) sent 3271 bytes with max_tokens 256, exactly 1 HTTP request. Kie returned
HTTP 200 with body code 410 and explicit retirement of Gemini 2.5 Pro upstream. SDK
reported AI_APICallError / Invalid JSON response. No usage reported. Byte/output
bounds imply approved worst-case cost below USD 0.01 using reviewed local rates.
An initial diagnostic budget mismatch dispatched zero requests and was corrected
before the single live request. No retry or second paid request is authorized.

## Acceptance and plan

- Parse only bounded safe provider error metadata, including Kie errors wrapped in
  HTTP 200. Never log provider message/body, prompts, secrets, user content or headers.
- Map retired/unavailable models to the existing model_unavailable error and stop
  retries; preserve existing generic handling for other provider failures.
- Wire safe worker diagnostic including allowlisted provider/model, kind and reason;
  isolate observer failures from execution/settlement. Existing UI already explains
  model_unavailable and offers AI preferences.
- Retain real provider/SDK regression for HTTP 200/code410 through production runtime,
  plus helper privacy cases and worker publication checks. Run critical gate and
  review diagnostic security. No live model-availability claim beyond this response.

## Verification

- Focused backend helper/provider/worker/runtime tests: 4 files, 86 tests passed.
  Helper and runtime rerun after the exactOptionalPropertyTypes fix: 42 tests passed.
- Scoped ESLint, Prettier and backend typecheck passed. Initial typecheck found
  an optional-number assignment in the metadata helper; guarding defined values
  fixed it before final verification.
- Runner self-tests: 13 passed after independent review found its synthetic report
  still had 52 tests versus the new 54 minimum. Fixed fixture suite counts to 29+15+2+8,
  and added explicit 53-test rejection. This is test-only remediation.
- Full critical gate passed: 69 tests (15 browser and 54 backend), no skipped,
  retried or flaky tests. Evidence:
  `test-results/critical-flows/39880e23-753d-4b39-bb8c-407f1c8fa968/`.
  All 15 browser checks passed, including new model-unavailable case with preserved
  answer and working AI preferences. Real SDK timing/retirement tests use fake HTTP.
- All 28 user-flow mappings and 16 checker tests passed; backend and web sentence
  guides remain synchronized. Backend troubleshooting records safe diagnostics and
  Kie HTTP 200 error envelope behavior; scenario/revision contract is unchanged.
- Independent security review: no material findings; bounded parsing/allowlisted
  metadata and observer isolation preserve secrets and execution boundaries.
- Independent code review: medium R1 fixture count finding resolved; final review
  reports no open material findings. Generated next-env.d.ts restored clean.
- Reloaded normal dev:all after verification. Dictionary worker reported ready;
  backend /livez returned status ok. No generation or old-job replay was requested.

No frontend production component or public response schema changed. Existing
`model_unavailable` UI is now reached for an actually unavailable provider model;
this produces actionable guidance instead of the generic service error. No UI
claim is based only on unit tests: real-browser case passed.

Existing failed jobs remain failed. The single authorized paid diagnostic was used;
no second request ran. The temporary diagnostic script was removed.

Rollback: revert the scoped diagnostic/classification and regression changes; no
schema or stored-data migration is required. Retain the existing provider prices
unless a separate configuration decision changes them.

## Remaining risks

Public errors intentionally omit raw provider messages. Exact retirement reason is
operator-safe diagnostic metadata; learner gets existing model-unavailable guidance.
Kie product page still advertises the retired model. Replacement requires separate
compatibility/pricing review, not an automatic substitution.
