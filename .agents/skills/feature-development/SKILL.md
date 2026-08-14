---
name: feature-development
description: Implement a Languon feature autonomously from repository specification through exploration, ExecPlan milestones, proportional testing, real-app verification, independent review, remediation, and recorded evidence. Use for new capabilities or journeys, cross-boundary work, public contracts, persistence/migrations, auth/security policy, deployment decisions, significant refactors, multi-milestone delivery, or whenever FEATURE.md and EXEC_PLAN.md govern. Do not use for work that satisfies the root correction-flow criteria; use correction-development instead.
---

# Feature development

## Confirm feature classification

Apply the correction-versus-feature routing rules in root `AGENTS.md` before
creating a branch or feature artifacts. Do not launch this workflow merely
because a small change also needs tests, documentation, or several matching
configuration edits. If all correction conditions hold, use
`$correction-development` instead unless the user explicitly requires the full
feature lifecycle.

Never downgrade feature-sized work to a correction to avoid review. New user
capabilities, public contracts, data/migration work, auth or security policy,
deployment decisions, cross-cutting architecture, and multi-milestone work stay
in this flow.

## Establish durable context

1. Read the root and closest workspace `AGENTS.md` files.
2. Locate `.agent/features/<feature>/FEATURE.md` and existing `EXEC_PLAN.md`.
3. If the feature workspace is missing, run
   `pnpm feature:new -- <slug> "<title>"` and complete `FEATURE.md`.
4. Scan `docs/user-flows/*.md` frontmatter for the feature slug and affected
   source paths, then read every related guide.
5. For every related current guide, run
   `pnpm user-flow:e2e -- inspect <guide-feature-slug>` and read its mapped
   tests. The guide slug can differ from the active feature slug.
6. Read relevant architecture documentation and inspect Git state.
7. Treat repository files as authoritative over conversation memory.

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
6. Use `$user-flow-e2e` whenever guide test-relevant behavior changes; update
   scenarios, real tests, markers, and execution evidence together.
7. Continue without waiting for routine approval.

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
For every affected current guide, run
`pnpm user-flow:e2e -- check <guide-feature-slug>` and execute its mapped E2E
journeys.

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
