# Improvement: Texts UI and shared popover reliability

Status: Complete
Created: 2026-10-16
Updated: 2026-10-16

## Routing and scope

Existing-contract UX improvement: repair Texts spacing, formatting, transient errors,
responsive icon actions and selection collection overlays, and shared popover portal,
collision and focus behavior throughout web. No new journey, public API, persistence,
security policy, production dependency or deployment. Existing Floating UI and native
popover capabilities are sufficient. Work stays on current main without commits.
Authoritative baseline: 0e07c3c; initial tree clean. Preserve selected Texts v003 source
and earlier feature evidence. The user's desktop icon-only request supersedes v003
labels for affected Texts actions; mobile retains labels. Test account supplied by user
is authorized for local browser verification; never retain credentials in artifacts.

Constraints: apps/web/AGENTS.md, ADR-0016/0029, frontend-development and UI composition.
Related guide: docs/user-flows/texts.md; inspect mapping before changing documented
behavior. Rollback: revert this focused uncommitted UI patch; no data changes.

## Acceptance criteria

- AC-1: Folder rows have visible spacing and Texts source has clear logical formatting.
- AC-2: Texts icon-and-label actions show icons with accessible tooltip labels on desktop;
  mobile preserves labels. Plain-text actions preserve their appearance.
- AC-3: Resolved validation/generation/save errors disappear after corrective success.
- AC-4: Selection trigger follows the selected word; collection panel stays inside the
  viewport including fullscreen reader, scrolling and narrow screens.
- AC-5: Shared popovers portal to body with measured collision-aware placement, dismiss
  and keyboard/focus behavior, including other consumers and native modal dialogs.
- AC-6: Careful rendered desktop/mobile checks, meaningful regression tests and independent
  review cover the final patch; no credentials, paid-model tests or unrelated changes.

## Plan and verification

- Inspect shared primitives and all consumers, Texts state paths and reference constraints.
- Implement shared overlays and Texts fixes in non-overlapping ownership areas.
- Verify pure error/selection cases with focused tests; rendered placement/focus/overflow
  with maintained browser tests and local browser inspection. Run affected types/lint/styles.
- Update guide only where observable documented behavior changes; check traceability.
- Author preflight, independent correctness/coverage review, remediation and final evidence.

Database verification is unnecessary: no persistence changes. Existing deterministic
Texts E2E fixtures may require disposable infrastructure; never reset development data.
Security review only if implementation materially changes a trust boundary.

## Progress and evidence

Initial discovery: legacy Popover remains inline while compound content portals with
an optional dialog host. Text reading explicitly uses dialog host. Both paths already
use Floating UI; unify and verify native top-layer interaction before removing host.

## Remaining work / risks

All acceptance criteria verified. Native modal overlays use the automatic modal-host
exception documented below; real browser click/focus evidence confirms it. No open
material review findings. Chromium was exercised; no additional browser-engine matrix
was required for this focused improvement.

## Texts layout, responsive actions, and readability audit (UI worker)

Inspected the following inventory in deterministic path order. Paths below are relative to `apps/web/src/fsd/`; every listed source body was read, not merely formatted.

