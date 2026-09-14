# Verification evidence: Magic Patterns UI kit and auth redesign

Updated: 2026-09-14

## Automated tests

### Unit and integration

- Command: `pnpm --filter @languon/web test`
- Result: passed — 21 files, 134 tests on the remediated diff.
- Coverage added: auth shell renders the localized product hierarchy without
  prototype-only controls; Logo exposes a labelled link; all existing auth API,
  form, theme, shared-UI, dictionary, i18n, and session tests remain green.

### Contract and static integration

- Command: `pnpm --filter @languon/web typecheck`
- Result: passed. Shared auth schemas and UI public exports compile without
  contract changes.
- Backend/database contract changes: none.

### E2E

- Focused mapped command:
  `AUTH_E2E_DATABASE_URL=postgres://languon_e2e:languon_e2e@127.0.0.1:55432/languon_auth_e2e AUTH_E2E_REDIS_URL=redis://127.0.0.1:56379/15 AUTH_E2E_WEB_ORIGIN=http://localhost:3100 AUTH_E2E_BACKEND_ORIGIN=http://localhost:4100 pnpm --filter @languon/web exec playwright test tests/e2e/auth.journeys.spec.ts tests/e2e/ui-kit.journeys.spec.ts`
- Final post-review result: passed — auth file 3/3 and UI-kit file 1/1 in
  Chromium. The UI-kit scenario was rerun after adding the final 44px, 200%
  zoom-simulation, reduced-motion, increased-contrast, and forced-colors
  assertions.
- Journeys validated: signup/verification/refresh/logout, password reset and
  session revocation, passkey enrollment/login/rename/removal, and theme
  persistence plus 320px horizontal-fit assertion.
- Infrastructure: task-owned PostgreSQL 17 and Redis 8 loopback containers on
  ports 55432/56379; Playwright-owned backend/web on 4100/3100. Both containers
  were stopped successfully after the run.
- Broader observation: the complete 13-test web suite was also attempted. Its
  three auth tests, theme test, i18n tests, and first dictionary test passed; five
  later dictionary scenarios hit the shared signup IP rate limit after preceding
  account creation (`Too many attempts`, ~3600s). This is an existing harness
  isolation limitation rather than a UI regression. The exact four scenarios
  mapped to the two affected guides pass from a fresh Redis namespace.

## Real application verification

- Environment: local Next.js 16 development app at `localhost:3333` and backend
  at `localhost:4000`; project-pinned `agent-browser` 0.33.0, Chromium.
- Desktop: `/login?returnTo=%2Fsecurity` at 1440×1000 — split product/form
  hierarchy, readable form width, real password/passkey capability controls,
  correct headings and labels.
- Mobile: `/login?returnTo=%2Fsecurity` at 320×800 in System/light and 390×844
  in Dark — compact monogram, theme/language controls, fields, password reveal,
  actions, and switch link fit without overlap or horizontal clipping.
- Geometry: at 320px the email field, password reveal, and linked monogram each
  measured exactly 44px high through the browser wrapper. Playwright also
  verifies no horizontal overflow at 320px and at a 640px viewport with CSS
  zoom set to 200% (an effective 320px content width).
- Route/state inspection: signup, forgot password, incomplete reset, and
  incomplete verification were inspected in dark mobile mode. Required fields,
  recovery/verification-code controls, disabled incomplete actions, and recovery
  links were exposed correctly.
- Console/errors/network: no page errors or error-level console output. Expected
  anonymous `POST /auth/refresh` 401 was observed; capability fetch returned
  200; all local assets and fonts returned 200; no surprising origin was called.
- Preference media: Playwright emulation verifies the reduced-motion transition
  duration, increased-contrast border-token override, and active forced-colors
  media query on the final UI.
- Initial finding remediated: at 320px the full wordmark and visible selector
  labels collided. The auth header now uses a monogram and visually hides both
  redundant labels while retaining each select's accessible name. Re-verification
  passed.
- Temporary visual captures:
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789381700963.png`
  (desktop), `screenshot-1789381792517.png` (corrected 320px), and
  `screenshot-1789381825264.png` (dark 390px).
- Session `languon-magic-auth-redesign-1b7a28e9a3c47500ed2d30edd788804e`
  was closed.

## User-flow guide verification

- Guides updated: `docs/user-flows/web-ui-kit.md` and
  `docs/user-flows/user-authentication.md`; no new journey was introduced.
- `pnpm user-flow:e2e -- check web-ui-kit`: passed.
- `pnpm user-flow:e2e -- check user-authentication`: passed.
- `pnpm docs:user-flows:check`: passed — 16 guide-tool tests and all 8 guides.
- Revision markers updated after assertions and guide behavior were reviewed
  together.

## Static checks

- Format: affected files formatted with project Prettier; `git diff --check`
  passed before final review.
- Lint: `pnpm --filter @languon/web lint` passed.
- Typecheck: `pnpm --filter @languon/web typecheck` passed.
- Build: `pnpm --filter @languon/web build` passed; all 12 routes generated.
- Storybook: `pnpm --filter @languon/web storybook:build` passed after removing
  its remaining old Literata import. Existing large-chunk advisory remains.

## Database verification

- Not applicable: no database, migration, repository, or persistence change.
- Disposable E2E database migrations completed successfully as harness setup.

## Review

- Architecture audit: in-place migration at the ADR-0005/ADR-0016 shared UI
  seam recommended; no new ADR required.
- Product audit: visual-only mapping approved; unsupported prototype auth
  concepts intentionally excluded.
- Independent implementation reviewer: three Medium findings were identified
  (size aliases, 44px targets, heading order), fixed, and re-reviewed; no further
  implementation defects. Final stale-evidence/generated-file notes were also
  resolved by rerunning tests and restoring `next-env.d.ts`.
- Security reviewer: no material findings. Auth validation, safe return paths,
  memory-only tokens, anti-framing headers, and static/escaped Magic-derived copy
  remain intact. Pre-existing limited CSP is a separate defense-in-depth item.
- Independent tester: mapped verification is proportional and passes; confirmed
  the full-suite 429 is the existing five-per-hour client-address harness limit.

## Remaining risks

- The complete web E2E command can exhaust its shared signup IP rate limit when
  all dictionary journeys run in one namespace. This feature did not change the
  backend rate-limit or E2E harness; affected mapped journeys pass in isolation.
- Auth uses the already bundled Manrope/system sans stack as the closest local
  Inter-compatible typeface; exact Inter would require a separately approved
  production dependency.
