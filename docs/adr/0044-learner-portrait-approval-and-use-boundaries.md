---
type: adr
id: ADR-0044
title: 'Learner portrait approval and use boundaries'
status: accepted
date: 2026-10-20
supersedes: 'None'
---

# ADR-0044: Learner portrait approval and use boundaries

## Context

Learner portraits introduce reusable personal context across otherwise separate
AI conversations. Existing ADR-0037 memory is conversation-scoped; treating an
interview as ordinary permanent chat memory would couple reusable preferences
to transcripts that may include unnecessary sensitive disclosures.

Design interview Q1–Q30 confirmed learner approval, independent control over
use, explicit preference precedence, and removal of completed interview
transcripts. These choices affect future tutoring and require consistent
behavior across consumers. This record proposes their architectural boundary;
the user authorized implementation of the finalized plan on 2026-10-20.
Acceptance records the decision and does not claim delivery. Confirmed product decisions are recorded in the linked design.

## Decision

Represent the learner portrait as learner-approved facts and preferences with
a consistent readable summary, distinct from interview transcripts and ordinary
conversation memory. Unknown answers remain unknown. Do not infer diagnoses
or retain diagnostic labels in the reusable portrait; retain confirmed learning
accommodations instead.

The interviewer proposes a draft. Explicit learner approval publishes the
portrait or its update; a proposed update cannot silently replace the approved
portrait. Users can review, correct, and remove individual items. Approval and
permission to use the portrait are separate decisions.

The interviewer reads only its current interview, manual edits, and the
previously approved portrait, not other chats or learning activity. Explicitly
opening Update my portrait permits that read even with ordinary portrait use
disabled, without permission to publish or enable use.

Manual creation is an alternative to interviewing, with the same approval/use
boundaries and at least one meaningful item required to save. Proposed custom
answer fields are limited to 200 characters; interviewer chat allows 1,000.
Chat answers become reviewable summaries of at most 200 characters. These
limits replace the earlier word limit, without changing the final portrait
summary target. Ordinary dictionary, text, and Knowledge chat input limits
remain unchanged.

Allow one unfinished interview per account, resumable across devices. Stale
drafts cannot silently overwrite newer approved changes: require review of
conflicting changes against the latest portrait, preserving the draft subject
to expiry.

Confirmed items are authoritative. Manual edits update a readable summary
immediately; explicit Save approves both together without an AI call. Richer
interviewer-generated prose cannot add facts or remain inconsistent with items.

Global portrait use starts disabled. A conversation can exclude the portrait
but cannot override global off. Explicit learner requests and per-chat
overrides take precedence over portrait preferences. Manual settings remain
available and survive disabling portrait use. Portrait preferences do not
select Explain/Correct/Practice mode or grant permission to override application
rules or tools.

Existing chats preserve their language, tone, and explanation settings until
the learner explicitly chooses Use portrait preferences for those fields.
Other approved personal context can apply when enabled. Historical settings
have no reliable origin markers, so their values cannot establish which were
deliberate overrides. New chats inherit portrait preferences when enabled,
support per-field overrides, and show From portrait versus Manual. Missing
portrait preferences and disabled use fall back to saved manual defaults;
explicit chat overrides remain authoritative.

Disabling use stops supplying the portrait for subsequent requests. It does
not erase earlier messages or conversation memory; explain this limitation and
offer a fresh chat. Approved changes affect the next message in existing and
new chats; a response already underway retains its original context and can
be stopped explicitly. Admission must use one consistent context snapshot.

Retain unfinished interviews for resume. Approval of the resulting portrait or
explicit discard removes the interview transcript and working draft. Later
interviews begin from the approved portrait. Derived interview state must obey
that same lifecycle; an independent memory store must not defeat removal.
Delete unfinished interviews and drafts after 14 days without learner activity,
showing expiry on resume and preserving any approved portrait. Background work
does not extend learner activity.

Confirmed portrait deletion removes the approved portrait, any unfinished
interview and draft, and any retained portrait revisions; it disables global
use. Pending work cannot recreate deleted content. Ordinary chat history is
retained with the same explicit limitation as disabling portrait use.

