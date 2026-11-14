---
type: adr
id: ADR-0058
title: Named activity content and source provenance
status: accepted
date: 2026-11-13
supersedes: 'ADR-0052 grounding limited to existing passage references; other decisions remain accepted'
---

# ADR-0058: Named activity content and source provenance

## Context

The authorized named-text-exercise feature requires vocabulary senses, grammar
rules and selected prose as well as existing passage references. A rendering
format cannot identify the pedagogical task or its checking policy. Model-authored
origins and repeated full source output would undermine exact grounding and the
existing bounded request allowance. ADR-0052's passage-only grounding statement
therefore needs a focused extension; its authority, execution and privacy rules
remain binding.

## Decision

Accepted within Feature067 as an extension of existing contracts and source-bound
execution. Keep activity identity/version, objective, prepared key or rubric,
checking policy and frozen provenance in published exercise content. Display
metadata is SDK-independent; detailed authoring rules remain backend-only. A
manual Custom exercise deliberately has no named semantics. Named edits and
revisions preserve their identity or require explicit manual conversion to Custom.

The operation host resolves selected vocabulary entries/senses, grammar rules,
passages or an exact frozen prose selection under its existing source authority.
Models select bounded source identities, not source text or permission claims.
The host restores exact frozen values before canonical content validation. A
dependent generation task uses validated predecessor outputs, never guessed
future block IDs. Full source material is sent once per authoring context;
only selected activity definitions and schemas join that call.

Local block provenance retains matching block/item references in the document;
changes participate in server-generated semantic revisions. Proposal/excerpt
origins describe frozen content already captured under authority. They never
grant access to another conversation/note, authorize a remote fetch, or bypass
current note/attempt access. Independent copies own their copied content and
remap local identities; a historical origin does not turn them into a live
permission to read the original. Published content never embeds private attempts
or evaluation feedback.

Prepared, hybrid and rubric checking remain distinct. Prepared matching makes
no model call; unknown hybrid answers stay unchecked; explicit AI evaluation uses
the existing source-bound durable job and lease/accounting fences. Learning
outcomes are independent from execution status. Neither partial correctness nor
an inability to assess counts as correct progress. Existing provider-call,
memory-call, output, deadline and explicit publication controls are unchanged.

## Alternatives considered

### Use format and free-form titles as activity identity

Would leave eligibility, checking policy and meaningful revisions ambiguous, and
allow an edit to silently lose the task's intended semantics.

### Let the model emit full frozen sources

Would accept reconstructed or invented provenance and duplicate large material in
every question. ID-only bindings plus host capture preserve exact sources under
the current request limits.

### Dereference historical origins on every copied-content read

Would make an independent authorized copy depend on access to its former source.
Frozen content remains self-contained; only local block references and existing
current note/private-attempt authority are live dependencies.

## Consequences

### Positive

- All 19 named tasks share explicit content and checking contracts.
- Copies, revisions and historical private answers retain meaningful identity.
- Selected-only authoring avoids adding an autonomous agent or cost authority.

### Negative

- Writers, copy helpers, semantic revisions and source validation must agree.
- Structured feedback changes need real database publication/fencing proof.

### Risks / limitations

- Schemas and deterministic validators cannot prove pedagogical quality; they
  enforce identities, coverage and source bindings, not semantic model judgment.
- Missing or oversized exact sources require clarification or a bounded refusal,
  without reconstructed substitutes or partial publication.
- Automated SDK/HTTP fixtures establish reproducible wiring, not live availability
  or the quality of an unobserved provider response.

## Related

- [ADR-0050](0050-interactive-workbook-content-and-learning-boundaries.md).
- [ADR-0052](0052-source-bound-knowledge-ai-actions.md), partially superseded only
  for eligible grounding material.
- [ADR-0055](0055-learning-content-context-and-publication.md).
- [Feature067](../../.agent/features/067-named-text-exercises/FEATURE.md).
