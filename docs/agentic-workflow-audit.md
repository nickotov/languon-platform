# Agentic workflow quality and efficiency audit

Date: 2026-09-17
Scope: repository instructions, 17 local skills, agent roles, delivery templates,
Magic Patterns integration guidance, and completed delivery records.
Implementation record: [agentic-flow-efficiency](../.agent/improvements/agentic-flow-efficiency.md).

## Recommendation and evidence

Keep correction, improvement, and feature as scope classifications, using one
delivery sequence with verification and specialist review chosen by actual risk.
The largest opportunities are source completeness before coding, focused
remediation review, and one authoritative home for each instruction or fact.

| Finding                                       | Evidence before this improvement                                                                                                                                                                                                                                        | Response                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Design scope can disappear before review      | [Magic fidelity plan](../.agent/features/magic-patterns-ui-kit-auth-fidelity/EXEC_PLAN.md) records the auth-only subset and two remediation rounds; [review](../.agent/features/magic-patterns-ui-kit-auth-fidelity/REVIEW.md) found missing catalog/exports            | Source-derived inventory before implementation and reference/runtime comparison before completion |
| Functional proof does not prove visual parity | [Profile fidelity](../.agent/improvements/profile-magic-fidelity.md) and [passkey follow-up](../.agent/improvements/profile-passkey-design.md) needed layout/state corrections; populated passkey functionality was tested without equivalent populated visual evidence | Distinct empty/populated/dialog coverage and named comparison evidence                            |
| Visual authority drift                        | ADR-0017 requires exact Magic tokens; web/architecture guidance still led with legacy aliases and generic adaptation advice                                                                                                                                             | Reconcile guidance with the accepted ADR; distinguish fidelity from redesign                      |
| Review loops lack boundaries                  | Feature guidance required repeat review after material changes; reviewer guidance requested the complete diff without a remediation mode                                                                                                                                | Initial/remediation/expanded review modes and batched findings                                    |
| Durable state repeats facts                   | Acceptance text and check results appeared in several templates                                                                                                                                                                                                         | Specification owns acceptance; evidence owns results; plan and review link IDs                    |
| Routing is inconsistent                       | Correction template escalated any growth directly to feature while its skill allowed improvement                                                                                                                                                                        | Consistent correction-to-improvement escalation when safe                                         |
| Packaging checks do not test decisions        | Nine validator tests covered 17 skill packages, not design omissions or review scope                                                                                                                                                                                    | Separate behavioral cases and evaluator rubric                                                    |
| No cost baseline exists                       | Sampled work records lacked complete per-agent usage and repair costs                                                                                                                                                                                                   | Optional measurements covering the full accepted outcome                                          |

This is evidence of process gaps, not proof that every reported UI omission had
the same cause. The audit used source and delivery records, not a new live
pixel comparison. Historical token savings cannot be reconstructed from prose.

## Preserve useful scrutiny

The [authentication review](../.agent/features/user-authentication/REVIEW.md)
found consequential enumeration, refresh/session, validation, and concurrency
defects. Retain independent security review and real integration/database proof
where those risks apply. A low-risk new screen and a small authentication fix
need different verification even when their flow names suggest otherwise.

ADR-0016 still requires rendered browser/device evidence for every user-visible
change. Efficiency means a minimal relevant observation for a typo, not dropping
that requirement. Semantic review found an initial decision probe/rubric missed
this constraint; the failure and corrected rerun are retained in the improvement
evidence. Developer-documentation-only edits do not trigger application rendering.

The previous rules required review after implementation, not after every task.
The fix makes that distinction executable in role prompts and flow guidance.
Two remediation cycles trigger diagnosis of recurring defects, never automatic
approval or permission to leave material findings unresolved.

## Implemented policy and ownership

The operational procedure lives in [shared delivery](../.agent/DELIVERY.md),
with classification, safety/Git policy, review triggers, and Definition of Done
in [AGENTS.md](../AGENTS.md). This audit explains the decision; it is not another
copy of the procedure.

