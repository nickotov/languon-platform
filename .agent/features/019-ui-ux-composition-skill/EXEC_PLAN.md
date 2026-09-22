# ExecPlan: UI/UX composition skill

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-23

## Goal

Deliver a discoverable, concise UI/UX composition skill that makes future screen
work task-led, design-system-aligned, responsive, accessible, and render-verified.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- Repository skills live in `.agents/skills/<name>/` with a two-field
  `SKILL.md`, matching `agents/openai.yaml`, and optional one-hop resources.
- `scripts/check-agent-skills.mjs` requires name/directory agreement, concise
  frontmatter, all three UI metadata fields, and implicit invocation unless a
  skill is explicitly allowlisted.
- Root `AGENTS.md` remains authoritative for correction/feature classification,
  design source inspection, browser verification, testing, and Definition of
  Done. `writing-for-agents` requires new skills to preserve those boundaries.
- The skill-creator package requires initialization through `init_skill.py`,
  focused resources only, `quick_validate.py`, and realistic forward testing for
  a complex skill.

## Acceptance criteria

- [x] AC-1 — Valid skill package and implicit UI metadata.
- [x] AC-2 — Correct Compose/Implement/Review mode contract.
- [x] AC-3 — Complete inspect-to-render workflow.
- [x] AC-4 — Clear composition and anti-mechanical-design decision rules.
- [x] AC-5 — Severity-oriented post-render checklist reference.
- [x] AC-6 — Repository authority and verification routing preserved.
- [x] AC-7 — Validation, forward tests, and independent review pass.

## Test strategy

- Unit: Not required — no executable transformation logic is added.
- Integration: Not required — no runtime integration or service boundary changes.
- Contract: Required — skill-creator validation, repository skill validator,
  metadata/default-prompt checks, and pointer/file inspection.
- E2E: Not required — no product journey changes.
- Browser/device: Not required for this feature; the skill instructs future UI
  work to use rendered browser/device verification when applicable.
- Database migration: Not required — no persistence change.
- User-flow guide/E2E: Not required — agent-only instruction package.
- Forward testing: Required — fresh-context Compose, Implement, and Review
  prompts must demonstrate correct trigger, authority, mode, checklist use, and
  no mutation in review mode.
- Independent review: Required by feature workflow.
- Security review: Not required — no auth, data, rendering sink, external call,
  model-tool execution, or executable trust boundary changes.

## User-flow documentation

- No guide is required because this feature changes agent instructions only and
  adds no executable browser, API, mobile, admin, CLI, or system user journey.
- Related guides: none.
- User-flow E2E: not applicable for the same reason.

## Milestones

- [x] M1 — Contract and package design
    - Objective: translate the supplied workflow into repository acceptance and
      metadata requirements.
    - Components: feature artifacts, skill conventions, skill-creator guidance.
    - Acceptance criteria: AC-1 through AC-7 planned.
    - Required tests: source inspection.
    - Evidence: existing implicit skills and validators inspected; no ADR or
      user-flow guide is applicable.
- [x] M2 — Skill package implementation
    - Objective: initialize and author the skill, checklist, and UI metadata.
    - Components: `.agents/skills/ui-ux-composition/**`.
    - Acceptance criteria: AC-1 through AC-6.
    - Required tests: quick validation, repository skill check, formatting.
    - Evidence: Package initialized with the repository-required generator;
      repository validation and formatting pass.
- [x] M3 — Forward test, independent review, and merge
    - Objective: validate transferable behavior, remediate findings, and deliver
      the required local squash commit.
    - Components: final skill package and feature artifacts.
    - Acceptance criteria: AC-1 through AC-7.
    - Required tests: fresh-context forward tests, independent review, final
      repository checks.
    - Evidence: All three fresh-context mode tests passed; independent tester
      and reviewer passed after remediation; final affected checks passed on the
      squash-merged tree.

## Progress

- 2026-08-22 — Classified as a feature because it adds a new durable agent
  capability. Created `feature/ui-ux-composition-skill`, inspected the skill-
  creator, writing-for-agents, repository validator, metadata conventions, and
  feature workflow. Next: initialize and author the package.
- 2026-08-23 — Authored the skill, metadata, and rendered-review checklist.
  Fresh-context Compose, Implement, and Review forward tests passed. Independent
  tester and reviewer findings about mode boundaries, trigger overlap, and
  checklist duplication were remediated and re-reviewed successfully.
- 2026-08-23 — Squash-merged the feature onto `main`; final repository skill,
  formatting, and diff-hygiene checks passed on the resulting tree.

## Decisions

- D1 — Implicit invocation
    - Context: composition weakness should be corrected even when the user does
      not know to name the skill.
    - Choice: use normal implicit invocation with no policy override.
    - Alternatives rejected: explicit-only invocation would miss generated or
      existing screens whose hierarchy is visibly weak.
    - ADR impact: Not ADR-worthy; this follows the repository's skill metadata
      convention.
- D2 — One checklist reference
    - Context: the supplied checklist is execution-time QA detail and duplicates
      no main workflow when kept concise.
    - Choice: store it at `references/review-checklist.md` and require reading it
      only after rendering.
    - Alternatives rejected: duplicating it in `SKILL.md` increases always-loaded
      skill context; deeper references reduce reliability.
    - ADR impact: Not ADR-worthy.

## Discoveries

- The repository validator permits implicit invocation by default and rejects an
  unnecessary policy block.
- No existing user-flow guide maps agent-instruction source, so guide creation
  would misrepresent this as a product journey.

## Validation

| Check              | Status         | Evidence                                |
| ------------------ | -------------- | --------------------------------------- |
| Unit               | Not applicable | No executable logic                     |
| Integration        | Not applicable | No runtime boundary                     |
| Contract           | Passed         | 9/9 validator tests; 16 skills accepted |
| E2E                | Not applicable | No product journey                      |
| Browser/device     | Not applicable | Agent-only package                      |
| Typecheck          | Not applicable | Markdown and YAML only                  |
| Lint               | Passed         | `pnpm agent-skills:check`               |
| Build              | Not applicable | No runtime build                        |
| Database migration | Not applicable | No persistence                          |
| User-flow guide    | Not applicable | Agent-only instruction package          |
| User-flow E2E      | Not applicable | No guide or executable journey          |
| Independent review | Passed         | No remaining material findings          |
| Security review    | Not applicable | No material security-triggering surface |

## Remaining work

- None.
