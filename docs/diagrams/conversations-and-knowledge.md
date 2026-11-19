---
type: diagram
title: Conversations and Knowledge workspace
summary: Source chat and note workspaces share durable tutor turns while working drafts, publication and unlisted sharing have separate boundaries.
source_paths:
    - docs/adr/0062-single-submission-lesson-recovery.md
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-unit-recovery.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-attempts.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-unit-call.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-admission.ts
    - docs/adr/0042-knowledge-workspace-document-and-context-boundaries.md
    - docs/adr/0050-interactive-workbook-content-and-learning-boundaries.md
    - docs/adr/0055-learning-content-context-and-publication.md
    - packages/contracts/src/knowledge-interactive.ts
    - packages/contracts/src/learning-blocks.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/workbook-access.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/workbook-copy.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/learning-epochs.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/media-grants.ts
    - apps/backend/src/modules/conversations/application/tutor-context-budget.ts
    - apps/backend/src/modules/conversations/application/tutor-planner-prompt.ts
    - apps/backend/src/modules/conversations/application/learning-content-registry.ts
    - apps/backend/src/modules/conversations/application/learning-block-revision.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-execution.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/tutor-history-context.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-authoring.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-operations.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-block-operations.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-tools.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-tool-sources.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-messages.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-config.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-records.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-worker-completion.ts
    - apps/web/src/fsd/features/knowledge-notes/hooks/use-content-proposals.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/proposal-completions.ts
    - docs/user-flows/knowledge-workspace.md
    - apps/backend/src/config/environment.ts
    - apps/backend/src/modules/conversations/application/workspace-turn-context.ts
    - apps/backend/src/modules/knowledge/interface/http/knowledge.routes.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/schema.ts
    - apps/web/src/fsd/pages/knowledge/ui/knowledge-detail-page/knowledge-detail-page.tsx
    - apps/web/src/fsd/pages/knowledge/hooks/use-knowledge-workspace.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/editor-target-anchor.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel.ts
    - docs/adr/0041-durable-tutor-streaming-presentation.md
    - apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts
    - apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts
    - apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/chat-markdown/chat-markdown.tsx
    - apps/backend/src/modules/conversations/interface/http/conversation.routes.ts
    - apps/backend/src/modules/conversations/application/conversation-service.ts
    - apps/backend/src/modules/conversations/application/conversation-worker-service.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts
    - apps/backend/src/modules/knowledge/application/knowledge-service.ts
    - docs/adr/0037-independent-knowledge-and-agent-proposals.md
    - apps/web/src/fsd/entities/conversation/api/conversation-api.ts
    - apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts
    - apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts
    - docs/adr/0045-action-accounting-and-provider-expenses.md
    - apps/backend/src/modules/conversations/application/turn-text-buffer.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-source.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-turn-admission.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts
    - apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts
    - apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission.ts
    - docs/adr/0046-admin-owned-text-ai-routing.md
    - apps/web/src/fsd/features/knowledge-notes/lib/learning-block-form.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/block-form-definition.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/block-form-read-context.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/read-block-form.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/read-media-block-form.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/read-text-block-form.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/read-exercise-block-form.ts
    - docs/adr/0058-named-activity-content-and-source-provenance.md
    - packages/contracts/src/contextual-assistant.ts
    - packages/contracts/src/exercise-generation.ts
    - packages/contracts/src/named-exercises.ts
    - apps/backend/src/modules/conversations/application/exercise-picker-resolution.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/exercise-source-resolution.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-content-proposals.ts
    - docs/adr/0060-composable-generation-runs.md
    - packages/contracts/src/generation-plans.ts
    - packages/contracts/src/generation-runs.ts
    - packages/contracts/src/knowledge-content-proposals.ts
    - packages/contracts/src/generated-artifacts.ts
    - apps/backend/src/modules/conversations/application/ports/generation-run.ts
    - apps/backend/src/modules/conversations/application/generation-run-revisions.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-generation-execution.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-generation-plan.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-admission.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-worker.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-completion.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-mutations.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-source-refresh.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-capacity.ts
    - apps/backend/src/modules/conversations/interface/http/conversation-generation.routes.ts
    - docs/adr/0061-bounded-automatic-lesson-continuation.md
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-authorization.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-automation.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-stop.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-preview.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-context.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-worker-claim.ts
    - apps/backend/src/modules/conversations/interface/http/conversation-generation-preview.routes.ts
    - apps/backend/src/modules/conversations/application/generation-failure.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/structured-output-diagnostics.ts
    - packages/contracts/src/generation-run-preview.ts
    - apps/web/src/fsd/features/lesson-generation/hooks/use-lesson-preview.ts
    - apps/web/src/fsd/features/lesson-generation/ui/lesson-run-preview/lesson-run-preview.tsx
    - apps/backend/drizzle/0178_automatic_lesson_ready_index.sql
    - apps/backend/src/modules/conversations/application/learning-content-plan-capacity.ts
    - apps/backend/src/modules/conversations/application/learning-content-batches.ts
    - apps/web/src/fsd/features/lesson-generation/lib/prepared-lesson-body.ts
    - packages/prompts/src/local/learning-content-authoring.ts
    - apps/web/src/fsd/features/lesson-generation/hooks/use-lesson-runs.ts
    - apps/web/src/fsd/features/lesson-generation/lib/lesson-run-cache.ts
    - apps/web/src/fsd/features/lesson-generation/lib/lesson-run-notice.ts
    - apps/web/src/fsd/features/lesson-generation/lib/lesson-task-unit-progress.ts
    - apps/web/src/fsd/features/lesson-generation/lib/lesson-task-status.ts
    - apps/web/src/fsd/features/lesson-generation/ui/lesson-run-card/lesson-run-card.tsx
