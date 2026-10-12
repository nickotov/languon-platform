# Remaining markup audit

Guard follow-up: converted `triggerClassName`/`menuClassName` on EditorSecondaryActions and SharedPracticeActions as well as direct `className` attributes. Their existing important 40px trigger-size overrides remain important class declarations to preserve the shared primitive defaults and secondary variant behavior. Re-ran the style contract; no Tailwind utility or static-inline warning remains in owned markup. Remaining output concerns root-owned CSS tokenization. Formatter and diff check passed after these edits.

Scope: all web TSX except flashcard-training and sentence-training (separate workers).
Method: deterministic sorted source scan for literal and expression class attributes, style attributes, and neighboring runtime CSS owners; utility-bearing components and static story wrappers were inspected and migrated. Existing CSS Module consumers without utility/static-inline presentation retain their source.

States preserved in source: responsive sm/md/lg layout, selected row background/border, RTL arrows, focused buttons, loading/spinner/reduced motion, empty/error/archive, drawer/dialog, pagination/selection dock, light/dark semantic colors. Browser evidence remains the root delivery responsibility.

Intentional runtime inline styles: progress/audio percentage, Skeleton externally supplied dimensions/style, Floating UI position and tooltip arrow offsets. ImageResponse icon is a non-DOM Satori image renderer that cannot consume CSS Modules; its static style object is an explicit exception. Static SkeletonCard dimensions moved to CSS.

Targeted check: pnpm --filter @languon/web exec vitest run tests/ui-kit-public-contract.test.tsx — 1 file, 2 tests passed. Formatter and git diff --check passed. No final all-suite/browser claim.

Component sizing: dictionary-training orchestration was already over 250 lines; changes replace class attributes only, so splitting its orchestration would add unrelated behavioral risk. LibraryFilters is a cohesive existing filter form with no new behavior.

