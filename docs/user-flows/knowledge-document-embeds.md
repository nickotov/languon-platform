---
feature: knowledge-document-embeds
title: Knowledge document previews
status: current
last_verified: 2026-11-26
surfaces:
    - browser
source_paths:
    - .agent/features/076-knowledge-document-embeds/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/entities/knowledge/**
    - apps/web/public/knowledge-website-preview.html
    - apps/web/next.config.mjs
    - packages/contracts/src/knowledge-interactive.ts
    - packages/contracts/src/contextual-assistant.ts
    - apps/backend/src/modules/knowledge/**
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/interactive-workbooks.journeys.spec.ts
e2e_scenarios:
    - publish-reopen-and-expand-embeds
related_features:
    - knowledge-workspace
    - interactive-workbooks
---

# Knowledge document previews

## What this verifies

An author inserts an HTTPS website or image in a Knowledge document, saves
it and opens the preview in the editor or reader. Loading a preview contacts
its host. A YouTube video uses the existing Video learning block.

## Start the development environment

Start the local development environment with `pnpm dev:infra` and `pnpm dev`
using the root README prerequisites. Sign in with a disposable learner account
and open Knowledge. For the steps below, use a public HTTPS page that permits
framing and a direct HTTPS image URL you control. The automated check supplies
both resources locally and uses a disposable PostgreSQL and Redis pair.

## Browser verification

1. Create a note and enter a title. Select **Add block → Basic blocks → Website**.
   Enter the website URL and choose **Insert**. Repeat with **Image** and a direct
   image URL. Each block shows its source and a **Load preview** button.
2. Load the website preview inside the document, then choose **Expand**. The
   dialog occupies about 90% of the viewport in each dimension. Press Escape
   and check that focus returns to **Expand**.
3. Load and expand the image on a narrow screen. Its proportions are preserved
   and the close control remains reachable.
4. Choose **Save**, reload the document and select **Document actions → Learner
   preview**. Both sources are available in the saved order. Check that the
   previews load and expand there too.
5. To insert a YouTube lesson, choose **Add block → Learning blocks → Video**
   and enter its link. Follow the existing video authoring and playback journey
   in [Interactive workbooks](./interactive-workbooks.md).

## E2E coverage

`publish-reopen-and-expand-embeds` inserts both links with the editor picker,
publishes the note, reloads it and activates each preview in learner view. It
checks that the fixture hosts receive no request before activation, the website
renders in its restricted frame, and the image loads with its original dimensions.
It measures the dialog on desktop and narrow viewports and checks keyboard
focus after dismissal. URL rules and malformed stored content use contract tests.

## Expected failure and edge cases

- Use a complete HTTPS URL without embedded credentials. Correct an invalid URL
  in the insertion dialog before submitting it.
- Some websites forbid framing or require scripts. Use **Open in new tab** on
  the block to visit the original page.
- An expired or inaccessible image URL cannot provide an image preview. Its
  source link remains available.

## Automated regression checks

Run `pnpm test:e2e:critical -- --flow knowledge-document-embeds` for this
journey. The runner starts its own guarded local services, signs up a synthetic
learner and substitutes only the two external resources. Run
`pnpm user-flow:e2e -- check knowledge-document-embeds` to check guide mapping.

## Troubleshooting

If a website is blank, open its source link to check availability and framing
support. For a missing image, confirm the source returns an image rather than an
HTML viewer page. If the automated runner reports a port conflict, inspect its
local port report before retrying.

## Cleanup

Close preview dialogs and return to Knowledge. Archive any disposable note you
created through the application. The automated runner removes its own local
database and cache containers after the journey.
