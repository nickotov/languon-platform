# ExecPlan: Model preferences and sentence practice web

Status: Complete
Updated: 2026-10-05

## Goal and specification

Deliver [FEATURE.md](FEATURE.md) AC-1–7 using selected035/036 v001 designs. Existing backend Complete stays unchanged. Active branch feature/sentence-practice-web from main8909424 includes prior authorized design-analysis changes.

## Architecture

Existing profile page and flashcard launcher/shared Dialog/Popover/token contracts provide seams. New text-ai-preferences and sentence-training features share only lower-layer contract/auth utilities; widget composes both training features and preferences recovery. Next client component guidance read from pinned Next local docs. ADR0016/0017/0026/0027 constrain behavior.

## Milestones

- [x] M1 — Profile preferences, persistence/conflicts/navigation and real recovery (AC-1).
- [x] M2 — Sentence API/session controller, setup/source/hints/check/reference/jobs/history/progress/presentation and dictionary integration (AC-2–6).
- [x] M3 — Focused tests, real deterministic browser/backend journeys, source comparison, guides and static/build checks (AC-7).
- [x] M4 — Author preflight, independent completion/security review, remediation, final evidence/backlog and local squash delivery (AC-7).

## Test strategy and ownership

Root owns specification, architecture integration, widget/menu composition, design handoffs and final checks. Profile worker owns text-ai-preferences and profile composition. Sentence controller worker owns sentence-training API/hooks/model/lib/types. Sentence UI worker owns its ui segment, avoiding controller edits. Independent tester owns new browser E2E test/harness changes and draft guide: required because jobs, auth, sharing and credits cross app boundaries. Workers are not alone and preserve each other's edits. Completion/security review after author preflight, not each task.

Units/component/contract tests cover validation, state races and API mappings. Deterministic local full-stack Playwright covers persistence, owner/reader practice, free reveal, job cancellation/recovery, layout continuity and auth/access. Real browser rendered evidence required. Use disposable PG/Redis and deterministic paid-service substitutes; never shared DB or paid AI. No schema change intended, so new migration tests omitted unless backend work expands. Web lint/typecheck/test/build and guide traceability required; existing profile/flashcard regressions retained.

## User-flow mappings

New sentence-practice-web guide/test as specified in FEATURE. Inspect existing magic-profile-page, flashcard-training-web and dictionary-platform mappings before changing composition; update only changed observable guide behavior/source mappings. Tester owns new guide and traceability; root synchronizes backlog and canonical plan.

## Progress

- 2026-10-04 — Authorization reused; v001/provider v6 selected; feature037 and branch created preserving analysis files. Next implement independent profile/controller/UI slices and deterministic E2E harness.

## Decisions

- D1 — Use a widgets-level dictionary-training composition to prevent sibling feature imports. Model preference recovery is supplied from the widget to session UI, preserving controller state.
- D2 — Keep authenticated/generated sentence content in ephemeral scoped state; history/progress server queries do not persist sensitive caches. No post-reload draft guarantee.

## Validation

[EVIDENCE.md](EVIDENCE.md) owns proof and source inventory outcomes; [REVIEW.md](REVIEW.md) owns independent findings.

## Remaining work

None for the authorized feature. The unrelated baseline profile deletion-receipt
failure and proof limitations are documented in EVIDENCE and REVIEW. No production
activation, push, or branch deletion is included.

- 2026-10-04 — Author preflight:401 web unit tests pass, final UI6 scoped tests and23 controller tests pass; web/backend typecheck, web lint, scoped backend fixturelint and productionbuild pass. Two real PostgreSQL/Redis/Next/Hono critical journeys pass with current guidehash, including zero-credit402 then free reference, personal isolation, live revocation, nativefullscreen foregroundhit test and screenshots. Screenshotreview caught and remediated native top-layer bug before completion review. Rendered evidence retained in evidence/browser. Existing profile/flashcard browser regressions still scheduled alongside independent review.

- 2026-10-05 — Remediation checkpoint: all 49 web test files and 416 tests pass;
  web lint and typecheck pass. Five component regressions cover over-limit input,
  failed-admission draft exit, unknown progress/free retry, accepted cancellation
  and first-page retry. Independent security review resolved the shared-cache
  denial finding. Completion reviewer accepted R1–R6 and R8–R9 in source; R7 and
  final responsive browser evidence remain open.
- 2026-10-05 — Existing Flashcard journeys passed (4). Legacy profile journey's
  header selector was repaired to the existing Account menu contract. Its deletion
  receipt assertion fails after successful 202 because unchanged main-branch app
  chrome remounts the page on sign-out. Independent review confirmed this is an
  unrelated baseline defect; preserve the assertion and exclude a shell redesign.
- 2026-10-05 — Repeated synthetic sentence runs exhausted conservative fallback
  token reservations in disposable infrastructure. The deterministic test provider
  now reports synthetic 50-input/50-output usage through the production port. Fresh
  owned disposable databases isolate final proof; production limits are unchanged.

## Final verification and delivery — 2026-10-05

- Final six real-app journeys passed in 35.1 seconds at guide revision
  sha256:10ce631498e40ee5. Root inspected retained captures; all 23 are manifested.
- Final 49 web test files/417 tests, lint, typecheck, backend typecheck/fixture lint,
  production build and source/frozen hash checks passed.
- Independent completion/security remediation reviews resolved all findings.
  Early root traversal dispatch fixes actual immediate Back before Next unmounts
  the profile; numeric metadata preserves router state without sentinel entries.
- All sentence protected state clears on known access loss; the already loaded
  outer shared-page preview is explicitly outside this established feature boundary.
- Both v001 design targets are Implemented with unchanged source/prompt identities.
  Backlog 004/005 are Done and all current links synchronized; 003 stays In progress.
- Feature-owned test services/caches removed. Existing user dev server 3333 was
  preserved; canonical next-env was regenerated through pinned Next's generator.
- Final local feature commits and required one-commit squash merge into main are
  recorded by Git; no push or branch deletion is authorized or performed.

- 2026-10-05 — Local implementation commit `02ed13d5f792e2aa63500b7d9995af81955eaf8c`. Subsequent changes
  only record handoff/review commit provenance before the required squash merge.
