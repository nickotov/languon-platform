# Improvement: Authenticated app shell Magic Patterns design

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: implement the user-selected Magic Patterns authenticated app
  shell, responsive sidebar/drawer, and dictionaries-library layout with real
  Languon data and actions.
- Why this is an improvement rather than a correction: it is a cohesive visual
  and interaction enhancement spanning shared authenticated chrome and an
  established page, while preserving existing product capabilities.
- Explicit-feature check: the user requested implementation of a design, not a
  new product feature or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public
  contract, persistence, security/auth policy, production dependency,
  deployment, migration, or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit
  feature authorization before crossing any feature boundary.

## Context and scope

- Current behavior: dictionary routes use a fixed dictionary-only desktop bar
  and mobile bottom navigation; authenticated profile uses the general header.
  The dictionary library uses a dense row treatment and page-specific offsets.
- Expected behavior: every authenticated dictionary/profile route uses the
  selected stable desktop sidebar or mobile drawer/top bar, and the dictionary
  library matches the selected card-grid composition without changing its real
  lifecycle, search, create, deletion, or pagination contracts.
- In scope: authenticated shell, active dictionary navigation, create dialog
  entry, account menu, locale/theme/sign-out controls, desktop rail preference,
  mobile focus/dismissal behavior, dictionary library composition, focused tests,
  affected user-flow documentation, and real-browser verification.
- Out of scope: public/auth/shared-reader chrome redesign; backend changes; new
  dictionary/account capabilities; replacement of existing profile or dictionary
  editor bodies beyond fitting them into the shared shell.
- Likely files/surfaces: `apps/web/src/app/layout.tsx`, a new/renamed app-shell
  widget, dictionary-library feature UI/styles, i18n catalogs, focused web tests,
  mapped user-flow guides/tests, and the versioned design handoff.
- Relevant ADRs or constraints: ADR-0005, ADR-0006, ADR-0016, ADR-0017;
  `.agent/DESIGN_HANDOFF.md`; web FSD and Next 16.3 layout/client boundaries.
- Related user-flow guides: `dictionary-platform`, `magic-profile-page`,
  `profile-account-controls`, `web-i18n-support`, and `web-ui-kit`.
- Rollback/removal path: restore the prior `SiteHeader` route-specific chrome and
  dictionary-library CSS/composition; no persisted data or migration rollback.

## Acceptance criteria

- AC-1 — Signed-in dictionary and profile pages render the selected 240 px
  desktop sidebar, or a 72 px icon rail whose preference persists across
  authenticated navigation; public, auth, and shared-reader pages retain the
  existing global header.
- AC-2 — The Dictionaries disclosure lists real active dictionaries with current
  route indication and loading/empty/error/retry states; its overview and create
  controls remain separate and use real routes/dialog behavior.
- AC-3 — The pinned account area exposes real Profile, locale, System/Light/Dark,
  and sign-out controls with pending state in expanded, rail, and drawer layouts.
- AC-4 — Below 1024 px the authenticated shell uses the selected sticky top bar
  and modal drawer, including outside/Escape close, focus containment/restoration,
  scroll locking, and close-on-navigation.
- AC-5 — The Dictionaries page matches the selected spacious header, segmented
  lifecycle filters, right-aligned search, and responsive 1/2/3-column card grid,
  while retaining real loading, empty, error, pagination, archive/restore,
  selection/deletion, and long-content behavior.
- AC-6 — Existing dictionary editor and profile bodies keep their real product
  behavior and render correctly within the shared shell at desktop and 320 px,
  in light/dark themes and supported locales.
- AC-7 — Focused automated coverage, mapped-guide traceability, and real-browser
  evidence cover navigation, responsive behavior, overlays, preferences, sign
  out, and representative dictionary-list states without console/runtime errors.

## Supplied-design fidelity inventory

Source: Magic Patterns editor
`https://www.magicpatterns.com/c/wrzxpfxkdo2dh12pny9hpg`, selected v001;
active artifact `79d453fa-96ca-42a5-9597-e4a49fc67962`, inspected 2026-09-28.

