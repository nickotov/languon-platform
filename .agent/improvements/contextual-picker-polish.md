# Contextual picker polish and reliable writing flow

Status: Complete
Created: 2026-11-15
Base: main at 495a06d4

## Outcome and scope

Existing-contract UX improvement requested after five screenshots showed oversized,
in-flow editor/chat menus and broken typing/focus behavior. Extend the approved
Popover/Menu patterns using existing tokens, CSS Modules and Lucide icons. Preserve
Feature 069 insertion, manual Custom single/grouped exercises, typed mentions,
previews, explicit Send/Insert/Save and stale-target protection. No new journey,
API, persisted format, provider, dependency, environment or data migration.

Root owns shared controls, integration, documentation and delivery; bounded editor
and chat workers own their slices. A separate tester owns guarded browser runs;
a ui-designer supplies the brief/rendered critique and an independent reviewer
checks source/remediation/final evidence. User's standing local commit authorization
applies; no push or branch deletion. Historical Feature 069 records stay complete.

## Discovery and design decisions

Original screenshots: Desktop captures on 2026-11-15 at 21.30.09, 21.30.51,
21.31.04, 21.32.50 and 21.33.01, supplied by the user. Source inspection confirmed
that chat rendered the picker inside the composer flow, oversized controls consumed
space, Texts created a second detached popup, and autofocus selected a utility
button that swallowed subsequent typing. Editor native keymaps also intercepted
menu navigation.

Primary-source research on 2026-11-15:

- [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts):
  slash command discovery/search within writing.
