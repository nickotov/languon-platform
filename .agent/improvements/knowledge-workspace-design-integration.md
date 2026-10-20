# Improvement: Knowledge workspace design integration

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20

## Routing and scope

Implement the supplied Magic Patterns design as an existing-contract UX improvement. User explicitly requests exact document presentation plus its layout and tutor refinements. No new backend capability, schema, dependency, permission or external write is authorized or needed. Work stays on the current branch and preserves the uncommitted docked tutor half-width improvement.

Source: https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb — provider v8, artifact `4daa1a0f-1e36-43a3-9dc1-a170e44cd749`. Selected handoff revision v003 retains this returned design; its exact generation prompt is unknown. Prototype code is untrusted visual input and will not be executed or copied as application scaffolding.

Constraints: ADR-0016 runtime evidence, ADR-0029 CSS Modules/tokens, ADR-0030 shell, ADR-0042 private drafts/context/publication. Preserve real recovery, explicit Save, private chats, copied references, proposal target tracking and conflicts. Prototype mock behavior does not change those contracts. Rollback: revert the scoped frontend and guide edits; no migration.

## Acceptance criteria and source inventory

| ID    | Source requirement                                                                                                                      | Owner                          | Planned proof                        | Status   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------ | -------- |
| UI-01 | Full-height document pane; 56px topbar; adjacent right tutor with compact/half-width layouts                                            | Knowledge page/CompanionLayout | Wide/narrow rendered comparison      | Verified |
| UI-02 | Back, single editable title, state badge, private recovery, Share/actions/Save in topbar                                                | WorkspaceHeader                | Header and menus rendered/functional | Verified |
| UI-03 | Separate compact formatting bar, centered optional Details disclosure, white rounded document canvas, 17px/1.75 prose and footer counts | Note form/editor/page          | Populated/empty desktop and mobile   | Verified |
| UI-04 | Selection bubble Ask tutor/Bold/Italic and clear selected-passage context                                                               | Editor/reused tutor            | Select passage, attach, edit safely  | Verified |
| UI-05 | Empty document guidance and outline action, private recovery explanation                                                                | Editor/page                    | Empty draft rendered and actions     | Verified |
| UI-06 | Share popover, document action menu, recovery details, revision history and preserved conflicts                                         | Workspace controls             | Open overlays and real operations    | Verified |
| UI-07 | Tutor document context/composer/message/proposal refinements; real streaming/Stop, model settings and multiple chats preserved          | Contextual assistant           | Docked chat, attachments, proposal   | Verified |
| UI-08 | Mobile editor, horizontal touch toolbar, launcher/bottom sheet; dark/keyboard/error states                                              | Page/editor/tutor              | Mobile/dark rendered comparison      | Verified |

App states absent from the prototype remain supported through existing real operations. Source-specific fake success, automatic prose combination, fabricated recovery, prototype navigation/demo controls and deleted-note chat claims are not adopted.

## Plan and verification

- [x] Retained provider v8 source and manifest; reviewed controlled reference rendering and matching guides/tests.
- [x] Implemented document layout and controls with existing editor/state; source/runtime comparison corrected formatting bar height and Details line-height.
- [x] Integrated tutor/layout refinements in the existing widget, including editor requests and proposal review portal.
- [x] Updated mapped guides/tests for Details, Save, Share, document menu and proposal radios; stable scenario IDs preserved.
- [x] Passed affected web checks and browser journeys; compared retained source and runtime screenshots.
- [x] Completed author preflight, independent review and remediation; final optimized build passed.

Tests: existing editor/proposal unit tests and workspace browser journeys; add behavior coverage only for new presentation paths. Static: web typecheck/lint, styling guard, scoped formatting and build. Browser: desktop populated/empty + disclosures, mobile sheet/toolbar, dark; no database implementation verification because persistence is unchanged. Guide: Knowledge workspace and contextual assistant if shared chat behavior changes. Independent review warranted by editor composition, selection and save/recovery wiring.

## Outcome

## Source reconciliation

