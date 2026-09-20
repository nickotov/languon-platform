# Improvement: Agentic delivery quality and efficiency

Status: Complete
Created: 2026-09-17
Updated: 2026-09-17

## Routing decision

- Intended outcome: implement the user-approved workflow audit: preserve design
  completeness, bound review scope, eliminate duplicate delivery instructions,
  and make instruction quality and total delivery cost measurable.
- Why improvement: one cohesive development-workflow enhancement; no application
  capability, public contract, persistence, runtime dependency, security policy,
  deployment, or architecture change. The user explicitly authorized the proposed
  changes to review orchestration and instruction ownership.
- Escalation boundary: application/runtime changes, automatic paid evaluation,
  new telemetry services, and external mutations remain out of scope.

## Context and scope

- Audit evidence: Magic UI-kit catalog omissions and two remediation rounds;
  Profile fidelity follow-ups; useful authentication review findings; no reliable
  historical token baseline. See the audit in `docs/agentic-workflow-audit.md`.
- Scope: root/workspace instructions, existing skill guidance, feature and
  lightweight templates, role prompts, human documentation, offline evaluation
  cases and manual measurement format.
- Keep the three flows, feature Git policy, existing safety boundaries, accepted
  ADRs, user-flow traceability, and required substantive verification.
- Constraints: ADR-0016/0017 visual authority and ADR-0004 traceability remain
  active. No new ADR: this implements explicitly authorized development-process
  policy, not a change to application architecture or accepted ADR decisions.
- User-flow mapping: no executable product journey, command, test runner, or
  guide expectation changes; no guide revisions or E2E execution required.
- Rollback: revert this focused instruction/documentation patch; no runtime,
  package-script, infrastructure, or dependency changes.

## Plan

Acceptance criteria for this improvement:

- AC-1 — Publish the evidence-backed audit and usable measurement protocol.
- AC-2 — Three flows share delivery, acceptance ownership, and bounded review
  without losing accepted safety, browser, security, or Git requirements.
- AC-3 — Supplied designs have pre-code coverage, explicit deviation authority,
  and state-matched rendered evidence; web/admin instructions agree with ADRs.
- AC-4 — Packaging, semantic review, and fresh-context decision probes expose
  instruction defects; results and unknown cost measurements are recorded honestly.

- [x] Publish the audit, implementation decisions, and efficiency experiment.
- [x] Consolidate delivery, review, evidence, and artifact ownership rules.
- [x] Add source-to-runtime fidelity coverage and reconcile visual guidance.
- [x] Add reusable behavioral cases and a minimal measurements record.
- [x] Run metadata/format/link checks, fresh-context behavioral probes, and one
      independent semantic review; remediate only evidence-backed findings.

## Verification

| Check                                       | Result                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Skill metadata and existing validator tests | Pass: 9 tests, all 17 repository skills                                                                 |
| Changed skill quick validators              | Pass: all 9 changed skills; affected frontend/testing rechecked after remediation                       |
| Formatting, local links, diff checks        | Pass: 38 Markdown files, 64 local links, no whitespace errors; both changed agent-role TOML files parse |
| Fresh-context behavioral probes             | All 7 cases have passing responses after Case 01 correction; original failure retained                  |
| Independent semantic review                 | Initial review plus focused R-1–R-7 remediation; all closed, no new material findings                   |
| Application/browser/database/E2E            | Not required: instructions/docs only                                                                    |

## Outcome evidence

- AC-1: audit and rollout in `docs/agentic-workflow-audit.md`; evaluation protocol,
  separate case/rubric files, and optional `WORKFLOW_METRICS.md` template linked
  from README and existing agent documentation.
- AC-2: `.agent/DELIVERY.md` owns shared execution; thin flow entry points and
  role prompts distinguish author preflight, initial review, and remediation.
  Templates own acceptance text, current execution, evidence, and review once.
- AC-3: conditional fidelity reference inventories source before code, requires
  matched rendered states, and reserves material omissions/deviations to user or
  existing product/ADR authority. Web/admin styling/catalog guidance reconciled.
- AC-4: metadata, package validators, formatting/link checks, semantic review,
  and fresh-agent decision probes completed; no application checks or cost
  savings claimed from these instruction-only checks.
- Source state: base `611547c0298263c5bda9e073d7a5012eef776896` plus this uncommitted
  patch. Final operational snapshot SHA-256:
  `d15a3926118c17d846c73b0aa227d3e852b8565ed88e7607dca4d3914a522291`.
  Hash input: sorted changed/new root/web AGENTS, `.agent/DELIVERY.md`, PLANS,
  templates, `.agents/` and `.codex/` files (24); concatenate path, NUL, bytes,
  NUL. Evidence-only updates do not change this operational snapshot.
- Commands: `pnpm agent-skills:check` (9 tests/17 packages);
  `git diff --check` (pass); existing Prettier via `pnpm exec prettier --check`
  with the 38 changed/new Markdown paths selected from Git (pass). Inline Node
  resolved 64 relative Markdown targets in that same set including this final
  evidence link (zero missing paths).
- Skill validation: for each of browser-verification, code-review,
  correction-development, feature-development, frontend-development,
  improvement-development, testing, ui-ux-composition, writing-for-agents:
  `uv run --offline --with pyyaml python /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/<name>`.
  All passed; frontend-development/testing reran after remediation. System Python
  lacked PyYAML and sandbox cache access failed; approved offline cached uv
  environment resolved this without repository dependencies. Python `tomllib`
  parsed `.codex/agents/{reviewer,tester}.toml` successfully.
- Probe evidence: [full responses and condition grades](../evals/workflow/runs/2026-09-17.md).
  One fresh no-history agent per case, plus one fresh rerun for Case 01. Initial
  rubric incorrectly accepted its missing rendered check; independent review
  found the accepted-ADR conflict, instructions/rubric were fixed, and the
  original failure remains visible. Final rerun requires rendered evidence and
  leaves completion pending if unavailable. Other six decisions remain valid.
- Review: one independent semantic review was warranted because root
  orchestration and several skill contracts changed. R-1 lightweight acceptance
  IDs, R-2 pre-code verification versus post-code evidence, R-3 root tester
  triggers, R-4 stale human styling recipe, R-5 admin Storybook scope, R-6 deviation
  approval authority, and R-7 ADR-0016 rendered proof were all medium findings.
  All were resolved in one remediation batch; focused independent follow-up
  approved their affected surface at the snapshot above. No further full review
  or application-suite runs were needed. Runtime security review was not
  applicable; existing security/authorization/Git gates remain intact.
- Documentation/user-flow: existing agent/human instruction links updated;
  product guides and commands unchanged, so no E2E revisions or application,
  browser, database, build, or full repository suite was required for this work.
- Git: no commits, merges, branch operations, or pushes made.
- Measurement: unavailable usage is unavailable, not zero. Document length or
  agent counts are not token savings. Comparative pilot remains future
  measurement, not a fabricated completed benchmark.

## Remaining risks

- Behavioral probes establish instruction use on bounded cases, not production
  defect rates or end-to-end cost savings.
- Probes used read restrictions in a shared checkout, not isolated frozen
  instruction copies. No old/new controlled baseline or per-agent usage was
  available. The optional matched pilot and subsequent 10–15-task observation
  remain future measurement, not incomplete implementation or proven savings.
- Start a new agent session to load changed discovery metadata, root instructions,
  and custom role prompts consistently.
