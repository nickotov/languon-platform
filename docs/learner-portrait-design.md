---
type: design
title: Learner portrait and AI interview design discovery
status: approved
summary: Approved product decisions; backend implementation and versioned design brief are tracked in feature051.
---

# Learner portrait and AI interview

This is design discovery for an explicitly requested new feature, using
GrillMe grill-with-docs. It is not an implementation plan or a completion
claim. All thirty product questions were resolved. The user finalized the plan and
authorized implementation on 2026-10-20. [Feature051](../.agent/features/051-learner-portrait/FEATURE.md)
owns delivery and acceptance evidence. The [design brief](design-prompt/learner-portrait.md)
is ready for Magic Patterns; UI implementation awaits its returned selected design.

## Approved design

Launch an optional learner portrait in the web app, accessible from dashboard
and settings and usable in dictionary, text, and Knowledge chats. A guided
3–5-minute interview or manual form produces editable items and a consistent,
friendly description. It captures stated learning needs and preferences, not
psychological diagnoses. The learner reviews and saves a draft, then separately
enables use; later updates need approval too.

Global off overrides every chat, and individual chats can exclude the portrait.
Explicit requests/manual overrides win. Existing chats retain their settings
until explicitly switched to portrait preferences; new chats inherit enabled
portrait preferences with visible overrides and manual fallback. Changes apply
to the next message without interrupting admitted work or pretending earlier
history has forgotten personal context.

One interview can resume across devices. Approval/discard removes its transcript
and draft; 14 days of inactivity expires unfinished work. Portrait deletion
removes approved and draft portrait data and disables use without deleting
ordinary chats. Conflicts and pending work cannot silently overwrite or
recreate approved/deleted state.

Custom answer fields allow 200 user-perceived characters. Interview chat allows
1,000; answers supplied there become reviewable summaries of at most 200.
Ordinary learning-chat limits do not change. The portrait summary targets
100–180 words when enough information exists, without padding sparse profiles.

Existing AI charging rules apply unless server-only
`AI_INTERVIEW_CREDITS_BYPASS` (default false) is enabled. That policy removes
interview credit-balance requirements, wallet holds, and user charges while
preserving usage/cost accounting and execution limits. The notice reflects
paid/free status; manual actions do not invoke AI. Native mobile, automatic
content generation, courses, teacher-to-student personalization, and a potential
credit-pack-funded allowance remain future work.

## Intended outcome

Help AI assistance explain language in ways appropriate to the learner's
preferences, needs, background, and goals. The requested entry points are the
dashboard and settings. The learner can return to the interviewer to propose
updates. Questions should offer suggested answers and allow custom responses
and clarifying questions. The opening explanation describes the process
and its purpose; the approved content baseline is included in the design brief.

The requested result is a friendly, descriptive but concise portrait, reusable
across agent chats, with the ability to disable use and retain manual chat
configuration. Future guided tutoring, lesson/course generation, and teachers
preparing material for another learner are design considerations, not current
delivery scope. A future recipient's needs must not be confused with the
requesting teacher's preferences.

## Confirmed decisions

Confirmed by the user in interview round 1 on 2026-10-20:

- **LP-01 — Confirmed needs rather than diagnoses.** Capture concrete learning
  needs and preferences. The interviewer may suggest an interpretation for
  confirmation but must never infer a diagnosis. Useful accommodations must
  not require disclosure of a condition. LP-06 resolves diagnostic labels in
  the reusable portrait; LP-10 resolves the interview transcript lifecycle.
- **LP-02 — Short optional core.** Target a 3–5-minute core interview, with
  skippable questions and optional deeper exploration. Partial answers can
  produce a useful portrait; unanswered areas remain unknown. Learners can
  return later to enrich it. LP-09 defines the core fields; LP-17 defines early
  review and LP-20 defines the shared resumable interview. LP-23 requires at
  least one meaningful item; exact interruption recovery is delivery design.
