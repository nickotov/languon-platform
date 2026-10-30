# Correction: Document learner preview in settings

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Routing and scope

Restore the learner preview already required by F059 AC-2/MP-19 through the
existing document actions menu and shared-note reader renderer. This is a local
presentation correction: no API, persistence, permission, AI, billing, dependency,
or publication change. Current draft content is previewed; shared links continue
to show only explicitly saved content. No automatic commit is authorized.

Preserve the pre-existing user edit to
`apps/web/src/fsd/entities/learning-blocks/ui/grammar-block/grammar-block.module.css`.
Do not include it in task-owned edits or revert it.

## Acceptance

- Document settings expose a localized, checked Learner preview option.
- Preview uses the existing read-only document/learner block views, hides author
  controls and shows current unsaved content with a clear return-to-edit action.
- Switching keeps the editor mounted, preserving content, history and chat refs.
- Prepared exercise answers/hints work locally; preview does not persist attempts
  or trigger AI checks. Playback retains existing explicit player/consent behavior.
- Desktop/mobile and keyboard entry/exit remain usable. Preview never publishes.

## Plan and verification

Use correction small-fix flow, frontend-development, ui-ux-composition, testing,
browser-verification and user-flow-e2e. Reuse Menu/Button, semantic geometry tokens,
NotePreview/KnowledgeDocumentView and their learner variants. No new architecture.

Implement local mode wiring and a small owned preview component; retain the
existing large page/header composition rather than refactor unrelated save,
sharing, tutor and author operations solely to meet the component size threshold.
Extend the mapped author workbook journey for desktop/mobile toggle, current
content and read-only controls, local answer reveal and restored editor identity.
Run the focused registered workbook browser gate (three cases), affected web
typecheck/lint/styles, guide/revision checks and final diff inspection. No full
AI/DB gate is needed because their execution boundaries are unchanged. Existing
exercise renderer tests cover prepared checking; do not duplicate implementation.

## Evidence and review

Implemented a localized menu checkbox, an owned reader-preview component and a
local mode hook. Both menu and Back to editing exits restore the mounted editor.
The hook captures scroll before state changes can clamp the hidden editor,
enters preview at the top, restores editor scroll/focus and cancels pending RAFs
on rapid transitions/unmount. Preview options whitelist only media/transcript/
playback data; saved learner state, persistence callbacks and AI checks are absent.

Independent bounded source review by `block_references_completion_review`:
Approved, no material source finding. It checked mount/history preservation,
current-draft scope, local practice isolation, consent-preserving playback,
scroll/focus lifecycle, menu state/locales, code boundaries and mapped coverage.
No new security policy or HTML renderer; reuse the existing validated reader.

Final verification boundary: base `353a6ec` plus the ten runtime/test/guide files
in this correction (excluding this record, generated Next declaration and the
pre-existing user CSS edit). Sorted `{path,sha256}` JSON fingerprint:
`fb0fe1d7a7b0aa1c4206a7ddabfec5c65d9875747cf733b6457013fafcf7ff97`.

| Check                | Result                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real browser         | Registered `pnpm test:e2e:critical -- --flow interactive-workbooks`: run `d81451c0-6f42-414a-8705-de4ed7319e6f`, all3/3 pass, zero skips/flakes/unexpected errors/retries,78.9s          |
| Component/regression | `pnpm --filter @languon/web exec vitest run tests/workspace-learner-preview.test.tsx tests/knowledge-document-groups.test.tsx --maxWorkers=1 --no-file-parallelism`:2 files/6 cases pass |
| Static               | Affected web typecheck, repository lint, final hook/component/page lint and styling contract pass                                                                                        |
| Documentation        | All33 guides/mappings pass; workbook guide revision `sha256:a8cfdde30a544410` synchronized with mapped tests                                                                             |
| Diff                 | Whitespace clean; Next generated declaration restored; unrelated user grammar CSS comment preserved exactly                                                                              |

Browser uses actual application/HTTP plus disposable PostgreSQL/Redis and
deterministic external providers, Chromium1440×1000 and390×844. Tests prove
current title/content, checked menu state, hidden author controls, local answer
reveal, exact desktop scroll restoration, both exit paths, preserved editor DOM
identity/content and focus. Existing runtime guards assert no page/console or
unexpected server errors. Final desktop/mobile screenshots were inspected: clear
mode label/help/Back to editing at top, readable content, no overflow or drag/edit
controls. Artifacts under the run's `interactive-workbooks-artifacts/` include
`document-learner-preview-desktop.png` and `document-learner-preview-mobile.png`.
Raw report SHA-256:
`731eca16030e6dd4f9b9e539651baa96be802931255a9f7be7464ad2806d670c`.
Logs: `/tmp/languon-learner-preview-browser-verified.log`,
`/tmp/languon-learner-preview-unit-final.log`,
`/tmp/languon-learner-preview-types-final.log`,
`/tmp/languon-learner-preview-lint.log`,
`/tmp/languon-learner-preview-styles.log` and
`/tmp/languon-learner-preview-docs.log`.

Historical failures remain separate:03be1c41 passed preview but later timed out
in the unchanged Save to dictionary menu; that path passed both subsequent runs
without a speculative product fix. Screenshot inspection exposed the initial
offscreen preview controls. Run1e9ed1e8 then caught the real scroll-capture timing
issue (545 expected,153 clamped); capture-before-hide fixed it. Final3/3 is a
single clean run, with no skipped checks or weakened scroll/identity assertions.

No production build/database/backend/AI execution gate is required for this
local presentation correction: no dependency, schema, route or execution
boundary changed. The actual browser bundler and affected typecheck cover the
changed frontend composition. No backlog task disposition changes; this restores
the already specified F059 learner-preview presentation. No commit was performed
during implementation.

Independent final evidence verdict: **Approved**, no material finding remains.
The reviewer independently matched the ten-file source fingerprint and raw report
hash, all3 retry-0 passing browser results, both screenshots, static/unit/docs
logs, restored Next declaration and exact preservation of the unrelated user
CSS edit. All acceptance and verification work is complete for this correction;
parent F059 status remains unchanged. The user subsequently requested a local
commit of this correction; the unrelated grammar CSS edit is excluded. No merge
or push requested.

## Remaining risks

Preview is a current-draft simulation, not the currently published shared-link
content. Local practice resets on leaving preview; saved progress is untouched.
