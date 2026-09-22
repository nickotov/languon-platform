# Independent review: Web internationalization and language switcher

Reviewed: 2026-08-14
Reviewer: Turing (independent reviewer agent)
Verdict: Approved after remediation

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

### Stale localized client messages

- Severity: Medium
- Location: authentication forms, security settings, and auth capabilities.
- Problem: already-translated status strings could survive a locale refresh or
  be published by an old in-flight callback.
- Impact: mixed-language UI after switching.
- Resolution: Fixed. Locale-sensitive status state resets on locale change and
  rejects setters captured by the prior locale; focused unit and E2E coverage
  proves visible and late stale messages do not survive.

### Over-broad locale remount

- Severity: Medium
- Location: root provider composition.
- Problem: the first stale-state remediation keyed the full provider subtree.
- Impact: draft inputs and auth/query state were recreated during switching.
- Resolution: Fixed. The key was removed, reset behavior was scoped to localized
  status state, and E2E proves email/password drafts remain unchanged.

### Capability failure lost on locale change

- Severity: Medium
- Location: `AuthProvider` capability state.
- Problem: resetting localized error copy without preserving semantic failure
  state could leave the UI indefinitely checking with no Retry action.
- Impact: authentication actions remained unavailable after switching locale.
- Resolution: Fixed. A locale-independent failure boolean preserves error/retry
  semantics while copy derives from the active catalog. A component regression
  proves English-to-Russian retranslation and enabled Retry behavior.

### Default-English not-found route and route composition

- Severity: Medium functional; Low architecture.
- Location: root `not-found` convention.
- Problem: Next's default 404 was English, and the initial custom implementation
  placed view code directly in the App Router file.
- Impact: incomplete localization and divergence from pages-first FSD.
- Resolution: Fixed. Localized metadata/copy is implemented in a not-found page
  slice, with the App Router file limited to metadata and composition; SSR E2E
  covers all four locales.

### Language option labels outside catalogs

- Severity: Low
- Location: language switcher.
- Problem: locale autonyms were configuration literals outside typed catalogs.
- Impact: catalog completeness did not cover every component string.
- Resolution: Fixed. All four option labels use typed message keys.

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

Approved. The final focused re-review found no material functional,
architecture, or testing issues. The remaining translation-quality risk is
non-blocking and recorded in `EVIDENCE.md`.