source_fingerprint: sha256:38d297eb93c884795ff0b3943ebf90f18a19d2e098b056e61a058567d36241be
reviewed: 2026-11-19
---

# Conversations and Knowledge workspace

Source chat and note workspaces share durable tutor turns while working drafts,
publication and unlisted sharing have separate boundaries.

```mermaid
flowchart TB
    Source["Live primary dictionary, text or saved shared note"] --> Open["Open private source conversation
current source authority"]
    Open --> Send["Send question + explicit copied cards or draft"]
    New["New Knowledge note"] --> Workspace["Stable private Draft ID
rich editor + reused tutor"]
    Workspace --> Auto["Server autosave working branch
CAS preserves stale edits as alternative"]
    Auto --> Resolve["Compare, combine or keep a branch
explicitly resolve alternatives"]
    Workspace --> WSend["Send complete current editor snapshot
persist validated target anchor
optional focus, activity choices + copied Text bodies"]
    WSend --> Limit["Character limits + irreducible first-phase budget
compactable history stays eligible"]
    Limit -->|"Too large"| Reject["Explain limit; keep composer
no silent excerpting"]
    Limit --> Admission
    Send --> Admission["One active durable turn
Admin-owned model routing
model, funding and independent rate snapshots
bounded credit + operator USD allowance"]
    Admission --> Worker["Existing worker slot claims turn
lease + authorized source snapshot"]
    Worker --> Memory["Prepare thread context once
thread-scoped Drizzle storage + lease fences
completed tool pairs become compact receipts
bounded synchronous Observational Memory"]
    Memory --> Intent{"Owned workspace without
an explicit prose proposal?"}
    Intent -->|"No"| Tutor["Streamed contextual tutor
persistence-only Memory saves current output"]
    Intent -->|"Yes"| Planner["Knowledge request planner
prepared history + observations + frozen sources"]
    Planner -->|"Conversation or explanation"| Tutor
    Planner -->|"Missing or ambiguous requirements"| Clarify["Clarify; retain bounded brief and exact sources
no applicable partial material"]
    Planner -->|"Clear content request"| Plan["Validated plan: up to 8 logical tasks
explicit sources and dependency inputs; separate output order"]
    Prepared["Authorized prepared-plan adapter
transcript-independent execution"] --> Plan
    Plan --> Run["Owner-scoped durable run + immutable revision
existing worker, lease and action allowance"]
    Run --> Author["Sequential ready tasks; homogeneous batches
selected schemas + exact captured source projections
one exercise per durable unit"]
    Author --> Checkpoint["Validate whole structured call
atomically persist private artifacts + accepted receipts
current lease and revision fence"]
    Checkpoint -->|"Work remains; stage makes progress"| Pause["Paused run; settled action
no insertable partial proposal"]
    Pause --> AutoStage["Server claims ready stage idempotently
settled successful progress + remaining pinned authority"]
    AutoStage -->|"Same revision, access, configuration and ceilings"| Run
    AutoStage -->|"Stopped, failed, changed, expired or exhausted"| Decision["Pause for owner decision"]
    Decision --> Continue["Explicit Retry / Resume
fresh quote, revision and bounded authorization"] --> Run
    Checkpoint --> Preview["Owner-only prepared preview
ordered validated prefixes + frozen dependencies
read-only; no Insert or paid checking"]
    Pause --> Revision["Review revision or changed source choice
Keep snapshot / Refresh under current access"]
    Revision -->|"Apply; reuse unchanged, invalidate descendants"| Pause
    Worker -->|"Prepared continuation; skip history and OM"| Run
    Planner -->|"Exact copy or revision"| BlockOps["Authorized frozen target operation
host copy or validated replacements"]
    Checkpoint -->|"All tasks + aggregate valid"| Propose["Canonical mixed content proposal
ordered Knowledge v2 body; prose + typed blocks
one complete preview; successful turn fence"]
    BlockOps --> Propose
    Tutor --> Read["read_source_context
bounded authorized material"]
    Tutor --> Reply["Persist batched prose: 100ms or 4KiB
and durable tool exchanges"] --> Replay["Durable replay to useChat transport
reconnect without duplicate generation"]
    Clarify --> Reply
    Propose -->|"Successful durable turn"| Query["Actor + conversation proposal query owner
initial read; success / Apply / reconnect refresh
no status polling"]
    Replay -->|"Reconnect reconciliation"| Query
    Query --> BlockReview["Review stored mixed content
Insert; exact single-block Update remains narrow"] --> Auto
    Tutor --> ProseDraft["Owner-only standalone prose note draft
validated current prose contract"]
    ProseDraft --> Review["Conversation-owned editable prose draft"]
    Review --> Publish["Explicit standalone note Save"]
    Workspace --> Apply["Review reply proposal
Insert / Append / Replace with target check"] --> Auto
    Auto --> Save["Explicit Save
title + nonempty body + version checks"]
    Publish --> Note[("Saved Knowledge note
restricted rich text + typed learning blocks + revisions")]
    Save --> Note
    Save -->|"Stale saved version"| Resolve
    Note -->|"Restore with unpublished edits"| Resolve
    Workspace --> Copy["Save a copy of current working branch"] --> Note
    Note --> Share["Unlisted locator + fragment key
read saved version only"]
    Share --> Reader["Anonymous saved reading
signed-in private practice and read-only tutor"]
    Reader --> Independent["Copy before editing
fresh identities and independent media grants"] --> Note
    Workbook["Ordered workbook; at most one per note
independent revocable workbook grant"] --> Share
    Workbook --> Note
    Reader --> Learning["Private attempts, hints and reveals
explicit completion; no author access"]
    Save --> Epoch["Semantic publication advances learning epoch
cosmetic edits preserve progress"] --> Learning
    Share -->|"Disable or account deletion"| Revoke["Delete capability
old link remains invalid"]
    Note --> Workspace
    Note --> NoteDelete["Permanent note deletion removes
its chats, branches and share"]
    Stop["Run-level Stop
revoke automatic authority, including between stages"] --> Worker
    Stop --> Decision
    Source --> Lifecycle["Archive/lost access suspends;
permanent primary deletion removes conversation + memory"]
    Lifecycle --> Open
```

