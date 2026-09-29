# Improvement: Clarify dictionary job format capabilities

Status: Complete
Created: 2026-09-29
Updated: 2026-09-29

## Routing decision

- Intended outcome: make the six dictionary job format settings understandable
  without reconstructing their purpose from the rollout ADR.
- Why this is an improvement rather than a correction: it consolidates and
  expands existing operational guidance without changing runtime behavior.
- Explicit-feature check: the user did not request a feature or full feature
  lifecycle.
- Feature boundaries checked: no product capability, contract, persistence,
  security policy, dependency, deployment mechanism, migration, or architecture
  decision changes.
- Escalation rule: stop and request feature authorization before changing runtime
  configuration semantics.

## Context and scope

- Current behavior: the README lists all six variables and the operations guide
  explains expand/activate, but neither gives operators a concise per-variable
  glossary and complete phased example in one place.
- Expected behavior: the README defines every capability, distinguishes job
  schema versions from releases, and shows safe expand, activate, and retire
  configurations with a link to the detailed runbook.
- In scope: `README.md`, a small cross-reference in the dictionary jobs runbook,
  and this record.
- Out of scope: changing defaults, environment parsing, release manifests, job
  formats, or deployment policy.
- Relevant constraints: ADR-0012 remains authoritative.
- Related user-flow guides: none; this is developer/operations documentation and
  does not alter an executable product journey.
- Rollback/removal path: revert the documentation-only patch.

## Acceptance criteria

- AC-1 — Every capability variable has a plain-language lifecycle definition.
- AC-2 — Documentation explains why supported format versions coexist.
- AC-3 — A concrete expand/activate/retire example shows which sets differ and
  when an old version can be removed.

## Plan

- [x] Add the consolidated explanation and phased example.
- [x] Cross-link the operations runbook and ADR without duplicating policy.
- [x] Run targeted documentation and formatting validation.
- [x] Inspect the final diff and record evidence.

## Verification

| Check                    | Result       |
| ------------------------ | ------------ |
| Tests                    | Not required |
| Lint/typecheck/build     | Not required |
| Runtime/browser/database | Not required |
| Documentation/user-flow  | Pass         |

## Outcome and evidence

- Changes made: added a six-setting glossary, durable-format explanation,
  expand/activate/drain/retire sequence, concrete environment example, and
  authoritative runbook/ADR links; added a reciprocal runbook reference.
- Commands and results: `pnpm exec prettier --check README.md
docs/operations/dictionary-jobs-and-documents.md
.agent/improvements/dictionary-job-format-capabilities.md` passed;
  `pnpm docs:user-flows:check` passed 16 checks and validated 14 guides;
  `git diff --check` passed.
- Documentation: no user-flow semantics or commands changed, so no guide or E2E
  revision was required.
- Review: author preflight confirmed every variable is defined, the phased
  example keeps enqueue distinct during expansion, links resolve to existing
  headings/files, and no runtime configuration was changed. Independent review
  is not warranted for this low-risk documentation-only clarification.

## Remaining risks

- None known. ADR-0012 remains authoritative if the concise README explanation
  and detailed deployment policy ever diverge.
