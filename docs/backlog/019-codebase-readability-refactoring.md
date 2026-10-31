---
type: backlog-task
id: BL-019
title: Codebase-wide readability review and refactoring
status: pending
created: 2026-10-31
updated: 2026-11-01
original_tasks: '2026-10-31 approved readability rollout split'
evidence: []
depends_on:
    - BL-012
    - BL-018
---

# BL-019 — Codebase-wide readability review and refactoring

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Scope and acceptance

- Enumerate maintained backend/frontend/shared/tooling source deterministically
  using BL-018 exclusions. Read implementation logic; track each file as reviewed
  and acceptable, refactored, or deferred with a concrete reason. Report coverage
  and all deferrals; formatter output is not evidence of clarity review.
- Include BL-018's 37 unsupported SQL/shell source files in the review inventory;
  they were deliberately preserved by the mechanical formatter pass, not judged
  readable or excluded from source review. Migrations/generated output remain out.
- Deliver bounded module/application batches with meaningful names, explicit
  decisions, cohesive helpers and reason/invariant comments. Avoid shallow
  wrappers, arbitrary splitting, speculative abstractions and blanket memoization.
- Backend review includes orchestration/configuration, predicates, transactions
  and errors. Frontend includes nested JSX, state transitions, cohesive hooks,
  handlers and derived values.
- Remove BL-018's exact temporary persistence size allowances through cohesive
  refactoring: conversation-turn-admission (505), text-content-mutations (502),
  texts-job-admission (504). Restore their ordinary 500-line limits; do not compress
  formatting or weaken the shared size rule to clear the exceptions.
- Preserve behavior, DDD/FSD, contracts, persistence semantics, side-effect order,
  concurrency, cancellation, errors, React hooks/identity/dependencies, rendered
  states and accessibility. Escalate changes crossing root feature boundaries.
- Run affected checks per batch, including applicable real browser/device,
  disposable DB, security and AI execution regressions. Retain independent review,
  meaningful existing assertions, patch-specific evidence and feasible rollback.
- Run full automated regressions, formatting, lint, type checks, production builds
  and affected critical/mapped journeys after integrated batches. Resolve introduced
  regressions and document baseline failures/unavailable prerequisites explicitly.
- Completion requires source coverage, justified residual deferrals, demonstrated
  clarity improvements and valid final evidence. Do not complete unrelated backlog
  or feature scope through a cleanup claim.

## Delivery preparation

User authorized staged cleanup on 2026-10-31; depends on BL-012/018. Use bounded
improvement records per batch or one cohesive record with explicit batch evidence.
No authorization for new capabilities, framework/database replacement, production
migration, paid AI evaluation or deployment. Determine final breadth by inventory,
not arbitrary file/line targets. Keep this separate from BL-018's mechanical diff.
