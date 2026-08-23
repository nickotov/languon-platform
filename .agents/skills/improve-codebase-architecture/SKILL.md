---
name: improve-codebase-architecture
description: Survey a focused Languon subsystem for evidence-backed architecture friction and deepening opportunities without implementing a refactor. Use only when the user explicitly invokes `$improve-codebase-architecture` or explicitly requests an architecture-health survey, deep-module review, or refactor-candidate report. Do not use during routine feature implementation, as a style audit, or to justify speculative abstractions.
---

# Improve codebase architecture

## Set a bounded survey scope

Use the subsystem, concept, or pain point named by the user. If none is named,
inspect recent history for repeatedly changed paths and select one coherent hot
spot; state the selection before widening it. Read applicable `AGENTS.md`, the
historical feature, correction, or improvement artifacts governing the surveyed subsystem,
accepted ADRs, architecture documentation, related user-flow guides, and domain
language before evaluating source. Inspect unrelated active durable work only
to detect overlap or scope conflicts; do not treat it as the surveyed
subsystem's design authority.

Use `$codebase-design` for module-depth and seam analysis. Invoke
`$domain-modeling` only when conflicting domain language materially obstructs
the survey; an architecture review does not automatically authorize glossary
or ADR edits.

## Gather evidence

Trace public interfaces, callers, dependencies, data and error flows, tests,
and recent changes. Look for observed friction:

- one concept requires coordinated changes across scattered callers;
- pass-through modules add interface burden without owning decisions;
- infrastructure or transport details leak across DDD or package seams;
- a behavior cannot be tested through the interface used in production;
- repeated bugs or changes cluster around unclear ownership;
- frontend composition or state crosses established FSD boundaries.

Apply deletion, interface-burden, failure-locality, and variation tests from
`$codebase-design`. Do not score files by size, count layers mechanically, or
infer a refactor need from aesthetic preference.

## Present candidates

Return no more than five candidates. For each include:

- exact files and current execution path;
- concrete friction and supporting evidence;
- proposed responsibility or seam change in plain language;
- expected leverage, locality, and test improvement;
- migration scope, risks, and affected acceptance behavior;
- ADR alignment or explicit conflict;
- recommendation strength: `Strong`, `Worth exploring`, or `Speculative`.

Include a compact before/after diagram only when it materially clarifies
relationships. Lead with the strongest candidate and explain why it outranks the
others. It is valid to report that current architecture is adequate.

Default to a Markdown response. Create a self-contained local HTML report only
when the user requests an artifact; use no CDN resources, store it under
`/private/tmp` by default, and do not open it without normal GUI authorization.

## Preserve review scope

This skill reports and recommends; it does not modify application code. If the
user asks to implement a candidate, classify that work independently under the
root correction/improvement/feature rules—significant module and cross-boundary refactors
are feature-sized. Record rejected candidates only when their rationale is
durable and the active workflow has an appropriate authoritative home.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's
`improve-codebase-architecture` skill. The reviewed upstream source and license
are recorded in [`docs/agent-skills.md`](../../../docs/agent-skills.md);
Languon repository instructions and accepted ADRs remain authoritative.
