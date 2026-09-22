# ExecPlan: Web internationalization and language switcher

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-14

## Goal

Give web users fully SSR-compatible English, Russian, French, and Spanish
experiences with an always-available language selector and locale-safe
authentication navigation on unchanged product URLs.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `apps/web` uses Next.js 16.3 App Router with thin routes and pages-first FSD.
- The root layout currently composes `AuthProvider`; all routes and component
  copy are English and unprefixed.
- Current Next.js request APIs expose cookies and `Accept-Language` to the root
  layout and deliberately opt localized routes into request rendering.
- Authentication client components own links and router transitions; language
  selection must leave those existing paths untouched.
- Existing accepted ADR-0005 requires the header/widget/feature/shared layer
  split and component-folder/CSS-Module conventions.
- The authentication guide maps to Playwright and its paths must remain stable.
- No localization package or established repository pattern exists.

## Acceptance criteria

- [x] AC-1 — Existing routes SSR matching content and document language.
- [x] AC-2 — Cookie/Accept-Language/default negotiation is allowlisted.
- [x] AC-3 — Global accessible selector leaves path and query unchanged.
- [x] AC-4 — Locale choice persists.
- [x] AC-5 — Current web component/metadata copy uses catalogs.
- [x] AC-6 — Authentication navigation and URLs remain unchanged.
- [x] AC-7 — Tests, guides, browser evidence, and review are complete.

## Test strategy

- Unit: required for locale negotiation/interpolation and selector/component
  behavior.
- Integration: required through Next build plus Playwright SSR/navigation
  journeys; no backend contract changes.
- Contract: not required because public API schemas do not change.
- E2E: required for SSR locale routing and language switch persistence, plus the
  affected existing authentication journeys.
- Browser/device: required at wide and narrow viewports for selector placement,
  keyboard interaction, localized content, console, and network state.
- Database migration: not applicable; locale persistence is a non-sensitive
  cookie only.
- User-flow guide: create `docs/user-flows/web-i18n-support.md`; update
  `docs/user-flows/user-authentication.md`.
- User-flow E2E: `ssr-locale-routing` and `language-switch-persistence` in
  `apps/web/tests/e2e/i18n.journeys.spec.ts`, mapped to `web-playwright`;
  inspect and rerun all existing authentication guide scenarios.

## User-flow documentation

- Create `docs/user-flows/web-i18n-support.md` and map the two localization
  scenarios to `apps/web/tests/e2e/i18n.journeys.spec.ts`.
- Update `docs/user-flows/user-authentication.md`, inspect its current mapping,
  review every scenario in `apps/web/tests/e2e/auth.journeys.spec.ts`, and run
  the registered `web-playwright` command against disposable infrastructure.
- Verify request-language SSR, cookie precedence, selector refresh, unchanged
  URL/query, persistence, and unsupported-locale fallback.

## Milestones

- [x] M1 — Exploration and localization architecture
    - Objective: map UI copy, current routing, Next 16 guidance, FSD boundaries,
      existing tests, and affected guides.
    - Components: app routes/layout, shared i18n, auth feature, pages, E2E/docs.
    - Acceptance criteria: design coverage for AC-1 through AC-7.
    - Required tests: planned by layer above.
    - Evidence: repository inspection, superseded ADR-0006, and accepted
      ADR-0007 after the product URL decision.
- [x] M2 — SSR locale foundation and language selector
    - Objective: implement request locale resolution, catalogs, providers,
      localized metadata, global header, persistence, and focused tests.
    - Components: root app layout/routes, `fsd/shared/i18n`,
      `fsd/features/change-locale`, and `fsd/widgets/site-header`.
    - Acceptance criteria: AC-1 through AC-4.
    - Required tests: unit, typecheck, lint, build.
    - Evidence: request-rendered build, locale/selector unit tests, and mapped
      JavaScript-disabled SSR browser coverage passed.
- [x] M3 — Localize current web UI and preserve auth journeys
    - Objective: replace component literals with catalog calls and make every
      internal route transition locale-aware.
    - Components: auth feature, FSD pages, web tests.
    - Acceptance criteria: AC-5 and AC-6.
    - Required tests: component tests and affected workspace suite.
    - Evidence: typed catalog parity, 42 web tests, unchanged-route assertions,
      and all three existing authentication Playwright journeys passed.
