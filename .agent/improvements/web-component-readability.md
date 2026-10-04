# Improvement: Web component readability and card transcription

Status: Complete
Created: 2026-10-04
Updated: 2026-10-04

## Routing decision

Existing-contract UI and maintainability improvement across web components.
No new capability, journey, public contract, persisted data, security policy,
production dependency, deployment or architectural commitment. Current branch;
no automatic commit. Escalate before crossing a feature boundary.

## Context and scope

Inspect web TSX and CSS in sorted file order (including routes/providers/stories).
Keep component-private styles local; move styles consumed across component folders
to named common modules at their owning UI group. Separate CSS rules and independent
code statements with blank lines. Replace nested and bulky conditional derivations
with explicit branches; preserve short immediately readable binary conditions.
Memoize only for expensive work or meaningful identity contracts.

Display enabled, nonempty owner-card transcription below Source in parentheses
with smaller type. Remove it from optional detail rows; preserve dormant values,
notation settings, source language/direction and audio controls. Public shared cards
and editing fields retain their existing presentation.

Constraints: ADR-0005/0016/0017, frontend-development skill. Reuse runtime tokens,
Card/Badge/Menu and existing dictionary list stories. Related guide:
`docs/user-flows/dictionary-platform.md`. Rollback: revert this patch; no migration.

## Acceptance criteria

- AC-1: enabled nonempty transcription appears below Source in parentheses with
  smaller typography; disabled/empty transcription is absent and no separate row exists.
- AC-2: every web component/style file is inventoried in order; sibling components
  import shared styles through deliberately named common modules.
- AC-3: distinct CSS rules and independent statements/functions have blank-line
  separators; nested or bulky conditional derivations use readable if branches.
- AC-4: frontend skill explicitly covers these rules and audit completion checks.
- AC-5: affected tests/static/build, guide mapping, real browser evidence and
  independent completion review establish preserved behavior.

## Plan

- [x] Inventory and implement sequential component/style cleanup and transcription.
- [x] Update skill and guide/mapped regression coverage.
- [x] Run web tests, static checks, production build and real browser verification.
- [x] Author preflight, independent review and remediation.

## Verification strategy

Full web unit suite because cleanup touches shared primitives and many consumers.
Root lint for boundaries, web typecheck/build, targeted formatting and skill checks.
Extend existing card tests for enabled/disabled/empty transcription and retain
existing state/interaction tests. Existing owner mapped journey for changed card
presentation; mapped Playwright checks for desktop/narrow appearance. No backend/DB/security
review: corresponding semantics unchanged. Independent review warranted by broad
frontend refactor; no separate tester/new harness required.

## Outcome and evidence

Implemented owner-card transcription placement and sequential web source cleanup.
Eight common CSS modules now express ownership explicitly. Source scanner found
no nested ternaries or missing statement/CSS-rule separators. Shared styles retain
their declarations except the requested dictionary-card source/transcription rules.

Author preflight: no contract/security/persistence/dependency change, no cross-app
imports, no generated source modifications intended for handoff. No backlog task
selected. Existing guide revision and mapped owner journey synchronized.

Checks on the runtime patch:

- Web tests: 42 files / 362 tests pass, including five added transcription cases
  covering active/archived, disabled, null and empty values. Existing malicious-string,
  RTL, audio, generation, lifecycle, state and shared-primitives tests remain valid.
- Web TypeScript check and root lint pass.
- All 16 user-flow guides and E2E mappings validate; selected dictionary-platform
  revision `sha256:88cffdee38a7d5a1` validates with 10 existing scenarios.
- Frontend skill project validation and cached-PyYAML quick validation pass.
- Scoped formatting and `git diff --check` pass.
- Owner browser journey passed on final stylesheet names; checks desktop 1280px,
  tablet 768px, narrow 320px, 200% root text scale, archived cards, lower Source
  transcription in parentheses with smaller computed font and no separate row.
  Also validates retained editing, archive/restore and audio-adjacent geometry,
  with no captured browser errors. Screenshots saved and visually inspected at `/tmp/languon-transcription-desktop.png` and `/tmp/languon-transcription-narrow.png`.
- Shared UI-kit browser journey passes, including theme preference/refresh and
  runtime styled shell controls. Both journeys use task-owned disposable PG/Redis,
  isolated 3337/4007 host processes, and deterministic fake data.

