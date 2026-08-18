# ExecPlan: Overlay and Feedback Primitives

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-18

## Goal

Deliver viewport-safe top-layer Popover and Tooltip primitives plus a provider-free
global ToastHost/store API, synchronized with the authoritative design source.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- ADR-0008 keeps primitives app-local under `apps/web/src/fsd/shared/ui`, makes
  `design/` authoritative, and prefers native HTML semantics.
- Popover and Tooltip currently use parent-relative absolute positioning and can
  be clipped or overflow the viewport.
- Tooltip already types `content` as `ReactNode`, but its one-line absolute
  surface does not safely render rich or long content.
- Toast currently owns a local queue through `ToastProvider`/`useToast`; Zustand
  is already a web dependency and the root layout has no notification host.
- `docs/user-flows/web-ui-kit.md` maps all affected source paths; its existing
  theme E2E scenario remains the proportional product-level regression.

## Acceptance criteria

- [x] AC-1 — Design source and runtime contracts are synchronized.
- [x] AC-2 — Native top-layer Popover adaptively flips/shifts and preserves focus
      and dismissal semantics.
- [x] AC-3 — ReactNode Tooltip adaptively flips/shifts and preserves timing and
      accessibility semantics.
- [x] AC-4 — Zustand-backed ToastHost replaces provider/context dispatch without
      regressing queue, lifetime, pause, action, or live-region behavior.
- [x] AC-5 — Stories, tests, browser checks, builds, traceability, and independent
      review pass.

## Test strategy

- Unit: Required — native popover lifecycle, adaptive middleware contract,
  tooltip timing/content, store dispatch/queue/clear, and toast pause behavior.
- Integration: Not required — no remote or cross-package service boundary.
- Contract: Required — public shared UI exports and root host composition compile.
- E2E: Required proportionally — rerun the existing mapped web UI kit journey
  because root application composition changes; no new primitive-only scenario.
- Browser/device: Required — exercise Popover and Tooltip near viewport edges and
  ToastHost queue/action behavior in Storybook at narrow and wide viewports.
- Database migration: Not required — no persistence change.
- User-flow guide: Existing `docs/user-flows/web-ui-kit.md` remains applicable;
  update only if observable commands or outcomes change.
- User-flow E2E: `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts`, command `web-playwright` through
  reviewed disposable infrastructure.

## Milestones

- [x] M1 — Design and public contracts
    - Objective: Specify viewport-aware overlays and host/store notification API.
    - Components: design source, feature state, dependency/API decision.
    - Acceptance criteria: AC-1.
    - Required tests: Pencil JSON/symbol validation.
    - Evidence: `EVIDENCE.md` design validation.
- [x] M2 — Implementation and targeted verification
    - Objective: Replace overlay positioning and toast dispatch implementations.
    - Components: Popover, Tooltip, ToastHost/store, layout, i18n, stories/tests.
    - Acceptance criteria: AC-2 through AC-4.
    - Required tests: focused web component/store tests, typecheck, Storybook.
    - Evidence: `EVIDENCE.md` automated and Storybook results.
- [x] M3 — Full validation and review
    - Objective: Verify real browser edges, mapped regression, builds, and review.
    - Components: all feature changes and durable evidence.
    - Acceptance criteria: AC-1 through AC-5.
    - Required tests: browser, web/full checks, guide checks, mapped E2E, review.
    - Evidence: `EVIDENCE.md` browser, E2E, static, and review results.

## Progress

- 2026-08-18 — Classified as a feature, created branch/artifacts, inspected the
  authoritative design, existing primitives, ADR-0008, root composition, tests,
  and mapped web-ui-kit guide. Next: update design contracts and implementation.
- 2026-08-18 — Updated the written design and all three Pencil symbols; added
  Floating UI and implemented native adaptive overlays plus the Zustand-backed
  ToastHost API. Focused typecheck, lint, and 56 web tests pass. Next: Storybook
  and real-browser boundary verification.
- 2026-08-18 — Completed narrow/wide native-browser verification, mapped E2E,
  repository-wide checks, and independent review. Resolved all material review
  findings and completed the feature.

## Decisions

- D1 — Native top layer plus Floating UI positioning
    - Context: native popovers solve stacking/clipping and dismissal, but do not
      alone provide dependable cross-browser edge-aware anchor placement.
    - Choice and rationale: use native Popover API for lifecycle/top layer and
      Floating UI only for offset/flip/shift/auto-update geometry.
    - Alternatives rejected: parent-relative CSS (clips); a fully custom popover
      (duplicates native semantics); CSS anchor positioning alone (less uniform
      target-browser behavior).
    - ADR impact: Not ADR-worthy; follows ADR-0008 and is local to two primitives.
- D2 — Module-scoped Zustand toast store
    - Context: producers must dispatch without provider coupling.
    - Choice and rationale: expose show/dismiss/clear functions backed by a
      vanilla Zustand store; one ToastHost subscribes in the root layout.
    - Alternatives rejected: context provider (explicitly rejected by user) and
      untyped DOM events (not state-safe or inspectable).
    - ADR impact: Not ADR-worthy; follows established frontend state guidance.

## Discoveries

- The requested components existed, but their first-pass implementations lacked
  the placement and dispatch contracts requested here; this feature replaces
  rather than duplicates them.

## Validation

| Check              | Status         | Evidence             |
| ------------------ | -------------- | -------------------- |
| Unit               | Passed         | 60 web tests         |
| Integration        | Not applicable | No service boundary  |
| Contract           | Passed         | Root typecheck/build |
| E2E                | Passed         | 6 mapped tests       |
| Browser/device     | Passed         | Narrow and wide      |
| Typecheck          | Passed         | Root workspace       |
| Lint               | Passed         | Root workspace       |
| Build              | Passed         | Root + Storybook     |
| Database migration | Not applicable |                      |
| User-flow guide    | Passed         | All mappings valid   |
| User-flow E2E      | Passed         | `web-ui-kit`         |
| Independent review | Approved       | No material findings |
| Security review    | Not applicable | No boundary change   |

## Remaining work

- None.
