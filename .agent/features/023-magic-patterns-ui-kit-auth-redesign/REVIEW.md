# Independent review: Magic Patterns UI kit and auth redesign

Reviewed: 2026-09-14
Reviewer: independent reviewer subagent
Verdict: Approved

## Scope reviewed

- `FEATURE.md`, `EXEC_PLAN.md`, `EVIDENCE.md`
- Complete feature diff and shared-UI/auth execution paths
- ADR-0005 and ADR-0016 architecture boundaries
- `web-ui-kit` and `user-authentication` guides, markers, and assertions
- Unit/integration, Storybook, build, browser, and mapped E2E evidence

## Findings

### F-1 — Canonical size aliases were incomplete

- Severity: Medium
- Location: `apps/web/src/fsd/shared/ui/input/input.module.css` and
  `icon-button/icon-button.module.css`
- Problem: `ControlSize` allowed `compact` and `default`, but those components
  initially had styles only for legacy `small` and `medium` names.
- Impact: a legal canonical prop could render without its size contract.
- Suggested fix: add in-place alias selectors and regression coverage.
- Resolution: Fixed. Both aliases map to the established token sizes, and the
  UI-kit test renders both canonical values.

### F-2 — Two interactive targets were under 44px

- Severity: Medium
- Location: `auth-ui.module.css` password reveal and `logo.module.css` linked
  monogram
- Problem: the reveal override was 36px and the monogram link could be 32px.
- Impact: the auth page violated its minimum touch-target acceptance criterion.
- Suggested fix: enforce the semantic 44px minimum and measure in E2E/browser.
- Resolution: Fixed. Both use `--sys-size-touch-min`; browser measurements and
  mapped Playwright assertions prove 44px height.

### F-3 — Marketing heading preceded the page heading

- Severity: Medium
- Location: `apps/web/src/fsd/features/auth/ui/auth-shell.tsx`
- Problem: a decorative/product-story `h2` appeared in DOM order before the
  auth page `h1`.
- Impact: document outline and screen-reader hierarchy were inverted.
- Suggested fix: make the story title non-heading copy or reorder the semantic
  structure.
- Resolution: Fixed. The story remains visually prominent text; the page now
  has one correctly ordered `h1`, covered by a unit assertion.

### F-4 — Evidence and generated-file cleanup lagged remediation

- Severity: Low
- Location: `EVIDENCE.md`, `EXEC_PLAN.md`, `apps/web/next-env.d.ts`
- Problem: verification counts/results initially predated fixes and builds had
  changed Next.js's tracked generated type references.
- Impact: final evidence could have described a stale diff and included noise.
- Suggested fix: rerun final checks, update records, restore generated drift.
- Resolution: Fixed. Evidence records 134 tests plus post-remediation 3/3 and
  1/1 mapped E2E passes; `next-env.d.ts` matches branch baseline.

## Acceptance-criteria audit

- [x] AC-1 — Old visual tokens/type system removed and replaced.
- [x] AC-2 — One compatible shared UI kit remains with accessible behavior.
- [x] AC-3 — Auth split/compact layouts render responsively.
- [x] AC-4 — Real auth contracts and all mapped journeys remain intact.
- [x] AC-5 — Unsupported prototype functionality is absent.
- [x] AC-6 — Localization, headings, labels, focus, and preference states pass.
- [x] AC-7 — Final affected automated, Storybook, browser, E2E, and static
      checks pass.

## Architecture and test audit

- [x] FSD/shared-UI boundaries and runtime-authority ADRs are preserved.
- [x] No Tailwind/prototype scaffolding, external runtime, or speculative domain
      components entered the application.
- [x] Tests cover material behavior and final reviewer findings.
- [x] Both affected guides match current behavior and retain proportional stable
      mapped scenarios with current revision markers.
- [x] Independent security review found no material issue; safe return paths,
      schema validation, memory-only tokens, and anti-framing behavior remain.
- [x] Independent tester confirmed the mapped evidence is proportional and the
      broader-suite signup 429s are a pre-existing shared-client rate-limit harness
      limitation, not a UI regression.
- [x] No debug artifacts, generated-file drift, or accidental scope remains.

## Final verdict

Approved. All material and cleanup findings are resolved; no known issue blocks
feature completion or local integration.
