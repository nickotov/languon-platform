# Improvement: Product UI design quality and dictionary snippet disclosure

Status: Complete
Created: 2026-11-11
Updated: 2026-11-11

## Routing and authority

This is an improvement: agent tooling/design guidance and presentation of the
existing dictionary-chat review/insertion journey. No new server capability,
endpoint, persisted domain schema, auth policy, runtime dependency or migration
is proposed. User explicitly requested research, agreement before adoption, then
DictionarySnippetCard changes. User approved the recommendation and compact UI
direction on2026-11-11 and additionally required isolated stories for shared UI
and meaningful presentational leaves (chat items, dictionary cards/text and editor
blocks), without whole-chat stories. Implementation is authorized.
If implementation reveals a feature boundary, retain findings and apply root
classification before expanding scope.

## Outcome and scope

Prevent functionally complete but cumbersome UI by making hierarchy, realistic
content volume, disclosure and first-use/revisit behavior explicit design inputs.
Research alternatives, propose a project-native design role and references, then
apply the agreed workflow to snippet previews. Keep runtime design-system
authority, existing frontend architecture and deterministic insertion behavior.

Evidence and proposal: [survey](../../docs/surveys/product-ui-design-skills.md).
Read feature063's specification/plan, dictionary snippet guide, ADR0016/0029/0054,
the current composition skill/references, runtime tokens, shared primitives,
snippet source and existing component/browser coverage.

## Acceptance

- AC1: Compare current primary-source skill instructions and project gaps;
  distinguish verified capabilities, recommendation and unmeasured claims.
- AC2: Adopt only the user's selected setup, with concise authority, triggers,
  provenance and observable review criteria; avoid duplicate design systems.
- AC3: Implement the approved compact/foldable outer artifact and item previews,
  first-generation versus historical-open state, clear grouping and reachable
  controls while preserving selection/application/retry behavior.
- AC4: Focused instruction, component, real-browser and guide evidence validates
  the changed behavior without unrelated backend/AI regression work.

## Plan and verification

- [x] Research five external candidates and current project guidance/source.
- [x] Save source-linked recommendation, concrete adoption scope and UI proposal.
- [x] Receive user's selection and presentational-story addition.
- [x] Adopt agreed instruction/role changes and validate packaging/decision probe.
- [x] Implement approved snippet presentation with focused component coverage.
- [x] Review real50-card rendering, disclosure lifecycle and action reachability;
      update applicable guide/mapping and complete scoped preflight.

## Approved implementation and checks (before product edits)

Survey wireframe is approved. Extend current chat disclosure, shared controls and
semantic surfaces. Newly completed visible-chat snippets open once; history/reload
and reopened chat start compact; manual fold survives refetch. Rows start compact,
with independent selection/disclosure. Keep actions reachable for large results,
retaining source order/selection. Controller owns mutations; a cohesive view owns
isolated stories. No persistence/API changes or real-model generation.

Root owns instructions/provenance and shared compilation/infrastructure. A frontend
worker owns snippet slice, focused component tests and colocated stories. A bounded
journey worker can update guide/E2E without overlapping product edits.

Selected checks: both changed skills' quick_validate.py and pnpm agent-skills:check
(<10s), a fresh read-only design probe (~1–3min, no comparison claim); exact snippet
web Vitest file (<30s); scoped lint/Prettier/style, web typecheck (~30s) and Storybook
build (~30–90s), root single owner. Real story browser at narrow/desktop with50
cards, relevant theme/selection/error states (~2–4min). Update mapped E2E for
compact history and run only pnpm test:e2e:critical -- --flow dictionary-chat-snippets
(~2min, real Next/backend/PG and fake externalHTTP). Guide/mapping/docs checks
(<15s). Independent completion review targets disclosure lifecycle/story isolation;
UI critique examines actual render. Reuse unaffected proof; no full backend/AI
suite, no new dependencies. Reassess recurring setup failure before rerunning.

No agents, external packages, binaries, hooks, env changes or application code
were installed/modified during research. Sources are untrusted research evidence,
not activated instructions. No comparative design benchmark has been run.

