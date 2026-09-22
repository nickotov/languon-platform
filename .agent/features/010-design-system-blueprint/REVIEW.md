# Independent review: Languon design system blueprint

Reviewed: 2026-08-16
Reviewer: Goodall (independent reviewer), with Mill (independent tester)
Verdict: Pass after remediation

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

### Language metadata

- Severity: Medium
- Location: `design/DESIGN_SYSTEM.md`, Accessibility contract
- Problem: The initial blueprint did not explicitly require a page language or
  language metadata for mixed-language passages.
- Impact: Screen readers could pronounce learning content with the wrong language.
- Suggested fix: Require document/interface and per-passage language metadata.
- Resolution: Fixed. The contract and generated-design checklist now cover both.

### Actionable notification persistence

- Severity: Medium
- Location: `design/DESIGN_SYSTEM.md`, Toasts and inline alerts
- Problem: The initial ten-second toast maximum could remove an action or important
  error before users of assistive technology or with slower interaction could act.
- Impact: Recovery actions and important information could become unavailable.
- Suggested fix: Keep actionable or important notifications until dismissal, or
  retain the action in persistent nearby UI.
- Resolution: Fixed. Persistence, dismissal, focus, and interaction requirements
  now prevent a timeout race.

### Empty and error states

- Severity: Medium
- Location: `design/DESIGN_SYSTEM.md`, Feedback components
- Problem: The initial component inventory lacked a generic empty/error-state
  primitive despite claiming a complete generation blueprint.
- Impact: Generated screens would invent inconsistent recovery and empty-state UI.
- Suggested fix: Define reusable empty, loading, and error-state composition.
- Resolution: Fixed. The new section covers state distinctions, actions, focus,
  announcements, localization, responsiveness, and themes.

### Reflow wording

- Severity: Low
- Location: `design/DESIGN_SYSTEM.md`, Reflow and orientation
- Problem: “320 CSS px and 400% zoom” was ambiguous about the effective viewport.
- Impact: Implementers could test the wrong viewport/zoom combination.
- Suggested fix: State the effective 320 CSS px content viewport with an example.
- Resolution: Fixed with a 1280 CSS px viewport at 400% browser zoom example.

### Component state token completeness

- Severity: Low
- Location: `design/DESIGN_SYSTEM.md`, Color and component state mappings
- Problem: The initial blueprint did not assign exact theme values for several
  secondary, quiet, destructive, disabled, read-only, and field states; the default
  dark boundary also fell below 3:1 on subtle and raised surfaces.
- Impact: Later generators could invent inconsistent or inaccessible states.
- Suggested fix: Add exact state mappings and a stronger contextual boundary token.
- Resolution: Fixed. All mappings are explicit and the expanded 62-pair contrast
  audit passes.

### Contrast evidence labeling

- Severity: Low
- Location: `design/DESIGN_SYSTEM.md`, Component state color mappings; `EVIDENCE.md`,
  Unit evidence
- Problem: The initial post-remediation prose combined text and boundary ratios into
  an inaccurate range even though all underlying assertions passed.
- Impact: The evidence summary was not independently reproducible as written.
- Suggested fix: Report separately scoped minimums for normal text and boundaries.
- Resolution: Fixed. New normal-text state pairs are reported at 5.24:1 or higher,
  and new meaningful state boundaries at 3.89:1 or higher.

### Final re-review

- Severity: None
- Resolution: The independent reviewer and tester found no unresolved material
  issue after remediation.

### Pencil component-library follow-up

- Severity: Medium
- Location: `design/main.pen` foundation/component sections.
- Problem: The first canvas pass had clipped token rows, state-label contrast
  mistakes, token/type parity drift, undersized control roots, reversed sheet
  radii, incomplete primitive coverage, and inaccurate canvas evidence.
- Impact: Future screen composition could inherit inaccessible or inconsistent
  visual primitives.
- Resolution: Fixed. The canvas uses an unconstrained token-row layout, completed
  containers, synchronized motion/type values, corrected semantic Button-label
  mappings, complete visible action/field state examples, 48px cross-platform
  target roots, top sheet radii, and 24 reusable symbols. A focused Pencil
  recheck is recorded in `EVIDENCE.md`.

### Final Pencil re-review

- Severity: None
- Resolution: Independent reviewer and tester both passed the remediated canvas.
  The final audit confirms one `design system` frame, 24 reusable symbols, no
  placeholders or layout problems, synchronized foundation values, 48px shared
  control roots, and complete visible action/field state references.

### Handoff and state-matrix refinement

- Severity: None
- Resolution: The refined canvas balances default component padding, labels
  components by use family, and adds a visual CSS-variable handoff. An independent
  Pencil check confirmed the complete Primary, Secondary, Quiet, and Destructive
  Button matrix uses the exact default, hover, pressed, focus, and disabled token
  mappings from `DESIGN_SYSTEM.md`, with no layout problems or placeholders.

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

Pass after remediation. All acceptance criteria are met, the documentation-only
scope preserves established boundaries, and no unresolved material findings remain.
