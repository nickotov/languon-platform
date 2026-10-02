# Correction: Dictionary word-pair divider

Status: Complete
Created: 2026-10-02
Updated: 2026-10-02

## Routing decision

One bounded decorative correction on the established owner-card list. No new
capability, journey, contract, persistence, dependency, permission, security,
deployment or material product decision. Escalate before crossing these boundaries.
Preserve the existing uncommitted word/example-column improvement and all other work.

## Context and scope

Examples have a vertical divider in desktop columns; Source/Translation do not.
Add the same 1px `--border-default` divider at the center of their existing gap,
only at the established 40rem list-container breakpoint. Reuse the existing card
component and stories. Preserve equal widths, text direction, audio/actions and
stacked layout. No editor or public-sharing changes. ADRs 0005/0016/0017 apply.

## Acceptance criteria

- AC-1 — Active and archived owner lists show a matching desktop word divider,
  without changing column geometry or blocking controls; no divider when stacked.

## Plan and verification

- [x] Add a decorative non-interactive pseudo-element in the existing gap.
- [x] Verify active/archived, long values and narrow layout in the actual component
      rendered by the established Storybook using the safe browser wrapper.
- [x] Run scoped authoring/list tests and formatting checks; inspect incremental diff.
- [x] Record evidence and close.

No new unit CSS-class assertions or full-stack E2E required: this changes no DOM,
state, sizing, journey or backend behavior. Browser rendering is the reliable
layer. No typecheck/build needed for one supported CSS rule; focused tests protect
existing controls. Existing dictionary guide remains accurate: no test-relevant
journey, command, failure or source mapping changed. Independent/security review
not triggered by this bounded decorative rule; author preflight required.

## Outcome and evidence

Base `94c78b2` plus existing uncommitted improvement. Final tested CSS SHA-256:
`9791126e0b9809c946935b778e09582a75f7dd2c7dceb6adefb0fcbd7abec363`.

- Added only desktop `.pair` positioning and a centered decorative `::after`
  with the existing border token and `pointer-events: none`. Equal column tracks,
  gap, content, controls and row semantics are unchanged. The rule exists only
  inside the current 40rem container query; narrow stacks have no separator.
- `pnpm --filter @languon/web exec vitest run tests/dictionary-card-authoring.test.tsx`:
  78 tests pass (5.02s). No tests weakened or CSS-class-only assertions added.
- Browser: existing Storybook10.5.8 started via
  `pnpm --filter @languon/web storybook --ci --no-open --disable-telemetry`.
  Real production card component, runtime CSS/tokens and synthetic stories,
  not a separate mockup. Safe wrapper/pinned agent-browser0.33.0, Chrome;
  session `languon-word-divider-f2d1019668ac812c89cb6a40fdfef18e`.
  Local iframe stories `dictionary-ordered-card-list--desktop-columns` and
  `dictionary-ordered-card-list--long-archived-columns` at1280x800 and320x800.
  Observed desktop divider matching the example separator, unchanged word
  wrapping/column widths, no divider when stacked, and working archived actions
  menu (Edit disabled, Restore available). AC-1 satisfied.
- Screenshots in `/Users/nickkotov/.agent-browser/tmp/screenshots/`:
  `screenshot-1790923792950.png` (desktop),
  `screenshot-1790923799622.png` (narrow),
  `screenshot-1790923834023.png` (archived long content).
- No browser exceptions; Vite/devtools notices only. All371 inspected requests
  local to port6006. Sole failed request: Storybook's absent `favicon.ico`404,
  unrelated to the card or CSS. No application/API calls or paid services.
- Formatting and `git diff --check` pass. Author preflight confirms the correction
  adds only the ten CSS lines and this record atop preserved prior work.
  Independent review not warranted by this decorative, non-interactive rule.
  Wrapper session and owned Storybook process closed; existing dev servers untouched.
  No generated tracked files, dependencies, commit or push.

## Remaining risks

No known semantic risk. Chromium/component-story rendering verified; the full
authenticated app journey and other browser engines were not rerun for this
decorative-only correction.
