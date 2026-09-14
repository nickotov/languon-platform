---
feature: web-ui-kit
title: Web UI Kit
status: current
last_verified: 2026-09-14
surfaces:
    - browser
source_paths:
    - .agent/features/web-ui-kit/**
    - .agent/features/magic-patterns-ui-kit-auth-redesign/**
    - apps/web/.storybook/**
    - apps/web/src/app/globals.css
    - apps/web/src/app/layout.tsx
    - apps/web/src/fsd/features/change-theme/**
    - apps/web/src/fsd/shared/theme/**
    - apps/web/src/fsd/shared/ui/**
    - apps/web/src/fsd/widgets/site-header/**
    - apps/web/tests/e2e/ui-kit.journeys.spec.ts
    - design/**
    - docs/adr/0016-runtime-ui-kit-authority.md
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/ui-kit.journeys.spec.ts
e2e_scenarios:
    - theme-preference-persistence
related_features:
    - magic-profile-page
    - user-authentication
    - web-i18n-support
---

# Web UI Kit

## What this verifies

This guide verifies that the public web app uses the single Magic-derived
Languon runtime UI kit, applies its neutral/indigo semantic light and dark
palettes, renders a server-safe system theme by default, and persists an
explicit Light or Dark preference from the application-header toggle without
changing the active route.
It also covers keyboard-visible native controls and compact reflow. Admin,
mobile, and product-specific learning patterns are outside this journey.

## Start the development environment

Install the repository-documented Node.js and pnpm versions and dependencies.
Start the web app from the repository root:

```sh
pnpm dev:web
```

Expect the app at `http://localhost:3333`. Authentication-backed pages also need
the disposable local backend described in the authentication guide, but the
theme journey does not create data or require a signed-in account.

## Browser verification

1. In a fresh browser context, open
   `http://localhost:3333/login?returnTo=%2Fsecurity`. Expect the page to render
   with `<html data-theme="system">`, the neutral canvas, indigo actions, and
   visible theme toggle and **Language** selector without a hydration flash. At a
   desktop width, expect the product story and auth form in a balanced split
   layout; on mobile, expect one focused form column.
2. Activate **Switch to dark theme**. Expect `<html data-theme="dark">`, an unchanged path and
   query, and a `languon-theme=dark` cookie scoped to `/` with `SameSite=Lax`.
3. Reload, then navigate to `/`. Expect Dark to remain selected and server-rendered
   before hydration because the cookie is global to the application.
4. Activate **Switch to light theme**. Expect the explicit Light preference to
   replace Dark without changing the current route.
5. Use only the keyboard to focus the locale selector, theme toggle, auth fields, password reveal,
   and actions. Expect a visible focus ring, native activation, and no keyboard trap.
6. Repeat at a 320px viewport and 200% browser zoom. Expect the compact logo,
   header controls, form content, status copy, and actions to reflow without
   overlap or horizontal clipping. Controls retain at least a 44px touch target.

## E2E coverage

- `theme-preference-persistence` proves the SSR default, accessible header theme
  toggle, route/query preservation, global cookie attributes, and explicit dark
  then light preference persistence across reload.

Field associations, tabs keyboard behavior, indeterminate checkbox state, and
loading button semantics stay in focused component tests. The complete visual
catalog and both theme palettes are built through Storybook.

## Expected failure and edge cases

- Missing, unsupported, or malformed theme cookies resolve to System.
- The untouched System default follows CSS media queries; once the user toggles
  appearance, the control stores an explicit Light or Dark preference.
- Theme changes do not submit surrounding forms, clear user input, refresh the
  route, or change the selected locale.
- Reduced-motion, increased-contrast, and forced-colors preferences preserve
  control boundaries, state, and focus without decorative motion.

## Automated regression checks

Run focused web and catalog checks:

```sh
pnpm --filter @languon/web test
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web storybook:build
pnpm --filter @languon/web build
pnpm lint
```

Validate guide traceability and execute the registered mapped journey against
the disposable loopback E2E infrastructure:

```sh
pnpm user-flow:e2e -- check web-ui-kit
pnpm --filter @languon/web test:e2e
```

## Troubleshooting

- If the selected theme is unexpected, inspect and clear only the
  `languon-theme` cookie, then reload and confirm the root returns to System.
- If System does not follow the operating-system preference, inspect the
  `prefers-color-scheme` emulation and confirm `data-theme` remains `system`.
- If the Storybook build fails on a story, run the focused typecheck and inspect
  that component's TSX, CSS Module, and story together.
- If E2E startup fails, verify the disposable database/Redis URLs, loopback ports,
  and container health described in `apps/web/tests/e2e/README.md`.

## Cleanup

Close the browser session and stop only the development processes you started.
The theme cookie contains only an appearance preference and may remain for
ordinary development; remove only `languon-theme` when a clean System-default
test is needed. The E2E wrapper stops its task-owned disposable containers.
