---
feature: interactive-workbooks
title: Interactive workbooks
status: draft
last_verified: 2026-10-30
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
    - apps/backend/tests/support/knowledge-private-translation-fixture.ts
    - apps/backend/src/modules/texts/application/texts-worker-service.ts
    - apps/backend/src/modules/texts/infrastructure/ai/texts-ai-provider.ts
    - scripts/critical-flows/registry.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/interactive-workbooks.journeys.spec.ts
e2e_scenarios:
    - author-blocks-publish-practice
    - workbook-share-private-copy-revoke
    - block-review-atomic-edit-inline-feedback
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
guide remains draft while the rest of the feature is implemented. The v16 migration
updates the three mapped scenarios below; their current revision still requires
execution before updating `last_verified`. The journeys cover
manual grammar, vocabulary, free-text exercises, uploaded audio, private practice,
ordering, sharing, copying, revocation and hostile text rendering. The retained historical results are not proof of the new side-editor, atomic AI,
inline evaluation or proposal-update behavior. Speech generation/transcription and
remaining feature-wide journeys still need final evidence before completion. Course generation,
group-wide AI context, grading and teacher visibility are explicitly deferred.

## Start the development environment

Use Node 24, pnpm, Docker and the installed project Playwright Chromium browser.
The existing critical runner owns disposable PostgreSQL and Redis containers,
checks free ports, builds shared packages, migrates the database and starts the
real backend and Next.js application. Its assistant profile uses loopback
PostgreSQL 55488, Redis 56488 database 1, backend 4006 and web 3336, with database
`languon_auth_assistant_web_test`. No paid providers are invoked. Only the external
model boundary is deterministic; authentication, storage and HTTP are real.
The paid vocabulary-generation scenario explicitly configures its synthetic
author’s existing per-action preference to 100 credits; its wallet is seeded
by the guarded fixture. This does not change application defaults.

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
   A chat-generated vocabulary proposal appears beside its originating tutor reply
   as one compact bordered preview with a type/count header and action footer,
   without nested oversized cards. **Review** opens the full prepared material
   in a right-side panel on desktop or bottom sheet on mobile. It completes its
   follow-up response and changes the draft only after
   **Apply to working draft**. Its acknowledgement is not offered as a separate
   plain-text document edit.
   An empty note keeps audio prerequisites and unavailable copying out of the
   writing area. Library insertion stays a compact secondary action. Existing
   blocks have a drag handle for whole-block selection/reordering and a heading-right
   **Block settings** menu for Edit, Copy, Duplicate, Move up/down and Delete.
   Drag handles sit in the left gutter, outside custom content. Hover an ordinary
   paragraph, heading, list, quotation or table to reveal its handle. Drag it as
   a whole block; lists and tables preserve their nested contents. Enter/Space
   selects that block and Alt+Up/Down moves it with the keyboard.
   Focus prose and use Shift+Tab to reach its handle directly; Alt+Up/Down also
   works from the current prose selection without hovering. Read-only notes
   expose no author drag controls. A document edit during dragging cancels a stale
   ordinary-block drop rather than inserting older content.
   A **Write here…** line before a first custom block lets the author insert prose
   above it. It returns when the leading paragraph is removed and is not saved as
   synthetic content. Existing writable lines after logical blocks remain usable.
   Selecting a block does not show prose-selection actions; these appear only
   for selected text. The menu is keyboard accessible and usable on narrow screens.
   Reload preserves the dragged order after explicit Save. **Edit** opens the
   type-specific side dialog (440px desktop) or expandable mobile bottom sheet.
   Existing vocabulary/text editors keep language fields under a collapsed
   **Languages** settings disclosure; new blocks open that disclosure initially.
   Open it only when changing the language pair.
   Its local changes need **Apply changes** before entering the working draft;
   explicit document **Save** publishes them. Dirty dismissal offers Keep editing
   or Discard. Audio preparation is inside the relevant block editor. An audio
   shell may exist without a recording; it must not show a fake playable asset. A pending
   request, confirmation or generated preview remains reachable if its last
   eligible source block is removed; changing a draft does not cancel or
   discard the operation. Supply the exercise question,
   reference answer and short explanation. Upload a synthetic WAV audio file.
