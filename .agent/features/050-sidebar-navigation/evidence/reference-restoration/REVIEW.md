# Original sidebar reference restoration review

Date: 2026-10-21. Scope: read-only original hosted reference comparison; no application edits.

The original feature050 reference is accessible at the pinned artifact render origin in [capture-manifest.json](capture-manifest.json). Its actual rendered expanded sidebar, collapsed rail, dictionary flyout, account preferences and command palette were inspected and captured. This is the earlier sidebar design, not the portrait prototype shell. Captures contain only the supplied prototype fake account and content.

Comparison used retained v001 source, FEATURE.md UI-01–09, and existing actual application captures in `../browser-userfix10/` (expanded light/dark, rail flyout, mobile/tablet drawer, owned search and unified Create). Root independently verifies the restored runtime against that exact previously saved implementation. The source's initial settled desktop geometry was 1440×900 CSS pixels with sidebar239.996px expanded and63.990px collapsed, matching the 240px/64px contract.

| Inventory | Observed reference and comparison outcome |
| --- | --- |
| UI-01 | Expanded/rail, brand header, Home/Library grouping and bordered surface match the saved implementation structure and geometry. Real application brand and accessible token colors are retained. Prototype dark labels have weak contrast; production does not inherit that defect. |
| UI-02 | Search with shortcut, square Create and palette with Recent/Actions/keyboard footer observed. Production supplies authenticated real search/actions rather than fake results. |
| UI-03 | Dictionary/Text/Knowledge headings, separate create/disclosure, language metadata, active Knowledge row, pinned marker and View all observed. Five shortcuts and real pin menus are already approved extensions to the original four expanded prototype examples. Resource counts/titles naturally differ. |
| UI-04 | Collapsed Dictionary flyout has title/Create/filter/Recent/resources/View all. Retained production flyout follows this composition with its existing real loading/error states. |
| UI-05 | Account avatar/identity, Profile/Settings/AI provider, theme, interface language and logout observed. Production preserves established account/session behavior and readable tokens. |
| UI-06 | Original mobile header and navigation action appeared in accessible tree after emulation; source screenshot/DOM geometry became inconsistent. No matched mobile pixel claim. Existing local320/390/tablet evidence and current root responsive checks remain the implementation proof. |
| UI-07 | Original light/dark styles and preference controls observed. Production accessibility/localization/loading/error/persistence are covered by prior focused evidence; this representative reference review does not claim every state combination. |
| UI-08 | Fake Knowledge document/editor/chat bodies remain excluded scaffolding. No portrait prototype sidebar is imported. |
| UI-09 | Independent texts/folder organization and pin extensions are prior user-approved product behavior, not inferred from the source mock bodies. Existing feature050 evidence remains authoritative for them. |

GAP-01 (no actual hosted reference rendering available) is closed for representative desktop structural fidelity. It is not a full screenshot pixel-equivalence claim. After initial matching geometry, the host compositor sometimes scaled or retained different layers: palette is visibly scaled, and the attempted responsive capture shows a desktop rail despite a transient mobile tree. The failed responsive attempt is named explicitly in the manifest. These limits are bounded and do not indicate a new application regression; exact restored source identity plus the real local responsive checks establish restoration. No material unapproved sidebar redesign or omitted in-scope control was found.
