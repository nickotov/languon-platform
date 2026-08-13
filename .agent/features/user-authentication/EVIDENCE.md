# Verification evidence: User Authentication

Updated: 2026-08-13
Status: Complete

## Planning and baseline checks

- `pnpm --filter @languon/backend exec vitest run tests/health.test.ts`
  - Result: passed, one file and two tests. Run during the independent test audit.
- `pnpm test`
  - Result: passed, 10/10 Turborepo tasks. Re-run from the feature branch after
    the planning audits were incorporated.
  - Limitation: this is only a pre-auth baseline; most workspaces currently pass
    with no tests and it provides no evidence for future authentication behavior.
- `pnpm exec prettier --write .agent/features/user-authentication/FEATURE.md .agent/features/user-authentication/EXEC_PLAN.md docs/adr/README.md docs/adr/0001-user-authentication-and-session-strategy.md docs/adr/0002-drizzle-schema-and-migration-strategy.md`
  - Result: completed; planning files formatted.
- `pnpm exec prettier --check <seven planning and ADR Markdown files>`
  - Result: passed; every targeted file matches repository Prettier style.
- `git diff --check`
  - Result: passed; no whitespace errors.
- Branch/path checks
  - Result: `feature/user-authentication` is active and all feature/ADR links
    resolve to repository files.

## Planning audits

- Product: no unresolved product blocker. State transitions and edge cases for
  pending re-registration, capability-unavailable email, direct code reset,
  pending login, passkeys, and web behavior were incorporated.
- Architecture/ADR: the two-ADR split is sufficient. Same-site cookie topology,
  cross-tab refresh coordination, authoritative SQL transition history,
  singleton/advisory-lock migrations, and explicit disposable migration
  capability were incorporated.
- Security: requirements-level threat review completed. Fail-closed environment,
  token/cookie/replay, code/password, WebAuthn, Redis, logging/privacy, and future
  OAuth safeguards are represented in the specification and test strategy.
- Testing: unit, PostgreSQL, Redis, Hono contract, component, E2E, browser,
  migration, concurrency, and security regression surfaces are mapped in the
  ExecPlan.

These are planning audits, not the independent implementation review required
for feature completion.

## M2 database foundation and user identity

- Disposable target: Compose project `languon-auth-m2-test`, PostgreSQL exposed
  only for this verification on loopback port `55432`, database
  `languon_auth_m2_test`. The test harness additionally required the exact
  database-name confirmation and explicit destructive-test opt-in.
- `pnpm db:check`
  - Result: passed; committed Drizzle SQL and metadata are internally valid.
- Source and built migration commands
  - Result: `pnpm db:migrate` passed twice against the disposable target; the
    second run was idempotent. The backend build completed and its copied
    `dist/drizzle` history was successfully applied by the built migration entry.
- `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_CONFIRM=... AUTH_TEST_DATABASE_URL=... pnpm --filter @languon/backend exec vitest run tests/integration/database/migrations.test.ts tests/integration/modules/users/infrastructure/drizzle-user-repository.test.ts`
  - Result: passed, two files and ten tests.
  - Proves clean and idempotent migration, advisory-lock concurrency, checked-in
    migration tamper rejection, schema constraints/indexes/no seed data,
    transaction rollback, case-variant email race handling, FK/primary-email
    invariants, and absence of a root-database write repository.
- `pnpm --filter @languon/database test`
  - Result: passed, one file and three tests. Proves disposable migration
    capability rejection and exact ordered migration-ledger prefix validation,
    including missing-middle and duplicate-history cases.
- `pnpm --filter @languon/backend exec vitest run tests/unit/modules/users/domain`
  - Result: passed as part of a six-file, 36-test domain run. Proves deterministic
    ASCII email canonicalization, invalid Unicode rejection, and user activation
    invariants.
- `pnpm --filter @languon/database typecheck`, build, lint; backend typecheck,
  build, and lint
  - Result: passed for the M2 implementation. Existing health tests also passed.
- Rollback position
  - The initial schema has no declared safe destructive inverse. No down migration
    was invented; forward corrections and explicitly disposable database reset
    are the documented approach.

## Authentication implementation checks

- `pnpm --filter @languon/contracts test`
  - Result: passed, two files and 20 request/response/passkey contract tests.
- `pnpm --filter @languon/backend test`
  - Result: passed, 24 files and 153 deterministic tests; 34 explicitly gated
    disposable-infrastructure checks skipped in the ordinary repository suite.