Private append/heartbeat progress transactions recheck the active actor with a shared
lifecycle lock, source authority, chat/turn identity, lease and Stop state. They do not
acquire global capacity locks or change billing/publication. Public arbitrary
`withOperation`, admission and settlement keep the global-capacity and actor-update
fences. Batched streaming progress therefore does not serialize all admissions while
retaining the same lifecycle authority checks.

Navigation or disconnect does not cancel worker-owned generation; explicit Stop is
a separate command. Failed partial chat output remains incomplete. Validated generation artifacts can
be reused by an explicitly admitted Retry/Resume. Successful stages with progress
may advance on the server within their original bounded authorization; ambiguous
provider work is never automatically repeated.
The action bounds aggregate output to 10,000 tokens and separately bounds operator
cost. Reduced affordable output requires a reviewed quote; changed funding requires
confirmation again. Successful answers and eligible explicit Stop usage are charged;
technical failure releases the customer hold. Memory calls remain operator-funded.
The model gate also bounds each turn to five provider calls and two memory calls;
observation/reflection run synchronously inside accounted work, with background
buffering and vector recall disabled. Full readable history remains canonical.

Tools can read the current authorized source and prepare bounded prose drafts or
typed learning proposals; they cannot publish, overwrite or delete a saved note.
The canonical content publication operation stores a reviewable Knowledge v2
fragment, not a saved document. Mixed proposals insert only; exact single-block
replacement retains its target hash checks and prose writers remain narrow.
Store-backed Save delegates
publication to the Knowledge transaction participant with ownership/version checks.
The Knowledge service also supports independent manual create/edit, revisions and
restore; restoring a version makes a new saved revision. A note workspace starts
with an empty, recoverable private Draft. Autosave never publishes. Concurrent
edits create branches; the learner chooses which to continue and explicitly
resolves alternatives. Restoring a saved revision while unpublished prose exists
also creates an alternative, and Save waits for resolution. Only a published
version is visible through an unlisted
share. Shared-source conversations expose reading/explanation tools and reject
authoring callbacks. Disabling sharing deletes that capability; workbook membership
and independent note shares remain separate grants. A recipient copy is a new
note with fresh block identities and no private chat, progress or draft branches.
Copied uploaded audio has an independent grant, so source deletion does not break
playback.

