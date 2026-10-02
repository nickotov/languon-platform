# Flashcard training web design integration

Status: Complete
Created: 2026-10-02
Owner: Engineering agent

## Authorization and scope

User returned Magic Patterns design and explicitly requested implementation of
training-related UI only: learning cards and the action to start a session.
This continues the authorized backlog delivery after backend feature 033.
BL-002 is the primary task; BL-003 supplies personal-progress requirements.
Preserve the existing dictionary preview/editor. Exclude prototype shell,
dictionary-preview redesign, designer panel, mock APIs/data and new dependencies.

Source: https://www.magicpatterns.com/c/1ezcc3hob8mnnnku9w26tl
Selected artifact: db684c8f-e7a1-4f6c-804f-e0fd6a8da2d4, provider v2,
“Remove footer, reorganize card controls”. Handoff:
[feature 033 DESIGN](../033-flashcard-training-backend/DESIGN.md).
[Resolved baseline](../../../docs/flashcard-training-implementation-plan.md)
and ADR-0024 remain authoritative for real product/backend behavior.

## Acceptance criteria

- AC-1 — Add capability-aware Train next to existing owner Add card; shared
  readers also get Train. Cards opens setup; Sentences is disabled/coming soon.
  Archived dictionaries cannot train; empty active dictionaries explain no cards.
- AC-2 — Setup provides front/back fields, ordered field summaries, identical-side
  warning, shuffle/dictionary ordering, all/manual scope, search/paged selection
  retained across filters, eligibility/skipped/fallback counts, cancellation,
  remembered preferences and explicit conflict/reload/overwrite/retry behavior.
- AC-3 — Start uses real bounded preparation/items APIs and signed-in preferences,
  requests native fullscreen within the gesture, falls back to viewport overlay,
  and preserves queue/face/statistics through fullscreen/dialog switches.
- AC-4 — Card click/keyboard flips; horizontal swipe and labelled controls rate
  Known/Again. Ignore vertical scroll, selection, control clicks and tiny drags;
  preserve long/RTL content, reduced motion, mobile touch and keyboard access.
- AC-5 — Signed-in ratings advance only after acknowledgement; retry retains the
  operation ID/card/face. Anonymous ratings remain local. Latest Undo restores
  card/face/stats; conflicts, missing entries and access loss have explicit recovery.
- AC-6 — Distinct round/session/current saved totals, self-assessment percentage,
  explicit Again rounds, Start over and Finish; no automatic requeue/resume.
  Identity/share-key changes end and clear practice; no anonymous-result import.
- AC-7 — Match the selected in-scope design inventory using existing tokens,
  primitives and localized copy. Existing dictionary content/actions remain intact.
- AC-8 — Scoped tests, actual owner/shared/anonymous browser/API journeys,
  responsive/accessibility checks, guide mappings and independent completion
  review pass. Record unavailable reference-rendering evidence explicitly.

## Source-derived fidelity inventory

| ID / brief       | Source section and geometry                                                                                                                                      | Intended owner                                  | Verification                                    | Disposition                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| UI-01 / FC-01    | Train menu; icon, Cards, disabled Sentences, capability loading/retry; owner floating beside Add card, reader actions                                            | Training launcher + existing editor/shared page | Owner/shared capability, archive/empty          | Required; dictionary preview/shell excluded by user                                                            |
| UI-02 / FC-02    | Train with cards dialog, language subtitle, two bordered rounded fieldsets on desktop/stacked mobile, ordered fields and hints                                   | Setup dialog                                    | Fields, invalid/identical, cancellation         | Required                                                                                                       |
| UI-03 / FC-02    | Order choices, all/manual scope, searchable selector, page selection/clear, three eligibility tiles                                                              | Setup/manual selector                           | Search/pages/retained selection, counts         | Required                                                                                                       |
| UI-04 / FC-02    | Anonymous/settings-load/conflict/overwrite/start-error alerts; Cancel/Start footer                                                                               | Setup state                                     | Signed-in/anonymous, conflict/retry             | Required                                                                                                       |
| UI-05 / FC-03    | Viewport-filling practice or centered max-4xl rounded dialog; header title/subtitle, progress, Dialog view/Fullscreen/End; no footer                             | Practice frame/display mode                     | Native Escape/fallback/dialog switch/End        | Required                                                                                                       |
| UI-06 / FC-04    | Centered max-2xl flip card, rounded-3xl border/shadow, Front/Back badge and position, field label/language, scrollable long text, fallback note, Show back/front | Learning card                                   | Flip/long/RTL/text selection                    | Required                                                                                                       |
| UI-07 / FC-04/05 | Quiet side rating controls (Again left/Known right), swipe hints/threshold and Undo beneath card; save error toast/retry                                         | Card interaction/session                        | Swipe/keyboard/one write/failed-save retry/Undo | Required; add compact mobile rating controls for non-drag accessibility (baseline/ADR-0016), source hides them |
| UI-08 / FC-06/07 | Results max-2xl: four round tiles, session panel, separate saved progress bar/legend, Again/Start over/Finish and Undo                                           | Results                                         | Counts, retry rounds, refresh/Undo              | Required                                                                                                       |
| UI-09 / FC-08    | Loading skeleton, removed-card notice, content/idempotency/Undo conflict, retry countdown, unavailable content cleared, End confirmation                         | Runtime states                                  | Network/content/access/End                      | Required                                                                                                       |
| UI-10 / FC-09    | Light/dark semantic tokens, responsive spacing, reduced motion, language direction, focus/announcements                                                          | All training UI                                 | Narrow/wide, theme, zoom, keyboard              | Required; localize per ADR-0007                                                                                |
| UI-X             | Dictionary entry preview, prototype app header/designer/mock role/scenario controls                                                                              | None                                            | Diff/regression audit                           | Explicitly excluded by user                                                                                    |

Measurements and conditional branches are captured in the immutable source export
linked from DESIGN.md. On 2026-10-02 the user supplied four rendered reference
screenshots covering Train menu, setup, active practice and results. They have
been inspected and retained unchanged with hashes and links in
[feature 033 DESIGN](../033-flashcard-training-backend/DESIGN.md#rendered-references-supplied-by-the-user--2026-10-02).
Use the source geometry where screenshot scaling differs. Runtime comparisons
and any material adaptations belong in feature 034 EVIDENCE.md; source/reference
availability alone does not establish visual fidelity or unseen-state coverage.

## Architecture and verification constraints

Use feature-local FSD hooks/model/lib/API/UI and public contracts. Reuse session
refresh, dictionary shared-key handling and real backend feature capability.
No paid model calls, new database schema or production rollout. Keep default
backend flag false; enable only disposable test processes for verification.
Use the established local browser wrapper and safe Playwright infrastructure.
Separate tester is warranted for a new cross-boundary training journey harness.
Security review covers new token/shared-key transport, identity cleanup and
plain-text rendering; existing backend authorization is not redesigned.
