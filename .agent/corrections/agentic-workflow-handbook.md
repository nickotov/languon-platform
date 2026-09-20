# Correction: Explain agentic development with diagrams and prompts

Status: Complete
Created: 2026-09-20
Updated: 2026-09-20

## Routing decision

- Outcome: a detailed human-facing handbook, discoverable from the README.
- Correction: one documentation surface explaining established workflow; no new
  capability, command, contract, schema, dependency, architecture, security,
  deployment, product decision, or independently coordinated implementation.
- Escalation: if policy changes become necessary, preserve this scope and
  reassess improvement/feature boundaries before changing authoritative rules.

## Context and scope

- Existing command reference lacks a complete diagram-led workflow walkthrough.
- In scope: handbook, README link, companion-reference link, this record.
- Out of scope: changing agent policy, skills, application code, or Git history.
- Sources: root AGENTS.md, .agent/DELIVERY.md, flow skills, diagnosis skill,
  configured reviewer/tester boundaries, and existing developer documentation.
- Existing uncommitted workflow implementation and other changes are preserved.
- No architectural choice is introduced; root's ADR-0016 browser requirement is
  explained, not changed. No executable user-flow behavior or mapping changes.

## Acceptance criteria

- AC-1: Explain roles, shared delivery, correction/improvement/feature and bug
  workflows, review/remediation, design fidelity, verification, and measurement.
- AC-2: Include Mermaid diagrams and concrete prompts for different request modes.
- AC-3: Link the handbook from README and the existing development reference.

## Plan

- [x] Read authoritative workflow and inspect existing documentation/Git state.
- [x] Write the handbook and discovery links without changing workflow policy.
- [x] Validate formatting, local links, diagrams, and policy consistency.
- [x] Inspect final scoped changes and record evidence and limitations.

## Verification

Documentation checks passed with the diagram-rendering limitation below.
Application tests, lint/typecheck/build, real-app
browser/device/database checks, and user-flow E2E are not applicable: this change
only explains existing processes and adds documentation links. No application
behavior, commands, guide scenarios, or source mappings change.

## Outcome and evidence

- Implementation: docs/agentic-workflow-handbook.md, plus links in README.md and
  docs/agentic-development.md. Acceptance is mapped by the handbook's sections
  and the two explicit entry links.
- Review decision: author documentation preflight; no separate independent
  reviewer required for this bounded explanation-only correction.
- `pnpm exec prettier --check README.md docs/agentic-development.md
docs/agentic-workflow-handbook.md
.agent/corrections/agentic-workflow-handbook.md`: passed.
- `git diff --check`: passed. Existing README/reference edits predate this task;
  this task adds only the handbook entry paragraphs to those files.
- Read-only Node link check: all 27 local Markdown links across the handbook,
  README, and development reference resolve to existing paths (AC-3).
- Seven Mermaid flowcharts checked for fenced-block/declaration structure and
  manually inspected for node/edge syntax and workflow consistency (AC-1/AC-2).
  Mermaid and its CLI are not installed; no rendered-diagram validation claimed.
- Author preflight checked feature authorization/Git behavior, read-only modes,
  tester/security triggers, two-cycle diagnosis rather than a review cap,
  mandatory proportionate visible-app verification, and design-gap disposition
  against root policy and shared delivery. Ten prompt cases cover distinct modes.
- Tested working-tree content SHA-256 (2026-09-20, local Node/pnpm environment):
  handbook `e0bb8017cbf05791682c5b4a3baac1a01239c91da0cebdadf6534a2fd41e00e2`;
  README `4861d5d017cbb085f922e135f68a310b60046157043fc1f4a5d043fd8091abb2`;
  reference `fd0d09bccf522c7f23d136075e77fed0b4868564c39060ba2f74e13a26ea2b67`.
  No application changes, commits, or external writes were made.

## Remaining risks

- Documentation can drift from policy; the introduction identifies authoritative
  files and links to them rather than claiming to replace their instructions.