- **LP-03 — Review before effect.** Produce a draft for review, correction,
  and explicit approval. Proposed updates leave the previously approved
  portrait active until approval. Creating/approving a portrait and enabling
  its use are separate choices; an update must not implicitly re-enable use
  when the learner has disabled it. LP-11/23 establish explicit Save and
  separate use enablement.

Confirmed by the user in interview round 2 on 2026-10-20 (Q5–Q8; Q4 was
not answered):

- **LP-04 — Disable future portrait supply, retain chat history (Q5).**
  Disabling use stops supplying the portrait on subsequent requests while
  retaining existing conversation history. Clearly explain that earlier
  messages and memory may still contain personal context, and provide an
  easy way to start a fresh chat. Do not imply existing conversations have
  forgotten that information. LP-12 resolves in-flight request semantics.
- **LP-05 — Editable items and a consistent summary (Q6).** Present a readable
  summary alongside editable confirmed items such as languages, goals, tone,
  and explanation style. Learners can correct or remove items directly or
  use the interviewer. The description must remain consistent with confirmed
  items. LP-09 defines the core fields; LP-15 resolves direct-edit summary
  consistency and approval.
- **LP-06 — Accommodations without diagnostic labels (Q7).** When a learner
  volunteers a diagnosis and an accommodation, retain the confirmed
  accommodation, such as short steps and reminders, and exclude the
  diagnostic label from the reusable portrait. This decision does not settle
  retention of the original interview messages.
- **LP-07 — Bounded interviewer with Knowledge redirect (Q8).** The interviewer
  can explain questions, give examples of learning approaches, and help users
  articulate preferences. For other requests, briefly redirect and offer to
  continue or pause the interview. By default propose a link to `/knowledge`,
  where the learner can start a new document with AI chat. Ordinary
  conversation must not silently become portrait facts. This redirect does
  not itself authorize automatic document creation or conversation transfer.

Confirmed by the user in interview round 3 on 2026-10-20 (Q4, Q9–Q11):

- **LP-08 — Explicit chat choices win (Q4).** Explicit requests and chat
  overrides take precedence over portrait preferences. Manual controls remain
  available while portrait use is enabled. Disabling portrait use preserves
  manual settings. The portrait does not choose Explain/Correct/Practice mode.
  Distinguishing inherited defaults from explicit overrides remains an
  implementation design question; default values must not accidentally
  suppress portrait preferences.
- **LP-09 — Skippable core and optional depth (Q9).** The core covers studied
  languages and approximate self-reported levels; languages comfortable for
  explanations, including mixed-language preferences; goals and situations
  such as travel, work, exams, and everyday conversation; preferred tone and
  explanation style (concise/detailed, examples/theory, simple/academic); and
  accommodations such as short steps and frequent recaps. Hobbies and an
  optional broad age range belong to deeper exploration. Do not collect birth
  dates or administer a proficiency assessment. LP-18 defines language levels
  and LP-19 defines age bands and usage; this is not an age eligibility policy.
- **LP-10 — Resume unfinished interviews, remove completed transcripts (Q10).**
  Retain unfinished interviews for resume. Approval of the resulting portrait
  or explicit interview discard removes its transcript and working draft.
  Later interviews start from the approved portrait. LP-13 sets abandoned
  interview expiry. Removal must cover derived interview state too;
  backup/provider retention and operational deletion details still need
  specification rather than an unsupported immediate-erasure promise.
- **LP-11 — Global permission with per-chat exclusion (Q11).** Provide a global
  Use my portrait switch in settings and a per-chat switch that can exclude
  the portrait. Global off always wins; a chat cannot silently re-enable it.
  Creating or approving a portrait leaves use disabled until the learner
  explicitly enables it. Approving later updates preserves the learner's
  existing use choice (LP-03), rather than forcing another opt-in or enabling
  use that was disabled.

