---
feature: knowledge-workspace
title: Knowledge workspace
status: current
last_verified: 2026-10-20
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/047-knowledge-workspace/**
    - .agent/features/049-knowledge-markdown-insertion/**
    - apps/backend/src/modules/knowledge/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/drizzle/**
    - apps/backend/src/config/environment.ts
    - apps/web/src/fsd/pages/knowledge/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/shared/ui/companion-layout/**
    - apps/web/src/fsd/entities/knowledge/**
    - apps/web/src/fsd/entities/conversation/**
    - packages/contracts/src/contextual-assistant.ts
    - packages/prompts/src/local/contextual-language-tutor.ts
    - scripts/run-contextual-assistant-e2e.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts
e2e_scenarios:
    - workspace-draft-chat-save-reopen
    - workspace-two-tab-conflict-recovery
    - workspace-restore-preserves-unsaved-branch
    - workspace-text-reference-limit
    - workspace-proposal-target-review
    - workspace-markdown-insertion
    - workspace-share-copy-revoke
    - workspace-mobile-tutor-sheet
related_features:
    - knowledge-markdown-insertion
    - persistent-tutor-modes
    - contextual-language-assistant-and-knowledge
---

# Knowledge workspace

## What this verifies

A learner can start research with an empty Knowledge draft, edit while chatting
with the existing language tutor, recover private working changes, and explicitly
Save a document. The tutor receives the complete current editor snapshot and
copied Text references within the configured limits. An unlisted reader sees
only the saved version and can make an independent copy after signing in.

The first version uses model knowledge and supplied learning material. It does
not fetch web pages or interpret linked media. Knowledge conversation history,
copied references and unpublished working branches remain private.

## Start the development environment

Use Node 24, pnpm, local PostgreSQL and Redis, and current migrations as
described in the root README. Set the optional sanitized
`KNOWLEDGE_REFERENCE_CHAR_LIMIT` and `KNOWLEDGE_EDITOR_CONTEXT_CHAR_LIMIT`
values; both default to 40000. Start the backend, worker and web app using the
README commands. Use only disposable test accounts and content.

The mapped deterministic suite uses the existing guarded contextual-assistant
runner. Its synthetic model boundary avoids paid calls while retaining the real
web, backend, PostgreSQL and Redis flows. Review its local-only guard and
startup/cleanup before execution. Its disposable targets are loopback PostgreSQL
port 55444, database `languon_auth_assistant_web_test`, and Redis port 56444,
database 1. The test runner requires all matching confirmation variables:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
ALLOW_DISPOSABLE_REDIS_TESTS=true \
AUTH_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test \
AUTH_TEST_REDIS_URL=redis://127.0.0.1:56444/1 \
AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1 \
pnpm test:e2e:contextual-assistant
```

## Browser verification

1. Sign in with a disposable account and select **New note** in Knowledge. An
   **Untitled** Draft opens with an empty rich editor and the language tutor on
   the right. The document's 48px topbar contains draft recovery status,
   **Save**, **Document actions** and **Focus / Split / Chat** layout controls.
   Its bottom border aligns with the tutor's 48px title row; the tutor context
   line sits separately below that row. The editable title lives in the open
   writing canvas and appears in the topbar only after scrolling out of view.
   **Properties** reveals inline language, category and summary chips; each
   opens its own editor popover. Optional fields remain available without
   taking space away from writing. **Response settings** in the tutor composer
   groups Mode, reply language, tone, explanation level, model and saved
   defaults. Its context hint confirms that each question includes the complete
   current editor snapshot. Empty documents offer **Start writing**,
   **AI outline**, **Lesson notes** and **Language notes** starters.
   Ask a question without writing in the editor. The first three words name
   the default note and chat. Start another chat; its history is separate and
   it does not rename the note.
   In desktop **Split**, drag the boundary beside the tutor between 340px and
   560px, preserving at least 480px for the document. Focus **Resize tutor
   panel** and use arrows for small adjustments, Shift with an arrow for
   larger steps, **Home** for minimum width or **End** for maximum. **Escape**
   cancels an active drag. At 1440px the default tutor width is 400px. **Focus**
   shows the document alone; **Chat** gives the conversation up to 60% while
   preserving the document's minimum width. Layout preference is remembered.
   Below 768px, **Document / Tutor** tabs switch the full working area while
   preserving editor and composer state. At tablet widths 768–1023px, or when
   the available app area cannot fit a 480px document and 340px tutor, the tutor
   uses a 380px overlay beside the document with no pane divider. **Chat**
   layout is unavailable there; a desktop Chat preference falls back to Split
   with an enabled keyboard-focusable layout control. Text/dictionary tutor placement
   remains independent of these document workspace layouts.
2. Type and format a document without selecting Save. Watch the recovery status
   change, then reopen the workspace in another tab. The unpublished wording
   is restored there. Make conflicting edits in both tabs; compare and retain
   either version, manually combine them, or save one as a separate note.
   Neither version disappears automatically.
3. Select text in the editor and select **Ask tutor** in the selection toolbar,
   then ask a question. The question focuses on that
   selection while the complete editor content is available to the tutor.
   Moving the cursor after **Ask tutor** preserves the selected proposal target;
   sending still includes the latest editor content. The focus passage is part
   of editor context and does not count again as a copied Text reference.
   Type `/`, select multiple owned Texts, and explicitly include a translation
   when desired. Previews show the copied content. Editing or deleting an
   original Text later does not change its copied message content. An addition
   above the configured aggregate reference limit is rejected whole with the
   limit toast. An editor above its separate tutor limit remains editable but
   cannot be sent to the tutor until shortened.
4. Request an editor proposal. A reply with a remembered selection offers
   **Show in text**, opening a compact proposal beneath that target with
   **Accept**, **Compare** and **Reject**. **Compare** opens the full review.
   Other replies offer **Use in document** to open that review above the
   document canvas. Choose **Insert at cursor**, **Append to end**
   or **Replace selection** and accept through the matching **Insert**, **Append**
   or **Replace** action. Move the cursor and edit surrounding content
   during generation: the original target stays identified. If target wording
   changed, compare or select a new target before replacing it. Accepting a
   proposal changes the working draft as one undoable edit and does not publish.
   Markdown replies appear as formatted editable document content in preview and
   on acceptance: paragraphs, bold/italic/strike, inline code, safe links, lists,
   quotes and tables. Headings map H1 to H2 and H4–H6 to H3 with a notice; H2/H3
   remain unchanged. Explicit table alignment and link tooltips normalize to the
   document defaults with a notice. Code blocks, images, task lists, horizontal
   rules, embedded HTML, unsafe links or malformed tables block formatted
   insertion without changing the draft. Select **Insert as plain text** to
   explicitly retain the original source. Oversized input or a result exceeding
   document limits stays unaccepted and requires shortening. A single formatted
   phrase fits inline; surrounding learner text remains intact.
5. Enter a title and body and select **Save**. The same note ID now has a saved
   version; the Knowledge library no longer marks it Draft. Edit again and
   open **Document actions** and select **Save a copy**. **Share**, **Revision history** and
   **Delete note** are in the same menu. The copied note has its own ID and no conversation
   history; the original remains untouched.
6. Open **Document actions** → **Share**, select **Enable sharing**, copy the unlisted link, and open it
   as a signed-out reader.
   The reader sees the last saved version only. Sign in as a second disposable
   learner and copy the shared note. The recipient can edit and chat in the
   independent copy. Open **Shared**, select **Disable sharing** and confirm
   **Disable link** from the owner workspace: the original
   link fails immediately, while the recipient copy remains available. Enable
   sharing again and confirm the previous link stays invalid.

## API verification

1. Under owner authentication, create a Knowledge draft and read its workspace.
   Verify the stable note ID, status `draft`, empty working content, private
   branch and limits. A second account cannot read or edit that workspace.
2. Update the working branch with its expected version. Repeat from a stale
   version and verify the server returns a separate conflict branch while
   retaining both contents. Explicit Save with a nonempty title/body creates a
   published revision; empty body is rejected.
3. Issue a share locator/key, then read the shared note using the key header.
   Verify the response omits working branches and conversations. Copy it while
   authenticated as a different learner. Revoke the link and verify read/copy
   both fail, including after a new link is issued.
4. Submit a tutor turn with current `editorContext` and copied Text bodies. A
   request above either configured character limit fails before generation;
   exactly the limit is admitted if the complete model budget fits. Previous
   turn snapshots and copied references remain unchanged after later edits.

## E2E coverage

- `workspace-draft-chat-save-reopen` proves empty draft chat, working recovery,
  explicit publication and reopening across the real web/backend boundary,
  document topbar, inline properties and private draft status. It also proves
  pointer and keyboard pane resizing, maximum and minimum bounds, drag
  cancellation, Focus/Split/Chat layouts, remembered layout preference and
  aligned 48px header rows. It also checks the 1023px, 1024px and 1060px
  responsive boundaries against the actual space beside the app sidebar.
- `workspace-two-tab-conflict-recovery` proves two stale browser tabs retain
  both recovered working versions until the learner explicitly resolves one.
- `workspace-restore-preserves-unsaved-branch` proves restoring an earlier
  revision keeps an unpublished branch visible and blocks publication until an
  explicit resolution.
- `workspace-text-reference-limit` proves the Text picker admits exactly
  40,000 copied characters and rejects the next reference as a whole with the
  actionable limit toast. An editor focus passage remains separate and does not
  reduce the copied-reference allowance. Removing the focus passage produces an
  ordinary turn with no selected text, replacement target or persisted passage
  wrapper.
- `workspace-proposal-target-review` proves a persisted reply proposal can
  keep its original selected target when the cursor moves before Send, replace
  that target while retaining neighboring paragraphs and unrelated edits made
  during review, be undone, and require comparison when the target itself
  changes before acceptance. A native pointer/keyboard selection and scrolling
  keep the selection toolbar within the visible document area before sending.
- `workspace-markdown-insertion` proves formatted preview, heading mapping,
  rich insertion, one-step undo/redo, private recovery, explicit Save/reload and
  shared rich rendering across the real app. On mobile it proves unsupported
  Markdown cannot be inserted as rich text and requires explicit plain-text
  fallback without changing prior formatted content.
- `workspace-share-copy-revoke` proves saved-only shared reading, independent
  recipient copy and immediate link revocation.
- `workspace-mobile-tutor-sheet` retains its established scenario ID and proves
  the current mobile **Document / Tutor** tabs and their matching tabpanel
  relationships, activation after desktop Focus, keyboard tab switching,
  preserved composer state, exactly one automatic AI-outline turn containing
  the complete editor snapshot, document actions, proposal acceptance in the
  document tab and a 380px tablet overlay. Neither layout exposes an unusable
  desktop divider or causes horizontal page overflow.

Character boundaries, concurrent branch races, proposal target mapping and
model budget/compaction have focused contract, integration and editor tests.

## Expected failure and edge cases

- Saving requires a title and nonempty body. An empty research draft remains
  private and recoverable.
- If working recovery fails, show an error and retry without discarding local
  edits. A stale tab creates a conflict branch rather than overwriting work.
- A changed proposal target requires comparison or a new target before Replace.
- Unsupported Markdown or unsafe links require explicit plain-text insertion;
  document limits are checked before acceptance and never truncate content.
- Invalid or revoked share credentials reveal no note or workspace content.
- Oversized copied references, editor context or complete model input fail with
  an actionable limit message; no paragraph is silently omitted.
- A new conversation contains neither another chat's history nor its copied
  attachments. Removing a chat does not delete the note.

## Automated regression checks

Run the registered `pnpm test:e2e:contextual-assistant` command above with its
disposable infrastructure. Run focused Knowledge and Conversations tests, then
affected contracts/backend/web typecheck, lint and build. Check mapping and
guide structure with `pnpm user-flow:e2e -- check knowledge-workspace` and
`pnpm docs:user-flows:check`.

## Troubleshooting

If the E2E runner refuses the environment, verify its exact loopback host,
port, database name and confirmation variables before retrying. A missing model
adapter or worker causes tutor turns to remain pending; use the deterministic
fixture command for repeatable tests. If a share link fails, check that its
fragment key was passed as the `X-Languon-Share-Key` header, rather than a query
parameter. Inspect recovery status and network failures before retrying an
editor Save.

## Cleanup

Delete only the synthetic notes and accounts created for local verification.
The guarded E2E runner owns its disposable service lifecycle. Any broader local
database reset is destructive and must target only a confirmed disposable
database; never run it against shared or production data.