Initial interview AI work follows existing model-selection and usage-accounting
rules. Responses and AI-generated drafts count as AI usage; manual editing,
review, approval, use switches, and deletion do not invoke AI. Preserve unfinished
work and manual editing on generation/credit failure, subject to expiry. A future
credit-pack-funded allowance is only a pricing idea, not an initial entitlement.
Add a server-only operator flag, provisionally `AI_INTERVIEW_CREDITS_BYPASS`,
default false. When enabled, all interview replies, portrait generation, and
supporting AI calls need no credit balance, wallet hold, or user charge.
Preserve provider usage/cost accounting and operational/model limits. Pin the
resolved policy for admitted work and retain it across execution and recovery;
switching from free to paid requires an updated notice before the next paid
request. The opening notice must match the effective policy.

This introduces an interview-scoped zero-charge policy at the shared credit
boundary, preserving ADR-0022 ledger and immutable-accounting guarantees.
It does not mutate account-wide policy, grants, or ordinary-chat charging.
Zero-value bookkeeping records are compatible with no wallet hold; dropping
settlement/recovery records is not required or authorized by this decision.

Initial consumers are web dictionary, text, and Knowledge chats, including
mobile-sized browser layouts. Native mobile, automatic content generation,
guided courses, and teacher-to-student personalization are outside this initial
scope. Language levels remain self-descriptions, and optional age context must
not be treated as ability, maturity, tone preference, or verified eligibility.

## Alternatives considered

### Infer a psychological profile from conversation behavior

This could reduce explicit questioning but would turn uncertain interpretations
into personal labels. Confirmed learning needs provide actionable preferences
without requiring diagnostic disclosure.

### Automatically publish interview results and enable their use

This reduces interaction steps but conflates answering questions, approving
facts, and choosing cross-chat personalization. The learner explicitly selected
separate approval and use controls.

### Preserve every interview as permanent personalization memory

This provides historical context but retains disclosures excluded from the
portrait. The learner selected resumable unfinished interviews and removal of
completed transcripts, accepting that later interviews rely on approved items.

### Replace manual chat preferences with the portrait

This simplifies preference resolution but removes deliberate task-specific
control. Explicit chat choices must prevail without destroying saved manual
settings.

### Make the account unlimited or skip only the admission balance check

Account-wide unlimited access affects unrelated AI work. Skipping only the
initial balance check leaves per-call reservations and settlement able to fail
or charge the user. A scoped, pinned zero-charge policy satisfies the confirmed
interview promise while preserving cost tracking and other charging behavior.

## Consequences

### Positive

- Users can inspect and correct reusable personal context.
- Consumers share one approval and use boundary.
- Transcript retention is separated from the useful life of approved preferences.

### Negative

- Draft approval, portrait use, and chat exclusion require distinct states.
- Preference resolution must distinguish inherited defaults from explicit choices.
- Deletion and concurrent operations require coordination beyond prompt wording.

### Risks / limitations

- The user authorized the finalized plan on 2026-10-20 with “Implement the plan”; implementation evidence remains separate.
- Conflict-resolution mechanics, exact admission semantics, and operational cleanup remain
  to be specified; no API shape, schema, or rollout is selected here.
- The shared credit API currently lacks an operation-scoped override. Its
  eventual extension needs explicit scope validation, accounting/recovery
  verification, and security review; a client cannot select free execution.
- Removing application data is not proof of erasure from external providers or
  backups; the implementation must document those boundaries accurately.
- Account purge must explicitly include this new domain and its active work.
- Future teacher-to-student generation needs explicit recipient context and
  must not automatically apply the requesting teacher's portrait.

## Related

- [Learner portrait design decisions](../learner-portrait-design.md).
- [Learner personalization glossary](../../CONTEXT.md#learner-personalization).
- [ADR-0037: Independent knowledge and agent proposals](0037-independent-knowledge-and-agent-proposals.md).
- [ADR-0026: Shared text AI and user model preferences](0026-shared-text-ai-selection-and-user-preferences.md).
- [ADR-0022: AI credit ledger and generation settlement](0022-ai-credit-ledger-and-generation-settlement.md).