- Disposable PostgreSQL/Redis backend suite:
  - Command used the explicit `ALLOW_DISPOSABLE_*` gates, exact database/Redis
    confirmations, PostgreSQL port `55432`, and Redis port `56379` database 15.
  - Result: passed, 28 files and 187 tests with no skips.
  - Proves clean/idempotent/concurrent/tamper-detecting migrations; user/auth
    repositories and constraints; signup/challenge/reset/session/passkey races;
    rolling Redis limits and opaque aliases; challenge single-use and outage;
    composed signup/verification/login/refresh/logout/reset HTTP behavior.
- `pnpm db:check`
  - Result: passed (`drizzle-kit check`: checked-in history valid).
- `DATABASE_URL=<disposable> pnpm --filter @languon/backend db:studio`
  - Result: Studio started successfully and was stopped immediately after the
    workflow check. The config supplies a safe local default and honors the
    explicitly supplied URL without logging credentials.
- `docker compose config --quiet`
  - Result: passed; the explicit one-shot migration service and application
    dependency graph are valid.
- `docker compose -p languon-auth-m2-test down -v`
  - Result: passed after final verification; the isolated PostgreSQL/Redis
    containers, network, and disposable test volumes were removed.

## Web and browser evidence

- `pnpm --filter @languon/web test`
  - Result: passed, five files and 35 tests. Covers API schema parsing, empty JSON
    request bodies, form behavior, accessible autocomplete/loading, memory-only
    session state, safe return paths, refresh single-flight/cross-tab outcomes,
    logout semantics, and security/passkey management UI.
- Playwright E2E with disposable PostgreSQL and isolated Redis DB 14, web port
  `3100`, backend port `4100`:
  - Result: passed, three Chromium journeys in 10.6 seconds.
  - Signup -> `0000` verification -> security -> reload refresh -> logout.
  - Password reset -> second session revoked -> old password rejected -> new
    password login.
  - Virtual authenticator registration -> deliberately bogus-signature failure ->
    discoverable passkey login -> rename -> revoke.
  - The suite also asserts framing denial and no access-token persistence.
- Manual production-build browser verification:
  - Wide and `375x812` layouts were checked; the security view had no horizontal
    overflow and retained keyboard-labelled controls.
  - Signup, verification, reload bootstrap, logout, password reset/old-password
    rejection/new login, passkey enrollment/login/rename/revoke were exercised.
  - `localStorage`, `sessionStorage`, page-visible cookies, and URLs contained no
    access or refresh tokens. Expected anonymous 401 and deliberate failure
    responses were the only auth failures.

## Repository validation

- `pnpm format:check`
  - Result: passed. Generated browser debug artifacts were removed; tracked
    `.serena` project configuration and generated Drizzle metadata are ignored.
- `pnpm lint`
  - Result: passed.
- `pnpm typecheck`
  - Result: passed, 10/10 Turborepo tasks.
- `pnpm test`
  - Result: passed, 10/10 Turborepo tasks. Feature totals include backend 153,
    contracts 20, database 3, and web 35; infrastructure gates remain intentionally
    off in this ordinary command and were proven separately above.
- `pnpm build`
  - Result: passed, 7/7 Turborepo tasks including backend declarations/migration
    copy, web/admin production builds, and mobile export.
- `git diff --check`
  - Result: passed before final artifact formatting; rerun at handoff.

## Independent review and remediation

- Initial independent correctness review reported one high and eight relevant
  medium findings; security review reported one high and five medium findings,
  with overlap for enumeration and unbounded bodies.
- All material findings were remediated: opaque rolling issuance limits,
  full-family logout locking, concurrent password rehash retry, bounded bodies,
  proxy peer/CIDR validation, terminal-only cookie clearing, stable persistence
  conflicts, OpenAPI bearer metadata, passkey completion limits, useful redacted
  events, three automated E2E journeys, working Studio config, frame denial, a
  WebAuthn-compatible 384 KiB request limit, and a transactionally enforced
  50-active-passkey cap.
- Focused post-remediation correctness and security re-reviews found no remaining
  critical, high, or medium issue. The final passkey-cap suite includes both the
  sequential boundary and 51-way concurrent registration against real PostgreSQL;
  focused HTTP tests prove a contract-valid 200k attestation is accepted for
  parsing while requests above the finite bound return 413.

## Remaining risks

- Production email signup/recovery intentionally remains unavailable until a
  real sender adapter is implemented and configured.
- Native/admin clients, OAuth linking, roles/permissions, and immediate global
  access-token denylisting are explicitly deferred.
- The chosen refresh-cookie transport assumes same-site production web/API
  deployment; a cross-site topology requires a new security decision.
- Strict refresh replay handling depends on both atomic server rotation and
  verified in-tab/cross-tab client coordination.
