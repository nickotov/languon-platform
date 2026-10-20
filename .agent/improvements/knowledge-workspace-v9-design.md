# Improvement: Knowledge workspace v9 design

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20

## Scope and authority

Implement the user's updated Magic Patterns design as a cohesive existing-contract UI improvement. Current branch; preserve all prior uncommitted work; no commit requested. Source https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb, provider v9 “Build Approved Knowledge Editor Plan”, artifact `8e368152-98f3-4835-a922-79272a54cc7a`, retained as handoff v004. Actual generation prompt unknown. Default source direction is `ai-native`; alternative demo directions, simulated keyboard, mock data/navigation and demo controls are scaffolding.

Constraints: ADR-0016 real-browser evidence, ADR-0029 CSS Modules/tokens, ADR-0030 existing app shell, ADR-0042 working drafts/publication/context/privacy. No backend, schema, production dependency or trust-boundary changes. User explicitly chose to preserve full-document snapshots and follow source Chat layout up to60% (with source480px minimum document width). The source selection-only toggle is deliberately replaced by accurate full-document context information, per that decision. Source fake conflict merging/recovery/copy/defaults cannot replace real operations.

## Acceptance and source fidelity inventory

| ID    | Supplied v9 section/state                                                                                                          | Runtime owner            | Verification                                                | Status   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- | -------- |
| V9-01 | Open white document canvas, growing in-canvas title, centered prose, quiet optional properties chips/popovers                      | Knowledge form/editor    | Desktop populated/empty/properties and narrow captures      | Verified |
| V9-02 | 48px topbar with Back, title breadcrumb after scrolling, unified save/recovery status, Save/menu/sharing                           | Knowledge page/header    | Scroll/actions and real save/recovery/sharing               | Verified |
| V9-03 | Compact centered formatting toolbar and selection bubble Ask/Explain/Correct/Translate/more/Simplify/Rephrase/Examples/Bold/Italic | Knowledge editor         | Selection actions and formatting with captured target       | Verified |
| V9-04 | Focus/Split/Chat segmented layout controls and resizer, narrow fallback                                                            | Companion/page           | Keyboard layouts/drag/narrow                                | Verified |
| V9-05 | Compact empty writing/outline/lesson/language starter actions                                                                      | Knowledge editor         | Empty state and real undoable template/outline              | Verified |
| V9-06 | Tutor 48px action header and document-context line, new chat/close                                                                 | Reused assistant shell   | Desktop chat/history                                        | Verified |
| V9-07 | Quiet tutor empty prompts, message actions, suggestion cards, inline/full proposal review                                          | Reused assistant/editor  | Real streaming/explicit accept/undo/stale-target comparison | Verified |
| V9-08 | Minimal composer with references, submit/stop and settings popover                                                                 | Reused assistant         | References/preferences/limits/failures                      | Verified |
| V9-09 | Mobile Document/Tutor tabs and touch controls, preserved editor/chat                                                               | Knowledge page/assistant | Mobile tabs/proposal navigation/tablet                      | Verified |
| V9-10 | Dark mode, loading/error/conflicts/history/share and responsive long content                                                       | Real existing components | Representative dark/overlays/mapped journeys                | Verified |

Existing server private draft recovery, multiple chats/deletion, explicit save/copy, sharing/privacy, snapshots and proposal target tracking remain authoritative. Record source/runtime differences here with authority and evidence.

## Plan

- [x] Resolve provider identity and retain full source v004 without overwriting v003.
- [x] Inspect complete source/runtime mapping; controlled reference rendering and manifest.
- [x] Implement editor, topbar/layout/mobile and reused tutor with existing primitives.
- [x] Synchronize guides/tests, focused static/unit/browser and source/runtime comparisons.
- [x] Independent review/remediation/final build; record hashes/evidence/limitations.

Verification: workspace editor/hook/proposal tests and affected mapped workspace/contextual tutor browser journeys. Compare desktop empty/populated/properties/layout/proposals, mobile tabs and dark. No separate database/security verification for presentation alone; guarded deterministic fixtures. Rollback: revert only this revision's frontend/docs changes; no migration.

## Evidence, review and limitations