## Instruction evidence and current progress

Baseline: c2bbe761; initial dirty state contained only the preceding approved
research record/survey/index. Adopted the local product-UI reference, read-only
ui-designer role, routing and shared/presentational story boundary. Pinned upstream
revisions and license/notice files are recorded in docs/agent-skills.md; no upstream
engine/hooks installed. Fixed the directly relevant stale Tailwind guidance in the
existing catalog section to accepted ADR0029.

Both changed skills passed quick_validate.py via the existing cached offline
PyYAML environment: `uv run --offline --with pyyaml python
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
<skill-folder>`. Initial plain Python lacked YAML; no dependency was added.
`pnpm agent-skills:check`:10 validator tests and27 packages passed. Scoped
formatting and new role TOML parsing passed.

[Fresh-context probe](evidence/product-ui-design-quality/design-probe.md) followed
the revised skill and role, used source and the raw screenshot, returned a coherent
hierarchy/lifecycle/story plan and made no writes/delegation/runtime claims. It
identified the key density/disclosure failures. This shared-checkout read-only
probe validates decisions only; no old-versus-new quality or efficiency claim.

Owned Storybook is running on loopback6007; safe browser wrapper session is
`languon-product-ui-stories-103a3f2df15933727b6384482a6c3b39`. Initial launch in
sandbox could not bind; loopback permission resolved it. Root closed the owned inspection browser after verification. Storybook remains on loopback6007 for the user to inspect the requested catalog. The critical runner cleaned its own PG/Redis/services.

## Initial delivery evidence (before scroll/motion follow-up)

The controller retains existing mutation/Replace/retry logic and renders the actual
network-free DictionarySnippetView used by nine colocated stories under
Dictionary/Chat snippet. Compact summary has title/languages/count; entries show
source/translation and independently reveal full immutable fields. Large snippets
initially paged10 rows with all-source selection retained (superseded by the follow-up below). Top and bottom insertion groups
and focus-restoring lower Collapse keep controls reachable. Pending/error/retry
remain outside hidden content. Existing hidden-but-mounted tutor now passes its
visibility into presentation-only disclosure state. Initial history stays compact;
visible publication opens once, with ordering protection for event-before-row,
row-before-event, hidden completion, manual choice and reconciliation.

| Evidence             | Exact selection/result                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1–2                | Source-linked survey; pinned guidance/notice provenance; both skill quick validators pass; agent-skills10/10 tests,27 packages; role TOML parsed; fresh read-only decision probe                                                                                                                               |
| AC3–4 components     | pnpm --filter @languon/web exec vitest run tests/dictionary-chat-snippets.test.tsx:14/14,2.39s; /private/tmp/languon-snippet-ui-components.log                                                                                                                                                                 |
| Static               | Scoped slice/test/E2E/panel ESLint, Prettier and gitdiffcheck pass; pnpm styles:check passes; final web typecheck exit0 (/private/tmp/languon-ui-web-types-final.log)                                                                                                                                          |
| Catalog              | pnpm --filter @languon/web storybook:build passes; nine new actual-view stories; /private/tmp/languon-ui-storybook-build-final.log; Vite built in1m49s with non-blocking catalog chunk/plugin timing warnings                                                                                                  |
| Runtime/story design | Safe pinned agent-browser/Chromium through owned wrapper,127.0.0.1:6007. Inspected390×844 light French/Russian50 cards, compact, pagination/selection, recovery while compact;1440×900 dark detail. Final screenshots test-results/ui-design-quality/{fifty-narrow-final,dark-detail-final,compact-narrow}.png |
| Real app             | pnpm test:e2e:critical -- --flow dictionary-chat-snippets:1 passed/no skips, runc0decea7-4efc-4bba-bfb5-312491f5bc5e. Total44.849s; setup5.609s/execution37.454s/cleanup1.337s; body17.9s. Actual Next/backend/PG, deterministic external AI HTTP; strict console/network/page/transport assertions passed     |
| Guide                | Stable scenario owned-chat-review-and-apply-snippets, revisiona15d356e50e901ec; mapping and docs checks passed (16 validator tests,34 guides). No backend fixture changes                                                                                                                                      |