| Area                    | Change and authoritative home                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three flow entry points | Keep separate skills; each selects its record/scope and links shared delivery                                                                                                                                                   |
| Fidelity                | [UI composition](../.agents/skills/ui-ux-composition/SKILL.md) selects fidelity mode and [design-fidelity reference](../.agents/skills/ui-ux-composition/references/design-fidelity.md); installed plugin cache stays untouched |
| Review                  | [Code review](../.agents/skills/code-review/SKILL.md) owns review modes; root policy selects independent reviewer, tester, and security needs                                                                                   |
| Verification reuse      | [Testing](../.agents/skills/testing/SKILL.md) owns validity/invalidation of recorded evidence                                                                                                                                   |
| Feature state           | [ExecPlan specification](../.agent/PLANS.md) and templates reference acceptance/evidence IDs instead of copied results                                                                                                          |
| Instruction validation  | [Writing for agents](../.agents/skills/writing-for-agents/SKILL.md) requires meaningful forward probes for complex changes                                                                                                      |
| Measurement             | [Evaluation protocol](./agentic-workflow-evaluation.md), isolated cases, and an optional metrics template                                                                                                                       |

Separate tester work is now driven by substantial new harnesses, unresolved
concurrency/infrastructure behavior, or complex cross-application journeys.
The independent completion reviewer still assesses test coverage for every
feature. Security-review triggers and root completion standards remain intact.

## Skill disposition

| Skills                                                               | Decision                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| correction-development, improvement-development, feature-development | Keep thin entry points; share delivery orchestration                                                                  |
| testing, code-review                                                 | Keep; add evidence validity and bounded review modes                                                                  |
| browser-verification, db-verification, user-flow-e2e                 | Keep distinct tool/environment/safety responsibilities; fidelity comparison belongs in browser evidence when relevant |
| frontend-development, ui-ux-composition                              | Separate framework/architecture from composition/fidelity; disclose detailed design guidance conditionally            |
| diagnosing-bugs                                                      | Keep narrow to unclear failures; do not impose hypothesis ceremony on known local fixes                               |
| codebase-design, domain-modeling                                     | Keep evidence-driven triggers, not routine mandatory activation                                                       |
| prototype, improve-codebase-architecture, web-dev-panel              | Preserve explicit-only invocation                                                                                     |
| writing-for-agents                                                   | Keep instruction ownership and behavioral validation                                                                  |
| Magic Patterns plugin skills                                         | Keep task-specific invocation; supplement integration with the repository fidelity contract                           |

Skill count is not a reliable cost metric: Codex normally discovers metadata
before loading selected skill bodies. See [official skills documentation](https://developers.openai.com/codex/skills/).
Optimize unnecessary activation and repeated context; do not delete useful
specialist safeguards merely to reduce the visible catalog.

## Rollout and measurement

The implementation order is fidelity and review boundaries, instruction/state
consolidation, then evaluation assets. Keep model assignments unchanged during
this rollout so model choice cannot confound the comparison. Keep the four
feature files initially; changing their responsibilities is enough to test the
duplication hypothesis without migrating historical records.

The [evaluation protocol](./agentic-workflow-evaluation.md) defines fixed-task,
fixed-model comparisons, independent rubrics, repair-inclusive cost, and quality
guardrails. Use its seven read-only decision probes to test routing and judgment,
then controlled implementation tasks and a 10–15-task real pilot to assess actual
quality and efficiency. Those later experiments are not automatically launched
by this documentation change.

An initial target is 20% lower median total tokens on comparable accepted tasks,
with no increase in material escaped defects or user repair rounds. It is a
hypothesis, not a measured saving. Mandatory design omissions must be zero;
approved exclusions must remain visible rather than inflate coverage. Keep
security-sensitive cases separate so cheaper UI work cannot hide regressions.

## Verification and limitations

Current implementation checks and findings are recorded in the linked
improvement record, not duplicated here. Packaging, formatting, semantic review,
and decision probes can verify instruction quality; they cannot establish
runtime behavior or future token savings. Mark missing usage unavailable rather
than zero, and do not collect raw session logs or user data by default.

Revert the focused instruction/documentation patch to roll back. No runtime
dependencies, application APIs, persistence, deployment, or paid telemetry
services are introduced. No historical work records need migration.