Current v004 source/reference/runtime artifacts and final verification are recorded below. Historical v003 evidence remains separate.

## Recorded source adaptations

- User selected default `ai-native` design, full-document context and Chat up to60%; Split follows340..560px/source available-area bounds. Tablet768–1023 uses380px nonmodal overlay, mobile<=767 uses Document/Tutor tabs.
- Existing app shell/navigation remains the real ADR-0030 shell; source64px schematic rail and prototype scenario/direction controls are excluded.
- Actual stored editor schema supports H2/H3, so its valid heading choices remain; prototype H1 cannot be inserted as unsupported persisted data.
- Real assistant replies are text/Markdown rather than the prototype's prewritten structured edit objects. Proposal previews use actual generated content and captured target; explicit review/acceptance/Undo and stale-target comparison remain mandatory. No fake structured response or successful persistence is introduced.
- Source conflict auto-combination, fake private defaults, simulated keyboard, fabricated history/recovery and fake copy navigation are replaced by established actual operations. Last explicitly saved content remains the shared version.

## Author preflight

Editor9 focused tests and tutor22 focused tests pass; widget/feature/page/shared scoped lint, web typecheck and styling contract pass. Existing mapped user-flow revisions synchronized; docs validation passes. Full deterministic guarded browser suite is running against this revision. Source/reference identity retained at v004/source-manifest.json and reference/captures.json. Final runtime hashes and visual comparison pending.

## Independent review and remediation

Initial independent reviewer `/root/v9_review` assessed the v004 delta over the already-reviewed v003/resize baseline; later expanded to feature048 mode contracts after author preflight. Source UI findings were resolved in one bounded remediation batch:

| Finding                                                  | Resolution                                                                                    | Verification                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| V9-R1 ineffective workspace half-width menu              | Removed in favor of supplied layout modes; generic detached/source behavior retained          | Source/lint; browser pending                 |
| V9-R2 persisted Focus blocked mobile Tutor               | Tutor tab pointer/keyboard selection restores Split                                           | Mobile regression pending                    |
| V9-R3 duplicate floating workspace launcher/lost focus   | Suppress attached workspace pill; Close focuses stable Focus/Document control                 | Source/lint; browser pending                 |
| V9-R4 overlapping one-shot AI requests                   | Actual tutor busy state disables selection/starter actions; auto-send waits matching snapshot | Focused tests pass                           |
| V9-R5 tab controls lacked panel semantics                | Stable tab/panel ids; real mobile-only labelled tabpanels                                     | Source/lint; browser ARIA regression pending |
| V9-R6 sidebar reduced inline document below480px         | Observe actual workspace area; inline requires820px; otherwise use source overlay             | Boundary1023/1024/1060 browser pending       |
| V9-R7 selected passage toolbar clipped near scroller top | Clamp to visible scroller, flip above/below and update on scroll/resize/selection             | Four geometry tests + browser pending        |
| V9-R8 AI outline starter only prefilled                  | Mark request autoSend; submit once with full snapshot                                         | Auto-send tests + browser pending            |
| V9-R9 persisted Chat made disabled radio selected        | Expose effective Split when Chat unavailable; retain desktop preference                       | Viewport/keyboard regression pending         |

Observed proposal keyboard failure was a synthetic fixture focus sequence interacting with pinned ProseMirror's200ms focus-recovery guard. Read-only event traces proved native ArrowLeft collapsed the selection before ProseMirror restored it; activating the editor with a real pointer click reproduces user interaction and preserves all original selection/payload assertions. No production keyboard workaround or DOM selection mutation was added. Temporary listeners removed; diagnostic evidence retained.

The first browser run passed7/10; three cases required updated geometry/selection/slot assertions. A later proposal run was contaminated by a watched contracts rebuild and is explicitly not a passing final run. Final evidence is generated only after all runtime source is frozen.

## Authorized mode feature

User subsequently explicitly selected persistent modes as a feature. [Feature048](../features/048-persistent-tutor-modes/FEATURE.md) records that scope and its required branch/review/local integration. The v9 visual inventory remains authoritative here, with mode controls backed by real server preferences rather than source mock state. Current branch is now `feature/persistent-tutor-modes`; the earlier authorized workspace changes are preserved prerequisites, not unrelated cleanup.

