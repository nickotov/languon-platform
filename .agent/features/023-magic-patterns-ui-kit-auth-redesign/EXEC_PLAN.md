# ExecPlan: Magic Patterns UI kit and auth redesign

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-14

## Goal

Give web users one Magic-derived, accessible runtime UI kit and a clear,
responsive auth experience without changing any real authentication semantics.

## Specification

- In scope: token and existing shared-primitive visual replacement, auth-route
  composition, stories/tests, affected guides, E2E, browser verification.
- Out of scope: authenticated-page redesign, speculative learning components,
  unsupported auth capabilities, backend/API/database changes, new UI runtime
  dependencies. See `FEATURE.md` for the complete boundary.

## Existing architecture

- Next.js 16 App Router under `apps/web`, with pages-first FSD boundaries.
- Shared runtime primitives live under `apps/web/src/fsd/shared/ui`, use CSS
  Modules and Storybook, and are exported by the local barrel.
- Semantic `--sys-*` tokens in `apps/web/src/app/globals.css` are consumed by
  current pages and preserve SSR `data-theme` plus Light/Dark/System cookies.
- Auth components in `apps/web/src/fsd/features/auth` call real contract clients,
  capability gates, safe-return utilities, WebAuthn helpers, and i18n messages.
- Accepted ADR-0005 requires the FSD/shared-UI seam; ADR-0016 makes runtime
  contracts and accessible behavior authoritative over external design input.
- Magic Patterns design system `ds-079806f1-e593-4a64-8818-e922e2f7314d`
  provides neutral/indigo tokens and domain-neutral component visual intent.
  Auth artifact `67207db3-04f0-4e8a-b08c-3227838d792b` provides split desktop
  and compact mobile composition. Its Tailwind/Vite mocks are not implementation
  inputs.

## Acceptance criteria

- [x] AC-1 — Replace the old visual/token system completely.
- [x] AC-2 — Reimplement shared primitives in place without behavior regressions.
- [x] AC-3 — Deliver responsive Magic-derived auth composition.
- [x] AC-4 — Preserve all current auth contracts and journeys.
- [x] AC-5 — Exclude unsupported prototype capabilities and claims.
- [x] AC-6 — Preserve localization and accessibility across all auth states.
- [x] AC-7 — Pass automated, Storybook, E2E, and browser verification.

## Test strategy

- Unit: required for changed primitive and auth rendering/state behavior; reuse
  and extend existing Vitest/Testing Library coverage.
- Integration: existing frontend API-client/auth integration coverage required;
  no backend code changes, so no new backend integration layer is planned.
- Contract: existing shared auth contract compilation required; no contract
  schema changes.
- E2E: required for all mapped `user-authentication` and `web-ui-kit` scenarios
  because both observable browser journeys are affected.
- Browser/device: required at 320 px, ordinary mobile, and desktop; light/dark,
  keyboard/focus, validation, capability unavailable, console, and network
  states are in scope. Inspect at 200% zoom where supported.
- Storybook: build required; updated stories must expose material primitive
  states and themes for review.
- Database migration: not applicable; no persistence or backend change.
- User-flow guide: update `web-ui-kit.md` and `user-authentication.md`; no new
  guide because no new journey is introduced.
- User-flow E2E: `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts`; the three current auth scenarios
  in `apps/web/tests/e2e/auth.journeys.spec.ts`; mapped command is
  `pnpm --filter @languon/web test:e2e`.

## Milestones

- [x] M1 — Runtime kit foundation
    - Objective: replace semantic tokens and primitive visuals in place.
    - Components: globals, fonts, shared UI CSS/TSX/stories and public barrel.
    - Acceptance criteria: AC-1, AC-2.
    - Required tests: focused UI tests, Storybook build, typecheck/lint.
    - Evidence: new tokens, Logo, primitive styling/aliases, 134 tests,
      Storybook/typecheck/lint/build pass; see `EVIDENCE.md`.
- [x] M2 — Auth redesign
    - Objective: adapt the supplied auth hierarchy to all existing real flows.
    - Components: auth shell/forms/styles, i18n messages, route compositions.
    - Acceptance criteria: AC-3 through AC-6.
    - Required tests: focused auth tests and existing integration coverage.
    - Evidence: all five routes use the split/compact shell; mapped auth E2E and
      responsive browser verification pass; see `EVIDENCE.md`.
- [x] M3 — Journey synchronization and browser acceptance
    - Objective: prove the redesigned kit/auth across mapped journeys and real
      responsive/theme states.
    - Components: guides, E2E markers/assertions, browser evidence.
    - Acceptance criteria: AC-7.
    - Required tests: docs/traceability checks, mapped Playwright, browser QA.
    - Evidence: both guide checks, four mapped Playwright journeys, and
      light/dark responsive browser inspection pass; see `EVIDENCE.md`.
- [x] M4 — Independent review, remediation, and integration
    - Objective: resolve material findings, complete records, and squash-merge.
    - Components: full feature diff and verification artifacts.
    - Acceptance criteria: AC-1 through AC-7.
    - Required tests: affected checks after remediation/conflict resolution.
    - Evidence: independent reviewer approved after all findings were fixed;
      tester/security audits complete; final affected checks pass.

## Progress

