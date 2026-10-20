# Improvement: Knowledge workspace pane resize and aligned headers

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20

## Scope and routing

Focused enhancement of the existing attached Knowledge tutor width controls and header alignment. This is an improvement: no new journey, backend/public contract, persistence, dependency or permission change. Preserve all uncommitted prior work. Current branch; no automatic commit.

The workspace currently switches between 380px and 50%; the tutor header grows to 61px because 40px text plus 20px padding and a border exceeds its 56px minimum. The document header is 56px.

## Acceptance

- AC-1: Desktop attached Knowledge panes have a draggable vertical boundary. The chat can be sized from 320px (or available half-width if smaller) up to 50% of the available workspace; live resizing never overlaps the editor or exceeds 50%.
- AC-2: The separator supports keyboard arrows, Home/End and cancellation, a visible focus/hover state, pointer capture and proper cleanup. Existing 50% toggle resets/selects its preset, detached sizing and mobile/tablet sheets retain their behavior, and the chosen attached width survives detach/reattach while mounted.
- AC-3: Attached document/tutor headers share a fixed 56px border-box height, with bottom borders on the same horizontal line at default, resized and 50% widths.

## Plan and evidence

- [x] Implement bounded shared workspace resize state/handle and fixed attached header geometry.
- [x] Add focused resize tests/story and extend existing mapped Knowledge browser scenario/guide.
- [x] Verify affected lint/typecheck/styles, browser pointer+keyboard+headers, and independent scoped review.
- [x] Record final evidence, source identity and remaining risks.

Constraints: ADR-0016 real browser proof; ADR-0029 CSS Modules/tokens; existing CompanionLayout slot/context and its local preference lifetime; Knowledge workspace guide. The supplied design remains the baseline with these user-requested adjustments. No external design writes. Rollback: revert this improvement's resize/height changes; no migration.

Verification uses the existing real workspace journey plus a narrow responsive sheet regression. Native pointer capture, responsive layout geometry and keyboard focus require browser coverage; duplicating these with mocked DOM geometry would not add confidence. The extracted hook is exercised directly through its real shared layout by these maintained tests. No database implementation checks are needed; existing guarded deterministic runtime uses disposable PostgreSQL/Redis. Review focuses on pointer cancellation, stale width on resize, keyboard/RTL and preset/detachment interactions.

## Implementation and checks

- Added a pointer-capturing separator to the desktop attached workspace slot, with a 20rem minimum capped by half the available layout, a 50% maximum, percentage-based custom widths and local detach/reattach retention. Arrow keys resize by 16px (Shift: 40px); Home/End choose bounds; Escape/pointer cancellation restores the starting width. Existing preset controls reset custom sizing.
- Both attached headers now inherit the same 56px height token; removed vertical padding that previously forced the tutor header above its minimum. Other tutor placements retain their geometry.
- Added `ResizableWorkspace` story and translated separator labels in all four supported locales.
- Static checks: affected web ESLint, `pnpm --filter @languon/web typecheck`, `pnpm --filter @languon/web styles:check`, focused Prettier, and `git diff --check` passed.
- Mapped guide checks: `pnpm user-flow:e2e -- check knowledge-workspace` and `pnpm docs:user-flows:check` passed (guide revision `8a92b7b56282bd9f`). Existing scenario IDs retained.
- Runtime command: guarded `pnpm test:e2e:contextual-assistant -- --grep 'an empty workspace|the workspace keeps'` with disposable local PostgreSQL/Redis and deterministic assistant, run ID `knowledge-pane-resize`: 4 backend preflight tests and 2 Chromium browser journeys passed. No paid model calls. Initial sandbox loopback denial was resolved by approved local execution.
- Desktop 1440×1000: default 380px, pointer clamp at 50%, custom 440px, Escape cancellation, keyboard minimum/maximum/steps, detach/reattach custom retention, preset on/off and matching 56px header geometry all passed. Mobile 390×844 and tablet 820×1000: sheet controls work with no separator. Final rerun also checks the announced ARIA percentage against actual width at every transition. Runtime assertions report no page errors, unexpected console errors or HTTP500 responses.
- Screenshot inspection: [desktop](knowledge-workspace-pane-resize/desktop-resized.png), [mobile](knowledge-workspace-pane-resize/mobile-sheet.png), [tablet](knowledge-workspace-pane-resize/tablet-sheet.png). Desktop shows the aligned header borders and focused divider.
- Tested identity: HEAD `d44ebca3e26f38f775f0a7df04004653a99bd6fd` plus [source hashes](knowledge-workspace-pane-resize/browser-source-sha256.txt). Preserve all pre-existing uncommitted design integration. Independent review and final optimized `pnpm --filter @languon/web build` pass. Browser source hashes were revalidated after the build; generated next-env content was restored to its original bytes.

## Independent review

Reviewer `/root/pane_resize_review` assessed only this resize/header patch, its surrounding layout consumers and focused test changes, reusing the prior design integration review for unrelated work. PANE-REV-001 (medium): default separator ARIA could read the previous slot size during render when resetting the 50% preset. Fixed by observing both root and slot and deriving ARIA from measured state. The existing browser width helper now validates the announced percentage against actual geometry after every transition. Bounded remediation source/test review passes with no other material findings; final rerun passes (4 backend preflight and 2 Chromium journeys). RTL pointer/arrow logic was inspected but not browser exercised (no RTL locale currently supported); this is a nonblocking residual coverage limitation.

## Outcome and remaining risks

Implemented and verified; no material review findings remain. Width preferences remain local to the mounted layout, as before. No security or persistence changes. RTL source-only coverage is the remaining nonblocking limitation. No commits made; unrelated prior work preserved.
