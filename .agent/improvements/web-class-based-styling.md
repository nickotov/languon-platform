# Improvement: Low-specificity class-based web styling

Status: Complete
Created: 2026-10-04
Updated: 2026-10-04

## Scope and routing

Existing-contract styling refactor across `apps/web/src` CSS and its owning JSX.
Improvement rather than correction because shared primitives and multiple screens
are affected. No new journey, API, persistence, production dependency, security
policy, or architecture change. Preserve established UI, tokens and states under
ADRs 0005, 0016 and 0017. Existing uncommitted import/training changes are user work
and must remain intact; review this task's changes against that starting state.

## Acceptance

- Replace component tag/DOM-depth-dependent styling with explicit element classes.
- Prefer one class and state pseudo-selectors; use zero-specificity `:where()` for
  necessary contextual conditions. Keep native/global reset and theme foundations
  intentional, not as component styling exceptions by accident.
- Preserve declaration values, responsive layouts, interactive/disabled/loading
  states, accessible semantics and existing functionality.

## Plan and checks

Audit all web CSS selectors; edit owning markup with nonoverlapping assignments.
Run CSS inventory, formatting, root lint, web typecheck and affected tests (shared
UI blast radius warrants the web suite). Verify representative real browser UI
through maintained catalog/application surfaces at desktop/mobile and relevant
states. Independently review the combined scoped refactor and resolve findings.
No backend/database change: no database checks or new full-stack setup by default.
Existing guide behavior/source paths remain unchanged; no guide revision changes
unless verification reveals a changed documented contract.

## Evidence and decisions

- Refactored component selectors throughout all 76 audited web CSS modules;
  unaffected simple-class files remain unchanged. Owned markup uses independent
  classes, with zero-specificity context where necessary. Shared UI, auth/shell,
  dictionary features and pages had nonoverlapping worker ownership; root handled
  card-list/editor integration. Existing dirty work preserved against the starting
  snapshot `/private/tmp/languon-web-styling-start.patch` at base `95d5420`.
- Explicit source/translation, field row/label/value/text/audio classes replace
  the reported dictionary-card-list selectors. Paired examples use a modifier
  class; existing container breakpoints and separator declarations remain.
- Shared presentation hooks on Dialog, Field, Textarea, Tabs, Logo and training
  trigger avoid consumers targeting primitive internals. Optional props accept
  undefined consistently with strict CSS-module index types. No state/event or
  API behavior changes. Existing large components remain mechanically classed;
  splitting their behavioral responsibilities would expand this refactor.
- Exceptions: global element resets/theme foundations stay intentional. Arbitrary
  ReactNode SVG slots in Badge/Input/IconButton and rich bodies in InlineAlert/
  LessonContentBlock use narrowly scoped zero-specificity tag conditions. Owned
  elements have classes; no recursive cloning or traversal of arbitrary children.
  An AST audit with PostCSS and the installed selector parser (ignoring numeric
  nth-child arguments and keyframes) passes: 76 modules, no type selectors outside
  `:where()`, 12 grouped slot exceptions. Dead rules were removed only where owning
  markup could not match them; rendered states were not newly activated.
- `pnpm --filter @languon/web test`: 42 files / 357 tests pass. Covers existing
  auth/profile, dictionary, shared UI and swipe state behavior. Focused worker
  checks: 27 shared UI/public-contract tests and 25 auth/shell/theme tests pass.
- `pnpm --filter @languon/web typecheck`: final pass after correcting new optional
  style prop types; no ignored TypeScript errors.
- `pnpm lint`: passes. Scoped Prettier checks and `git diff --check` pass; the
  card-list CSS was reformatted after the final selector adjustment.
- `pnpm --filter @languon/web build`: final webpack production build passes,
  compiling all routes after review remediation. Generated next-env diff restored
  to its previously clean state; no generated output enters the patch.
- Real browser evidence: project-pinned safe wrapper, Chromium; catalog session
  `languon-web-class-styling-caaa3bb792a6a98b1fe210852edef746` on localhost6006,
  auth session `languon-web-class-styling-auth-4462386fbadabc4de8bfee78dea72d46` on
  existing localhost3333. Desktop dictionary example/source pairs and compact320
  stacking observed; editor overlay at375px preserves typography/control layout;
  checked/disabled radio and switching selection, on-switch thumb, tab selection
  and training menu hint/disabled item verified. Sign-in desktop/mobile375px has
  intact fields, footer links, password action and narrow logo behavior.
- Representative screenshots inspected: browser temporary files
  `screenshot-1791105036565.png` (desktop dictionary), `screenshot-1791105072190.png`
  (compact dictionary), `screenshot-1791105144761.png` (editor),
  `screenshot-1791105354109.png` (switch), `screenshot-1791105459141.png` (tabs),
  `screenshot-1791105452905.png` (mobile auth), under
  `/Users/nickkotov/.agent-browser/tmp/screenshots/`. These are temporary browser
  artifacts, not durable design assets.
- Browser diagnostics: auth has no exceptions, console only React DevTools/HMR;
  its refresh401 is expected for an anonymous session (preflight204).
  catalog's initial mistyped story ID produced a known PREVIEW_API error, corrected
  using its index. Only non-successful catalog request was favicon404. No claimed
  exhaustive authenticated-profile/shared-dictionary journey or complete visual
  snapshot matrix; component browser checks plus owning-markup/cascade review and
  existing tests cover this declaration-preserving refactor.
- No guide commands, outcomes, failure semantics or source mapping changed, so
  no guide revisions/E2E marker changes required. No persistence change or paid AI
  calls, accounts, or database fixtures created. No commit authorized.
- Independent initial review `/root/css_completion_review`: no functional
  regressions found; CR-001 Low requested `.item:has(:where(.hint))` to neutralize
  the last unnecessary menu condition. Implemented, same match set; final browser
  menu and production build renewed. Independent remediation review passed:
  no remaining material findings. Reviewer checked final source hashes and menu
  screenshot; representative browser coverage is sufficient for this unchanged
  declaration/behavior contract, not a claim of exhaustive visual coverage.
- Final patch identity: [source SHA-256 manifest](evidence/web-class-styling-source.sha256)
  captures current tracked runtime sources, including preserved earlier user work.
  All entries independently verified. Only this evidence record changed afterward.
  Reused full-suite/static evidence remains valid for unchanged runtime logic;
  the final same-match-set CSS correction has renewed browser/build evidence.

Rollback is this task's class/selector diff only, preserving earlier dirty work.

## Remaining risks

No known material defects. Browser coverage is representative, not an exhaustive
authenticated-profile/shared-dictionary/theme/state matrix. Arbitrary rich-body
and SVG slot conditions remain narrowly scoped zero-specificity exceptions.
