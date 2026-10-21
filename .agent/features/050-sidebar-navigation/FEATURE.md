# Sidebar redesign and flexible Texts organization

Status: Complete — saved sidebar restored alongside learner portrait, verified and independently reviewed (2026-10-21)
Owner: Root
Created: 2026-10-20

## Authorization and scope

User authorized implementing the agreed plan on 2026-10-20. Base main 5efaafe; clean tree. Feature branch feature/sidebar-navigation. No backlog task. Full feature lifecycle including local commits/squash integration, no push/deploy/deletion.

## Acceptance criteria

- AC-01: Faithful contextual sidebar from Magic Patterns https://www.magicpatterns.com/c/h9kvac9aphfz1v5lvxhhrm artifact d331e500-740c-4e3e-83ec-7f1f2e9acfe3. 240px expanded,64px rail,56px brand/header, grouped Home/Library, search/Create, account footer. Planned Lessons/Courses hidden; docked browser excluded.
- AC-02: Authenticated whole-owned-library title search (case insensitive) plus real Create/settings/theme actions. Empty query five last-successfully-opened resources. No archived/inaccessible resources. Owner isolation, cancellation, bounded backend reads; no bulk client preload.
- AC-03: Account-synced last-opened and personal pins. Record successful actual resource loads only, not hover/prefetch/search. One metadata row/resource; current source titles/access authoritative. Pin/unpin row menus in navigation/search. Five section shortcuts pinned first then genuinely last-opened, filling remaining places from owned active resources ordered by domain update time when open history is absent; current item retained. Fallback resources keep lastOpenedAt null and never fabricate navigation metadata; global empty-search recents remain genuine opens; View all real libraries. Flyouts five shortcuts/filter up to eight.
- AC-04: Source mouse hover intent180ms/open240ms/close; click/touch/keyboard pin flyout, Escape/outside closes/focus restores. <768 header/drawer320px;768–1023 rail+drawer;>=1024 preference. <1280 editor+tutor auto rail with session explicit expansion override. Device-local user-scoped collapse/disclosures. Guest/session controls/preferences/signout preserved.
- AC-05: Text belongs to owner and zero/one folder. Optional membership across creation/copy/save/jobs/share/collection. Existing memberships preserved. Independent list; single-text version-checked moves between active same-owner folders or null, preserving identity/content/history/share links. Archived resources require restore. Block moves during pending AI/proposal/unsaved edits; reject races.
- AC-06: Shared destination requires confirmation of saved-translation exposure, also future draft publication; verify destination share state at commit. Moving out removes folder access, direct share persists; source version/share authority rechecks preserved.
- AC-07: Text library separate initially expanded Folders/Independent texts collapsibles, Active/Archived across both, existing cards/rows. New text chooses Independent(default global)/folder(default current context), supports folder creation. Row/editor move menus. Copy destination same choices.
- AC-08: Stable /texts/{id}, /texts/new editor URLs; old folder paths redirect. Sidebar visible beside desktop editor with real existing editor/tutor controls, mobile adaptive. All navigation including palette/browser traversal respects unsaved work.
- AC-09: Real browser, deterministic E2E, focused tests/contracts/DB fresh+upgrade/concurrency/jobs/security verified. User-flows and ADRs current. Independent correctness/security review and concurrency tester complete, final records current.

## Fidelity inventory

| ID    | Source requirements                                                                                                                                              | Owner / evidence                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| UI-01 | Sidebar240/rail64, brand56, Home/Library group, source icons/spacing/surfaces                                                                                    | app-shell / rendered wide+rail                         |
| UI-02 | Search trigger with Mod+K and square Create; global palette keyboard/results/actions/footer                                                                      | app-shell / component+browser                          |
| UI-03 | Dictionary/Text/Knowledge title link, independent create/disclosure controls, hover/focus create, five resource rows+View all, active marker/language/folder/pin | app-shell / populated+empty/current                    |
| UI-04 | Rail resource flyout288px with title/create/filter/recent/list/retry                                                                                             | app-shell / pointer+keyboard browser                   |
| UI-05 | Account avatar/identity/chevrons, Profile/Settings/AI, language/theme/signout; rail popup right                                                                  | existing real account/preferences                      |
| UI-06 | Mobile56px header logo/menu/search,320px drawer,44px touch rows, modal dismissal/focus/scroll                                                                    | app-shell / narrow/tablet                              |
| UI-07 | Persistence/reduced motion/dark+light/localization/loading/error/empty                                                                                           | shared tokens+real query states                        |
| UI-08 | Source demo pages/mock data/planned sections/alternative rail browser                                                                                            | excluded scaffolding; existing real pages retained     |
| UI-09 | Text independent/folder selection,moving,library blocks,pin actions                                                                                              | user-authorized source extensions, existing primitives |
