# Faithful Magic Patterns UI kit and auth implementation

Status: Complete
Owner: Codex
Created: 2026-09-14

## Problem

The prior auth redesign approximated the supplied Magic Patterns sources and therefore rendered with materially different tokens, typography, composition, and component states.

## Desired behavior

The web runtime uses the current Magic Patterns Languon design-system tokens and faithful auth composition while preserving the real Next.js routes, localized copy, capability gating, and authentication API behavior.

## Acceptance criteria

- [x] AC-1 — Runtime CSS exposes the complete supplied color, spacing, sizing, radius, elevation, motion, typography, and learning-semantic tokens with exact values and dark mappings.
- [x] AC-2 — Tailwind v3 maps the Magic token contract and the web UI uses Inter and Lucide as specified.
- [x] AC-3 — Login, signup, recovery, reset, and verification routes use the supplied responsive auth shell/card hierarchy at mobile and desktop widths.
- [x] AC-4 — Shared controls used by auth reproduce the supplied sizes, radii, colors, focus, disabled, loading, and icon treatments without retaining the replaced visual kit.
- [x] AC-5 — Real auth contracts, localization, return paths, capability gating, passkeys, validation, and error states continue to work; prototype mocks and unsupported OAuth/role/consent behavior are absent.
- [x] AC-6 — Automated, E2E-traceability, build, browser, and independent-review evidence is complete.

## Scope

### In scope

- Magic Patterns design-system tokens and Tailwind mapping.
- The complete user-facing Magic Patterns component catalog, adapted as app-local shared primitives with public exports and stories while preserving compatibility for existing consumers.
- All existing public auth routes and responsive states.
- User-flow source mapping and verification evidence.

### Out of scope

- OAuth providers, account roles, terms acceptance, remembered-login controls, and Magic mock/simulation code.
- Page-by-page redesign of authenticated dictionary screens; they consume the new token and component contracts safely but remain a later redesign stage.

## Constraints and risks

- The supplied design is authoritative for presentation; repository auth/security contracts remain authoritative for behavior.
- No design-tool writes and no prototype instructions or mock data are executed.
- Existing CSS Module consumers use temporary `--sys-*` aliases mapped onto the one Magic token source.

## User-flow documentation

- Required: Assess whether this feature has an executable browser, API, mobile,
  admin, CLI, or system journey.
- Guide: existing `docs/user-flows/user-authentication.md` remains the canonical journey and gains this feature source path.
- Related guides: `docs/user-flows/web-i18n-support.md` (localized auth rendering is preserved; no behavior change).
- E2E synchronization: existing `user-authentication` scenarios in `apps/web/tests/e2e/auth.journeys.spec.ts` remain applicable.

## Open decisions

- None. The user explicitly chose the supplied Magic design and authorized Tailwind when required.
