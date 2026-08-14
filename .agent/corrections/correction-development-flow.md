# Correction: Add a lightweight correction development flow

Status: Complete
Created: 2026-08-14
Updated: 2026-08-14

## Routing decision

- Intended outcome: route bounded low-risk work through one concise plan and
  proportional verification instead of the full feature artifact/review/merge
  lifecycle.
- Why this is a correction: this is one coherent repository-workflow adjustment
  with no application capability, runtime contract, persistence, migration,
  deployment, or product architecture change. The user explicitly requested the
  lightweight flow, so this document also bootstraps it.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true; this changes no capability, contract, data/security policy,
  dependency, deployment, product decision, or coordination model.
- Escalation rule: switch to feature development whenever any root correction
  condition becomes false, including expansion into automated workflow
  enforcement that changes Git, CI, or deployment behavior.

## Context and scope

- Current behavior: small changes can trigger the same four-artifact, dedicated
  branch, full-validation, E2E, and independent-review lifecycle as a feature.
- Expected behavior: agents classify work before creating feature artifacts and
  select the correction flow when all low-risk conditions hold.
- In scope: root routing rules, correction plan template, repository correction
  skill, feature-skill exclusion, and agentic-development documentation.
- Out of scope: changing CI, Git hooks, deployment, application behavior, or
  weakening tests and reviews required by actual risk.
- Likely files/surfaces: `AGENTS.md`, `.agent/templates/CORRECTION.md`,
  `.agents/skills/{correction-development,feature-development}/`, and
  `docs/agentic-development.md`.
- Relevant ADRs or constraints: no ADR is required; this is engineering workflow
  guidance rather than a product/runtime architecture decision.
- Related user-flow guides: none; no executable application journey changes.

## Plan

- [x] Define mutually exclusive correction/feature routing conditions and
      escalation rules.
- [x] Implement and validate the repository-scoped correction skill.
- [x] Update agent/developer documentation and feature-skill boundaries.
- [x] Exercise the classifier against representative local and feature-sized
      requests.
- [x] Inspect the final diff and record results below.

## Verification

| Check                   | Result                                            |
| ----------------------- | ------------------------------------------------- |
| Skill validation        | Official `quick_validate.py`: `Skill is valid!`   |
| Formatting and links    | Prettier checks pass; referenced artifacts exist  |
| Routing examples        | Independent audit: 10/10 classified as intended   |
| Documentation/user-flow | No user-flow guide required; workflow-only change |

## Outcome and evidence

- Changes made: added root correction-versus-feature routing and Definition of
  Done rules; one correction template; the repository-scoped
  `$correction-development` skill; explicit feature-skill exclusion; and matching
  repository/developer documentation.
- Commands and results:
  - the official `quick_validate.py` skill validator, invoked through
    `uv run --quiet --with pyyaml`, passed after both implementation and review
    remediation. The first sandboxed attempt could not access the normal uv
    cache; the approved rerun succeeded without changing project dependencies.
  - `pnpm format:check` — passed.
  - targeted explicit Prettier check for all changed Markdown/YAML artifacts —
    passed.
  - referenced-artifact existence checks and routing-rule search — passed. One
    initial search misquoted a backticked status token in zsh; the safely quoted
    rerun passed.
  - `git diff --check` — passed before final evidence update and rerun for final
    handoff.
- Documentation: updated `AGENTS.md`, `.agent/PLANS.md`, feature workspace and
  root README guidance, and `docs/agentic-development.md`. No application
  behavior, command result, or user journey changed, so no `docs/user-flows`
  guide or E2E revision applies.
- Review: one bounded independent semantic audit exercised local port, one-screen
  UI, bug-fix, origin, OAuth, persistence/API, deployment, design-system,
  migration-escalation, and authorization cases. It found two Medium wording
  gaps (unconditional browser evidence and incomplete escalation summaries);
  both were remediated, and focused re-review returned `PASS` with no remaining
  material contradiction or downgrade loophole.

## Remaining risks

- Natural-language classification still requires judgment. The all-conditions
  correction rule, any-trigger feature rule, contextual examples, and mandatory
  escalation whenever a correction condition becomes false limit that risk.
- A new Codex session is needed before relying on the newly added project skill
  being present in the session's discovered skill catalog.
