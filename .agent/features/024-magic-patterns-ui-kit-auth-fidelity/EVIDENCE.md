# Verification evidence: Faithful Magic Patterns UI kit and auth implementation

Updated: 2026-09-14

Record exact commands, concise results, relevant scenarios, and remaining risks.
Do not paste full logs when a focused excerpt or artifact reference is enough.

## Automated tests

### Unit

- Command: `pnpm --filter @languon/web test`
- Result: Pass — 22 files, 142 tests.
- Coverage added: auth-form, UI-kit, i18n, dictionary-rendering/XSS, theme, and API regression coverage exercised the changed shared primitives; a deferred sign-in test asserts the loading action remains disabled and exposes `aria-busy`.

### Integration and contract

- Command: included in the web Vitest suite.
- Result: Pass.
- Behavior validated: real auth API mapping, return-path preservation, form submission/error handling, and capability-driven controls remain compatible.

### E2E

- Command: disposable loopback PostgreSQL/Redis harness with `pnpm --filter @languon/web exec playwright test tests/e2e/auth.journeys.spec.ts`
- Result: Pass — 3/3 in Chromium (47.2s); containers stopped/removed by the guarded trap.
- Journeys validated: signup/verification/refresh/logout; password reset and session revocation; passkey enrollment, bad assertion rejection, login, rename, and removal.
- Additional observation: an initial unfiltered `test:e2e` attempt ran unrelated dictionary journeys; four later dictionary tests encountered the suite's rolling signup limit after the three auth scenarios and one dictionary scenario had passed. The required auth-only rerun used fresh services and passed.
- Command: disposable PostgreSQL/Redis services with `pnpm --filter @languon/web exec playwright test tests/e2e/ui-kit.journeys.spec.ts`.
- Result: Pass — 1/1 in Chromium. It validates theme persistence, 320px and 200% zoom reflow, 44px touch targets, reduced motion, increased contrast, forced colors, and browser error absence. The first run exposed a 40px auth input; auth uses the supplied large control size and the rerun passed. Disposable services were removed.

## Real application verification

- Environment: production webpack build served locally; project-pinned `agent-browser` 0.33.0 / Chrome for Testing 152; backend capability state and offline/error state inspected.
- Scenario: login at 320x700 and 375x812 mobile and 1440x1000 desktop; light and dark themes; signup and forgot-password routes; focus/error state; passkey-capable login from the live development service.
- Observed result: mobile uses the specified full-bleed form with 16px gutter; desktop uses the 50/50 narrative shell, 520px form measure, token card, benefit icons/copy, and proof line; Inter and exact light/dark tokens load locally; headings, labels, focus, error marker, and controls remain accessible; no console/runtime errors.
- Final post-review artifacts: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789393550187.png` (375x812), `screenshot-1789393565052.png` (1440x1000), and `screenshot-1789393610359.png` (dark). Earlier state/error screenshots: `screenshot-1789389882268.png`, `screenshot-1789389918957.png`, `screenshot-1789390101813.png`, `screenshot-1789390122272.png`, `screenshot-1789390550029.png`, and `screenshot-1789390572360.png`.

## User-flow guide verification

- Guides created or updated: `docs/user-flows/user-authentication.md` source mapping updated.
- Commands and journeys checked: `pnpm user-flow:e2e -- inspect user-authentication`; exact mapped auth file executed.
- `pnpm docs:user-flows:check` result: Pass — 8 guides/mappings.
- `pnpm user-flow:e2e -- check user-authentication` result: Pass.
- Scenario IDs and exact E2E test files: `signup-verification-refresh-logout`, `password-reset-session-revocation`, `passkey-lifecycle` — `apps/web/tests/e2e/auth.journeys.spec.ts`.
- E2E environment/command/result and cleanup: disposable PostgreSQL 17 on 55432, Redis 8 on 56379, backend 4100, web 3100; 3 passed; containers removed.

## Static checks

- Format: `pnpm format:check` — pass.
- Lint: `pnpm --filter @languon/web lint` — pass.
- Typecheck: `pnpm --filter @languon/web typecheck` — pass.
- Storybook: `pnpm --filter @languon/web storybook:build` — pass; the complete shared catalog and all 14 newly ported learning-component stories compile.
- Build: `pnpm --filter @languon/web build` — pass with the explicit stable Next webpack builder, 12 routes generated. The Next 16 default Turbopack production builder repeatedly stalled; Tailwind itself compiled in 445ms and webpack completed successfully.

## Database verification

- Not applicable; no persistence changes.

## Review

- Reviewer result: Approve — no material findings remain after two remediation rounds covering catalog scope/exports, system preferences, compound Popover behavior, dialog elevation, auth hierarchy, and focused regression coverage.
- Security reviewer result: Pass — no material findings; auth validation, safe redirects, capability gating, and memory-only session behavior are preserved.
- Findings resolved: shared alert SVG decoration initially conflicted with inert-rendering security assertions; replaced with non-SVG, non-color status markers. Real auth actions now use the supplied loading treatment. Review identified missing system-theme/contrast behavior, incomplete catalog/public exports, ineffective Popover compound props, an undefined dialog elevation, and incorrect auth footer hierarchy; all were corrected with public-barrel, compound interaction, and route hierarchy regression tests, and the complete catalog builds in Storybook.

## Remaining risks

- Exact Magic layout is adapted to current real capabilities: unsupported OAuth, roles, consent, and remembered-login controls are intentionally absent rather than simulated.
- Existing authenticated pages retain compatibility through `--sys-*` aliases while their page-by-page redesign remains intentionally outside this feature; the authoritative shared kit and tokens are now the Magic contract.
- Exported media/navigation primitives accept caller-provided URLs. No production consumer currently supplies untrusted values; future remote-data consumers must validate allowed protocols/hosts and define media/image CSP before use.
- `LockedContentState` is presentation only; callers must never render unauthorized content beneath its overlay.
- `design/main.pen` changed concurrently outside this feature and is preserved as unrelated user work; it is excluded from feature commits and review scope.
