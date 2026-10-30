---
type: backlog-task
id: BL-006
title: 'Grammar conversations and learning documents'
status: in-progress
created: 2026-10-01
updated: 2026-10-30
original_tasks: '9'
evidence:
    - .agent/features/059-interactive-workbooks/EVIDENCE.md
    - .agent/features/044-contextual-language-assistant-and-knowledge/EVIDENCE.md
    - docs/user-flows/contextual-language-assistant-and-knowledge.md
    - .agent/features/047-knowledge-workspace/EVIDENCE.md
    - docs/user-flows/knowledge-workspace.md
---

# BL-006 — Grammar conversations and learning documents

[Backlog index and shared constraints](README.md).

Implementation of the first delivery is authorized and tracked in
[feature044](../../.agent/features/044-contextual-language-assistant-and-knowledge/FEATURE.md).
Guided tutoring and exercise generation below remain later scope. This task is
in progress until the broader backlog requirements are delivered.

## Confirmed requirements

### Design discovery decisions, 2026-10-18

The learner confirmed the following scope refinement during the GrillMe
interview. These decisions informed the authorized feature044 implementation. Later
requirements below are deferred, not removed or completed.

- One personal Knowledge area is the broader home for this task, covering
  grammar, usage, etymology, culture, and other language-learning topics.
- The first delivery scope is contextual conversations opened from dictionaries
  or texts, plus saved knowledge notes and “Ask about this” conversations from
  those notes. Exercise generation and guided tutoring remain later extensions;
  there is no separate grammar-only product area.
- The learner may request a knowledge note draft, or the assistant may offer
  one. A draft consolidates the relevant explanation, examples, and context into
  an independently understandable note. The learner can edit it before saving;
  only an explicit learner action saves it. Ordinary replies are not saved
  automatically.
- Unsaved note drafts persist privately with their conversation, visibly marked
  Draft, and reopen for editing. They do not appear in Knowledge until Save.
  Discarding a draft or deleting its conversation removes it; saved notes remain
  independent.
- The assistant's scope follows the requested learning task rather than a ban
  on subject matter: explaining grammar in a marketing email, improving its
  French with explanations, and explaining historical references are in scope.
  Developing a marketing strategy is outside its role and should be redirected
  toward language learning. The same distinction applies to technical topics
  versus writing code or performing unrelated professional work.
- Conversations and knowledge notes are private to their learner, including
  when the source is another person's shared dictionary. Source ownership and
  visibility do not grant access to another learner's conversations or notes.
- The future AI tutor should reuse the explanation and knowledge-note
  capabilities. Knowledge has its own application service, separate from
  conversations. Agents can retrieve authorized context and propose structured
  drafts for new notes or revisions; ordinary replies remain formatted prose.
  The application validates proposals and presents an editor, while explicit
  learner Save commands enforce ownership, version checks, and revision history.
  Agents have no tool that silently saves, overwrites, or deletes notes.
  Authorization is enforced in application code, outside model instructions.
  The future tutor uses these same capabilities. The proposed architectural
  record is [ADR-0037](../adr/0037-independent-knowledge-and-agent-proposals.md).
- Notes support multiple categories from a fixed initial list: Grammar,
  Vocabulary & meaning, Usage & register, Pronunciation, Etymology, Culture,
  and Learning tips. Language-related history belongs in Etymology or Culture.
  AI suggests categories and learners can change them. Custom categories and
  folders are deferred.
- Reply language defaults to Automatic: respond in the language the learner
  uses for their actual question, ignoring quoted learning material. Ambiguous
  short replies retain the previous explanation language; substantive questions
  in another language switch it. An explicit preferred language takes priority.
  The model applies these rules through its instructions rather than a separate
  deterministic language-selection mechanism. Source translation language is
  not the default explanation language.
