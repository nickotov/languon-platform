# Improvement: Dictionary import and training UI fixes

Status: Complete
Created: 2026-10-03
Updated: 2026-10-04

## Routing decision

Focused existing-contract UX improvement across dictionary actions, import, and
training. Broader than one correction surface; no new capability, journey,
API, persistence, security policy, dependency, deployment or architecture choice.
The user requested fixes, not feature ceremony. Stop and request feature
authorization if those boundaries change. Current branch; no Git mutations.

## Context and scope

The supplied screenshots show collapsed import section/mapping/row gaps, native
unstyled file selection and oversized adjacent preview cards. Import CSS uses
undefined legacy token names. Train is 44px while Add card is 52px. Successful
swipe release clears translation before the rating ACK, snapping back to center.

Reuse runtime globals, Field/Input/Select/Checkbox/Switch/Card/Button/Menu and
BottomSheet contracts and comparable document generation panels; follow
ADR-0005, ADR-0016, ADR-0017 and unchanged training ACK semantics. Screenshots
are bug examples, not a supplied replacement design. Scope is presentation and
gesture lifecycle only. No backend or shared primitive changes are planned.
Rollback: revert this focused patch.

Related guides: dictionary-platform and flashcard-training-web; inspect existing
mapping before work. Existing documented behavior remains authoritative.

## Acceptance criteria

- AC-1: floating Train and Add card have the same 52px height.
- AC-2: import input, mapping, preview, warnings and enrichment actions have
  visible grouping/gaps, a styled keyboard-accessible file input, compact
  separated readable rows and narrow-width containment.
- AC-3: threshold swipe departs in the chosen direction and stays departed while
  saving; next acknowledged card appears centered. Short/cancelled/vertical
  drags return. Save failures/conflicts restore the current card for recovery.

## Plan and verification

- Implement scoped styles, input composition and swipe state.
- Regression-test departure/ACK reset/error recovery and preserve existing
  interaction and interchange tests; no tests mirroring CSS implementation.
- Run affected tests, web typecheck/lint and format/diff checks.
- Real safe-wrapper browser check: wide/narrow import empty/populated/warnings,
  action geometry, swipe/next card and keyboard access using synthetic data.
- Independent completion review justified by asynchronous swipe recovery risk.
- Guide updates only if documented observable contracts change; fixes currently
  restore existing contracts, so no new guide promise or journey is planned.

Database/security/full repository testing omitted: unchanged APIs, persistence,
trust boundaries and dependencies. Existing state tests cover ACK/retry/Undo.

## Outcome and evidence

Implementation, author preflight and independent review complete. Initial Git status clean. Both guide
`user-flow:e2e -- inspect` commands report synchronized mapping. Browser launched
through safe wrapper with task session
`languon-dictionary-ui-fixes-4a3f9cd4e4ad03c0cd1975a732738d37` (sandbox elevation
needed for the browser socket directory).

- E-1: `pnpm --filter @languon/web test` passes 42 files / 349 tests,
  including three new gesture cases for both departure directions, double
  release/cancellation, next-item reset and failed-save recovery. Focused
  interaction/state/interchange/launcher run passes 36 tests.
- E-2: web `typecheck`, `lint`, `build` all pass. Scoped Prettier and
  `git diff --check` pass. Build compiles CSS with webpack; actual local UI
  uses Turbopack. Generated next-env restored and isolated E2E build moved to
  `/private/tmp/languon-ui-fixes-e2e-build-20261003`.
- E-3: safe-wrapper Chromium with pinned agent-browser, localhost3333/API4000,
  synthetic account and four synthetic French/Russian cards: Train/Add card
  measured at 52px each; desktop1280x900 and narrow320x740 input and populated
  preview visually inspected. Keyboard file focus is visible; long content
  wraps, mapping stacks, preview rows have gaps and no nested list scroll,
  duplicate warning and unavailable enrichment remain readable. Import succeeds.
  Training setup/session renders. No browser exceptions or unexpected failed
  requests; console contains development React/HMR messages only.
  Screenshots: [desktop input](evidence/dictionary-import-and-training-ui/desktop-input.png),
  [desktop preview](evidence/dictionary-import-and-training-ui/desktop-preview.png),
  [mobile input](evidence/dictionary-import-and-training-ui/mobile-input.png),
  [mobile preview](evidence/dictionary-import-and-training-ui/mobile-preview.png).
