# Improvement: Centralized AI timeout environment configuration

Status: Complete
Created: 2026-10-25

## Scope and routing

Bounded internal configuration improvement, preserving existing generation,
charging and security policy. No API/schema/runtime dependency changes. Keep
API and worker validation separate, expose loaders through the existing backend
config entry point, and share schema-level diagnostic handling. No universal
client/server environment or eager exported singleton containing secrets.

Add SENTENCE_AI_TIMEOUT_MS and TEXT_AI_TIMEOUT_MS, fallback 180000 ms. Missing
fallback settings warn at load; missing required or invalid settings log sanitized
names and fail. Truly optional values without a fallback remain optional and quiet.
Existing conditional validation remains authoritative; do not relax secret checks.
Preserve unrelated dirty work and deferred BL-011. Rollback is source/config only.

## Acceptance and verification plan

- Shared configuration defines defaults and bounded positive integer validation;
  missing timeout keys warn; explicit values reach sentence/text runtime; invalid
  supplied values fail rather than silently using defaults.
- Shared parser diagnoses schema fallback/required settings without logging values;
  central config exports existing process-specific loaders, with no import-time IO.
- Retain production timing tests, add config/override tests, run affected static
  checks and full critical gate per AI configuration matrix. Independent review
  checks secret logging, process isolation and timeout wiring.

## Evidence

- Focused Vitest selection (API environment, generic diagnostics, worker environment,
  worker command, migration environment, playground environment, production sentence
  runtime): 7 files, 110 tests passed. Synthetic HTTP only. Includes validated
  45-second override, absent/blank defaults, invalid values, optional credentials,
  explicit empty-string settings and safe log content.
- Backend `typecheck` passed. Scoped ESLint passed after fixing a type-only import;
  Prettier and `git diff --check` passed. Intermediate typecheck failures in the
  generic Zod shape/index typing were corrected before final checks.
- `node --test scripts/critical-flows/registry.test.mjs`: 13 passed. Backend gate
  minimum now51 because retained production runtime tests increased from 5 to 6.
- Full `pnpm test:e2e:critical`: 10 entries, 14 browser checks plus 51 backend
  assertions passed, zero skipped/retried tests. Evidence:
  `test-results/critical-flows/b9b25740-b9f3-45fc-aa84-f68faf6b75c8/`.
  Runtime defaults/admission/provider/PG coverage uses fake external transport;
  no paid requests were made. A mid-run diagnostic-only change preserves an
  explicitly configured empty-string setting without a false fallback warning;
  focused tests and independent review validate the final helper state. Parsed
  configuration and generation semantics did not change.
- `pnpm docs:user-flows:check`: 16 checker tests, all 28 guide/mapping validations
  passed. Existing guides gain the moved API schema path; no scenarios/revisions
  change for metadata-only mapping. Development docs and sanitized `.env.example`
  document settings and diagnostics. Backend AGENTS routes future config additions
  through the existing facade and shared parser.
- Independent initial code review passed with no material findings; independently
  reran 32 focused tests on final helper state. Separate security review passed:
  existing auth/production/TLS/credential checks retained, no import-time reads,
  no secret values in new diagnostics.

## Implementation and limits

`config/environment.ts` is the shared backend export surface. API implementation
moved to `config/api-environment.ts`; worker/migration/playground/audio/storage and
recovery loaders remain separate schemas and are exported lazily. Executable
startup imports use the facade. This is not a browser/server environment singleton,
and does not migrate unrelated runtime feature-policy readers into startup state.

Shared parser logs one grouped fallback notice per schema load and names only.
Truly optional values remain quiet. API dynamic defaults and provider-budget
fallbacks have explicit grouped notices. Existing conditional requirements remain
inside their owning loaders and retain their fatal errors. Timeout definitions,
defaults and bounds live in `config/ai-generation-environment.ts`, and validated
worker values are injected into sentence/text execution.

No schema, billing, provider, concurrency or retry policy changed. Existing
configuration semantics are preserved except the requested configurable deadlines
and diagnostics. Normal development reloaded successfully. The worker reported ready and emitted
fallback notices naming both omitted timeout settings; backend `/livez` returned
status `ok`. Prior worker shutdown again could not confirm lease release; no job
was reset/replayed and existing fencing/recovery remains in force. No user data
was reset. The critical runner removed its owned containers and restored the web
ambient declaration file.

Base `1583902`, final source snapshot `f5f28db1bd0850ace631545140dc3f2417a7a20de42aa317db1db81e875cabab`.
Snapshot is SHA256 of `git diff --binary -- . ':!.agent'` followed by sorted
non-ignored untracked non-`.agent/` path+NUL+content+NUL. It captures the existing
unrelated dirty patch as well; the review boundary is the scoped files above.
Final changes after passing runtime checks are documentation/evidence only.

## Remaining risks

Longer configured deadlines still occupy bounded slots. Keep timeout at or below
existing 180-second maximum to stay below the 295-second worker drain budget.