| ID    | Source requirement/state                                                                                                                                        | Local owner                                   | Verification                                                               | Disposition                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| UI-01 | Authenticated-only shell; 240 px sidebar and 72 px rail; 64 px brand row; stable content offset                                                                 | App-shell widget and root layout              | Desktop dictionary/profile browser comparison                              | Required                                                                         |
| UI-02 | Separate Dictionaries disclosure, overview link, create action, active indicator, compact two-line active dictionary rows                                       | App-shell navigation components               | Component tests and populated/current-route browser state                  | Required; real API replaces mocks                                                |
| UI-03 | Dictionary-nav loading skeleton, empty CTA, recoverable error/retry, long bounded list                                                                          | App-shell dictionary query/view               | Focused tests plus representative browser states where safely reproducible | Required                                                                         |
| UI-04 | Bottom-pinned identity and menu with Profile, locale select, three-way theme control, pending sign out; menu opens right from rail                              | App-shell account components                  | Component/browser interaction in expanded and rail states                  | Required; real session values/actions replace mock user                          |
| UI-05 | Sticky 64 px mobile bar and 304 px modal drawer with scrim, focus trap/restore, Escape/outside close and scroll lock                                            | App-shell mobile components                   | 320 px browser keyboard and interaction check                              | Required                                                                         |
| UI-06 | Dictionary library: editorial header, primary New dictionary action, segmented filters, search, responsive outlined cards, loading/error/empty/no-result states | Dictionary-library feature                    | Focused tests and wide/narrow populated browser comparison                 | Required; existing deletion/pagination behavior retained                         |
| UI-07 | Existing dictionary detail and profile compositions sit within the same chrome                                                                                  | Existing page/widget owners plus shell layout | Navigate among library/detail/profile at wide/narrow sizes                 | Required; existing richer product bodies remain authoritative                    |
| UI-08 | Light/dark semantic tokens, Inter, restrained borders/radii, logical properties, long names/locales, reduced motion, visible focus                              | Runtime tokens and shell/library CSS          | Dark/light, Russian/English, keyboard, 320 px and desktop browser checks   | Required                                                                         |
| UI-09 | Source create dialog is simplified prototype behavior                                                                                                           | Existing dictionary create feature            | Existing component/E2E coverage via sidebar entry                          | Adapted: reuse full real dialog including description and catalog/error behavior |

## Test strategy

- Focused component tests: authenticated/public chrome routing, disclosure/rail
  persistence, mobile drawer semantics, account preferences/sign-out, dictionary
  states, and library card-grid behavior using existing request mocks.
- Affected web test suite, typecheck, app lint, and production build.
- Mapped user-flow inspection/checks for every guide whose observable behavior or
  source mapping changes; update E2E assertions/markers only when behavior text
  changes.
- Real browser: signed-in desktop expanded/rail/account menu, dictionary library
  and editor navigation, profile, dark theme, and 320 px drawer interaction.
- No database/security specialist verification: contracts and policies do not change.

## Plan

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage.
- [x] Run targeted validation and affected mapped checks.
- [x] Update affected documentation and handoff evidence.
- [x] Complete real-browser verification and fidelity comparison.
- [x] Inspect the final diff and complete risk-based review.

## Verification

| Check                    | Result                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | `pnpm --filter @languon/web test` — 30 files, 234 tests passed; focused shell/dialog/profile/library run — 4 files, 46 tests passed                 |
| Lint/typecheck/build     | Web lint, TypeScript typecheck, and production Next.js build passed                                                                                 |
| Runtime/browser/database | Two affected Playwright journeys passed against disposable PostgreSQL/Redis; managed Chrome 152 browser verification passed; no persistence changes |
| Documentation/user-flow  | All 14 guides validated; `magic-profile-page`, `profile-account-controls`, and `dictionary-platform` mappings and revision markers passed           |

## Outcome and evidence

- Changes made: introduced the authenticated app-shell widget with real active
  dictionary navigation, expanded/rail/drawer variants, a pinned account menu,
  responsive page offsets, and the selected dictionary-library card grid. Public,
  authentication, and shared-reader routes retain the standalone site header.
- Integration fixes from verification: closed shared dialogs now leave no hidden
  form controls in the accessibility tree; page create/archive/restore mutations
  invalidate sidebar navigation; crossing the desktop/mobile breakpoint dismisses
  an open account popover; the editor's fixed Add card control tracks rail width.
- Automated journeys: the dictionary owner lifecycle and Profile shell journeys
  passed in Chromium against task-owned disposable services. The first run exposed
  duplicate closed-dialog fields; after remediation the dictionary journey passed,
  and the final Profile rerun passed after breakpoint-popover remediation.
- Managed-browser evidence: wrapper 0.33.0 with Chrome 152 at 1280×720 and
  320×800. A synthetic verified account and dictionary exercised the empty
  library, create dialog, populated/current dictionary link, dictionary detail,
  72 px rail persistence, rail account menu, Dark selection, Profile navigation,
  mobile drawer disclosure, inline account controls, Escape dismissal, and focus
  restoration (Enter reopened the drawer). `errors` was empty; console contained
  only React DevTools/HMR development messages; requests stayed on reviewed local
  origins, with the initial signed-out `/auth/refresh` 401 expected.
- Fidelity disposition: UI-01 through UI-09 are implemented. Real product data,
  error handling, session behavior, and full create/profile/editor bodies replace
  the Magic Patterns mock layer as specified by the handoff.
- Documentation: design handoff is marked implemented; the three affected guides
  and their E2E revision markers describe the authenticated shell.
- Review: initial review of the complete `b636752` working-tree diff found no
  remaining material correctness, FSD-boundary, accessibility, performance, or
  test-coverage findings. A separate agent review was not run because delegation
  was unavailable for this task; the risk decision relies on the full web suite,
  two real cross-boundary journeys, managed-browser verification, and final diff
  audit.

## Remaining risks

- The sidebar intentionally fetches every active dictionary in 100-item pages to
  satisfy the all-active navigation requirement; very large personal libraries
  therefore have a bounded visual scroller but a growing client-side list.
- Screenshot artifacts were not retained because the safe browser wrapper rejects
  caller-selected paths; semantic snapshots and interaction evidence were used.
