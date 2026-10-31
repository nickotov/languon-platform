---
type: backlog-task
id: BL-018
title: Codebase-wide mechanical formatting and lint normalization
status: pending
created: 2026-10-31
updated: 2026-11-01
original_tasks: '2026-10-31 approved readability rollout split'
evidence: []
depends_on:
    - BL-012
---

# BL-018 — Codebase-wide mechanical formatting and lint normalization

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Scope and acceptance

- Inventory maintained handwritten backend, web, admin, mobile, packages, scripts,
  tooling and tests, including applicable styles/configuration. Exclude generated/
  native output, dependencies, caches, immutable snapshots, historical artifacts
  and lockfiles; never hand-edit generated files.
- Capture pre-change formatting/lint/type/test/build baselines and distinguish
  existing failures from regressions.
- Apply BL-012 formatter and reviewed safe lint fixes only. No renaming, helper
  extraction, effect reordering or business-logic rewrite. Review braces for
  dangling-else/lexical-scope behavior; compare ASTs where useful.
- Expand strict readability lint enrollment across maintained JS/TS code and
  tests, preserving generated exclusions and persistence-specific constraints.
  Normal lint must enforce the normalized state.
- Run repository formatting, lint, type checks, complete automated tests and
  production builds. Record exact prerequisites and unavailable required evidence;
  diagnose failures without weakening tests or claiming skipped checks pass.
- Keep the mechanical diff separate from BL-019 semantic clarity refactors;
  independently review it and document rollback and tested patch identity.

## Delivery preparation

User authorized staged cleanup on 2026-10-31; select after BL-012. Expected
improvement flow if behavior/contracts remain unchanged. Use the testing skill
for safe infrastructure and additional applicable E2E/browser/DB gates. Full
automated regression is explicitly requested. No paid calls, shared-data resets
or production changes. Source readability judgment belongs to BL-019.
