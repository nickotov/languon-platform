# ExecPlan: Magic Patterns profile page and application header

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-14

## Goal

Ship the exact Magic Patterns profile information architecture and application
header using Languon's runtime UI kit, with truthful empty states and inert
coming-soon actions for capabilities that do not exist.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `src/app` delegates page rendering to `src/fsd/pages`; the profile route will
  remain a metadata/routing adapter.
- The root layout owns `SiteHeader`, `ThemeProvider`, `I18nProvider`,
  `AuthProvider`, and `ToastHost`.
- Session identity is held in the existing Zustand session entity and restored
  by the auth provider. Existing passkey/password operations live at `/security`.
- Shared `Logo`, `IconButton`, `Tabs`, `Card`, `Avatar`, `Button`, `Badge`,
  `LoadingState`, `InlineAlert`, and toast APIs cover the visual contract.
- ADR-0005 constrains FSD direction; ADR-0007 protects locale behavior;
  ADR-0016 makes runtime components authoritative; ADR-0017 defines the current
  Magic Patterns/Tailwind design-system integration.

## Acceptance criteria

- [x] AC-1 — Replace the old global header with the Magic top bar and working
  home, locale, and persisted theme controls.
- [x] AC-2 — Add the responsive authenticated `/profile` page and exact four-tab
  settings composition.
- [x] AC-3 — Render only current session identity; keep unsupported datasets
  empty and label them coming soon.
- [x] AC-4 — Mock unsupported actions through accessible informational toasts,
  with no remote or destructive operation.
- [x] AC-5 — Add focused automated, guide/E2E, and browser acceptance evidence.

## Test strategy

- Unit: Required — component tests cover session boundaries, tabs, mocked
  actions, header navigation, and theme changes.
- Integration: Not required — no new server or infrastructure boundary.
- Contract: Not required — no public transport contract changes.
- E2E: Required — the authenticated profile/header journey crosses routing,
  session restore, theme persistence, and visible interactions.
- Browser/device: Required — this is material visual and responsive work.
- Database migration: Not required — no persistence change.
- User-flow guide: Required — `docs/user-flows/magic-profile-page.md`.
- User-flow E2E: Required —
  `profile-empty-coming-soon-and-header-navigation` in
  `apps/web/tests/e2e/profile.journeys.spec.ts`, executed through the reviewed
  disposable environment in `apps/web/tests/e2e/README.md` with
  `pnpm --filter @languon/web exec playwright test tests/e2e/profile.journeys.spec.ts`.

## Milestones

- [x] M1 — Exploration and design
    - Objective: Reconcile the current runtime UI with the exact Magic artifact.
    - Components: shared header, auth shell, session entity, UI primitives,
      profile prototype, accepted ADRs, user-flow tooling.
    - Acceptance criteria: AC-1 through AC-5 specified without fake data.
    - Required tests: focused component, Playwright journey, browser acceptance.
    - Evidence: Magic artifact `c5093f52-facb-4015-9276-9f03bd3331a2` and
      repository sources inspected on 2026-09-14.
- [x] M2 — Implementation and targeted verification
    - Objective: Implement page, header, regression accommodations, and tests.
    - Components: profile page slice, site header/theme feature, auth shell,
      home navigation, messages, unit tests, guide, E2E.
    - Acceptance criteria: AC-1 through AC-4.
    - Required tests: affected web test/typecheck/lint and guide validation.
    - Evidence: Implemented and covered by focused/full web checks.
- [x] M3 — Full validation and review
    - Objective: Verify real rendering, remediate independent review, and merge.
    - Components: browser evidence, tester/reviewer reports, final feature docs.
    - Acceptance criteria: AC-1 through AC-5.
    - Required tests: mapped E2E, desktop/mobile browser, affected build/checks.
    - Evidence: See `EVIDENCE.md` and approved `REVIEW.md`.

## Progress

- 2026-09-14 — Feature authorized; branch and four durable artifacts created.
- 2026-09-14 — Exact Magic artifact, runtime tokens/primitives, FSD architecture,
  session behavior, Next.js 16 routing/CSS guidance, and guide rules inspected.
  Next: implement M2.
- 2026-09-14 — M2 completed with profile route, global header, truthful empty
  states, four locale catalogs, focused tests, and guide/E2E traceability.
- 2026-09-14 — M3 completed after browser/E2E verification and remediation of
  independent i18n, zoom, coverage, command, and generated-file findings.

## Decisions

- D-1 — Truthful placeholder data: use only the real session email/identity and
  explicitly empty all unsupported datasets. Rejected copying prototype fixtures
  because they would falsely represent account and financial state. Not
  ADR-worthy.
- D-2 — Preserve locale access: place the existing selector beside the Magic
  theme icon. Rejected removing it because ADR-0007 and the current UI journey
  require a global selector. Not ADR-worthy.
- D-3 — Existing security remains real: profile security content may link to
  `/security`; it will not duplicate or simulate password/passkey writes. Not
  ADR-worthy.

## Discoveries

- The Magic prototype deliberately contains simulated writes and comprehensive
  fabricated billing fixtures. Those are prototype review aids, not product
  behavior, and conflict with the requested empty-data requirement.

## Validation

| Check              | Status         | Evidence |
| ------------------ | -------------- | -------- |
| Unit               | Pass           | 147 web tests |
| Integration        | Not applicable | No new server boundary |
| Contract           | Not applicable | No public contract change |
| E2E                | Pass           | Profile 1/1; UI-kit 1/1 |
| Browser/device     | Pass           | Desktop/mobile auth and profile journey |
| Typecheck          | Pass           | Web TypeScript check |
| Lint               | Pass           | Web ESLint check |
| Build              | Pass           | Next webpack build; `/profile` emitted |
| Database migration | Not applicable |          |
| User-flow guide    | Pass           | 9 guides validated |
| User-flow E2E      | Pass           | Profile and UI-kit mappings synchronized |
| Independent review | Pass           | Approved after remediation |
| Security review    | Not applicable | No policy, persistence, or external write change |

## Remaining work

- None. Future profile/billing/credit capabilities remain explicitly out of
  scope and are rendered as Coming soon.
