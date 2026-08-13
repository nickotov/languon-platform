---
name: feature-development
description: Implement a Languon feature autonomously from repository specification through exploration, ExecPlan milestones, proportional testing, real-app verification, independent review, remediation, and recorded evidence. Use for non-trivial feature work, cross-workspace changes, significant refactors, or whenever FEATURE.md and EXEC_PLAN.md govern delivery. Do not use for a tiny isolated edit that does not require a durable plan.
---

# Feature development

## Establish durable context

1. Read the root and closest workspace `AGENTS.md` files.
2. Locate `.agent/features/<feature>/FEATURE.md` and existing `EXEC_PLAN.md`.
3. If the feature workspace is missing, run
   `pnpm feature:new -- <slug> "<title>"` and complete `FEATURE.md`.
4. Scan `docs/user-flows/*.md` frontmatter for the feature slug and affected
   source paths, then read every related guide.
5. Read relevant architecture documentation and inspect Git state.
6. Treat repository files as authoritative over conversation memory.

## Explore and plan

Use `explorer`, `architect`, or `product-owner` subagents for bounded,
non-overlapping investigation when useful. Require file references and verified
facts in their returns.

Create or update `EXEC_PLAN.md` according to `.agent/PLANS.md`. Translate every
acceptance criterion into milestones and explicit unit, integration, contract,
E2E, browser/device, migration, and security checks. Record assumptions and
critical architectural uncertainty before implementation.

## Implement milestones

For each milestone:

1. Implement one coherent behavior slice.
2. Run the narrowest relevant checks.
3. Diagnose and fix root causes of failures.
4. Update progress, decisions, discoveries, validation, and remaining work in
   the ExecPlan.
5. Keep every affected user-flow guide aligned with changed commands, behavior,
   expected results, edge cases, and source-path metadata.
6. Continue without waiting for routine approval.

Preserve unrelated changes and applicable DDD, FSD, package-boundary, schema,
security, and secret-handling constraints.

## Validate and capture evidence

Use `$testing` to select and run proportional automated checks. Use
`$browser-verification` for user-visible web behavior and `$db-verification` for
schema, query, transaction, or migration changes.

Run all relevant workspace checks and then the appropriate broader suite. Write
exact commands, concise results, observed journeys, artifacts, and remaining
risks to `EVIDENCE.md`; do not paste unbounded logs.

Create or update required `docs/user-flows/<feature-slug>.md` guides according
to the root instructions. Run `pnpm docs:user-flows:check` and record which guide
steps were verified; prose never substitutes for required automated tests.

## Review and remediate

Request an independent `reviewer` after implementation. Request
`security-reviewer` for the risk triggers listed in root `AGENTS.md`. Provide the
specification, ExecPlan, diff, and evidence without coaching reviewers toward an
expected result.

Write findings and resolutions to `REVIEW.md`. Fix valid findings, add regression
coverage when needed, rerun affected checks, and repeat review after material
changes.

## Finish

Return done only when the repository Definition of Done is satisfied, all
required user-flow guides match current behavior, and all feature artifacts
reflect reality. Return blocked only for a genuine external dependency or user
decision that cannot be safely resolved from repository context; record the
blocker and completed work in the ExecPlan.
