# Correction: Dictionary library settings and card grid

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: keep dictionary settings opened from a library card over the
  library route, and make the dictionary cards rendered by `LibraryResults`
  auto-fit at the requested responsive minimum widths.
- Why correction: both changes repair established dictionary UI behavior in one
  bounded frontend surface without adding a capability or changing contracts.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true; no API, persistence, authorization, dependency, deployment, or
  product-decision boundary changes.
- Escalation rule: continue as an improvement only if the correction remains
  contract-preserving; otherwise obtain feature authorization.

## Context and scope

- Current behavior: library settings navigate to the dictionary detail route
  beneath the dialog; library dictionary cards use fixed breakpoint columns.
- Expected behavior: settings remain over `/dictionaries`; card lists use
  `auto-fit` with a 400 px desktop and 250 px mobile minimum.
- In scope: library settings state/query/mutation wiring, settings action,
  `LibraryResults` dictionary-card layout, focused tests, browser verification.
- Out of scope: settings form redesign, backend behavior, dictionary detail
  navigation, and the vocabulary-card list inside an individual dictionary.
- Likely files/surfaces: dictionary-library feature and CSS,
  focused web tests and dictionary user-flow traceability.
- Relevant ADRs and constraints: ADR-0016 real-browser verification; current FSD
  boundaries and existing dictionary API/settings form contracts.
- Related user-flow guides: `dictionary-platform`.

## Acceptance criteria

- AC-1 — Selecting Dictionary settings from an active library card opens the
  existing settings form while the browser remains on `/dictionaries`.
- AC-2 — Saving settings uses existing optimistic-version contracts and refreshes
  library, sidebar, and detail caches without navigating.
- AC-3 — Library dictionary-card lists auto-fit columns with a 400 px minimum on
  desktop and a 250 px minimum on mobile, without horizontal overflow at 320 px.

## Plan

- [x] Implement the bounded changes.
- [x] Add or update focused regression coverage.
- [x] Run targeted validation.
- [x] Update affected user-flow traceability.
- [x] Inspect the final diff and record results.

## Verification

| Check                    | Result                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | Focused settings/library tests: 2 files, 7 passed; full web suite: 31 files, 236 passed                                                                                |
| Lint/typecheck/build     | Web lint, TypeScript typecheck, and production Next.js build passed                                                                                                    |
| Runtime/browser/database | Updated owner Playwright journey passed; managed Chrome 152 verified settings and the populated library grid at 1280×720 and 320×900 against disposable local services |
| Documentation/user-flow  | All 14 guides and the updated `dictionary-platform` E2E mapping validated                                                                                              |

## Outcome evidence

- Changes made: library-card settings now delegate to page-owned settings state,
  fetch the full dictionary, and render the existing settings form over the
  library. Saving retains optimistic version checks and refreshes library,
  sidebar, and detail caches. Library dictionary-card lists now use `auto-fit`
  with 400 px desktop and 250 px mobile minima.
- Commands and results: focused tests, full web suite, lint, typecheck, build,
  user-flow checks, and the mapped owner Playwright scenario all passed.
- Runtime evidence: opening and saving card-menu settings kept the browser origin
  at `/dictionaries`; the library remained behind the dialog. Browser `errors`
  was empty and console output contained only expected development HMR messages.
  A fresh populated-library check showed two `LibraryResults` cards in auto-fit
  desktop columns at 1280×720 and a single overflow-free column at 320×900.
  Screenshots:
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1790593958568.png`
  and
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1790593974006.png`.
- Documentation: `dictionary-platform` now records in-library settings and the
  responsive card-grid behavior; its revision marker is synchronized.
- Review: final author preflight confirmed the vocabulary-card list has no diff,
  the responsive rules belong to the `LibraryResults` list owner, no generated
  browser output remains, and `git diff --check` passes. No material correctness,
  accessibility, FSD-boundary, or regression-coverage findings remain.
  Independent review is not warranted for this bounded frontend correction.

## Remaining risks

- None known.
