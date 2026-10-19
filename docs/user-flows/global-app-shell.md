---
feature: global-app-shell
title: Global App Shell
status: current
last_verified: 2026-10-12
surfaces:
    - browser
source_paths:
    - .agent/features/041-global-app-shell/**
    - apps/web/src/fsd/widgets/app-shell/**
    - apps/web/src/fsd/features/dictionary-library/**
    - apps/web/src/fsd/pages/home/**
    - apps/web/src/fsd/shared/ui/popover/**
    - apps/web/src/fsd/features/change-locale/**
    - apps/web/src/fsd/shared/theme/**
    - apps/web/tests/e2e/app-shell.journeys.spec.ts
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/app-shell.journeys.spec.ts
e2e_scenarios:
    - guest-settings-persistence
    - session-aware-global-navigation
related_features:
    - contextual-language-assistant-and-knowledge
    - magic-profile-page
    - user-authentication
    - web-ui-kit
    - web-i18n-support
---

# Global App Shell

## What this verifies

All normal web pages share desktop expanded/rail navigation and a mobile top bar
with a modal drawer. Home displays only **WIP** in every locale. Every Languon
logo leads to `/`. Guests can sign in and change locale or appearance; they
cannot see owner dictionary links, create actions, or account identity. During
session restoration, the footer shows a pending identity instead of Sign in.
Signed-in users retain dictionary navigation and the account menu on home,
authentication, profile, shared-reader, and not-found pages. Fullscreen learning
and existing page access checks retain their established behavior.

## Start the development environment

Use Node.js 24, the repository pnpm version, and installed workspace dependencies.
For manual verification, start the existing local infrastructure and applications
using the [authentication guide](user-authentication.md#start-the-development-environment).
The web app is `http://localhost:3333`; backend health is
`http://localhost:4000/health`. Use only synthetic `example.test` accounts.

Automated journeys use the existing disposable PostgreSQL/Redis harness in
[`apps/web/tests/e2e/README.md`](../../apps/web/tests/e2e/README.md). Export its
reviewed loopback `AUTH_E2E_*` configuration before the focused Playwright command.
These tests use ordinary signup and manual dictionaries and call no model service.

## Browser verification

1. In a fresh signed-out context, open `/login?returnTo=%2Fsecurity`. Confirm
   the sidebar footer contains **Sign in** linking to `/login` and **Settings**,
   with no dictionary links, create action, or account identity.
2. Open Settings. Select Dark and Spanish using **Interface language**. Expect
   document appearance and language to change without modifying the current URL.
   The `languon-theme` and `languon-locale` cookies have path `/` and SameSite=Lax.
3. Reload and reopen Settings. Expect the same choices. Restore English; select
   System or Light. Collapse to the rail and confirm Settings remains accessible.
4. At 390px width, open navigation and then Settings. Select Light inside the
   drawer. Press Escape once: only Settings closes and focus returns to its gear.
   Press Escape again: the drawer closes and focus returns to Open navigation.
5. Follow the mobile logo. Expect `/` with WIP. Open a nonexistent route and a
   shared dictionary route with no valid capability. Confirm the normal shell is
   still available, the page retains its error state, and no private dictionary
   listing request is issued. Lookalike routes `/dictionaries-other`,
   `/profile-other`, and `/shared/dictionaries-other` retain the generic Languon
   mobile title and do not select or auto-expand dictionary navigation.
   Valid shared-reader access remains covered by the
   [dictionary platform guide](dictionary-platform.md).
6. Sign up and verify a fresh synthetic learner, create a manual dictionary,
   and follow the sidebar logo to `/`. Expect WIP with the dictionary link and
   real account identity still in the shell. The guest Settings gear is absent;
   locale and System/Light/Dark remain in the account menu.
7. Sign out, then sign up a different learner in the same browser. Expect the
   previous learner's dictionary links to disappear immediately. Create another
   dictionary, visit `/login`, return home, and reload. Only the current learner's
   dictionary remains visible. No access token is stored in browser storage.

## E2E coverage

- `guest-settings-persistence` proves guest-only controls, cookie and URL
  preservation across locale/appearance changes and reload, rail access, mobile
  modal Settings interaction, nested Escape focus restoration, home/not-found/
  unavailable-shared chrome, generic lookalike-not-found route titles, and absence
  of private dictionary listing requests.
- `session-aware-global-navigation` proves real signup, manual dictionary creation,
  global owner navigation on home and auth pages, logout removal, a second user's
  isolated navigation, and refresh restoration after reload.

Bootstrap gating and direct identity changes in one mounted query client are
covered in component tests. Valid shared capabilities and fullscreen learning
remain covered by their existing journey suites.

## Expected failure and edge cases

- Bootstrap never displays a premature Sign in link or starts private navigation
  requests. An unavailable refresh session resolves to ordinary guest controls.
- Private navigation is gated by authenticated user identity; cached entries for
  another identity are never displayed after logout or identity change.
- Guest Settings exposes preferences only. It does not grant access to profile,
  owner dictionaries, or creation actions. Missing shared capabilities retain
  their existing unavailable state.
- Preferences do not rewrite path, query, fragment, form values, or capability
  handling. Missing or malformed preference cookies use existing defaults.
- Route changes close the drawer and popup. Desktop breakpoint changes close a
  mobile drawer. Escape closes the inner popup before the native modal drawer.
- Existing navigation loading, error/retry, empty state, create dialog, and
  sign-out failure behavior remain unchanged.

## Related contextual assistant coverage

Authenticated navigation now also includes **Knowledge**. Its private library,
source conversations and publication journey are owned by the
[Contextual Language Assistant and Knowledge guide](contextual-language-assistant-and-knowledge.md).
The shell scenarios here retain their guest settings, identity isolation,
dictionary navigation and drawer assertions; they do not claim to test notes.

## Automated regression checks

From the repository root:

```sh
pnpm --filter @languon/web exec vitest run tests/app-shell.test.tsx tests/home-page.test.tsx
pnpm --filter @languon/web typecheck
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check global-app-shell
```

With the reviewed disposable E2E configuration available:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/app-shell.journeys.spec.ts
```

## Troubleshooting

- If navigation stays pending, inspect the local `/auth/refresh` request; an
  anonymous browser's 401 is expected. Do not inspect or publish token values.
- If settings appear beneath the mobile modal, confirm the popup is mounted
  inside the open native drawer and test Escape/focus in the real browser.
- If palette or language differs after reload, inspect only the non-sensitive
  `languon-theme` and `languon-locale` cookies.
- If the harness fails before tests, inspect the disposable loopback services,
  dedicated database name, and ports described in the E2E README. Never reuse
  unknown shared infrastructure or reset shared data.

## Cleanup

Sign out synthetic learners and close the verification browser. Stop only local
processes and disposable containers created for this run; retain ordinary local
preference cookies unless testing a fresh context.