- 2026-09-14 — User explicitly authorized the full feature lifecycle.
- 2026-09-14 — Created `feature/magic-patterns-ui-kit-auth-redesign` from clean
  `main`; fetched and inspected the supplied Magic design-system and auth files.
- 2026-09-14 — Audited the real auth routes/contracts and mapped existing
  `web-ui-kit` and `user-authentication` guide scenarios.
- 2026-09-14 — Completed independent architecture and product-scope discovery.
- 2026-09-14 — Completed M1–M3. Unit/integration, typecheck, lint, production
  build, Storybook, guides, four mapped E2E scenarios, and browser QA pass.
- 2026-09-14 — Diagnosed the broader E2E attempt: later unrelated dictionary
  tests exhaust the shared signup IP rate limit; exact affected scenarios pass
  with a fresh namespace.
- 2026-09-14 — Fixed reviewer findings for canonical size aliases, 44px linked
  targets, and document heading order; added final geometry and preference-media
  checks and restored generated build drift.
- 2026-09-14 — Independent reviewer verdict Approved; security review found no
  material issue; tester confirmed proportional coverage and the unrelated
  full-suite rate-limit harness limitation.
- Current: feature implementation and verification complete.
- Next: create the authorized feature commit and squash-merge to `main`.

## Decisions

### D-1 — Replace the kit in place

- Context: Existing primitives have broad non-auth usage and mature accessible
  behavior; a parallel kit would leave two sources of truth.
- Choice and rationale: retain the shared/UI public seam and deep behavior, but
  replace old tokens and visual implementation. Temporary aliases may bridge
  later page migrations inside this one kit.
- Alternatives rejected: hard-delete all APIs (breaks untouched pages); add
  `ui-v2` (duplicates the kit and contradicts removal).
- ADR impact: Not ADR-worthy; follows ADR-0005 and ADR-0016.

### D-2 — Port semantic intent, not prototype scaffolding

- Context: Magic uses Tailwind, Framer Motion, Lucide, mock data, and some
  hard-coded values that conflict with its own rules.
- Choice and rationale: translate the approved visual intent into current CSS
  Modules, semantic `--sys-*` tokens, native controls, and existing accessible
  overlays. Add no new runtime framework/dependency.
- Alternatives rejected: verbatim prototype copy; runtime Magic dependency.
- ADR impact: Not ADR-worthy.

### D-3 — Defer domain-specific specimen components

- Context: Exercise, tutor-message, vocabulary, lesson, streak, review, locked,
  and audio examples need real product state and belong above `shared/ui`.
- Choice and rationale: implement those with their owning page redesigns; this
  feature ports the complete domain-neutral runtime foundation used now.
- Alternatives rejected: speculative generic exports with fake contracts.
- ADR impact: Not ADR-worthy; preserves FSD ownership.

### D-4 — Preserve real auth semantics

- Context: Prototype OAuth, role, legal, remember-me, and link-only flows have no
  corresponding product/backend contracts and conflict with current behavior.
- Choice and rationale: use only the prototype's composition and visual
  hierarchy while retaining all current code-based flows, capability gates,
  redirects, sessions, errors, and localization.
- Alternatives rejected: inert affordances or implicit backend/product changes.
- ADR impact: Not ADR-worthy.

### D-5 — Use the existing local sans font fallback

- Context: Magic specifies Inter, but adding exact local Inter requires a new
  production dependency; remote font imports are inappropriate.
- Choice and rationale: map the new system to the existing locally bundled
  Manrope/system sans stack and remove serif display usage. Typography metrics
  remain close without expanding dependency scope.
- Alternatives rejected: remote Google import; unapproved package addition.
- ADR impact: Not ADR-worthy.

## Discoveries

- Magic compact controls can be 36 px, while the runtime contract requires a
  44 px touch target; compact controls must retain an adequate hit area.
- Prototype password rules (10 characters/classes) conflict with the real
  15–128 Unicode policy plus common-password rejection.
- OAuth, role selection, terms consent, remember-me, link-only verification,
  and fake signed-in states are design-only and cannot be exposed truthfully.
- Current guide-to-E2E traceability was synchronized before implementation.

## Validation

| Check              | Status          | Evidence                                   |
| ------------------ | --------------- | ------------------------------------------ |
| Unit               | Passed          | 21 files, 134 tests.                       |
| Integration        | Passed          | Auth/API/UI tests and mapped journeys.     |
| Contract           | Passed          | Web typecheck; no contract change.         |
| E2E                | Passed (mapped) | 4/4 affected scenarios.                    |
| Browser/device     | Passed          | 320, 390 dark, 1440; all auth routes.      |
| Typecheck          | Passed          | Web workspace typecheck.                   |
| Lint               | Passed          | Web workspace lint.                        |
| Build              | Passed          | Web production build.                      |
| Storybook build    | Passed          | Static catalog build.                      |
| Database migration | Not applicable  | No persistence change.                     |
| User-flow guide    | Passed          | Both guides and all docs checks.           |
| User-flow E2E      | Passed          | Four existing mapped scenarios.            |
| Independent review | Passed          | Approved after all findings were resolved. |
| Security review    | Passed          | No material findings.                      |

## Remaining work

- Commit and squash-merge the completed feature.
- Keep later page redesign compatibility aliases documented until callers are
  migrated; do not claim their removal in this feature.