Version-2 blocks use strict bounded schemas and fixed escaped renderers; arbitrary
HTML and embed code are rejected. Mixed AI content proposals capture the owner
working target and require preview/Insert before a separate explicit Save.
Private learner state is stored separately from document content. Publication
maintains monotonic semantic epochs; earlier wording restored later cannot revive
old mastery. Workbook progress summarizes only the current learner's explicit
note completions, including updated-since-completion notices. Course generation
and workbook-wide AI context remain deferred under ADR-0050.

Explicit attachments are personal copies authorized when read, not extra live source
links. A saved note has no origin dependency and survives conversation deletion.
Conversation-produced note proposals and memory remain conversation-owned.
Knowledge workspace edits belong to the note's private working branch. Each
workspace turn stores its complete editor snapshot, validated cursor/selection
anchor and immutable copied Text references in the user message for Mastra
history. The assistant reply retains the anchor so reopening can safely resume
proposal review; changed document wording requires comparison or reselection.
The current snapshot takes
precedence over older compacted snapshots. The note-to-workspace edge means
reopening a note can resume its latest private conversation, without a stored
origin back-reference to another source.

## Implementation reconciliation

The source resolver projects only effective learner-visible dictionary fields through
`projectConversationDictionaryCards`; prepared turn reuse still checks the locked
chat and source snapshot through `assertPreparedConversationCurrent`. Knowledge
store methods allocate a fresh persistence context per call. The authoring form
facade delegates to typed readers and validates the completed candidate once;
this does not publish a working draft. Model selection follows the admin-owned
routing revision under ADR-0046, rather than a learner-selected model. These
internal extractions preserve the graph's ownership, Apply and explicit Save edges.

[ADR-0055](../adr/0055-learning-content-context-and-publication.md) separates
mandatory current input from reducible history and budgets the actual planner,
authoring and streamed-answer phases independently. An irreducible overflow fails
before a turn or credit hold; the dispatch gate still checks each real model call.
Historical editor snapshots and completed tool pairs become model-context receipts,
while canonical messages, exact current sources and active tool dependencies remain
available under their existing authorization. Receipts never grant source authority.
One explicit memory preparation supplies both the planner and streamed path;
streamed output uses SDK history persistence without a second automatic memory cycle.
Persisted memory configuration contains only allowlisted scalar scope/budget settings
and numeric thresholds; live model adapters, credentials, headers and executable
configuration remain in process. Record reads and writes enforce the same projection.

The capability registry and shared authoring/publication operation serve dedicated
tools and coordinated mixed generation. All new components validate before one
proposal is stored. Copy and revision operations resolve exact frozen targets;
revisions reconcile identities and counts before any proposal write. Missing source
or material requirements produce clarification instead of reconstructed content.
The current pre-release Knowledge contract is schema version 2 for both prose and
block documents; historical compatibility-rollout text in ADR-0050 does not describe
an active dual-format reader.

