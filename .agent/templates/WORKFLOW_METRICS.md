# Workflow pilot: <task/run ID>

Optional measurement record; link it from active work rather than copying
delivery state here. Protocol: [workflow evaluation](../../docs/agentic-workflow-evaluation.md).

- Kind: decision probe | actual delivery
- Task/cohort and active work link:
- Variant; instruction revision/hash; application base revision:
- Case/source asset revision; acceptance rubric reference (evaluator only):
- Model/version, reasoning, tools, environment, permissions:
- Run/repetition ID; start/end; context isolation and protocol deviations:
- Response/artifacts and usage evidence references:

## Outcome and quality

- Acceptance: accepted | failed | unresolved; evidence:
- Material defects found before completion / escaped after completion:
- User-requested repair rounds and final repair observation date/window:
- Mandatory design requirements verified / total mandatory requirements:
- Approved exclusions: count, requirement IDs, reason, approval evidence:
- Review rounds; accepted / rejected / unresolved findings:
- Repeated checks without relevant invalidation: count and evidence:
- Routing/skill decisions and rubric condition results (for probes):

## Full cost through final repair

Use provider usage data when exposed. Write `unavailable` for absent fields.
Include the root agent, every subagent, retries, reviews, and repairs. Explain
whether reported input includes cached input; do not add cached input twice.

| Agent/session or repair | Input total | Cached input | Uncached input | Output      | Usage source        |
| ----------------------- | ----------- | ------------ | -------------- | ----------- | ------------------- |
| <ID>                    | unavailable | unavailable  | unavailable    | unavailable | <reference>         |
| Total                   | unavailable | unavailable  | unavailable    | unavailable | <aggregation notes> |

Separate phase timings; label measured versus estimated and use `unavailable`
where absent. Assign work once to avoid double-counting rework in other phases;
parallel phase totals need not equal elapsed wall time.

| Phase                                         | Duration | Measured / estimated / unavailable | Evidence or basis |
| --------------------------------------------- | -------- | ---------------------------------- | ----------------- |
| Investigation                                 |          |                                    |                   |
| Implementation                                |          |                                    |                   |
| Environment/setup                             |          |                                    |                   |
| Test execution (excluding setup)              |          |                                    |                   |
| Rework after failed checks/review/user repair |          |                                    |                   |

- Early planned checks, selection/reason and estimated setup/execution duration:
- Actual selected commands and durations; reason for any full regression:
- Elapsed wall time (includes waiting):
- Human intervention time (measured or estimate, label which):
- Monetary cost, only if pricing/model/cache accounting is known:
- Missing measurements, unresolved risks, and comparison limitations:

## Retrospective after user acceptance

Keep the actual brief retrospective in the existing work record and link it here.
Do not infer acceptance from technical completion or create a new gate.

- User acceptance reference/date; pending until accepted:
- Largest avoidable delay or escaped defect and cause:
- One concrete prevention action, or no evidenced prevention need:
- Existing work record retrospective link:
