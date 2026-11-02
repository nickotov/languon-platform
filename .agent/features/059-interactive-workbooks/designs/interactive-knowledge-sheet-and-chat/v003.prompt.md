---
type: design-prompt
title: Interactive knowledge sheets and AI chat
status: current
created: 2026-10-29
feature: 059-interactive-workbooks
source_paths:
    - .agent/features/059-interactive-workbooks/FEATURE.md
    - apps/web/src/fsd/pages/knowledge/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/entities/learning-blocks/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/features/workbooks/**
    - apps/web/src/fsd/features/workbook-learning/**
    - docs/user-flows/interactive-workbooks.md
---

# Interactive knowledge sheets and AI chat — design prompt v003

Copy the **entire text block** below into your design agent. It is self-contained;
repository links and verification notes are outside the copyable block.

[Versioned handoff](../../.agent/features/059-interactive-workbooks/DESIGN.md) ·
[Feature requirements](../../.agent/features/059-interactive-workbooks/FEATURE.md) ·
[User flow](../user-flows/interactive-workbooks.md)

```text
Extend the EXISTING Languon AI-chat and knowledge-sheet editor design with interactive custom content blocks. This is an additive design task, not a workspace redesign.

KS-01 — PROJECT CONTEXT AND DESIGN GOAL
Languon is a language-learning application for adults. Learners already have dictionaries, flashcard training, sentence practice, bilingual Texts, and a contextual AI tutor. Knowledge sheets combine their own writing with reusable learning material. An ordered workbook groups sheets into a study sequence; standalone sheets remain possible.

We are extending a document-and-chat workspace into an interactive learning space. Users can write prose, create learning blocks manually, ask AI to propose those same blocks, review changes, and explicitly apply them. Shared readers study and practice privately without changing the author's material.

The existing chat and editor-space design is already established. Preserve its shell, pane layout, title/save area, composer, message styling, typography, spacing and navigation. Work inside its available content slots. Reuse supplied existing-design references; if those references are absent, mark surrounding shell treatments as provisional and concentrate on block components. Do not invent a replacement workspace or claim fidelity to unseen references. Create a coherent extension, not a generic chatbot, dashboard, landing page, or wall of configuration forms. The writing and learning material should be the visual center. AI is a capable companion, with clear boundaries between conversation, proposed material, authored content, and personal practice.

The functional rules below are requirements. Improve visual hierarchy, density, component composition and disclosure without inventing additional capabilities. Some capabilities are conditionally unavailable; design those states honestly.

KS-02 — WORKSPACE AND NAVIGATION
Preserve the existing desktop arrangement: the sheet as the main area and a docked tutor on the right. Support document-focused, split, and chat-focused layouts; the chat can take a normal side width or roughly half the available workspace. Changing layout must preserve text, caret/selection, scroll position, question draft, attachments, and active work.

Use the existing app shell as context: navigation to Dictionaries, Texts and Knowledge, with access to Workbooks from the knowledge area. Keep it understated; this brief is not a sidebar redesign. Inside a workbook show its name, the sheet's position, and previous/next navigation. A compact ordered sheet outline can be disclosed without creating another permanent full-width sidebar.

On phones, show a usable full-width document and a clear Document / Tutor switch. Preserve context when switching, including when the keyboard is open. Keep lightweight action menus in popovers. Open content editing in a right-side dialog on desktop and a bottom sheet on mobile, as specified in KS-04; do not replace the existing mobile workspace navigation. Do not stack multiple competing navigation systems for the same two panes. The floating tutor used elsewhere in Languon is outside the main design scope.

KS-03 — DOCUMENT STATE AND PUBLICATION
Use one directly editable title, a quiet draft/saved status, a clear Save action and compact document actions. Optional language/category/summary metadata belongs in secondary disclosure.

Keep these concepts distinct:
- Working edits are privately recoverable; recovery/autosave is not publication.
- Apply accepts an AI proposal into the working draft. It does not publish.
- Explicit Save updates the saved material and what shared readers can access.
- Learning answers, hints, AI feedback and completion are personal activity. They never edit the author's content.

An Untitled draft can be written and discussed before Save. Saving requires a title and meaningful body content; a sheet containing learning blocks counts as content without an extra prose paragraph. Show new/empty, edited, recovering, saved, recovery failure, save failure and version-conflict states. Preserve work during errors. Offer readable conflict comparison and recovery rather than silently replacing content. Keep revision history and restoring a previous version secondary, with protection for unsaved work.

A blank sheet should feel inviting and calm: a writing placeholder and compact Add block / Insert from library entry points. Do not place audio setup explanations, large forms, empty management panels or unavailable copying controls above the title/body. Empty starter suggestions may be lightweight and should disappear once the sheet contains actual material, including custom blocks.

KS-04 — SHARED AUTHORING CHROME FOR ALL CUSTOM BLOCKS
The sheet supports prose plus six custom block families: video, vocabulary, bilingual text, audio comprehension, grammar, and exercises.

Every custom block uses the same authoring grammar:
- A small grip beside its heading selects the whole block and allows manual drag reordering.
- Whole-block selection has a clear, restrained outline. Dragging shows the moving block and a meaningful insertion position.
- An ellipsis button at the RIGHT of the heading opens an anchored settings popover. Common actions: Edit, Copy, Duplicate, Move up, Move down, Delete. Distinguish destructive actions and unavailable positions.
- The settings system accepts extra actions for particular block types. Do not create a separate management pattern for each family.
- Edit opens a focused RIGHT-SIDE DIALOG on desktop and a BOTTOM SHEET on mobile for EVERY custom block family. The document remains visible as context on desktop. Use the existing overlay primitives and a single active editor, not an embedded form or a giant settings popover. The dialog has the block title/type, type-specific controls, inline validation and Apply changes / Cancel. Long forms scroll within the editor with reachable footer actions; mobile can expand to full height for the keyboard.
- Edits stay local to the dialog until Apply changes updates the working draft; explicit document Save still publishes. Cancel preserves the original block. Confirm before discarding dirty edits on Escape, outside click or navigation; return focus to the invoking block/menu. AI-generated field changes have their own preview/accept step inside this editor (KS-22).
- Duplicate/copy preserves usable content but creates independent identities and no learner history. Dependency-bearing media/source exercises use an authorized preview/copy flow rather than a broken clipboard copy.
- Keyboard/menu movement provides an alternative to drag, including on touch devices. Deletion is undoable while editing.

Avoid an always-visible management list below the document, repeated edit/delete button rows, checkboxes on every block just to manage it, or a second copy of each block for administration. Heading, grip and ellipsis must align on one row; prose-editor typography must not leak margins into block UI.

Ordinary selected prose has a compact contextual toolbar for Ask tutor, Explain, Correct, Translate, Simplify, Rephrase, Examples and basic formatting. A caret, an empty selection, or a selected custom block must NOT display that prose toolbar. Do not show ghost toolbars above and below blocks. Selecting or moving a block must not be presented as changing its learning answers.

Include a learner preview so authors can inspect the sheet without authoring handles and settings.

KS-05 — WHAT THE AI KNOWS
The tutor is scoped to the current sheet. When an author sends a question it receives a snapshot of the complete current editor, including unsaved changes. It does not continuously watch typing. A selected passage can be the focus without discarding the surrounding sheet context.

The composer should communicate that context quietly: current sheet/source label, optional selected-passage chip and removable copied-reference chips. Existing dictionary entries and Text references can supply copied material. Distinguish the current document selection from a separately attached reference. Keep full material accessible through an expanded preview while using concise chips in the composer.

A shared reader's tutor sees authorized saved content and can explain or evaluate answers, but cannot edit the original sheet. Do not imply it can read other private sheets, private reader history, or the entire workbook's content. Workbook-wide AI context is deferred. If the source changes between turns, show a quiet provenance/update hint; historical replies remain associated with the material they answered rather than appearing to update live.

Offer the existing Auto / Explain / Correct / Practice modes and response preferences such as reply language, tone and explanation detail in compact settings. Respect the learner's existing preferences. Do not turn the composer into a model/provider control panel or ask learners to configure API keys.

KS-06 — CHAT LIFECYCLE AND CREDIT STATES
Show a readable conversation with compact source/context indicators, streaming answers, tool activity and a composer that remains usable at narrow widths. Differentiate the learner's question, the AI's explanation, a structured proposal and prepared material.

Design states for idle, submitting, queued, generating/reading source, streaming, preparing blocks, completed, interrupted/partial response, stopped and recoverable failure. Use honest progress labels rather than fabricated time estimates. Tool activity should be quiet and understandable, not expose internal schemas, agents or logs.

The backend owns an active request. Closing chat, changing layout, navigating back or reconnecting should not look like starting another request. Explicit Stop is separate. Preserve question/attachments after failure, and show a clear Retry action. Keep an output-limit state distinct from failure; Continue is an explicit new AI action when offered.

Credit handling belongs to the person requesting AI work: authors pay for authoring generation; readers pay for their own explanations, translations and answer checks. Prepared viewing/playback, prepared answers/hints and saving existing prepared content to a library do not require a new AI call.

Show the normal case without excessive billing chrome. If a reduced allowance requires confirmation, explain the available budget/output allowance BEFORE dispatch and offer Confirm / Cancel. Cancelling preserves the draft question. Handle insufficient credits, temporarily unavailable AI and capacity pressure separately. Preserve the user's work and offer the appropriate balance, retry or free prepared-content alternative. Do not label every error as a question that is too long; true size errors can involve document/context as well as the question. Never expose credentials or provider diagnostics.

KS-07 — AI PROPOSALS: REVIEW → APPLY → SAVE
AI proposes the same typed blocks the user can author manually. It never silently writes or publishes content.

A generated block group appears in chat as a structured proposal, with content-specific preview, type/count summary and one clear Apply to working draft action for that proposal group. Applying keeps the conversation and scroll context, adds the material to the sheet, and visibly confirms what was added. The sheet then remains an unpublished working draft until Save.

Do not wrap previews in several nested cards with repeated borders, padding and headings. Do not offer the acknowledgement “I prepared your vocabulary” as a second prose document-edit proposal when a structured proposal already exists. Ordinary explanations stay readable chat replies and do not require Apply.

For actual prose edits, preserve the separate editor proposal review: Insert at remembered cursor, Append, or Replace remembered selection, with original/current/proposed comparison where needed. Moving the caret during generation must not redirect a prepared replacement. A changed target or stale document requires comparison/regeneration rather than silently overwriting newer work.

Show proposal preparing, ready, expanded preview, applying, applied, stale and apply-failed states. Prevent duplicate Apply while pending/already applied. Preview may inspect prepared translations, reference answers, explanations and transcript/source material before accepting. Do not make an author solve an exercise to review its generated answer.

KS-08 — SAME CONTENT, DIFFERENT PRESENTATION CONTEXTS
Design a reusable block system with these variants:
A. Compact chat preview: efficient density, content-specific summary, enough real material to judge quality, and a clear full-preview affordance for long content.
B. Expanded proposal review: inspect the full proposed material and prepared settings/answers before applying.
C. Sheet authoring: full readable block with shared grip/heading/settings chrome and appropriate editing controls.
D. Learner study/practice: full learning interactions and private progress, without authoring chrome.

The same block should retain its identity and information hierarchy across variants; do not simply shrink the entire practice widget into a narrow chat column. Chat review is not a second practice session. In particular, a six-word vocabulary preview should show six compact source/translation pairs, not six enormous cards each requiring “Show answer” just to inspect the translation.

Content should expand or open a focused preview without losing the chat, pending proposal or document position. Large vocabularies, long texts and transcripts need sensible disclosure, not nested scroll areas inside every row. Clearly distinguish an unapplied proposal from a block already in the draft or saved sheet.

KS-09 — VIDEO BLOCK
Show title, safe player/poster, provider/source and optional transcript-related material. Supported video is YouTube embeds or direct browser-playable video URLs. Other providers remain ordinary links; do not offer arbitrary pasted HTML/embed code.

Allow explicit playback in chat previews, expanded reviews and the sheet; do not autoplay media in any preview. Playback and AI understanding are separate capabilities. A playable video does not imply that a transcript exists or that AI watched it. Grounded questions can be proposed from an available author-supplied transcript; automatic remote-video transcript access is not promised.

States: valid player, loading, unavailable/removed video, unsupported link, missing transcript, transcript available and safe source-link fallback. Keep a video's full transcript separate from a question's hint. Timestamped passages can offer replay; omit replay when timing is unavailable. Related exercises use the reusable exercise block. Editing the URL, title, description or transcript happens in the side dialog / mobile bottom sheet. Future transcript-plus-video-description comprehension is specified separately in KS-23; do not imply automatic video understanding.

KS-10 — VOCABULARY BLOCK
Show source and translation languages, terms and translations, with optional pronunciation, definition, example and translated example. Use an efficient list/table or appropriately sized rows rather than card-within-card nesting.

Reuse the existing Dictionary playback interaction: a small accessible Play action on a word and, where supported, its example sentence. Provide idle, preparing, playing, paused/stopped where supported, ended, unavailable and retry states; one active playback target at a time. Do not confuse playing a model pronunciation with assessing the learner’s pronunciation. Playback of prepared media has no new AI charge; generating missing speech follows existing speech capability/credit rules.

Author/proposal review exposes the prepared pairs. Study mode may conceal/reveal translations. Train launches existing Languon Cards or Sentence practice directly from the block; do not require saving a dictionary first and do not integrate an external Quizlet service. Practice is private to the learner.

Save to dictionary is optional: choose selected entries, create a new dictionary or add to an existing one, preview and confirm. Existing dictionary entries can also be inserted into the sheet as independent copies. Editing the saved dictionary never changes the original block.

Edit dictionary-like content in the block editor dialog/sheet, using focused entry/field controls rather than turning the inline block into a large form. Each eligible field can expose Check with AI, Generate translation or another specific supported action; see the atomic rules in KS-22.

States: one entry, six-entry compact preview, long list, translation revealed/hidden, entry selection for saving, destination choice, preview, saving/success/failure, unavailable practice preparation and sign-in required for saved personal activity.

KS-11 — BILINGUAL TEXT BLOCK
Preserve the original wording and paragraph/segment alignment. Offer Original and Bilingual views and a prepared-translation language choice. Parallel columns can work on wide screens; phones need readable aligned stacking or an equally clear alternative.

Author-prepared translations are shared material. A signed-in reader may request another target language as a PRIVATE translation paid from their credits. Label that personal overlay clearly; it does not edit the original or become visible to the author/other readers. Changing a private target language must not silently replace a different pending/previewed translation.

Provide playback for the original text or a selected sentence/snippet using the existing Texts speech pattern where compatible. Show precisely which passage and language will play. Preserve original/bilingual layout and reading position while playing. Do not invent synchronized word highlighting or universal translated-text speech where unsupported.

Authors edit source text, segments and prepared translations in the side dialog / bottom sheet. Authors can add/edit a prepared language without discarding the other prepared translations. Save to Texts creates an independent Text item or appends to an existing Text after preview. Inserting an existing Text into a sheet also creates an independent copy.

States: original-only, prepared bilingual, multiple prepared languages, missing requested language, private translation idle/quoted/generating/ready/failed/stale, sign-in/credit limitation, long text and library append preview. Do not overwrite original text or imply that library edits synchronize back.

KS-12 — AUDIO COMPREHENSION BLOCK
Combine a usable audio player with a title, source text where applicable, transcript availability, and related questions. Support uploaded audio, generated speech with its source text, and author-supplied transcripts. A microphone-recording feature is out of scope.

Audio preparation and transcript/source-text editing belong in the side dialog / mobile bottom sheet, not a permanently expanded setup area above the document. Upload needs choosing/validating/uploading/ready/failed states and clear invalid-file/size feedback with retry. Generated speech and uploaded-audio transcription are AI actions: preview/explicit Apply are required before changing authored material. Some processing capabilities may be unavailable; show a useful state without promising unapproved activation or a new service.

In learner practice, hide the full transcript initially. Provide separate Show transcript and Hint actions. A hint reveals only the passage relevant to that question, with Replay passage if timestamps exist. Transcript visibility, hint use, answer reveals and correctness are distinct. Do not reveal the full transcript automatically when checking an answer.

States: no audio yet, valid uploaded/generated audio, upload or processing pending, preview ready, failed processing, missing/manual transcript, hidden/full transcript, relevant hint snippet, timestamp replay, unavailable media and retry. A transcript or question must not appear grounded in a different/replaced recording. Pending preparation/preview must remain reachable even if another block is removed.

KS-13 — GRAMMAR BLOCK
Give grammar a distinct but restrained teaching UI, with optional sections:
- Rule or explanation.
- Formation / pattern.
- Examples with translations.
- Common mistakes, showing incorrect → correct and a short reason.

Use the common side dialog / mobile bottom sheet for changing sections and examples; eligible text examples may reuse the same explicit playback controls as other snippets. Use hierarchy and typography to make rules scannable; avoid a generic paragraph card, oversized empty sections or an unrelated color system. Hide absent sections cleanly. Related practice uses ordinary reusable exercise blocks. Saving grammar to a dedicated library is deferred; do not add an enabled Grammar library destination.

KS-14 — EXERCISES AND FEEDBACK
Support multiple choice, fill-in-the-blank and free-text answers. Every exercise has a reference answer and a short explanation. Source-grounded exercises can reference a text/transcript passage and optional media timestamps.

Exercises are playable INLINE in both collapsed and expanded forms. A collapsed item shows a concise task/title, type and private status without leaking answers; expanding reveals the task and answer controls in the document flow. Collapsing preserves the answer draft, attempt and feedback. Provide clear Expand / Collapse controls and a compact summary for exercise sets, with individual questions expandable. Do not send learners to a modal or separate training page to answer these exercises. Author editing still uses the common editing dialog.

Learners can attempt, retry, reveal the prepared answer/reason, or request AI feedback. AI feedback recognizes valid alternatives and explains briefly; identical wording is not required. Prepared answers and hints are available without an AI call. Make Reveal answer and Check with AI visually distinct and explicit.

Place Check with AI, Show answer and Hint beneath the task/answer area. Render the resulting short AI feedback, prepared answer with explanation, or relevant hint passage DIRECTLY BELOW that question in normal flow; allow replay beside timestamped hints. Label each result and preserve the learner’s answer alongside it. No toast-only feedback, detached chat response or answer-review modal. Expansion must not reveal an answer automatically.

Separate these states: unanswered, answer draft, saving attempt, attempted but unevaluated, checking with AI, correct, incorrect/needs revision, valid alternative, hint used, answer revealed, retry, and evaluation unavailable/failed. A saved free-text answer is not automatically correct or incorrect. Opening the block is not an attempt, and seeing an answer is not equivalent to answering correctly. Do not auto-reveal the reference answer just because an AI check failed.

Preserve the answer if AI is unavailable or credits are insufficient; offer the prepared reference path. In author review, show question, choices/blank, reference answer, explanation and grounding so the author can judge the material before Apply.

KS-15 — PERSONAL PROGRESS AND MATERIAL UPDATES
Each signed-in learner has separate attempts/progress; the author cannot inspect another reader's answers, hints or activity in this release. Anonymous readers can use prepared material without pretending their progress is saved. Sign-in is required for saved practice, AI assistance and independent copying.

Do not drop an early hint/reveal/retry while private state is loading: show a clear loading/disabled state until the action can be recorded. Let learners explicitly mark a sheet complete; merely opening it does not count. Workbook progress counts completed sheets, without grades, prerequisites or a teacher dashboard.

Material exercise changes create a fresh exercise version; retain historical attempts against their answered version. Unchanged exercises retain progress. Styling, moving a block or explanation-only corrections do not reset exercise progress. An explicitly completed sheet can show Updated since completion rather than silently losing its completion mark.

KS-16 — COPYING AND LIBRARY DIALOGS
Whole selected blocks copy with their settings, prepared answers/translations and usable media. New copies have independent identities and no learner history. Ordinary prose selections remain ordinary text copies. Uploaded audio in copied sheets remains usable independently; external videos still depend on their hosting service.

For media/source-linked blocks, show the existing preview-and-destination copy flow, preserving required dependencies. Do not offer a clipboard result that loses the recording or grounding passage. Show selection, destination, included dependencies, preview, confirmation, success, stale source/destination and recoverable failure.

Vocabulary can create/extend a dictionary; bilingual text can create/append a Text item. Saving prepared material is an independent copy operation, not an AI rewrite. Existing dictionaries/Texts can be inserted as copies. Make the destination and independence clear without presenting database IDs or synchronization controls.

KS-17 — ORDERED WORKBOOK CONTEXT
A sheet belongs to at most one workbook; standalone sheets remain valid. Show ordered membership, previous/next navigation and a compact way to reorder sheets. Reuse in another workbook creates an independent copy rather than a second live membership.

Support copying a whole workbook as an independent ordered collection. Workbook copies use saved material: an owner's unsaved member blocks copying with Save-first guidance; shared copying includes authorized saved material without exposing private draft inventory. Keep progress/chat history out of copies.

Deleting a workbook defaults to dissolving the group while keeping its sheets. Deleting the sheets is a separate explicit destructive choice. Course generation, workbook-wide AI context and enforced lesson sequencing are not part of this design.

KS-18 — SHARING AND ROLE BOUNDARIES
Private by default, revocable unlisted links, no public discovery. A sheet or workbook can be shared. Anonymous reading works; signed-in shared readers can save their own practice, use read-only AI and create independent copies. Editing the author's material requires making a copy first.

A shared reader never sees author drag handles, editable source controls, Apply-to-original proposals or other learners' progress. Their AI can explain/evaluate but cannot change the sheet. Make personal translations/activity visibly private where confusion is likely.

Shared links expose saved material only. Adding a sheet to an already shared workbook needs a clear access notice. Removing it removes workbook-derived access; an independently shared sheet link remains separate. An author's later explicit Save updates shared material; previously created copies remain unchanged.

Show access revoked, deleted source and expired/unavailable link states without displaying retained source excerpts. Shared-source chats, attempts/progress and private translations become unavailable when access is revoked and are removed on permanent source deletion. Independent copied sheets and saved library items survive. Do not invent a public feed, collaboration cursors, teacher submissions or owner-visible reader analytics.

KS-19 — STATE BOARD AND RECOVERY
Create a compact state board rather than a separate full screen for every edge case. Cover:
- Empty, loading, recoverable error and ready content.
- Private draft recovery versus explicit saved/shared publication.
- Prose selection versus whole-block selection, dragging and contextual menu open.
- Queued/streaming/stopped/interrupted AI, saved question draft and retry.
- Proposal ready/applied/stale/apply failure; source changes during generation.
- Credit confirmation, insufficient credits and temporarily unavailable capability.
- Missing translation/transcript, unavailable media and upload/processing failure.
- Unsaved navigation, conflicting edits, stale copy destination and revision restore.
- Private-progress loading, unevaluated attempt, hint/reveal/correctness and retry.
- Anonymous versus signed-in shared access, access revocation and Updated since completion.

Keep recovery actions near the affected material, preserve local work and explain what will happen. Do not present internal stack traces, routing IDs, token accounting, API configuration or implementation terminology as product UI. Treat pasted/AI content as untrusted content: no raw embed-code editors, executable markup previews or script-capable widgets.

KS-20 — VISUAL DIRECTION, RESPONSIVENESS AND ACCESSIBILITY
Aim for a calm, mature study workspace: excellent typography, efficient reading widths, restrained indigo accents, soft neutral surfaces and clear action hierarchy. Avoid excessive cards/borders/padding, especially around chat proposals and individual vocabulary rows. Use spacing for hierarchy rather than wrapping every child in another card. Distinguish block families through content structure, labels and subtle iconography, not rainbow decoration.

Stay compatible with Languon's current language: light background around #f8f9fb, white surfaces, #1b1e24 text, #e4e7ec borders and #4f46e5 accent; dark background #121417, surfaces #1b1e24 and accent #818cf8. Use the supplied app reference if available. Otherwise use a coherent sans-serif prototype baseline such as Inter, consistent line icons and a small reusable token scale. Do not pause for an unavailable design-system URL or invent an existing design approval.

Apply these visual principles to the NEW blocks and overlays, matching the existing design rather than repainting the surrounding workspace. Show approximately 1440px desktop, a narrower split workspace, and 390px mobile. Content must tolerate long titles, translated UI labels and mixed-language material. Include French learning content with Russian translations and an English interface; demonstrate long Cyrillic strings and sensible language direction. Keep native text selectable and original text readable.

Provide keyboard focus, accessible labels, logical reading order, popover Escape/focus return, keyboard movement alternatives, non-color-only feedback and comfortable touch targets. Respect the mobile keyboard/safe area and reduced motion. Do not rely on hover for essential controls or let overlays cover Save, the active answer or the composer.

KS-21 — REQUIRED DESIGN OUTPUT
Produce a coherent high-fidelity interactive prototype using local demo state; no live AI, credentials or backend integration is needed. Keep demo-only state/role toggles in a separate prototype-controls area, outside the learner-facing interface. Show realistic content and working demonstrations of the primary transitions, not only a static happy path.

Required frames/flows (focus on new components and overlays inside the supplied existing design; role/workbook/error examples may be small component states, not new screen redesigns):
1. Existing desktop chat/editor design with the new block extension placed into it; annotate preserved shell versus new components. Include only enough shell to demonstrate integration.
2. The six-word French/Russian vocabulary request: queued/generating → compact readable proposal → full review → Apply to draft → explicit Save. No duplicate prose suggestion.
3. Selected custom block with grip, heading-right ellipsis, drag/reorder, desktop side-dialog editor and mobile bottom-sheet editor. Demonstrate manual field edit and atomic AI preview → accept field → apply block changes → document Save, plus Cancel and stale-field recovery.
4. A reusable component comparison for ALL SIX block families across compact chat, expanded review, authoring and learner variants. Prepared answers/translations are inspectable in review.
5. Inline collapsed/expanded exercises for multiple choice, blank and free text: enter answer → AI check → feedback below task; hint snippet/replay, separate transcript reveal, prepared reference and retry. Preserve answer state on collapse. Include a compact exercise-set summary.
6. Shared anonymous and signed-in reader views, private translation/progress, copy-to-edit and revoked access.
7. Relevant existing workbook/share/library entry points only as context for block actions; demonstrate dictionary/Text destination previews without redesigning these existing areas.
8. Recovery/availability state board from KS-19, including a changed proposal target and an interrupted AI response with the question preserved.
9. Mobile document and tutor, keyboard-open composer, selected block/menu and a focused editing/preview flow.
10. New block and side-dialog/bottom-sheet components in existing dark styling. Show word/snippet playback in both chat preview and sheet, including unavailable speech.
11. A SEPARATE, clearly labeled future-capability concept board for pronunciation assessment, transcript-plus-description video/audio comprehension and question difficulty. This board is not launch UI and must not imply available recording or assessment services.

Use realistic examples throughout: travail → работа; joie → радость; ménage → уборка; carrelage → плитка; poisson → рыба; nourriture pour animaux → корм. Include a short French original with aligned Russian translation, a grammar pattern with translated examples, and a prepared audio transcript with two questions. Do not claim a remote video was automatically understood.

Provide a short map from KS-01–KS-23 to frames/components, identify any intentionally unavailable capabilities, and explain key visual/interaction decisions. Offer an editable prototype/preview link if your tool supports it.

KS-22 — ATOMIC AI ACTIONS IN BLOCK EDITORS
Reuse existing Dictionary/Text interaction patterns for field-level work. A user can check a selected term, translation, definition, example, translated example or text snippet with AI, or generate a missing translation where supported. Label actions by their scope, such as “Check translation” or “Generate Russian translation”; avoid a vague whole-block “Improve everything” action. Other block types use the same extensible mechanism for eligible fields, without inventing unsupported AI services.

An atomic action captures its target entry/field, language and current value. Only that field gets loading and feedback; unrelated entries/fields stay intact and usable. Checking can return “Looks correct”, a short explanation, or a suggested replacement. Generation returns a proposed value. Show current versus proposed value and Accept / Dismiss beside the field or in a focused diff within the editor. Never silently overwrite content, rewrite every dictionary row, replace another language or apply a result to a different field after selection changes. “Looks correct” is feedback, not a content mutation.

Accept updates only that field in the dialog draft; Apply changes commits the edited block to the sheet draft; Save publishes. If the target field/source changed during the request, mark the result stale and offer compare/recheck instead of overwriting. Canceling/dismissing the editor cannot allow a late result to modify the sheet. Show generating/checking, cancelled where supported, successful check, suggested correction, accepted/dismissed, failure/retry, stale and credit/unavailable states. Failed requests preserve both manual edits and earlier proposals. Authoring calls use the author’s credits. Shared readers cannot invoke mutations on the source; their private translation and answer-check paths remain separate.

KS-23 — FUTURE EXTENSION CONCEPTS, NOT IMPLEMENTED CAPABILITIES
Reserve a coherent extension pattern for later pronunciation and listening/video assessment. Do not enable unavailable features in the launch prototype or claim they are already implemented. Keep these concepts on a separate future board and visually distinguish them from current supported controls.

Pronunciation: distinguish Listen to reference from future Practice pronunciation / AI pronunciation check. Conceptually show permission/requested input, recording or audio submission, processing, transcript/recognized speech where available, constructive pronunciation feedback and retry. Microphone capture and pronunciation assessment are future work, not an enabled launch control. Do not invent scoring scales, reliable phoneme highlighting or supported languages. AI assessment concerns the learner’s private attempt and never edits source content.

Audio/video comprehension: plan an author editor for transcript plus video description/context and an AI-generated SET of related questions. Display the source basis explicitly: transcript, author-supplied description and any available timestamps. A description gives supplementary context; it does not establish that AI inspected video frames or audio. Missing source context should ask for preparation rather than fabricate grounded questions. Generated sets are reviewable with reference answers, explanations and relevant hint passages before explicit Apply. Learners answer each question inline, use hints/replay and receive private AI feedback below it. Replacing source media/transcript must expose stale questions and use the established material-version rules.

Question difficulty is a later authoring parameter: reserve a compact optional control in question-generation settings, not a new global course level. Illustrate progressively deeper comprehension (direct factual recall → inference → interpretation with source evidence) as conceptual examples; final levels, labels and assessment policy remain to be defined. Difficulty must affect the proposed question set and be visible during review, without introducing grades, prerequisites or course generation.

Explicitly out of scope for launch: course/lesson generation, group-wide AI context, grading/prerequisites, teacher dashboards/submitted assignments, grammar-library saving, automatic remote-video understanding, microphone recording/pronunciation assessment, question-difficulty configuration (future concept board only), arbitrary embed code, external Quizlet integration, provider onboarding and public social discovery. Keep the architecture visually extensible without designing those products now.
```

## Review checklist

- **KS-01–03:** Product context, workspace hierarchy and private draft / Apply / Save boundaries remain clear.
- **KS-04:** All custom blocks share selection, drag and extensible heading-right settings; prose actions never appear for block selection.
- **KS-05–07:** Send-time source context, shared-reader limits, AI lifecycle, requester credits and explicit proposal acceptance are represented accurately.
- **KS-08:** Compact chat, expanded review, sheet authoring and learner variants preserve content while adapting density.
- **KS-09–14:** All six block families include their distinctive content, editing, review, practice and unavailable states.
- **KS-15–16:** Private progress, exercise versions, independent copies, media dependencies and library preview/commit are preserved.
- **KS-17–18:** Workbook order, saved-only sharing, role boundaries and access/deletion lifecycle remain truthful.
- **KS-19–20:** Recovery, stale state, accessibility, localization, responsive layouts and dark mode are designed.
- **KS-21:** Extend the supplied existing design; do not redesign the shell. Show block playback, desktop side dialogs, mobile bottom sheets and inline collapsed/expanded practice.
- **KS-22:** Field-level AI preview/accept preserves unrelated content; dialog Apply and document Save remain distinct; stale results cannot overwrite newer edits.
- **KS-23:** Pronunciation, richer video/audio assessment and difficulty live on a clearly separate future concept board, with no claim of current implementation.

## Source state and limitations

Revision v003 incorporates the user’s additive-design clarification: preserve the existing chat/editor design; add custom-block playback, atomic AI field actions, side-dialog/mobile-sheet editing and inline exercises. These are design requirements, not a claim that all corresponding runtime capabilities exist. Future pronunciation, richer video comprehension and difficulty are concept-only. No application changes are authorized or made by this documentation update.

This brief is grounded in commit `def891808c6995efb0d5aac107422419f4eef184`, including
the reviewed block-control and chat-continuation repairs. It specifies the approved
F059 product scope; it does **not** claim the entire feature is complete or every
AI/media capability is activated. Transcription activation/provider approval and
other feature-wide delivery work remain pending. Design the unavailable states;
do not onboard or assume a new provider.

The earlier [workspace brief](./knowledge-workspace-detail.md) and
[tutor brief](./contextual-assistant-widget.md) provide historical layout context.
This new brief owns the interactive-block extension; their historical exclusions
of media do not remove the authorized F059 block scope. Their snapshots and
selected implementation pointers remain unchanged.

Authoritative references:

- [F059 specification](../../.agent/features/059-interactive-workbooks/FEATURE.md),
  [plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md),
  [evidence](../../.agent/features/059-interactive-workbooks/EVIDENCE.md) and
  [review](../../.agent/features/059-interactive-workbooks/REVIEW.md).
- [Interactive workbook user flow](../user-flows/interactive-workbooks.md) and
  [knowledge workspace user flow](../user-flows/knowledge-workspace.md).
- [ADR-0050: content and learner boundaries](../adr/0050-interactive-workbook-content-and-learning-boundaries.md).
- Existing runtime tokens in `apps/web/src/app/globals.css`, shared Menu/Popover
  primitives, `entities/learning-blocks`, Knowledge authoring and tutor components.
- [Verified desktop block controls](../../.agent/features/059-interactive-workbooks/evidence/block-controls-and-continuation/editor-inline-block-settings.png)
  and [mobile controls](../../.agent/features/059-interactive-workbooks/evidence/block-controls-and-continuation/editor-block-settings-mobile.png)
  are source context, not a requirement to preserve the current visual treatment.