Root inspected the final real-app narrow screenshot; the compact rows and distinct
summary fit the tutor panel with no horizontal overflow. Final journey exercises
new generation, entry keyboard disclosure without selection changes, lower collapse
with header focus, selection retained on reopen, reload/reopened-chat compact,
manual fold through apply/refetch, old-generation settings, duplicates, ordered
insertion, Replace Escape/cancel/confirmation, archival history and normal editing.
App artifacts are under test-results/critical-flows/c0decea7-4efc-4bba-bfb5-312491f5bc5e/.

[Initial input/report manifest](evidence/product-ui-design-quality/verification.json)
retains exact source/report hashes. Raw reports/screenshots remain local ignored
verification artifacts. No env/dependency/backend/accounting/provider change or
paid generation. A full app/backend suite was not selected because the changed
invariants are frontend composition/lifecycle and agent instructions.

## Review and remediation

Independent UI rendered critique found one Major reachability gap: top-only actions
were offscreen after reviewing ten rows/details. Added reused bottom action group
and focus-restoring Collapse; reviewer inspected final light/dark screenshots and
closed the finding with no new material visual issues. Optional duplicate
source/translation labels inside an expanded full-field detail were retained as
explicit complete-field presentation; compact rows already avoid the original
repetition/density problem. Root additionally corrected essential translation text
from Checkbox's tertiary3.64:1 onwhite to local secondary5.98:1, using existing
semantic tokens and without changing shared Checkbox behavior.

Initial independent completion/source review found no material defect across
instructions/role, complete frontend diff, lifecycle orderings and story isolation.
Final bounded evidence approval returned2026-11-11 from product_ui_completion_review: all26 scoped source hashes and10 report hashes match, AC1–AC4 are supported, no material findings. UI rendered reviewer ui_render_critique closed the reachability remedy. No separate tester/security review
expansion was indicated: no new harness, auth/trust policy, model tools or persisted
behavior changed. This is not approval of inherited release/main blockers.

The first catalog build passed, but the visual remedy changed its source, so the
final catalog build was rerun. Focused initial component query repairs corrected
accessible-name whitespace and a status query accidentally matching ToastHost;
no legitimate assertions were removed. Review repairs were batched before final
checks. Formal cost/quality comparison and post-user-acceptance retrospective
remain unmeasured/pending; do not infer savings from this delivery.

## Rollback and remaining risks

Research documents can be removed independently. Future role/reference changes
remain project-local and removable without runtime or data migration. Aesthetic
guidance cannot guarantee quality; the representative rendered pilot and an
independent task-focused critique are the proposed acceptance evidence.

The user's screenshot also shows reconnection status; this record makes no
transport diagnosis. Main/release qualification inherited from prior work stays
outside this presentation/tooling improvement. No automatic commit or merge.

## User follow-up: bounded scroll and purposeful motion (2026-11-11)

User accepted the prior direction with two changes: no pagination; use a scrollable
item list limited to50vh desktop and70vh mobile. Add simple expand/collapse motion
and make purposeful interaction motion an explicit UI rule. This continues the
same improvement and reopens only affected presentation/evidence. Original
verification.json remains historical accepted-state evidence, not current proof.

Direction before edits: existing1024px mobile/desktop breakpoint; all up-to100
rows in one labeled keyboard-focusable list with native scroll and retained
selection. Top/bottom actions stay outside the list. Outer and entry disclosure
use the existing200ms/easing tokens for height/opacity and chevron rotation, with
inert/aria-hidden immediate on close, focus restored, and zero transition for
reduced motion. Keep content mounted so exit animation can finish. No libraries,
timers, API, mutation, worker or persistence changes.

Checks: exact component test file (14 cases, ~3s), web types/scoped ESLint/style/
format (~15s), changed skill metadata/validator (~1s); real Storybook50-card
390/1440 render and keyboard/scroll/collapse (~2min), existing critical snippet
journey with viewport/motion assertions (~45s), guide/mapping checks (~2s). Reuse
unchanged prior evidence; no full catalog build for this bounded view/CSS repair
(no catalog/plugin/dependency changes): actual Vite stories and Next journey
exercise the current modules. Existing completion/UI reviewers assess only the
repair and its evidence, not a fresh whole-source review. Source snapshot for
remediation boundary: /private/tmp/languon-ui-scroll-before/.