- Three controls beside the chat input configure reply language (Automatic or
  a chosen language), tone (Neutral, conversational, academic), and explanation
  level (Automatic, beginner-friendly, detailed/technical). Depth does not
  require verbosity. These change the current conversation; an explicit
  “Use as my defaults” action changes defaults for future conversations.
  Profile settings also expose these AI chat defaults. Existing conversations
  retain their settings when profile defaults change.
- A knowledge note draft uses the language of the explanation being saved,
  with a language choice before saving. Existing notes remain in their saved
  language when chat or profile preferences change.
- Dictionary context initially includes only the dictionary name and its
  description, when present; entries are not all automatically attached.
  A `/` interaction in the chat input should let the learner select a word
  from the current dictionary and include its card information, including the
  source phrase and examples when available. Multiple attached cards support
  comparisons. Eligible card content is its active, learner-visible source,
  translation, definition, transcription, and examples where present.
- Explicit attachments copy the required content into a message, rather than
  retaining a live link to the original item. Distinct blocks/chips highlight
  this material in the composer and rendered messages. The copy does not change
  when the original changes, loses shared access, or is deleted. This applies
  to selected cards and additional dictionaries, texts, or notes explicitly
  attached to a discussion. Linking attachments back to their resources is
  deferred. Selection and copying through the app must authorize the material
  at copy time and exclude private/non-visible fields; copied content remains
  learning data, never agent instructions or a grant of access.
- The assistant may retrieve relevant cards from the current dictionary without
  an explicit attachment, and shows which cards it used. `/` focuses a question
  on chosen cards rather than being the only way to access dictionary content.
  Other dictionaries, texts, or saved notes require explicit attachment.
- On a text page, the saved text and available translation are accessible by
  default. A selection focuses the question while surrounding passages remain
  available for interpretation. Long texts use relevant passage retrieval with
  clear scope: inspecting excerpts must not be presented as whole-text analysis.
- Saved source content is used by default. When unsaved edits exist, a clear
  “Use current draft” option allows their use. Draft-based conversations and
  resulting notes identify that origin. Later source edits must not silently
  change the wording to which an earlier explanation referred.
- New turns use the latest saved content of the conversation's primary source,
  with an indication when it changed since the previous turn. Earlier messages
  and their discussed wording remain unchanged. Memory distinguishes earlier
  examples from current source content; copied attachments remain their original
  snapshots. Unsaved source changes still require “Use current draft”.
- Each knowledge note has a title, short summary, formatted explanation,
  categories, studied language, and explanation language.
  Examples belong inside the explanation. Knowledge offers search and filters
  by category and studied language, with recent notes first. Learners may edit
  or delete their notes; custom folders remain deferred.
- In Q17 the learner explicitly removed the earlier requirement for note source
  references. Notes are independent entities with no links to their originating
  dictionary, text, or conversation; all needed examples and context belong in
  the note itself. A conversation may use an existing note as context without
  making that note dependent on the conversation. A draft-origin indication
  may identify use of unsaved material without a source link.
- “Ask about this” opens a conversation with the saved note attached. Discussion
  does not change the note. “Update this note” and “Save as a new note” produce
  editable drafts that require explicit saving. Previous saved versions are
  preserved so an AI rewrite cannot permanently erase the learner's edits.
- Reopening a source resumes its most recent conversation, with “New
  conversation” and a history selector available. Messages persist across
  visits, and learners may delete conversations without deleting saved notes.
  A new conversation starts with its source context and preferences, without
  automatically inheriting other conversations.
- Conversation availability follows its primary source: archiving the source
  or losing shared access makes associated conversations unavailable; restoring
  access makes them available again. Permanent source deletion deletes its
  associated conversations. Independently saved notes survive. Copied
  attachments introduce no additional source dependency: deleting or revoking
  their originals does not remove this conversation. If an attachment comes
  from the primary source itself, primary-source lifecycle rules still apply
  to the conversation as a whole.