Confirmed by the user in interview round 4 on 2026-10-20 (Q12–Q16):

- **LP-12 — Next-message effect without interrupting responses (Q12).**
  Approved portrait updates and use changes apply from the next message,
  including in existing chats. Responses already underway finish with their
  original context unless the learner explicitly stops them. Starting a new
  chat is unnecessary for updated preferences. Implementation must define
  admission consistently so queued work cannot mix old and new context.
- **LP-13 — Fourteen-day unfinished-interview expiry (Q13).** Delete an
  unfinished interview and its draft after **14 days without learner
  activity**, and show its expiry when resuming. Expiry never changes or
  deletes the approved portrait. This overrides the interviewer's proposed
  30-day duration. Background activity must not extend learner inactivity.
- **LP-14 — Explicit portrait deletion (Q14).** After confirmation, delete
  the approved portrait, unfinished interview and draft, and any retained
  portrait revisions; disable global use. Pending interview work must not
  recreate deleted content. Ordinary chats remain, with clear explanation
  that their history may contain earlier personal context. This does not
  establish a need to retain portrait revisions in the first place.
- **LP-15 — Authoritative items and no-cost direct edits (Q15).** Confirmed
  items are authoritative. Direct edits immediately update a readable summary;
  explicit Save approves both together without an AI call. Interviewer prose
  may be richer but cannot introduce facts absent from confirmed items. An
  old generated summary must not contradict newly saved items.
- **LP-16 — Existing AI accounting initially (Q16).** Apply existing model
  selection and AI-usage rules with a clear notice before starting. Interview
  responses and AI-generated drafts count as AI usage. Review, manual edits,
  approval, enable/disable, and deletion do not invoke AI or incur AI usage.
  Generation failures or unavailable credits preserve unfinished work and
  allow manual editing, subject to LP-13 expiry. LP-26 subsequently requests
  an operator-controlled credit bypass, confirmed in LP-27. Credit-pack
  entitlement remains deferred.

Future pricing consideration from the user: after testing, interviews might
be free to users who buy credits, with expected interview costs included in
credit-pack pricing. Eligibility, allowance size, renewal, caps, pricing, and
activation remain undecided. This is not approval to change billing or credit
pack prices now.

Confirmed by the user in interview round 5 on 2026-10-20 (Q17–Q21):

- **LP-17 — Guided, adaptive interview (Q17).** Follow a guided core with
  adaptive wording and follow-ups, one question at a time. Offer selectable
  answers, custom text, Skip, Pause, and Review portrait, with multi-select
  where appropriate. Early review is allowed without completing every topic.
  Returning users begin with “What would you like to update?”
- **LP-18 — Self-described language repertoire (Q18).** Users can list all
  languages they know and mark those being learned. Per-language choices are
  just starting, basic, intermediate, advanced, fluent, native, and unsure.
  Custom clarification can describe differences such as reading versus
  speaking comfort. Explanation-language preferences are separate. None of
  these answers is assessed proficiency.
- **LP-19 — Optional age context only (Q19).** Deeper exploration may offer
  under 18, 18–34, 35–54, 55+, and prefer not to say. Use age only for relevant
  examples and life context, never to infer ability, maturity, or preferred
  tone. Explicit preferences prevail. This field does not establish account
  eligibility or age verification.
- **LP-20 — One resumable interview, explicit conflict review (Q20).** Allow
  one unfinished interview per account, resumable across devices. A stale
  interview draft must not silently overwrite newer approved changes. Show
  conflicting changes and require review against the latest portrait before
  Save. Preserve the draft during resolution, subject to the 14-day expiry.
- **LP-21 — Initial web coverage (Q21).** Launch in the web app, with dashboard
  and settings entry points and portrait use in dictionary, text, and Knowledge
  chats. Support mobile-sized browser screens. Native mobile integration,
  automated content generation, guided courses, and teacher-to-student
  personalization remain future work.