2. The topbar uses icon-only **Save** and **Practice saved note** controls with
   localized accessible names and tooltips. In **Document actions**, select
   **Learner preview** to read the current draft using the shared-note presentation.
   The title, prose and custom blocks are read-only; author editing/drag controls
   and the formatting toolbar are hidden. Prepared exercises can be expanded,
   answered and revealed locally without writing practice history or requesting
   AI feedback. Shared links still show only the last saved version. The checked
   menu option toggles back, and **Back to editing** restores the mounted editor
   with its unsaved content and history intact. Verify this on desktop and mobile.
   Save retains its disabled/loading
   states and explanatory tooltip. Select **Save**, reload, and open
   **Practice saved note**. The published blocks
   and playable uploaded audio persist. With transcription deliberately unavailable,
   **Prepare transcription** shows an honest provider/pricing/credit-configuration
   warning. Manual speech source and transcript fields remain usable without
   applying or publishing them; this fixture invokes no transcription provider.
   Exercise sets and individual tasks are
   folded initially; expanding reveals answer controls inline. Multiple-choice
   and blank **Check** uses the prepared answer without an AI call; every type
   also offers explicit **Check with AI**. Free text is saved before evaluation
   and is not marked correct merely because it was saved. Feedback, Hint and
   Show answer results stay below that question. Reveal its explanation and mark
   the note complete. Signed-in hint, transcript, answer-reveal and
   retry actions wait until private progress loads, so an early interaction
   cannot appear successful without being recorded. Anonymous prepared reading
   remains available. Reload preserves private progress. A saved
   free-text attempt remains unevaluated until a real completed AI result; valid
   alternative wording can be recognized without changing the author material.
   In the vocabulary block, open its heading settings menu and choose **Cards**, start a round and mark
   the entry Known. This practices the saved block directly; saving a dictionary
   is optional and independent. The signed-in learner’s rating persists privately.
   Choose **Sentence practice** in that same menu for a prepared bilingual example. Reveal
   its reference answer for free; the manual review is saved only for that learner.
   Edit the bilingual reading block: choose **Prepared translation → Add translation**
   to add another prepared language, then select existing languages to edit them.
   Applying preserves other prepared translations and their order.
   On the authored bilingual reading block, switch between **Original** and
   **Bilingual** and see the prepared translation without changing its source.
   Use **Save to Texts** in the heading settings menu, preview the prepared aligned text, and explicitly save
   an independent Text copy. This action does not call AI or mutate the block.
3. Open **Workbooks**, create a workbook and add a saved note. Share it, then add
   another note: explicit acknowledgement explains that workbook readers gain
   access. Move notes and verify the reader starts with the first saved note and
   can use previous/next navigation.
4. Open the link in a fresh anonymous browser. Reading works; saved practice and
   copying require sign-in. Sign in as a different synthetic learner, answer an
   exercise inline, optionally request AI feedback from that reader’s credits,
   and mark the note complete. The workbook shows one completed note;
   the author’s own count stays zero and does not expose the reader’s attempt.
   On a bilingual block, anonymous readers see no private-translation control.
   A signed-in reader selects a private target in the inline translation-language
   picker and requests its translation, explicitly confirms
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
7. Open a vocabulary block editor and check one translation with AI. Pending,
   Looks correct, suggested replacement, stale and retry states belong to that
   field. Review the current/proposed text; **Accept** changes only that field in
   the editor draft. Other entries stay intact. The source note is unchanged until
   Apply block and explicit Save. In a bilingual-text editor, generate a missing
   translation for one segment without overwriting its original wording or other
   languages. Discarding accepted local suggestions leaves the document unchanged.
