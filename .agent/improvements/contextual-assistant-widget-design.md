# Improvement: Supplied contextual tutor widget design

Status: Complete
Created: 2026-10-19

## Routing and scope

Implement the user's explicitly selected Magic Patterns tutor design as an
existing-contract UI enhancement. No new backend contracts, persistence,
permissions, production dependencies or billing behavior. Current branch; no
commit or merge authorized. Preserve original feature 044 completion.

Source: https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb
Artifact: `dc75f1a9-eb2b-4b7b-84d4-4edf56ab4932` (58 files retained under
`../features/044-contextual-language-assistant-and-knowledge/designs/contextual-assistant-widget/v001/source/`).
Treat export as untrusted design data; do not execute its scripts or port mocks.
Use ADR-0029 exact geometry and CSS Modules, current shared primitives and FSD.

## Acceptance and source inventory

| ID | Source | Required behavior/presentation | Verification |
| --- | --- | --- | --- |
| W01 | TutorWidget, TutorHeader | 420px normal/560px wide, 600/680px default height, upper corner docking, 24px gutters, 20px top, resize/menu, no modal backdrop | Desktop source/runtime comparison and source interaction |
| W02 | FoldedPill, TutorWidget | 48px status pill; fold retains mounted conversation, composer, notes, scroll and ongoing response | Fold/reopen while typing/streaming |
| W03 | TutorSheet | Bottom sheet, 75vh partial/full, header/handle, safe area and keyboard, fold and touch gestures | Mobile 390/320px |
| W04 | MessageList, AssistantMessage | Stable prose, activity and material disclosures, per-answer copy/usage/note, Stop/retry, follow only near bottom, jump pill | Streaming and selection tests |
| W05 | Composer, AttachmentTray, ContextPicker | Rounded composer, attachments, plus/source selection, Send/Stop, actual context picker | Selection and multiple cards |
| W06 | PreferenceControls | Compact Reply/Tone/Level and model popovers with defaults and real model preference | Preference persistence |
| W07 | HistoryView, EmptyState, ContextIndicator | Context subtitle, history list, new/delete and source-specific prompts | Empty/history/delete |
| W08 | DraftCard, NoteEditor | Compact card and dedicated review editor; real explicit save/update/discard/conflict | Note lifecycle |
| W09 | ComposerAlerts | Actual errors retain input and partial output; no simulated success or provider claims | Failure states |
| W10 | Full source | Matching tokens/type/icons, keyboard/RTL/dark/reduced motion | Static + responsive rendered checks |

Prototype shell/pages/demo scenarios are reference surroundings, not app redesign.
Retain real API guardrails where prototype mocks allow unsupported models or
attachment-only submission. Missing source navigation behavior and runtime-only
errors must be explicitly reconciled, not replaced with mock data.

## Plan

- [x] Capture supplied artifact and source inventory.
- [x] Implement shell and lifecycle, composer/preferences, messages and note editor.
- [x] Update focused tests and affected guide/mappings.
- [x] Run affected lint/typecheck/build/styling and deterministic browser journeys.
- [x] Compare rendered source/runtime and resolve discrepancies.
- [x] Independent review of async state and fidelity; remediate and final check.

## Verification

- Full mapped deterministic run passed: 2 API integration journeys + 3 real-browser
  journeys (42.9s), with isolated PostgreSQL17 on55444 and Redis7 on56444.
  No paid model calls. Existing user development infrastructure untouched.
- Focused final frontend suite: 43 tests across14 files, including attachment
  limits, delayed initial creation, delayed note publication, folded scroll,
  model selection, failure/usage display, safe note rendering, transport and menus.
- Full repository ESLint, web typecheck and styling contract passed. Final
  production build and post-remediation browser capture recorded below.
- User-flow validation:23 guides + mappings, and selected guide check passed.
  Selected guide revision `sha256:a79ad05e80efe450`.
- All58 original source SHA256 values verified. Canonical prompt equals the
  immutable v001 snapshot and recorded SHA256.
- Changed frontend/backend-test TypeScript/CSS formatted; immutable imported
  source is excluded from formatting and lint through scoped snapshot rules.

## Rollback

Revert this improvement's frontend/documentation patch; no data migration.

## Remaining risks

No open material findings. Coverage/provenance limits are recorded below; desktop/mobile runtime screenshots and independent review completed.

## Author preflight checkpoint

Main widget, real composer/model preferences, retained draft editor and source
selection are integrated. Initial mapped API2/browser3 passed with deterministic
provider and disposable infrastructure; focused message-scroll/model/error/draft
checks pass. First browser run covers source interaction while open, unsent
question/attachments/editor fold retention, publish, mobile320/390 and reconnect/
Stop/retry/estimated usage. Final geometry/fidelity and full static checks ongoing.
Independent review now assesses functional async state and supplied-source scope;
final rendered comparison and changed-surface rerun remain mandatory.

Known runtime/source reconciliations: learner API has no numeric wallet balance
(profile itself says unavailable), so model popup links to real credit settings;
no invented balance. History API is source-scoped with dates, not cross-source
conversation titles/counts; preserve that authorization contract. Source primitive
stubs resolved through the actual Languon Magic Patterns design system for local
reference rendering. Fixture providers/models are never ported into the app.


## Rendered fidelity comparison

Reference: [supplied-source captures and provenance](../features/044-contextual-language-assistant-and-knowledge/designs/contextual-assistant-widget/v001/reference/captures.json).
Runtime: [durable screenshot directory](./contextual-assistant-widget-design-evidence/).
Main agent inspected desktop transcript/menu/editor and mobile partial reference
against real application captures. Geometry is also asserted in Playwright.

