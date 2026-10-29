# Interactive knowledge workbooks

Status: In progress — independent review remediation and final verification
Owner: Engineering agent
Created: 2026-10-28

## Problem

Static knowledge notes cannot compose reusable interactive learning material or
retain private learner activity across shared, ordered study documents.

## Desired behavior

Owners author interactive knowledge notes manually or with reviewed AI proposals,
organize them into ordered workbooks and share saved content. Learners practice
privately, copy reusable content and save vocabulary/text into their own libraries.
This is the foundation for later generated lessons, not course generation itself.
The user confirmed the complete interview scope on 2026-10-28; the interview's
older pending-confirmation wording is historical, not a new approval requirement.

## Acceptance criteria

- AC-1 — **Reusable blocks:** Knowledge notes support video, vocabulary, bilingual text, audio comprehension, grammar and exercises. Each block retains its presentation and basic interactions in an independent learning context, with no dependency on the knowledge editor.

- AC-2 — **Manual authoring:** An Add block menu and type-specific controls allow manual creation/editing, reorder, duplication, deletion and learner preview. Custom blocks share whole-block selection, manual drag reordering and a heading-right extensible settings popover for editing, copying, duplication, keyboard movement and deletion. Existing prose, private drafts, conflict recovery, explicit Save and revision behavior remain usable.

- AC-3 — **AI proposals:** AI generates the same structured blocks as manual authoring, previews changes and requires explicit Apply. Apply changes only the working draft; Save publishes. Explanations require no Apply. Stale targets cannot silently overwrite newer content.

- AC-4 — **Workbooks:** An owner orders notes in a workbook and navigates previous/next. Each note belongs to at most one workbook; standalone notes remain supported. Deleting a workbook defaults to retaining its notes; deleting notes is a separate explicit choice.

- AC-5 — **Sharing:** Notes and workbooks are private by default with revocable unlisted links and no public discovery. Anonymous reading exposes saved content only. Workbook access includes later saved additions with a clear notice; removal ends workbook-derived access without invalidating an independent note link.

- AC-6 — **Shared learning authority:** Signed-in shared readers can practice, request explanation/evaluation and private translations without copying. Server authorization prevents them and their AI tools from editing original content. Copying, saved practice and AI require sign-in.

- AC-7 — **Independent copies:** Users copy a whole note, a whole ordered workbook or selected complete blocks. Copies preserve content/settings/answers/translations and usable uploaded media, but receive fresh exercise identities and no original chats, revisions or learner history. Ordinary text selections copy as text. Completed copies survive original changes/revocation/deletion.

    Workbook copying uses explicitly saved material. An owner's copy is blocked
    with a clear notice when any member is still a draft, rather than silently
    omitting it. Shared copies include only currently authorized saved members;
    they do not disclose private drafts or publish them implicitly.

**AC-7 publication boundary:** Copying an owned workbook requires every member note to have been explicitly saved; an unsaved member blocks the entire operation with a clear notice. No member is silently omitted or implicitly published. Shared-workbook copies include exactly the saved material available through that share and reveal no private draft inventory.

- AC-8 — **Vocabulary:** Vocabulary blocks launch existing Languon flashcard and sentence practice directly without requiring library saving. Selected prepared entries can create a dictionary or extend an existing dictionary as independent copies. Existing dictionary entries can be inserted into notes as copies. Publication is atomic and retry-safe, without unnecessary AI generation.

- AC-9 — **Text library:** Text blocks create independent Text items or append to existing Texts through preview and explicit commit. Copies preserve valid source/translation alignment and use fresh inserted identities. Existing Texts can be inserted into notes as independent copies.

- AC-10 — **Bilingual reading:** Original-only and bilingual views preserve original wording. Author-prepared translations are shared; reader-requested target-language translations are private, billed to the requester and do not mutate the note.

- AC-11 — **Grammar:** Grammar has a distinct UI with optional rule, formation/pattern, translated examples and common-mistake sections. Related exercises use reusable exercise blocks. Grammar-library saving is deferred.

- AC-12 — **Media playback:** Video supports validated YouTube embeds and direct browser-playable URLs. Other providers remain ordinary links; arbitrary embed code is forbidden. External-media unavailability is explicit and does not imply successful AI understanding.

- AC-13 — **Audio:** Authors upload audio with transcription, generate speech from text through compatible speech capabilities, or supply transcripts. Uploaded assets copied independently remain playable after original deletion. Private draft assets cannot leak through shared saved documents.

