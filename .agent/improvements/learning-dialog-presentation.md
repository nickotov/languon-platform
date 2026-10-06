# Improvement: Learning dialog presentation

Status: Complete
Created: 2026-10-05
Updated: 2026-10-05

## Scope and classification

Focused UX improvement to existing sentence and flashcard practice; no new journey, API, persistence, security, dependency or rollout policy. Preserve unrelated local-default correction changes. No commit/merge authorized.

## Acceptance and decisions

- Sentence setup initially selects target-to-source, with both directions still available.
- Both practice dialogs fill 100dvw / 100dvh. Add a reusable shared Dialog `size='viewport'` and story; retain ordinary sizes and flashcards' native keyboard handling.
- Sentence Close practice remains visible in the sticky header in loading, exercise and error states; preserve draft/active-job confirmation.
- AI preferences appear inside the current practice dialog, with a Back arrow. Practice stays mounted while hidden; preserve exact draft, job state, polling, dirty model-choice confirmation and future-job model semantics.
- Existing summary/history and native fullscreen behavior remain supported.

## Plan

- [x] Inspect shared primitive/styles/stories, practice compositions and model-preference dirty guards.
- [x] Implement and test defaults, dialog dimensions, close controls and preferences return.
- [x] Update mapped user-flow docs and regression journeys.
- [x] Run affected tests/typecheck/lint and real Chromium journeys, review and remediate.

## Constraints and verification

Use frontend-development, ui-ux-composition composition mode, testing, browser-verification and user-flow-e2e. Applicable ADRs: 0005/0016/0017 and existing learning/model preference contracts. No new design handoff or fidelity claim: user explicitly requests these presentation adjustments. Existing oversized session/widget components receive bounded composition edits; broader orchestration extraction is outside scope, and moving the entire controller into a hook would not clarify these changes.

## Evidence and review

Verified on 2026-10-05, Node 24, uncommitted scoped patch over main `e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a`:

- `pnpm --filter @languon/web test`: 49 files / 418 tests passed. After close-intent/focus remediation, affected `sentence-training-review-regressions.test.tsx` passed (5 tests); prior focused four-file suite passed 47 tests.
- Web typecheck, full web ESLint, affected Prettier and `git diff --check` passed. Production `next build --webpack` passed on final code with isolated `AUTH_E2E_DIST_DIR=.next-learning-dialog-build`; Turbopack development was exercised by the browser journeys.
- Six final real Chromium sentence journeys passed (1.1 minutes). Command: `pnpm --filter @languon/web test:e2e tests/e2e/sentence-practice.journeys.spec.ts`, with `AUTH_E2E_SENTENCE_SERVICES=true`, web `http://localhost:3349`, API `http://localhost:4049`, disposable PostgreSQL loopback 55459 / database `languon_learning_ui_test`, Redis loopback 56409 / DB 9, and `.next-learning-dialog-proof` output.
- Four final real Chromium flashcard journeys passed on the same owned infrastructure, Redis DB 6, command `pnpm --filter @languon/web test:e2e tests/e2e/flashcard-training.journeys.spec.ts`. Dimensions asserted after explicitly switching to Dialog view; End remains in viewport. Later sentence-only changes do not affect the frozen flashcard/shared-Dialog patch verified by this run.
- New sentence assertions prove initial target-to-source selection, explicit other-direction selection, exact viewport bounds, reachable Close, a single native modal for AI preferences, desktop/mobile sticky Back, dirty Back → Keep/Discard, dirty Close → Keep/Discard → answer confirmation, cancelling closure with restored focus and unchanged answer, plus existing generation/check/reference/fullscreen/history/error/revocation regressions. Tests wait for saved preference to load before deliberately changing it.
- Browser journeys use real Next/Hono/PostgreSQL/Redis and deterministic sentence providers; no paid services. Existing console/network assertions passed. Seven retained synthetic captures live in [evidence/learning-dialog-presentation](evidence/learning-dialog-presentation/); desktop/mobile inline settings and viewport practice captures were visually inspected.
- `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check sentence-practice-web`, and `pnpm user-flow:e2e -- check flashcard-training-web` passed. Guide revisions: `sha256:bc7da6b89707d4c0` and `sha256:53fe24550c7e8a4a` respectively.
- Initial combined suites exhausted the existing five email-send attempts/client/hour after flashcard signups. Suites were split onto fresh owned Redis DBs, preserving the production limiter. Cancellation fixture explicitly selects its slow source-to-target vocabulary now that the default is reversed. Intermediate probe failures exposed and corrected close-intent/focus behavior; only final passing runs count as acceptance evidence.
- Independent reviewer `learning_dialog_review`: PASS. Medium UI-IMP-01 (explicit Close losing its intent after dirty preference discard) resolved via a guarded continuation; Keep cancels it, Discard continues to the normal draft/job confirmation. Focus restoration is suppressed while confirmation is open and resumes afterward. No remaining material findings. No security/persistence behavior changed, so separate security/database review is not needed.
- Cleanup: removed only owned `languon-learning-ui-postgres` and `languon-learning-ui-redis` containers and the two task-owned Next output directories. Browser harness app/worker processes stopped normally. Restored canonical Next development type declarations through Next's own generator; preserved user's running development services and earlier backend correction edits. No commit, merge or push. Backlog synchronization does not apply: no task status was completed, reopened or skipped by this focused improvement.

## Rollback and remaining risks

Revert this focused patch to remove viewport sizing and in-dialog preferences; no data migration. Native fullscreen top-layer restoration and modal focus were covered in real Chromium. No known remaining material risk; the documented half-CSS-viewport zoom and reduced-height keyboard checks remain layout simulations, not native device proofs.