The browser has one proposal query owner keyed by actor and conversation. Initial
history, a new successful proposal-producing turn, explicit Apply and reconnect
reconcile that cache. Queued/running/failed status updates do not poll it. Durable
events own conversation detail after Send; ordinary sends do not reload an unchanged
workspace. The first eligible Untitled-note admission still synchronizes automatic
naming and its resulting branch version.

## Named exercise extension

The [named-exercise view](named-exercises.md) follows the 19 activity identities,
picker choices, host-captured vocabulary/grammar/passage sources and private
checking policies. The planner still evaluates typed picker choices against
editable prose. Source bindings restore exact captured material; missing sources
or conflicting requirements clarify rather than inventing replacements. Pending
source versions survive clarification, and retry reuses the original private
request instead of accepting new client selectors. One generation result stores
one complete proposal; multi-target revision previews commit as one transaction.

Custom content has no named semantics. Named identity survives insertion and
copying, with fresh local IDs and unchanged historical origins. Prepared checking
is model-free; explicit private AI feedback never rewrites published keys. Neither
partial nor unassessed learning results count as correct progress.

## Durable composition and recovery

The validated-plan entry point is reusable without a chat transcript. Plans contain
at most eight logical tasks and independent output order; assembly is limited to
25 custom blocks and a 100,000-character serialized proposal including dependencies.
Generated prose is ordinary safe document prose, with immutable artifact provenance
for dependent exercises. Captured block origins freeze the selected values across
local edits or removal; neither historical origin grants read access.

A successful bounded stage saves progress and settles its newly eligible calls.
Technical failure releases the current hold while earlier charges remain; Stop
retains eligible partial charging. Whole-call validation, checkpoint and receipt
acceptance share one fenced transaction. Cumulative customer rounding spans run
stages without rebilling reused artifacts. Prepared continuation/revision actions
skip history preparation and Observational Memory work.

Paused revisions retain stable task identities and semantic/source/dependency
fingerprints. Changed tasks invalidate descendants; output-order changes reuse
content. Apply revision is free and stays paused; revision planning is ordinary
chat-priced work. Explicit Retry/Resume obtains fresh quote/admission and rejects
impossible unchanged units before dispatch. Revision/source mutations revoke the
prior automatic authority. Source refresh resolves the exact selected passage
or requires a new owner/version/hash-bound editor selection. Keep snapshot still
requires access. Completed proposals are immutable; Discard clears private plan,
source and artifact content and fences late writes while retaining numeric audit.

## Automatic stages and owner prepared previews

[ADR-0061](../adr/0061-bounded-automatic-lesson-continuation.md) replaces manual
confirmation at each internal stage with one pinned bounded authorization.
Server claim maintenance recovers ready work using stable request identities; it
admits another stage only after successful settled progress, within the initial
configured customer-credit and reviewed configured provider-cost ceilings, unchanged
funding/route/tariff/provider-price fingerprint and eight stages. Expiry is the
earlier of the root action deadline or 15 minutes after authority creation; the
provider ceiling is captured before each stage narrows its predicted call envelope.
The ready-stage partial index orders eligible runs by update time and ID.
Inaccessible source work loses its authority without poisoning the worker queue.
Every stage still passes current access, capacity and financial admission.
Unknown liabilities, failure, Stop, changed sources/plan/configuration or expired
or exhausted authority halt automation. A larger wallet balance does not extend
these limits. Run-level Stop also revokes the between-stage authority.

Durable exercise tasks preserve a cumulative validated prefix after each exercise,
so Retry remaining part does not regenerate accepted units. Safe failure evidence
contains bounded categories and allowlisted field paths, never raw provider output
or user content. Unclassified failures retain an `unknown` category and a UUID
reference to the failed turn instead of being guessed as transport errors. The
production provider boundary classifies transport only after routing has finished
its conclusive-rejection handling. A measured invalid exercise receives a targeted repair and, if needed,
one distinct fallback; an output-limit repair regenerates a compact complete unit under the same
token bound, preserving all required semantics and exact source bindings. It does
not salvage truncated JSON. Transport ambiguity does not authorize another call.
Generated prose is bound through its host-authorized excerpt source ID; models
never invent or echo private artifact identities or source snapshots.