- AC-14 — **Grounded comprehension:** Audio questions derive from available transcripts. Practice initially hides the full transcript; Show transcript and Hint are separate actions. Hints reveal relevant transcript passages and offer timestamp replay when available. No claim of fetching or understanding remote video is made without supported processing.

- AC-15 — **Exercises:** Multiple-choice, fill-in-the-blank and free-text exercises have a reference answer and short explanation. Learners can reveal the prepared answer or request AI evaluation, which recognizes valid alternatives. Retries are available.

- AC-16 — **Private learning state:** Signed-in attempts and progress persist separately from author content. Authors cannot inspect readers’ answers, progress, private translations or AI chats. Attempted, hint used, answer revealed and answered correctly remain distinct observations.

- AC-17 — **Versioning and completion:** Question, choices, accepted answers, criteria and source passage/audio changes create a new exercise version. Styling, movement and explanation-only corrections retain progress. Historical attempts remain bound to answered versions. Completion is explicit, opening is insufficient, and changed completed notes show updated since completion. Workbook progress counts completed notes without grades/prerequisites.

- AC-18 — **Access lifecycle:** Loss of source access makes shared-source chats and practice history unavailable. Permanent note deletion removes associated shared-source chats, attempts, progress and private translations while retaining independent copies and library items. Concurrent access/copy/delete races cannot expose revoked content or corrupt copies.

- AC-19 — **AI accounting:** The requesting signed-in user pays for generation, transcription, translation and evaluation under existing bounded action, tariff, admission, cancellation and settlement policies. Prepared content playback/viewing and answer reveals need no AI call. Shared readers never charge the author implicitly.

- AC-20 — **XSS and input security:** Server-validated structured blocks, safe rendering and restricted attributes/URL schemes prevent scripts, event handlers, executable URLs and arbitrary embeds from executing across editing, paste, AI proposals, persistence/reload, translations, copying and shared views. Supported players use validated identifiers and constrained browser policy.

- AC-21 — **Upload and agent security:** Uploads and any server-side retrieval enforce bounded supported input, protected storage/access and private-network protection. Untrusted learning material cannot change agent permissions. Authorization covers every source/destination/media/private-state operation, including retries and stale proposals.

- AC-22 — **Verification and compatibility:** Existing notes and practice journeys remain functional. Accessible responsive runtime behavior, localized controls, real database migrations/invariants, security regressions, production-composition AI execution tests, required critical gates and independent source/security/final-evidence review all pass before completion.

## Scope

All ACs above are one authorized feature delivered in six milestones. Web, API,
worker and persistence surfaces are in scope; reusable contracts do not authorize
an unrelated mobile redesign. No supplied visual design requires fidelity.

Out of scope: course/lesson generation, group-wide AI context, teacher dashboards,
submitted assignments, course grading/prerequisites, grammar-library saving,
external Quizlet integration, microphone recording and automatic remote-video
understanding. Do not drop uploaded-audio transcription because it needs onboarding.

## Constraints and risks

- Preserve existing saved-only publication and private draft/chat boundaries.
- Extend existing credit/execution authority; do not create parallel wallets/pools.
- Transcription uses a fixed reviewed capability and native duration authority.
  Activation requires explicit account-processing and compatible billing evidence;
  no default tariff or production provider activation is inferred.
- Partially supersede ADR-0042 explicitly for shared AI and media; do not rewrite
  its accepted decision. Other accepted constraints remain binding.
- AI specialist tools/subagents are an implementation option, not permission to
  bypass content approval, caller budgets or source authorization.

## User-flow documentation

A new browser/API/system guide `docs/user-flows/interactive-workbooks.md` is
required. Related mapped guides: knowledge-workspace,
contextual-language-assistant-and-knowledge, texts, dictionary-platform,
flashcard-training-web/backend, sentence-practice-web/backend,
shared-pronunciation-playback, ai-accounting and affected provider/admin guides.
Update only actually affected behavior/source mappings after implementation.
Exact existing mappings and proposed new scenarios are recorded in EXEC_PLAN.md.
Guides stay draft until executable tests and real evidence exist.

## Open decisions

No unresolved product scope decision prevents discovery/implementation. Technical
architecture, transcription onboarding and exact resource bounds require evidence
before dependent implementation, with strategic commitments escalated if needed.

## Source decisions

[Confirmed interview](../../../docs/interactive-workbook-discovery.md), Q1–Q25
plus explicit XSS requirement; [glossary](../../../CONTEXT.md).