- Responses stream. Closing chat or navigating away lets the active response
  finish; reopening reconnects to the same operation. Explicit Stop cancels
  further generation where possible. There is at most one active response per
  conversation. Connection retries do not duplicate messages or generation.
  On failure, preserve the learner's message, mark partial output incomplete,
  and require an explicit action to retry generation.
- A stale revision draft never silently overwrites newer saved edits. Keep the
  draft and let the learner compare it with the latest note or save it as a new
  note. Revision history supports “Restore this version”, creating a new current
  revision without erasing intervening history. Confirmed deletion removes the
  note and its revisions; pending AI drafts cannot automatically recreate it.
- The first release uses model knowledge and attached/retrieved learning
  material, without external reference search. The assistant must acknowledge
  uncertainty and must not invent references. Material being discussed is
  distinguished from external evidence for factual claims; saving an explanation
  never labels it verified.
- Chat uses the learner's existing AI model preference and credit balance,
  shows the active model and usage, and bounds each turn's generation and
  retrieval work. An unavailable selected model produces an actionable error
  without silently switching models. AI note creation/rewriting consumes usage;
  saving a prepared draft and manual editing do not invoke AI. Stopping prevents
  further work where possible but does not undo usage already incurred.
- First delivery targets the responsive web app: signed-in chat on owned and
  shared dictionary/text pages, chat from saved notes, Knowledge in navigation,
  and AI chat defaults in Profile. Chat uses a side panel on wide screens and
  a full-screen view on narrow screens. Native mobile, standalone chat without
  a source, exercises, and course-guided tutoring remain later scope.

Canonical terms are recorded in the [learning-assistance glossary](../../CONTEXT.md).

### Selected Mastra context compaction, Q23–Q28

The learner suggested Mastra compaction instead of custom long-conversation
summarization in Q23 and selected Observational Memory in Q28: conversation-scoped
observations and recall, preserved readable history, an explicitly selected
model, and on-demand compaction inside a bounded chat operation with its usage
accounted for. Speculative background processing is excluded initially. Exact
compatible package versions and storage integration remain implementation-design
work; no dependency/configuration change has been made.

- The lockfile and installed backend package resolve `@mastra/core@1.57.0`.
  `@mastra/memory` is absent from backend dependencies and the lockfile, and
  canonical composition does not configure persistent memory/storage.
- Mastra's [Observational Memory guide](https://mastra.ai/docs/memory/observational-memory)
  describes Observer/Reflector processing that condenses model context while
  retaining stored conversation history. It requires a supported storage
  adapter; PostgreSQL is among the supported adapters. Exact compatible memory
  and adapter versions must be verified before implementation.