### Follow-up implementation and focused preflight

All items are now rendered in one labeled, focusable native scroll list:50vh
desktop (>=1024px),70vh mobile, with top/bottom controls outside the scroll area.
Pagination state/controls/copy were removed. Outer and entry panels stay mounted
for200ms grid/opacity exit transitions with rotating chevrons, immediate
aria-hidden/inert, and instant reduced-motion fallback. Source/translation-only
entries do not mount an empty detail region. Selection, scroll position and row
state persist through folding. General UI skill and review checklist explicitly
require purposeful simple state motion and accessible reduced-motion behavior.

Updated100-card component case verifies all101 checkboxes, no Next control,
keyboard-focusable list and ordered selection[1,99].14/14 focused tests pass in
8.21s (/private/tmp/languon-ui-scroll-components-final.log). An initial failed
case exposed duplicate text in an unused hidden detail panel for required-fields-
only cards; that panel is now correctly absent, retaining the original assertion.

Safe-browserStorybook observed desktop list450px at1440x900 and mobile590.796875px
at390x844. Native End reached card49 inside the scroll area; bottom controls remain
outside it. Screenshots test-results/ui-design-quality/scroll-motion/{desktop-50vh,
mobile-70vh-end}.png. Browser sessionlanguon-snippet-scroll-motion-43a9586918157891a9de9123c88b0b2d
was root-owned and closed after an empty browser-error report; shared preview server remains.

First critical run0f947ce1-c02e-4020-86bb-da9d826ec7eb failed its new End-to-bottom
assertion: End was sent while detail height was still expanding, then the test
compared its earlier destination with the later scroll range. Preserved report
/private/tmp/languon-ui-scroll-critical.log and trace/screenshot. Added a natural
wait for active subtree CSS animations' finished promises before the stable-layout
keyboard assertion; no sleeps, timeouts or weaker checks. At that stage UI-SCROLL-001 awaited the same-case rerun/evidence review; it was not a confirmed native-keyboard defect.

### Follow-up final evidence

Current manifest: [verification-scroll-motion.json](evidence/product-ui-design-quality/verification-scroll-motion.json).
14/14 components, final web typecheck, scoped ESLint/Prettier/diff, style contract,
changed skill quick validator and27-package/10-test validation passed. Guide
revision8ad3091aa2f1a02c and mappings/docs are current (16 tests/34 guides).

Final single critical journey passed with no skips; report/run details are in the
current manifest and /private/tmp/languon-ui-scroll-critical-final.log. It proves
50/70vh computed bounds, actual overflow, native End and Tab-to-last reachability,
normal200ms grid transitions, reduced-motion<=1ms, inert/aria-hidden on close,
retained selection/focus/history and all existing insertion/Replace/network checks.
Waiting for actual animation completion resolved the test's changing-geometry race
without adding custom key handlers or weakening checks. UI-SCROLL-001 is closed as a test geometry race. Final bounded completion review approved the follow-up, verifying all27 source hashes and8 report hashes with no material findings.

ui_render_critique inspected current50-card desktop/mobile screenshots and found
no material visual regression. Both action groups and clear focus/row grouping
remain usable. No new full catalog build or backend/provider suites were run: this
follow-up changes only existing view/CSS/rules, proven through actual Vite/Next
rendering plus source types. Earlier full-catalog report remains historical.

## Accepted-delivery retrospective

User requested commit after the scroll/motion follow-up. Main avoidable rework was
leaving collection navigation and disclosure motion implicit in the first pass.
Future UI briefs should settle scrolling bounds and purposeful enter/exit behavior
with representative content. The fresh visual critique caught bottom-action
reachability before handoff. Focused component tests plus one existing real-app
journey covered the repair; the follow-up reused unaffected catalog evidence.
No comparative time/token or design-quality benchmark was performed.
