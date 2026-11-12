---
type: backlog-task
id: BL-014
title: Tutor and learning-tool playground
status: done
created: 2026-10-31
updated: 2026-11-12
original_tasks: '2026-10-31 Mastra Playground discussion'
evidence: []
depends_on:
    - BL-013
---

# BL-014 — Tutor and learning-tool playground

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Problem and outcome

The Studio entry point composes the development-verification harness, not the
operation-bound tutor. Canonical production registration alone does not expose
the tutor or its authorized tools in Studio. Enable useful local testing against
synthetic contexts using the production factories and BL-013 tool interfaces.

## Scope and acceptance

- Register synthetic tutor/tool composition in the existing guarded Mastra
  harness. Use the same factories as production; do not maintain Studio-only
  copies of prompts, generation logic or schemas.
- Supply synthetic identity, source snapshots, memory, bounded accounting and
  proposal persistence callbacks. Writes stay in isolated disposable playground
  storage and never use a production learner's authority or data.
- Provide fixtures for an empty owned document, vocabulary-to-exercise follow-up,
  grammar revision, missing language, ambiguous request and read-only source.
- Allow inspection of model input, tool selection, validated arguments/results
  and proposal content using synthetic data. Demonstrate multi-turn testing and
  reproducible fixture reset without changing ordinary user environments.
- Expose only explicitly registered primitive IDs/routes. Preserve loopback,
  Host/Origin, model-destination, request-shape, step and concurrency restrictions.
- Default automated verification uses deterministic providers; live execution
  requires the existing explicit configuration and AI smoke policy.
- Document startup, scenario selection, failures and the difference between
  Studio execution proof and application rendering/Apply/Save proof.

## Verification and delivery preparation

Requires explicit feature authorization for the harness execution-boundary
extension. Read the full current harness guide and policy before design.
Add focused policy/registration and real-SDK regressions, disposable persistence
proof and real Studio browser evidence. Use independent security review and a
separate tester if the resulting harness is substantial under root policy.
Update mapped harness user flows. Do not claim Studio proves app UI behavior.

## Starting points and sequencing

- `apps/backend/src/mastra/index.ts`, `composition.ts`, `development-server-policy.ts`
- `apps/backend/src/modules/development-harness/`
- [Mastra harness guide](../user-flows/mastra-agent-development-harness.md)

Depends on BL-013 so the harness targets the dedicated generation interfaces.
Fixtures can later grow with BL-015/016; their completion is not required for
this task. The dependency order may be explicitly revised if an earlier minimal
playground becomes preferable. No implementation is authorized by this task.

## Authorized delivery — 2026-11-12

User explicitly authorized [feature065](../../.agent/features/065-tutor-learning-tool-playground/FEATURE.md) before exercise work, followed by usage documentation and user inspection. Implementation and selected verification are complete.

## Completion evidence — 2026-11-12

Delivered [feature065](../../.agent/features/065-tutor-learning-tool-playground/FEATURE.md), with [evidence](../../.agent/features/065-tutor-learning-tool-playground/EVIDENCE.md) and independent completion/security approval. Studio exposes the canonical persisted tutor workflow and four tools plus proposal readback. Selected static/build/policy, disposable DB/SDK accounting and actual browser checks pass. See [usage instructions](../tutor-playground.md). Deterministic fixtures are ready; live requires operator configuration in the isolated database. No paid provider execution or turnkey admin bootstrap is claimed. Exercises await user inspection of this playground.
