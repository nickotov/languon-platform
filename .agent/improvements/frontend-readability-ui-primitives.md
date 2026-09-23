# Improvement: Frontend readability and UI primitive repairs

Status: Complete
Created: 2026-09-23
Updated: 2026-09-23

## Routing decision

- Intended outcome: make existing dictionary UI code easier to maintain, keep
  component-specific styles with their component, repair tooltip positioning and
  theme contrast, repair the active switch appearance, and document how local
  development selects deterministic versus live dictionary AI generation.
- Why this is an improvement rather than a correction: the work combines a
  reusable frontend convention update, a bounded refactor across several
  existing components, and shared UI primitive behavior changes.
- Explicit-feature check: the user did not request a feature or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public contract,
  persistence, security/auth policy, production dependency, deployment, migration,
  or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature
  authorization before crossing any feature boundary.

## Context and scope

- Current behavior: several components embed derived conditions, callbacks, and
  nested ternaries in JSX; the library create dialog imports styles owned by a
  sibling component; icon-button tooltips can overflow the viewport and have poor
  dark-theme contrast; the checked switch track has poor contrast; local
  deterministic dictionary generation intentionally mirrors input fixtures but
  the live-provider setup is hard to discover.
- Expected behavior: JSX reads in terms of named states and handlers, complex
  optional prop values use typed helpers with early returns, component styles are
  colocated, tooltips flip and shift within the viewport with readable contrast,
  checked switches use an accessible green track, language fields align at their
  own content height, and developer documentation clearly distinguishes fixture
  and live model configuration.
- In scope: frontend-development skill guidance; authoring assistance and editor
  card sheet readability; Tooltip/IconButton/Switch primitives; library create
  dialog layout and style ownership; focused tests, browser evidence, and live AI
  configuration documentation.
- Out of scope: changing dictionary generation contracts, calling a paid model,
  adding a new AI provider integration, or changing persisted data.
- Likely files/surfaces: `.agents/skills/frontend-development/SKILL.md`, cited web
  components and CSS modules, UI and dictionary tests, `.env.example`, README or
  operations documentation.
- Relevant ADRs or constraints: ADR-0016 requires real browser evidence for all
  visible changes; accepted dictionary generation architecture keeps live model
  credentials in the worker boundary.
- Related user-flow guides: `docs/user-flows/dictionary-platform.md` (behavior is
  unchanged; update only if its setup or observable instructions need correction).
- Rollback/removal path: revert this focused patch; no migration or stored data is involved.

## Acceptance criteria

- AC-1 — Nontrivial render states and handlers in the cited components are named
  outside JSX; complex optional AI props use a typed helper with early returns,
  and the frontend skill records these conventions without requiring unnecessary
  memoization.
- AC-2 — All IconButton tooltips use viewport-aware positioning, can flip away
  from an obstructed edge, do not create document overflow, and remain legible in
  light and dark themes.
- AC-3 — Checked switches have a clearly distinguishable green track and retain
  keyboard focus and disabled behavior.
- AC-4 — LibraryCreateDialog owns its styles and its language fields align at the
  start without one field stretching to match the neighboring hint.
- AC-5 — Documentation explains why deterministic development generation mirrors
  inputs and gives the exact safe configuration needed to use a live Mastra-backed
  text-generation model, without exposing credentials or running paid requests.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result              |
| ------------------------ | ------------------- |
| Tests                    | 207 web tests pass  |
| Lint/typecheck/build     | Pass                |
| Runtime/browser/database | Browser pass        |
| Documentation/user-flow  | README updated; N/A |

## Outcome and evidence

- Changes made: named render states and handlers replaced the cited inline
  conditions; EditorCardSheet now builds optional AI props through a typed
  early-return helper; LibraryCreateDialog owns a colocated CSS module and uses
  start-aligned language fields; IconButton now delegates to the shared Floating
  UI Tooltip; tooltips flip and shift within the viewport with stable contrast;
  checked switches use the green success track; the frontend skill records these
  conventions.
- Commands and results:
    - `pnpm --filter @languon/web test -- tests/ui-kit.test.tsx tests/dictionary-card-authoring.test.tsx tests/dictionary-library.test.tsx`
      — Vitest ran the web suite, 27 files and 207 tests passed.
    - `pnpm --filter @languon/web typecheck` — passed.
    - `pnpm --filter @languon/web lint` — passed after removing one stale unused
      icon import exposed in the adjacent library row during full preflight.
        - `pnpm --filter @languon/web build` — production build passed with all 14
          application routes generated.
        - `pnpm agent-skills:check` — 10 package tests passed and 18 skills validated.
        - Skill-creator `quick_validate.py` for `frontend-development` — passed using
          a temporary uv/PyYAML environment.
        - `git diff --check` and targeted Prettier checks — passed.
- Runtime/browser: project-pinned browser wrapper session
  `languon-frontend-readability-ui-3e1b3f33c144f992e40302681273a0c3`
  on local `pnpm dev:all`, Chromium at 1280×900. Verified the create-dialog
  source and target fields align independently, the bottom sidebar theme tooltip
  resolves above the trigger inside the viewport, tooltip text remains clear in
  light and dark themes, and an enabled switch has a green track with a white
  thumb in dark theme. Browser `errors` was empty; console contained only React
  development/HMR messages. The first 127.0.0.1 load produced an expected CORS
  rejection because the reviewed local origin is `localhost`; the final
  localhost journey had successful API responses aside from the expected
  unauthenticated refresh before signup.
- Final-state responsive remediation evidence: browser session
  `languon-frontend-css-remediation-4e7c46ba532a04e511faff6dde2af406`
  verified the card-authoring sheet at 1280×900 and 390×844 after style
  extraction. Desktop geometry, mobile header divider/typography, unblurred
  backdrop, scrolling body, fixed footer, and the disabled purple Generate
  button were correct. Browser errors were empty and the console contained only
  React development/HMR messages.
- Documentation: README and `.env.example` now explain deterministic fixture
  output, live `mastra` worker settings, `/models` readiness, restart scope, and
  the separation between pronunciation TTS and dictionary text generation.
  Existing user-flow behavior and commands did not change, so no user-flow guide
  revision was required.
- Skill decision probe: a fresh read-only subagent correctly applied file-size,
  handler, render-condition, memoization, and style-ownership rules; its two
  concrete findings were remediated before final checks.
- Review: independent completion and focused remediation review passed with no
  unresolved material findings. Four medium findings were resolved: sibling CSS
  ownership, remaining responsive selectors after CSS extraction, the incomplete
  live-provider lifecycle recipe, and disabled Generate button selector
  specificity.

## Remaining risks

- A paid provider request was intentionally not executed. Live generation still
  depends on the configured provider supporting the documented `/models`
  readiness endpoint and structured output contract. The Tooltip `open` prop is
  a force-display API without `onOpenChange`; no scoped runtime caller uses it.
