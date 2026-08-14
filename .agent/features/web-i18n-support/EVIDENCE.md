# Verification evidence: Web internationalization and language switcher

Updated: 2026-08-14

## Automated tests

### Unit

- Command: `pnpm --filter @languon/web test`
- Result: passed; 7 files and 42 tests.
- Coverage added:
    - cookie/header/default locale precedence, regional-tag matching, q-value
      ordering, and unsupported fallback;
    - typed translation interpolation;
    - active-catalog mapping for authentication transport errors;
    - locale-sensitive status reset and stale async-setter rejection;
    - capability failure/retry persistence with active-catalog retranslation;
    - native language-selector label, cookie write, route refresh, and unchanged
      path/query/fragment;
    - localized provider wrapping for all existing auth component regressions;
    - updated unchanged-route assertions for auth navigation.

### Integration and contract

- Commands: `pnpm --filter @languon/web typecheck`,
  `pnpm --filter @languon/web build`, and final `pnpm check`.
- Result: passed. The Next production route table contains only the established
  `/`, `/login`, `/signup`, `/verify-email`, `/forgot-password`,
  `/reset-password`, and `/security` product routes; every content route is
  request-rendered because locale depends on cookies/headers.
- Contract checks: not applicable; no backend/public schema changed.

### E2E

- Environment: task-owned PostgreSQL 17 and Redis 8 containers on loopback,
  disposable `languon_auth_e2e` database, backend `127.0.0.1:4100`, web
  `127.0.0.1:3100`, Chromium, one worker. The web E2E server used `.next-e2e`
  so it did not touch the user's active `.next` dev server.
- Command: `AUTH_E2E_DATABASE_URL=... AUTH_E2E_REDIS_URL=...`
  `AUTH_E2E_WEB_ORIGIN=http://localhost:3100`
  `AUTH_E2E_BACKEND_ORIGIN=http://localhost:4100`
  `pnpm --filter @languon/web test:e2e` through the reviewed disposable wrapper
  block in `apps/web/tests/e2e/README.md`.
- Results: the complete 5-journey suite passed before review remediation; in the
  final post-remediation runs the three unchanged authentication journeys passed,
  then the focused i18n file passed 2/2. Task-owned containers were stopped by
  each command trap.
- Journeys validated:
    - existing signup/verification/refresh/logout;
    - existing password reset/session revocation;
    - existing passkey lifecycle;
    - JavaScript-disabled SSR for English, Russian, French, and Spanish from the
      browser's actual request locale, matching `<html lang>`, localized route
      and not-found metadata/copy, and unchanged URLs;
    - English login to Spanish cookie selection, unchanged
      `/login?returnTo=%2Fsecurity`, stale-message reset, translated SSR refresh,
      and persistence.
- Diagnosed failures before the final pass:
    - Next 16 refused a second dev server sharing `.next`; the E2E server was
      isolated through `AUTH_E2E_DIST_DIR=.next-e2e` and generated output ignores.
    - Chromium overrode a raw test header with its configured locale; the test
      now sets Chromium's real locale, which emits the production-equivalent
      `Accept-Language` header.

## Real application verification

- Tool: project-pinned `agent-browser` through `pnpm browser` safe wrapper.
- Sessions: `languon-web-i18n-support-70ad6b6ec016bf8c7dbe9cde77a65f47`
  and `languon-web-i18n-layout-a648d94a1a3c3e4a23f5b3cd62b7fb1a`, both closed.
- Environment: existing reviewed local web app at `http://localhost:3333`.
- Scenarios and observations:
    - At `/login?returnTo=%2Fsecurity`, the labeled English selector switched to
      Russian; heading, fields, actions, link/ARIA labels, and retry state became
      Russian while the exact URL remained unchanged.
    - At 390×844, the selector remained top-right, focusable, and did not obscure
      the localized authentication surface.
    - At 1440×900, the selector remained top-right and the persisted Russian
      selection rendered on `/`; home account navigation was localized.
    - Browser `errors` was empty. Console contained only React DevTools/HMR info.
      Existing local auth capabilities were unavailable and correctly rendered
      the localized retry state; the disposable full E2E run separately proved
      working authentication requests.
- Visual artifacts:
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1786727225919.png`
      (1440×900)
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1786727226923.png`
      (390×844)

## User-flow guide verification

- Created `docs/user-flows/web-i18n-support.md`; updated the guide index and
  `docs/user-flows/user-authentication.md` source/related-feature mapping.
- `pnpm docs:user-flows:check`: passed; 2 guides and mappings validated.
- `pnpm user-flow:e2e -- check web-i18n-support`: passed.
- `pnpm user-flow:e2e -- check user-authentication`: passed.
- Localization scenarios:
  `ssr-locale-routing` and `language-switch-persistence` in
  `apps/web/tests/e2e/i18n.journeys.spec.ts`.
- Authentication scenarios: `signup-verification-refresh-logout`,
  `password-reset-session-revocation`, and `passkey-lifecycle` in
  `apps/web/tests/e2e/auth.journeys.spec.ts`.
- Both exact mapped files ran in the successful 5-test Playwright command above.

## Static and repository checks

- `pnpm check`: passed after implementation. This included formatting,
  user-flow docs, lint/FSD rules, typecheck across 7 workspaces, all repository
  tests, and all workspace builds.
- Focused web build: passed; all established paths are dynamic SSR, and `/icon`
  remains static.
- `git diff --check`: passed.

## Database verification

- Schema/migration change: not applicable.
- Disposable E2E migration: completed successfully against the task database;
  no production/shared data was used.

## Review

- Independent tester: passed the then-current 40 web tests, web typecheck/build, canonical root
  lint, docs checks, and both user-flow mappings; no blocking product failure.
- Independent reviewer: found stale translated client state, missing localized
  not-found behavior, uncatalogued language option labels, an over-broad provider
  reset, and a capability-failure retry edge case. All were fixed with scoped
  locale-sensitive status state that preserves form/auth state and rejects stale
  async setters, semantic capability-failure state, catalog-backed custom
  not-found UI/metadata, typed option keys, and E2E/unit regressions. Final
  re-review found no material issues.
- Security review: not applicable. Locale input is allowlisted, the cookie stores
  only a language code, and no authentication/security policy or trust boundary
  changed.

## Remaining risks

- Russian, French, and Spanish catalogs are structurally complete and exercised,
  but nuanced translation quality should receive fluent-speaker/product review.
- Stable URLs intentionally render by request locale, so shared caches must honor
  the framework's dynamic request rendering contract described in ADR-0007.
