---
type: survey
title: Compact tool context for Knowledge chat
research_date: 2026-11-06
source_paths:
    - apps/backend/src/modules/conversations/application/tutor-context-budget.ts
    - apps/backend/src/modules/conversations/application/tutor-message-context.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-configuration.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-operations.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-messages.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-proposals.ts
    - packages/contracts/src/contextual-assistant.ts
---

# Compact tool context for Knowledge chat

## Recommendation and scope

Give tool execution, canonical storage, model context, and browser presentation
separate representations. Full validated arguments are necessary to execute a
tool correctly. A model rarely needs every argument and result repeated in
every subsequent prompt. Keep completed work addressable through server-issued
references and concise deterministic outcomes, retrieve exact content when it
is needed, and use semantic memory for older conversational facts.

This survey records the research that informed
[feature 061](../../.agent/features/061-reliable-learning-content-pipeline/FEATURE.md)
and [ADR-0055](../adr/0055-learning-content-context-and-publication.md). The source
audit below describes revision `89ff4193`, before that implementation. It extends
the investigation in the
[active incident record](../../.agent/improvements/learning-content-batching.md).
The reported rejection of a71-character question remains a distinct phase-budget
bug: the worker reserves74214units against64000 before calling any model.
Tool-history compaction alone cannot fix that pre-dispatch arithmetic.

Confirmed constraints: preserve exact requested words/counts and source authority;
do not silently truncate the current editor or copied references; keep all calls,
including observation/reflection, inside the admitted action budget. No provider,
framework, production dependency or financial ceiling change is proposed.

## Source audit at revision 89ff4193

Reviewed source at89ff4193. The preceding incident review only changed its work
record; runtime source was unchanged during this research.

| Representation        | Current behavior                                                                                                                                         | Implication                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public tool activity  | `ConversationToolCallSchema` contains ID, name and state; durable UI events use that projection.                                                         | Browser chat already avoids exposing raw private tool arguments/results.                                                                                                       |
| Proposal write result | `propose_learning_blocks` returns ID and `requiresLearnerApply`; note-writing tools also return a small receipt.                                         | These results are already compact. Adding output projection to them would save little.                                                                                         |
| Source read result    | `read_source_context` returns selected text/material with coverage, bounded at24000UTF-8bytes.                                                           | Actual task-relevant text is useful; do not replace a necessary read with a receipt that contains no usable content.                                                           |
| SDK memory            | `ConversationMemoryMessages` serializes SDK message parts into private `modelContent`, and reloads those parts for model history.                        | Tool arguments/results and historical source snapshots can be retained privately and later reintroduced. No selective tool-history filter is configured in tutor construction. |
| Semantic memory       | Tutor memory already uses thread-scoped Observational Memory; observation/reflection models pass through the shared accounting gate.                     | Reuse this seam rather than adding an unrelated summary service or a model call after every tool.                                                                              |
| Knowledge planner     | Its prompt is composed directly with bounded recent visible messages, pending requirements, and proposal descriptors.                                    | Adding a processor to the legacy prose agent alone would not automatically fix this separately composed context.                                                               |
| Prior proposals       | Up to8descriptors include bounded titles/kinds/terms; full blocks are eagerly loaded server-side into a local map, but the planner receives descriptors. | Existing source receipts are a useful foundation. Do not claim entire prior blocks are always replayed to the planner.                                                         |
| Proposal HTTP reads   | The separate block-proposals endpoint returns full learning-block artifacts.                                                                             | Repeated downloads are the previously diagnosed refresh problem, not proof that raw model-tool traces are exposed.                                                             |

Source evidence:
[public contracts](../../packages/contracts/src/contextual-assistant.ts),
[source and note tools](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts),
the retired block write tool (`git show 89ff4193:apps/backend/src/modules/conversations/infrastructure/ai/contextual-block-tools.ts`),
[memory projection](../../apps/backend/src/modules/conversations/infrastructure/ai/conversation-memory-messages.ts),
[memory configuration](../../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-configuration.ts),
[proposal descriptors](../../apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-proposals.ts).

