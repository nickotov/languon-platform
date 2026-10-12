# Review: Web CSS Modules and token migration

Reviewed: 2026-10-12
Reviewer: `css_final_review` (independent completion reviewer)
Verdict: Pass after remediation

## Review boundary

- Mode: Initial review of the complete feature, followed by bounded remediation
  review of the findings below. No finding introduced a new trust boundary,
  public contract, or shared architecture surface, so expanded review was not
  warranted.
- Reviewed state: base `c3e848e6c48679c3387118cd03b102e3309718a6`
  through the complete tracked and untracked working-tree patch on
  `feature/web-css-modules-migration`. The final runtime/config/test file state is
  identified by [`evidence/source.sha256`](evidence/source.sha256), not by HEAD
  alone. Ignored `.next-*`, catalog, test-result, and dependency output is outside
  the patch boundary.
- Scope and invariants: AC-1--AC-5; all web runtime CSS, component and story
  markup, Storybook preview composition, Tailwind/PostCSS/package configuration,
  native reset and cascade, canonical geometry definitions and consumers,
  style-contract/tokenizer scripts and tests, affected journey assertions,
  ADR/instruction/skill changes, and web-ui-kit traceability.
- Inputs: `FEATURE.md`, `EXEC_PLAN.md`, E-1--E-5 in `EVIDENCE.md`, root and web
  `AGENTS.md`, ADR-0005, ADR-0016, ADR-0017, ADR-0029, `docs/web-styling.md`, the
  Magic Patterns CSS integration skill, `docs/user-flows/web-ui-kit.md`, the
  complete patch, affected source/tests, and surrounding shared-primitive CSS.
- Evidence reuse: the final web-test/static/build/catalog results and five unique
  real-app scenarios were accepted where the tested sources matched the captured
  state. Review duplicated only the focused guard/style checks needed to close
  concrete findings. The catalog wrapper remediation preserves the prior exact
  `720px`/`24px` rendered values through canonical tokens.
- Separate tester/security review: the dedicated `css_guard_verification` tester
  was appropriate because this feature introduced a substantial tokenizer/static
  guard harness. Its initial findings and remediation PASS are recorded below.
  No security specialist was required: this patch changes presentation and
  development enforcement, not authentication, authorization, data handling,
  HTML trust, external calls, or persistence policy.

## Findings

### R-1 — Storybook preview remained outside the CSS-only contract

- Severity: Medium
- Location: `apps/web/.storybook/preview.tsx:18` and
  `apps/web/scripts/style-contract.ts` (`checkStyles` initial source discovery)
- Problem and failure scenario: the initial reviewed state retained
  `style={{ maxWidth: 720, padding: 24 }}` on the catalog-wide preview wrapper,
  while the guard scanned only `apps/web/src`. `pnpm styles:check` therefore
  passed despite static inline presentation and raw eligible geometry in the
  Storybook runtime. This reproduced directly by inspecting the preview and the
  guard's source roots.
- Impact: AC-1, AC-2, and AC-5 were incomplete; every catalog story still depended
  on inline styling and the enforcement could not prevent the same regression in
  `.storybook`.
- Suggested fix: move the exact wrapper presentation into a CSS Module using
  canonical tokens, scan authored `.storybook` TS/TSX/CSS alongside `src`, and
  add a fixture that proves catalog utilities, static styles, and raw lengths are
  rejected.
- Disposition: Fixed. `preview.module.css` now owns the exact wrapper values and
  `checkStyles` covers optional `src` and `.storybook` roots. The workspace fixture
  exercises all three catalog violations.
- Resolution evidence: E-1 plus reviewer-focused 2-file/16-test run and
  `pnpm --filter @languon/web styles:check` PASS.

### R-2 — Eligible shorthand/custom/shadow/blur geometry escaped tokenization

- Severity: Medium
- Location: `apps/web/scripts/style-contract.ts` (`tokenFamily`),
  `apps/web/src/app/globals.css:191`,
  `apps/web/src/fsd/widgets/app-shell/ui/authenticated-app-shell/authenticated-app-shell.module.css:2`,
  and affected `flex`/filter consumers in account controls, auth, dictionary card
  authoring/library, profile, dialog, locked content, and toast CSS Modules.
- Problem and failure scenario: the initial guard classified `flex-basis` and
  direct `box-shadow`, but not fixed bases in the `flex` shorthand,
  `--app-sidebar-center-offset`, semantic `--elevation-*` definitions, or
  `filter`/`backdrop-filter` blur radii. Eleven CSS files consequently retained
  nonzero `px` geometry while `styles:check` passed. At a non-16px root font these
  values remained fixed while the rest of the migrated layout scaled.
- Impact: AC-2 and AC-5 were incomplete and root-font scaling could become
  inconsistent in account/profile panels, app-shell centering, dialogs, locked
  previews, toast accents, and elevation.
- Suggested fix: classify all five declaration families, convert the exact
  values to existing `--size-*` tokens, add regression probes, rerun the complete
  raw-length audit, and retain only documented native-value exceptions.
