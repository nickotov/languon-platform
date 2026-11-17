---
type: diagram
title: Named text exercises
summary: Knowledge sources become reviewed named questions; deterministic practice and explicit private AI feedback remain separate from published content.
source_paths:
    - apps/web/src/fsd/features/knowledge-notes/lib/editor-insertion-target.ts
    - docs/adr/0059-typed-conversation-prompt-mentions.md
    - packages/contracts/src/conversation-prompt-mentions.ts
    - apps/web/src/fsd/features/knowledge-notes/hooks/use-editor-insert-picker.ts
    - apps/web/src/fsd/widgets/contextual-assistant/lib/prompt-document.ts
    - apps/web/src/fsd/entities/learning-blocks/ui/exercise-activity-preview/exercise-activity-preview.tsx
    - apps/backend/src/modules/conversations/application/exercise-mention-resolution.ts
    - docs/adr/0058-named-activity-content-and-source-provenance.md
    - docs/adr/0055-learning-content-context-and-publication.md
    - packages/contracts/src/exercise-activity.ts
    - packages/contracts/src/exercise-activity-catalog.ts
    - packages/contracts/src/exercise-generation.ts
    - packages/contracts/src/named-exercises.ts
    - packages/contracts/src/workbook-learning.ts
    - apps/web/src/fsd/widgets/contextual-assistant/hooks/use-exercise-composer.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/exercise-generation.ts
    - apps/web/src/fsd/entities/learning-blocks/lib/check-prepared-answer.ts
    - apps/backend/src/modules/conversations/application/exercise-picker-resolution.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/exercise-source-resolution.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/exercise-authoring-context.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/exercise-activities/definitions.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-authoring.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-tools.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-content-proposals.ts
    - apps/backend/src/modules/development-harness/infrastructure/mastra/tutor-playground-service.ts
    - apps/backend/src/modules/knowledge/domain/named-exercise-semantics.ts
    - apps/backend/src/modules/knowledge/infrastructure/ai/exercise-evaluation-provider.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source.sql
    - docs/user-flows/interactive-workbooks.md
    - apps/backend/src/modules/development-harness/infrastructure/mastra/tutor-playground-primitives.ts
    - apps/backend/src/modules/administration/infrastructure/ai-catalog/tool-definitions.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source.ts
    - apps/web/src/fsd/features/knowledge-notes/lib/read-exercise-block-form.ts
    - docs/adr/0060-composable-generation-runs.md
    - packages/contracts/src/generated-artifacts.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-generation-plan.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-worker.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/workbook-copy.ts
source_fingerprint: sha256:9f12277d88a7382201ea8425a4d25330c5e524aaec6775d8c931b19e503e0406
reviewed: 2026-11-16
---

# Named text exercises

The shared catalog identifies 19 pedagogical activities independently from the
three rendering formats. This view follows their Knowledge authoring and practice
boundaries; it adds no provider, worker pool or publishing authority.

```mermaid
flowchart TB
    Catalog["19 versioned activity identities
localized metadata and fixed checking policies"] --> Picker["Owner source menu or tutor picker
Automatic or selected activities; count and languages"]
    Picker --> Send
    Catalog --> Discovery["Space slash menu or inline chat picker"]
    Discovery --> Preview["Local synthetic interactive preview
no model, mutation or saved progress"]
    Discovery --> Custom["Manual Custom forms
single or grouped questions; no named semantics"]
    Discovery --> Send["Prepare request; learner explicitly sends
typed choices plus editable prose"]
    Prose["Owner free-form exercise request"] --> Plan["Existing request planner
activity allocation and source requirements"]
    Send --> Mentions["Validate typed activity/source ranges
persist canonical text plus identity metadata"]
    Mentions --> Plan
    Plan --> Ground["Host resolves exact authorized material
vocabulary, grammar, passage or frozen selection"]
    Studio["19 standalone Studio tools
isolated synthetic session authority"] --> Ground
    Ground -->|"Missing, oversized or conflicting"| Clarify["Clarify or refuse without partial publication
retain admissible frozen context"]
    Ground --> Author["Only selected definitions and schemas
dependency-ready tasks; bounded action capacity"]
    Author --> Bind["Model selects source IDs
host restores exact values and validates artifacts"]
    Bind -->|"Invalid; bounded repair allowance"| Author
    Bind -->|"Validated call"| Checkpoint["Private durable artifacts + accepted receipt
atomic lease/revision fence"]
    Checkpoint -->|"Unfinished plan"| Continue["Pause; explicit fresh quoted Continue
reuse valid artifacts; reviewed revision invalidates descendants"] --> Author
    Checkpoint -->|"All tasks and aggregate valid"| Proposal["One complete mixed Knowledge v2 proposal
ordered prose + typed blocks; no partial insert"]
    Proposal --> Review["Explicit Review and Insert or Update
working branch only"]
    Review --> Save["Explicit Save
immutable published content and semantic revision"]
    Save --> Copy["Independent copy
fresh local IDs; stable activity and historical origins"]
    Save --> Check["Ordinary Check
prepared key, hybrid match or rubric policy"]
    Check -->|"Prepared answer matches"| Correct["Correct without a model call"]
    Check -->|"Prepared-key mismatch"| Incorrect["Incorrect without a model call"]
    Check -->|"Unknown hybrid or rubric answer"| Unchecked["Unchecked; no inferred correctness"]
    Attempt["Signed-in private saved attempt"] --> AI["Explicit Check with AI
available for every exercise format"]
    Save --> Attempt
    AI --> Job["Existing accounted Texts AI job and worker
validate structured criteria and corrections"]
    Job --> Fence["Recheck source, share, revision and epoch
current lease and settled provider execution"]
    Fence --> Feedback["Actor-private result
correct, partial, incorrect or unable to assess"]
    Feedback --> Progress["Only correct counts as correct progress
published exercise and key remain unchanged"]
```