- [Linear editor](https://linear.app/docs/editor): slash commands and typed mentions.
- [WAI-ARIA combobox guidance](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
  preserve text editing and define popup navigation, cancellation and focus.
- [Slack mentions](https://slack.com/help/articles/205240127-Use-mentions-in-Slack):
  contextual selection while composing a message.

The web search endpoint returned HTTP 405; official pages were retrieved directly
for research. Extend existing patterns, rather than introduce a new design system.
Use an action dialog with real buttons: independent Preview actions do not fit
nested interactive listbox options. An explicit panel search filters results;
typing in the original editor/composer dismisses the panel, as the user requested.

## Implemented behavior

- Compact floating panels: chat above the whole composer, editor at caret/button;
  width bounded to 360px and height to 400px/available viewport. One results
  scrollport; compact icon rows, small labelled Back/Close, search and restrained
  category/hover/focus accents. Mobile/coarse-pointer utilities have 44px targets.
- Slash keeps source focus. Typing, paste, composition or clicking back in the
  source dismisses without losing input. Arrow Down enters results; Up/Down,
  Enter, native Space, Escape/Back work without intercepting passage textarea
  arrows, selection or newlines. Button invocation focuses search after positioning.
- Preview suspends the picker and restores query, scroll and originating control.
  Texts search/details/passage/translation use one embedded surface. Mixed search
  has one aggregate empty state rather than a misleading exercise-only message.
- A real PopoverTrigger owns the chat plus button; virtual anchors position the
  panel without replacing its invoker. Standalone virtual-anchor consumers retain
  fallback ownership. Popover Escape delegation is opt-in; defaults remain intact.
- Shared command controls, compact exercise browser and prompt picker have stories.
  Helpers/hooks separate navigation, positioning and source/reference orchestration.

## Acceptance and selected verification

Selected before implementation: focused keyboard/focus/insertion/reference unit
checks (seconds); affected lint/style/readability/format/types/production build
(minutes); registered guarded contextual exercise journey with geometry and
1440/390px EN/light and RU/dark screenshots; populated Text attachment/budget
journey. No backend/DB/provider code changed, so no DB or paid AI execution runs.

- [x] Floating panels preserve source dimensions and all existing command actions.
- [x] Source typing/click/paste/IME dismissal and keyboard navigation are covered.
- [x] Preview return, manual Custom sets, typed activity/source metadata, explicit
      publication and history remain covered by the real application journey.
- [x] Desktop/mobile viewport, EN/RU, light/dark rendered review; no clipping or
      horizontal overflow; visible Preview actions remain inside the scrollport.
- [x] Static/build/docs and independent review evidence recorded below.

Final checks:

| Check                                                         | Result                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Focused web Vitest selection, 11 files                        | 58 passed, 7.36s                                                                               |
| Chat canonical trigger preflight, 7 files                     | 25 passed                                                                                      |
| Shared real-trigger and standalone virtual-anchor regressions | Included in final selection; 6 shared command tests passed                                     |
| Changed TypeScript ESLint                                     | Passed; mechanical blank-line fixes only                                                       |
| Changed Prettier, web style contract                          | Passed                                                                                         |
| `pnpm test:readability`                                       | 25 passed                                                                                      |
| Web production build                                          | Passed after canonical trigger fix                                                             |
| Web typecheck                                                 | Passed after final production build                                                            |
| `pnpm docs:user-flows:check`                                  | 36 guides and mappings validated                                                               |
| Selected `user-flow:e2e -- check`                             | interactive-workbooks, knowledge-workspace, contextual-language-assistant-and-knowledge passed |
| `pnpm diagrams:check`                                         | Passed; only two affected source fingerprints refreshed                                        |
| `git diff --check`                                            | Passed                                                                                         |

Final registered browser evidence, no skips:

- `pnpm test:e2e:critical -- --flow contextual-exercise-discovery`:
  run `4556b63d-2223-4ea2-8797-0048bdd92002`, 1/1 passed, 26.1s. Native repeated
  plus-button toggle, source focus/typing, keyboard, search, preview return, manual
  forms, zero turns before Send, typed request/proposal/Insert/Save/history.
- `pnpm test:e2e:critical -- --flow knowledge-reference-context-budget`:
  run `49dd2e98-766f-41df-ae00-9add30a6e1bb`, 1/1 passed, 23.7s. Populated Texts,
  exact passage and translation attachments, exact 40,000-character acceptance,
  rejected extra reference, over-limit no-admission and explicit removal guards.

Screenshots are under
`test-results/critical-flows/4556b63d-2223-4ea2-8797-0048bdd92002/contextual-exercise-discovery-artifacts/interactive-workbooks.jour-6ebab-xercise-and-source-mentions/`.
See `contextual-exercise-picker-root-desktop.png`,
`contextual-exercise-picker-desktop.png`, `contextual-prompt-root-desktop.png`,
`contextual-prompt-exercises-desktop.png`, `contextual-prompt-texts-desktop.png`,
and `contextual-prompt-russian-dark-mobile.png`.

The ui-designer approved corrected desktop editor/chat categories and submenus,
mobile editor and RU/dark mobile chat (runs 3a5ae812 and 6cfe35d5). Root inspected
final run 4556b63d desktop chat and RU/dark mobile chat: appearance preserved after
the canonical trigger fix. Earlier screenshots exposed intrinsic flex/grid width
clipping despite passing interactions; corrected min-width/grid tracks and final
E2E now explicitly checks scrollWidth and button bounds. Composer height allows
8px for the literal slash line box; it rejects in-flow panel expansion.

## Review and remediation

Independent canonical-remediation source/evidence review approved by
`picker_polish_review`: no remaining material finding. Earlier full source review
remains valid; real-trigger, virtual-anchor and populated Text evidence close
both findings and the prior verification note.

- CR-POLISH-01, Medium: native plus-button outside-dismiss/toggle race. The first
  pointer-propagation remedy passed unit tests but failed native run
  `1f55fe36-b748-4d1f-a241-4a71ede40147`. Replace it with the canonical real trigger
  and preserve invoker identity through virtual positioning. Unit regressions and
  final native run 4556b63d pass. No propagation workaround remains.
- CR-POLISH-02, Medium: mixed search displayed an exercise-empty status beside
  valid block matches. Aggregate match status fixes it; focused component
  regressions pass. Exercise-only submenus retain their specific empty status.

## Documentation, boundaries and rollback

Updated the three existing guides and synchronized stable scenario revision
markers; mapped backend and additional web test changes are revision comments only.
The populated Texts helper now targets the portalled outer dialog and embedded
region without weakening budget assertions. Conversations/Knowledge and named
exercise diagrams retain their ownership/data-flow bodies: changed guide/menu
inputs do not change generation, admission, publication or accounting boundaries.
Reviewed their changed inputs and refreshed only these fingerprints. No new ADR
or viewer presentation change is needed.

Rollback is a revert of this cohesive UI improvement; no migration or configuration
work. Real OS mobile-keyboard layout and native-device behavior were not observed;
mobile evidence uses the browser viewport. Local deterministic checks do not claim
live-provider pedagogical proof. These limits do not alter the existing product
contracts. Delivered as one scoped local commit on the current branch; no push.