8. Ask the tutor to update an existing vocabulary block. The update proposal
   supports current-note references: type `/`, choose the note's custom blocks,
   or choose **Add block to chat** from a custom block's settings. Both entrypoints
   add removable reference chips to the same composer. Mention up to eight unique
   blocks; adding more reports the limit without silently dropping an earlier
   choice. Grammar, vocabulary, bilingual text, exercises, audio and video use
   their own type/title descriptors. The server resolves IDs from the authorized
   frozen source; chips do not grant access to another note or private draft.
   Ask for an explanation to receive ordinary chat, or request updates to several
   referenced blocks to receive individual review proposals. Each update requires
   explicit **Update block**, can be dismissed without modifying the draft (and
   reopened through **Show proposal**), or inserted with **Add at cursor** at
   the cursor as an independent copy. Other unchanged targets remain applicable
   after applying one proposal. Shared readers can explain referenced saved
   material but cannot update the author's note.
   Grammar rule/pattern and other explanatory narrative fields support safe
   Markdown paragraphs, emphasis, lists and tables in chat previews and the sheet.
   Source passages, examples, answers, translations and transcripts remain literal.
   HTML and executable links do not run. Existing plain-text content remains valid;
   formatting guidance applies to newly generated material without rewriting old
   saved content automatically.
   During initial workspace hydration the page stays loading; normal request
   cancellation during development remounts must not flash an unavailable error.
   Genuine failed or inaccessible workspaces still show the existing error state.
   The update proposal
   captures that block’s content. An unrelated title/prose edit does not invalidate
   it; a changed/deleted target or existing source passage does. **Show in sheet**
   reveals applied material; retrying Apply cannot duplicate it. A stale proposal
   can be regenerated or explicitly **Add separately**, with independently copied
   captured source blocks and remapped question references when needed. A proposal
   never publishes shared material until document Save.
9. Display literal hostile HTML in a grammar rule. It remains text and creates
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

- `author-blocks-publish-practice`: real chat-generated vocabulary preview/follow-up/explicit Apply and
  UI authoring, whole-block selection, drag reordering, inline settings
  and current-draft learner preview with desktop/mobile entry and return,
  local prepared-answer reveal and preserved editor content/identity,
  and keyboard dismissal, mobile menus, upload, explicit publication,
  reload, bilingual original/translation rendering, explicit independent Text-library
  preview/commit, standalone practice, answer/reveal/completion persistence, direct vocabulary
  flashcard and prepared-example sentence practice without library publication, usable audio,
  selected bilingual-text hints, timestamped YouTube exercise hints and source-transcript replay, desktop and mobile screenshots, and console/server error assertions.
- `block-review-atomic-edit-inline-feedback`: real field-level AI checking and
  translation generation through admitted Texts jobs, desktop side-dialog and
  mobile bottom-sheet editing, local Accept versus Apply versus publication, dirty
  discard, independent library saving from the working draft before publication,
  real tone-provider snippet playback and generated-audio preview/accept
  through authorized storage/import, tool-backed read/current-block update proposal
  and full review, prepared-audio proposal bytes and compact/full playback, stable
  update identities despite unrelated edits, grouped inline prepared checking and
  AI recognition of a private valid alternative, and rendered screenshots with
  console/server-error checks. Only external provider responses are deterministic.
- `workbook-share-private-copy-revoke`: ordered membership and shared-add consent,
  anonymous saved reading, private attempts, paid actor-private translation and
  completed-note counts, independent full copy, live revocation and inert hostile
  text through the actual browser/backend/database boundary.

Contract and repository tests retain exhaustive schema limits, exercise revision
semantics, ownership, idempotency, concurrency, media grants, source cleanup and
copy identity rules. These matrices are not duplicated in the browser.

## Expected failure and edge cases

Apply uses the current working-branch version. Unrelated edits do not invalidate
independent append proposals; target changes and changed captured dependencies do.
Stale replacement requests reject rather than overwrite newer material. A revoked
share cannot read source-dependent history or submit new attempts. Free-text
answers stay unchecked until actual evaluation; failed AI calls retain the answer
and offer retry or prepared content. Field suggestions never mutate a document
without explicit acceptance/application; prepared answer reveals are free.
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
