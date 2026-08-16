---
name: prototype
description: Build a disposable Languon prototype to answer one explicit product, state-model, interaction, or visual-direction question before production implementation. Use only when the user explicitly invokes `$prototype` or explicitly requests a throwaway prototype, design spike, state simulator, or multiple UI alternatives. Do not use for production implementation, routine bug reproduction, or verification of an existing user journey.
---

# Prototype

## Define the question

State one decision the prototype must make easier and the observable evidence
that will answer it. Choose the smallest fitting shape:

- **logic/state question**: create a deterministic state simulator with visible
  state, actions, invalid transitions, and guided edge-case scenarios;
- **interaction/visual question**: create several meaningfully different
  variants with the same content and a simple local switcher;
- **technical feasibility question**: exercise only the uncertain seam and
  record measured constraints.

If the unresolved question materially affects product behavior, data,
security, billing/legal semantics, or an accepted ADR, obtain the required user
decision before treating a prototype outcome as specification.

## Isolate the prototype

Default to a uniquely named directory under `/private/tmp`; use another
repository-approved temporary directory on non-macOS systems. Put a prototype
inside the active feature workspace only when durable collaboration requires
it. Do not create a branch, commit, package dependency, migration, production
route, or application import solely for the prototype.

Use fake local data and deterministic fallbacks. Never use production accounts,
credentials, meaningful personal data, paid model calls, or shared mutable
infrastructure. Prefer self-contained HTML/CSS/JavaScript or a small script that
runs with tools already present in the repository; avoid CDN dependencies.

## Optimize for learning

Implement only behavior needed to answer the question. Surface relevant state
and transitions directly. Include enough failure and boundary cases to expose a
misleading happy path, but omit production polish, abstraction, compatibility,
and exhaustive testing that do not improve the decision.

When visual inspection is required, use `$browser-verification` only if the
prototype can run through the safe local wrapper. Otherwise provide the local
artifact and exact safe viewing command; opening a GUI still requires normal
authorization.

## Capture the answer and clean up

Record the question, explored variants or scenarios, observed evidence,
decision, rejected alternatives, and remaining uncertainty in the active
feature `EXEC_PLAN.md` or the user-facing result. Translate only the validated
decision into the production specification. Delete temporary prototypes after
their evidence is captured unless the user explicitly asks to retain an
artifact; report its path and lifecycle when retained.

Production implementation starts or resumes the applicable feature workflow
and adds normal tests, docs, review, and verification independently of the
prototype.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's `prototype` skill.
The reviewed upstream source and license are recorded in
[`docs/agent-skills.md`](../../../docs/agent-skills.md); Languon repository and
Git policies remain authoritative.