The owner-only preview GET projects current-revision accepted artifact hashes in
plan output order, plus frozen dependencies, under the existing 100,000-character
bound. Progress summaries and shared notes do not expose these private bodies.
The read-only safe document view refreshes from run updates without scheduling
work. It grants no Insert, Save, persisted practice, paid check or library-copy
capability; only the complete canonical proposal reaches the insertion path.
Discard, deletion and access loss remove preview authority. Denied browser reads
purge the cached private response and suppress retries for that exact actor/run/
revision scope. Both summaries and prepared parts follow plan output order;
vocabulary progress counts entries (up to 200), rather than declaring a partial
vocabulary block complete. Capacity and authoring share accepted-prefix detection,
so prior valid exercises remain skipped after the unit-batching change.

Run summaries update through the existing canonical conversation stream. Initial
load and an actual connection gap trigger bounded snapshot reconciliation; active
progress does not poll run lists or details. Revision/timestamp-aware publication
keeps late GETs from erasing a streamed run or regressing newer progress. The card
shows completed exercise/vocabulary unit counts and preserves explicit failed-task
and safe failure messages while a connection recovers. Prepared-preview reads
remain a separate owner-only read path.

After stream rotation a valid heartbeat or event confirms a healthy replacement
connection. Empty replacement streams back off, and an idle run recovers on its
first heartbeat. The page reconciles the selected conversation before
enabling its commands. A continuation rejection appears on the initiating run
with a support reference. A failure after an uncertain provider dispatch requires
explicit acknowledgement of that attempt before the owner resumes generation.

A reading is authored as ordered text sections. The host converts them into a
validated editor fragment before publishing a reading checkpoint. Comprehension
tasks refer to the resulting saved text. A failed repair can therefore stop at
the reading with its phase and safe finish reason available on reload.

## Sources

- [Composable run decision](../../docs/adr/0060-composable-generation-runs.md).
- [Transcript-independent execution](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-generation-execution.ts).
- [Atomic validated checkpoints](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-worker.ts).
- [Explicit continuation admission](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-admission.ts).
- [Revision and source mutations](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-mutations.ts).
- [Canonical mixed proposal contract](../../packages/contracts/src/knowledge-content-proposals.ts).

- [ADR-0055: learning-content context and publication](../adr/0055-learning-content-context-and-publication.md)
- [Phase input budgets](../../apps/backend/src/modules/conversations/application/tutor-context-budget.ts)
- [Exact planner envelope and retained brief](../../apps/backend/src/modules/conversations/application/tutor-planner-prompt.ts)
- [Capability registry](../../apps/backend/src/modules/conversations/application/learning-content-registry.ts)
- [Canonical revision reconciliation](../../apps/backend/src/modules/conversations/application/learning-block-revision.ts)
- [Knowledge request execution](../../apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-execution.ts)
- [Prepared history and receipt projection](../../apps/backend/src/modules/conversations/infrastructure/ai/tutor-history-context.ts)
- [Shared raw authoring](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-content-authoring.ts)
- [Canonical proposal publication](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-content-operations.ts)
- [Frozen copy and revision operations](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-block-operations.ts)
- [Dedicated learning-content tools](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-content-tools.ts)
- [Authorized learning-tool sources](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-tool-sources.ts)
- [Canonical memory message guards](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-messages.ts)
- [Persisted memory configuration projection](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-config.ts)
- [Thread-scoped observational memory records](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-records.ts)
- [Worker completion authority](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-worker-completion.ts)
- [Proposal query ownership](../../apps/web/src/fsd/features/knowledge-notes/hooks/use-content-proposals.ts)
- [Successful proposal completion identity](../../apps/web/src/fsd/features/knowledge-notes/lib/proposal-completions.ts)
- [docs/adr/0042-knowledge-workspace-document-and-context-boundaries.md](../adr/0042-knowledge-workspace-document-and-context-boundaries.md)
- [docs/user-flows/knowledge-workspace.md](../user-flows/knowledge-workspace.md)
- [apps/backend/src/config/environment.ts](../../apps/backend/src/config/environment.ts)
- [apps/backend/src/modules/conversations/application/workspace-turn-context.ts](../../apps/backend/src/modules/conversations/application/workspace-turn-context.ts)
- [apps/backend/src/modules/knowledge/interface/http/knowledge.routes.ts](../../apps/backend/src/modules/knowledge/interface/http/knowledge.routes.ts)
- [apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store.ts](../../apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store.ts)
- [apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/schema.ts](../../apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/schema.ts)
- [apps/web/src/fsd/pages/knowledge/ui/knowledge-detail-page/knowledge-detail-page.tsx](../../apps/web/src/fsd/pages/knowledge/ui/knowledge-detail-page/knowledge-detail-page.tsx)
- [apps/web/src/fsd/pages/knowledge/hooks/use-knowledge-workspace.ts](../../apps/web/src/fsd/pages/knowledge/hooks/use-knowledge-workspace.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel.ts](../../apps/web/src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel.ts)
- [docs/adr/0041-durable-tutor-streaming-presentation.md](../../docs/adr/0041-durable-tutor-streaming-presentation.md)
- [apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts](../../apps/web/src/fsd/entities/conversation/lib/durable-message-projection.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts](../../apps/web/src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts](../../apps/web/src/fsd/widgets/contextual-assistant/lib/conversation-stream-session.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts](../../apps/web/src/fsd/widgets/contextual-assistant/hooks/use-streaming-text.ts)
- [apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/chat-markdown/chat-markdown.tsx](../../apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/chat-markdown/chat-markdown.tsx)
- [apps/backend/src/modules/conversations/interface/http/conversation.routes.ts](../../apps/backend/src/modules/conversations/interface/http/conversation.routes.ts)