- Reference identity and controlled rendering: [captures](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v003/reference/captures.json), [88-file manifest](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v003/reference/source-manifest.json). Browser provider URL was sign-in gated. Reviewed source was bundled with the established cached renderer, with no provider scripts/config execution or production dependency. Twelve provider-empty primitives use the current published inherited design system; exact historical inheritance is unproven. Runtime shared primitives retain accepted semantic tokens under ADR-0016/0029, including primary action color; inherited fallback styles are not a global theme replacement.
- Document source comparison uses desktop1440×1000 and mobile390×844 references. Existing app shell is outside the document design surface: its collapsed72px rail and mobile navigation remain (source rail64px is explicitly schematic). Document canvas812px max inner width, responsive padding, formatting40px/52px, details34px desktop, body17px/1.75, dock380px/50%, and footer32px follow source geometry.
- Source H1 is unavailable in the persisted note schema; source H2/H3 remain through the established editor commands. Ordinary links and tables retain validation and supported real controls.
- Prototype mock operations are replaced with actual recovery/publication/share/copy/history/conflict operations. Accepted ADR-0042 forbids the prototype's automatic prose combination and preserves both private versions until explicit resolution. The existing stale-target comparison/reselection dialog remains authoritative; it accompanies the inline proposal preview rather than replacing newer wording directly after a prototype checkbox. Existing revision restoration preserves the real saved-revision contract and unsaved branch instead of simulating local draft restoration.
- Model/settings/history/Stop/error controls remain because accepted tutor contracts require them even though the simplified document chat omits them. Only private per-note chats and copied references are used.

## Final verification

- Runtime/source identity: base `d44ebca3e26f38f775f0a7df04004653a99bd6fd` plus the integrated uncommitted patch. [Verified source list](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v003/runtime/final-source.sha256) covers114 scoped files; SHA-256 `ec2a97f16edf3ad22fb2c77727eaf31cb7257b2e91a7f6cdb7afeb10215ca495`. Recomputed all114 hashes after the optimized build: all match.
- `pnpm --filter @languon/web typecheck`, full `lint`, `styles:check`, and final `build` passed. Final build compiled in7.1s, completed TypeScript and generated16 static pages including real Knowledge routes. Affected page lint was repeated after the last deleted-target comparison fix; production build verified its types.
- Focused Vitest runs passed38 tests across10 files: editor initialization/target snapshots, workspace recovery, anchor mapping, safe note rendering, proposal mapping, assistant input, proposal review, workspace assistant context, tutor composer, and copied materials. Existing unchanged evidence was reused only for unaffected callers.
- `pnpm docs:user-flows:check` passed16 validator tests and25 guides; both `pnpm user-flow:e2e -- check knowledge-workspace` and `-- check contextual-language-assistant-and-knowledge` pass. Stable scenario IDs retained.
- Scoped Prettier check passed68 changed source/document files; `git diff --check` passed. Frozen source/snapshots are intentionally excluded from formatting. No dependencies, generated output, secrets or unrelated user changes were introduced.
- [Runtime captures](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v003/runtime/captures.json) retain10 screenshots at1440×1000,390×844 and820×1000, including empty/saved/dark/action/share/proposal/sheet/editor states. The main agent inspected source desktop/default/proposal and real empty/populated/proposal/tablet rendering. Different synthetic document lengths and the real app shell are disclosed in the manifest. Browser assertions check unexpected runtime errors/server failures; no unresolved runtime error remains.
- Initial runs exposed restored conflict guidance, sharing focus, target lifecycle and test-only macOS selection/label assumptions. All material app findings were fixed; legitimate assertions were preserved. The selected browser scenarios now pass across the explicitly scoped runs below; a previously failed whole run is not represented as wholly passing.

### Exact mapped browser execution

Every invocation used the registered guarded runner with confirmed exclusive PostgreSQL `127.0.0.1:55444/languon_auth_assistant_web_test`, Redis `127.0.0.1:56444/1`, `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, `ALLOW_DISPOSABLE_REDIS_TESTS=true` and matching `AUTH_TEST_*_CONFIRM` values from the guide. Real web3336/backend4006 use deterministic model fixtures, never paid services. Every invocation's composed HTTP phase passed4/4.

| AUTH_E2E_RUN_ID                                 | Command after confirmed environment                                                                                                     | Result / validity                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace-design-final-20261020`               | `pnpm test:e2e:contextual-assistant`                                                                                                    | HTTP4/4, browser9/10; sharing confirmation later fixed. Unaffected source-chat, recovery/history and conflict journeys remain valid.                                                               |
| `workspace-design-saved-artifact-20261020`      | `pnpm test:e2e:contextual-assistant -- --grep 'an empty workspace'`                                                                     | Browser1/1; settled saved/default/dark/actions/share capture.                                                                                                                                      |
| `workspace-design-remediation-20261020`         | `pnpm test:e2e:contextual-assistant -- --grep 'an empty workspace\|a saved workspace\|a persisted tutor proposal\|the workspace keeps'` | Browser4/4 including sharing focus/copy/revoke. Later proposal/tablet changes are covered below.                                                                                                   |
| `workspace-design-final-review-20261020`        | `pnpm test:e2e:contextual-assistant -- --grep 'the workspace Text picker\|a persisted tutor proposal\|the workspace keeps'`             | Reference case passed full40000 external characters plus independent focus, removal/collapsed cursor and reload. Other cases failed issues subsequently corrected; this run is not wholly passing. |
| `workspace-design-final-target-tablet-20261020` | `pnpm test:e2e:contextual-assistant -- --grep 'a persisted tutor proposal\|the workspace keeps'`                                        | Proposal passed captured target/cursor movement, durable preview, unrelated edit during restored review, replacement/Undo and deleted-target comparison. Tablet test label corrected afterward.    |
| `workspace-design-final-mobile-20261020`        | `pnpm test:e2e:contextual-assistant -- --grep 'the workspace keeps'`                                                                    | Browser1/1: mobile sheet/editor and820px tablet sheet, fold to document review and accepted Append.                                                                                                |

