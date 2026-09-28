# Authenticated app shell and navigation sidebar

Created: 2026-09-28
Updated: 2026-09-28
Status: Ready for Magic Patterns
Source revision: `b636752` (clean working tree before this documentation change)

This brief defines a reusable authenticated application shell around the existing
dictionary library, dictionary workspace, and profile pages. It does not request
runtime implementation. Track generated-design provenance and selection in the
[versioned design handoff](./authenticated-app-shell-sidebar/DESIGN.md).

## Copyable Magic Patterns prompt

Copy only the following block into Magic Patterns.

```text
Design a responsive authenticated application shell and navigation sidebar for Languon.

PROJECT DESCRIPTION

Languon is an adult-focused language-learning application. Its current main product area is a personal vocabulary dictionary system where learners create dictionaries for language pairs, add cards manually or with AI assistance, generate pronunciation audio, search cards, and manage active or archived content.

Future versions will add comparable top-level areas such as Courses, but Courses should not appear in this design yet. The navigation structure must be reusable so sections such as Courses can later use the same expandable pattern.

The experience should feel calm, modern, warm, editorial, and quietly intelligent. It should be suitable for serious adult learners without looking childish, game-heavy, corporate, or like a generic AI dashboard.

GOAL

Replace the current dictionary-specific navigation with a reusable authenticated-app sidebar that works across:

- Dictionaries library
- Individual dictionary pages
- Profile and account settings
- Future authenticated product areas

Do not place this shell on the public landing page, sign-in, sign-up, email verification, password recovery, or other focused authentication pages.

The sidebar must provide:

- Navigation to the Dictionaries page
- A collapsible Dictionaries section
- A scrollable list of all active dictionaries
- Navigation directly to an individual dictionary
- A way to create a dictionary from the sidebar
- A collapsible desktop icon-rail mode
- A pinned account area containing Profile, interface language, theme, and Sign out
- A responsive mobile drawer opened from a compact top bar

DESKTOP APP SHELL

Create two desktop sidebar states:

1. Expanded sidebar: 240 px wide
2. Collapsed icon rail: approximately 68–72 px wide

The shell is fixed to the left and occupies the full viewport height. Page content fills the remaining width and retains the existing page hierarchy.

Expanded sidebar structure:

1. Brand area
   - Languon logo mark and wordmark
   - A control to collapse the sidebar into its icon rail
   - Use a recognizable panel-collapse icon
   - Keep this area approximately 64 px high

2. Main navigation
   - Use a semantic navigation region
   - The primary section is Dictionaries
   - Do not show Courses yet
   - Make the section pattern reusable for future sections

3. Dictionaries disclosure group
   - Book or dictionary icon
   - “Dictionaries” label
   - Chevron showing expanded or collapsed state
   - Separate compact “Create dictionary” plus button
   - The disclosure control expands or collapses the section without navigating
   - The plus button opens the existing Create dictionary dialog
   - Do not overload one control with disclosure, navigation, and creation

4. Expanded Dictionaries content
   - “All dictionaries” link leading to `/dictionaries`
   - A vertically scrollable list of all active dictionaries
   - Archived dictionaries are not shown here; users reach them through the Dictionaries page
   - Each dictionary row links to `/dictionaries/{dictionaryId}`
   - Show the dictionary name as the primary text
   - Optionally show its language pair as small secondary text, for example “English → Spanish”
   - Use ellipsis for long names and provide the complete name through an accessible tooltip or title
   - Keep rows compact enough for scanning but at least 40–44 px high
   - Highlight the current dictionary
   - When `/dictionaries` is active, highlight “All dictionaries”
   - If the group is collapsed while one of its children is active, give the Dictionaries group header a subtle active state

5. Account area pinned to the bottom
   - Avatar or initials
   - User handle such as “@learner”
   - Optional muted email or “Learner” role
   - Chevron indicating an account menu
   - This area must remain reachable when the dictionary list is long

ACCOUNT MENU

Tapping the account row opens a compact menu anchored above the footer. In icon-rail mode, open it to the right of the rail.

Include:

- Profile link leading to `/profile`
- Interface language selector
  - English
  - Русский
  - Français
  - Español
- Theme selector
  - System
  - Light
  - Dark
- Divider
- Sign out action with a logout icon

Use a compact select, submenu, or segmented control where appropriate. Keep the current selection visible. Sign out should be clear but does not need an alarming destructive-red treatment. Show a pending/disabled state while sign out is processing.

COLLAPSED DESKTOP RAIL

When the user collapses the sidebar:

- Show only the logo mark, navigation icons, create icon, and user avatar
- Hide the dictionary names and nested list
- The Dictionaries icon navigates to the Dictionaries page
- Keep a dedicated Create dictionary icon
- Show accessible tooltips for every icon-only action
- Keep a clear active indicator
- The account avatar opens the full account menu to the right
- Include a visible control for restoring the expanded sidebar
- Preserve the expanded/collapsed preference while navigating between authenticated pages

MOBILE AND NARROW TABLET

At widths below approximately 1024 px, replace the sidebar with:

1. Compact sticky top bar
   - Menu button
   - Languon logo
   - Current page title or current dictionary name
   - Approximately 64 px high

2. Slide-over navigation drawer
   - Opened by the menu button
   - Approximately 288–320 px wide, never wider than the viewport minus a small margin
   - Uses a modal scrim
   - Contains the same brand, Dictionaries disclosure, active dictionary list, Create dictionary action, and account menu
   - Closes after navigating
   - Closes on Escape and outside click
   - Traps focus while open and restores focus to the menu button after closing
   - Prevents background scrolling
   - At short viewport heights, the navigation content may scroll, but the account area must remain reachable

Do not use a permanent mobile icon rail or bottom navigation. The nested dictionary list and account controls belong in the drawer.

DICTIONARY SECTION STATES

Design the following states:

- Expanded with several active dictionaries
- Collapsed disclosure group
- Current dictionary selected
- Long dictionary name
- Many dictionaries in a bounded scroll area
- Empty state:
  - “No dictionaries yet”
  - Compact “Create dictionary” action
- Loading state using quiet skeleton rows
- Recoverable load failure with a small Retry action
- Create action pending/disabled
- Sidebar icon-rail state

Default behavior:

- On dictionary routes, the Dictionaries group starts expanded
- On Profile, it may start collapsed
- Once the user changes the disclosure state, preserve it during the session

REPRESENTATIVE CONTENT

Use realistic example dictionaries:

- French A2 Vocabulary — English → French
- Spanish for Travel — English → Spanish
- German Everyday Words — English → German
- English Phrasal Verbs — Russian → English
- A deliberately long dictionary name to demonstrate truncation

Use “@learner” as the example user.

SHOW THE SIDEBAR AROUND EXISTING PRODUCT PAGES

Do not redesign the page bodies. Demonstrate that the shell works with these representative existing layouts:

1. Dictionaries library
   - “My dictionaries” heading
   - “New dictionary” primary button
   - Active and Archived filters
   - Search field
   - Dictionary cards or rows

2. Individual dictionary
   - Breadcrumb back to Dictionaries
   - Dictionary name
   - Language pair
   - Active card count
   - Settings and additional-actions controls
   - Search and active/archived card filters
   - Vocabulary card list
   - Add card action

3. Profile
   - “Account settings” heading
   - Profile, Security, Billing, and Credits navigation
   - Account details and preference content

The sidebar must feel like stable application chrome while the page body changes.

VISUAL DIRECTION

Follow the existing Languon runtime visual language:

- Font: Inter Variable, with system sans-serif fallback
- Light canvas: #F8F9FB
- Light surface: #FFFFFF
- Subtle surface: #F1F3F6
- Primary text: #1B1E24
- Secondary text: #5B6472
- Default border: #E4E7EC
- Strong border: #D0D5DD
- Primary indigo: #4F46E5
- Primary subtle background: #EEF2FF
- Dark canvas: #121417
- Dark surface: #1B1E24
- Dark elevated surface: #23262D
- Dark primary accent: #818CF8

Use:

- 8–12 px radii for navigation items and controls
- 16 px section padding
- 8–12 px gaps
- 40–44 px minimum control height
- Restrained borders and subtle surfaces
- Lucide-style line icons
- Short 120–200 ms transitions
- Clear focus rings
- Subtle active indicators using background, text weight, and a narrow side marker

Avoid:

- Heavy gradients
- Excessive glass effects
- Oversized rounded pills
- Dense dashboard styling
- Decorative AI sparkles
- Childlike gamification
- Excessive shadows
- Low-contrast gray text
- Making every item look like a separate card

ACCESSIBILITY AND LOCALIZATION

- Meet WCAG 2.2 AA contrast expectations
- Use semantic navigation and disclosure controls
- Give disclosure buttons `aria-expanded` and `aria-controls`
- Give all icon-only actions accessible names and tooltips
- Maintain visible keyboard focus
- Support full keyboard operation
- Use at least 44 px touch targets on mobile
- Do not rely on color alone for active state
- Support long translated labels in English, Russian, French, and Spanish
- Support long user-generated dictionary names
- Use logical alignment and spacing so future right-to-left localization remains possible
- Avoid horizontal overflow at 320 px and at 200% text zoom
- Respect reduced-motion preferences

PROTOTYPE INTERACTIONS

Make these interactions functional in the prototype:

- Expand and collapse the Dictionaries section
- Collapse and restore the desktop sidebar
- Open and close the mobile drawer
- Select “All dictionaries”
- Select an individual dictionary
- Open the Create dictionary dialog from the sidebar
- Open and close the account menu
- Change language
- Change theme between System, Light, and Dark
- Navigate to Profile
- Trigger the Sign out pending state

DELIVERABLE

Create a polished, responsive, reusable authenticated app-shell prototype rather than an isolated sidebar image.

Include these review states:

1. Desktop, expanded sidebar, Dictionaries library active
2. Desktop, expanded sidebar, individual dictionary active
3. Desktop, collapsed icon rail
4. Desktop, account menu open
5. Mobile, drawer closed
6. Mobile, drawer open with Dictionaries expanded
7. Dark-theme desktop state
8. Loading, empty, and recoverable-error variants for the dictionary list

Keep the implementation structure reusable so a future Courses section can use the same disclosure-group and nested-item patterns without redesigning the shell.
```

## Source notes

- The requested artifact is a design prototype, not runtime implementation.
- Existing product contracts and accepted ADRs remain authoritative when a
  generated design is later selected for implementation.
- The generated design URL and preserved design identity are intentionally
  pending in the linked handoff.
