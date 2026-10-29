---
feature: interactive-workbooks
title: Interactive workbooks
status: draft
last_verified: 2026-10-28
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/059-interactive-workbooks/**
    - apps/web/src/app/workbooks/**
    - apps/web/src/app/shared/workbooks/**
    - apps/web/src/fsd/features/workbooks/**
    - apps/web/src/fsd/features/workbook-learning/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/entities/learning-blocks/**
    - apps/web/src/fsd/entities/knowledge/api/knowledge-media-api.ts
    - apps/web/src/fsd/widgets/knowledge-speech/**
    - apps/web/src/fsd/widgets/knowledge-transcription/**
    - apps/web/src/fsd/widgets/knowledge-private-translation/**
    - apps/web/src/fsd/widgets/knowledge-vocabulary/**
    - apps/web/src/fsd/pages/workbooks/**
    - apps/web/src/fsd/pages/knowledge/**
    - apps/backend/src/modules/knowledge/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/src/modules/speech/infrastructure/knowledge-*.ts
    - apps/backend/src/modules/speech/infrastructure/knowledge-*.sql
    - apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-claim.ts
    - apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-support.ts
    - apps/backend/drizzle/**
    - packages/contracts/src/contextual-assistant.ts
    - packages/contracts/src/knowledge*.ts
    - packages/contracts/src/learning-blocks.ts
    - packages/contracts/src/workbook-learning.ts
    - packages/contracts/src/workbooks.ts
    - packages/contracts/src/learning/sentences.ts
    - packages/contracts/src/speech/**
    - apps/backend/tests/support/contextual-assistant-fixture.ts
    - scripts/critical-flows/registry.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/interactive-workbooks.journeys.spec.ts
e2e_scenarios:
    - author-blocks-publish-practice
    - workbook-share-private-copy-revoke
related_features:
    - knowledge-workspace
    - contextual-language-assistant-and-knowledge
---

# Interactive workbooks

## What this verifies

Authors compose reusable learning blocks in Knowledge notes, explicitly publish
saved content, and arrange notes into private ordered workbooks. Learners read
shared saved material and keep their answers and completion private. Copies are
independent. Workbook links are revocable and do not expose working drafts.

The two initial mapped journeys passed in a real browser on 2026-10-28. This
guide remains draft while the rest of the feature is implemented. The journeys cover
manual grammar, vocabulary, free-text exercises, uploaded audio, private practice,
ordering, sharing, copying, revocation and hostile text rendering. AI generation,
private translations, speech generation/transcription and library/practice launch
journeys need additional evidence before feature completion. Course generation,
group-wide AI context, grading and teacher visibility are explicitly deferred.

## Start the development environment

Use Node 24, pnpm, Docker and the installed project Playwright Chromium browser.
The existing critical runner owns disposable PostgreSQL and Redis containers,
checks free ports, builds shared packages, migrates the database and starts the
real backend and Next.js application. Its assistant profile uses loopback
PostgreSQL 55488, Redis 56488 database 1, backend 4006 and web 3336, with database
`languon_auth_assistant_web_test`. No paid providers are invoked. Only the external
model boundary is deterministic; authentication, storage and HTTP are real.

Run the registered focused journey from the repository root:

```sh
pnpm test:e2e:critical -- --flow interactive-workbooks
```

The runner owns cleanup; do not attach these tests to an existing development or
shared database. For ordinary manual development use the root README setup and
synthetic accounts. API health must succeed before browser interaction.

## Browser verification

1. Sign up with a synthetic account and create a Knowledge note. Add grammar,
   vocabulary and an exercise through the **Add block** menu below the document.
   An empty note keeps audio prerequisites and unavailable copying out of the
   writing area. Library insertion stays a compact secondary action. Existing
   block editing/reordering is available under **Manage blocks**; relevant audio
   preparation is under the collapsed **Audio tools** section. A pending
   request, confirmation or generated preview remains reachable if its last
   eligible source block is removed; changing a draft does not cancel or
   discard the operation. Supply the exercise question,
   reference answer and short explanation. Upload a synthetic WAV audio file.
2. Select **Save**, reload, and open **Practice saved note**. The published blocks
   and playable uploaded audio persist. Save an answer, reveal its explanation
   and mark the note complete. Signed-in hint, transcript, answer-reveal and
   retry actions wait until private progress loads, so an early interaction
   cannot appear successful without being recorded. Anonymous prepared reading
   remains available. Reload preserves private progress. A saved
   free-text attempt is explicitly unevaluated; saving never pretends AI checked it.
   In the vocabulary block, choose **Train → Cards**, start a round and mark
   the entry Known. This practices the saved block directly; saving a dictionary
   is optional and independent. The signed-in learner’s rating persists privately.
   Choose **Train → Sentence practice** for a prepared bilingual example. Reveal
   its reference answer for free; the manual review is saved only for that learner.
   Edit the bilingual reading block: choose **Prepared translation → Add translation**
   to add another prepared language, then select existing languages to edit them.
   Applying preserves other prepared translations and their order.
   On the authored bilingual reading block, switch from **Original** to
   **Bilingual** and see the prepared translation without changing its source.
   Use **Save to Texts**, preview the prepared aligned text, and explicitly save
   an independent Text copy. This action does not call AI or mutate the block.
3. Open **Workbooks**, create a workbook and add a saved note. Share it, then add
   another note: explicit acknowledgement explains that workbook readers gain
   access. Move notes and verify the reader starts with the first saved note and
   can use previous/next navigation.
4. Open the link in a fresh anonymous browser. Reading works; saved practice and
   copying require sign-in. Sign in as a different synthetic learner, answer an
   exercise and mark the note complete. The workbook shows one completed note;
   the author’s own count stays zero and does not expose the reader’s attempt.
   On a bilingual block, anonymous readers see no private-translation control.
   A signed-in reader requests a different target language, explicitly confirms
   any reduced allowance, and sees only that actor's private overlay. A second
   signed-in reader and the author continue to see the unchanged prepared shared
   translation. The deterministic fixture replaces only external Texts-provider
   HTTP; shared-note authorization, jobs, settlement and overlays are real.
5. Copy the workbook. Revoke the original link as its owner. The original shared
   view becomes unavailable while the independent ordered copy still opens.
6. On a saved video exercise, keep the transcript hidden, reveal **Hint** and use
   **Replay passage**. Only the selected passage appears; replay opens its safe
   timestamped YouTube embed. Independently reveal the source video's transcript
   and replay its timed passage. Hint use is recorded privately without creating
   an answer attempt. A bilingual reading exercise similarly reveals only its
   selected original passage, with no media replay action. The deterministic
   browser fixture replaces only the remote
   video hosting response, and makes no claim of automatic video understanding.
   Direct video uses the browser player; after playback failure, **Open video
   source** offers the validated HTTPS link in a separate tab.
7. Display literal hostile HTML in a grammar rule. It remains text and creates
   no executable element. Inspect desktop and narrow practice layouts, labels,
   console errors and unexpected server failures.

## API verification

1. With the owner bearer token, inspect `GET /knowledge/workbooks/:id`: note IDs
   follow the explicitly saved order. Membership updates use `expectedVersion`.
2. Inspect `GET /knowledge/workbooks/:id/progress` and
   `GET /knowledge/:noteId/learning` separately as each signed-in actor. The
   workbook aggregate includes only current saved members and that actor’s
   explicit completions, with changed completed notes counted separately.
   Attempts, reveal events and completion belong only to that actor. Shared
   requests supply the share kind, locator and key in headers; never put a key
   in a media URL or logs.
3. Revoke sharing and repeat the shared read. It fails closed. Independent copies
   continue to resolve. Media reads require live note access and expose only
   media in the saved version to a shared reader.

## E2E coverage

- `author-blocks-publish-practice`: real UI authoring, upload, explicit publication,
  reload, bilingual original/translation rendering, explicit independent Text-library
  preview/commit, standalone practice, answer/reveal/completion persistence, direct vocabulary
  flashcard and prepared-example sentence practice without library publication, usable audio,
  selected bilingual-text hints, timestamped YouTube exercise hints and source-transcript replay, desktop and mobile screenshots, and console/server error assertions.
- `workbook-share-private-copy-revoke`: ordered membership and shared-add consent,
  anonymous saved reading, private attempts, paid actor-private translation and
  completed-note counts, independent full copy, live revocation and inert hostile
  text through the actual browser/backend/database boundary.

Contract and repository tests retain exhaustive schema limits, exercise revision
semantics, ownership, idempotency, concurrency, media grants, source cleanup and
copy identity rules. These matrices are not duplicated in the browser.

## Expected failure and edge cases

Stale versions reject changes rather than overwrite newer material. A revoked
share cannot read source-dependent history or submit new attempts. Free-text
answers stay unchecked until actual evaluation; prepared answer reveals are free.
Unsupported embeds and unsafe URL schemes are rejected. Uploaded audio must meet
type and size restrictions. Share secrets are capability headers. Retrying a
failed save reuses its operation identity; retrying practice creates a new attempt.
Deleting a workbook dissolves its grouping and preserves notes by default.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check interactive-workbooks
pnpm docs:user-flows:check
pnpm test:e2e:critical -- --flow interactive-workbooks
```

Traceability checks prove mapping, not runtime success. The full critical gate
remains required for the feature's AI/accounting changes; this focused stage is
not a substitute.

## Troubleshooting

Occupied ports fail before infrastructure startup. Stop only task-owned processes
or select the established reviewed profile; never point a reset at a shared DB.
If browser startup fails, inspect the retained runner log and backend health.
If upload playback fails, inspect authorized media response status and MIME type.
If practice disappears, check current share access and the saved source version.

## Cleanup

The critical runner removes its own disposable containers and stops its app
processes in cleanup. Reports and screenshots remain in ignored test output for
inspection. Do not delete unrelated containers or reset ordinary development data.