Browser diagnosis: existing Save→Cancel transitions could click before the saved
outcome settled, leaving the settings dialog open. Both transitions now await
successful save and dialog closure; subsequent owner runs pass. No production
dialog behavior changed. An earlier concurrent build removed Playwright's shared
artifact path; final browser/build checks run sequentially.

Final production build passes (Next.js webpack compilation, TypeScript, and all
static pages). Task-owned custom dist output removed; Next's own declaration
generator restores the original development `next-env.d.ts`. No generated or
unrelated work is included in the deliverable.

Independent initial completion review: PASS, reviewer
`/root/web_readability_review`, base `81c41fc` through final scoped patch including
all eight common CSS modules. Reviewed branch equivalence, style ownership,
transcription states/direction/audio, a11y, FSD boundaries and coverage. CR-001
(Medium, resolved): Translation centered against taller Source+transcription,
reproducing a 10.375px offset. `.pair { align-items: start }` plus actual word-span
geometry assertion `<2px` resolves it; final owner journey and screenshots pass.
No unresolved material findings; no separate tester/security review trigger.

Completion: AC-1 through AC-5 satisfied. Every product browser journey was not
replayed for the mechanical cleanup; confidence is proportional to its preserved
semantics, independent review, full web unit/static/build coverage and the two
focused real-browser journeys. Evidence logs: `/tmp/languon-web-{tests,typecheck,lint,e2e,ui-kit-e2e,build,format}.log`,
`/tmp/languon-skills.log`, `/tmp/languon-web-docs.log`, `/tmp/languon-web-mapping.log`.

## Remaining risks

No unresolved material risks. Broad whitespace/branch cleanup was not replayed
through every product browser journey; evidence and semantic review are described
above. Rollback remains patch reversion, without data changes.
Whitespace additions may raise file line counts without
changing existing responsibility boundaries; no unrelated structural refactors.

## Sequential audit inventory

Inspected 225 TSX files (components, routes, providers and stories) and 77 CSS
files in sorted path order. Parser-based inspection covered every file's imports,
conditional expressions and statement boundaries; source/diff review covered the
identified ownership and conditional-render paths. This is a targeted audit of
the requested patterns, not a general product correctness review.

Final parser audit: zero nested ternaries, zero missing independent-statement
separators, zero adjacent CSS rule blocks without a separator. The 34 imports of
common modules resolve at their owning UI group; no component imports a sibling
component's private CSS module. Eight sheets moved/renamed without changing declarations
except the requested dictionary-list transcription rules. Existing auth/account
and app-shell sheets already have explicit group ownership.

No blanket memoization was added: all new resolvers are cheap synchronous
calculations and ordinary rendering; no stable reference consumer requires it.
Existing hook dependencies and subscription identities remain unchanged.
Whitespace/branch expansion retains existing responsibilities, including files
already above the skill's 250-line review threshold. Splitting established local
state/markup merely to offset added separators would disperse their existing
contracts and expand this readability patch into unrelated restructuring.