## Ownership and failure boundaries

The picker prepares a request; it does not send, generate or publish automatically.
Explicit activity/count choices must agree with editable prose, while Automatic
mode retains valid planner choices. Studio fixes one activity identity per tool;
the ordinary tutor actor still has four high-level learning-content tools.

Eligible sources are Knowledge vocabulary entries/senses, explicit grammar rules,
bilingual passages and exact selected prose. A source may also be an authorized
same-conversation proposal or a validated earlier task output. This is not a new
dependency on global Texts storage. Models supply bounded ID bindings; the host
captures the original values and provenance. Missing source, conflicting choices
or insufficient remaining capacity cannot produce a partly applicable proposal.
A validated stage may pause privately; explicit Continue admits a fresh bounded
action. Impossible units require a scope change rather than repeated empty stages.
The parent action retains its five-provider-call/two-memory-call and output limits.

Local source IDs are validated against the current document and participate in
semantic revisions. Independent copies remap their local references; historical
proposal/selection origins stay frozen and never authorize another source read.
Generated prose carries immutable artifact provenance. Run-captured blocks carry
frozen captured-block origins so Keep snapshot does not rebind to current local
content; independent copies preserve captured-block origins without remapping their
historical IDs. Refresh rechecks access and invalidates affected dependent artifacts.
Published content contains no learner attempts or evaluation feedback. Cosmetic
edits preserve learning progress; substantive manual named edits require explicit
conversion to Custom, which deliberately omits named semantics. AI revision keeps
the original named identity and host-owned provenance.

Prepared matching normalizes NFC and whitespace while retaining case, accents,
punctuation and script. Anonymous prepared practice remains local; durable private
attempts and AI evaluation require the existing signed-in access. Explicit AI may
reconsider a private prepared result without changing its published key. Learning
outcomes are separate from job success/failure; partial and unassessed outcomes
do not become correct progress. Privacy and live-share revocation checks apply
again at publication, after provider settlement.

Deterministic tests establish contracts and execution wiring, not live-provider
pedagogical quality. See [Conversations and Knowledge](conversations-and-knowledge.md)
for the surrounding workspace, [AI lifecycle](ai-job-lifecycle.md) for accounting,
and [the workbook guide](../user-flows/interactive-workbooks.md) for verified journeys.

## Sources

- [Prepared source and generated-artifact projections](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-generation-plan.ts).
- [Composable run decision](../../docs/adr/0060-composable-generation-runs.md).

- [Catalog and policies](../../packages/contracts/src/exercise-activity-catalog.ts).
- [Named semantics and frozen provenance](../../packages/contracts/src/named-exercises.ts).
- [Picker projection](../../apps/web/src/fsd/features/knowledge-notes/lib/exercise-generation.ts).
- [Exact source resolution](../../apps/backend/src/modules/conversations/infrastructure/ai/exercise-source-resolution.ts).
- [Selected-only authoring](../../apps/backend/src/modules/conversations/infrastructure/ai/learning-content-authoring.ts).
- [Atomic proposal publication](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-content-proposals.ts).
- [Prepared matching](../../apps/web/src/fsd/entities/learning-blocks/lib/check-prepared-answer.ts).
- [Fenced private feedback publication](../../apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source.sql).
- [ADR-0058](../adr/0058-named-activity-content-and-source-provenance.md).