- E-4: exact mapped Playwright selection:
  `pnpm --filter @languon/web exec playwright test tests/e2e/flashcard-training.journeys.spec.ts tests/e2e/dictionary-platform.journeys.spec.ts --grep 'renders a long RTL card|Quizlet|quizlet'`
  passes 2 tests in 25.2s. Owned ephemeral PostgreSQL `languon-ui-fixes-postgres`
  (loopback55447, database `languon_ui_fixes_e2e_test`) and Redis
  `languon-ui-fixes-redis` (loopback55448/db1); isolated web3334/API4001 and
  deterministic worker, `AUTH_E2E_DIST_DIR=.next-ui-fixes-e2e`.
  Native CDP touch verifies vertical scrolling, long RTL/reduced motion/200%
  CSS scale and horizontal swipe. New assertion holds the actual rating request,
  observes departed transform/opacity while saving, then releases it and observes
  the second card with centered transform/opacity. Real server ACK gates advance.
  Import/export journey includes real API/database and AI-selection contracts.
  Initial run failed solely because the new test used `Saving rating…` instead
  of the existing localized `Saving…`; corrected test passes. No runtime change
  was required to resolve that failure. No ad hoc Playwright inspection used.
- E-5: `pnpm docs:user-flows:check` validates all 16 guides; both affected
  `pnpm user-flow:e2e -- check` commands pass. Guide text needs no update because
  behavior/commands/source mapping restore existing contracts. Enhanced native
  swipe assertions retain the same stable scenario/revision. No backlog task
  was selected or implemented.
- Author diff reviewed for scope, component contracts and ACK/retry/conflict/Undo
  preservation. No production dependency, shared primitive or backend change.
  Independent review justified by gesture asynchronous recovery, not security.
- Tested source: base `61739a8116ed58553d9a81593af26ceaa53ad993` plus
  [final source hashes](evidence/dictionary-import-and-training-ui/tested-source.sha256),
  manifest SHA-256 `010960ef2a82a0686ec42ddcd4d7e6f8e52ef094f2450034275dc2d4ad2f93d9`.
  Runtime/unit-test source is unchanged since E-1/E-2/E-3; only the committed
  E2E assertion was added afterward and is covered by E-4 plus scoped ESLint
  and Prettier. Final diff check passes. No duplicate test/build rerun needed.
- Cleanup: both task-owned ephemeral containers stopped/removed; mapped E2E
  processes exited. Synthetic normal-app dictionary archived through the UI and
  safe-wrapper session closed; user-owned services/data remain running.
- Independent initial completion review: no material findings. Reviewer inspected
  the complete nine-file runtime/test diff, surrounding ACK/retry/conflict paths,
  source manifest and all four screenshots. Reviewed patch SHA-256
  `317773413a679cc073e448dc989b8e3211109fd4e1315de05dba3034af8698dd`.
  AC-1/E-3, AC-2/E-1/E-3/E-4 and AC-3/E-1/E-4 are satisfied. No remediation
  required. Completion changes only this prose; all tested source hashes match.

## Remaining risks

## Follow-up: Release-position fade — 2026-10-03

The user requests an outgoing fade at the actual release position, rather than
the current off-screen departure, followed by an incoming centered opacity fade.
Reopen this same outcome record; preserve all existing import/action changes and
their evidence. The earlier completion/review applies only to that earlier patch.

Scope: gesture transform retention, opacity-only incoming animation, and a bounded
presentation-completion barrier on rating advancement. The request still begins
immediately; signed-in advancement requires both ACK and outgoing animation.
Anonymous sessions remain local. Pending input guards stay in force until the
fade completes. Reduced motion removes the delay/animation; failed or conflicting
saves restore the current card. No transport, backend, persistence or dependencies
change. Explicitly avoid a separate snapshot/queue or off-screen translation.

Plan: red/green gesture/session tests, CSS/reduced-motion and fast-ACK checks,
focused native-touch mapped E2E, real safe-wrapper observation, scoped web static
checks, then independent remediation review of the changed transition surface.
Original import evidence remains valid for unchanged import sources. No database
implementation changes require repository/migration verification. Current user
instruction supersedes the earlier direction-departure portion of AC-3.