Confirmed by the user in interview round 6 on 2026-10-20 (Q22–Q26):

- **LP-22 — Preserve existing-chat manual settings (Q22).** Existing chats
  retain language, tone, and explanation settings. Provide Use portrait
  preferences to switch those fields explicitly. Other portrait context,
  including goals, language knowledge, and accommodations, can apply when
  enabled. LP-29 subsequently confirms new-chat inheritance and per-field
  source labels.
- **LP-23 — Manual creation and bounded answers (Q23).** Provide Fill it in
  myself alongside the interview. Both produce the same editable portrait,
  require explicit Save, and keep use enablement separate. At least one
  meaningful item is required to save. Skipping everything produces no
  generic portrait. The original 20-word answer limit was explicitly replaced
  by the character-based limits in LP-28; do not implement both limits.
- **LP-24 — Interview language and concise summary (Q24).** Start in the
  interface language; allow explicit switching or a request in chat. The
  summary uses the chosen interview language, independently of learning
  explanation preferences. Aim for 100–180 words when sufficient information
  exists, less for sparse portraits. Use friendly second-person wording,
  concrete preferences, no personality judgments, and no filler. These are
  assistant summary targets, not an exception to the user-answer limit.
- **LP-25 — Restricted interviewer context (Q25).** Use only the current
  interview, manual edits, and previously approved portrait. Do not inspect
  other chats or learning activity. Opening Update my portrait explicitly
  allows the interviewer to read the approved portrait even when ordinary
  chat personalization is disabled; it cannot publish or enable use itself.
- **LP-26 — Opening notice and requested credit bypass (Q26).** Use the
  proposed opening explanation below as the content baseline, with Start
  interview and Fill it in myself actions and an expandable explanation of
  data use/deletion. The user additionally requests an `.env` flag to bypass
  credit holds so the interview can be completed without user payment.
  LP-27 confirms scope, default, accounting, and pricing-notice behavior; no
  config or runtime code is changed during this design interview. The notice must reflect the
  actual applicable charge policy rather than always claiming credits apply.

Confirmed by the user in interview round 7 on 2026-10-20 (Q27–Q29):

- **LP-27 — Interview-only zero-charge policy (Q27).** Add a server-only
  environment flag, provisionally `AI_INTERVIEW_CREDITS_BYPASS`, default false.
  When enabled, interview replies, portrait generation, and supporting AI
  calls require no credit balance, wallet hold, or user charge. Continue to
  record provider usage/costs and enforce model, rate, and execution limits.
  Ordinary chats and other AI work retain existing charging behavior. State
  that the interview is free when applicable. Already-started work keeps its
  original charging policy; switching from free to paid requires an updated
  notice before the next paid request. This is an operation-scoped policy,
  not a change to the account's limited/unlimited status or credit grants.
- **LP-28 — Character limits and summarized chat answers (Q28).** Replace the
  earlier word limit. A proposed free-form answer field accepts at most
  **200 symbols**. Interview chat accepts up to **1,000 symbols**, including
  clarification questions. When a learner answers through chat, use the
  answer in context and propose a summary of at most 200 symbols, subject to
  ordinary review/approval. The answer-field limit does not truncate the
  original chat message or reduce the final portrait's separate length target.
  LP-30 confirms that this chat limit is interviewer-only.
- **LP-29 — New-chat inheritance with visible overrides (Q29).** New chats
  use portrait preferences when globally enabled, with manual overrides per
  field and visible From portrait versus Manual labels. If the portrait lacks
  a preference, or its use is disabled, use saved manual defaults, retaining
  explicit chat overrides under LP-08. Chat mode remains independent.

Confirmed by the user in interview round 8 on 2026-10-20:

- **LP-30 — Interviewer-only chat limit (Q30).** Apply the 1,000-character
  chat-input limit only to the interviewer. Ordinary dictionary, text, and
  Knowledge chats keep their existing limits; their longer questions and
  passages are outside this input-limit change.

