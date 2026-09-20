---
name: improvement-development
description: Deliver a cohesive Languon tooling, developer-experience, bounded internal refactor, or existing-contract UX enhancement with one record and proportional verification. Use when broader than a correction without adding product capability or crossing root feature boundaries. Do not use for an explicitly requested feature/full lifecycle.
---

# Improvement development

Apply root `AGENTS.md` classification before creating artifacts. Use this flow
for one focused enhancement that exceeds correction scope while preserving
existing product semantics, public contracts, persistence, security policy,
production dependencies, and deployment. A needed development-only dependency
is permitted. Use `$correction-development` for a bounded low-risk adjustment.

## Record and execute

Create or resume `.agent/improvements/<slug>.md` from
`.agent/templates/IMPROVEMENT.md`. Record the outcome, scope, constraints,
affected guides, verification, and rollback/removal path when relevant.

Follow the [shared delivery procedure](../../../.agent/DELIVERY.md). Keep scope,
plan, evidence, review decisions, and risks in this one record. Apply specialist
skills according to changed surfaces; focused work does not bypass browser,
database, security, or guide verification requirements. Independent review is
risk-based under root policy, not automatic feature ceremony.

If discovery crosses a root feature boundary, mark the record `Escalated`,
preserve discoveries, and obtain feature authorization before expanded
implementation. Reuse authorization already given for that scope.

## Close

Complete author preflight and the root Definition of Done. Mark the record
`Complete` with valid evidence, review decisions, remaining risks, and rollback
notes. Work on the current branch; this flow authorizes no automatic commit,
merge, push, or deletion.
