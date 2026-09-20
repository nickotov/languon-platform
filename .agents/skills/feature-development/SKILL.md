---
name: feature-development
description: Deliver an explicitly requested Languon feature from specification through verified completion and independent review. Use when the user asks to create a feature, invokes $feature-development, or requests the full feature lifecycle. Do not use for corrections or focused improvements; follow root classification.
---

# Feature development

## Establish the feature

Confirm feature authorization under root `AGENTS.md`. Reuse existing authorized
scope; do not request permission again at routine milestones. Preserve root
feature branch, local-commit, and squash-merge policy.

Read the applicable instructions and locate `.agent/features/<slug>/FEATURE.md`
and the current `EXEC_PLAN.md`. If absent, use
`pnpm feature:new -- <slug> "<title>"` and complete the specification. Follow
`.agent/PLANS.md` and the [shared delivery procedure](../../../.agent/DELIVERY.md)
for artifact ownership, implementation, preflight, and completion.

## Plan and deliver slices

Give each acceptance criterion a stable ID in `FEATURE.md`. Link those IDs from
milestones and evidence; do not copy their text into each artifact. Before UI
fidelity implementation, build the source-derived inventory in the specification
using `$ui-ux-composition`. Record material uncertainty and required verification
in the plan. Each milestone must have observable completion evidence.

Discover affected guides through feature/source mappings, inspect their current
E2E mappings, and keep them synchronized under root policy and `$user-flow-e2e`.
Record a concrete not-applicable reason when no executable journey exists.

Implement coherent slices, run focused checks, and update current progress and
next action. Use bounded exploration/delegation when useful. Do not schedule a
reviewer after each task by default.

## Review and finish

After author preflight, request an independent completion reviewer using
`$code-review`. Apply root separate-tester and security-review triggers; assign
complementary questions rather than duplicate valid verification. Record findings
in `REVIEW.md`, remediate in batches, and use remediation review for the affected
surface. Review again broadly only when the risk surface expands.

Finish only when root Definition of Done is met and the four artifacts reflect
the final implementation. Evidence gaps remain explicit; a passing build or
review-cycle threshold never overrides required proof or unresolved defects.
