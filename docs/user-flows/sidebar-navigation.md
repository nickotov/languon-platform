---
feature: sidebar-navigation
title: Sidebar navigation
status: current
last_verified: 2026-10-21
surfaces:
    - browser
source_paths:
    - .agent/features/050-sidebar-navigation/**
    - apps/web/src/fsd/widgets/app-shell/**
    - apps/web/src/fsd/features/library-navigation/**
    - apps/backend/src/modules/navigation/**
    - packages/contracts/src/navigation.ts
    - apps/backend/tests/support/texts-web-server.ts
    - apps/web/tests/e2e/support/texts-playwright.config.ts
    - apps/web/tests/e2e/sidebar-navigation.journeys.spec.ts
e2e_command: texts
e2e_tests:
    - apps/web/tests/e2e/sidebar-navigation.journeys.spec.ts
e2e_scenarios:
    - owned-title-search-and-synced-navigation
    - responsive-sidebar-and-keyboard-flyouts
related_features:
    - global-app-shell
    - texts
    - contextual-language-assistant-and-knowledge
---

# Sidebar navigation

## What this verifies

The contextual sidebar implements the retained Magic Patterns design with real
owned resources. Search matches titles across the owned library, including
resources beyond the loaded shortcuts and private drafts. Recents record actual
successful opens; personal pins and recents follow the account across devices.
Expanded sections show up to five shortcuts with pins first and the current
resource retained. After genuine opened resources, fill available slots from
owned active resources ordered by their domain update time. These fallback reads
keep `lastOpenedAt` null and do not add global recents. Collapsed icons expose
searchable flyouts. Lessons, Courses
and the source's alternative docked browser are outside this implementation.

## Start the development environment

Use the reviewed disposable Texts harness described in
[Texts](texts.md#start-the-development-environment). It uses PostgreSQL port
55443 with database `languon_auth_texts_ui_web_test`, Redis port 56443 database 1,
web 3335 and API 4005. Exact disposable-target confirmations are mandatory.
The fixture uses real authentication, HTTP, PostgreSQL and Redis with synthetic
accounts and deterministic external adapters. Do not run resetting suites
concurrently against this target or use shared/staging/production data.

The registered combined command is `pnpm test:e2e:texts`. To select only this
browser file after exporting the reviewed target variables, use
`pnpm test:e2e:texts-web sidebar-navigation.journeys.spec.ts`.

## Browser verification

1. Sign up and verify a synthetic account. At 1440 px, inspect the 240 px sidebar,
   brand, Search/Create row, Home, Library sections and account footer. Initially
   existing unopened resources can fill five section shortcuts. Empty Search
   still has no fabricated recently opened resources.
2. Create more resources than the shortcut limit. Open Search with its trigger
   or Mod+K and type a case-insensitive substring of an unopened title. It appears
   even though absent from shortcuts. Search does not inspect body content or
   return another owner's or archived resources.
3. Open the result and return home. Empty Search shows the successfully opened
   resource. Open its resource-actions menu and Pin. In a separate authenticated
   browser context, verify both the recent resource and its pin. Unpin there and
   reload the first context; the change persists. Hover and prefetch do not
   count as opens.
4. Collapse the sidebar. Expect a 64 px rail with the brand mark centered. Hover
   Home and Create to reveal their visible tooltips. Focus a resource icon and open its
   flyout with the keyboard; filter by title and verify matching results. Escape
   dismisses it and restores focus. Pointer entry/exit uses the design's delays;
   click/touch opens explicitly without requiring hover.
5. At tablet width, verify a rail with drawer expansion. At 390 px, verify the
   top bar and 320 px drawer, reachable Create/Search/account controls and no
   horizontal overflow. Escape closes the drawer and restores trigger focus.
6. Exercise Create's real dictionary/text/knowledge actions, settings and theme
   actions. Check visible focus, localized labels, dark/light appearance and
   source geometry. Retain representative expanded, rail, palette, flyout and
   drawer screenshots. Inspect console errors and failed requests.

## E2E coverage

- `owned-title-search-and-synced-navigation` proves real owned resource creation,
  five unopened fallback shortcuts after reload without recording opens, title
  search beyond shortcuts, successful-open recency, pin persistence in a
  second authenticated browser context and account isolation.
- `responsive-sidebar-and-keyboard-flyouts` proves rendered 240/64 px navigation,
  centered rail branding and visible Home/Create tooltips, keyboard flyout
  opening/filtering/dismissal, tablet/mobile drawers, focus
  restoration and no document overflow, with retained screenshots.

Repository and component tests own exhaustive ranking, current-item retention,
literal search escaping, cancellation, hover timers, archive restoration and
concurrent metadata changes. Real browser screenshots complement interaction
assertions; a passing test alone does not establish design fidelity.

## Expected failure and edge cases

- No owned resources displays an honest empty state with Create/View all.
  Resources without opened history may fill section shortcuts, while the global
  recent list stays empty until a resource is successfully opened.
- Archived or inaccessible resources disappear; restoring a resource restores
  its retained pin. Current source titles and access remain authoritative.
- Failed loads do not record a successful open. Search or pin errors expose
  recovery without fabricating results or changing the saved state.
- Logout clears the previous account's visible navigation immediately. Guests
  retain sign-in and preference controls without private-library requests.
- Navigation respects unsaved text edits, including search and browser history;
  [Texts](texts.md) owns that regression scenario.

## Automated regression checks

Run the focused browser file above, then the complete registered combined command
with the reviewed disposable environment. Validate traceability with:

```sh
pnpm user-flow:e2e -- check sidebar-navigation
pnpm user-flow:e2e -- check global-app-shell
pnpm user-flow:e2e -- check texts
pnpm docs:user-flows:check
```

## Troubleshooting

If the harness rejects its target, fix the loopback database/Redis identity and
confirmation values rather than bypassing guards. If search remains pending,
inspect the local navigation request and authentication refresh; do not print
tokens or synthetic session traces. A guest refresh 401 is expected.

## Cleanup

Close owned browser contexts and sign out synthetic users. The harness stops its
owned processes. Stop/remove only containers explicitly created for this run;
preserve development volumes and other workers' infrastructure. Screenshots and
traces remain in ignored `.next/playwright/texts-results/` run directories.