- `pages/texts/ui/folder-page/`: `folder-dialogs.tsx`, `folder-header.tsx`, `folder-page.module.css`, `folder-page.tsx`, `folder-text-list.tsx`, `text-row.tsx`. Added logical groups, opted icon-and-label actions into shared responsive behavior; rows/skeletons now own rounded borders with a parent 12px grid gap instead of fused divided rows.
- `pages/texts/ui/library-page/`: `folder-card.tsx`, `folder-grid.tsx`, `library-page.module.css`, `library-page.tsx`. Added function/derivation spacing and responsive icon actions. Existing grid/card geometry retained after inspection.
- `pages/texts/ui/public-page/`: `copy-dialog.module.css`, `copy-dialog.tsx`, `public-folder.tsx`, `public-header.tsx`, `public-page.module.css`, `reader-header.tsx`, `shared-texts-page.tsx`, `sign-in-dialog.tsx`, `unavailable.module.css`, `unavailable.tsx`. Added logical groups; copy/sign-in/read/back icon actions use responsive Button/ButtonLink. Plain-text actions remain full labels. Existing styles inspected and retained.
- `pages/texts/ui/workspace-page/`: `workspace-actions.tsx`, `workspace-banners.tsx`, `workspace-compose.tsx`, `workspace-confirm.tsx`, `workspace-copy.ts`, `workspace-header.tsx`, `workspace-languages.tsx`, `workspace-page.module.css`, `workspace-page.tsx`, `workspace-pair-editor.tsx`. Added logical groups and separate CSS blocks, responsive icon actions, wrapping/gapped banner actions; removed nested proposal-title/menu-array/loading branches. Validation banner defensively requires invalid current workspace input. Root owns error-state hook behavior.
- `pages/texts/hooks/`: `use-shared-text-copy.ts`, `use-shared-text.ts`, `use-text-folder.ts`, `use-text-library.ts`, `use-text-workspace-data.ts`, `use-text-workspace-expiry.ts`, `use-text-workspace-job.ts`, `use-text-workspace-session.ts`. Inspected query/session/job/copy bodies; added boundaries between setup, effects, operations and return. No request/state semantics changed. Root-owned `use-text-workspace.ts` and `use-text-workspace-save.ts` excluded from worker edits.
- `features/text-reading/hooks/`: `use-collect.ts`, `use-collection-jobs.ts`, `use-reading-copy.ts`. Added operation/effect spacing; collection job terminal status uses explicit branches instead of nested ternary. Memoized workspace session request remains intentional because consumer effect/query lifetimes use its identity.
- `features/text-reading/lib/`: `collection-failure.ts`, `reading-fragment.ts`, `wait-for-poll.ts`; `features/text-reading/index.ts`. Inspected; existing focused responsibilities retained (spacing only where needed). Root-owned `types.ts` and `lib/selection.ts` excluded.
- `features/text-reading/ui/collect-panel/`: `collect-panel.module.css`, `collect-panel.tsx`, `dictionary-choices.tsx`, `duplicate-preview.tsx`. Named handlers replace inline JSX callbacks; dictionary matches calculated once; duplicate preview uses explicit loading/found/failure branches. Extracted cohesive `new-dictionary-form.tsx` and `selection-context.tsx`; the parent retains dictionary-name state to preserve navigation behavior. Icon actions use shared responsive buttons.
- `features/text-reading/ui/text-reading/`: `collection-notifications.tsx`, `counterpart-sheet.tsx`, `reading-pair.tsx`, `text-reading.module.css`. Named row handlers replace inline callbacks; notification status/title/action branches are explicit in a focused row component. Initial worker changed phone counterpart labels/layout; root restored the original phone icon controls and single-row footer before final verification, preserving the user’s mobile contract. Root-owned `collection-layer.tsx` and `text-reading.tsx` excluded.
- `shared/ui/button/`: `button.tsx`, `button.module.css`, `button.stories.tsx`, `button.stories.module.css`. Existing Button/ButtonLink exports extended with opt-in `desktopIconOnly`; >=768px hides only the accessible label visually, retains localized Tooltip content and square icon action, while mobile keeps icon and label. Existing defaults unchanged. Added normal/loading/disabled Storybook cases and `tests/responsive-icon-button.test.tsx`.

Reviewed feature 043 `DESIGN.md` and UI-01–UI-40 inventory; immutable v003 snapshot remains unchanged. The current user request supersedes v003 divided folder rows and desktop text labels. Reused existing semantic tokens, Button variants, Tooltip, page CSS Modules, and 768px mobile/desktop breakpoint.

File-size preflight: the three existing route compositions (`library-page.tsx`, `shared-texts-page.tsx`, `workspace-page.tsx`) remain about 251–258 formatted lines. They each wire one cohesive route's existing dialogs/query state and screen branches; extracting trivial prop-forwarding wrappers would obscure ownership without separating behavior. Distinct complex collection form/context responsibilities were extracted, leaving collection panel below 250 lines. No new memoization or dependencies introduced.

Worker evidence:

- `pnpm --filter @languon/web typecheck` passed after UI/reading edits (2026-10-16).
- Scoped ESLint passed for owned Texts UI directories, Button, reading hooks/components and Texts hooks.
- `pnpm --filter @languon/web styles:check` passed.
- `tests/responsive-icon-button.test.tsx`: 3 passed, covering localized accessible name, focus-associated tooltip content/dismissal, click, loading-disabled behavior and semantic link destination. CSS media-query visibility requires rendered browser evidence; JSDOM does not establish that claim.
- Focused run of responsive-button + reading collect/duplicate/actor/view + library controls/query + public copy/capability: 8 files/31 tests passed; `texts-library-controls.test.tsx` had 3 failures because concurrent native-popover Menu content is excluded from JSDOM accessible roles despite expanded trigger and rendered menuitems. Reported to root/overlay owner for native popover test setup and browser verification; not waived or weakened.
- `git diff --check` passed at worker preflight. Required desktop/mobile rendered evidence remains with coordinating root; worker makes no runtime fidelity claim.

