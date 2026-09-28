# Verification evidence: Dictionary Translation Context

Updated: 2026-09-29

## Acceptance coverage

| Acceptance IDs | Implementation and proof                                                                                     | Result                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| AC-1, AC-2     | Owner contracts/repositories plus settings and shared card-form behavior; E-1, E-3, E-5, E-6                 | Pass                                                                |
| AC-3, AC-4     | Effective-context resolver, v3 inline snapshots/staleness, provider paths, draft versions; E-1–E-3, E-5, E-6 | Pass                                                                |
| AC-5           | v2 single/pasted/import/document job snapshots and transient-guidance separation; E-1–E-4, E-6               | Pass; document browser scenario guarded off, database path covered  |
| AC-6, AC-8     | Forward migrations, revision v1/v2 compatibility, retained job formats and constraints; E-1–E-4              | Pass                                                                |
| AC-7           | Owner-only schemas, public/fork/export omission, prompt boundaries and redaction tests; E-1–E-4, E-6         | Pass; independent security review found no remaining material issue |
| AC-9           | Four locales, unit/build, mapped E2E, disposable DB, browser desktop/mobile and guide checks; E-1–E-7        | Pass; tester gaps remediated and independently confirmed closed     |

## Check records

### E-1 — Contracts and prompts

- Commands: `pnpm --filter @languon/contracts test`; `typecheck`; `lint`;
  `build`; and the equivalent four commands for `@languon/prompts`.
- Result: contracts 6 files/60 tests; prompts 1 file/5 tests; all static and
  build checks passed on 2026-09-29.
- Proves: code-point validation, strict owner/public shapes, generation-format
  unions, model guidance composition, and deterministic fallbacks.

### E-2 — Backend domain/application/infrastructure

- Command: `pnpm --filter @languon/backend test && ... typecheck && ... lint && ... build`.
- Result: 87 files passed, 21 skipped; 614 tests passed, 173 skipped; typecheck,
  lint, ESM/DTS build passed on 2026-09-29.
- Proves: precedence, snapshot/staleness, worker/provider propagation, legacy
  compatibility, redaction, and schema contracts. Skipped tests are guarded
  external/database suites covered separately where applicable.

### E-3 — Disposable PostgreSQL and migrations

- Target: disposable loopback PostgreSQL 17 container/database with the
  repository's destructive-test confirmation guard; removed after execution.
- Commands: targeted Vitest runs with `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
  `AUTH_TEST_DATABASE_URL` and matching `AUTH_TEST_DATABASE_CONFIRM` for
  `drizzle-dictionary-repository.test.ts`,
  `dictionary-card-authoring-generation-store.test.ts`,
  `dictionary-batch-generation-store.test.ts`, and
  `dictionary-document-store.test.ts`, and
  `dictionary-worker-version-overlap.test.ts`; a separate targeted run of
  `tests/integration/database/migrations.test.ts`; `pnpm db:check`.
- Result: affected repository/generation suites 78/78; dedicated migration suite
  5/5; Drizzle consistency passed.
- Proves: clean forward migration, current/revision persistence, public/fork
  privacy, positive v3 inherited/override proposal binding and terminal
  redaction, positive pasted/import/document context snapshots separated from
  transient guidance, acceptance without card overrides, constraints, and
  retained v1/v2 job formats. No down migration exists; rollback is
  application/job-format compatibility plus ordinary deployment rollback before
  destructive schema removal. A populated pre-0035 upgrade fixture was not run;
  migrations add nullable columns and relax compatible format constraints.

### E-4 — Web unit/static/build

- Commands: `pnpm --filter @languon/web test`; `typecheck`; `lint`; `build`.
- Result: 32 files/246 tests passed and all static/build checks passed on
  2026-09-29 after final code-point validation changes.
- Proves: settings save/clear, Unicode limit behavior, inherited preview,
  override enable/clear, draft-version and stale-suggestion behavior, and
  current/legacy review readers.

### E-5 — Mapped dictionary-platform Playwright

- Environment: Chromium; fresh disposable loopback PostgreSQL and Redis;
  deterministic provider; API/web/worker started by checked-in Playwright
  configuration; containers automatically removed.
- Command: `pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts`.
- Result: 7 passed, 1 skipped in 52.6s on 2026-09-29. The skipped document
  scenario requires the separately guarded MinIO stack. Owner context
  persistence/inheritance/override, public/fork privacy, inherited-context v3
  inline generation,
  pasted terms, import/export, and stale conflict journeys passed.

### E-6 — Real-browser interaction and responsive evidence

- Tool/environment: project-pinned safe `agent-browser` wrapper, task-scoped
  session, local deterministic web/backend and synthetic account/data.
- Observed: desktop settings exposed optional Dictionary context; save/reopen
  persisted it; Add card showed Update context, inherited read-only guidance,
  required blank override, and validation. At 320×800 the controls remained
  reachable without horizontal overflow. Error log was empty; console contained
  only development/HMR messages; network stayed on localhost (initial refresh
  401 expected). Session and disposable services were closed.
- Limitation: the final code-point-limit repair did not alter the normal-value
  path observed here; its boundary behavior is proved in E-1 and E-4.

### E-7 — Guide and migration traceability

- Commands: `pnpm docs:user-flows:check`; `pnpm user-flow:e2e -- check dictionary-platform`; `pnpm db:check`; `git diff --check`.
- Result: 14 guides/mappings validated, dictionary-platform revision
  `sha256:562bca056097fcee` synchronized, migration metadata valid, patch check
  clean.

## User-flow evidence

- Updated `docs/user-flows/dictionary-platform.md` and its mapped test file.
- The complete mapped file was reviewed and executed as E-5; `last_verified`
  records 2026-09-29. The document scenario remains an explicit guarded skip,
  not a claimed pass; its changed database lifecycle is covered by E-3.

## Review link

Findings, resolutions, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining gaps and risks

- Guarded MinIO document browser execution was not enabled; no document UI was
  changed, while its v2 context snapshot, processor/provider propagation, and
  store path passed focused unit and disposable DB tests.
- `pnpm check` cannot complete its global format gate because unrelated existing
  repository files fail Prettier. Every changed/new feature file passes
  `prettier --ignore-unknown --check`; affected lint, typecheck, test, build,
  guide, migration, database, E2E, and browser checks are recorded above.
