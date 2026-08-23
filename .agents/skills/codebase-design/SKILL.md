---
name: codebase-design
description: Design or evaluate deep, testable Languon modules at established DDD, FSD, package, and infrastructure seams. Use for module interface design, significant refactors, shallow pass-through layers, duplicated orchestration, misplaced dependencies, difficult test seams, or comparison of alternative internal designs. Do not use for routine component styling or mechanical cleanup. Route implementation through the root correction/improvement/feature classifier; significant or cross-boundary design changes need explicit feature authorization.
---

# Codebase design

## Read the established architecture

Read the applicable `AGENTS.md`, active durable state, historical feature,
correction, or improvement artifacts that established the target seam, relevant
accepted ADRs,
architecture documentation, public exports, callers, adapters, and tests. When
the current active work is unrelated, treat it only as scope context and use the
target seam's governing artifacts for design evidence. Use the repository's
existing terms—such as bounded context, application service, HTTP API, React
component, FSD slice, package, port, and adapter—when they convey real
architectural meaning.

## Evaluate module depth

A module is deep when callers learn a small, stable interface that hides
substantial coherent behavior and decisions. Depth should create:

- **leverage**: many callers obtain useful behavior through a small interface;
- **locality**: related rules, failures, and verification remain together;
- **testability**: behavior can be exercised through the same meaningful seam
  used by callers.

Apply these checks:

- **Deletion test**: if the module vanished, would its complexity disappear or
  merely scatter across callers?
- **Interface burden**: do callers need to understand ordering, configuration,
  invariants, or adapter details the module should own?
- **Variation test**: does a port represent real alternate adapters or a
  meaningful trust/test seam, rather than hypothetical flexibility?
- **Failure locality**: can the module express its error modes without leaking
  infrastructure or transport details into domain callers?
- **Boundary fit**: does the seam preserve backend DDD dependencies, frontend
  FSD imports, and package public-export rules?

Small internal functions are compatible with a deep external interface. Avoid
adding layers that only rename, forward, or expose the same complexity.

## Compare designs

For a material design choice, produce at least two genuinely different
interfaces or seam placements. Compare them on caller burden, invariants,
locality, adapter needs, error semantics, test surface, migration cost, and
alignment with accepted ADRs. Prefer the smallest design that addresses current
evidence; do not introduce a reusable abstraction for speculative future use.

When `$domain-modeling` applies, resolve domain terminology before naming the
module interface. When implementation is authorized, keep the decision in the
active `EXEC_PLAN.md` and use `$testing` to define verification through the
chosen seam.

## Report or implement according to scope

A design or review request produces evidence, alternatives, recommendation,
affected paths, and residual risks without changing code. An implementation
request follows the active correction, improvement, or feature workflow;
significant module or cross-boundary changes need explicit feature
authorization. Surface an ADR conflict instead of silently designing around it.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's `codebase-design`
skill. The reviewed upstream source and license are recorded in
[`docs/agent-skills.md`](../../../docs/agent-skills.md); Languon architecture
terms and repository instructions remain authoritative.
