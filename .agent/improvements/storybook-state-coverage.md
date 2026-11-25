# Storybook state coverage

Status: Complete

Improve the existing web Storybook with deterministic stories for the UI kit,
texts, dictionaries, knowledge blocks, and contextual assistant. No production
route, dependency, data, or behavior changes. Use the existing UI patterns.

1. Inventory the catalog and update existing controls and stale viewport presets.
2. Add colocated fixtures using real components and fake data for representative
   normal, pending, empty, error, read-only, and interactive states.
3. Add a checkable story maintenance rule to the web instructions.
4. Build the catalog, run web typecheck and scoped lint and styling checks,
   and exercise representative states in Chromium at wide and phone widths.
   Estimate: 2–5 minutes for static checks and build, 5–10 for browser checks.

Existing user-flow commands and product behavior are unchanged. Browser evidence
uses the local catalog and requires no backend or account. Roll back by reverting
the story, catalog, and instruction changes together.

## Evidence

- Existing catalog grew from 78 to 86 colocated story files. The final static
  build indexed 291 states. Existing English-only single-provider wrappers
  now use the shared English/Russian toolbar provider. Stories with explicit
  locale fixtures retain their own provider. Replaced the obsolete mobile
  preset with the shared 375×812 viewport. System theme uses the app's
  existing system token selector.
- Added folder and text rows, dictionary sharing, exercise set, panel page
  host, chat transcript, activity, and error stories. Added a copied state
  to the existing text-sharing story. The web instructions now require
  story updates for changed UI and a documented reason when isolation is
  impossible.
- Pinned agent-browser Chromium at 1280×900 and 375×812. Observed draft and
  read-only text rows, empty and archived folders, copied link, dictionary
  sharing and pending, exercise expansion, narrow input, and chat empty,
  queued, completed, streaming, and disabled retry. Created a fake dictionary
  sharing link and verified that reviewing a draft preserved edited text
  when returning. Fixed an App Router context error in the folder story
  and reran it. The final clean session reported no console errors or
  warnings. The only failed request displayed was the catalog favicon 404.
  These checks use story fixtures and do not exercise a live AI service.
- Phone screenshots: [exercise set](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795630280564.png)
  and [Russian dark-mode sharing](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795630282253.png).
- Storybook build, web TypeScript, scoped ESLint and Prettier,
  styling contract and diff check passed. The Storybook build reported
  Vite's large-chunk advisory. Author preflight verified the changes are
  confined to stories, preview configuration and the web instruction.
  No independent review required for this fixture-only scope.