| Path                                                                                                                                                | Disposition                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/web/src/app/(auth)/forgot-password/page.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/layout.tsx`                                                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/login/page.tsx`                                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/reset-password/page.tsx`                                                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/security/page.tsx`                                                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/signup/page.tsx`                                                                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/app/(auth)/verify-email/page.tsx`                                                                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/app/dictionaries/[dictionaryId]/page.tsx`                                                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/app/dictionaries/[dictionaryId]/sentences/[exampleId]/page.tsx`                                                                       | Existing CSS Modules or no styling changes |
| `apps/web/src/app/dictionaries/[dictionaryId]/sentences/layout.tsx`                                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/app/dictionaries/[dictionaryId]/sentences/page.tsx`                                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/app/dictionaries/page.tsx`                                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/app/icon.tsx`                                                                                                                         | ImageResponse renderer exception           |
| `apps/web/src/app/layout.tsx`                                                                                                                       | Existing CSS Modules or no styling changes |
| `apps/web/src/app/not-found.tsx`                                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/app/page.tsx`                                                                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/app/profile/page.tsx`                                                                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/app/shared/dictionaries/[shareId]/page.tsx`                                                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/app/shared/dictionaries/[shareId]/sentences/[exampleId]/page.tsx`                                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/app/shared/dictionaries/[shareId]/sentences/layout.tsx`                                                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/app/shared/dictionaries/[shareId]/sentences/page.tsx`                                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/account-controls/ui/account-deletion-action.tsx`                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/account-controls/ui/account-handle-settings.tsx`                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/model/auth-provider.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/auth-shell.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/capability-state.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/forgot-password-form.tsx`                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/home-session-actions.tsx`                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/login-form.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/password-field.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/reset-password-form.tsx`                                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/security-settings.tsx`                                                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/signup-form.tsx`                                                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/auth/ui/verify-email-form.tsx`                                                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/change-locale/ui/language-switcher/language-switcher.tsx`                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/change-theme/ui/theme-switcher/theme-switcher.tsx`                                                                       | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/change-theme/ui/theme-toggle/theme-toggle.tsx`                                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-audio/ui/dictionary-audio-control/dictionary-audio-control.tsx`                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-batch-generation/ui/dictionary-batch-generation-panel/dictionary-batch-generation-panel.stories.tsx`          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-batch-generation/ui/dictionary-batch-generation-panel/dictionary-batch-generation-panel.tsx`                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-ai-assistance/authoring-ai-assistance.tsx`                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/authoring-field.tsx`                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/authoring-input.tsx`                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/authoring-field/field-progress.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/card-field-overrides/card-field-overrides.tsx`                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/card-translation-context/card-translation-context.tsx`                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/auto-save-feedback.tsx`                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/dictionary-card-form.stories.tsx`                                      | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/dictionary-card-form.tsx`                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-authoring/ui/dictionary-card-form/form-version-navigation.tsx`                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-list/ui/card-deletion-dialog/card-deletion-dialog.tsx`                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-list/dictionary-card-list.stories.tsx`                                           | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-list/dictionary-card-list.tsx`                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-list/ui/dictionary-card-row/dictionary-card-row.tsx`                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-card-list/ui/optional-fields/optional-fields.tsx`                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-document-generation/ui/dictionary-document-generation-panel/dictionary-document-generation-panel.stories.tsx` | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-document-generation/ui/dictionary-document-generation-panel/dictionary-document-generation-panel.tsx`         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/dictionary-generation-panel/dictionary-generation-panel.stories.tsx`                            | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/dictionary-generation/ui/dictionary-generation-panel/dictionary-generation-panel.tsx`                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-alternative.tsx`                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-field.tsx`                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-field/review-fields.tsx`                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-footer/review-footer.tsx`                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-status/review-current-card.tsx`                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-generation/ui/review-status/review-status.tsx`                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-export-panel/dictionary-export-panel.stories.tsx`                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-export-panel/dictionary-export-panel.tsx`                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-import-panel/dictionary-import-panel.stories.tsx`                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-interchange/ui/dictionary-import-panel/dictionary-import-panel.tsx`                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-library/ui/dictionary-library/dictionary-library.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-library/ui/library-create-dialog/library-create-dialog.tsx`                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-library/ui/library-deletion-dialog/library-deletion-dialog.tsx`                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-library/ui/library-dictionary-row/library-dictionary-row.tsx`                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-library/ui/library-results/library-results.tsx`                                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/dictionary-settings-form/dictionary-settings-form.stories.tsx`                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/dictionary-settings-form/dictionary-settings-form.tsx`                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-card-fields/settings-card-fields.tsx`                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-language-field/settings-language-field.tsx`                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-language-pair/settings-language-pair.tsx`                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-settings/ui/settings-transcription/settings-transcription.tsx`                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/dictionary-sharing/ui/dictionary-sharing/dictionary-sharing.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/sentence-library/ui/archive-confirmation/archive-confirmation.tsx`                                                       | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/hint-groups/hint-groups.tsx`                                                                         | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/library-filters/library-filters.tsx`                                                                 | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/library-list/library-list.tsx`                                                                       | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/library-states/library-states.tsx`                                                                   | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/sentence-badges/sentence-badges.tsx`                                                                 | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/sentence-detail/sentence-detail.tsx`                                                                 | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/sentence-detail/sentence-status.tsx`                                                                 | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/sentence-library/sentence-library.tsx`                                                               | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/sentence-library/ui/sentence-row/sentence-row.tsx`                                                                       | Migrated class/static-style presentation   |
| `apps/web/src/fsd/features/text-ai-preferences/ui/model-preference-section/model-option.tsx`                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/text-ai-preferences/ui/model-preference-section/model-preference-section.tsx`                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/text-ai-preferences/ui/model-preference-section/preference-alerts.tsx`                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/features/text-ai-preferences/ui/model-preference-section/preference-picker.tsx`                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/dictionaries/ui/authenticated-dictionary-boundary.tsx`                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/dictionaries/ui/dictionaries-page/dictionaries-page.tsx`                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/dictionaries/ui/dictionary-editor-page/dictionary-editor-page.tsx`                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/dictionaries/ui/library-settings-sheet/library-settings-sheet.tsx`                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/forgot-password/ui/forgot-password-page.tsx`                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/home/ui/home-page.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/login/ui/login-page.tsx`                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/not-found/ui/not-found-page.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/profile/ui/profile-page/profile-page.tsx`                                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/reset-password/ui/reset-password-page.tsx`                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/security/ui/security-page.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/sentence-library/ui/sentence-library-page/sentence-library-page.tsx`                                                        | Migrated class/static-style presentation   |
| `apps/web/src/fsd/pages/sentence-library/ui/sentence-library-route/sentence-library-route.tsx`                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/shared-dictionary/ui/shared-dictionary-page/shared-dictionary-page.tsx`                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/signup/ui/signup-page.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/pages/verify-email/ui/verify-email-page.tsx`                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/i18n/i18n-provider.tsx`                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/theme/theme-provider.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/ai-tutor-message/ai-tutor-message.stories.tsx`                                                                          | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/ai-tutor-message/ai-tutor-message.tsx`                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/audio-player/audio-player.stories.tsx`                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/audio-player/audio-player.tsx`                                                                                          | Runtime styles retained                    |
| `apps/web/src/fsd/shared/ui/avatar/avatar.stories.tsx`                                                                                              | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/avatar/avatar.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/badge/badge.stories.tsx`                                                                                                | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/badge/badge.tsx`                                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/breadcrumb/breadcrumb.stories.tsx`                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/breadcrumb/breadcrumb.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/button/button.stories.tsx`                                                                                              | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/button/button.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/card/card.stories.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/card/card.tsx`                                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/checkbox/checkbox.stories.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/checkbox/checkbox.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/combobox/combobox.stories.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/combobox/combobox.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/dialog/dialog.stories.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/dialog/dialog.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/divider/divider.stories.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/divider/divider.tsx`                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/empty-state/empty-state.stories.tsx`                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/empty-state/empty-state.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/exercise-card/exercise-card.stories.tsx`                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/exercise-card/exercise-card.tsx`                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/exercise-option/exercise-option.stories.tsx`                                                                            | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/exercise-option/exercise-option.tsx`                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/field/field.stories.tsx`                                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/field/field.tsx`                                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/grammar-callout/grammar-callout.stories.tsx`                                                                            | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/grammar-callout/grammar-callout.tsx`                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/heading/heading.stories.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/heading/heading.tsx`                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/icon-button/icon-button.stories.tsx`                                                                                    | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/icon-button/icon-button.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/icon/icon.stories.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/icon/icon.tsx`                                                                                                          | ImageResponse renderer exception           |
| `apps/web/src/fsd/shared/ui/inline-alert/inline-alert.stories.tsx`                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/inline-alert/inline-alert.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/input/input.stories.tsx`                                                                                                | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/input/input.tsx`                                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/lesson-content-block/lesson-content-block.stories.tsx`                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/lesson-content-block/lesson-content-block.tsx`                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/loading-state/loading-state.stories.tsx`                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/loading-state/loading-state.tsx`                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/locked-content-state/locked-content-state.stories.tsx`                                                                  | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/locked-content-state/locked-content-state.tsx`                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/logo/logo.stories.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/logo/logo.tsx`                                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/menu/menu-item.tsx`                                                                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/menu/menu.stories.tsx`                                                                                                  | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/menu/menu.tsx`                                                                                                          | Runtime styles retained                    |
| `apps/web/src/fsd/shared/ui/nav-item/nav-item.stories.tsx`                                                                                          | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/nav-item/nav-item.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/popover/popover.stories.tsx`                                                                                            | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/popover/popover.tsx`                                                                                                    | Runtime styles retained                    |
| `apps/web/src/fsd/shared/ui/progress/progress.stories.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/progress/progress.tsx`                                                                                                  | Runtime styles retained                    |
| `apps/web/src/fsd/shared/ui/radio-group/radio-group.stories.tsx`                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/radio-group/radio-group.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/review-badge/review-badge.stories.tsx`                                                                                  | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/review-badge/review-badge.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/select/select.stories.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/select/select.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/skeleton/skeleton.stories.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/skeleton/skeleton.tsx`                                                                                                  | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/spinner/spinner.stories.tsx`                                                                                            | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/spinner/spinner.tsx`                                                                                                    | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/streak-indicator/streak-indicator.stories.tsx`                                                                          | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/streak-indicator/streak-indicator.tsx`                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/switch/switch.stories.tsx`                                                                                              | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/switch/switch.tsx`                                                                                                      | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/tabs/tabs.stories.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/tabs/tabs.tsx`                                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/text-link/text-link.stories.tsx`                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/text-link/text-link.tsx`                                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/text/text.stories.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/text/text.tsx`                                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/textarea/textarea.stories.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/textarea/textarea.tsx`                                                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/toast/toast.stories.tsx`                                                                                                | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/toast/toast.tsx`                                                                                                        | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/tooltip/tooltip.stories.tsx`                                                                                            | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/tooltip/tooltip.tsx`                                                                                                    | Runtime styles retained                    |
| `apps/web/src/fsd/shared/ui/user-message/user-message.stories.tsx`                                                                                  | Migrated class/static-style presentation   |
| `apps/web/src/fsd/shared/ui/user-message/user-message.tsx`                                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/vocabulary-term-card/vocabulary-term-card.stories.tsx`                                                                  | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/shared/ui/vocabulary-term-card/vocabulary-term-card.tsx`                                                                          | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/account-area/account-area.tsx`                                                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/application-chrome/application-chrome.tsx`                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/authenticated-app-shell/authenticated-app-shell.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/mobile-drawer/mobile-drawer.tsx`                                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/dictionaries-navigation.tsx`                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/navigation-items.tsx`                                                                                | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/app-shell/ui/sidebar/sidebar.tsx`                                                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/dictionary-editor/dictionary-editor.tsx`                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-add-card/editor-add-card.tsx`                                                                 | Migrated class/static-style presentation   |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-batch-sheet/editor-batch-sheet.tsx`                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet.tsx`                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-cards/editor-cards.tsx`                                                                       | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-discard-dialog/editor-discard-dialog.tsx`                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-document-sheet/editor-document-sheet.tsx`                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-empty-cards/editor-empty-cards.tsx`                                                           | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-export-sheet/editor-export-sheet.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-feedback/editor-feedback.tsx`                                                                 | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-generation-review/editor-generation-review.tsx`                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-import-sheet/editor-import-sheet.tsx`                                                         | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-load-error/editor-load-error.tsx`                                                             | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-secondary-actions/editor-secondary-actions.tsx`                                               | Migrated class/static-style presentation   |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-settings-sheet/editor-settings-sheet.tsx`                                                     | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-sharing-sheet/editor-sharing-sheet.tsx`                                                       | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-summary/editor-summary.tsx`                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-toolbar/editor-toolbar.tsx`                                                                   | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/dictionary-training/ui/dictionary-training/dictionary-training.tsx`                                                       | Migrated class/static-style presentation   |
| `apps/web/src/fsd/widgets/dictionary-training/ui/practice-history/practice-history.tsx`                                                             | Migrated class/static-style presentation   |
| `apps/web/src/fsd/widgets/dictionary-training/ui/sentence-statistics/sentence-statistics.tsx`                                                       | Migrated class/static-style presentation   |
| `apps/web/src/fsd/widgets/dictionary-training/ui/shared-practice-actions/shared-practice-actions.tsx`                                               | Existing CSS Modules or no styling changes |
| `apps/web/src/fsd/widgets/site-header/ui/site-header/site-header.tsx`                                                                               | Existing CSS Modules or no styling changes |