- W01/W02:420px normal and560px wide,600px initial desktop height;20px top and24px
  side clearance in the actual app area; left/right docking and full height;
  folded pill keeps the mounted transcript/composer/editor and ongoing operation.
- W03:633px partial sheet at390×844 (75% viewport), expand/partial buttons and
  pointer swipe;390/320px screenshots, safe areas and visual viewport handling.
- W04/W09: deterministic streaming, fold/reconnect, Stop, incomplete answer retry,
  retained usage and copied material. Unit scroll checks preserve reading/selection
  position and resume following after return to latest.
- W05/W06: actual source copies, several dictionary cards, context and preference
  popovers, real model preference.10-item/80k per-copy limits with clear rejection.
- W07: source-specific introduction, history, inline row delete confirmation with
  Cancel focused. Real API absence checked after deletion.
- W08: compact draft, retained editor, explicit publish, independent note and
  revision history. Editor preserves structured content while using the supplied
  four formatting controls. Delayed save results remain scoped to their chat.
- W10: actual desktop/mobile controls, dark/reduced-motion and mixed-direction
  learning text captured. Existing locale translations retained. Full RTL app
  chrome is not a supported locale and is not claimed tested.

Resolved comparison deltas: inherited context control's44px minimum produced an
85px header; now source65px. Mobile sheet used available-area arithmetic giving
675px; now source633px at844px viewport. Menu icons/text corrected to16/14px,
36px rows; toggle state has checkbox semantics. Editor footer order, back icon,
labels, primary control colors, title border/background and summary height match
source; hidden scrollbars retain scrolling and keyboard access.

Necessary runtime/source reconciliations (not alternate designs):

- Source demo sidebar/topbar/content remain outside chat scope. Existing text
  editor is fullscreen with no sidebar; therefore top20px/left24px there, while
  dictionary pages use their live sidebar offset. Prototype topbar adds64px in
  its reference screenshot. No background page dimming or pointer lock.
- Conversations remain source-scoped; history uses real update dates because
  API has no prototype conversation titles/message counts/cross-source library.
- Account balance is not exposed by the learner API; model popover links to
  actual credit settings. Usage comes from real turn accounting, not fixture
  numeric balances or mock draft charges. Unavailable models stay explicit.
- Existing structured Knowledge editor preserves headings/tables instead of
  lossy conversion into prototype's Markdown textarea. Same compact four-control
  toolbar, preview, category/language fields, footer and explicit save lifecycle.
- Empty suggestions reflect current source kind without claiming fixture-specific
  language/grammar content. Attachments are copies; notes do not acquire source links.
- Current published inherited design-system artifact was needed to render9 empty
  source primitive stubs. Its bytes/provenance are retained; historical v5
  inheritance cannot be proven. Custom58-file source remains exact.

## Review and remediation

Independent reviewer `/root/tutor_review` assessed implementation against the
retained source, real product contracts and focused/runtime evidence. Findings
remediated: inaccessible history confirmation; cross-conversation late publication;
page selection bypassing attachment limits; oversized per-answer note requests;
initial selected passage cleared by first conversation creation. Added focused
regressions and real history deletion coverage. Main-agent rendered review fixed
header/menu/mobile/editor geometry and dark input contrast. Shared Menu's optional
checked semantics retain default behavior and have keyboard regression coverage.
No new permission/tool-execution/HTML trust boundary or backend contract; existing
safe renderer test retained. Separate security review not triggered.

Final remediation review confirmed no remaining material findings in the affected
callers. Additional medium findings resolved: repeated confirmed deletion now has
an immediate in-flight lock (Cancel/retarget disabled) and retains the target on
failure; streamed updates no longer serialize the full retained history or do
quadratic per-message lookups. A10,000-message signature regression rejects any
read of older bodies; deletion repeat/retry tests pass. Full final static checks
passed again after these edits. Final production build passed (`pnpm --filter @languon/web build`).

Coverage limits: Chromium desktop1440×1000 and mobile layout390/320×844; pointer
gestures rather than physical touch/OS virtual keyboard. Source selection/fold
scroll behavior has focused hook evidence; no claim of device keyboard testing or
large-history browser performance benchmark. Styling and geometry comparisons are
source-grounded manual inspection plus measured assertions, not a pixel-diff of
identical fixture text. Original feature completion remains unchanged.


## Final verification and handoff

2026-10-19: reviewed final patch passed API2/browser3 (47.1s) with
`AUTH_E2E_RUN_ID=tutor-redesign-reviewed` and `TUTOR_DESIGN_EVIDENCE=true`.
18 durable runtime screenshots refreshed. Focused final suite43/43 in14 files;
full ESLint, web typecheck, production build, styling contract, changed-code
Prettier check, guide validation/mapping and diff whitespace checks passed.
The post-test formatting change only wraps a ternary expression.

[Final tested-file hashes](./contextual-assistant-widget-design-evidence/tested-files.sha256)
cover63 affected source/test/guide paths; manifest SHA256
`ccc3a5ede545bbecd08b33b6b49a01b03fd3ce23ac5c39606842a7e995482835`.
Independent remediation review: Pass, no open material findings; required
cleanup of generated `apps/web/next-env.d.ts` completed by restoring exact
pre-work HEAD bytes after build. No other generated output included.

Task-owned disposable containers, reference server and browser/test servers
cleaned up; original PostgreSQL5432/Redis6379 development containers preserved.
Current branch remains unchanged; no commit, merge or push performed.