- Disposition: Fixed. All eleven files now use exact canonical tokens; the guard
  covers `flex`, the named offset/elevation custom properties, `filter`, and
  `backdrop-filter`. A complete authored-CSS audit found only media thresholds,
  zero/fallbacks, full-pill radius, thin border/outline strokes, and canonical
  token definitions remaining as raw lengths.
- Resolution evidence: E-1 plus reviewer-focused 2-file/16-test run,
  `styles:check`, and raw-declaration audit PASS.

### R-G1 — Conditional class keys and bound style spreads bypassed the guard

- Severity: Medium
- Location: `apps/web/scripts/style-contract.ts` (`inspectMarkup` initial state)
- Problem and failure scenario: the dedicated guard tester showed that utility
  object keys such as `clsx({ flex: active })` and statically bound style objects
  spread into `style` could escape inspection.
- Impact: AC-1/AC-5 regressions could be committed behind common class-helper and
  object-spread syntax.
- Suggested fix: traverse identifier object keys and recursively resolve bound
  static style spreads without rejecting genuinely runtime geometry.
- Disposition: Fixed; the original probes now fail the guard and runtime transform,
  percentage, and Floating UI spreads remain allowed.
- Resolution evidence: E-1 and the independent tester's remediation PASS.

### R-G2 — Tailwind workspace artifacts escaped source-only inspection

- Severity: Medium
- Location: `apps/web/scripts/style-contract.ts`
  (`inspectWorkspaceArtifacts`/`checkStyles` initial state)
- Problem and failure scenario: the initial source scan did not prove removal of a
  workspace Tailwind config, manifest dependency, or PostCSS plugin.
- Impact: AC-1/AC-5 could regress without a utility string appearing under
  `src`.
- Suggested fix: inspect conventional workspace config names, all dependency
  fields, and parsed PostCSS configuration in addition to authored presentation.
- Disposition: Fixed; fixtures cover Tailwind config, direct/scoped dependencies,
  and identifier/string PostCSS plugin forms.
- Resolution evidence: E-1 and the independent tester's remediation PASS.

### R-G3 — Tokenizer exactness/idempotence lacked an isolated fixture

- Severity: Low
- Location: `apps/web/scripts/tokenize-css.ts` and
  `apps/web/tests/style-contract-workspace.test.ts` (initial state)
- Problem and failure scenario: the conversion helper could not initially be
  exercised against an isolated root, so fractional/negative conversion, token
  append/aliases, and a byte-identical second run lacked direct proof.
- Impact: a future converter regression could silently round geometry or make a
  second migration pass mutate already-tokenized CSS.
- Suggested fix: parameterize the root safely, main-gate the CLI, and add an
  isolated exact-output/idempotence fixture.
- Disposition: Fixed; the fixture covers all listed invariants without mutating
  repository source.
- Resolution evidence: E-1 and the independent tester's remediation PASS.

## Completion audit

- AC-1: complete after R-1/R-G1/R-G2. Tailwind config/dependency/directives and
  shipped utility consumers are absent; component/story/catalog presentation is
  owned by CSS Modules, with only documented runtime/Satori inline values.
- AC-2: complete after R-2. Token definitions preserve exact reference values at
  a 16px root and scale through `rem`; size/space/radius aliases and semantic
  compatibility aliases resolve; remaining literals match the accepted exception
  inventory.
- AC-3: the explicit reset preserves the relevant Tailwind 3.4 Preflight native
  defaults, utility-to-module translations retain responsive/theme/focus/loading/
  disabled/error behavior, and E-2--E-4 provide production, catalog, and
  representative real-app evidence. The removed `shadow-elev-lg` string on the
  editor add-card action was inert in the base configuration (only
  `shadow-elevation-*` existed), so its removal is not a rendered regression.
- AC-4: ADR-0029, FSD ownership, low-specificity module selectors, global
  token/reset boundaries, instructions, and the repository integration skill are
  aligned; ADR-0017 is changed only by permitted partial-supersession metadata.
- AC-5: static/guard/tokenizer tests, web suite, lint/typecheck, production and
  catalog builds, guide checks, mapped theme coverage, five unique critical
  scenarios, catalog inspection, guard-specialist review, and this independent
  review cover the stated risk surface.
- No backend/admin/mobile/public API/persistence/security behavior changed. No
  secret, conflict, generated output, or accidental dependency remains in the
  reviewed patch. Feature-owned ignored `.next-*` outputs are not source.

## Remediation and final verdict

R-1 and R-2 were remediated in two bounded batches. R-G1--R-G3 were remediated
before this completion review and independently rechecked. The fixes affected
only presentation ownership, token consumers, guard discovery/classification,
and their fixtures; they did not invalidate the existing application journeys.
Focused guard/style evidence was renewed, and final source identity plus affected
suite/build/catalog checks are recorded in E-1/E-2.

Final verdict: **Pass after remediation.** No open material findings remain.

Residual limits:

- Static analysis is intentionally heuristic for conventional committed syntax;
  it cannot prove arbitrary runtime-generated class strings or nonstandard
  configuration filenames.
- Browser evidence is representative, not an exhaustive profile/library/theme,
  locale, zoom, forced-colors, and native-engine matrix.
- The reviewed patch remains uncommitted; `evidence/source.sha256` is the required
  file-state identity until the feature is committed.