## Opening explanation baseline

> Let’s discover what helps you learn. This optional interview takes about
> 3–5 minutes. You can skip questions, pause, or review your portrait early.
>
> We’ll ask about your languages, goals, and learning preferences—not diagnose
> conditions or test your ability. You’ll review everything before saving,
> and choose separately whether chats use your portrait.
>
> AI responses use credits under your current settings. Unfinished interviews
> expire after 14 days of inactivity. Approving the portrait or discarding
> the interview removes its transcript.

The credit sentence is conditional on LP-27. For a free interview replace it
with “This interview is currently free; it won’t use your credits.” The expanded
explanation must describe the previously confirmed history/deletion limitations
and distinguish transient interview context from the reusable portrait.

See the [glossary](../CONTEXT.md#learner-personalization) for domain terms.
The proposed [ADR-0044](adr/0044-learner-portrait-approval-and-use-boundaries.md)
captures the accepted durable cross-chat boundary. Implementation/evidence
remain separately tracked in feature051.

## Existing product constraints

Read-only source discovery found:

- [Chat preferences](../packages/contracts/src/contextual-assistant.ts)
  include mode, reply language, tone, and explanation level. Saved defaults
  initialize new conversations; existing conversations retain their settings,
  and admitted turns snapshot those preferences. See
  [persistent tutor modes](../.agent/features/048-persistent-tutor-modes/FEATURE.md).
- Existing preference persistence records full values, not per-field origin.
  Neither default-looking values nor equality with today's account defaults
  proves historical user intent. This is the reason for LP-22's explicit
  existing-chat transition rather than guessing which fields were overrides.
- [ADR-0037](adr/0037-independent-knowledge-and-agent-proposals.md) binds
  existing conversations and memory to a dictionary, text, or Knowledge note.
  A standalone portrait interview needs an explicit lifecycle; existing
  conversation history can carry earlier personal context independently of
  fresh portrait injection.
- The current
  [tutor runner](../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts)
  combines application instructions, typed preferences, and source context.
  Portrait content requires bounded, untrusted contextual treatment; it must
  not grant tool authority or override application rules.
- Explanation language, studied language, and interface language are distinct
  existing concepts. Known languages and proficiency need their own semantics.
- [ADR-0026](adr/0026-shared-text-ai-selection-and-user-preferences.md) and
  ADR-0037 define shared model selection and AI accounting constraints. No
  interview-specific free allowance is implemented. LP-27 requests a new scoped
  zero-charge policy, preserving [ADR-0022](adr/0022-ai-credit-ledger-and-generation-settlement.md)
  accounting invariants and ordinary chat charging.
- The existing dictionary credit-enforcement flag does not bypass chat
  accounting. Current conversation accounting checks balance and reserves
  each provider call separately; skipping only the initial balance check
  cannot satisfy LP-27. Zero-value bookkeeping reservations can retain
  settlement/recovery evidence without placing a wallet hold. Account-wide
  unlimited access would incorrectly affect unrelated work.
- `/knowledge` is an existing library route; visiting it does not create a
  document. Its New note action opens an unsaved document with AI chat. The
  destination assistant remains scoped to language learning, so the interview
  must not promise unrestricted help at that destination.
- Account purge explicitly removes owned domain data and retains an opaque
  user tombstone. Portrait/interview cleanup therefore needs explicit purge
  participation; a foreign-key cascade on the user is insufficient. This is
  an implementation dependency, not a newly approved retention policy.

These are source observations, not runtime verification or new decisions.

## Derived acceptance checklist

This consolidates confirmed outcomes for final design review; it is not test
execution evidence or an implementation plan.

| ID | Observable result |
| --- | --- |
| POR-01 | Dashboard/settings offer the optional guided interview and manual creation on desktop and mobile-sized web layouts. |
| POR-02 | Questions provide options, custom answers, skip/pause/early review; partial information remains useful and unknown information is not invented. |
| POR-03 | Confirmed editable items and their readable summary agree; manual Save needs no AI call, and an empty portrait cannot be saved. |
| POR-04 | Interview output is a draft; only explicit approval replaces the approved portrait, independently of use enablement. |
| POR-05 | Global off and per-chat exclusion prevent new portrait supply; original manual settings persist and older history is not represented as forgotten. |
| POR-06 | Existing-chat adoption preserves settings; new-chat inheritance and manual override labels follow LP-22/29, with independent chat mode. |
| POR-07 | Approved changes affect the next message; in-flight work retains its initial context and charging policy. |
| POR-08 | One unfinished interview resumes across devices; stale proposals cannot overwrite newer approvals without conflict review. |
| POR-09 | Approval/discard removes interview state; 14-day inactivity expiry preserves the approved portrait; confirmed deletion cannot be undone by pending work. |
| POR-10 | The interviewer cannot inspect other chats/activity, infer diagnoses, publish changes, or silently enable use; off-topic requests offer the bounded Knowledge redirect. |
| POR-11 | Custom answers allow 200 characters; interviewer chat allows 1,000; chat-derived answer summaries allow 200 and remain reviewable. Ordinary-chat limits are unchanged. |
| POR-12 | The server-only flag enables interview-only zero user charge while preserving provider accounting and execution limits; flag-off behavior follows existing rules. |
| POR-13 | Failures preserve editable unfinished work until its expiry; paid/free notices match the operation policy and manual actions never invoke AI. |
| POR-14 | Known/studied/explanation languages remain distinct; proficiency is self-described, age use is limited, and future recipient context is not confused with the requesting account. |

Verification planning must cover these outcomes with focused contract and
policy tests, disposable persistence/accounting tests, real web journeys,
prompt/context inspection with deterministic fake model responses, and
independent completion/security review under repository policy. Tests do not
call paid models. This design document claims no runtime verification.

## Design closure and delivery handoff

Q1–Q30 are resolved. No unanswered product question remains in the current
design tree. The user confirmed delivery with “Implement the plan” after finalization.
ADR-0044 is Accepted. Feature051 owns implementation/verification; this discovery
record does not itself claim feature completion.

Interpret “symbols” as user-perceived characters, with spaces and punctuation
counted, using consistent browser/server Unicode-aware counting. This is a
documented implementation interpretation rather than another product limit.
Do not silently truncate user text. Model-generated compact answers must be
validated before becoming a reviewable proposal; a prompt instruction alone
does not enforce the bound. Ordinary user approval remains required.

The subsequent delivery plan must resolve these implementation details using
the confirmed requirements and existing repository conventions:

- Exact preference answer labels and proposed-interpretation/change comparison
  presentation within the agreed learning-preference fields.
- Precise admission semantics and learner-activity definition, with the
  next-message and 14-day product rules already fixed.
- Knowledge redirect behavior and portrait generation failure/retry details.
- Task-compatible model selection, bounded execution, and failure recovery
  under the existing accounting rules; future allowance pricing is deferred.
- Preserve the account-versus-recipient boundary for future work and map the
  acceptance checklist to verification for the confirmed web-only scope.

Record answers as confirmed decisions before deriving implementation details.
Create ADRs for settled durable cross-feature choices when justified; none is
accepted by this discovery document. Existing glossary terminology around
“contextual language assistant” and “AI tutor” predates the implemented Practice
mode; this feature must distinguish current source-based chats from future
guided lesson/course capabilities without silently redefining their scope.

Documentation preflight on 2026-10-20: local links, frontmatter presence,
LP-01–LP-30 sequence, and whitespace checks pass. An independent read-only
consistency audit found no material contradiction; stale cross-references to
resolved empty-portrait/Q30 questions were corrected. These are document checks,
not implementation, security, or runtime verification.
