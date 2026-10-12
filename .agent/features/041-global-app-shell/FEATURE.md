# Global app sidebar and WIP home page

Status: Complete
Owner: Root
Created: 2026-10-12

## Problem and authorization

Root chrome currently selects the sidebar only for signed-in dictionary/profile
routes. User approved feature workflow, guest-only settings, existing mobile drawer,
logo / for everyone, and implementation. Base main 6d56636; initially clean worktree.
Not a backlog task.

## Acceptance criteria

- AC-1 — All normal web pages share stable chrome: desktop expanded sidebar/rail and mobile top bar/drawer, including home, auth, shared reading and not-found. Logo leads to /. Preserve page access checks and fullscreen training.
- AC-2 — Guests have no private navigation, create actions or account identity. Footer has Sign in (/login) and Settings. Bootstrap shows pending identity, not premature Sign in. Private navigation queries require authentication and caches are scoped to user identity.
- AC-3 — Guest Settings offers existing locale and System/Light/Dark preferences in accessible popover, including inside mobile modal. Signed-in account menu remains unchanged in capability, with no extra gear. Preserve dismissal, focus restoration and route/breakpoint behavior.
- AC-4 — Home has only centered semantic WIP heading. Mobile titles reflect routes; page heights no longer reserve an obsolete desktop header.
- AC-5 — Preserve CSS Modules/tokens/FSD, stable locale URLs/cookies/SSR. Narrow ADR successor, synchronized guide/E2E coverage, affected tests/static/build/browser evidence and independent review substantiate completion.

## Scope and constraints

Web shell/footer/preferences/popover portal seam, home/offsets, localization,
tests/docs. No backend/API/schema/dependency/auth-policy change, support button
or completed landing page. Compose existing runtime primitives, not external design.
Preserve navigation loading/empty/error/retry and real create/sign-out behavior.
Footer uses ordinary /login; do not put shared capability keys in new URL queries.

## User-flow documentation

Create docs/user-flows/global-app-shell.md with guest settings/persistence and
session-aware navigation scenarios in tests/e2e/app-shell.journeys.spec.ts.
Related guides: magic-profile-page, web-ui-kit, web-i18n-support, user-authentication.
Preserve scenario identities and actualize assertions/revisions for changed controls.

## Open decisions

None. Desktop sidebar/mobile drawer, guest-only gear, logo /, WIP literal all locales.
