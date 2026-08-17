# Verification evidence: Web UI Kit

Updated: 2026-08-17

Record exact commands, concise results, relevant scenarios, and remaining risks.
Do not paste full logs when a focused excerpt or artifact reference is enough.

## Automated tests

### Unit

- Command: `pnpm --filter @languon/web test`
- Result: Passed, 9 files and 55 tests.
- Coverage added: theme resolution/provider/switcher; Field descriptions and
  success/error semantics; tabs, checkbox, Button, combobox, tooltip, menu,
  popover, dialog, and toast queue/timer/pause behavior.

### Integration and contract

- Command: `pnpm test`
- Result: Passed across all 10 Turborepo test tasks (including 213 backend tests
  passed and 35 intentionally skipped in the recorded full run).
- Behavior validated: existing auth, contracts, application, and shared package
  behavior remained stable. No new API or persistence contract was introduced.

### E2E

- Command: the reviewed disposable block in `apps/web/tests/e2e/README.md`, ending
  with `pnpm --filter @languon/web test:e2e`.
- Result: Passed, 6/6 Chromium journeys; task-owned PostgreSQL and Redis
  containers were stopped by the cleanup trap.
- Journeys validated: signup/session/logout, password reset, passkeys, four-locale
  SSR, locale persistence, and `theme-preference-persistence`.

## Real application verification

- Environment: local Next.js app through the repository browser wrapper;
  Chromium at 320×800 plus desktop Chromium through Playwright.
- Scenario: opened the localized login route, selected Dark, reloaded, inspected
  compact layout and accessibility tree, then returned to System.
- Observed result: theme and route persisted, the page reflowed without clipping,
  no browser errors or failed network requests occurred, and console output was
  limited to expected development/HMR messages.
- Artifacts: managed-browser screenshot
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1786993184246.png`.

## User-flow guide verification

- Guides created or updated: `docs/user-flows/web-ui-kit.md` and guide index.
- Commands and journeys checked: `pnpm user-flow:e2e -- inspect web-ui-kit`,
  guide validation, mapping validation, and the mapped Playwright suite.
- `pnpm docs:user-flows:check` result: Passed, 4 guides and mappings validated.
- `pnpm user-flow:e2e -- check web-ui-kit` result: Passed.
- Scenario IDs and exact E2E test files: `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts`.
- E2E environment/command/result and cleanup: disposable loopback PostgreSQL
  `55432`, Redis `56379`, web `3100`, and backend `4100`; 6/6 passed and the
  task-owned containers were stopped.

## Static checks

- Format: feature-owned files pass Prettier and `git diff --check`. The aggregate
  formatter reports only the unchanged, out-of-scope
  `.agent/corrections/mastra-studio-chat-403.md`.
- Lint: `pnpm lint` and `pnpm --filter @languon/web lint` passed.
- Typecheck: `pnpm typecheck` and `pnpm --filter @languon/web typecheck` passed.
- Build: `pnpm build`, `pnpm --filter @languon/web build`, and
  `pnpm --filter @languon/web storybook:build` passed. Storybook catalog includes
  the complete shared primitive inventory and self-hosted font assets.

## Database verification

- Migration command: Not applicable; no schema change.
- Forward result: Not applicable.
- Rollback result: Not applicable.
- Data/invariant checks: Existing migrations and auth journeys passed against
  disposable E2E infrastructure.

## Review

- Reviewer result: Approved after final remediation; no critical, high, or
  material medium findings remain.
- Security reviewer result: Not applicable. The feature changes no auth policy,
  authorization, secret, personal-data, or trust boundary; the allowlisted theme
  cookie contains only a non-sensitive appearance preference.
- Findings resolved: catalog/state coverage, control sizing, ARIA combobox,
  dialog/sheet close behavior, tooltip ownership, menu/popover focus, toast
  queue/lifecycle/live-region behavior, reduced motion, semantic tokens, and
  disabled/success/error states.

## Remaining risks

- No known material risks. Normal browser and assistive-technology variance is
  mitigated by native semantics, focused interaction tests, Storybook a11y
  tooling, and real Chromium verification.
