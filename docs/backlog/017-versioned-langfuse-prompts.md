---
type: backlog-task
id: BL-017
title: Versioned Langfuse prompt resolution
status: pending
created: 2026-10-31
updated: 2026-10-31
original_tasks: '2026-10-31 future Langfuse prompt management discussion'
evidence: []
---

# BL-017 — Versioned Langfuse prompt resolution

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Problem and outcome

The prompt package exports a Langfuse client, but the tutor calls a synchronous
local string getter. Admission budgeting and execution independently read the
local prompt. Introduce managed prompts without changing versions mid-operation
or making deterministic tests depend on a remote service.

## Scope and acceptance

- Add server-side prompt resolution behind an application/infrastructure boundary,
  with named prompts, version/label selection and checked-in local fallbacks.
  Initially cover the tutor and the learning-content generators introduced by
  BL-013 when present; inventory consumers before agreeing final scope.
- Resolve and pin one prompt bundle for an admitted operation. Budget calculation,
  execution and nested authoring use the same resolved bytes/version; retries and
  worker handoff must not silently pick up a newer remote revision.
- Define bounded fetch timeouts, caching, outage/missing-prompt behavior and
  controlled activation/rollback. Tests use local fixtures without credentials.
- Record prompt identity, source, version and an appropriate content fingerprint
  with execution evidence. Keep secrets and raw learner prompts out of logs.
- Keep content schemas, authorization, budgets and completion checks in code.
  Decide whether tool descriptions are configurable prose while their typed
  contracts remain application-controlled.
- Demonstrate that an activated prompt revision affects new operations, an
  in-flight operation remains pinned, fallback is observable, and rollback works.

## Verification and delivery preparation

Requires explicit feature authorization for the remote integration and any
snapshot/persistence changes. Design against existing prompt and accounting
boundaries; validate official Langfuse API behavior when implementation begins.
No remote prompt writes, credentials or activation are authorized by this backlog.

Verify deterministic resolution/cache/failure paths, byte-consistent budgeting,
worker replay, default/reduced allowances and production composition. Separate
local correctness from configured-service readiness and optional live proof.
Apply security review to changed external-service/secret boundaries and document
setup, activation and rollback using applicable existing operations guides.

## Starting points and sequencing

- `packages/prompts/src/index.ts`, `packages/prompts/src/local/`
- `apps/backend/src/modules/conversations/application/tutor-context-budget.ts`
- `apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts`

No hard BL dependency; implementation after BL-013/015 avoids migrating interfaces
while their design is still changing. Future expansion to unrelated AI capabilities
is a separate scope decision, not an implicit repository-wide prompt migration.
