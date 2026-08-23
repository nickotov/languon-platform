---
name: domain-modeling
description: Sharpen Languon's ubiquitous language by reconciling product terms, code, contracts, user-flow guides, and domain behavior. Use when defining or changing a domain concept, resolving ambiguous or conflicting terminology, designing DDD modules and contracts, or explicitly creating or updating a domain glossary. Do not use merely to rename implementation details or to create an ADR without a durable architectural decision.
---

# Domain modeling

## Gather authoritative usage

Read the applicable `AGENTS.md`, active feature, correction, or improvement state, relevant
user-flow guides, accepted ADRs, contracts, domain source, and existing product
documentation. Search for every material use of the disputed terms. Treat code
and documentation contradictions as findings to resolve, not as permission to
choose whichever wording is convenient.

## Sharpen the model

For each concept:

1. state the current meanings and where each appears;
2. identify overloaded words, synonyms, hidden lifecycle states, ownership, and
   identity assumptions;
3. reason through concrete happy-path, boundary, failure, concurrency, and
   authorization scenarios that are relevant to the concept; run executable
   checks only when the request and active verification workflow require them;
4. select one precise canonical term only when the evidence and intended product
   behavior support it;
5. map deprecated or contextual synonyms explicitly when existing interfaces
   still expose them.

Keep product language independent of TypeScript classes, database tables,
routes, vendors, and UI labels unless those names are themselves domain
concepts. Do not invent a distinction that has no observable behavior.

## Record resolved language

Update an existing domain glossary when one applies. If none exists, create
`docs/domain-language.md` only when the user explicitly requested a glossary or
the active feature has resolved at least one durable cross-feature term. Keep
the glossary concise:

```markdown
## Canonical term

One-sentence domain definition.

- Invariants: rules that always hold.
- Relationships: other canonical terms and cardinality or ownership.
- Avoid: ambiguous or deprecated synonyms and what they mean instead.
```

Feature-local language remains in `FEATURE.md` or `EXEC_PLAN.md` until it is
stable across features. Update affected contracts, code, guides, and tests only
when the active request authorizes implementation and the delivery workflow
requires it.

Use the repository ADR policy unchanged. A terminology decision is not an ADR
by default; create or propose one only when the root criteria for a durable,
costly-to-reverse architectural choice are satisfied.

## Verify consistency

Search for conflicting definitions and misleading synonyms after the change.
Run affected documentation, contract, and application checks. Record unresolved
ambiguity and its product impact in active durable state instead of presenting
an uncertain definition as canonical.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's `domain-modeling`
skill. The reviewed upstream source and license are recorded in
[`docs/agent-skills.md`](../../../docs/agent-skills.md); Languon repository
instructions and ADR policy remain authoritative.
