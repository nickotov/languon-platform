# Correction: Knowledge editor leading text affordance and compact actions

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Scope and routing

Bounded correction to existing editor affordances and header presentation.
Add the existing non-persisted writable-line affordance before a first custom
block. Preserve block grouping, normal text, read-only mode and saved content.
Replace Save and saved-note Practice text with icons, localized accessible names
and tooltips; preserve disabled/loading/navigation/publication behavior.
No API, schema, provider, security policy, dependency or product journey changes.
Preserve preceding startup correction changes. No commit requested.

## Plan and acceptance

- AC1: A first custom block always allows inserting prose above it; deleting an
  empty leading paragraph restores the affordance. Rendering alone is not dirty.
- AC2: Save and Practice are compact icon controls with accessible names and
  tooltips, preserving action availability and loading behavior.
- Reuse LearningBlockTextGaps decorations, shared Button/ButtonLink/Tooltip and
  existing workspace geometry tokens. No new design target or shared primitive.
- Verify focused editor regressions, web typecheck/lint and rendered browser
  behavior. Read relevant guide and update only changed observable instructions.

## Evidence and outcome

- Implemented the leading affordance as a decoration, with a shared widget
  factory for before/after insertion. An existing empty leading paragraph gets
  the same placeholder. No document is changed until the user inserts prose.
- Reused shared Save/GraduationCap icons, Button/ButtonLink and Tooltip. Controls
  remain 32px using existing tokens. Save keeps the shared loading spinner and
  availability rules; both actions retain localized accessible names.
- Focused editor regressions: 7 files / 49 tests passed. Includes inserting prose
  at position 1, deleting it, preserving all original blocks, recreating the
  leading affordance and no dirty notification from rendering. Existing grouping,
  drag/drop, selection, initialization and serialization coverage remains green.
  Command: `pnpm --filter @languon/web exec vitest run
  tests/knowledge-block-groups.test.tsx tests/knowledge-block-controls.test.tsx
  tests/knowledge-editor-initialization.test.tsx tests/knowledge-document-groups.test.tsx
  tests/knowledge-block-rerender.test.tsx tests/knowledge-workspace-block-selection.test.tsx
  tests/knowledge-learning-block-editor.test.tsx`.
- Web typecheck, scoped ESLint, Prettier and web styling contract passed.
  Typecheck initially caught the Button primitive's required children contract;
  supplying null preserves the existing loading/icon behavior without changing
  the primitive. Initial regression expectation was corrected to account for
  StarterKit's existing trailing paragraph after a transaction.
- Updated interactive-workbooks guide with leading prose and icon controls;
  synchronized its existing scenario revision. `user-flow:e2e -- check
  interactive-workbooks` and `docs:user-flows:check` pass (33 mapped guides).
  Existing knowledge-workspace guide uses the same accessible action names and
  expected behavior; its text instructions remain valid without a revision.
- Browser verification through the registered real-app disposable workflow is
  complete. Two failed authoring iterations retained as failures: first sent
  Delete from an existing node selection and deleted the block; second expected
  a widget when a real leading empty paragraph already existed. Corrected test
  explicitly focuses and removes that paragraph, uses the resulting widget to
  type prose, deletes that prose and rechecks the widget. Other two journeys
  passed on both iterations. No application assertion was removed or weakened.
- A third iteration passed the requested typing/deletion/restoration and both
  icon/tooltip checks, then exposed the existing upload test race: it applied
  an audio shell before the asynchronous asset upload completed. Awaiting enabled
  upload controls and the asset-dependent preparation control fixes that test
  prerequisite without changing runtime behavior or calling transcription.
- Final `pnpm test:e2e:critical -- --flow interactive-workbooks`: 3/3 passed,
  no skips/retries, run a9c98b77-9f80-4764-8435-baf19e7a7781. Real Chromium app
  at localhost:3336/backend:4006, disposable PostgreSQL:55488 and Redis:56488/1,
  deterministic external providers, synthetic accounts. Runner owns cleanup;
  no user services restarted or user database reset. Existing journey runtime
  assertions check console errors, page exceptions and unexpected server errors.
  Requested leading-widget interaction and prepared action labels/tooltips are
  asserted through actual user clicks, typing, deletion, hover and keyboard focus.
  Desktop 1440x1000 and mobile 390x844 captures inspected: compact Save and saved
  Practice icons fit the topbar, preserve disabled styling and do not overlap.
  Screenshots under `test-results/critical-flows/a9c98b77-9f80-4764-8435-baf19e7a7781/interactive-workbooks-artifacts/`:
  `editor-populated-desktop` and `editor-block-settings-mobile` attachments.
- Final six-file source/tests/guide fingerprint, sorted path + NUL + file bytes
  + NUL SHA-256: b4c89c43f6077805a0f27e064e54ec74350c542e9940d77f9895e370beb671cd.
  Base HEAD 890575a; prior startup correction remains separate and untouched.
  No production schema/backend/AI execution code changed; no expanded full
  accounting gate or database-specific check is required for this correction.
- Author preflight: cache remains keyed by immutable document; read-only mode
  still bypasses decorations; grouping and hidden internal spacers unchanged;
  no runtime innerHTML or persisted synthetic node added. Header is 269 lines,
  an existing cohesive topbar; splitting two icon substitutions would introduce
  extra prop plumbing unrelated to this correction. No new shared abstraction.
  Independent review not required for this bounded decoration/presentation work.

Logs: `/tmp/languon-leading-gap-tests-final.log`,
`/tmp/languon-leading-gap-types.log`, `/tmp/languon-leading-gap-lint.log`,
`/tmp/languon-leading-gap-e2e-lint.log`, `/tmp/languon-leading-gap-styles.log`,
`/tmp/languon-leading-gap-browser.log`, `/tmp/languon-leading-gap-browser-final.log`,
`/tmp/languon-leading-gap-browser-verified.log`.
Final passing log: `/tmp/languon-leading-gap-browser-pass.log`.

## Remaining risks

None known within scope. No commit was made.

## Git handoff

The user subsequently requested committing the completed pending work. Earlier
no-commit statements describe implementation-time authority; this request
authorizes the local commit containing this record and its verified changes.
