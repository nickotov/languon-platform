# Local agent skills

Status: Complete
Owner: Engineering
Created: 2026-08-16

## Problem

Languon has strong repository-specific delivery and verification workflows, but
it lacks focused local guidance for difficult bug diagnosis, agent-facing
documentation, domain language, deep-module design, throwaway prototyping, and
architecture-friction surveys. Installing a third-party skill bundle wholesale
would duplicate or conflict with the repository's correction, feature, ADR,
review, testing, Git, and durable-state policies.

## Desired behavior

Agents can invoke six Languon-owned skills for those focused tasks. Each skill
preserves the repository's existing authority hierarchy and verification
workflows. Project documentation identifies the Matt Pocock skill repository as
the conceptual upstream, records the reviewed revision and license, and explains
where Languon deliberately differs.

## Acceptance criteria

- [x] AC-1 — Six repository-scoped skills exist with valid names, triggering
      descriptions, concise workflows, and matching Codex UI metadata.
- [x] AC-2 — The skills defer to applicable `AGENTS.md`, active correction or
      feature state, accepted ADRs, and existing Languon testing, browser,
      database, review, and user-flow skills.
- [x] AC-3 — Risky or exploratory capabilities are explicitly invoked and do
      not create unmanaged branches, commits, external reports, or new ADR
      conventions.
- [x] AC-4 — Developer documentation attributes the conceptual upstream,
      records the reviewed source revision and MIT license, links every original
      skill, and describes the local adaptations.
- [x] AC-5 — Skill validation, affected documentation checks, formatting, lint,
      and independent review pass with no material findings unresolved.

## Scope

### In scope

- Add local `diagnosing-bugs`, `writing-for-agents`, `domain-modeling`,
  `codebase-design`, `prototype`, and `improve-codebase-architecture` skills.
- Add only the references needed to keep the main skill instructions concise.
- Document discovery, invocation, authority, upstream provenance, and license.
- Validate the new skill packages and affected repository documentation.

### Out of scope

- Installing or executing the upstream `mattpocock/skills` package.
- Replacing Languon's correction/feature, testing, review, ADR, Git, or
  user-flow workflows.
- Adding an issue tracker, pre-commit hooks, runtime dependencies, application
  behavior, or product journeys.
- Copying upstream in-progress, miscellaneous, or unrelated skills.

## Constraints and risks

- Repository files remain authoritative; upstream material is a reference, not
  a runtime dependency or policy source.
- Preserve the upstream MIT attribution for adapted material.
- Keep automatically triggered skills narrow. Prototyping and architecture
  surveys require explicit invocation because they may create temporary
  artifacts or explore alternative behavior.
- The feature changes agent behavior only and must not modify application
  runtime, persisted data, or user-visible behavior.

## User-flow documentation

- Not applicable. Repository-scoped instruction packages have no executable
  browser, API, mobile, admin, CLI, or system journey. They do not change any
  existing user-flow command, observable result, failure mode, or mapped source
  path.
- Related guides: none.
- E2E synchronization: not applicable.

## Open decisions

- None. The user explicitly requested local adaptations of the proposed skills
  with upstream provenance documented.
