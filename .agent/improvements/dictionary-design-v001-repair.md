# Improvement: Correct dictionary v001 fidelity and frontend readability

Status: Complete
Created: 2026-09-23
Updated: 2026-09-23

## Scope and routing

User reports that implemented dictionary design differs from Magic Patterns and
that oversized components, inline handlers/derived props and poor logical
spacing harm maintainability. Improvement of existing presentation and code;
no product capability, API/schema, dependency or architecture change. Preserve
unrelated uncommitted dictionary audio and dev-panel startup work. No commit.

Source: feature 027 DESIGN.md, target v001; Magic Patterns editor
syycdjxpposwrfn72sbix4, artifact b7f13de7-72b5-4c6f-bd22-a08c83e1ceb4. Provider
status on 2026-09-23 confirms the captured artifact is still active. No new
version or change to external source is authorized/needed. Prior implementation
record dictionary-design-v001.md overclaimed fidelity based on source-only
comparison; this record supersedes that completion claim pending repair.

## Acceptance

- Supplied v001 structure, content, controls, hierarchy, spacing and typography
  drive implementation; no invented UI. Preserve explicit hide reorder/speed
  decision and production permissions, data/lifecycle, accessibility contracts.
- Split touched oversized components/hooks by meaningful responsibility, each
  normally <=250 lines; no dumping logic into a giant controller. Named handlers
  and normalized/derived values outside JSX, blank lines between logical groups,
  memoization only where identity/lifecycle or measured work warrants it.
- Update frontend-development and ui-ux-composition skills with checkable rules
  and rendered-reference comparison requirements; no cached plugin mutation.
- Unit/integration, focused browser journeys, real browser, reference/runtime
  evidence, lint/typecheck/build and independent completion review establish
  correctness. Record material deviations/verification limits explicitly.

## Ownership and plan

- authoring repair: card form draft/AI/override logical components and hooks.
- library repair: library, cards, settings fidelity and extraction.
- editor repair: workspace/header, query/mutation/lifecycle hooks, dialogs.
- skill quality: skills then generation/review component repair.
- root: integration, i18n, reference render/access, docs and verification.

All use existing FSD slice boundaries. Reviewers inspect final integration and
functional/lifecycle regressions independently after author preflight.

## Discrepancies confirmed before implementation

- 1094-line card form, 831-line library, 853-line generation panel and 2609-line
  editor intermingle presentation and orchestration.
- Card form duplicates warning in wrong position, left source count, invented
  progress bar, differing AI controls, hidden-value panels and override layout.
- Workspace has extra cards-title/action row and search label absent reference;
  secondary menu location differs from compact summary/tabs/search design.
- Card padding and field rows/labels/badges differ; settings substitutes boxed
  checkbox/select fieldset for switch/radio sections and locked language summary.
- Library adds import CTA and timestamps absent reference.

## Evidence, review and remaining work

Implemented and verified. Main card form: **213 lines** (was 1094); editor entry:
**89 lines** (was 2609); library entry: **161 lines** (was 831); generation panel:
**121 lines** (was 853). Cohesive private components/hooks remain below 250 lines.
Named handlers and normalized values replace inline event functions; capability
and field-specific runtime objects replace full controller/form/list prop bags.
No JSX event callback matches remain in the repaired production surfaces.

### Verification

- `pnpm --filter @languon/web exec vitest run`: **205 tests / 27 files pass**.
- Authoring 35 and generation 8 focused tests cover codepoint limits, dormant
  values, override preservation, cancellation and actual payload acceptance.
- Shared Menu keyboard/refocus interactions pass; opt-in icons/circular trigger
  preserve existing consumers. Narrow contracts retain normal query/lifecycle
  ownership and no API/model change.
- Web lint, typecheck and production build pass. Build used isolated
  `.next-design-repair-build` to avoid disrupting the running app.
- **7 platform + 4 audio Playwright journeys pass** on real disposable PostgreSQL,
  Redis and MinIO with deterministic providers and test-tone audio. Covers owner
  CRUD/restore, anonymous fork/capability invalidation, stale review, inline AI,
  batch, document upload/review/cleanup, Quizlet import/export, actual playback,
  cache identity, retry/stop races and archived-byte denial. Logs are preserved
  alongside this record. Guide mapping revision: platform
  `sha256:1e8e047e7a475a69`; audio `sha256:a41d88bcb8a500f2`.
- E2E surfaced an expired hard-coded development scanner signature date. The
  deterministic scanner now uses an injectable current clock; fixed unit tests
  inject their clock. Production ClamAV policy/path is unchanged. The affected
  **26 backend unit tests**, backend typecheck and scoped lint pass. This is a
  fixture correction necessary to verify the existing document journey.
- Skill validation: both quick_validate checks, 18-package agent-skills check,
  its 10 tests and formatter pass. Fresh isolated `dictionary_skill_probe` applied
  snapshot instructions to the 720px/24px/disclosure scenario and returned PASS:
  narrow responsibilities, named handlers, intentional memoization, exact source
  sizing/control inventory and no fidelity claim for missing expanded rendering.
- Independent reviewer `dictionary_repair_review`: **PASS after remediation**.
  Three medium findings resolved: codepoint limits; desktop drawer/footer
  geometry; complete-state prop bags plus hidden-import query/wiring.
- `git diff --check`, affected formatting, user-flow guide validation/mappings pass.

### Rendered evidence and remaining fidelity limits

The project-pinned agent-browser safe wrapper inspected the actual app at
127.0.0.1:3348 and audited reference at 127.0.0.1:3349. Compared 1440×1000 desktop
and 390×844 mobile. Preserved captures cover reference library/card dialog,
runtime centered card dialog/mobile bottom sheet, and dark settings with pinned
footer. Runtime data/languages/enabled optional fields differ from source mock
fixtures, intentionally preserving real dictionary settings. Functional clean
browser-error assertions are part of passing E2E; exploratory console history
included transient compilation errors during live edits and is not presented as
clean-session evidence.

The initially empty 20 primitive files were design-system references; current
Languon DS artifact `ecb75ac2-c06e-44ed-8e1b-28ec4bff5287` supplied matching source.
Supplemental inert files, hashes and provenance are in `reference/`; original
v001 snapshots are unchanged. The linkage is inferred from matching component
names/current DS, not proven by original artifact metadata. Reconstruction uses
installed React 19/router 7, local Inter and a settled-animation adapter. A missing
Tailwind CSS-variable opacity rule was repaired in the local renderer to honor
explicit source `/50` opacity rather than mistakenly matching a transparent
fixture backdrop. No app geometry is based on that renderer bug.

**This verifies supplied source and reconstructed reference, not pixel-perfect
identity to the unavailable original hosted rendering.** Literal primitive
palette quirks remain adapted to ADR-0017 runtime semantic tokens; real language
catalog entries/data replace mock placeholders. Full archived/library counts
are unavailable from the cursor API and are not fabricated or fetched through
an unbounded scan. Real account navigation and secondary workflows remain;
prototype-only States/Coverage navigation is omitted. Existing notation values
and source/translation contracts remain safe even where prototype mock limits
are narrower. Whole-dictionary import is hidden by explicit user choice; native
backend capability remains and word-pair import stays in the workspace menu.

### Cleanup / state

Owned fixture app/reference/browser sessions and disposable containers are
stopped/removed after final capture. The existing user dev server on 3333 was
left running; Next's own declaration generator restored the default development
references without editing generated output by hand. No shared database, external provider,
production service, commit or deployment was touched. Unrelated existing
uncommitted dev-panel startup changes are preserved.
Rollback: revert only this improvement's scoped app/skill changes; no data change.