## Author preflight and current verification

Author preflight 2026-10-16: current diff against 0e07c3c inspected with all new
source files; no persistence, production dependency or API changes. Scoped ESLint,
web typecheck, styles contract and diff whitespace checks pass. Full web suite:
83 files / 660 Vitest tests plus proxy Node test pass. New regressions cover live
Range geometry, validation recovery, failed-save content scoping, responsive button
accessible names, body/modal overlay hosts, native lifecycle and ARIA target IDs.

Final maintained browser run: all three Texts journeys pass, Chromium desktop
1440x1000 / shortened1440x440 and phones390/320. Tests assert exact selection-relative
trigger geometry, card rowgap, responsive visible labels/accessibility, error removal,
full viewport bounds, native-modal menu/panel clicks and new-dictionary field focus,
actual persisted generated card, public copying/revocation and no unexpected browser
errors/failed requests. AI/email adapters deterministic; real app/auth/HTTP/PG/Redis.
Five existing backend journeys also passed in preceding combined verification.
Artifacts (ignored synthetic-data captures): apps/web/.next/playwright/texts-results/
texts-mvbe4og6/. Author inspected desktop saved-reader and shortened collection panel:
full panel y40..423 within440 viewport, all controls visible; saved reader aligned.

Guide updated with these observable expectations; both mapped test files carry
sha256:e4fd8f468275c379; `pnpm user-flow:e2e -- check texts` and
`pnpm docs:user-flows:check` pass. Existing scenario IDs retained.

Important implementation decision: native popovers portal to document.body by default.
Inside a native modal they automatically portal to that open dialog instead: browser
inertness makes body siblings unclickable even when a native popover is in the top
layer. The first real browser run reproduced this and rejected the body-only approach.
All hosts share native top-layer painting and Floating UI fixed geometry/flip/shift/
size constraints; no caller-specific portal-host workaround remains. This necessary
platform exception preserves the user's fully visible, interactive overlay objective.
Collection panel does not dismiss merely when a step removes its focused button;
outside pointer/Escape still dismiss. Phone selection trigger now anchors to the word;
opening the full collection flow retains the phone sheet.

Local supplied-account exploratory session was closed. Account login returned401;
no credentials retained. Final acceptance evidence uses fresh synthetic fixture
accounts, not development data. No paid AI calls were made.

Preflight follow-ups below are now closed: independent review/remediation, non-Texts
rendered overlay evidence, isolated production build and final cleanup.

## Independent completion review (initial, 2026-10-16)

Reviewer: separate GPT-6.1 Sol reviewer context. Boundary: all uncommitted
changes against `0e07c3c002e80fe9caf375fff99b8ebe9d734561`, including untracked
source and test files. Captured 92 changed/new app files in
`/private/tmp/languon-ui-initial-review-source-manifest.txt`; manifest SHA-256
`6ed5bf2975944d183f8078c98fcdd96398dd02f6e92188f44bf7d18105d40693`.
Read root/web instructions, review/testing/search skills, the improvement scope,
changed implementations and surrounding callers/tests. Checked responsive action
labels, folder row layout, stale validation/save failures, live Range anchoring,
collection step transitions, overlay host/measurement/lifecycle, menu keyboard
navigation, combobox input focus/listbox associations and tooltip/hint consumers.
No production dependency, application boundary or trust-policy expansion found.

- **UI-R1, medium — native close focus restoration.**
  `apps/web/src/fsd/shared/ui/popover/popover-content.tsx` Escape handler and
  `popover-accessories.tsx` close handler (also Menu selection dismissal): restoring
  focus synchronously before React/native `hidePopover` cleanup can leave focus
  on body after dismissal. Browser verification by the non-Texts runtime worker
  reproduced this during review. Impact: keyboard users lose their place after
  closing a panel/menu. Suggested fix: restore the connected invoker after native
  dismissal completes and cover both Escape and explicit close/selection.
  Disposition: owner is remediating; new shared microtask helper and native
  focus-clearing regression test reviewed. Final real-browser verification pending.

