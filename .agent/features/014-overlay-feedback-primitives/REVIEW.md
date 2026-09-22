# Independent review: Overlay and Feedback Primitives

Reviewed: 2026-08-18
Reviewer: Independent UI kit reviewer
Verdict: Approved

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

- Severity: Medium
- Location: Popover, Tooltip, Toast, and focused UI-kit tests.
- Problem: Review found fallback focus timing, unsafe rich-content nesting,
  closed-overlay observers, an unbounded host limit, timer reset risk, finite
  action-toast lifetime, and missing controlled native lifecycle coverage.
- Impact: Keyboard behavior, markup validity, resource use, queue invariants,
  notification persistence, or regression detection could drift.
- Suggested fix: move focus post-commit, portal Tooltip content, gate observers,
  clamp the host, stabilize callbacks, make actions persistent, and cover the
  native toggle lifecycle.
- Resolution: Fixed and independently re-reviewed; 60/60 focused tests pass.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] Required user-flow guides match current behavior, commands, and expected
      outcomes, or `FEATURE.md` records a valid not-applicable reason.
- [x] Current guides map proportional critical scenarios to real E2E tests;
      scenario/revision markers, execution evidence, and assertions agree.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Approved. No remaining critical, high, or material medium correctness,
accessibility, architecture, public-API, or test gaps. Native geometry was
verified separately in managed Chromium because jsdom cannot establish top-layer
placement.
