# Improvement: Quiet and diagnosable local startup

Status: Complete
Created: 2026-10-28
Updated: 2026-10-28

## Routing decision

Focused developer-tooling improvement to the existing local startup journey.
No product capability, public API, persistence, security policy, runtime dependency
or production deployment changes. No automatic commit. Escalate before expanding
into those boundaries.

## Scope and diagnosis

The user reports startup failure without its error output; requested the last
20–40 lines asynchronously. Local `pnpm dev:all` reproduction reached all three
application servers and a live dictionary worker; it did not exit. The doctor
reported document-terms missing from worker formats, an existing nonfatal
prerequisite warning. Stopped only this reproduction via Ctrl+C.

Confirmed log problem: unconditionally forwards all child stdout/stderr,
including Turbo cache/build logs, every PASS check and fallback notices.
Keep normal output to progress/readiness, actionable warnings and errors;
`--verbose` retains full redacted output. Bound retained failure context and
print it when a child fails, including errors lacking a recognizable keyword.
Preserve local guards, migrations, fail-fast behavior, redaction and cleanup.

## Acceptance

- AC-1: Diagnose the reported startup error and fix its evidenced cause, or
  explicitly retain the missing-error reproduction limitation.
- AC-2: Default output is concise; `pnpm dev:all --verbose` enables full logs.
  Failure details and runtime errors remain visible in quiet mode.
- AC-3: Redaction, bounded memory, stage ordering and owned cleanup remain tested.

## Plan and verification

- [x] Add output/argument regression coverage and implement quiet mode.
- [x] Diagnose supplied output: SIGINT shutdown, not a startup failure.
- [x] Run runner/output Node tests, affected lint/format and CLI smoke checks.
- [x] Update README/existing guide and validate traceability.
- [x] Review lifecycle/output changes and record remaining limitations.

No application UI, schema or AI execution changes planned; browser/database/full
AI gate is unnecessary for output-only runner changes. Existing mapped panel
journey remains synthetic; use focused runner process tests for new output cases.
Rollback: remove output helper/verbose parsing and restore unconditional forwarding.

## Verification and outcome

Base f586f76 plus the current scoped patch. Quiet startup implementation is
complete. The subsequently supplied log shows SIGINT after over 18 hours of runtime,
not a startup failure. Exit 130 is conventional interruption status. Both real
startup reproductions succeeded. Worker lease-release and deferred accounting
maintenance messages are real diagnostics, retained rather than reclassified
as harmless; their internal causes are outside this output-only improvement.

- `pnpm test:web-dev-panel`: 78/78 passed in the final run, including 23 startup/output tests.
  New output cases cover quiet/verbose modes, opaque failures, bounded tails,
  readiness failures, TypeError/opaque stderr diagnostics, secret redaction across
  chunks, bounded pipe draining and opaque no-newline output after launcher exit.
- `pnpm test:e2e:web-dev-panel`: 4/4 mapped real browser journeys passed against
  synthetic command fixtures. No normal database or providers used by tests.
- Real local quiet smoke: web200, admin200, backend `/livez`200 and `/readyz`200.
  Existing document-terms prerequisite warning remains nonfatal. Ctrl+C stopped
  only this invocation's applications; infrastructure/data retained. Existing
  migrations ran through the standard startup command; no manual DB writes.
- ESLint and Prettier cover the affected runner/helper/tests and documentation.
  Documentation validator: 16 tests/30 guides passed. Existing web-dev-panel
  guide mapping stays synchronized at sha256:9a072f7ad1102d8d; scenario behavior
  is unchanged. README and the guide describe quiet/default and verbose use.
- `pnpm web-dev-panel:check` fails on pre-existing reviewed-catalog drift from
  earlier package-script changes and missing command reviews. This patch changes
  no package scripts/catalog authority; unrelated entries were not enabled or
  reconciled. Synthetic panel/browser tests still pass.
- Sandbox-only process tests cannot inspect `ps`; the same tests pass with
  required escalation. Do not mistake that restriction for a lifecycle bug.
- No production build/typecheck is required for native MJS-only tooling changes;
  no auth/accounting/AI execution/configuration semantics changed.

## Review and remaining limitations

Independent initial and focused remediation review: no material findings remain.
CR-1 fixed: bounded final output drain prevents inherited descendant pipes from
blocking launcher-exit supervision or omitting opaque no-newline diagnostics.
CR-2 fixed: helper added to existing guide source mapping. Final runner tests
23/23 passed with process-inspection permission, and affected ESLint passed.
No additional mapped browser run was needed after stream finalization: browser
commands/components/tests are unchanged; direct subprocess regressions exercise
the changed lifecycle seam. The existing cleanup model cannot discover already
reparented descendants of a dead launcher; this predates the patch. The new test
explicitly cleans its identified orphan and makes no stronger ownership claim.

No startup failure reproduced or evidenced by the supplied log. The lease-release
warning is not claimed fixed; retries/expiry retain the existing worker behavior.
No worker/API/AI configuration, ledger or migration implementation was changed. No commit
requested or performed. Detailed smoke/test logs are local under
`/tmp/languon-dev-all-quiet-smoke.log`, `/tmp/languon-quiet-dev-suite.log` and
`/tmp/languon-quiet-panel-e2e.log`.
