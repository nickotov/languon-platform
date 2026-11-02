# Correction: Local startup format readiness and readable diagnostics

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Routing decision

Bounded correction of established local startup behavior. The initial doctor
incorrectly required the unconfigured optional document-terms pipeline.
The shared development logger mistakes known public auth/toggle metadata for
credentials and replaces digits, hostnames and the package name in diagnostics.
No credential protection, execution authority, provider/model, API/schema,
financial setting, dependency or production deployment policy changes.

## Scope and acceptance

- Preserve the intentionally unavailable document pipeline; remove only the
  document-terms:v2 entries mistakenly added to six ignored local allowlists.
  Require document formats in doctor when runtime/storage or explicit lists
  configure them; preserve all routes/models/prices/keys and unrelated lines.
- Keep startup URLs, package names and format versions readable when public
  settings contain their digits/text. Exempt only explicitly named public config
  metadata; genuine credentials, including short or matching values, stay masked.
- Preserve chunk-safe redaction, bounded logs and ADR-0014 execution boundaries.
- Never restart user-owned processes, make paid calls or modify user data.

Affected sources: web-dev-panel/src/logs.mjs, its unit tests and native
scripts/dev-all.test.mjs, scripts/dev-readiness/checks.mjs and its tests,
docs/operations/local-testing-setup.md. Related guide: docs/user-flows/web-dev-panel.md;
existing bounded/redacted-log promise remains unchanged, so no guide revision
is needed unless implementation changes that contract.

## Plan and verification

- Reproduce public-metadata over-redaction and retain credential regressions.
- Narrowly exclude known non-secret metadata from credential candidates.
- Run log/native-runner tests, scoped lint and existing synthetic panel browser
  journeys. No database or paid model test is needed for this local logging fix.
- Independently review credential invariants because this is shared redaction.
- Run configuration doctor and verify allowlist idempotence; runtime worker
  readiness requires restarting the user's current dev:all process.

## Evidence and outcome

The first-pass evidence below is historical; its env advice is superseded by the
follow-up evidence at the end of this record.

Initial Git state clean at `890575a`. No commit authorized by this correction.

- Added `document-terms:v2` exactly once to all six ignored local allowlists.
  Verified unrelated lines are byte-for-byte unchanged and repeating the update
  is a no-op. `.env.local` remains ignored and is not part of the source diff.
- Added an exact-key allowlist of established public auth/capability metadata to
  the shared redactor. Unknown sensitive-looking keys, actual credentials and
  credentials matching public metadata remain masked. Streaming is unchanged.
- Before the fix, focused tests reproduced two readability failures; the same
  sandbox run also hit an unrelated synthetic nested-process startup timeout.
  After the fix, the focused run passed both readability regressions but retained
  that process timeout. Final native tests with approved local-process access
  passed all 80 tests, including nested-process cleanup; no test was weakened.
- `pnpm --filter @languon/web-dev-panel test`: 80/80 passed.
- `pnpm test:e2e:web-dev-panel`: 4/4 passed in Chromium against the maintained
  synthetic local panel at 127.0.0.1:4411. Existing journeys verified rendered
  isolated logs, command controls and cross-tab state. These tests do not assert
  every public metadata value; the native runner regression verifies the exact
  startup URL/package/version text and split-secret masking. No appearance or
  layout change is claimed.
- `pnpm dev:doctor -- --phase configuration`: exit 0, no blocked checks;
  document-terms dictionary environment prerequisite explicitly passed. This
  checks configuration, not live provider execution or worker heartbeat.
- An assertion using the actual local environment confirmed the public startup
  package name, localhost URL and document-terms:v2 remain readable. No env
  values or candidate credentials were printed.
- Scoped ESLint, Prettier and `git diff --check` passed.
- Independent security reviewer `startup_redaction_security_review` approved
  the stabilized three-file source/test diff with no material findings. Reviewer
  verified unknown auth keys and split credentials remain masked; the initially
  outstanding process-test gap is resolved by the final 80/80 run.

Logs for this session: `/tmp/languon-startup-redaction-before.log`,
`/tmp/languon-startup-redaction-after.log`, `/tmp/languon-startup-panel-tests.log`,
`/tmp/languon-startup-panel-browser.log`, `/tmp/languon-startup-doctor.log`.

Existing user-flow behavior and traceability are unchanged; no guide revision,
database migration or AI execution regression gate applies. No model, route,
provider, key, tariff, dependency or production configuration changed. No paid
generation or user-process restart was performed.

## Handoff and remaining limits

Reopened after the user's restart exposed a missed prerequisite: adding
document-terms:v2 activated document ingestion despite unavailable storage and
runtime adapters. Remove only the six entries added by this correction. Preserve
the intentionally unavailable document pipeline, and correct doctor selection so
it does not require that optional pipeline when neither runtime nor any explicit
API/worker allowlist enables it. Explicitly configured document formats remain
checked. Validate the actual worker environment loader without starting a queue
consumer or calling providers. Earlier configuration success was insufficient
evidence of worker construction; the earlier env advice is superseded.

The user must stop and rerun their existing `pnpm dev:all` process to reload the
worker environment and logger implementation. Runtime readiness after that
restart is not claimed by this configuration-only check. Public-key exemptions
must remain public metadata; never put credentials in those fields. Rollback:
revert the three source/test files and remove only the newly appended v2 entry
from each local list (first-pass advice; superseded below).

## Follow-up verification and final outcome

- Removed only the six document-terms:v2 entries appended in the first pass;
  unrelated env lines unchanged and removal is idempotent. No storage credentials,
  runtime adapters, model settings or provider keys were added or changed.
- Doctor now omits document formats when no explicit API/worker list, runtime
  mode or storage mode configures the optional pipeline. Any of the five API
  lists, the worker list, storage or runtime configuration retains document
  readiness requirements. No worker execution/admission or security check changed.
- Regression failed before the selection fix and passed after it. Final
  `node --test scripts/dev-readiness/*.test.mjs`: 34/34 passed.
- Actual `loadDictionaryWorkerEnvironment` with the local env plus the prior v2
  worker addition reproduces the exact reported storage error. The corrected
  local env passes that same production loader, leaves document mode unavailable
  and retains text-translation:v4. This validation constructs configuration only:
  no worker process, queue consumer, provider request or user-data mutation.
- `pnpm dev:doctor -- --phase configuration`: exit 0, no blocked prerequisites.
  Logs: `/tmp/languon-optional-doc-before.log`,
  `/tmp/languon-optional-doc-tests.log`, `/tmp/languon-optional-doc-doctor.log`.
- Local setup operations documentation explains optional document prerequisites.
  No user-flow guide maps the affected doctor sources or changes an existing
  executable journey; no guide revision or E2E-marker update applies.
- Focused author review confirms registry data is not mutated, all dictionary
  non-document formats retain checks, and explicitly configured document formats
  are not silently exempted. No new independent security review is needed for
  diagnostic-only selection; earlier redaction security approval remains valid.
- Final scoped ESLint/Prettier and diff checks passed. Earlier 80 native panel
  tests and 4 browser journeys remain valid: their code was unchanged by this
  follow-up. No browser UI, worker execution, prompt, billing or schema change
  requires a broader AI execution gate.

Final limitation: full queue consumption and live provider execution were not
started, to avoid consuming user jobs or making paid calls. Restart dev:all to
load the corrected env. Roll back only diagnostic selection/docs/tests if needed;
do not re-enable document ingestion without its required dependencies. No commit
was made.

## Git handoff

The user subsequently requested committing the completed pending work. Earlier
no-commit statements describe implementation-time authority; this request
authorizes the local commit containing this record and its verified changes.