`lastMessages: 20` configures the operation/prose agent's history load, not database
retention. OM replaces observed portions of that agent's active context while raw
canonical rows remain stored. The Knowledge planner independently reads6recent
visible messages, caps each at2000characters, and constructs its own prompt. It
does not automatically receive that operation agent's OM observations or history
processors. Its bounded state/projection must therefore be addressed explicitly.

## Primary-source findings

### Mastra: separate tool results from model-visible results

Mastra provides `toModelOutput` for tools whose application result is richer than
the next model call requires. Its current tools documentation separately
describes `transform` for display/transcript payloads: changing one representation
does not automatically change the others. Use the former for model context and
retain Languon's existing explicit public projections for browser safety.
[Tools: model output and display transforms](https://mastra.ai/docs/agents/tools).

### Mastra: remove completed historical tool exchanges selectively

The current `ToolCallFilter` reference describes transient prompt filtering that
does not rewrite stored history. It can target tools, preserve recent tool-producing
steps, and retain compact model-output text while removing raw arguments/results.
Treat completed historical exchanges differently from an active tool interaction;
a blanket deletion policy can remove information the next step still needs.
[ToolCallFilter](https://mastra.ai/reference/processors/tool-call-filter).

This describes the **current online reference**, not the behavior guaranteed by
our pinned built-in. The installed-version distinction below changes which
mechanism is appropriate for Languon.

### Mastra: compact history, then check the actual prompt

Current `TokenLimiterProcessor` documentation describes per-call prompt budgeting,
with tool-call/result grouping and transient trimming. Ordering matters: filtering
before counting avoids reserving content that the model will never receive.
Its default token estimation and trimming behavior are not equivalent to our
financially authoritative UTF-8 bound, so it cannot replace the shared dispatch
gate without a separate compatibility and accounting decision.
[TokenLimiterProcessor](https://mastra.ai/reference/processors/token-limiter-processor).

Mastra's context-engineering guide recommends compact references and targeted
tools for current application data. Its long-conversation guidance favors
Observational Memory, which replaces old active history with observations while
retaining recent unobserved messages. The storage record and active prompt need
not be identical. Stable prompt prefixes also help cache reuse, but caching does
not make an oversized prompt fit.
[Context engineering](https://mastra.ai/docs/guides/context-engineering),
[Observational Memory](https://mastra.ai/docs/memory/observational-memory).

### Anthropic: targeted retrieval and clearing obsolete tool output

Anthropic describes loading information on demand through lightweight references,
and clearing old tool exchanges as a practical context-compaction technique.
Its tool-design guidance emphasizes relevant fields, bounded responses, filtering
and pagination. Concise versus detailed output can be useful when the task needs
different levels of detail. Preserve the identifiers actually needed for later
actions, accompanied by meaningful labels; removing all IDs is unsuitable for
our source-bound proposal operations.
[Context engineering for agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents).

### LangChain: transient context and protocol-valid message history

LangChain distinguishes per-model-call context from persistent tool/state data.
It recommends selecting tools for the current stage and using lifecycle hooks
for context preparation. Its short-term-memory documentation covers trimming
and summarization, and warns that message edits must preserve valid tool-call
and matching-result sequences. This supports compacting completed exchanges as
units rather than deleting arbitrary messages or slicing serialized JSON.
[Context engineering](https://docs.langchain.com/oss/python/langchain/context-engineering),
[Short-term memory](https://docs.langchain.com/oss/python/langchain/short-term-memory).

## Installed-version compatibility

Inspected the installed declarations and runtime for `@mastra/core1.57.0` and
`@mastra/memory1.26.0`, independently of the current web documentation. No upgrade
is required to use the supported model-output and transient-hook seams.

| Capability                    | Verified pinned behavior                                                                                                                                                                            | Consequence                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTool.toModelOutput`    | Supported in `dist/tools/tool.d.ts`; raw result remains in tool invocation data, with model projection in `providerMetadata.mastra.modelOutput`. Provider conversion and OM prefer that projection. | Use for rich application outputs whose immediate model representation can be smaller.                                                         |
| `ToolCallFilter`              | Uses `processInput` and optional `processInputStep`, not the newer `processLLMRequest` implementation. Supports `exclude`, `filterAfterToolSteps`, and `preserveModelOutput`.                       | It edits/returns MessageList data, so do not assume filtering is transient or that raw persistence stays unchanged without testing.           |
| `preserveModelOutput`         | Requires an existing stored model-output projection; otherwise filtered result data disappears.                                                                                                     | It does not invent a useful receipt, and cannot independently offer a full immediate read and a different concise historical read.            |
| `TokenLimiterProcessor`       | Uses `processInputStep` and MessageList removal; keeps whole messages rather than protecting tool-call/result groups. Does not count tool/structured schemas.                                       | It can break pairs or remove a large current editor message. It is not a sufficient safeguard for our source contract or financial admission. |
| Processor `processLLMRequest` | Already supported in `dist/processors/index.d.ts`; its documented installed contract makes returned prompt changes transient.                                                                       | A focused pair-aware historical projection can operate without rewriting stored messages.                                                     |
| OM tool handling              | Uses model-output projections when present; otherwise formats raw results. Defers observation during incomplete calls and preserves unobserved call/result dependencies.                            | Reuse its accounting-bound memory behavior, but do not confuse semantic observations with deterministic per-tool projection.                  |

The pinned OM observer also limits individual formatted tool results using an
internal10000estimated-token default; this is not an exposed per-tool policy.
Do not rely on that internal truncation to preserve every learning entry or exact
source passage. Observer instructions guide a model rather than enforce an exact
artifact transformation.

These findings come from inspected package code, not a runtime persistence test.
The recommended implementation still requires provider-shaped integration and
readback tests. In particular, current online claims about built-in filters'
transient behavior and token limiter pair grouping must not be copied into our
implementation assumptions.

## Proposed application policy

### Execute exact inputs; return only useful results to the model

Validate full tool arguments before execution. Do not shorten arguments before
permission checks, persistence, evaluation or publication. The exact generated
learning block remains the canonical artifact used by Review/Apply/Save.

For a completed proposal write, the model-facing outcome can contain:

```json
{
    "proposalId": "<server-issued-id>",
    "status": "created",
    "kind": "vocabulary",
    "title": "Shopping vocabulary",
    "entryCount": 50,
    "language": "fr",
    "translationLanguage": "ru",
    "requiresLearnerApply": true
}
```

This is an illustrative projection, not a new approved schema. All values must
come from validated/persisted output. It conveys completion and supports later
reference without echoing50entries. It must not imply that Apply or Save happened.

For a source read, return the actual selected content needed to answer. Keep exact
terms, relevant passages, required structured IDs and coverage/source-version
metadata. Reduce irrelevant fields and duplicate wrappers, not pedagogically
necessary data. If complete source coverage is requested and cannot fit, fail
explicitly or ask for a narrower scope; never silently return a sample as complete.
`toModelOutput` applies to the immediate next model step too: anID-only projection
of `read_source_context` would hide the very text that next step needs.

### Keep compact outcomes for completed historical calls

Create prompt-only projections of completed tool exchanges. Retain tool/outcome,
human-readable subject, canonical reference, source version, counts, languages,
coverage and important failure state. Read full source content again only when
the current request needs it. Preserve ordering and stable identities.

Keep in-flight calls/results intact until their dependent step finishes. A
read result used to write an exercise cannot disappear just because a token
threshold is crossed. Current-call output projection is not historical argument
clearing: `toModelOutput` by itself does not remove the assistant's tool arguments.

For the current pin, implement this historical projection through a small
`processLLMRequest` processor, grouping exchanges by tool-call ID and retaining
current dependencies. Target an explicit allowlist of well-understood tools.
Build receipts deterministically from validated outcomes and source descriptors;
do not add a model summarization call for each tool result. Treat the built-in
`ToolCallFilter` as an alternative requiring evidence about persistence behavior,
not a drop-in equivalent to the newer reference implementation.
This changes the provider prompt, not today's earlier reservation arithmetic.
The phase-budget/admission repair must separately budget the projected per-phase
envelopes; installing a transient processor alone would leave the reported
pre-dispatch rejection unchanged.

Never use a summary as permission or publication authority. Every source read,
revision, Apply and Save continues through the existing authorization and stale
version checks. Expired/deleted/unavailable artifacts require clarification.

### Preserve exact snapshots without replaying every old snapshot

Keep the current complete editor snapshot once in the applicable model-call
envelope, as required by
[ADR0042](../adr/0042-knowledge-workspace-document-and-context-boundaries.md).
Keep historical immutable source records available through the existing private
store, but project older context to provenance plus task-relevant outcomes when
reconstructing model history. Do not destructively rewrite the original user turn
or silently discard its copied source material.

The planner, author, legacy actor and memory engine need explicit context
construction policies. Summarizing an old tool result must not duplicate it in
both observations and raw history, nor duplicate the current editor in ordinary
history, pending-source expansion and tool results. When an older exact passage
is explicitly required, load the correct frozen version rather than current live
document content.

### Use deterministic projections before semantic summaries

A validated receipt or relevant-field projection needs no extra model call. Use
Observational Memory at bounded thresholds for semantic conversational continuity:
requested languages, unresolved requirements, exact chosen counts, learner
preferences and what has already completed. Do not ask a summarizer to regenerate
exact vocabulary inventories or source passages from memory.

Keep historical outcomes separate from current capability policy and active
requirements. An old capacity failure is not a permanent generation limit; an
old successful50-entry task is not the count of a new10-entry request. Preserve
failure stage/time and completion state so summaries cannot turn a failed write
into a usable proposal or revive an abandoned pending task.

Preserve the shared call/output/deadline/accounting limits. Any observation or
reflection remains an admitted model call; background summarization is not free
or an exception to the parent action's authority.

### Keep browser presentation separate

Continue sending only safe tool activity to the chat UI. Fetch canonical learning
block content when Review or rendering genuinely needs it; coalesce repeated
reads through existing query ownership. Fix lifecycle-based proposal polling
and redundant workspace/detail refreshes independently of model compaction.

## Alternatives and tradeoffs

| Approach                                              | Appropriate use                                              | Main limitation                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Full raw tool history forever                         | Very short traces or exact replay inspection                 | Repeated context cost, distraction and growing schema/input/result duplication.               |
| Compact deterministic results and historical receipts | Default for completed mutations and artifact-producing tools | Requires exact canonical readback for later content-dependent requests.                       |
| Targeted read results with complete coverage metadata | Answering/exercising/revising specific learning content      | Receipts alone are insufficient; necessary exact text still consumes context.                 |
| Semantic observations of older conversation           | Long tutoring threads and unresolved multi-turn requirements | Lossy; must not replace canonical artifacts or authority, and summary calls consume budget.   |
| Generic token trimming                                | Final protection for eligible historical context             | Can damage source completeness or tool-message validity unless protected inputs are explicit. |
| Larger model windows or higher environment limits     | A separately evidenced capacity requirement                  | Does not repair incorrect cross-phase reservation, redundant reads or duplicated history.     |

## Verification and remaining decisions

No model-quality benchmark or paid provider request was run. Official pages were
retrieved directly because the search connector returned405. Documentation claims
are not measured latency, quality, cost savings or an implementation guarantee.

Installed API/runtime inspection is complete as described above. Production
composition, persistence, replay and provider-prompt behavior of a newly composed
processor remain untested. Do not infer those guarantees from an exported type
or from a current online example alone.

Retain regression cases for:

- Proposal writes return a receipt while exact generated content survives Review,
  Apply, Save and reload.
- Follow-up requests can recover every term from the selected50-entry proposal;
  ambiguous sources still clarify and stale/deleted sources are inaccessible.
- The model receives a necessary source read, but no irrelevant old raw tool
  argument/result dump after completion; active call/result pairs stay valid.
- Topic/count changes, mixed pending components, explicit abandonment and genuine
  source ambiguity remain correct after compaction; old capacity refusals never
  become current execution policy.
- Exact current editor/copies survive and appear once in the relevant envelope;
  repeated failed turns and old snapshots do not inflate future prompts forever.
- Normal/reduced input and output allowances, cancellation, one global authoring
  repair and admitted observation/reflection remain authoritative.
- The production64000-unit journey that failed in the incident now executes the
  correct phase sequence and the browser makes bounded proposal/detail reads.

Measure the actual serialized model request before and after projection by phase
and tool: bytes, estimated/measured token usage, raw versus projected tool sizes,
call counts, latency and task/source correctness. Record numeric telemetry only;
do not log private learner prompts or full tool payloads. Tune history retention
from these results rather than choosing an arbitrary message count.