## Final source/runtime verification

Source provider v9/artifact identity is frozen in [source manifest](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v004/source-manifest.json). Controlled reference rendering/captures are retained in [reference captures](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v004/reference/captures.json). Final [runtime artifacts](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/) cover desktop1440×1000 empty/populated/properties/actions/share/dark/settings, Chat/custom-width layouts, inline/full proposals and scrolling selection; mobile390×844 Document/Tutor/outline/review; tablet820 and available-width boundary1023/1024/1060. The main agent inspected actual reference/default and final runtime saved/settings/inline/mobile images; runtime title/prose,48px topbars, open canvas, quiet properties, compact toolbar,440px inline card and supplied action ordering match within the source qualifications below.

All10 existing mapped journeys have valid final behavior evidence across scoped runs. `workspace-v9-final-20261020` passed8/10; `workspace-v9-final-scoped-20261020` passed legacy Stop/Retry and final inline/overlay proposal; `workspace-v9-final-settings-20261020` passed the two remaining source/mode and document-layout scenarios; a final unchanged-source draft capture run passed1/1 and retained images durably after build cleanup. Every guarded invocation's backend preflight passed4/4. Failed/contaminated attempts are not represented as wholly passing. Source hashes and compact exact selections/results are retained by the runtime manifest and [Feature048 evidence](../features/048-persistent-tutor-modes/EVIDENCE.md).

Final web lint/typecheck/styles/optimized build passed. Editor and tutor focused tests include templates/properties/bubble geometry/target mapping/auto-send/inline restoration/modes/pending focus/operation-specific retry; final bounded settings copy tests passed19/19. Backend/contracts/isolated database and security evidence for the authorized mode feature is linked above. No paid model call, deployment or external design write occurred.

### Source qualifications and preserved contracts

- Prototype shell64px rail is schematic; the established ADR-0030 Languon shell remains (desktop expanded240px/sidebar, mobile navigation). Layout adapts to actual available area to preserve source minimum document width. Different synthetic English content versus reference Russian content is explicit; screenshots do not claim identical prose wrapping.
- Twelve provider-empty primitive files use the retained current published inherited design-system implementation for controlled reference rendering; exact historical inheritance is unproven. Its Button uses unbound `--color-primary` with a slate900 fallback, which appears black in that controlled renderer. Runtime keeps the accepted semantic primary token under ADR-0029, as in the prior qualified integration; this fallback is not proof of an authored new global theme. Inline AI Accept explicitly uses the primary accent in supplied source and runtime.
- User explicitly retained full-document snapshots, so context is truthful read-only information rather than the prototype selection-only toggle. Existing reply-language choice and actual model catalog remain available in settings instead of fabricated mock models. Real history/deletion/detachment remain in More; tool/data/privacy rules are unchanged.
- Stored editor validation supports H2/H3; unsupported source H1 is not inserted. Real model prose/Markdown is used instead of mock structured correction fragments. Source fake automatic conflict combining is replaced by the established explicit manual conflict resolution. These preserve accepted contracts and earlier user decisions.
- Chromium desktop/mobile/tablet rendering is verified; actual native on-screen keyboard and other browser engines were not exercised. RTL layout logic is source-reviewed, with no currently supported RTL locale. These are residual platform coverage limits, not unverified supplied controls.

## Remaining completion work

Independent expanded completion and security reviews pass; all material findings resolved. Durable18 runtime/10 reference captures, compact run results and final source hashes are retained. All required application checks pass. Required local feature integration follows Feature048; no application source changes remain. Prior authorized workspace changes are retained as prerequisites; no unrelated cleanup was included.

Final reviewer verdict: [Feature048 REVIEW.md](../features/048-persistent-tutor-modes/REVIEW.md). V9-R10 available-width overlay review and MODE-R1 settings retry/scope/focus/copy remediation pass; final browser proof includes the actual1024px fallback. Final [results](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/results.json) and [captures](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/captures.json) identify exact scenarios, qualifications and hashes. Reference/runtime assets were retained before final handoff; temporary local logs are not the durable evidence contract.
