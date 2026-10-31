---
type: backlog-task
id: BL-018
title: Codebase-wide mechanical formatting and lint normalization
status: done
created: 2026-10-31
updated: 2026-11-01
original_tasks: '2026-10-31 approved readability rollout split'
evidence:
    - .agent/improvements/codebase-mechanical-formatting.md
depends_on:
    - BL-012
---

# BL-018 — Codebase-wide mechanical formatting and lint normalization — Done

[Backlog index](INDEX.md) · [Shared constraints](README.md).

## Scope and acceptance

- Inventory maintained handwritten backend, web, admin, mobile, packages, scripts,
  tooling and tests, including applicable styles/configuration. Exclude generated/
  native output, dependencies, caches, immutable snapshots, historical artifacts
  and lockfiles; never hand-edit generated files.
- Use installed formatter support for JS/TS/JSX, styles, JSON/YAML/HTML and related
  configuration. Inventory unsupported SQL/shell sources separately and preserve
  them byte-for-byte; their manual clarity review belongs to BL-019 rather than
  introducing an unreviewed formatter or rewriting database logic in this pass.
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

Delivery evidence: [mechanical formatting record](../../.agent/improvements/codebase-mechanical-formatting.md).

## Completion and remaining scope

Normalized formatter-supported maintained source and enabled strict shared lint.
Independent source/evidence review approves scoped completion: maintained formatting,
lint, types, complete serial workspace tests, production builds and all 15 critical
flows/819 cases have passing evidence. One existing lazy-media browser precondition
was corrected without weakening assertions; the original failed run is retained.

The delivery record identifies the unchanged historical root-format/catalog
failures. SQL/shell review, deeper clarity work and removal of the three exact
persistence ceilings remain BL-019. This task does not claim aggregate `pnpm check`
is green or that formatter success completes semantic readability review.

The separately authorized [formatting/catalog follow-up](../../.agent/improvements/catalog-and-formatting-maintenance.md)
subsequently resolves those two baseline gate failures and verifies aggregate
`pnpm check`. Original BL-018 execution evidence is retained.
