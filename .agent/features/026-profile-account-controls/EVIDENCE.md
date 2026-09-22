# Verification evidence: Profile Account Controls

Updated: 2026-09-15

## Automated checks

- `pnpm --filter @languon/backend test`: final aggregate 499 passed, 122 DB-gated skipped in ordinary run; focused disposable database tests executed separately below.
- `pnpm --filter @languon/web test`: final aggregate 153/153; focused Profile 8/8 and auth API 12/12 after additions.
- `pnpm --filter @languon/admin test`: 10/10; contracts 53/53.
- Focused backend deletion HTTP 10/10, two-phase journal service 3/3, retained-version recovery 6/6 after additions.
- `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://languon_test:***@127.0.0.1:55433/languon_auth_profile_account_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_profile_account_test pnpm --filter @languon/backend exec vitest run --fileParallelism=false` with focused administration, handle, scheduling, purge, and recovery files: 29/29 after final remediations. Dedicated PostgreSQL 16 container bound only to loopback; migrations 0019/0020 applied by test harness. Verified DB uniqueness, owner/cancellation locks, immediate session/share revocation, share-rotation version/owner guard, injected SQL rollback plus indeterminate-intent fail-stop, purge fencing/live email/credential removal, fork-source anonymization, security metadata redaction, and idempotent recovery. Synthetic container/data stopped and removed afterward.
- `docker exec -i languon-profile-account-test-postgres psql ... -v account_purge_role=languon_purge_test < infra/deploy/sql/account-purge-worker-role.sql`: narrowed column-grant SQL applied successfully to a temporary role in the disposable database only.
- `pnpm test:release-deployment`: 97 passed, 5 environment-gated skipped; first-start gate before candidate start, routine deployment gate skipped, dedicated purge role/config, rollback behavior checked.
- `pnpm test:frontend-architecture`: 9/9; backend/web/admin lint passed; backend/web/contracts typecheck passed (web rerun after its concurrent build changed generated Next types); backend/web/admin/contracts builds passed. Admin build emitted only a chunk-size advisory.
- `pnpm format:check` remains red from 283 existing repository-wide formatting warnings (including unrelated feature files). Newly remediated code files pass targeted pinned Prettier check; no baseline-wide rewrite was performed.

## User journeys and rendering

- Web Playwright in dedicated backend/web loopback ports 4100/3100 with disposable PostgreSQL/Redis: auth 3/3 and Profile 2/2 before final remediation; Profile rerun after remediation 2/2. Scenario `profile-handle-security-and-removal` creates a synthetic user, saves a handle, verifies real Security controls and client-only email mock, then schedules removal and observes signed-out access.
- Admin Playwright against a separate disposable admin database and backend/admin/web ports 4101/3101/3201: 6/6 including `admin-owner-cancels-scheduled-deletion` with distinct audited cancellation. Infrastructure isolated and removed; user servers on 4000/3333 untouched.
- Pinned `agent-browser` wrapper: 9/9 exploratory checks plus doctor. Signed-out return-aware link, fake signup/verification, unique handle, 320×800 Profile and typed-confirmation removal dialog, Escape dismissal, 1280×900 deep-linked Security controls, no-email-change network call, and dark theme inspected. Console had only expected HMR/devtools messages; no page errors or unexpected failed requests (signed-out refresh 401 expected). Isolated session closed. Screenshots outside repo: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789457266293.png`, `screenshot-1789457375073.png`, `screenshot-1789457505008.png`.

## Documentation and review

- Current guides: `profile-account-controls`, `magic-profile-page`, `user-authentication`, `admin-user-management`. `pnpm docs:user-flows:check` validated 10 guides/markers; `pnpm user-flow:e2e -- check profile-account-controls` passed; affected mapped browser/admin scenarios executed as above.
- ADR-0019 supersedes ADR-0018 to record two-phase journal, quiesced replay, retained-version listing, cancellation evidence, fresh-clock scheduling, and share-version guard. Canonical deployment/disaster-recovery/restore-drill runbooks updated.
- Independent implementation review identified hidden retained S3 versions, live replay/lock-order, share-rotation, stale recent-auth time, and cross-tab sign-out defects. All five fixed; remediation re-review found no remaining high-severity code issue.
- Independent security review identified phantom pre-commit intents, disabled-after-cancellation false purge, live cancellation replay race, and broad purge-role reads. Two-phase commit marker/fail-stop, request-state recognition, quiesced gate, and column-only role grants addressed them; re-review found no remaining high-severity code issue.
- Independent test audit's database execution, HTTP failure mapping, share/failure injection, frontend conflict/API boundary, purge-row/redaction, and evidence gaps were remediated or documented.

## Residual operational risk

Production Object Lock/versioning, retained-version IAM, distinct reader/writer credentials, and an actual encrypted restore drill are operator-provisioned; fake S3 tests cannot prove those external controls. A restore with persisted active-slot state requires the documented manual quiesced gate before smoke/traffic; routine blue/green deliberately skips mutating replay. An indeterminate pre-commit intent fails stop for operator reconciliation. No production credentials, shared infrastructure, or real personal data were used.
