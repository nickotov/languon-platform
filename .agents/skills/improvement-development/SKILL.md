---
name: improvement-development
description: Deliver a focused Languon engineering or UX improvement with one concise record and proportional verification. Use for cohesive developer-experience, tooling, local configuration, bounded internal refactor, or existing-contract UI improvements that are broader than a correction but add no product capability or executable journey; examples include a small web-dev-panel UI improvement or introducing Prettier. Do not use when the user explicitly requests a feature/full feature lifecycle, or for a new capability, journey, public contract, persistence, security policy, production dependency, deployment, migration, or ADR-worthy architecture decision.
---

# Improvement development

## Confirm the route

Read the closest `AGENTS.md` and do enough read-only discovery to confirm all of
the following:

- the user did not explicitly request a feature or `$feature-development`;
- the outcome is one coherent enhancement, not a new product capability or
  executable journey;
- existing product semantics, public contracts, persistence, auth/security
  policy, and deployment model remain unchanged;
- a development-only dependency, local tooling standard, bounded internal
  refactor, or existing-contract visual implementation is sufficient; and
- focused verification can establish confidence without feature milestones.

Use `$correction-development` when the work is only an established low-risk
fix. If discovery reaches a feature safety boundary, do not begin feature work
implicitly: mark the improvement `Escalated`, preserve the evidence, and ask the
user to explicitly authorize feature delivery.

## Create one improvement record

Create `.agent/improvements/<slug>.md` from
`.agent/templates/IMPROVEMENT.md`. Record the observed problem, expected
outcome, scope, excluded feature boundaries, affected constraints, proportional
checks, user-flow impact, and rollback or removal path for tooling changes.

Work on the current branch by default. Do not create a feature branch, commit,
merge, push, delete, or add a production dependency unless the user separately
authorizes it.

## Implement and verify

Implement one focused patch. Prefer existing patterns and avoid a reusable
abstraction unless it is already established. Add the smallest reliable
regression coverage where behavior is deterministic.

Run the affected formatter, lint, typecheck, build, and tests in proportion to
the changed surface. Use `$browser-verification`, `$db-verification`,
`$user-flow-e2e`, `$testing`, or `$code-review` when their actual risk triggers
apply; these skills retain their normal authority and are not replaced by this
flow. Update an existing user-flow guide only when its documented behavior or
commands changed.

## Finish

Inspect the final diff for unrelated changes, generated artifacts, and secrets.
Mark the improvement record `Complete` only after it includes exact checks and
results, documentation decisions, review decisions, remaining risks, and any
follow-up that would require an explicitly requested feature.
