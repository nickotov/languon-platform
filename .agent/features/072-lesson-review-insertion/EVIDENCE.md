# Verification evidence

## First implementation (superseded)

These notes describe the former modal implementation. Current behavior and verification are recorded in the workspace-panel revision below.

The active task state was inspected in Storybook on desktop and mobile. The active row exposed a rotating icon and clipped text highlight; completed rows had no animation. Automated results are recorded after integration.

- AC-1 / AC-2 / AC-3: The Chromium journey ran against real disposable PostgreSQL and Redis with deterministic AI. It checked five ordered block wrappers, the read-only preview during generation, insertion at a verified editor caret, removing and reinserting a grammar block with a fresh ID, inserting the whole lesson, and explicit Save/reload. A simulated lost response produced one branch mutation. Mobile reopened the saved lesson by exact proposal ID after it was excluded from the normal history page. Four HTTP prerequisites and the 47-second browser journey passed. The designer inspected the 1440×1000 desktop and 390×844 mobile screenshots.
- AC-4: Two focused tests and desktop/mobile Storybook inspection confirmed that the current row alone received the activity styles. The reduced-motion media query disables both animations and forced-colors mode preserves text legibility.
- AC-5: Three disposable PostgreSQL cases covered owner isolation, ordinary proposal denial, branch version checks, matching and conflicting receipts, cursor insertion, old applied proposals, preserved references, fresh IDs and media-grant rollback. Eight contract and fourteen backend copy/placement tests passed. No migration, environment change or live model call is required.
- Review follow-up: eight focused frontend tests covered a stale branch, failed automatic reconciliation, explicit refresh, successful insertion against the new version and edits made during reconciliation. Five sheet tests covered document rendering and localized recovery notices. The ordinary proposal and prepared-preview regression suites passed.
- The project-wide web style checker reports the existing `content-filter` enum as a utility class at three unchanged sites in the lesson notice and lesson card. Scoped checks for the new components passed.
- Backend and web production builds passed, including backend declarations. All ten viewer diagrams passed freshness/parse checks, all 36 user-flow guides passed validation and the Knowledge workspace E2E mapping is synchronized. The Next.js build's generated route-reference change was removed from the working diff.
- Two additional rendered Chromium observations covered error recovery. A stale draft disabled individual and bulk insertions until **Refresh draft** succeeded. An unavailable cursor displayed the placement guidance; switching to the end of the document allowed insertion. These isolated stories complement the workspace reconciliation tests.

## Workspace-panel revision

The editor, source resolution, exercise disclosure and provenance suites passed 67 focused tests. The repeat-insertion and bookmark suites passed 6 tests. The completed/prepared review and navigation selection passed 37 tests, and shared overlay/kit collateral checks passed 37 tests with some overlap. All three affected user-flow mappings passed. The four supported locales include independent hint, reference-answer and answer-shown labels. Server-created part provenance is retained by document edits and omitted from copied HTML.

Chromium completed the mapped workspace journey at 1440×1000 and 390×844 against disposable PostgreSQL and Redis. It verified two paragraphs grouped in one reading, an exercise set in one editor, independently revealed hint and reference answer, explicit cursor/end actions, selecting the caret while review remained available, duplicate prevention and deliberate reinsertion with fresh IDs. It checked a lost-response retry, Save/reload, mobile document selection and return, and conversation recovery. All four HTTP prerequisites and 15 deterministic provider-fixture tests passed. The designer inspected both viewport captures and the disclosed exercise.

All 422 contract tests passed. The affected backend tutor, proposal, copy and placement selection passed 72 tests. Three disposable PostgreSQL cases verified owner isolation, stale revision/concurrent insertion protection, replay versus intentional fresh insertion, and rollback after a media grant was revoked. No environment or database migration is required.

The final production builds passed for web and backend, including web type checking and backend declaration emit. All 36 user-flow guides, the three affected E2E mappings and all ten architecture viewer diagrams passed their checks. Changed source files passed formatting checks.
