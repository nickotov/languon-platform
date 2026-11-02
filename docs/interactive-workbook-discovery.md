---
type: reference
title: Interactive workbook discovery decisions
---

# Interactive workbook discovery

Product interview confirmed on 2026-10-28. This records confirmed intent, not implemented
behavior or an accepted architecture decision. Existing ADRs remain active until
explicitly superseded. Implementation is authorized and tracked in
[feature 059](../.agent/features/059-interactive-workbooks/FEATURE.md).

## Confirmed decisions

- Q1: One feature delivered in milestones includes video, vocabulary, bilingual
  text, audio comprehension, grammar, exercises, ordered workbooks and sharing.
  Blocks must retain their UI and basic functionality in other contexts.
  Course generation and workbook-wide AI context are separate future work.
- Q2: Shared readers can practice and ask AI for explanation/evaluation without
  changing author content. Editing requires an independent copy.
- Q3: Signed-in learner attempts and progress persist separately from content;
  retries are supported. Course grading is deferred.
- Q4: Private by default, revocable unlisted links, no public discovery. Reading
  requires no account; saved practice, AI and copying require sign-in.
- Q5: A workbook is ordered, with previous/next navigation. Each knowledge note
  belongs to at most one workbook; standalone notes remain supported.
- Q6: AI content changes require a preview and explicit apply action.
  Explanations do not require application. Existing explicit Save remains distinct.
- Q7: Library saving creates independent copies. Vocabulary creates a dictionary
  or adds selected entries to an existing dictionary. Text creates a Text item
  or appends to an existing one with a preview. Neither side synchronizes edits.
  Grammar blocks are reusable; grammar-library saving is deferred.
- Q8: Explicit Save updates shared content. Preserve attempts against their
  answered version. Material exercise changes allow fresh attempts; unchanged
  exercises retain progress. Independent copies are unaffected.
- Q9: Workbook sharing covers its saved notes, including later additions with a
  clear notice. Removal ends workbook-based access; separate note links remain
  independent.
- Q10: Playback is separate from AI understanding. Comprehension questions must
  be grounded in an available transcript. Initial sources include uploaded audio
  transcription and author-supplied transcripts. Automatic remote-video/YouTube
  interpretation requires separate research and is not promised. Hints reveal
  relevant transcript passages, with timestamps where available.
- Q11: Multiple choice, fill-in-the-blank and free-text exercises each include a
  reference answer and short explanation. Learners can reveal answers or request
  AI feedback, which must recognize valid alternatives.
- Q12: Use Languon flashcard and sentence practice, not external Quizlet
  integration. The requesting signed-in user pays for AI under applicable credit
  policies: author generation versus reader explanation/evaluation. Prepared
  content and answer reveals need no AI call.
- Q13: Every block supports manual creation and editing through Add block,
  type-specific controls, reorder, duplicate, delete and learner preview. AI
  proposes the same block types.
- Q14: Author-prepared translations are shared. Readers may request private
  translations in another language using their own credits. Original-only and
  bilingual views preserve the source wording.
- Q15: Audio supports uploads with transcription, speech generated from text
  using compatible existing capabilities, and author-supplied transcripts.
  Microphone recording has not been requested.
- Q16: Grammar blocks have optional rule, formation/pattern, translated examples
  and common-mistake sections, with distinct presentation. Related exercises use
  the reusable exercise blocks; grammar-library saving remains deferred.
- Q17: Shared-source conversations and practice history become unavailable while
  source access is revoked. Independent copies and saved library items survive.
  Permanent source deletion requires an explicit cleanup policy.
- Q18: Attempted, answer revealed and answered correctly are distinct states.
  Learners explicitly mark notes complete; opening a note does not complete it.
  Workbook progress counts completed notes, without grades or prerequisites.
- Q19: Copying selected complete blocks preserves settings, prepared answers,
  translations and usable media, but creates fresh exercise identities without
  learner history. Plain text selections copy as plain text. Whole workbooks can
  be copied as independent ordered collections.
- Q20: Authors cannot inspect readers' attempts, progress or AI conversations.
  Teacher dashboards and submitted assignments are deferred.
- Q21: Permanent note deletion removes associated shared-source conversations,
  attempts, progress and private translations; independent copies/library items
  survive. Default workbook deletion dissolves the group and retains notes;
  deleting notes requires a separate explicit choice.
- Q22: Question, choices, accepted answers, evaluation criteria and source
  passage/audio changes create new exercise versions. Styling, movement and
  explanation-only corrections retain progress. Historical attempts retain their
  answered versions. Completed notes show updated-since-completion when changed.
- Q23: Video support includes YouTube embeds and direct browser-playable URLs.
  Other providers remain links; arbitrary embed code is excluded. Copied uploaded
  audio survives source deletion; external media depends on its hosting service.
- Q24: Practice hides full transcripts initially, with separate transcript and
  hint actions. Hints reveal relevant passages and timestamp replay where
  available. Hint use, answer reveals and correctness are separate observations.
- Q25: Vocabulary blocks launch flashcard/sentence practice without library
  saving. Existing dictionary entries and Texts can be inserted as copies.
- Explicit user requirement: account for XSS and prevent executable content from
  entering learning-block, sharing, copying and AI-generated-content surfaces.

## Security acceptance requirements to carry into the specification

- Validate structured blocks and attributes at server boundaries; never trust
  AI output, clipboard payloads, transcripts or previously saved content.
- Render text as text; restrict supported markup and URL schemes. Do not accept
  arbitrary scripts, event attributes, HTML embeds or executable URL payloads.
- Construct supported player embeds from validated provider identifiers; bound
  permissions and loading policy. Treat direct-media URLs as untrusted input.
- Protect upload handling and any server-side media retrieval against unsafe
  types, oversized inputs and access to private network resources.
- Recheck source/destination authorization for media, sharing, copy, library
  save and private learner data. Content instructions cannot grant agent tools
  editing rights; shared chat tools must enforce read-only content authority.
- Add malicious-content regressions for render, persist/reload, AI proposals,
  paste/copy, translations and shared views. Require independent security review
  and real-browser verification, including applicable CSP/player boundaries.

## Engineering discoveries

- Existing speech generation is dictionary-bound. Reuse adapters and accounting,
  but add a correctly authorized knowledge-block source.
- No speech-to-text implementation was found in scoped source discovery.
  Uploaded-audio transcription requires provider research/onboarding, execution
  and pricing integration. Existing vocabulary transcription means phonetics.
- Existing object storage does not establish independent knowledge-media copy
  ownership. Copies must retain usable assets without exposing private drafts.
- Text append needs alignment-preserving identities and atomic preview/commit;
  vocabulary saving needs atomicity/idempotency without unnecessary generation.

## Existing constraints to reconcile

- [ADR-0042](adr/0042-knowledge-workspace-document-and-context-boundaries.md)
  requires copying before tutor use and defers media. The agreed extension needs
  an explicit partial supersession; do not silently rewrite that accepted ADR.
- [Glossary](../CONTEXT.md) retains Knowledge note as the document identity.
- Shared publication excludes private drafts, chats and attachments.

## Remaining discovery

The user confirmed shared understanding and implementation on 2026-10-28.
Bounded transcription-provider research and detailed engineering design remain;
microphone recording is not in confirmed scope. Security requirements above are
implementation targets, not claims of implemented or verified protection.
