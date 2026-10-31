---
type: backlog-task
id: BL-012
title: Enforceable code readability standards
status: pending
created: 2026-10-31
updated: 2026-10-31
original_tasks: '2026-10-31 tutor diagnosis and readability discussion'
evidence: []
---

# BL-012 — Enforceable code readability standards

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Problem and outcome

The tutor runner mixes model resolution, accounting setup, large memory
configuration, streaming and error mapping in one dense operation. SDK-specific
predicates require readers to reconstruct intent. Existing statement-padding
rules cover Drizzle persistence, leaving orchestration code without equivalent
guidance. Establish concrete readability standards and demonstrate them with a
behavior-preserving refactor of the tutor runner.

## Scope and acceptance

- Define one authoritative readability guide, linked concisely from applicable
  agent instructions. Cover logical phase spacing, braces, role-based names,
  meaningful predicates, cohesive helpers and comments explaining reasons,
  invariants and SDK constraints.
- Enforce mechanical spacing and braces through compatible ESLint rules;
  preserve Prettier ownership of formatting. Avoid blanket blank lines after
  every statement and arbitrary function-length limits.
- Add concrete author/reviewer checks to existing delivery and review guidance.
  Include examples that distinguish useful extraction from shallow forwarding.
- Refactor `contextual-tutor-runner.ts` as the reference: encapsulate model
  resolution/compatibility and cohesive memory construction; preserve important
  observation-order comments, cancellation, accounting, budgets and errors.
- Keep helpers local unless a cohesive module boundary justifies another file.
  Apply standards to new/substantively edited code; no repository-wide rewrite.

## Verification and delivery preparation

Expected route: improvement, subject to root classification at implementation.
Run focused lint-rule checks, affected lint/type checks and existing pinned-SDK
runner regressions. Apply the AI regression matrix to any changed execution seam.
Evaluate agent instructions with a bounded fresh-agent exercise and inspect the
result; formatting alone does not establish readability. Update instructions via
the writing-for-agents workflow. No product behavior change is intended.

## Starting points and boundaries

- `apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts`
- `scripts/eslint-persistence-readability.mjs`, `eslint.config.mjs`
- `AGENTS.md`, `apps/backend/AGENTS.md`, `.agent/DELIVERY.md`
- `.agents/skills/code-review/SKILL.md`

This task records future work; no implementation or Git operation is authorized
by its creation. Rules and example code must pass review before completion.