No additional material finding identified. Virtual reference registration uses
stable setters and stable per-selection/per-hint references; no state-update loop
identified. Automatic nearest open native-dialog hosting is a justified platform
exception to body portals, with modal click/focus evidence and matching tests.
JSDOM tests establish lifecycle/ARIA and state regression contracts; viewport
geometry, native inertness and native focus behavior require browser evidence.
Author evidence for the full web suite, production build and maintained Texts
journeys is proportionate; no need to duplicate those successful commands solely
for review. Initial verdict: **pending UI-R1 native-browser remediation evidence
and final non-Texts shared-overlay runtime results**.

Focused remediation review follow-up: independently reran
`pnpm --filter @languon/web exec vitest run tests/shared-popover.test.tsx tests/shared-ui-controls.test.tsx tests/sentence-hints.test.tsx`; only
`shared-popover.test.tsx` matched, and all 3 tests passed. This validates the
new native-hide focus-clearing regression for explicit close and Escape.

- **UI-R2, low — native tooltip arrow clipping.**
  `apps/web/src/fsd/shared/ui/tooltip/tooltip.module.css`: after introducing the
  inner scrolling content, removing outer `overflow: auto` still leaves the
  native `[popover]` user-agent `overflow: auto` default active. The absolute
  arrow can remain clipped. Fix: explicitly set outer `overflow: visible`, retain
  measured inner content scrolling, and observe computed overflow in Chromium.
  Disposition: sent to the shared overlay owner during final remediation review.

UI-R1 closed after remediation review: runtime verifier confirmed real Chromium
Menu Escape restores `Passkey actions`, Enter selecting `Rename` also restores
that trigger, ArrowDown skips the disabled item, and sentence hint Escape
restores its selected-word control. Existing shared native focus-clearing
regression tests pass independently (3/3). Runtime additionally checks bounded
Menu/listbox/hint geometry at 320×180 and scroll-following oversized content.
No additional lifecycle or virtual-anchor issue found in the remediation diff.
UI-R2 explicit outer `overflow: visible` is implemented and source-reviewed;
final computed-style/runtime confirmation remains with the runtime verifier.

### Text-management dialog follow-up (UI worker)

Root extended worker ownership to four existing Texts dialogs. Inspected in path order: `apps/web/src/fsd/features/text-management/ui/archive-text-dialog.tsx`, `folder-form-dialog.tsx`, `rename-text-dialog.tsx`, `text-share-dialog.tsx`; also read their existing `dialogs.module.css` for layout context without editing it. Added logical spaces between component exports, setup, handlers and return blocks. Archive confirmation and share create/replace/copy/new-link icon actions now opt into `desktopIconOnly`; mobile labels, all plain-text buttons, non-button preview link, validation, handlers and mutation contracts are preserved. No shared overlay files changed.

Verification on the resulting patch: `pnpm --filter @languon/web exec vitest run tests/texts-management.test.tsx` passed (1 file, 3 tests); scoped ESLint for these four dialogs passed; `git diff --check` passed. Desktop/mobile rendered verification remains coordinated by root.

## Shared Menu, Combobox, sentence hints audit and runtime evidence (2026-10-16)

- Migrated shared Menu and Combobox and sentence-training SentenceWithHints to
  shared Popover/PopoverAnchor/PopoverContent. The listbox retains input focus,
  active-descendant navigation and pointer selection; Menu retains disabled-item
  skipping, arrow/Home/End navigation, dismissal and deferred trigger-focus
  restoration. Sentence hints use the selected occurrence's last inline rectangle
  as a virtual anchor, preserving repeated-word hint identity.
- Deterministic inventory: scoped `rg` for `useFloating`, `createPortal`,
  `popover=`, tooltip/menu/listbox roles, and feature CSS absolute/fixed positioning
  found shared Popover and Tooltip, shared Menu/Combobox, sentence hints and the
  Text reading collection layer. All anchored nonmodal popup implementations now
  use the shared positioned primitives. The remaining SpeechConfirmation portal
  renders a modal Dialog; other feature absolute/fixed rules are hidden labels,
  decorative/hit-area elements, menu triggers or fullscreen shells.
