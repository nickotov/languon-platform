---
feature: web-i18n-support
title: Web Internationalization and Language Switching
status: current
last_verified: 2026-08-14
surfaces:
    - browser
source_paths:
    - .agent/features/web-i18n-support/**
    - apps/web/src/app/**
    - apps/web/next.config.mjs
    - apps/web/playwright.config.ts
    - apps/web/src/fsd/features/auth/**
    - apps/web/src/fsd/features/change-locale/**
    - apps/web/src/fsd/pages/**
    - apps/web/src/fsd/shared/i18n/**
    - apps/web/src/fsd/widgets/site-header/**
    - apps/web/tests/e2e/i18n.journeys.spec.ts
    - docs/adr/0006-web-internationalization-strategy.md
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/i18n.journeys.spec.ts
e2e_scenarios:
    - ssr-locale-routing
    - language-switch-persistence
related_features:
    - user-authentication
---

# Web Internationalization and Language Switching

## What this verifies

This guide verifies server-rendered English, Russian, French, and Spanish web
content on stable, non-localized URLs; document language and localized metadata;
automatic language selection; the global language selector; query preservation;
and the non-sensitive locale cookie. Admin, mobile, backend API messages, and
outbound e-mail translation are intentionally outside this journey.

## Start the development environment

Install the documented Node.js and pnpm versions and dependencies. With the
backend dependencies available as described in the authentication guide, run
the backend and web app in separate terminals from the repository root:

```sh
pnpm dev:backend
```

```sh
pnpm dev:web
```

Expect the web app at `http://localhost:3333` and backend health at
`http://localhost:4000/health`. Use fake local authentication data only. The
localization checks themselves do not create database records.

## Browser verification

1. In a fresh browser context without a locale cookie, open
   `http://localhost:3333/` with Russian as the preferred browser language.
   Expect Russian home copy, a Russian **Язык** selector in the top-right header,
   `<html lang="ru">`, and an unchanged `/` URL.
2. Repeat with English, French, and Spanish request-language preferences. Expect
   the same URL and page structure with matching localized copy and document
   `lang` values.
3. With French preferred, open `/login?returnTo=%2Fsecurity`. Expect French page
   metadata, heading, field labels, actions, status copy, and accessibility
   labels before and after hydration.
4. Open a missing route. Expect the not-found metadata and visible content to
   use French while the missing URL stays unchanged.
5. Change **Langue** to **Español**. Expect the URL to remain
   `/login?returnTo=%2Fsecurity` while the document and visible copy refresh to
   Spanish.
6. Reload the same URL. Expect Spanish again because the selector stored
   `languon-locale=es` with path `/` and `SameSite=Lax`; the cookie overrides the
   request-language header.
7. Clear only the locale cookie and reload. Expect the request-language header
   to control SSR again; with no supported preference, expect English.
8. At desktop and narrow mobile widths, confirm the selector remains reachable
   at the top right, has a visible focus indicator, and does not obscure the
   active form or home actions.

## E2E coverage

- `ssr-locale-routing` proves `Accept-Language` negotiation plus
  JavaScript-disabled SSR content, document language, localized metadata and
  not-found behavior, and unchanged URLs for all four locales.
- `language-switch-persistence` proves accessible selection, unchanged path and
  query, translated login content, stale-message reset, and cookie persistence
  across reload.

Catalog key completeness, path helper edge cases, and interpolation stay in
focused unit/type tests because they do not require the full application stack.

## Expected failure and edge cases

- Unsupported or malformed cookie/header values fall back to English.
- Language selection never adds or changes a URL path segment.
- Switching locale preserves the current path, query, and fragment but does not
  translate user-provided form values.
- Backend/API transport text is mapped to stable localized UI errors; unknown
  failures use the localized generic message.

## Automated regression checks

Run focused web checks:

```sh
pnpm --filter @languon/web test
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web build
pnpm lint
```

Validate guide traceability and execute the registered mapped journey against
the disposable local E2E infrastructure described in
`apps/web/tests/e2e/README.md`:

```sh
pnpm user-flow:e2e -- check web-i18n-support
pnpm --filter @languon/web test:e2e
```

## Troubleshooting

- If a URL chooses an unexpected language, inspect and clear only
  the `languon-locale` cookie, then confirm the browser `Accept-Language` order.
- If the selector changes but content does not, inspect the browser console and
  confirm that the request includes the allowlisted locale cookie.
- If E2E startup fails, verify the disposable database/Redis URLs, loopback
  ports, and container health as documented in the E2E README. The E2E server
  uses `.next-e2e` so an ordinary `.next` development server can keep running.

## Cleanup

Close the browser session and stop only the development processes you started.
The selector cookie contains only a locale code and may remain for ordinary
development; remove only `languon-locale` in browser storage when a clean
negotiation test is needed. The mapped E2E wrapper stops its task-owned
disposable containers through its documented trap.
