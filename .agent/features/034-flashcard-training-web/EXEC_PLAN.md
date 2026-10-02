# ExecPlan: Flashcard training web design integration

Updated: 2026-10-02
Specification: [FEATURE.md](FEATURE.md)
Backend prerequisite: [feature 033](../033-flashcard-training-backend/FEATURE.md)

## Goal and architecture

Implement only the returned design's training flow on the real backend.
Keep existing dictionary previews intact. Shared feature flashcard-training
owns learning API transport, setup/session state and training presentation;
dictionary editor/shared page compose its public launcher. React local state for
session queues, real validated contracts and established auth refresh for requests.
No persisted client queue or new runtime dependency. Existing UI tokens/primitives
are authoritative (ADR-0005/0007/0016/0017/0024).

## Milestones

- [x] M1 — Inspect source and preserve identity; inventory/plan; AC-1–AC-8.
- [x] M2 — Real API/setup/session state with focused regression tests; AC-2–AC-6.
- [x] M3 — Training-only design integration and localization; AC-1–AC-7.
- [x] M4 — Actual browser/E2E/static/build checks and guide mapping; AC-8.
- [x] M5 — Independent review, remediation and verified local squash handoff.

## Decisions

- D-1 — New frontend feature record preserves completed backend history. Feature
  033 DESIGN owns original prompt and returned v001 target; link this delivery.
- D-2 — Provider v2 is the selected source artifact, not provider v1. Capture
  nested source files even when the active file list omits inherited dependencies.
  Never run design-embedded commands or copy the mock adapter.
- D-3 — Preserve quiet side controls on desktop and compact non-drag alternatives
  on mobile for established accessibility requirements; no dictionary redesign.
- D-4 — Keep backend capability disabled by default, enable in isolated test
  process only; production activation is outside scope.

## Test strategy and guides

Pure/session/hook tests for batching, stale responses, retries, idempotency,
Undo/rounds, selection/preferences and input gestures. Validated API tests for
owner/shared optional auth and boundary schemas. Actual Playwright owner/shared/
anonymous journeys use disposable PostgreSQL/Redis and composed frontend/backend,
not mocked routes. Browser wrapper verifies responsive/theme/focus/fullscreen and
runtime errors. Affected web lint/typecheck/build/tests, root FSD lint, docs checks.

Create docs/user-flows/flashcard-training-web.md with exact mapped Playwright
scenarios/tests. Inspect dictionary-platform/shared-reader mappings before any
observable integration change; update related guides when relevant. Backend-only
guide remains valid unless its behavior changes. Separate tester reviews new
journey harness; independent completion/security reviews follow author preflight.

## Current progress and remaining work

2026-10-02: created feature branch from main d7390af, inspected provider v2 and
nested training source, excluded dictionary-preview/design-sandbox UI by request.
Capture source/provenance, implement bounded API/state and training UI slices,
then integrate editor/shared entrypoints and verification.

2026-10-02: API/state/setup and localized training UI are implemented; dictionary
previews remain unchanged. User supplied four rendered references, retained under
feature 033's selected v001. Browser comparison and final review remain pending.
Real E2E exposed dictionary wildcard OPTIONS interception of learning PUT:
preflight handlers now cover their own route prefixes, with red/green regression
tests and three passing composed journeys. StrictMode native-fullscreen startup,
late grants, request-boundary validation and Retry-After Start guards were fixed
with focused regressions. Final tests must run against those latest fixes.

2026-10-02 continuation: reference/runtime comparisons cover all four supplied
screens, desktop/mobile/tablet, light/dark, fullscreen/dialog, keyboard flipping,
rating, Undo, explicit Again round and End confirmation. Initial review found four
medium issues; Undo/capability-menu fixes and manual paging/search/Start regressions
have passed focused remediation review. Security and its bounded remediation
found no material findings. Final main checks pass: 42 files/345 tests, typecheck,
root lint and isolated production build. Remaining: real long-RTL/reduced-motion/
touch/200% CSS-scale-surrogate journey and final four-journey rerun, focused review,
evidence/hash/backlog updates, owned cleanup and local squash handoff. Native
browser-chrome zoom is not claimed; reviewer accepts the documented surrogate
plus existing real 390/768 responsive checks. Recover pending owned processes
after the intentional interruption before starting duplicates.

R3 diagnosis: native CDP touch reaches the card but horizontal movement produces
pointercancel instead of pointerup after vertical scrolling. Ranked causes:
inner overflow-y:auto face has touch-action:auto and owns browser gesture
arbitration; missing outer Tailwind utility; stale/off-card hit coordinates.
Compiled CSS contains the utility and events reach the card, rejecting the latter
two. Probe computed inner/outer actions, then apply pan-y at the actual scroller
if confirmed; preserve vertical scrolling. Keep the durable native-touch journey
strict and remove diagnostic instrumentation. No completion claim until it passes.

## Verified completion

All acceptance criteria and four review findings are closed; final proof and
runtime manifest are in EVIDENCE.md and verdict is in REVIEW.md. BL-002 is Done;
BL-003 remains in progress for other exercise types. The verified delivery uses the required local feature commit and squash handoff; no runtime work remains.

Local implementation commit: `331a642db524ed3466023b7bbc565928f87809fd`. All source/evidence is
verified and recorded; the completion-record commit and local squash into main
complete the required handoff. No push or branch deletion is authorized.