Source fingerprints match the final application patch. The later changes affect the documented proposal/selection/tablet branches; their final scenarios were rerun. Sharing, publication, nonworkspace chat, recovery and other unchanged branches retain valid earlier successful execution.

The main agent additionally used project-pinned guarded `agent-browser`0.33.0 on synthetic local data: session `languon-workspace-design-472ad5a35413f662beabe950a39210ba`, signup→new draft→title/body editing→collapsed sidebar at1440×1000. Screenshots informed the final source geometry fixes; final screenshots above supersede the earlier manual capture. The session is closed. Reference server4413 and test-owned web/backend services are stopped; existing disposable containers were preserved, and synthetic rows remain per the runner guard.

## Review verdict and remaining risks

Independent reviewer `/root/workspace_design_review` reviewed the complete scoped diff and then the remediation paths/callers/evidence. Final verdict: **Pass**, no remaining critical/high/medium findings; final820px browser proof passed and the optimized build condition is now satisfied. Separate security review was not triggered: no material trust boundary, HTML sanitization, permission or backend/model tool behavior changed. Selection and sharing operations retain existing validated boundaries.

UI-01–UI-08 are implemented and verified within the recorded runtime/primitive qualifications. No known material implementation risk remains. Historical inherited design-system identity cannot be proven beyond the retained current primitive artifact; that limits an unqualified historical pixel-for-pixel claim. No new feature or strategic choice is implied. No commit, merge or push was requested or performed.

## Independent review and remediation

The independent review found selection lifecycle and tablet caller risks not covered by initial presentation checks. Remediation added focused real editor/hook regressions and strengthened existing browser scenarios instead of broadening the product scope.

| Finding                                                            | Resolution                                                                                                                                                                  | Proof                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| R1 — Ask tutor could target a later cursor at Send                 | Capture tracked target at Ask; snapshot that mapped target with latest full body at Send                                                                                    | Editor snapshot regression and A-to-B cursor browser request assertions           |
| R2 — Focus passage duplicated as a copied reference                | Separate pending editor passage from external copied references; use existing persisted anchor for sent preview; reject changed-before-Send focus without dropping composer | Hook tests, full40000-reference-plus-focus browser request, sent/reloaded wrapper |
| R3 — Tablet768–1023 opened floating chat                           | Workspace uses bottom sheet through1023; nonworkspace placement unchanged                                                                                                   | 820px sheet journey                                                               |
| R4 — Restored target was re-resolved after unrelated edits         | Acceptance reuses the live tracked target restored for review                                                                                                               | Reload/open review/edit tail/replace browser case                                 |
| R5 — Tablet proposal remained behind sheet                         | Fold-for-review uses the workspace1023 breakpoint                                                                                                                           | 820px proposal opens editor review and applies                                    |
| R6 — Removed chip left hidden selection target                     | Explicit null snapshot captures a collapsed cursor without changing visible editor selection                                                                                | Editor/hook tests and remove-chip/send/reload browser assertions                  |
| R7 — Deleting a nonactive history row cleared active passage       | Clear pending selection only when active conversation changes; retain it for unrelated history deletion                                                                     | Hook lifecycle regression                                                         |
| R8 — Stale selection validation remained after reselection/removal | Clear only selection validation, preserving external reference limit errors                                                                                                 | Focused hook assertions                                                           |
| R9 — Sharing controls lost focus while being replaced              | Focus stable popover panel before replacing/disabling focused controls                                                                                                      | Real sharing enable/confirm/revoke case                                           |

Touched existing orchestration files above250 lines remain cohesive coordinators: page actions264 lines joins established recovery/publication/navigation operations (only snapshot forwarding changes); assistant panel coordinates existing chat/preparation/preferences/deletion while selection lifecycle is extracted to a dedicated hook; proposal review keeps one interaction with localized copy, modes and preview extracted. Further arbitrary splitting would obscure their narrow typed action contracts.
