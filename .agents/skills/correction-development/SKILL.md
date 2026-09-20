---
name: correction-development
description: Implement bounded low-risk Languon maintenance of established behavior with one record and proportional verification. Use for local configuration, one-screen copy/style changes, or small established-behavior fixes. Do not use for focused enhancements or changes crossing root feature boundaries.
---

# Correction development

Apply root `AGENTS.md` classification before creating artifacts. A correction is
one bounded adjustment to established behavior, with no feature boundary crossed.
Count conceptual scope and risk, not files or lines.

## Record and execute

Create or resume `.agent/corrections/<slug>.md` using
`.agent/templates/CORRECTION.md`. Record current/expected behavior, scope,
relevant constraints, affected guides, and proportional verification. Keep
plan, evidence, review decisions, and risks in this one file.

Follow the [shared delivery procedure](../../../.agent/DELIVERY.md). A correction
normally needs a small implementation and targeted checks, not milestones, a
full repository suite, or routine subagents. Actual browser/database/security
risk still triggers the appropriate specialist verification. Use independent
review when root risk criteria warrant it, then follow `$code-review` modes.

If scope grows, mark this record `Escalated` and link its successor. Continue
under `$improvement-development` when improvement conditions hold; otherwise
obtain feature authorization before expanded implementation. Preserve discoveries
and reuse authorization already given for that scope.

## Close

Complete author preflight and the root Definition of Done. Mark the record
`Complete` with valid evidence and remaining risks. Work on the current branch;
this flow authorizes no automatic commit, merge, push, or deletion.
