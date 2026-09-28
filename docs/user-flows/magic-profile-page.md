---
feature: magic-profile-page
title: Magic Patterns Profile Page and Authenticated Shell
status: current
last_verified: 2026-09-28
surfaces:
    - browser
source_paths:
    - .agent/features/025-magic-profile-page/**
    - apps/web/src/app/profile/**
    - apps/web/src/fsd/pages/profile/**
    - apps/web/src/fsd/widgets/site-header/**
    - apps/web/src/fsd/widgets/app-shell/**
    - apps/web/src/fsd/features/change-theme/**
    - apps/web/src/fsd/features/auth/ui/home-session-actions.tsx
    - apps/web/tests/e2e/profile.journeys.spec.ts
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/profile.journeys.spec.ts
e2e_scenarios:
    - profile-empty-coming-soon-and-header-navigation
related_features:
    - user-authentication
    - profile-account-controls
    - web-i18n-support
    - web-ui-kit
---

# Magic Patterns Profile Page and Authenticated Shell

## What this verifies

This guide verifies the Magic Patterns authenticated application shell and
`/profile` account-settings composition. It proves that the shell keeps owner
navigation available, the account menu persists an explicit appearance,
authenticated identity is real,
unsupported billing/export datasets remain empty, and their placeholder actions
say they are coming soon without performing writes. Handle and deletion actions
are now real and are covered by the related Profile Account Controls guide.

## Start the development environment

Use the disposable local authentication environment described in
`apps/web/tests/e2e/README.md`, with fake `example.test` identities only. From
the repository root, start the standard development stack:

```sh
pnpm dev
```

Expect the web app at `http://localhost:3333` and the backend health endpoint at
`http://localhost:4000/health`. The mapped E2E wrapper provisions its own safe
test database and Redis services.

## Browser verification

1. Open `/profile` signed out. Expect a focused empty account card with a sign-in
   link that retains `/profile` as the return destination.
2. Create and verify a fake local account, returning to `/profile`. Expect the
   account-settings heading, the signed-in email, no invented display name,
   subscription, payment method, balance, or transaction history.
3. Select Account, Security, Billing, and Credits using pointer and keyboard.
   Expect the underline tabs and their panels to remain accessible and the
   content to reflow without horizontal clipping.
4. In Account, expect interface-language selection to work immediately and
   unsupported name, learning-language, time-zone, and photo editing to be
   clearly coming soon. In Security, expect the real primary email and embedded
   password, passkey, and session controls. The passkey card has a centered
   empty state with a direct Add action, and enrolled rows show only known
   metadata with accessible rename and confirmed revoke. Google, Yandex, and Apple rows are
   visible as coming soon with disabled Connect actions; the email-change request explicitly sends no email.
5. In Billing, choose **Compare plans**. Expect an informational notification
   that Subscription is coming soon, with no billing request or account change.
6. Open the pinned account menu and choose Dark. Expect `data-theme` and the
   global `languon-theme` cookie to change while the route remains `/profile`.
   Expect the real handle or Account fallback, email, Profile link, interface
   language, System/Light/Dark choices, and Sign out action to remain reachable.
7. Click the Languon logo. Expect navigation to `/dictionaries`, the signed-in
   application home.
8. Repeat at 320px width and at 200% zoom. Expect a compact top bar and modal
   navigation drawer instead of the desktop sidebar. The drawer closes on
   Escape and restores focus to its menu button; the shell, summary, tabs,
   cards, and actions remain usable without horizontal overflow.

## E2E coverage

- `profile-empty-coming-soon-and-header-navigation` signs up and verifies a fake
  account, opens the profile route, validates truthful empty states, selects
  tabs, exercises a coming-soon action, persists an account-menu theme choice,
  checks the compact navigation drawer, and returns to Dictionaries through the
  shell logo.

Detailed tab keyboard semantics and signed-out/loading boundaries remain in
focused component tests because they do not require another system boundary.

## Expected failure and edge cases

- Session bootstrap renders a loading state rather than a false signed-out or
  fabricated profile.
- Signed-out access does not expose account data and offers sign-in with a safe
  local return path.
- Missing profile, subscription, payment, credit, and ledger data are rendered
  as unavailable or coming soon; zeros and fake fixtures are not substituted.
- Billing/export placeholder buttons never call APIs. Handle and deletion actions
  are live and need their own explicit confirmations.
- Password and passkey functionality now lives in the Profile Security tab;
  unavailable OAuth connection is visibly future functionality;
  `/security` redirects there.

## Automated regression checks

Run focused web checks and traceability validation:

```sh
pnpm --filter @languon/web exec vitest run tests/profile-page.test.tsx tests/theme.test.tsx tests/home-session-actions.test.tsx
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web lint
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check magic-profile-page
```

After starting the reviewed disposable E2E services and exporting the safe
loopback environment from `apps/web/tests/e2e/README.md`, run the mapped test:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/profile.journeys.spec.ts
```

## Troubleshooting

- If signup is unavailable, confirm the backend health endpoint and sanitized
  local auth configuration before retrying.
- If `/profile` stays in its loading state, inspect `/auth/refresh`; a 401 is
  expected only for a signed-out browser context.
- If the selected palette is unexpected, inspect only the `languon-theme`
  cookie, root `data-theme` attribute, and account-menu selection.
- If mapped E2E startup fails, confirm the disposable database and Redis
  containers from `apps/web/tests/e2e/README.md` are healthy.

## Cleanup

Sign out and stop only the local processes started for this verification. The
test wrapper removes its task-owned disposable data. Do not reset shared,
staging, or production databases.