- Automated checks: web ESLint on the three migrated components, added hint story
  and affected tests passed; web typecheck passed; web style contract passed.
  `pnpm --filter @languon/web exec vitest run tests/menu.test.tsx
tests/ui-kit.test.tsx tests/sentence-training-ui.test.tsx` passed 36 tests after
  native focus remediation. Tests assert body-hosted menus/listboxes/hints,
  retained combobox input focus and deferred Escape focus restoration.
- Real browser: project-pinned safe `pnpm browser` wrapper, headless Chromium,
  task session `languon-shared-popover-menus-9579533be850766e9f4ea906e7b9850a`.
  Used local Storybook 10.5.8 at `http://localhost:6006/iframe.html` with story IDs
  `ui-menu--default`, `ui-combobox--default`,
  `training-sentence-hints--default`, and `ui-button--responsive-icon-action`.
  This verifies actual affected components with deterministic fake exercise data;
  it does not claim backend integration or replace mapped Playwright journeys.
- At 1280×720 Menu initially focused Rename; ArrowDown skipped disabled Duplicate
  to Remove. Escape restored the Passkey actions trigger. Selecting Rename with
  Enter also closed and restored that trigger after native popover teardown.
  Combobox retained input focus while open; ArrowDown/Enter selected French,
  closed the listbox and retained focus/value. Tooltip hover and keyboard focus
  exposed the complete “Сохранить · Save” label and visible arrow.
- At 320×180 Menu and Combobox panels remained within the viewport with internal
  scrolling; the hint panel remained fully bounded and Escape restored its word
  trigger. Screenshot evidence (tool-generated paths):
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1792180886661.png`
  (Menu), `screenshot-1792180933607.png` in that directory (Combobox), and
  `screenshot-1792180830048.png` (sentence hints). Final desktop tooltip screenshot:
  `screenshot-1792181065037.png` in that directory. Tooltip computed size was
  144.891×32 at translate(16,92), overflow-x/y visible, within 1280×720.
- Runtime checks found no browser exceptions or console warnings/errors. Request
  inspection found the Storybook favicon 404 only, with no failed component/data
  requests. Native focus-loss and initial tooltip-height clipping discovered
  during this verification were fixed and rechecked. Browser session and the
  owned Storybook process are closed after capture.

Final independent review disposition (2026-10-16): **approved, no open material
findings**. UI-R2 closed: runtime verifier observed full tooltip text and upward
arrow painting, computed outer overflow-x/y `visible`, desktop rect 144.891×32
at 1280×720, keyboard focus tooltip present, and no console warnings/errors.
Screenshot: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1792181065037.png`.
Reviewed subsequent tooltip promotion-before-measurement callback, stable ref,
viewport size cap/cross-axis shift and inner scroll content; independently reran
final `tests/shared-popover.test.tsx`: **1 file, 4 tests passed**, including the
new hidden-before-native-promotion measurement regression. Reviewed root's
phone counterpart footer correction: original icon controls preserved, class
now attached to actual Button so Tooltip wrapper does not break layout.

Final reviewed source identity: same HEAD base, 98 changed/new app files,
manifest `/private/tmp/languon-ui-final-review-source-manifest.txt`, SHA-256
`06f124b17e1b88d5bdbbcdea40911237415cff2348aa969ff733a5f9f845ab26`. Author remains responsible for recording final affected checks/runtime
after that last responsive footer correction. No extra security review needed:
no material authentication, authorization, data/trust or rendering-policy change.

### Final maintained Texts journey verification (test worker, 2026-10-16)

After the final shared overlay native promotion-before-measurement and positioned-focus gate freeze, Escape/focus and Tooltip measurement remediation,
text-management desktop icon labels, and restored phone counterpart controls, ran
`node scripts/run-texts-web-e2e.mjs` with confirmed disposable targets only:
PostgreSQL `127.0.0.1:55443/languon_auth_texts_ui_web_test` and Redis
`127.0.0.1:56443/1`. Both containers were created for this task and labelled
`languon.task=texts-ui-and-shared-popovers`; the runner owned fresh local web/API
servers. Result: **3/3 browser journeys passed (26.5 seconds)**. The five backend
journeys had already passed in the combined run (5.52 seconds); subsequent changes
were frontend-only or synchronized guide revision markers. The guide revision
`e4fd8f468275c379` is mapped in both journey files;
`pnpm user-flow:e2e -- check texts` passed.

