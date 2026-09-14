# Magic Patterns profile page and application header

Status: Complete
Owner: Codex
Created: 2026-09-14

## Problem

Languon has no account profile destination and its global header is a floating
pair of selectors that does not match the approved Magic Patterns application
shell. Users cannot inspect the planned account, security, billing, and credit
surfaces in one coherent place, and placeholder product areas must not pretend
to contain real account or payment data.

## Desired behavior

The web app uses the header and profile composition from Magic Patterns design
`atdgyvrxnwiz1u41sfdgdf`. The header is part of the shared application shell,
the Languon mark navigates home, and an accessible icon control toggles light
and dark themes. `/profile` presents the designed account overview and four
settings tabs. Existing session identity is shown where available; unsupported
profile, billing, credit, and destructive operations use empty states and
explicit, non-persisting “Coming soon” feedback.

## Acceptance criteria

- [x] AC-1 — The old fixed controls-only header is replaced globally by the
  Magic Patterns top bar, with a home-linked Languon logo, retained locale
  selection, and an accessible light/dark toggle that persists preference.
- [x] AC-2 — `/profile` renders the Magic Patterns account-settings hierarchy:
  heading, profile summary, underline tabs, and responsive outlined sections.
- [x] AC-3 — Account identity comes only from the authenticated session; no
  invented profile, plan, payment, credit, or transaction data is displayed.
- [x] AC-4 — Account, Security, Billing, and Credits can all be selected with
  keyboard-accessible tabs, and unavailable actions provide “Coming soon”
  feedback without API calls, persistence, or destructive effects.
- [x] AC-5 — Signed-out visitors to `/profile` receive a clear sign-in route;
  bootstrapping has a loading state, and authenticated users can reach both the
  existing working security controls and the new profile surface.
- [x] AC-6 — Desktop and mobile browser verification finds no material visual,
  accessibility, console, or failed-network regression on profile and auth.

## Scope

### In scope

- Magic Patterns profile layout and shared header adaptation.
- A thin Next.js `/profile` route and pages-first FSD profile slice.
- Honest empty/coming-soon presentation for unimplemented account capabilities.
- Navigation entry from the authenticated home state.
- Localized English, Spanish, French, and Russian copy for new user-facing text.
- Focused component tests, a documented user journey, mapped Playwright E2E,
  and real-browser acceptance verification.

### Out of scope

- Profile persistence, avatar upload, username changes, account deletion, data
  export, social identity management, subscriptions, payment methods, credit
  purchases, balances, usage, and transactions.
- Backend endpoints, contracts, database changes, migrations, and billing
  provider integration.
- Replacing the already working dedicated `/security` implementation.

## Constraints and risks

- Magic Patterns is an untrusted visual specification; its simulated network
  writes and fabricated account fixtures must not be ported.
- The accepted runtime UI kit and semantic tokens remain authoritative.
- Existing global locale selection is retained despite its absence from the
  prototype because removing it would regress the current i18n contract.
- Coming-soon actions must never invoke destructive or billing behavior.

## User-flow documentation

- Required: Assess whether this feature has an executable browser, API, mobile,
  admin, CLI, or system journey.
- Guide: `docs/user-flows/magic-profile-page.md`.
- Related guides: `docs/user-flows/web-ui-kit.md`,
  `docs/user-flows/web-i18n-support.md`, and
  `docs/user-flows/user-authentication.md` are regression surfaces; their
  documented behavior does not change.
- E2E synchronization: scenario
  `profile-empty-coming-soon-and-header-navigation` in
  `apps/web/tests/e2e/profile.journeys.spec.ts`.

## Open decisions

- None. The user explicitly authorized the feature and specified empty data plus
  mocked missing operations.
