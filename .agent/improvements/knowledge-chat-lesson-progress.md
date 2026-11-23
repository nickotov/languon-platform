# Knowledge chat lesson progress

Status: Complete

## Outcome and design

Extend the existing lesson plan disclosure, task list, chat messages and portrait popover. Keep the live plan open on entry, highlight the current unit, and place the completed plan and its document review action together in reading order. Retain actionable recovery and genuine spending confirmations. Make default browser scrollbars subdued and keep a tall desktop portrait settings panel usable at half the viewport height. The previous transcript correction and unrelated local edits remain in the worktree.

## Checks

- Inspect production rendering from run events through the transcript, including reloads, multiple replies and ordinary content proposals.
- Exercise running, paused and completed cards with focused component tests. Verify reduced motion, stable disclosure choices, and accessible progress.
- Run the deterministic Knowledge Chromium lesson journey against disposable services. Check plan-to-review order, insertion, mobile review and stream recovery. Inspect active and completed captures.
- Check desktop portrait popover bounds, internal scrolling, scrollbar contrast/visibility and forced-colors overrides. Run affected app static checks, update the Knowledge flow and verify guide mappings.

## Implementation and verification

The running lesson card owns its heading spinner, plan disclosure and active task. Once it is visible it also replaces the generic chat activity indicator. A published proposal is matched to the assistant turn by its persisted publication identity. Older completed lessons retain their exact-proposal review path. The working document, insertion commands and run authorization are unchanged.

The active card, automatic generation and prepared preview suites passed 54 focused tests. Five grouping and related suites passed 71 tests, with overlap between the selections. Seven shared popover tests passed. The admin production build passed. The dev panel cross-tab Chromium test and the architecture viewer desktop/mobile Chromium journey passed. All 36 user guides and the affected Knowledge journey mapping passed validation. Native scrollbar overrides apply only when forced colors are off and the user has no explicit contrast preference. The existing mobile app keeps platform scrolling.

The final Chromium workspace journey passed, including four service prerequisites, half-viewport settings scrolling, live activity indicators, one grouped plan before the insertion controls, and Save/reload. The designer inspected running and completed states in the narrow desktop companion. The final implementation also removes the completed publication tool receipt from that group. Five ordinary proposal tests passed. Web type checking and the production build passed. The web styles checker still flags the pre-existing provider finish-reason string `content-filter` at three sites. No environment or database changes are required.

Rollback by reverting this grouped rendering, card styling and scrollbar/popover changes together. No persisted state depends on the revision.