Follow-up evidence (base 61739a8 plus preserved earlier dirty improvement):

- F-1: release-position and fast-ACK regression was red before the fix (six
  failing cases). Final `pnpm --filter @languon/web test` passes 42 files / 357
  tests. Fade timing, reduced motion, teardown resolution, anonymous local-only
  input guards, saved ACK gates, rejected saves and post-disposal completion are
  covered; existing Undo/retry/idempotency tests remain intact.
- F-2: `pnpm --filter @languon/web typecheck`, `pnpm lint`, affected Prettier,
  `git diff --check`, all 16 guide validations, and flashcard guide mapping pass.
  Components/hooks remain below 250 lines. A new production build is unnecessary
  for this scoped motion change: real Next dev compilation and runtime CSS are
  verified; earlier import production-build evidence covers unchanged imports.
- F-3: final exact mapped selection
  `pnpm --filter @languon/web exec playwright test tests/e2e/flashcard-training.journeys.spec.ts --grep 'renders a long RTL card' --workers=1`
  passes 1/1 in 15.8s. It verifies reduced-motion suppression, native vertical
  scrolling, horizontal release-position matrix retained through opacity zero,
  held real rating request/ACK, next card centered and opacity-entry animation,
  and completion. Web3334/API4001, `AUTH_E2E_RUN_ID=swipe-fade-final2-20261003`,
  disposable DB `languon_swipe_fade_e2e_test` on loopback55447 and Redis55448/db1,
  `AUTH_E2E_DIST_DIR=.next-swipe-fade-e2e`. No shared-data reset or paid AI.
  An earlier test-only race sampled the penultimate coalesced pointer paint;
  final test waits for the actual last move before sampling its matrix.
- F-4: project-pinned safe-wrapper browser session
  `languon-swipe-release-fade-c526a31d77650e55699886f76ddaf90b`, existing web3333/API4000,
  synthetic account/two cards. Observed setup, fullscreen and card1→card2 via the
  retained non-drag control; card computed opacity1/transformnone, exit opacity
  transition200ms, outer centered entry animation200ms. Browser errors empty and
  console only dev React/HMR messages. Native swipe animation proof is F-3, not
  a claim that the wrapper performed native dragging. No additional visual
  design changes or supplied-design fidelity claim.
- Final source identity: [follow-up hashes](evidence/dictionary-import-and-training-ui/swipe-fade-source.sha256).
  Original import evidence/review remain valid only for unchanged import files;
  original swipe E-4/off-screen assertion is superseded by F-1/F-3.
- Synthetic normal-app account deletion scheduled through the established API
  (HTTP202, access revoked; recoverable deletion window then normal purge).
  Safe-wrapper session closed. Task E2E services exited; task containers and
  synthetic volumes removed. Isolated build moved recoverably to
  `/private/tmp/languon-swipe-fade-build.kyaVzV`; generated next-env restored.
  User-owned apps, panel and normal PostgreSQL/Redis are preserved.

Independent follow-up remediation/completion review: no material findings.
Reviewer verified all ten follow-up source hashes and inspected release transform,
ACK/presentation gates, anonymous local-only behavior, input guards, error/retry/
Undo recovery, teardown and disposal, reduced motion, centered keyed entry, and
F-1–F-4 evidence. Earlier import/action review remains valid for unchanged files.
Residual gaps are the limited network-failure/assistive-technology/native-zoom
matrix noted below, not material defects in this scoped transition.

2026-10-04 continuation: Git state inspected after interruption; all ten tested/
reviewed source hashes still match, and `git diff --check` passes. No runtime
changes occurred after verification/review, so no duplicate test run is required.
Follow-up is complete. All prior uncommitted work is preserved; no automatic
commit, merge, push, or branch deletion is authorized.

No known material defects. Real browser chrome zoom is not claimed;
the existing E2E uses CSS scaling as its 200% content surrogate. Save recovery is
covered by deterministic gesture/state tests; no live network-failure matrix
or dedicated assistive-technology run. Existing keyboard rating alternatives
are preserved. No commits, merges, pushes or branch deletion performed.