- [apps/backend/src/modules/conversations/application/conversation-service.ts](../../apps/backend/src/modules/conversations/application/conversation-service.ts)
- [apps/backend/src/modules/conversations/application/conversation-worker-service.ts](../../apps/backend/src/modules/conversations/application/conversation-worker-service.ts)
- [apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/accounted-tutor-model.ts)
- [apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-storage.ts)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store.ts)
- [apps/backend/src/modules/knowledge/application/knowledge-service.ts](../../apps/backend/src/modules/knowledge/application/knowledge-service.ts)
- [docs/adr/0037-independent-knowledge-and-agent-proposals.md](../../docs/adr/0037-independent-knowledge-and-agent-proposals.md)
- [apps/web/src/fsd/entities/conversation/api/conversation-api.ts](../../apps/web/src/fsd/entities/conversation/api/conversation-api.ts)
- [apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts](../../apps/web/src/fsd/entities/conversation/api/durable-chat-transport.ts)
- [apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts](../../apps/backend/tests/unit/modules/conversations/conversation-worker-service.test.ts)

Streaming presentation follows [ADR-0041](../adr/0041-durable-tutor-streaming-presentation.md):
active125ms/idle1000ms SSE delivers committed canonical state, then the browser
projects native incremental AI SDK parts and restricted Streamdown Markdown.
Each committed conversation session owns its SDK Chat, callbacks, cache key and
publication epoch; speculative React renders start no subscription. Terminal
access loss purges only that owner and invalidates queued publications.
Snapshots/reconnect still reconcile canonical history; UI reveal and activity
indicators do not execute tools or change durable turn state. The graph's
authority and data-flow relationships remain unchanged.

- [docs/adr/0045-action-accounting-and-provider-expenses.md](../adr/0045-action-accounting-and-provider-expenses.md)

- [apps/backend/src/modules/conversations/application/turn-text-buffer.ts](../../apps/backend/src/modules/conversations/application/turn-text-buffer.ts)

- [apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts)

- [apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts)

- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-source.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-source.ts)

- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-turn-admission.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-turn-admission.ts)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts)
- [apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts](../../apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts)
- [apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission.ts](../../apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission.ts)
- [docs/adr/0046-admin-owned-text-ai-routing.md](../../docs/adr/0046-admin-owned-text-ai-routing.md)
- [apps/web/src/fsd/features/knowledge-notes/lib/learning-block-form.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/learning-block-form.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/block-form-definition.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/block-form-definition.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/block-form-read-context.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/block-form-read-context.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/read-block-form.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/read-block-form.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/read-media-block-form.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/read-media-block-form.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/read-text-block-form.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/read-text-block-form.ts)
- [apps/web/src/fsd/features/knowledge-notes/lib/read-exercise-block-form.ts](../../apps/web/src/fsd/features/knowledge-notes/lib/read-exercise-block-form.ts)
- [learning-unit-call.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-unit-call.ts).