- [x] M4 — Guides, E2E, browser verification, review, and completion
    - Objective: prove real behavior and remediate independent findings.
    - Components: user-flow guides, Playwright, evidence/review artifacts.
    - Acceptance criteria: AC-7 and final validation of all criteria.
    - Required tests: mapped E2E, docs checks, browser session, lint,
      typecheck, tests, build, independent tester and reviewer.
    - Evidence: both guides and mappings validated; focused i18n E2E passed 2/2;
      wide/narrow browser acceptance passed; independent test and review findings
      were recorded and remediated.

## Progress

- 2026-08-14 — Feature classified, branch/artifacts created, instructions,
  Next 16 docs, current UI, tests, guides, architecture, and ADRs inspected.
- 2026-08-14 — Current work: M2 locale foundation. Next: add catalogs, routing,
  provider, header, and focused tests.
- 2026-08-14 — Product owner rejected locale-prefixed routes. Removed the
  in-progress proxy/dynamic-segment design and revised implementation, specs,
  tests, guides, and architecture to stable URLs with cookie/header SSR.
- 2026-08-14 — Completed M2-M4, including all web copy and metadata, cookie and
  request-header negotiation, unchanged authentication routes, mapped E2E, and
  wide/narrow browser acceptance.
- 2026-08-14 — Independent review findings for stale locale-sensitive messages,
  default-English not-found behavior, and uncatalogued language autonyms were
  remediated with focused regression coverage.

## Decisions

- D-1 — Stable URL request-locale contract and negotiation.
    - Context: SSR needs a locale before rendering, while the product owner
      requires language-independent paths with no locale redirects.
    - Choice: keep every URL unchanged; select the allowlisted locale from the
      cookie, then `Accept-Language`, then English; refresh the current route
      after manual selection.
    - Alternatives rejected: locale-prefixed paths (explicitly rejected by the
      product owner), client-only state (SSR failure), and account-only storage
      (does not work for signed-out users).
    - ADR impact: ADR-0006 superseded; Accepted ADR-0007.
- D-2 — Repository-owned typed catalogs.
    - Context: no i18n dependency exists and current Next guidance supports
      server-loaded dictionaries directly.
    - Choice: flattened, type-checked TypeScript catalogs with a small
      interpolation function and React provider; only the selected catalog is
      passed into the rendered tree.
    - Alternatives rejected: new runtime package before its added complexity is
      justified; ad hoc props and string maps in each feature.
    - ADR impact: Accepted ADR-0007.

## Discoveries

- Existing auth API error messages are English transport detail. Components
  must map known error codes/browser failures to catalog keys instead of showing
  those details as the localized primary copy.
- Reading request cookies/headers opts the localized web routes into dynamic
  request rendering; this is intentional so one stable URL can SSR languages.

## Validation

| Check              | Status         | Evidence                                                                         |
| ------------------ | -------------- | -------------------------------------------------------------------------------- |
| Unit               | Passed         | 7 web files, 42 tests                                                            |
| Integration        | Passed         | Next production build and request-rendered route table                           |
| Contract           | Not applicable | No public API change                                                             |
| E2E                | Passed         | 3 auth journeys plus final focused 2/2 i18n journeys                             |
| Browser/device     | Passed         | Chromium at 1440×900 and 390×844; no browser errors                              |
| Typecheck          | Passed         | Web-focused and repository `pnpm check`                                          |
| Lint               | Passed         | Canonical root `pnpm lint` and repository `pnpm check`                           |
| Build              | Passed         | Web-focused and repository builds                                                |
| Database migration | Not applicable | No persistence change                                                            |
| User-flow guide    | Passed         | `pnpm docs:user-flows:check`                                                     |
| User-flow E2E      | Passed         | Both i18n and authentication mappings validated                                  |
| Independent review | Passed         | Tester passed; reviewer findings remediated and re-reviewed                      |
| Security review    | Not applicable | Allowlisted non-sensitive locale cookie; no auth policy or trust-boundary change |

## Remaining work

- None. Translation nuance remains a documented non-blocking product-review risk.
