---
type: adr
id: ADR-0053
title: 'Knowledge prose headings and thematic breaks'
status: accepted
date: 2026-10-30
supersedes: 'None; extends the allowlisted prose implementation under ADR-0042'
---

# ADR-0053: Knowledge prose headings and thematic breaks

## Context

The user explicitly approved extending the Knowledge document format to H1 and
horizontal rules. The original Markdown insertion slice mapped H1 to H2 and
rejected rules because prose admitted only H2/H3. Editor, shared reader, proposal
preview, copied documents, source material and target offsets must agree on the
new safe nodes without changing old documents or granting HTML execution.

## Decision

Add H1 to the validated heading levels1/2/3 and a leaf `horizontalRule` node to
the common bounded prose contract used by existing body versions1/2. Version1
continues to mean prose-only; version2 permits typed interactive blocks. This
additive change needs no data migration or new version discriminator. Existing
saved documents and explicitly copied materials are never reinterpreted.

Coordinate all existing writers/readers through public contracts. Render only
fixed h1/h2/h3/hr elements; a rule cannot carry attributes, text, children or
marks. Retain topology, node/depth/size limits, safe URL checks and raw-HTML
rejection. A rule contributes no meaningful publication/search text by itself.
Its editor node size is1, so position walkers treat it atomically. Editor hash
text retains the existing pinned editor leaf/separator semantics; retrieval
text remains a separate source projection and is not used as that identity hash.

Markdown insertion and preview preserve H1/H2/H3/rules, mapping only H4–H6 to H3
with a notice. Preview uses the same validated document rendering as acceptance.
It cannot apply content, resolve a target, publish or call AI. Existing explicit
acceptance, undo, stale-target protection and Save publication remain unchanged.

This accepts a necessary, compatible extension within the existing architecture
and explicit user scope; it creates no provider, infrastructure or cost commitment.

## Alternatives considered

### Keep H1 mapping and simulate rules with punctuation

That does not provide the approved semantic headings or a real thematic break.

### Introduce a new body version and migrate old documents

No discriminator semantics, entity identity or interpretation of old content
changes. A new version/migration would add unnecessary storage and reader paths.

## Consequences

- Old v1/v2 documents remain valid without rewriting; supported new prose round
  trips through recovery, Save, revisions, sharing and independent copy.
- Web/backend/contracts must be deployed together; an older validator can reject
  the newly authored nodes. No mobile/admin Knowledge renderer currently exists.
- Readers/writers must explicitly handle atomic non-text nodes in offset walkers.
- This decision does not expand HTML, code blocks, media, permissions or billing.

## Related

- [ADR-0042](0042-knowledge-workspace-document-and-context-boundaries.md)
- [ADR-0050](0050-interactive-workbook-content-and-learning-boundaries.md)
- [Architecture](../architecture.md)
- [F059 scope](../../.agent/features/059-interactive-workbooks/FEATURE.md)
- [F059 plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md)
