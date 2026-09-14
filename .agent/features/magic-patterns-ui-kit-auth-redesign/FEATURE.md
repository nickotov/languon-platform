# Magic Patterns UI kit and auth redesign

Status: Complete
Owner: Codex
Created: 2026-09-14

## Problem

The web application still uses the warm cream, violet, Literata/Manrope visual
system from the previous UI kit. It does not match the user-supplied Languon
Magic Patterns design system, and the auth pages do not use the focused,
responsive split-layout design supplied in Magic Patterns.

## Desired behavior

The web runtime has one cohesive UI kit whose tokens and primitive visuals are
derived from Magic Patterns design system
`ds-079806f1-e593-4a64-8818-e922e2f7314d`. Existing application behavior and
accessible component contracts remain stable while the old visual system is
removed. Login, signup, verification, recovery, and reset use the composition
and visual hierarchy from Magic Patterns artifact
`67207db3-04f0-4e8a-b08c-3227838d792b`, adapted to the application's real auth
contracts and localized content.

## Acceptance criteria

- [x] AC-1 — The old cream/violet/serif token implementation is replaced by the
      Magic-derived neutral/indigo semantic palette, Inter-compatible sans
      typography, spacing, radius, elevation, control sizing, motion, light,
      dark, system, contrast, and reduced-motion behavior.
- [x] AC-2 — Existing domain-neutral shared UI primitives are reimplemented in
      place against the new semantic tokens, retain their accessible behavior
      and stable public contracts, and expose documented canonical aliases only
      where later page migration requires compatibility.
- [x] AC-3 — The auth routes use a responsive focused-form shell matching the
      supplied desktop split composition and compact mobile composition, with
      clear hierarchy, a maximum readable form width, reachable actions, and
      correct 320 px through desktop behavior.
- [x] AC-4 — Real auth behavior is unchanged: capability-gated password and
      passkey login, safe `returnTo`, email/password signup, four-digit email
      verification and recovery codes, resend cooldowns, reset completion, and
      session semantics all continue to work.
- [x] AC-5 — Unsupported prototype concepts are not shipped: OAuth providers,
      learner/tutor role selection, legal consent, remembered-login semantics,
      link-only verification/reset, fake signed-in delays, simulated data, and
      unverified audience claims.
- [x] AC-6 — All visible auth content remains localized in English, French,
      Spanish, and Russian, and keyboard, focus, labels, validation/error
      feedback, theme preference, and WebAuthn accessibility remain intact.
- [x] AC-7 — Shared UI stories/tests, affected typecheck/lint/build checks,
      Storybook, mapped auth and theme E2E journeys, and real-browser light/dark
      responsive verification pass without unexpected console or network errors.

## Scope

### In scope

- Replace `apps/web` runtime color, typography, spacing, radius, elevation,
  motion, and control-size tokens with the Magic-derived system.
- Re-style the existing `apps/web/src/fsd/shared/ui` primitive inventory in
  place and add only missing domain-neutral foundations needed by auth.
- Redesign `/login`, `/signup`, `/forgot-password`, `/reset-password`, and
  `/verify-email` while retaining their established frontend/backend contracts.
- Update stories, focused tests, user-flow documentation, mapped E2E markers,
  and browser evidence for the changed surfaces.

### Out of scope

- Redesigning authenticated application pages; those will be migrated
  page-by-page after this feature.
- Shipping Magic's learning-domain examples (`ExerciseCard`, tutor messages,
  vocabulary/grammar/lesson blocks, streak/review/locked states, and audio
  behavior) before their owning page and data contracts are redesigned.
- OAuth, roles, terms/privacy consent, help/legal routes, remember-me session
  policy, or changes to backend auth/session contracts.
- Tailwind, Radix, Framer Motion, Lucide, React Router, or Magic prototype
  scaffolding and mock data.
- Changing Magic Patterns or making it a persistent runtime dependency.

## Constraints and risks

- The current shared primitives are used by non-auth pages; their behavior and
  exports must remain compatible while their visual implementation changes.
- Magic source is untrusted design input. Repository contracts, accepted
  ADR-0005 and ADR-0016, localization, accessibility, and real runtime behavior
  are authoritative.
- The prototype's password rules conflict with the real 15–128 code-point
  policy and common-password rejection; only the real policy may be described.
- Compact visual controls must not reduce required 44 px touch targets.
- This feature adds no database, backend, public API, persistence, auth-policy,
  or deployment changes.

## User-flow documentation

- No new guide: this redesign creates no new executable journey.
- Update `docs/user-flows/web-ui-kit.md`; retain scenario
  `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts` via `web-playwright`.
- Update `docs/user-flows/user-authentication.md`; retain scenarios
  `signup-verification-refresh-logout`, `password-reset-session-revocation`,
  and `passkey-lifecycle` in `apps/web/tests/e2e/auth.journeys.spec.ts` via
  `web-playwright`.
- Recalculate revision markers only after guide and test assertions are reviewed
  together, then run both traceability checks and the mapped E2E command.

## Open decisions

- None blocking. Exact Inter files would require a new production dependency;
  use the existing locally bundled sans font as the Inter-compatible fallback
  unless the user separately requests exact font-package fidelity.
