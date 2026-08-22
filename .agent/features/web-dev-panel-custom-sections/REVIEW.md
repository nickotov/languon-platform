# Independent review: Web Dev Panel Custom Sections

Reviewed: 2026-08-22
Reviewer: Independent implementation, security, and test agents
Verdict: Pass after remediation

## Scope reviewed

- `FEATURE.md` and `EXEC_PLAN.md`
- Complete implementation and design diff
- ADR-0014 and inherited ADR-0013 constraints
- Unit, HTTP integration, Playwright, browser, guide, and broad-check evidence

## Findings and resolutions

### Stale cross-tab section stop confirmation

- Severity: Medium
- Location: `web-dev-panel/public/app.js`, section Stop all dialog lifecycle
- Problem: the first implementation retained the active run set captured when
  the dialog opened even if another tab changed section membership.
- Impact: confirming stale UI could stop a command no longer in the section.
- Suggested fix: retain section identity and the confirmation snapshot, then
  compare current membership and active command/run pairs before posting.
- Resolution: Fixed. A changed/disappeared section or changed run set now fails
  visibly and requires fresh confirmation; a two-tab Playwright regression proves
  the process remains running.

### Browser-storage write failure left phantom membership UI

- Severity: Medium
- Location: `web-dev-panel/public/app.js`, `commitCustomSections`
- Problem: when `localStorage.setItem` failed, the native checkbox could remain
  visually toggled although the in-memory/saved layout was unchanged; transient
  notices could also overwrite the failure.
- Impact: a developer could believe a command was removed while Start all still
  included it.
- Suggested fix: redraw from the unchanged canonical document and use a dedicated
  persistent preference alert.
- Resolution: Fixed. Playwright forces a quota failure, verifies the membership
  checkbox rolls back, and verifies the alert survives unrelated navigation.

### Layout and atomic-stop bounds diverged

- Severity: Medium
- Location: `web-dev-panel/public/custom-sections.js` and
  `web-dev-panel/src/http-validation.mjs`
- Problem: a section allowed 128 members while `/api/stop-selected` accepted 64.
- Impact: a future valid 65-member section could start atomically but could never
  use its section Stop all action.
- Suggested fix: align the persisted layout and endpoint bounds and test the
  cross-contract edge.
- Resolution: Fixed. Sections now contain at most 64 commands; a contract test
  proves 64-member serialization and stop validation pass while 65 members fail.

### Terminal selections weakened atomic stop validation

- Severity: Medium
- Location: `web-dev-panel/src/process-manager.mjs`, selected-stop validation
- Problem: matching terminal runs were accepted, allowing a mixed terminal and
  active set to stop only the active subset.
- Impact: stale section state could violate the documented all-or-nothing rule.
- Suggested fix: require every requested run to be active before requesting any
  stop.
- Resolution: Fixed with a mixed terminal/active process-manager regression.

### Disabled reason was masked by generic batch eligibility

- Severity: Medium
- Location: `web-dev-panel/public/selection.js`, section start projection
- Problem: production disabled entries are also non-batch-eligible, so the first
  implementation showed a generic batch message instead of `runtimeReason`.
- Impact: developers could not tell why a disabled command could not launch.
- Suggested fix: classify unavailable commands before available non-batch ones.
- Resolution: Fixed with production-shaped unit coverage and UI rendering of the
  concrete reason.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Client JSON remains closed, bounded, ID-only presentation data.
- [x] Server/SSE remains the sole process, status, log, and concurrency authority.
- [x] Start and selected-stop operations preserve atomic validation and run-ID
      protection.
- [x] Tests cover the material regression surface at unit, HTTP, E2E, and real-
      browser layers.
- [x] The design canvas, README, accepted ADR, skill, and current user-flow guide
      agree with runtime behavior.
- [x] No generated/debugging artifact or unrelated generated source change remains.

## Residual risks

- Windows execution remains intentionally unavailable until native Job Object
  supervision can guarantee descendant cleanup.
- The finite 512-total-membership maximum was not performance-benchmarked at its
  exact ceiling; compact fixture layouts and narrow/desktop browser checks pass.

## Final verdict

Pass after remediation. No material correctness, acceptance, architecture,
security, or test finding remains.