| Inspected path (repository relative)                                                                                                                | Disposition                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/web/src/app/(auth)/forgot-password/page.tsx`                                                                                                  | Inspected; existing conventions retained                |
| `apps/web/src/app/(auth)/layout.tsx`                                                                                                                | Inspected; existing conventions retained                |
| `apps/web/src/app/(auth)/login/page.tsx`                                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/app/(auth)/reset-password/page.tsx`                                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/app/(auth)/security/page.tsx`                                                                                                         | Inspected; existing conventions retained                |
| `apps/web/src/app/(auth)/signup/page.tsx`                                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/app/(auth)/verify-email/page.tsx`                                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/app/dictionaries/[dictionaryId]/page.tsx`                                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/app/dictionaries/page.tsx`                                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/app/globals.css`                                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/app/icon.tsx`                                                                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/app/layout.tsx`                                                                                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/app/not-found.tsx`                                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/app/page.tsx`                                                                                                                         | Inspected; existing conventions retained                |
| `apps/web/src/app/profile/page.tsx`                                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/app/shared/dictionaries/[shareId]/page.tsx`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/account-controls/ui/account-controls.module.css`                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/account-controls/ui/account-deletion-action.tsx`                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/account-controls/ui/account-handle-settings.tsx`                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/model/auth-provider.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/auth-shell.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/auth-ui.module.css`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/capability-state.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/forgot-password-form.tsx`                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/home-session-actions.tsx`                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/login-form.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/password-field.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/reset-password-form.tsx`                                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/security-settings.module.css`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/security-settings.tsx`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/signup-form.tsx`                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/auth/ui/verify-email-form.tsx`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/change-locale/ui/language-switcher/language-switcher.module.css`                                                         | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/change-locale/ui/language-switcher/language-switcher.tsx`                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/change-theme/ui/theme-switcher/theme-switcher.module.css`                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/change-theme/ui/theme-switcher/theme-switcher.tsx`                                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/change-theme/ui/theme-toggle/theme-toggle.tsx`                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-audio/ui/dictionary-audio-control/dictionary-audio-control.module.css`                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-audio/ui/dictionary-audio-control/dictionary-audio-control.tsx`                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-batch-generation/ui/dictionary-batch-generation-panel/dictionary-batch-generation-panel.module.css`           | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-batch-generation/ui/dictionary-batch-generation-panel/dictionary-batch-generation-panel.stories.tsx`          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-batch-generation/ui/dictionary-batch-generation-panel/dictionary-batch-generation-panel.tsx`                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-ai-assistance/authoring-ai-assistance.module.css`                                 | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-ai-assistance/authoring-ai-assistance.tsx`                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/authoring-field.tsx`                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/authoring-input.tsx`                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/field-progress.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/card-field-overrides/card-field-overrides.tsx`                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/card-translation-context/card-translation-context.module.css`                               | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/card-translation-context/card-translation-context.tsx`                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form-common.module.css`                                                     | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/auto-save-feedback.tsx`                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/dictionary-card-form.stories.tsx`                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/dictionary-card-form.tsx`                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/form-version-navigation.tsx`                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-list/ui/card-deletion-dialog/card-deletion-dialog.tsx`                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-list-common.module.css`                                                          | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-list/dictionary-card-list.stories.tsx`                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-list/dictionary-card-list.tsx`                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-row/dictionary-card-row.tsx`                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-card-list/ui/optional-fields/optional-fields.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-document-generation/ui/dictionary-document-generation-panel/dictionary-document-generation-panel.module.css`  | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-document-generation/ui/dictionary-document-generation-panel/dictionary-document-generation-panel.stories.tsx` | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-document-generation/ui/dictionary-document-generation-panel/dictionary-document-generation-panel.tsx`         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/dictionary-generation-panel-common.module.css`                                                  | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/features/dictionary-generation/ui/dictionary-generation-panel/dictionary-generation-panel.stories.tsx`                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/dictionary-generation-panel/dictionary-generation-panel.tsx`                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-alternative.tsx`                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-field.tsx`                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-fields.tsx`                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-footer/review-footer.tsx`                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-status/review-current-card.tsx`                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-status/review-status.tsx`                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-export-panel/dictionary-export-panel.module.css`                                    | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-export-panel/dictionary-export-panel.stories.tsx`                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-export-panel/dictionary-export-panel.tsx`                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-import-panel/dictionary-import-panel.module.css`                                    | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-import-panel/dictionary-import-panel.stories.tsx`                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-import-panel/dictionary-import-panel.tsx`                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-library/ui/dictionary-library-common.module.css`                                                              | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/features/dictionary-library/ui/dictionary-library/dictionary-library.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-library/ui/library-create-dialog/library-create-dialog.module.css`                                            | Inspected; existing conventions retained                |
| `apps/web/src/fsd/features/dictionary-library/ui/library-create-dialog/library-create-dialog.tsx`                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-library/ui/library-deletion-dialog/library-deletion-dialog.tsx`                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-library/ui/library-dictionary-row/library-dictionary-row.tsx`                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-library/ui/library-results/library-results.tsx`                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/dictionary-settings-form-common.module.css`                                                       | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/features/dictionary-settings/ui/dictionary-settings-form/dictionary-settings-form.stories.tsx`                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/dictionary-settings-form/dictionary-settings-form.tsx`                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-card-fields/settings-card-fields.tsx`                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-language-field/settings-language-field.tsx`                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-language-pair/settings-language-pair.tsx`                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-transcription/settings-transcription.tsx`                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-sharing/ui/dictionary-sharing/dictionary-sharing.module.css`                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/dictionary-sharing/ui/dictionary-sharing/dictionary-sharing.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/conflict-notice/conflict-notice.tsx`                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/end-session-dialog/end-session-dialog.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/field-group/field-group.tsx`                                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/flashcard/flashcard.module.css`                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/flashcard/flashcard.stories.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/flashcard/flashcard.tsx`                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/manual-selection/manual-selection.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/practice-content/practice-content.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/practice-session/practice-session.module.css`                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/practice-session/practice-session.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/prepare-summary/prepare-summary.tsx`                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/rating-button/rating-button.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/results-panel/results-panel.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/retry-button/retry-button.tsx`                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/saved-progress/saved-progress.tsx`                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/session-header/session-header.tsx`                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/session-status/session-status.tsx`                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/setup-alerts/setup-alerts.tsx`                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/setup-card-sides/setup-card-sides.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/setup-dialog/setup-dialog.tsx`                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/features/flashcard-training/ui/training-launcher/training-launcher.tsx`                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/dictionaries/ui/authenticated-dictionary-boundary.tsx`                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/dictionaries/ui/dictionaries-page/dictionaries-page.tsx`                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/dictionaries/ui/dictionary-editor-page/dictionary-editor-page.tsx`                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/dictionaries/ui/library-settings-sheet/library-settings-sheet.tsx`                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/forgot-password/ui/forgot-password-page.tsx`                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/home/ui/home-page.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/home/ui/home-page.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/login/ui/login-page.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/not-found/ui/not-found-page.module.css`                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/not-found/ui/not-found-page.tsx`                                                                                            | Inspected; existing conventions retained                |
| `apps/web/src/fsd/pages/profile/ui/profile-page/profile-page.module.css`                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/profile/ui/profile-page/profile-page.tsx`                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/reset-password/ui/reset-password-page.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/security/ui/security-page.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/shared-dictionary/ui/shared-dictionary-page/shared-dictionary-page.module.css`                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/shared-dictionary/ui/shared-dictionary-page/shared-dictionary-page.tsx`                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/signup/ui/signup-page.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/pages/verify-email/ui/verify-email-page.tsx`                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/i18n/i18n-provider.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/theme/theme-provider.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/ai-tutor-message/ai-tutor-message.module.css`                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/ai-tutor-message/ai-tutor-message.stories.tsx`                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/ai-tutor-message/ai-tutor-message.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/audio-player/audio-player.module.css`                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/audio-player/audio-player.stories.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/audio-player/audio-player.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/avatar/avatar.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/avatar/avatar.stories.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/avatar/avatar.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/badge/badge.module.css`                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/badge/badge.stories.tsx`                                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/badge/badge.tsx`                                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/breadcrumb/breadcrumb.module.css`                                                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/breadcrumb/breadcrumb.stories.tsx`                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/breadcrumb/breadcrumb.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/button/button.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/button/button.stories.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/button/button.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/card/card.module.css`                                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/card/card.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/card/card.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/checkbox/checkbox.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/checkbox/checkbox.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/checkbox/checkbox.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/combobox/combobox.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/combobox/combobox.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/combobox/combobox.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/dialog/dialog.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/dialog/dialog.stories.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/dialog/dialog.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/divider/divider.module.css`                                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/divider/divider.stories.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/divider/divider.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/empty-state/empty-state.module.css`                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/empty-state/empty-state.stories.tsx`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/empty-state/empty-state.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-card/exercise-card.module.css`                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-card/exercise-card.stories.tsx`                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-card/exercise-card.tsx`                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-option/exercise-option.module.css`                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-option/exercise-option.stories.tsx`                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/exercise-option/exercise-option.tsx`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/field/field.module.css`                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/field/field.stories.tsx`                                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/field/field.tsx`                                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/grammar-callout/grammar-callout.module.css`                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/grammar-callout/grammar-callout.stories.tsx`                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/grammar-callout/grammar-callout.tsx`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/heading/heading.module.css`                                                                                             | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/heading/heading.stories.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/heading/heading.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/icon-button/icon-button.module.css`                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/icon-button/icon-button.stories.tsx`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/icon-button/icon-button.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/icon/icon.module.css`                                                                                                   | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/icon/icon.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/icon/icon.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/inline-alert/inline-alert.module.css`                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/inline-alert/inline-alert.stories.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/inline-alert/inline-alert.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/input/input.module.css`                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/input/input.stories.tsx`                                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/input/input.tsx`                                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/lesson-content-block/lesson-content-block.module.css`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/lesson-content-block/lesson-content-block.stories.tsx`                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/lesson-content-block/lesson-content-block.tsx`                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/loading-state/loading-state.module.css`                                                                                 | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/loading-state/loading-state.stories.tsx`                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/loading-state/loading-state.tsx`                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/locked-content-state/locked-content-state.module.css`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/locked-content-state/locked-content-state.stories.tsx`                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/locked-content-state/locked-content-state.tsx`                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/logo/logo.module.css`                                                                                                   | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/logo/logo.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/logo/logo.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/menu/menu-common.module.css`                                                                                            | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/shared/ui/menu/menu-item.tsx`                                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/menu/menu.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/menu/menu.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/nav-item/nav-item.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/nav-item/nav-item.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/nav-item/nav-item.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/popover/popover.module.css`                                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/popover/popover.stories.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/popover/popover.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/progress/progress.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/progress/progress.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/progress/progress.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/radio-group/radio-group.module.css`                                                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/radio-group/radio-group.stories.tsx`                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/radio-group/radio-group.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/review-badge/review-badge.module.css`                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/review-badge/review-badge.stories.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/review-badge/review-badge.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/select/select.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/select/select.stories.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/select/select.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/skeleton/skeleton.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/skeleton/skeleton.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/skeleton/skeleton.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/spinner/spinner.module.css`                                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/spinner/spinner.stories.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/spinner/spinner.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/streak-indicator/streak-indicator.module.css`                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/streak-indicator/streak-indicator.stories.tsx`                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/streak-indicator/streak-indicator.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/switch/switch.module.css`                                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/switch/switch.stories.tsx`                                                                                              | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/switch/switch.tsx`                                                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tabs/tabs.module.css`                                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tabs/tabs.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tabs/tabs.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/text-link/text-link.module.css`                                                                                         | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/text-link/text-link.stories.tsx`                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/text-link/text-link.tsx`                                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/text/text.module.css`                                                                                                   | Inspected; existing conventions retained                |
| `apps/web/src/fsd/shared/ui/text/text.stories.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/text/text.tsx`                                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/textarea/textarea.module.css`                                                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/textarea/textarea.stories.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/textarea/textarea.tsx`                                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/toast/toast.module.css`                                                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/toast/toast.stories.tsx`                                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/toast/toast.tsx`                                                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tooltip/tooltip.module.css`                                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tooltip/tooltip.stories.tsx`                                                                                            | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/tooltip/tooltip.tsx`                                                                                                    | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/user-message/user-message.module.css`                                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/user-message/user-message.stories.tsx`                                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/user-message/user-message.tsx`                                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/vocabulary-term-card/vocabulary-term-card.module.css`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/vocabulary-term-card/vocabulary-term-card.stories.tsx`                                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/shared/ui/vocabulary-term-card/vocabulary-term-card.tsx`                                                                          | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/account-area/account-area.module.css`                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/account-area/account-area.tsx`                                                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/application-chrome/application-chrome.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/authenticated-app-shell/authenticated-app-shell.module.css`                                                  | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/authenticated-app-shell/authenticated-app-shell.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/mobile-drawer/mobile-drawer.module.css`                                                                      | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/mobile-drawer/mobile-drawer.tsx`                                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/dictionaries-navigation.tsx`                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/navigation-items.tsx`                                                                                | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/sidebar-common.module.css`                                                                           | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/sidebar.tsx`                                                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/dictionary-editor-common.module.css`                                                                 | Moved/renamed to explicit group ownership; spaced rules |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/dictionary-editor/dictionary-editor.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-add-card/editor-add-card.tsx`                                                                 | Inspected; existing conventions retained                |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-batch-sheet/editor-batch-sheet.tsx`                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet.module.css`                                                      | Inspected; existing conventions retained                |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-cards/editor-cards.tsx`                                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-discard-dialog/editor-discard-dialog.tsx`                                                     | Inspected; existing conventions retained                |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-document-sheet/editor-document-sheet.tsx`                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-empty-cards/editor-empty-cards.tsx`                                                           | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-export-sheet/editor-export-sheet.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-feedback/editor-feedback.tsx`                                                                 | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-generation-review/editor-generation-review.tsx`                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-import-sheet/editor-import-sheet.tsx`                                                         | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-load-error/editor-load-error.tsx`                                                             | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-secondary-actions/editor-secondary-actions.tsx`                                               | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-settings-sheet/editor-settings-sheet.tsx`                                                     | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-sharing-sheet/editor-sharing-sheet.tsx`                                                       | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-summary/editor-summary.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-toolbar/editor-toolbar.tsx`                                                                   | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/site-header/ui/site-header/site-header.module.css`                                                                        | Updated spacing/readability; inspected                  |
| `apps/web/src/fsd/widgets/site-header/ui/site-header/site-header.tsx`                                                                               | Updated spacing/readability; inspected                  |
