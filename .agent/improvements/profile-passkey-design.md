# Improvement: Profile passkey design fidelity

Status: Complete
Created: 2026-09-15
Updated: 2026-09-15

## Routing decision

- Intended outcome: Match the supplied Magic Patterns Passkeys section's hierarchy, empty/list states, direct enrollment, and revoke confirmation using Languon's real WebAuthn capability.
- Why improvement: This adjusts one existing-contract Security experience but its visual composition and interactions are broader than a correction. No new product capability, journey, persistence, public API, security policy, or dependency is needed.
- Feature boundary: stop before inventing device metadata, changing account/credential semantics, or adding a new backend contract.

## Context and scope

- Current behavior: Add passkey expands a name form; the empty state is a left-aligned icon/text row without the designed CTA; populated rows have prominent inline Rename/Revoke controls and sparse metadata; the revoke dialog has one short paragraph.
- Expected behavior: Add begins the browser/device ceremony directly, with a waiting state; the outlined card contains a centered empty state and first-passkey CTA; populated rows show icon, name, known metadata and one visible Revoke action; secondary rename remains accessible without altering the designed row hierarchy; revoke keeps a named, cancelable two-paragraph confirmation.
- In scope: embedded Profile Security Passkeys card, existing standalone Security passkey controls where shared, localized copy, focused tests and mapped guide/E2E updates.
- Out of scope: fake device labels, provider-linked alternate sign-in, passkey storage/API policy, registration/verification changes, backend changes.
- Constraints: ADR-0001 verified-email/passkey strategy, FSD, runtime UI tokens, shared Card/Button/IconButton/Dialog/InlineAlert, Magic artifact `c5093f52-facb-4015-9276-9f03bd3331a2`.
- Guides: `user-authentication` passkey lifecycle; `profile-account-controls` observable Security details; `magic-profile-page` passkey card expectations.
- Rollback: Revert this focused patch; no schema or dependency removal.

## Screen contract and plan

- User job: add a credential to sign in without a password, inspect and manage existing credentials, avoid accidental revocation.
- Entry: signed-in `/profile?tab=security` within recent-auth window; Add is primary, Revoke destructive, Rename secondary; sign-in link remains visible for recent-auth failure.
- Design mapping: outlined Card header with Add; card body shows waiting/error, centered EmptyState with first-passkey CTA or divided DataRows; use real name/created/last-used metadata only. Direct Add stores a collision-free generic name because the existing verify contract requires one; Rename uses a discreet icon and focused dialog. Revoke dialog keeps Keep and Revoke actions.
- Required states: unsupported/capability loading, list loading/error/retry, ceremony pending/cancelled, added, rename failure, revoke failure, narrow 320px and desktop.
- Verification: focused component tests, mapped virtual-authenticator E2E on disposable infrastructure, browser visual/interaction at 320px and desktop, lint/typecheck/isolated build, guide checks.

## Plan

- [x] Implement the passkey card and existing-contract interaction changes.
- [x] Update focused tests and mapped guide/E2E coverage.
- [x] Run affected automated, browser and guide checks.
- [x] Review the final diff and record evidence.

## Verification

| Check | Result |
| --- | --- |
| Tests/E2E | Focused Vitest: 15/15 passed. Mapped Playwright auth/profile journeys with virtual authenticator: 5/5 passed on disposable local PostgreSQL and Redis. |
| Lint/typecheck/build | Web lint, TypeScript check, and isolated production build passed. |
| Browser | Managed agent-browser 0.33.0: authenticated empty passkey card inspected at desktop and 320×700; both Add controls present, no clipping in card, no page errors or unexpected failed auth requests. Desktop and narrow full-page captures recorded below. |
| Documentation/user-flow | `pnpm docs:user-flows:check` passed for 10 guides; `pnpm user-flow:e2e -- check` passed for all three affected guides. |

## Outcome and evidence

- Changes made: Direct one-click WebAuthn enrollment from both designed Add actions; generic collision-free default names without fabricated device labels; centered empty state; divided credential rows with known created/last-used metadata; accessible secondary rename dialog; named two-paragraph revoke confirmation; localized pending/error/recent-auth recovery, and all four locale catalogs.
- Commands and results: `pnpm --filter @languon/web exec vitest run tests/profile-page.test.tsx tests/i18n.test.ts` (15 passed); `pnpm --filter @languon/web exec playwright test tests/e2e/auth.journeys.spec.ts tests/e2e/profile.journeys.spec.ts --reporter=dot` with disposable loopback DB/Redis and origins 3100/4100 (5 passed); web lint/typecheck/build passed; `pnpm browser:check` passed; guide check commands passed; `git diff --check` passed. Exact-named containers `languon-passkey-design-postgres` and `languon-passkey-design-redis` were stopped and auto-removed after verification.
- Browser evidence: task session `languon-pk-design-8b33e13dd25c7b27d117329a61f45de5` against local web 3333/backend 4000 with synthetic `passkey-design-check-20260915@example.test`; desktop `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789469868955.png`, 320px `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789469892233.png`. Console had only development/HMR info; `errors` empty; network showed expected initial unauthenticated refresh 401 and successful synthetic signup/verification/passkey list. Session closed.
- Documentation: updated `user-authentication`, `profile-account-controls`, and `magic-profile-page` guides, their E2E revision markers and direct-enrollment test behavior.
- Review: No material finding in the passkey execution path. A stale refresh fixture caused an order-dependent username test failure; its mock now reflects the current signed-in identity and the full focused suite passes. No backend, auth policy, API, persistence, dependency, or user-owned design asset was changed by this improvement. Build-generated `next-env.d.ts` drift was restored. Rollback is the focused frontend/test/guide patch; no migration required.

## Remaining risks

- The real backend exposes no device type/label, so prototype device strings are intentionally omitted. The managed browser inspected the empty, not populated, visual state; the populated list and credential lifecycle were exercised by the virtual-authenticator Playwright journey and focused component test.
- The synthetic browser-verification account remains in the existing local development database; shared local data was not purged. Disposable E2E data was removed with its exact-named containers.