The maintained browser assertions cover actual folder grid row gap and card
padding; desktop visually hidden action labels retaining accessible names and
phone visible labels; empty translation validation followed by successful
translation without a stale validation alert; real Range-relative word trigger
geometry; pointer activation inside the native full-screen reader dialog;
viewport-bounded collection content at desktop 1440×1000 and 1440×440; form input
click/focus across the collection step transition; bounded reader Menu; persisted
collected card; anonymous shared reading/copy/revocation; and phone collection at
390 px with a 320 px overflow check. No request interception, forced clicks, paid
AI calls, or development database resets were used.

Final ignored runtime evidence directory:
`apps/web/.next/playwright/texts-results/texts-mvbeft3c/`. Desktop owner artifacts
include `owner-saved-reader-desktop.png`, `owner-reader-menu.png`, and
`owner-collection-short-viewport.png`; phone artifacts include
`phone-saved-reader.png`, `phone-counterpart-sheet.png`,
`phone-new-dictionary-sheet.png`, and `phone-reading-320.png`, under the respective
journey directories. Earlier viewport/menu captures were visually inspected: the
collection panel occupied y=40…423 in the 440 px viewport with every control
visible, and the reader Menu remained inside the right edge.

The earlier 48.6-second pass preceded the final native promotion timing freeze;
the 26.5-second pass above is the final frozen-source evidence. Disposable
containers were recreated empty for that last run. After success, inspected exact
container names/labels and removed only
`languon-texts-ui-pg` and `languon-texts-ui-redis`. The runner stopped its owned
application processes. Development infrastructure and data were untouched.

### Bounded final native-measurement remediation review

Reviewed final `PopoverContent` callback-ref promotion of native panels before
`setFloating`, cleanup-only native hide hook and restored `isPositioned` guard
for autofocus/dismiss listeners. Initial visibility remains hidden until measured;
ref registration uses stable callbacks and does not add a state/render loop.
Training-menu regression changes correctly await portal measurement and deferred
focus restoration without weakening disabled-item/selection assertions.
Independent execution: `pnpm --filter @languon/web exec vitest run
tests/shared-popover.test.tsx tests/training-menu.test.tsx` — **2 files, 8 tests
passed**. Verdict remains **approved, no new material finding**. Root owns final
real-browser journey rerun for this latest native measurement change.

Updated reviewed implementation/test manifest: 97 files;
`/private/tmp/languon-ui-remediation-review-source-manifest.txt`, SHA-256
`7d85d65af6a5213ccb263ed3ba32ad2ebec30f233afba9e2cac05f5bc8dc07dd`. This manifest excludes generated `apps/web/next-env.d.ts`, which currently
points at the isolated build output and must be restored through canonical Next
type generation before handoff (author is already tracking this build cleanup).

## Verified completion

2026-10-16: AC-1–AC-6 complete. Final frozen-source Texts browser journeys pass
3/3 (26.5s), including original phone counterpart layout, native modal interaction,
selection positioning and small-window bounds. Author inspected final phone
counterpart capture: icon previous/next, full Back to reading action, no clipping.
Final evidence directory: `apps/web/.next/playwright/texts-results/texts-mvbeft3c/`.

Full web verification passes: 83 files / 661 Vitest tests plus the Node proxy test.
Final affected native-overlay remediation additionally passes 45 focused tests;
independent reviewer reran 8 relevant tests and approved the exact delta. All
material findings UI-R1/UI-R2 closed. No security review was triggered: the change
uses existing React rendering and dependencies without changing a trust policy.

Frozen-source isolated production build passed. Afterwards Next type declarations
were regenerated through `AUTH_E2E_DIST_DIR=.next/dev pnpm --filter @languon/web
exec next typegen`; the tracked generated next-env file matches baseline. Final
web typecheck, full web lint, styles contract, mapped guide check, changed-source
Prettier check and whitespace checks pass. Guide validation passed. The five
backend journeys were verified earlier; backend implementation is unchanged.

Task browser sessions and Storybook are closed. Both labelled disposable test
containers and fixture processes were removed; normal development services and
data remain. No paid model calls, new dependencies, credentials in artifacts,
immutable-design edits, local commits, merge, push or deployment. Work remains a
focused uncommitted patch on main as authorized by the improvement workflow.

Rollback: revert the focused source/test/doc patch. No database or API rollback
is needed. Remaining platform constraint is the documented native modal-host
exception; it is implemented and verified, not an outstanding blocker.
