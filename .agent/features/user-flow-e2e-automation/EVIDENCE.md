# Verification evidence: User Flow E2E Automation

Updated: 2026-08-13
Status: Complete

## Source and architecture audit

- Read root/web instructions, feature-development/testing/browser/database and
  skill-creator workflows, `.agent/PLANS.md`, templates, ADR index, current guide
  convention/validator, authentication guide, Playwright config, and all three
  authentication E2E journeys.
- Accepted
  [ADR-0004](../../../docs/adr/0004-user-flow-e2e-traceability-hardening.md)
  supersedes ADR-0003 and records agent-authored E2E, scenario/revision
  traceability, command registration, repository-wide marker discovery, and
  guide execution trust boundaries. It does not change ADR-0001
  authentication/session or ADR-0002 migration behavior.
- No application runtime, public contract, database schema, authentication
  behavior, or dependency changed.

## Automated tests

### Unit and traceability contract

- `node --test scripts/check-user-flow-guides.test.mjs`
  - Result: passed, 15/15.
  - Covers complete guide parsing; filename/surface/section/index/path failures;
    registered command IDs and control characters; exact bounded regular paths
    and symlink rejection; substantive scenario coverage; scenario IDs and
    duplicates; a table of revision-changing content versus date/unrelated
    stability; missing/stale/malformed/duplicate/orphaned markers;
    repository-wide marker discovery; terminal-safe diagnostics; missing test
    files; and CLI inspect/check parity/non-execution behavior.
- `pnpm docs:user-flows:check`
  - Result: passed; one current guide plus its E2E mappings validated.
- `pnpm user-flow:e2e -- inspect user-authentication`
  - Result: `Status: synchronized`.
  - Revision: `sha256:49fadbe3ce6c2534`.
  - Test file: `apps/web/tests/e2e/auth.journeys.spec.ts`.
- `pnpm user-flow:e2e -- check user-authentication`
  - Result: passed.

### Repository skill

- Initialized `.agents/skills/user-flow-e2e` with the skill-creator scaffold and
  generated UI metadata.
- The bundled `quick_validate.py` initially could not import its undeclared
  `yaml` dependency from the default Python. Reused an already-installed local
  PyYAML path without modifying the environment:
  `PYTHONPATH=/Users/nickkotov/.local/share/uv/tools/headroom-ai/lib/python3.13/site-packages python3 .../quick_validate.py .agents/skills/user-flow-e2e`.
  Result: `Skill is valid!`
- Independent read-only forward test reconstructed the workflow only from the
  skill/repository, ran inspect/check/docs validation, semantically compared all
  three guide scenarios to their assertions, and concluded no changes were
  needed. No files or services were touched by that agent.

## Mapped authentication E2E

- Environment: Playwright Desktop Chrome; host backend/web on dedicated
  `localhost:4100`/`localhost:3100`; PostgreSQL 17 database
  `languon_auth_e2e` on loopback `55432`; Redis 8 DB 15 on loopback `56379`.
- Infrastructure: exact fixed-name `--rm` containers with readiness waits,
  per-container ownership flags, and EXIT/HUP/INT/TERM cleanup trap. Synthetic
  `@example.test` identities and development-only secrets/code were used.
- Command: complete disposable block documented in
  `docs/user-flows/user-authentication.md`, ending with
  `pnpm --filter @languon/web test:e2e`.
- Result: passed, 3/3 in 15.7s.
  - `signup-verification-refresh-logout`: signup, code `0000`, refresh reload,
    token-storage/header checks, logout, signed-out reload.
  - `password-reset-session-revocation`: two sessions, recovery/reset, old
    session/password rejection, replacement login, logout.
  - `passkey-lifecycle`: virtual-authenticator enrollment, bad-signature
    rejection, discoverable login, rename, removal.
- Browser evidence: tests assert unexpected console/page/HTTP errors; none were
  reported. No new UI behavior required additional responsive visual coverage.
- Cleanup: `docker ps --all` confirmed neither exact disposable container
  remained. No shared volumes or existing app processes were changed.

## User-flow guide verification

- Updated `docs/user-flows/README.md` with E2E metadata, coverage section,
  marker/revision grammar, lifecycle, skill, and command workflow.
- Updated `docs/user-flows/user-authentication.md` with three stable scenarios,
  one exact test file, the canonical command, and a proportional coverage table.
- Updated auth Playwright with one current revision marker and exactly one marker
  for each scenario; assertions were preserved and rerun.
- Updated root agent instructions, feature-development/testing skills,
  `.agent/PLANS.md`, feature templates, development/agentic/setup docs, README,
  auth feature maintenance, and package commands.

## Static and repository checks

- Prettier on affected files: passed.
- `pnpm lint`: passed after replacing one character-class glob check that
  triggered `no-useless-escape`.
- `git diff --check`: passed during implementation.
- Final `pnpm check`: passed on the remediated tree.
  - Formatting: passed.
  - User-flow validator/CLI contract: 15/15 and repository mapping passed.
  - Lint: passed.
  - Typecheck: passed, 10/10 Turbo tasks.
  - Tests: passed, 10/10 Turbo tasks; backend real-infrastructure suites remain
    intentionally environment-gated in this generic command.
  - Build: passed, 7/7 Turbo tasks.
- Final `git diff --check`: passed.
- Final user-flow skill scaffold validation: `Skill is valid!`.

## Review

- Independent skill forward test: passed; no semantic mapping changes required.
- Independent tester: approved after remediation; no remaining
  Critical/High/Medium findings.
- Independent code review: approved after remediation; no remaining
  Critical/High/Medium findings.
- Independent architecture review: approved; ADR-0004 and repository boundaries
  match the remediated behavior.
- Focused security review: approved; no remaining Critical/High/Medium findings.
- Material review findings and resolutions are recorded in `REVIEW.md`.

## Remaining risks

- Revision/markers prove traceability and force file acknowledgement, not
  semantic assertion quality. Real execution and independent review remain
  required and are enforced by instructions/Definition of Done.
- Repository-wide scanning intentionally ignores dependency, cache, generated,
  build, coverage, and test-output directories. Markers in those non-source
  artifacts are not part of the traceability contract.
- The declared-test read has a low-risk local concurrent-mutation window between
  filesystem inspection and reading. It is a validation tool that neither
  executes content nor emits file bodies; trusted repository/CI workspaces and
  bounded reads keep this residual non-material.
