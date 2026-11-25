---
feature: knowledge-workspace
title: Knowledge workspace
status: current
last_verified: 2026-11-24
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/074-intent-driven-listening/**
    - .agent/features/073-listening-exercises/**
    - .agent/features/072-lesson-review-insertion/**
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/lesson-proposal-copy.ts
    - .agent/features/071-reliable-lesson-runs/**
    - packages/contracts/src/generation-run-preview.ts
    - .agent/features/070-composable-lesson-generation/**
    - packages/contracts/src/generation-plans.ts
    - packages/contracts/src/generation-runs.ts
    - packages/contracts/src/knowledge-content-proposals.ts
    - apps/web/src/fsd/features/lesson-generation/**
    - .agent/improvements/contextual-picker-polish.md
    - apps/web/src/fsd/shared/ui/command-menu/command-menu.tsx
    - .agent/features/069-contextual-exercise-discovery/**
    - packages/contracts/src/conversation-prompt-mentions.ts
    - .agent/features/047-knowledge-workspace/**
    - .agent/features/049-knowledge-markdown-insertion/**
    - .agent/features/060-intent-aware-learning-content/**
    - .agent/features/061-reliable-learning-content-pipeline/**
    - .agent/features/067-named-text-exercises/**
    - apps/backend/src/modules/knowledge/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/drizzle/**
    - apps/backend/src/config/environment.ts
    - apps/backend/src/config/api-environment.ts
    - apps/web/src/fsd/pages/knowledge/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/shared/ui/companion-layout/**
    - apps/web/src/fsd/entities/knowledge/**
    - apps/web/src/fsd/entities/conversation/**
    - packages/contracts/src/contextual-assistant.ts
    - packages/contracts/src/exercise-generation.ts
    - packages/contracts/src/named-exercises.ts
    - packages/prompts/src/local/contextual-language-tutor.ts
    - packages/prompts/src/local/tutor-request-resolution.ts
    - scripts/run-contextual-assistant-e2e.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts
e2e_scenarios:
    - workspace-intent-driven-listening-request
    - workspace-listening-lesson-generation
    - workspace-composable-lesson-continuation
    - workspace-draft-chat-save-reopen
    - workspace-two-tab-conflict-recovery
    - workspace-restore-preserves-unsaved-branch
    - workspace-text-reference-limit
    - workspace-proposal-target-review
    - workspace-markdown-insertion
    - workspace-share-copy-revoke
    - workspace-mobile-tutor-sheet
    - workspace-intent-content-generation
    - workspace-large-vocabulary-generation
related_features:
    - listening-exercises
    - lesson-review-insertion
    - reliable-lesson-runs
    - composable-lesson-generation
    - reliable-learning-content-pipeline
    - intent-aware-learning-content
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

Owned workspaces support intent-aware generation of interactive learning content.
The complete current editor remains available when continuing a chat after
applying generated material. Completed tool work is represented compactly in
later model context while exact prepared content remains available through
authorized proposal references.

Named-exercise requests carry only the learner's selected activity allocation,
languages and difficulty. The workspace freezes the selected source before the
tutor runs; provider output selects source identities only and the host restores
canonical provenance. The picker-to-publication browser journey is mapped by
[Interactive workbooks](./interactive-workbooks.md#e2e-coverage), while this
guide retains the workspace authorization and conversation-context boundary.

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

For isolated listening-exercise verification, the guarded runner also accepts
the dedicated loopback PostgreSQL/Redis pair `55595`/`56595` with the same
database name, Redis DB 1 and explicit confirmation variables. It never uses a
development or shared database.

## Browser verification

### Contextual exercise discovery

The editor and workspace chat use compact floating command menus. Chat opens above
its composer; neither menu expands the writing area. Icon category rows lead to
Basic/Learning blocks, exercises or references. Use the menu's search field to
filter. `/` leaves focus in the writing area: continuing to type, paste or compose
text dismisses the menu and preserves that input. Clicking back into the writing
area also dismisses it. Arrow Down enters commands; Up/Down navigate, Enter
activates a result, and Escape goes Back from a submenu or closes the root. Small
Back/Close controls remain labelled for keyboard and screen-reader use. Preview
returns to the same query, scroll position and control. Text search/details share
this surface rather than opening a detached second popup.

In an editable space, type `/` in ordinary text or use **Add block**. Browse Basic
blocks, Learning blocks, Exercises and Library. Search exercise names or IDs;
all 22 activities are grouped by category. Preview opens a local interactive
example without selecting it, changing the document or generating AI work.
Closing returns to the picker. On narrow screens the preview uses a sheet.

Choose **Create manually · Custom** to open the matching answer format. This
creates Custom content rather than assigning named-exercise semantics. Choose
**Generate with AI** to prepare an editable chat draft; existing prose is retained.
Sending and later inserting/saving generated material remain explicit.

In workspace chat, `/` or the context button can insert exercise and current-note
block chips at the cursor. For example: “Generate [Choose meaning] for words in
[At the library].” Exercise chips select types; the prompt specifies count, or
one per selected type is used. Multiple types share the referenced source set.
The advanced picker retains its explicit count/settings contract. Missing or
incompatible sources require clarification instead of silent substitution.

Exercise-chip preview is local and does not send the prompt. Copied Text materials
remain attachments outside the input. Inline chips can be navigated/deleted with
the keyboard; Enter sends and Shift+Enter adds a line outside an open picker.
Historical chips retain their displayed text; their IDs never grant cross-note
access. Cancelling insertion/preview leaves the draft editable.

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
   groups Mode, explanation language, tone, explanation length and saved
   defaults. Model selection is not exposed to learners here. Empty documents
   offer **Start writing**,
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
   Type `/` to open the current note's block picker, then choose **Texts**
   to select multiple owned Texts and explicitly include a translation when
   desired. Previews show the copied content. Editing or deleting an
   original Text later does not change its copied message content. An addition
   above the configured aggregate reference limit is rejected whole with the
   limit toast. An editor above its separate tutor limit remains editable but
   cannot be sent to the tutor until shortened.
4. Request an editor proposal. A reply with a remembered selection offers
   **Show in text**, opening a compact proposal beneath that target with
   **Accept**, **Compare** and **Reject**. **Compare** opens the full review.
   Completed learning explanations also offer **Use in document** to open that
   review above the document canvas. Capability/help answers, clarifications,
   limitations and generated-block acknowledgements do not offer a prose
   document action. Choose **Insert at cursor**, **Append to end**
   or **Replace selection** and accept through the matching **Insert**, **Append**
   or **Replace** action. Move the cursor and edit surrounding content
   during generation: the original target stays identified. If target wording
   changed, compare or select a new target before replacing it. Accepting a
   proposal changes the working draft as one undoable edit and does not publish.
   Markdown replies appear as formatted editable document content in the compact
   proposal, the read-only **Preview content** dialog and on acceptance:
   paragraphs, bold/italic/strike, inline code, safe links, lists, quotes,
   tables and horizontal rules. H1, H2 and H3 remain their authored levels;
   H4–H6 map to H3 with a notice. The authoring toolbar offers Heading 1,
   Heading 2, Heading 3 and **Horizontal rule**. **Preview content** is a
   read-only document view: its eye action does not open review or change the
   draft/target; **Close** (with a tooltip) or Escape returns focus to the eye.
   At 1440px it is 720px wide; at 390px it fills the viewport and long content
   scrolls within the preview. Explicit table alignment and link tooltips
   normalize to document defaults with a notice. Code blocks, images, task
   lists, embedded HTML, unsafe links or malformed tables block formatted
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

### Intent-aware content generation

1. In an owned note, ask **What can you do?**. The answer stays in chat without
   **Use in document** or a block proposal. Ask for a grammar explanation: it
   remains prose and can offer document insertion when useful as learning material.
2. Request vocabulary for a supplied word list, plus grammar notes and exercises.
   Provide studied and translation languages, or let the tutor use established
   authorized document/learner context. Missing material requirements produce one
   concise clarification before generation. A short answer to that clarification
   continues the retained brief, including after reopening the chat. Interface
   language alone never selects the studied language.
3. With requirements resolved, verify one ordered proposal contains every
   requested component. Explicit word lists and counts are preserved. Unspecified
   exercise count defaults to five, with a balanced selection of supported
   multiple-choice, fill-in-the-blank and free-text formats. Review the stated
   assumptions and prepared content. No part is applied or saved automatically.
   For example, request **Generate vocabulary with top 50 words that are used in
   context of shopping, English to Russian**. Review one vocabulary block with
   all 50 distinct entries. Larger vocabulary requests can use several bounded
   authoring calls internally; the tutor offers one complete proposal after all
   parts validate. A failed part never leaves an applicable partial proposal.
4. Before applying vocabulary, ask **Now make exercises for those words**. The
   tutor reads the exact prior proposal in this conversation. When several
   proposals are plausible, identify the intended one when asked. Reloading or
   memory compaction does not authorize silently substituting newer document
   wording. Exact conversational reference resolution covers the eight most recent
   generated proposals. For older or ambiguous material, restate the words or
   select the relevant content in the document when asked. Prior proposals from
   another chat or note are outside this flow.
5. Review and explicitly apply the complete proposal. Verify the working draft
   changes, then select **Save** separately to publish. A failed or incomplete
   generation offers retry or a request adjustment; it does not report success
   with a Markdown exercise list or a partial proposal.
6. After applying and saving the 50-entry vocabulary block, request a new
   10-entry vocabulary block for a different topic using the established language
   pair. The current editor remains complete; the earlier count does not replace
   the new request. Review the new proposal beside its own reply. Reopen the chat
   and verify earlier proposals still refer to their original exact material.
   In the browser network panel, one Send produces one turn submission and durable
   event delivery. Queued/running/failed status changes do not repeatedly download
   unchanged proposal history, and active generation does not poll it every two
   seconds. A completed proposal or explicit Apply refreshes the relevant data;
   an ordinary send does not reload an unchanged document workspace. First-send
   automatic naming and reconnect recovery still synchronize the workspace when
   needed.

Local development uses the watched worker launched by `pnpm dev:all` or `pnpm dev:dictionary-worker`. After environment or built shared-package changes, restart the development launcher so the API and worker use the same configuration. A paused failure always includes a safe category; if a prior attempt did not record details, Plan and details shows an opaque support reference rather than inventing a network cause.

### Composable lessons and continuation

Ask for a lesson containing ordinary reading text, grammar and exercises in the desired order. Say which language each part should use; the language of lesson content does not silently become the chat reply language. “Up to three” is a bound the tutor can resolve, not a reason to repeatedly ask for an exact number. A clear request begins preparation immediately.

Opening a running lesson shows its plan expanded. The lesson heading and active task indicate that preparation is underway. The highlighted row identifies the current part and unit. Use **Plan details** to smoothly collapse or reopen the list. With reduced motion enabled, the list toggles immediately and the indicators stay static. Exercise and vocabulary rows show explicit completed/total counts; a failed part keeps its completed count and shows a failure state rather than remaining “preparing”. Select **View prepared content** whenever at least one validated unit is ready. This private read-only preview works during generation and after failure; it does not insert, save, copy to the library or run paid checks. Per-exercise progress appears separately from the count of lesson parts. Leaving the page does not stop work; reopening recovers the current run without submitting it again.

During uninterrupted generation, run progress arrives through the existing durable
conversation stream. The browser loads the run list when opening the conversation
and reconciles once after a real connection gap; it does not repeatedly fetch the
run list or each run's detail as progress changes. An older initial response cannot
replace newer streamed progress. A replacement stream can be healthy even when it
only delivers heartbeats. Lesson actions become available after the current
conversation's progress has been read. If that read fails, **Refresh** checks
the saved state again without starting generation. Opening prepared content may read its separate
preview endpoint; that read never starts generation.

Your submitted message stays selectable in chat. The lesson card shows progress while generation runs. The final assistant response groups the completed plan and the action to review and insert its content, in that order. Internal continuation steps do not add messages or imply that you approved another action.

Generation advances automatically within one approved budget. The configured credit and provider-cost ceilings cover the whole authorization; internal stages do not multiply them. The **Stop** button beside the chat input and the one on the lesson card stop the same lesson, including the wait between stages. Completed material stays available and eligible usage is charged. Returning to the page only reads progress and never starts duplicate work.

When a spending confirmation is required, the maximum credits cover the whole
lesson. The approximate output allowance applies to a single stage. Once
authorized, the worker saves each validated unit and advances through the plan.
If an exercise fails validation, the card identifies the current exercise while the
worker tries to correct it within that authorization. A temporary capacity wait
keeps **Stop** and prepared previews available. Neither a checkpoint nor a
recoverable validation error requires **Continue**.

If automatic attempts are exhausted, the card identifies the affected part or
exercise and offers **Adjust plan**. Change that part’s requirements before
continuing. The original plan and validated content remain available to preview.
If the approved allowance, authorization lifetime or stage limit is reached,
review the maximum additional credits before continuing. A paused older lesson
can resume from its saved work after authorization. Eligible charges from
previous stages are retained.
A recorded technical failure remains visible while the connection recovers;
reconnecting status supplements that failure instead of hiding it. Rate limiting,
invalid output, interruption and unknown failures have distinct safe messages;
unknown failures include only an opaque support reference in **Plan and details**.
When the response for a reading fails format validation, the card names the
reading as the point to resume. When the provider explicitly reports that it
filtered a response, the card explains the restriction and offers **Adjust
plan**. Retrying the same instructions is disabled. A recorded failure while
saving the part or recording the attempt has its own support message.
A rejected Continue appears on the selected lesson with its safe reason and a
support reference when available. A capacity rejection before or after budget
confirmation leaves the lesson paused. The card identifies a busy service, a
provider usage limit, or a service spending limit when the server reports it.
Continue later from the saved work when capacity becomes available. When the server rejects an oversized input
before dispatch, reduce the source or adjust the plan. If the provider may have
processed an earlier request, **Authorize another attempt** requests a new
bounded attempt starting at the saved checkpoint. Repeating a command after an
uncertain HTTP acknowledgement uses the same request identity in this tab. When
the server confirms that exact command and the lesson pauses again, the next
explicit Continue starts a fresh stage even at the same plan revision. After an
uncertain provider dispatch, **Authorize a plan adjustment** opens the
adjustment composer. Sending the instruction authorizes a new revision request
for that specific uncertainty. Automatic admission can wait briefly for
capacity; the lesson card shows when an expired authorization, stage limit,
input limit or unavailable source requires learner action.

For an unfinished paused lesson, choose **Adjust plan**, describe the change in chat and review which parts will be kept, updated, added or removed. Preparing this proposed revision uses ordinary chat credits. **Apply plan** is free and leaves generation paused. Resume separately when ready; a fresh confirmed authorization may advance its remaining stages automatically. An order-only change reuses existing content; changed requirements or inputs invalidate dependent parts. Stop active preparation before adjusting it. Completed proposals remain immutable.

If a referenced source changes, choose **Keep original sources** or **Use current sources**. The first preserves captured evidence, including a source block later edited or removed. The second invalidates affected generated parts. To refresh a selected passage, select its current text in the editor and choose **Use current sources** again. Both choices recheck current access. **Discard lesson** removes private prepared content, while retaining prior financial evidence and leaving the document unchanged.

For G03 grammar transformations, the model supplies the answer variants once and
the service builds the prepared checking key from those same variants. The
published exercise keeps its normal reference answer, answer checking and source
rules; no duplicate answer-key wording is required from the model.

Open **Review** in the AI panel. Each lesson part has its own document editor preview. A reading stays together across paragraphs and headings, and an exercise set stays together across activities. Open a hint or answer to reveal it. Place the cursor in the document, then choose **Insert at cursor** on the part you want, or use its end-of-document action. The lesson-wide actions insert the remaining parts in order. Required local source material accompanies its exercise. A part already present in the working draft shows **In document**. Removing the part makes it available again. Return to chat to resume the conversation. Use **Save** to publish your working draft. If another tab changes the draft, refresh and review the destination before trying again.

### Generate a listening set

In an owned Knowledge note, ask directly for a recording. For example, ask for a short French interview between two speakers, one question about its meaning, one missing expression and a one-sentence dictation. Submit once. The service resolves an explicit selection or referenced block first. When the request refers to one unambiguous reading generated earlier in the conversation, it uses that prepared reading even before it is inserted into the document. If several readings fit, choose a displayed title. If a new recording needs credit approval, the original request stays in place and shows one **Generate recording** action with its upper limit. The recording and its text tasks share a finite provider budget. The service reserves enough for the planned text before assigning the recording share. If a saved lesson needs a fresh allowance, select **Review budget** on its card, review the maximum learner charge, and select **Continue**. An expired quote must be refreshed. A zero-credit maximum is possible for operator-funded lessons. Distinct configured voices are required for a generated dialogue. For an existing recording, reference the Audio block with a matching transcript. Reused audio does not need a recording approval.

Open **Review**, play the recording, then try the questions. Reveal the transcript, reference answer or hint separately. Dictation and focused gaps need a short whole recording or an actual timed excerpt. Insert the set at your cursor or at the end and use **Save** to publish. Reusing the original recording avoids paying for fresh synthesis.

## API verification

The owner-scoped `/conversations/:id/generation-runs` list and `/:runId` detail expose progress, safe failure categories and bounded automation status, not generated bodies. The owner-only `/:runId/preview` endpoint returns validated prepared fragments and frozen dependencies after current-access checks. Run actions are `/continue`, `/revise`, `/apply-revision`, `/resolve-source`, `/stop` and `/discard`. Explicit Resume and revision planning use the existing action-quote flow; internal automatic stages use pinned remaining authority. Run-level Stop revokes that authority even between stages. Completed mixed proposals use `/conversations/:id/content-proposals`; application checks the current working-branch version. Selection refresh includes the current editor range, hash and branch version. See [ADR-0060](../adr/0060-composable-generation-runs.md) and [ADR-0061](../adr/0061-bounded-automatic-lesson-continuation.md) and its recovery update in [ADR-0062](../adr/0062-single-submission-lesson-recovery.md).

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
   exactly the limit is admitted if the applicable model-call budget fits.
   Genuinely oversized noncompactable current input fails before a queued turn,
   credit hold or provider dispatch. Retained history that can be compacted is
   not rejected merely for exceeding a raw-history estimate. Previous turn
   snapshots and copied references remain unchanged after later edits.
5. For owned workspace replies, inspect canonical message `responseMetadata`
   through conversation detail and replayed message events. Its kind and
   `documentUse` eligibility survive reconnect/reload. Private generation briefs,
   raw model exchanges and source authority are not public metadata. A completed
   generation has its typed block proposal; a clarification has no generated
   proposal to apply.

## E2E coverage

- `workspace-listening-lesson-generation` proves a single owner-approved
  two-speaker recording is materialized through the production lesson worker
  with synthetic text and speech boundaries, then reviewed as one atomic
  listening set with L01/L04/L02 checks. It verifies the recording remains one
  audio block, answers stay hidden before disclosure, the complete four-block
  set inserts together, and the saved draft restores the playable recording.

- `workspace-intent-driven-listening-request` proves a learner can first
  generate a reading, leave it uninserted, then ask for a two-speaker dialogue
  and one listening question in a second typed message. The service resolves
  the unambiguous prepared reading, keeps that original message in place for a
  single inline recording approval, then returns one reviewable, insertable
  listening set without asking the learner to resend.

- `workspace-composable-lesson-continuation` proves a real owned workspace request exposes a read-only prepared preview, advances internal stages automatically without repeated Continue clicks, retains individual exercises, and inserts/saves/reloads one complete mixed lesson. It also verifies inserting a whole reading at the cursor, revealing a hint and an answer separately, restoring a removed part, and adding the remaining material in lesson order. Only the external model boundary uses synthetic content and usage. The journey
  also checks that ordinary streamed progress does not trigger repeated run-list or
  run-detail reads or intermediate Continue requests. It checks the visible actions during automatic repair and after validation attempts are exhausted. A scoped quote explains the total credit ceiling and the per-stage output allowance before consent. Financial races, revision reuse, source refresh/Keep, budget
  handoff and discard cleanup are separately verified through backend integration
  tests; focused frontend tests cover snapshot/event races and explicit task/failure
  presentation. After verifying saved lesson content, the browser journey injects
  an idle stream rotation and a rejected request. It checks one repair read,
  action gating during that read, and diagnostic isolation between two cards.

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
  reduce the copied-reference allowance. References are not silently truncated;
  the configured character allowance does not guarantee that the complete
  applicable model-call envelope fits. A genuine irreducible input overflow
  returns `context_too_large` before generation. Removing the copied references and focus passage then permits a successful
  ordinary turn in the same conversation with no stale references, selected
  text, replacement target or persisted passage wrapper.
- `workspace-proposal-target-review` proves a persisted reply proposal can
  keep its original selected target when the cursor moves before Send, replace
  that target while retaining neighboring paragraphs and unrelated edits made
  during review, be undone, and require comparison when the target itself
  changes before acceptance. A native pointer/keyboard selection and scrolling
  keep the selection toolbar within the visible document area before sending.
- `workspace-markdown-insertion` proves compact and full read-only formatted
  proposal previews, authored H1/H2/H3 and horizontal-rule preservation, preview
  geometry/scrolling/focus and non-mutation, rich insertion, one-step undo/redo,
  private recovery, explicit Save/reload and shared rich rendering across the
  real app. On mobile it proves the preview fills the viewport and unsupported
  Markdown cannot be inserted as rich text, requiring explicit plain-text
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

- `workspace-intent-content-generation` covers conversational replies without
  document actions and coordinated interactive generation in the owned workspace.
  Exact scope and current execution results are recorded in
  [feature 060 evidence](../../.agent/features/060-intent-aware-learning-content/EVIDENCE.md).
- `workspace-large-vocabulary-generation` proves a request for 50 shopping words
  produces one complete vocabulary proposal, with 50 distinct entries in review,
  and one interactive block after explicit Apply, Save and reload. A subsequent
  10-entry request succeeds with that populated editor and retains its own count.
  Network assertions distinguish the single turn submission and durable event
  delivery from proposal reads: no active polling or admission-triggered unchanged
  workspace/detail reload, with proposal refresh only for initial history and
  successful publication. External model responses are deterministic; authoring,
  validation, compilation and persistence use the real application path.

Character boundaries, concurrent branch races, proposal target mapping and
model budget/compaction have focused contract, integration and editor tests.

## Expected failure and edge cases

- Lesson actions include an idempotency key and expected plan revision. Stale revision/source conflicts require reconciliation; reconnect never dispatches another stage. Only unfinished owner-authorized runs can be continued or revised.

- Unsupported exercise formats and missing material requirements require
  clarification. A request exceeding the admitted total call/output budget
  requires a smaller request; requested words/counts are not silently dropped.
  Validation repair is bounded by the admitted action.
- Follow-up proposal reads require current access to this owned note and
  conversation. Deleted or unavailable proposal content requires clarification;
  the tutor cannot recover it by claiming authority from chat text.
- Saving requires a title and nonempty body. An empty research draft remains
  private and recoverable.
- If working recovery fails, show an error and retry without discarding local
  edits. A stale tab creates a conflict branch rather than overwriting work.
- A changed proposal target requires comparison or a new target before Replace.
- Unsupported Markdown or unsafe links require explicit plain-text insertion;
  document limits are checked before acceptance and never truncate content.
  Previewing is read-only and never changes a draft, tracked target or proposal
  acceptance state.
- Invalid or revoked share credentials reveal no note or workspace content.
- Oversized copied references, editor context or complete model input fail with
  an actionable document/chat-context limit message; no paragraph is silently
  omitted. Sequential planning, authoring and possible source-read payloads do not
  count as if they occupied one model call. A short question after applying a
  vocabulary block must not fail solely because of that hypothetical sum.
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
