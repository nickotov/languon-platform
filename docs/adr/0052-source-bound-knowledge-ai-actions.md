---
type: adr
id: ADR-0052
title: Source-bound knowledge AI authoring and evaluation
status: accepted
date: 2026-10-29
supersedes: None
---

# ADR-0052: Source-bound knowledge AI authoring and evaluation

## Context

The user selected Magic Patterns v16 for the interactive workbook extension and
authorized the associated block editing, chat proposal and inline exercise logic.
They confirmed vocabulary/bilingual field AI actions, unprepared audio blocks and
free prepared checking with optional AI feedback for every exercise format.
These actions need real source authorization and accounting; prototype timers,
sample translations and simulated grades cannot implement them.

## Decision

Keep Knowledge responsible for note ownership, working branches, source access,
private attempts and typed result acceptance. Reuse the existing durable Texts AI
job infrastructure for a server-only versioned knowledge-action subtype. It uses
the established text-translation routing capability, admission, native provider
receipts, bounded retries, lease fences, cancellation and settlement. It creates
no Text item or library destination. Ordinary Text translation/history/apply APIs
must reject these internal actions. Dedicated field and evaluation HTTP surfaces
return their own validated contracts.

Field actions capture one explicitly allowed vocabulary or bilingual translation
field and its local editing values. Live owner access to the note and working
branch is required, including when the block is a new local dialog draft. A
field result is a suggestion, not a note mutation: Accept changes the local field,
Apply changes the working document, and Save publishes. Stale or cancelled
results cannot overwrite newer manual edits.

Exercise evaluation captures a private persisted learner attempt, its exercise
revision and saved source basis. Recheck source access and attempt ownership at
admission, execution, publication and result reads. A narrow database operation
publishes AI feedback only with the active worker lease and successful accounting
witness. Recognize valid alternatives explicitly; prepared checking and answer
reveals remain separate from AI evaluation and incur no new model call.

Use operation-bound structured Mastra agents behind these admitted jobs. Keep
the contextual tutor's existing typed block-proposal tool for full block
generation and updates. This decision does not require extra nested model calls
or independent autonomous agents. Any later specialist calls must share the
parent action's aggregate authorization and budget. Canonical composition
registers the agents; default Studio execution excludes them without an
authenticated, durable source-bound action context.

Speech reuses the existing speech worker, reviewed profiles and accounting.
Snippet requests select authorized source fields from working blocks, saved
material or owned proposals, rather than trusting client text. Local audio
authoring may submit a bounded frozen text draft under live note/branch ownership;
it produces a private preview, then an explicitly accepted asset. No note content
changes until the author applies the dialog. Shared capability secrets are
stored as digests, and all delivery paths recheck access.

Permanent source deletion removes private prompts, result excerpts and source
bindings, including jobs whose historical working branch was discarded. Keep
only the independently required financial facts. Independent content/library/media
copies retain their own authority. Historical branch identifiers do not acquire
permissions and must not cause deletion cleanup to lose a source association.

Exercise sets remain presentation groups over individual exercise identities.
Optional group/parent metadata does not ground a question or change its semantic
revision. Grounding requires explicit existing passage references. Copying media
includes its associated questions; copying an ungrounded question alone may
detach its presentation parent. Copies consistently remap identities.

## Alternatives considered

### Direct model calls from editor or learner HTTP handlers

Would bypass the existing durable admission, settlement and cancellation path.
Do not introduce an unaccounted synchronous shortcut.

### A new generic AI job service or autonomous agent per block

Would duplicate mature financial/source authority without an independent
deployment or scaling requirement. Keep the typed module boundaries and the
existing bounded execution pipeline.

### Hidden conversation turns for field checking

Would mix local editing actions with tutor conversation/history semantics and
complicate atomic result targeting. Field actions have their own explicit jobs.

## Consequences

### Positive

- The approved interactions share established providers and financial controls.
- Reusable block UI remains independent of editor, chat and model SDK details.
- Per-question history survives grouping and presentation changes.

### Negative

- Internal Texts infrastructure must distinguish knowledge actions on every
  queue, source, read, completion and cleanup path.
- Migrations and restricted-worker integration evidence are required together.

### Risks / limitations

- A prototype or isolated agent test does not prove authorized execution or
  financial settlement; retain production-composition and real database tests.
- This record authorizes no new model/provider, production activation or paid
  generation. Existing routing configuration remains authoritative.
- Courses, group-wide context, pronunciation assessment and automatic remote
  video understanding remain deferred.

## Related

- [ADR-0045](0045-action-accounting-and-provider-expenses.md).
- [ADR-0046](0046-admin-owned-text-ai-routing.md).
- [ADR-0049](0049-native-provider-pricing-and-accounting.md).
- [ADR-0050](0050-interactive-workbook-content-and-learning-boundaries.md).
- [Feature and fidelity inventory](../../.agent/features/059-interactive-workbooks/FEATURE.md).
- [Execution plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md).
- [Selected design](../../.agent/features/059-interactive-workbooks/DESIGN.md).