- The [API reference](https://mastra.ai/reference/memory/observational-memory)
  supports thread-scoped observations and explicit thread-scoped raw-message
  recall. Enabling recall with bare `true` permits cross-thread browsing by
  default, so it would violate the agreed conversation isolation. Configure
  observation and recall scope explicitly; do not enable cross-thread working
  memory or semantic recall implicitly.
- Memory processing invokes models. The reference documents usage hooks and
  optional background buffering, but callbacks alone do not provide this app's
  admission, durable settlement, cancellation, or deletion guarantees. Model
  calls must pass through established application accounting and execution
  boundaries. Background work must not continue beyond Stop or source deletion
  through an unmanaged worker.
- The docs bundled with core 1.57.0 and the live reference differ on model
  defaults and hook behaviour. Resolve the memory model explicitly through
  the app's selected-model policy, bound thresholds/output/retries for that
  model, and verify APIs against the actual pinned memory version. Do not
  assume all live-reference options exist in the current dependency set.
- Selected initial configuration: thread-scoped Observational Memory and
  thread-scoped recall, preserve readable history, explicitly use the selected
  model, and disable speculative background buffering until it can participate
  in a bounded admitted turn. A completed memory summary is internal
  conversation state, never an automatically published knowledge note.
- Preserve language examples, corrections, explicit preferences, uncertainty,
  and source-version distinctions in memory instructions. Exact quotations
  require reading original messages rather than trusting lossy observations.
- Source availability must gate both history and condensed memory; deleting
  a conversation must remove or invalidate its observations, buffers, derived
  indexes and pending work as well as visible messages. Whole-source retrieval
  remains separate from compacting chat history.

The guide and reference were fetched from Mastra on 2026-10-18 and compared with
the installed package's bundled reference. This is documentation/source
evidence, not a runtime compatibility test or measured quality/cost result.

### Knowledge workspace design discovery, 2026-10-19

This follow-up interview records intended product behavior. Delivery of the
workspace/sharing extension was authorized on 2026-10-19 and is tracked in
[feature047](../../.agent/features/047-knowledge-workspace/FEATURE.md). Earlier first-delivery
requirements and evidence above remain historical. The broader task stays
in-progress. Resolved terms are maintained in [CONTEXT.md](../../CONTEXT.md).

Confirmed in workspace interview Q1–Q3:

- The workspace is the editing view of the existing Knowledge note, not a
  separately persisted document exported into Knowledge. Notes broaden to
  learner-written essays, study documents and language-learning research notes.
  Save updates the same note; Save a copy creates an independent note.
- The rich-text editor appears on the left and the reused contextual assistant
  on the right on desktop, with a bottom sheet on mobile. The existing tutor
  implementation/capabilities are extended rather than duplicated.
- Conversations remain private and associated with the note. Notes should become
  shareable and copyable; chat history is neither shared nor copied with them.
  Exact sharing/access and conversation-cardinality choices remain open.
- Preserve the current language-learning task limits and uncertainty behavior.
  Initial research uses model knowledge and supplied learning material; there is
  no external search. Professional subject matter can be learning material, but
  unrelated professional work remains outside the assistant's role.
- A `/` picker allows selecting multiple Texts as references. Adding a Text is
  rejected in full if the resulting combined character count exceeds 40,000;
  preserve prior accepted references and show a toast explaining the limit.
  This is an aggregate size limit, not a fixed count of Texts. Precisely which
  content contributes, reference lifetime and snapshot/live behavior remain open.
  A character budget alone is not a claim about total model token capacity.
- Later: uploaded images, DOCX/PDF and retrieval over those documents. Selecting
  Knowledge notes as references is a possible later extension, not yet agreed
  for this delivery.
- Assistant output enters the editor through reviewed Insert at cursor, Append
  or Replace selected text proposals, explicit acceptance and undo. Ordinary
  replies remain in chat. If the learner edits a targeted paragraph while a
  proposal is generated, compare before replacing the newer wording.
- The current editor content must be available as tutor context and selections
  can be explicitly passed to chat. Turn snapshot timing, retention and budget
  interaction still need agreement.

Confirmed in workspace interview Q4–Q8:

- `/` selections accompany a single message. The submitted message includes the
  copied content itself with a compact, readable preview in the composer/history;
  the model receives the content, not a resource ID requiring later resolution.
  Removing or editing the original does not alter the copy. There is no persistent
  workspace reference list. App-assisted selection must still authorize access
  when obtaining the content; no repeated source resolution is required for the
  copied message afterward.
- Default aggregate attachment allowance is 40,000 plain-text characters including
  whitespace. Exactly 40,000 is allowed; reject an addition in full when it would
  exceed the allowance. Explicitly included translations count toward the same
  allowance. The editor context has a separate allowance, still to be decided.
  Configure the reference allowance through environment configuration; later
  model-specific limits are deferred. Client feedback and authoritative backend
  validation must use the same effective limit. Suggested toast: “Reference text
  exceeds the 40,000-character limit. Remove a reference or select a shorter
  passage.” The displayed number must reflect configuration, not a hardcoded 40,000.
- Capture the current editor content, including unsaved edits, when each message
  is sent. That turn uses that snapshot while the learner continues editing;
  the next turn receives the then-current snapshot. A selected passage focuses
  the question while surrounding document context remains available.
- Sharing uses an unlisted read-only link. Signed-in recipients can save an
  independent copy. Only saved note content is shared/copied; private chat and
  message attachments are excluded. Editing a copy does not change the original.
- Automatic Mastra compaction is essential for this workspace. Preserve readable
  original history and copied content, account for memory work under existing
  model/credit limits, and distinguish current editor snapshots from historical
  wording. Exact context placement and capacity/failure behavior need discovery;
  a character allowance is not a guarantee that a model request fits.

Confirmed in workspace interview Q9–Q12:

- Each turn receives the complete current editor snapshot up to a separately
  configurable editor allowance. Compact older conversation history automatically.
  If editor content plus attachments still cannot fit the complete request budget,
  explain the limit and require a smaller input; never silently omit paragraphs.
- Recover unfinished private editor drafts automatically. Explicit Save updates
  the saved note and its shared view; reopening restores unfinished edits.
  Accepting an AI proposal changes only the working draft. Scope of recovery
  across tabs/devices and conflict handling still need agreement.
- A note supports multiple private conversations, reopening the most recent.
  Users can start another or remove previous chats. A new conversation receives
  current editor context without other conversations' history or copied material.
- Shared readers must first save a personal copy to use this workspace's tutor.
  Their copy and conversations remain independent if the original owner edits,
  disables sharing or removes the original note. No recipient chat against the
  shared original is introduced in this delivery.

Confirmed in workspace interview Q13–Q16:

- Default full-editor AI context allowance is 40,000 plain-text characters,
  configurable through its own environment setting. Larger notes remain editable
  and saveable within document storage limits, but tutor submission requires a
  smaller editor snapshot. The complete request still passes model input-budget
  validation after automatic compaction; separate character caps do not guarantee
  combined input fits.
- Working drafts persist privately on the server, recover across devices and
  expose recovery status. Concurrent tab/device edits preserve both versions
  and require resolution instead of silently overwriting either. Shared readers
  continue seeing the last explicitly saved version.
- Research may start and continue with an empty editor. New note creates an
  Untitled private draft with stable identity, immediately usable chat, a Draft
  label in Knowledge and reopen/delete support. This is the draft state of the
  same note entity, not a second standalone-chat/document model. Sharing is
  available only after the first explicit Save.
- After the first user message, derive the default draft title from its first
  three words unless the user has renamed it to something different from the
  default. This derivation does not require a model call. Note versus individual
  conversation naming still needs final confirmation.
- Insert/Replace proposals remember their original target. Moving the cursor
  does not redirect them. Edits above/below a target must correctly shift its
  location while preserving its identity. If target content changes or disappears,
  require comparison or a new target. Append uses the current document end at
  acceptance. Each accepted proposal is one undoable edit.

Confirmed in workspace interview Q17–Q21 and media follow-up:

- Name the note from the first user message's first three words only while its
  title remains the default. Each new conversation receives its own title by
  that rule. Starting another conversation never renames the note, and manually
  changed titles remain untouched. Derive these titles without an AI request.
- Explicit Save requires a title and nonempty editor content. Summary, categories
  and language metadata become optional. Empty-editor research remains a private,
  recoverable Draft and cannot be shared. This extends existing stricter saved
  note validation; implementation must update the relevant contracts and callers.
- Owner Save a copy saves current working draft content, title and metadata as a
  new independent note without changing the original. Copy no conversations,
  message attachments or previous revisions. Shared recipients copy only the
  saved version visible to them.
- Conflict resolution shows both drafts and offers continuing with either,
  manually combining them or saving one as a separate note. Preserve alternatives
  until explicit resolution; never automatically merge prose or discard a version.
- Disable sharing invalidates the link immediately. Re-enabling creates a new
  link; previously issued links remain invalid. Existing independent recipient
  copies survive revocation.
- Later document media may include video/YouTube/TikTok, audio, images and article
  links. Adding/interpreting these media types is outside the first iteration.
  Existing ordinary hyperlinks remain text/link content; the tutor must not imply
  it fetched linked articles, watched videos, listened to audio or interpreted
  images. Media extraction, uploads, transcription/OCR, retrieval and their context
  treatment need a later design; do not silently enable those tools now.

Current implementation findings for the workspace interview:

- Mastra already uses conversation-scoped Observational Memory with accounted,
  bounded observation/reflection and preserved canonical messages. Copied
  message content participates in this history. Current draft snapshots are
  instead stored on the turn and supplied as source instructions; they are not
  canonical user-message content. Do not assume compaction removes repeated
  current-editor context or that summaries supersede the current snapshot.
- Existing message admission is capped at 8,000 serialized bytes, with separate
  initial source projection at 12,000 bytes and retrieval at 24,000 bytes. These
  are existing implementation bounds, not the proposed character allowances.
  Implementing 40,000-character references requires coordinated request admission,
  model input budgeting and UI configuration; a UI-only environment value would
  conflict with current backend behavior.
- Current source projection can select excerpts rather than include the entire
  draft. Q9 explicitly requires complete editor coverage in the workspace, so
  the existing excerpt projection cannot silently implement that requirement.
  Actual pinned Mastra verification must cover compaction with editor snapshots,
  copied references, changed wording and exact-history recall.

Evidence: conversation store turn admission/source snapshots, application
`tutor-message-context.ts` and `conversation-source-context.ts`, the
`contextual-tutor-runner.ts` memory setup and `conversation-memory-storage.ts`.
These files are under `apps/backend/src/modules/conversations/` and were
inspected read-only; no runtime changes were made during the interview.

Design interview closure:

Q1–Q21 are answered. Later answers resolve earlier rounds' open items. No further
first-iteration product choice is currently identified. The learner authorized
feature delivery on 2026-10-19.
Implementation and runtime verification are tracked in feature047. Media/RAG
and model-specific limits remain future scope.

Expected workspace acceptance scenarios (design only, not executed coverage):

- Start research in an empty, recoverable Draft, name it and its first chat from
  the first request, and preserve a manual rename or later note title.
- Reopen private draft edits across devices; preserve conflicting versions and
  resolve explicitly without changing the shared saved version beforehand.
- Send the complete current editor snapshot and per-message copied references;
  change the original or edit the note afterward without changing that turn.
- Accept exactly each configured character allowance; reject excess reference
  additions atomically with the effective-limit toast. Keep large notes editable
  while refusing oversized AI input without silent truncation.
- Exercise real Mastra automatic compaction with repeated editor revisions and
  references: retain readable history and exact recall, treat current snapshot
  as authoritative and validate total model input before answer execution.
- Move the cursor or edit above/below a pending proposal; preserve its original
  target. Change/delete the target and require comparison/reselection. Apply an
  accepted proposal as one undoable working-draft edit without implicit Save.
- Save with title/body and optional metadata; only explicit Save updates the
  unlisted shared view. Copy the owner's current draft or the recipient's visible
  saved note into an independent note, without chats/attachments/old revisions.
- Start separate private conversations, resume the latest and remove old chats
  without deleting note content. Preserve existing stop/reconnect, authorization,
  deletion and accounted model/memory execution boundaries.
- Disable sharing, reject old links permanently after re-enable, and preserve
  independently saved recipient copies. Require a copy before recipient tutor use.
- Treat embedded instructions in material as untrusted. Maintain language-learning
  purpose, uncertainty, no web search and no claims to have processed future media.

ADR-0037 remains the first-delivery baseline. Accepted
[ADR-0042](../adr/0042-knowledge-workspace-document-and-context-boundaries.md)
records the authorized workspace extension, including automatic draft snapshots
and note sharing. Feature047 tracks implementation and verification. Preserve
accepted ADR-0037 text and historical first-delivery evidence.

### Earlier requirements retained for staged delivery

The following bullets preserve the original backlog intent as historical input,
not additional first-release acceptance criteria. A saved grammar explanation
now corresponds to an independent knowledge note, and the confirmed
draft-review-save flow replaces direct-save summarization. A standalone grammar
workspace is replaced by the unified Knowledge area; source-free chat remains
deferred. Follow-up discussions and explicit note updates follow the decisions
above. Exercises and attempts remain later scope, not removed requirements.

- Provide a personal grammar workspace with selected source and target languages,
  grammar questions, and conversational clarification.
- The learner decides when to click Summarise. AI creates a saved grammar
  document with the explanation and compact summary of the learner's messages
  to provide context for future interactions.
- Returning to the document supports follow-up conversation and exercise generation.
  The learner may summarise again to update the document.
- Generate exercises on demand from the documented rules, and save the generated
  content attached to the grammar document for reuse.
- Keep learner attempts and progress separate from exercise content.
- Grammar conversations, documents, and exercises are private in the first version.

## Existing behaviour and implementation context

The [product overview](../project-description-short.md) describes a grammar expert as
future product direction; it is not evidence that this complete journey exists.
Dictionary ownership does not make a grammar document a dictionary entry, and
saved grammar content needs its own appropriate domain representation.

## Delivery status and remaining decisions

The interview decisions through Q28 are implemented under the authorized
[feature044 delivery](../../.agent/features/044-contextual-language-assistant-and-knowledge/FEATURE.md).
[ADR-0037](../adr/0037-independent-knowledge-and-agent-proposals.md) is accepted.
The delivery specifies persisted contracts, restricted rich text, bounded
provider calls and memory, per-call credit settlement, account/source erasure,
and immutable copied attachments. Its
[evidence](../../.agent/features/044-contextual-language-assistant-and-knowledge/EVIDENCE.md)
and [review](../../.agent/features/044-contextual-language-assistant-and-knowledge/REVIEW.md)
record verification and remaining work. Completion is determined there; this
broader backlog task remains in progress because exercises and guided tutoring
are deferred.

The authorized Knowledge workspace extension is delivered by
[feature047](../../.agent/features/047-knowledge-workspace/FEATURE.md). Its
[evidence](../../.agent/features/047-knowledge-workspace/EVIDENCE.md) and
[workspace guide](../user-flows/knowledge-workspace.md) cover recoverable note
editing, private note conversations, copied Text references, reviewed editor
proposals, and saved-only sharing with independent recipient copies. This is a
partial delivery of BL-006; exercise generation and guided lesson flows remain
future scope.

Exercise formats, attempts, and how existing exercises respond to updated rules
belong to later delivery scope. Private knowledge is the implemented baseline. The workspace interview above
explicitly requests note sharing as new scope; unlisted read-only access and independent copying are confirmed for that
extension. Save visibility and recipient tutor behavior are specified in ADR-0042.

## First-delivery acceptance scenarios

These agreed scenarios map to feature044 acceptance criteria. The linked delivery
evidence and user-flow guide identify the implemented tests and runtime results.

- Open signed-in chat on an accessible dictionary, text, or knowledge note;
  resume the latest conversation or start a private new one without importing
  other conversations.
- Discuss selected cards/passages, compare multiple card attachments, retrieve
  relevant current-source material, and see what informed an answer without a
  claim of exhaustive analysis after reading only excerpts.
- Attach content from another accessible source as a visibly distinct copy;
  edit or remove its original without altering the message or conversation
  availability. Deleting the primary source still deletes its conversations.
- Change the primary source between turns, see the update indication, and ask
  about current content without rewriting earlier examples. Explicitly include
  an unsaved source draft and preserve the distinction from saved content.
- Ask mixed-language questions with Automatic selected; respect question
  language and explicit overrides. Adjust tone/level per conversation, save
  defaults in Profile, and preserve existing note language.
- Discuss language/culture in a business or technical text, while redirecting
  an unrelated professional task. Treat copied/retrieved instructions as source
  material, preserve uncertainty, and never invent external verification.
- Generate a categorized standalone note draft, leave and reopen it, edit it,
  then explicitly save it into Knowledge without origin links. Search and
  filter notes; deleting the conversation does not remove saved notes.
- Ask about a saved note without changing it. Propose an update or a separate
  note, detect intervening edits, preserve prior versions, and restore a version
  by creating a new revision. Deletion cannot be undone by a pending AI draft.
- Disconnect or navigate away mid-response, reconnect to the same operation,
  and avoid duplicate messages/generation. Stop further work explicitly; keep
  failed output visibly incomplete and require explicit generation retry.
- Make a primary source unavailable and restore it; gate history, drafts,
  memory, and new model work consistently. Permanently delete it and clean up
  its conversations and derived state without deleting independent notes.
- Honor the explicit model and existing credit policy, account for memory/tool
  model calls, and perform no AI work for manual editing or saving a ready draft.
- Verify readable long-chat history and conversation-isolated context handling
  with the selected compaction mechanism; retrieve exact prior wording when
  needed and prevent memory from creating Knowledge automatically.

## Interactive workbook extension — 2026-10-28

The user confirmed [feature 059](../../.agent/features/059-interactive-workbooks/FEATURE.md)
after the [interactive workbook interview](../interactive-workbook-discovery.md).
This delivery extends knowledge notes with reusable grammar, vocabulary, bilingual
text, video, audio-comprehension and exercise blocks; ordered workbooks; independent
copies; shared-reader explanation/practice; and private versioned learner state.
It includes on-demand exercise generation with preview/apply and explicit Save.
The [execution plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md)
owns current progress and verification requirements.

Foundational contracts are in progress, not a completed interactive workspace.
Earlier interview restrictions on media and copy-before-chat describe features
044/047; feature 059 must explicitly reconcile ADR-0042 before extending them.
Historical evidence above is retained and does not prove the new behavior.
Guided course/lesson generation and workbook-wide AI context remain separate
future work. BL-006 remains in progress after this partial scope allocation.

## v16 partial-delivery checkpoint — 2026-10-30

The selected Magic Patterns v16 custom-block/editor/chat migration is implemented: six reusable block families, reviewed generation/update proposals, atomic vocabulary/text AI, independent library copies and private shared-reader practice. Guided lessons, workbook-wide AI context and grammar-library saving remain deferred. Live uploaded-audio transcription still awaits approved provider/model activation.

See [F059 evidence](../../.agent/features/059-interactive-workbooks/EVIDENCE.md)
and its [fidelity observations](../../.agent/features/059-interactive-workbooks/evidence/v16-migration/FIDELITY.md).
The full critical gate passes14 flows /812 tests with no skips. Parent F059 and
this broader backlog task remain **in progress**; this is partial-delivery evidence,
not a terminal task disposition.

## Referenced custom-block refinement — 2026-10-30

Feature059's REF-1–REF-5 follow-up adds readable safe narrative Markdown,
current-note block mentions from slash/settings menus, multiple target-specific
review proposals and explicit cursor insertion while preserving source authority,
complete editor context and learner-controlled publication. It also corrects the
workspace's initial false unavailable state. Source/security review and serial
web185/1295 are verified. The final canonical gate passes14/14 flows and816/816
tests, including789 backend cases and3 workbook browser journeys; final static
checks and product builds pass. Exact source and evidence are recorded in the
[F059 verification record](../../.agent/features/059-interactive-workbooks/EVIDENCE.md).
This is partial BL-006 delivery; guided lessons, shared workbook AI context,
grammar-library saving and unapproved live transcription activation remain
outside this slice. Status remains in-progress.
