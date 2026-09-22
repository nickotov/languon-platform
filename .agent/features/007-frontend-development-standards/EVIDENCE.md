# Verification evidence: Frontend Development Standards

Updated: 2026-08-14

## Automated tests

### Unit

- Command: `pnpm test:frontend-architecture`
- Result: Passed, 9/9 tests.
- Coverage added: Downward feature-to-entity alias import allowed; upward
  entity-to-feature alias import rejected; same-layer page-to-page import
  rejected; app-to-page composition and recognized Next framework imports
  allowed at both supported placements; cross-application imports (including
  from root framework files), unsupported FSD layers, and unclassified frontend
  source folders rejected.

### Integration and contract

- Command: `pnpm lint`
- Result: Passed against the complete repository.
- Behavior validated: Existing web/admin imports remain valid under the new FSD
  policy. `@/*` aliases resolve through both application tsconfigs.

### E2E

- Command: Not run.
- Result: Not applicable; no product or test-relevant guide behavior changed.
- Journeys validated: Existing authentication scenario mapping was checked and
  remained synchronized.

## Real application verification

- Environment: Not applicable.
- Scenario: No rendered or interactive code changed.
- Observed result: Browser/device verification was not required.
- Artifacts: None.

## User-flow guide verification

- Guides created or updated: None; `user-authentication.md` was inspected because
  its source paths include root package and web files.
- Commands and journeys checked: `pnpm user-flow:e2e -- inspect
user-authentication` reported Status: synchronized.
- `pnpm docs:user-flows:check` result: Passed, 16 tests and 1 guide validated.
- `pnpm user-flow:e2e -- check user-authentication` result: Passed.
- Scenario IDs and exact E2E test files: Existing
  `signup-verification-refresh-logout`, `password-reset-session-revocation`, and
  `passkey-lifecycle` mappings remain in
  `apps/web/tests/e2e/auth.journeys.spec.ts`.
- E2E environment/command/result and cleanup: Not run because guide content,
  revision, and product behavior did not change.

## Static checks

- Format: `pnpm format` and the `pnpm check` format gate passed.
- Lint: `pnpm lint` and the `pnpm check` lint gate passed.
- Typecheck: Passed through `pnpm check`.
- Build: Passed through `pnpm check`; 7/7 workspace build tasks succeeded.

## Skill verification

- Initialization: The required skill-creator initializer completed under
  `.agents/skills/frontend-development`.
- Validation: `uv run --with pyyaml python .../quick_validate.py
.agents/skills/frontend-development` passed.
- Forward test: A clean-context agent applied only the skill to a hypothetical
  API-backed account-preferences feature. It produced the expected FSD tree,
  TSX/CSS Module component folders, dedicated hooks/api/lib/model/types, shared
  Button/Tooltip stories, native dialog/popover choices, TanStack Query plus
  scoped Zustand ownership, a typed shared event bus for notifications, public
  slice imports, and proportional tests/browser checks. No files were edited.
- Metadata: `agents/openai.yaml` includes the explicit
  `$frontend-development` default prompt.

## Dependency verification

- Compatibility: `eslint-plugin-boundaries@7.2.0` supports ESLint >=6 and Node
    > =18.18; the project uses ESLint 10 and Node 24. The final policy uses its
    > canonical `boundaries/dependencies` API.
- Command: `pnpm install --frozen-lockfile --offline`
- Result: Passed with the updated pnpm lockfile and local dependency store.

## Database verification

- Migration command: Not applicable.
- Forward result: Not applicable.
- Rollback result: Not applicable.
- Data/invariant checks: No persistence changes.

## Review

- Reviewer result: Clean after remediation. The reviewer reran format, guide
  checks, 9/9 boundary probes, repository lint, and user-flow mapping, and also
  manually probed same-slice, sibling, upward, cross-app, aliases, workspace
  packages, unclassified sources, and both Next framework placements.
- Security reviewer result: Not applicable; no material security surface changed.
- Findings resolved: Migrated from the initial legacy boundaries policy to the
  current v7 dependency API; constrained imports to the same application;
  rejected unclassified source folders; covered both root and `src` Next
  framework files; narrowed internal segment naming to skill/review enforcement;
  and refreshed all durable evidence.

## Remaining risks

- Static lint rules cannot assess component responsibility, accessibility,
  internal segment naming, correct state ownership, or story quality; the skill,
  focused tests, review, and browser verification for actual UI changes remain
  required.
