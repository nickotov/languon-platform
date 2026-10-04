# Web design integration evidence

Status: Complete
Updated: 2026-10-05

## Verification results

- Node 24.8.0; branch `feature/sentence-practice-web` from main `89094248`.
- Final web unit/component/contract suite: 49 files, 417 tests passed.
- Web lint, web typecheck, backend typecheck, scoped backend fixture lint, and
  production Next webpack build passed. Typecheck also passed after canonical
  development type references were regenerated with Next's owning generator.
- Final real-app sentence/model-preference suite: six Chromium journeys passed
  in 35.1 seconds. Guide revision: `sha256:10ce631498e40ee5`.
- Existing Flashcard browser journeys: four passed. Existing profile browser
  suite: one passed, one known pre-existing deletion-receipt failure; see below.
- Affected formatting check passes (81 files). Full-root `pnpm format:check`
  still reports 43 unrelated pre-existing files; none was changed to expand scope.
- No paid or nondeterministic provider calls, new dependency, schema migration,
  production activation, or external design mutation.

## Model preference evidence

MP-UI-01–09 are implemented by `features/text-ai-preferences` and profile Account
composition. API/component/navigation tests cover strict catalog/preferences,
Auto and explicit selection, loading/availability/error states, exact dirty
choice, optimistic conflict/refetch/deliberate overwrite, and navigation safety.
The real browser suite proves persistence/reload, conflicts, keyboard controls,
dark/mobile layout and the fallback Back path with Navigation API disabled.
The root dispatcher handles Back before Next can unmount the dirty page; Keep
editing, repeated Back/Discard, Forward, and unchanged history length all pass.

Retained captures include `profile-model-auto.png`, `profile-model-saved.png`,
`profile-model-conflict.png`, `profile-model-mobile-dark.png`,
`profile-model-mobile-actions-dark.png`, and `profile-back-fallback-keep-draft.png`.

## Sentence evidence

SP-UI-01–14 are implemented by `features/sentence-training` and the
`dictionary-training` widget. API/store/component tests cover real request and
response schemas, scopes/directions/modes, stale-response fences, exact Unicode
drafts, admission/poll/retry identity, cancellation, independent manual review,
progress failures/free retry, and separate paginated personal histories.

The real PostgreSQL/Redis/Hono/Next journeys prove owner generation, mapped hints,
exact draft, queued AI checking and stored feedback, saved-first reader reuse,
real zero-credit 402 followed by replay-safe free reference reveal, personal
AI/manual history and progress, sign-in continuation with the capability only in
the URL fragment, and accepted cancellation with disabled Stopping control.

Reference reveal uses the stored answer and does not call AI or require credits.
Manual completion stays separate from AI percentages/ratings. Only completed
stored AI results acknowledge a submitted answer; failed admission still requires
confirmation before discarding the draft. Over-limit input is retained in full,
counted by Unicode code points, explained and blocked before any paid request.

## Presentation and access evidence

SP-UI-15–17 and MP-UI-10 are accounted for by inspected runtime captures and
browser assertions: desktop dialog/native fullscreen, dark/mobile views, sticky
actions, keyboard focus, Arabic RTL source/hints, Japanese draft/reference,
reduced motion, compact bottom sheets, and a focused 393×430 typing viewport.

Fullscreen acquired after an existing native dialog originally hid the UI.
The scoped top-layer restoration preserves DOM/state/focus, including already
open nested confirmations. Unit regressions and the real foreground hit test
verify the correction; `sentence-fullscreen-feedback-dark.png` shows feedback.

The honestly labeled 200%-equivalent layout-pressure proxy halves the CSS
viewport to 640×360 and checks full horizontal bounds of source, answer and
controls. It does not drive actual browser zoom or change DPR. Independent review
accepted it for CSS reflow/available-width criteria; no physical-pixel fidelity
claim is made. `sentence-rtl-japanese-200-percent-viewport-simulation.png`,
`sentence-compact-summary-sheet.png`, `sentence-compact-rtl-history-sheet.png`,
and `sentence-keyboard-viewport-simulation.png` are retained. The earlier cropped
CSS-zoom experiment is excluded from final evidence.

Known share denial immediately removes all sentence-practice protected state:
source, draft, reference, jobs, progress, warmed setup and both histories. The
persistent gate and invalidation epochs prevent cached or delayed responses from
returning, even while refetches are blocked. The pre-existing outer shared-page
dictionary preview can remain visible; no claim is made that all page data was
erased. Independent security review confirmed this boundary matches existing
Flashcards and does not reopen SEC-037-01.

## Design scope and limitations

The authoritative inventories remain in [035 FEATURE](../035-user-ai-model-preferences-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04)
(MP-UI-01–10) and [036 FEATURE](../036-sentence-practice-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04)
(SP-UI-01–17). Their selected v001/provider-v6 artifacts are unchanged. Recomputed
prompt SHA-256 and retained-source digests match all 17 profile/27 sentence files.

Runtime evidence verifies source-derived content, controls, hierarchy and states.
The external rendered reference was unavailable, so no pixel-equivalence claim
is made. Existing shared primitives/tokens and real backend contracts govern
adaptations. Unsupported provider marketing, saved timestamps and demonstration
wallet amounts were omitted. The app's four interface locales are LTR; actual
RTL dictionary content was tested without adding an unsupported RTL locale.
Viewport typing evidence is a layout simulation, not native keyboard/device proof.
Unrelated shell, billing, account management, audio and editor designs are excluded.

Root inspected final profile, fullscreen feedback, RTL/layout-pressure, compact
summary/history, typing viewport, cancellation and access-loss PNGs. All 23 final
captures and their source timestamps/sizes are recorded in
[evidence/browser/final-browser-captures.json](./evidence/browser/final-browser-captures.json).

## Existing profile baseline exception

The existing profile suite retains its deletion assertion. Its repaired header
selector now reflects the Account menu/Profile link already present on main.
The unverified-user case passes; scheduled deletion returns 202 but its receipt
heading does not survive sign-out. At base `89094248`, unchanged ApplicationChrome
switches the ProfilePage ancestor from AuthenticatedAppShell to a Fragment,
remounting the page and losing its local deletionReceipt. The deletion callback
and shell are unchanged. Independent review confirmed this unrelated baseline
defect does not block 037 acceptance. The legacy profile suite is not reported
wholesale green; shell/account management remain outside this feature.

## Review and cleanup

Independent completion and security reviews resolved all high/material medium
findings; see [REVIEW.md](REVIEW.md). User-flow validation/mapping, design/backlog
synchronization, final diff and frozen-hash checks are recorded in the ExecPlan.
All feature-owned browser servers, proof build caches, and disposable PostgreSQL/
Redis containers were stopped/removed. The user's existing development server
and development infrastructure were preserved. Generated next-env references
were restored by the pinned Next generator, without hand editing.

## Staged immutable-artifact whitespace exception

The full staged whitespace check reports extra blank lines at EOF in the retained
Magic Patterns provider exports. Their original bytes and recorded digests are
intentionally preserved. The authored patch passes whitespace checks with the two
exact retained-source directories excluded; the full staged check also passes
with only blank-at-EOF warnings disabled for that command. No Git configuration
was changed and no retained file was rewritten.
