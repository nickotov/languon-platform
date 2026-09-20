# Evaluating agentic workflow quality and cost

Use this optional pilot when changing delivery instructions or investigating
repeated omissions and repair cycles. It is not a per-task delivery gate.
[Delivery rules](../.agent/DELIVERY.md) remain authoritative;
[design fidelity](../.agents/skills/ui-ux-composition/references/design-fidelity.md)
defines the supplied-design workflow.

## Start with bounded decision probes

The [case directory](../.agent/evals/workflow/cases/) contains seven offline
scenarios. Each file is a complete request plus synthetic raw task facts. They
test routing, evidence selection, design inventory, and review scope without
running application code. They do **not** prove implementation quality, visual
fidelity, actual token savings, or safety of a real authentication change.

Use a fresh agent/session for each case and instruction variant. Give it only
the instruction snapshot being evaluated and its case file, with this wrapper:

```text
Read the applicable AGENTS.md and the workflow/skill instructions needed for
the request in <case-file>. Treat the case's synthetic facts as the complete
task evidence. This is a read-only decision probe: do not edit files, create
branches, launch services, delegate, or make external/network/model calls.
Return the requested decision and evidence plan; do not claim checks ran.
Do not read sibling cases, evaluator files, prior runs, or evaluation results.
```

The evaluator reads the [rubric](../.agent/evals/workflow/evaluator-rubric.md)
only after saving the response. Keep it out of the tested agent's context.
For stronger isolation, copy just the selected case and the allowed instruction
snapshot into the probe workspace; exclude this protocol, rubric, other cases,
and old responses. Following a “do not read” request in a shared checkout is
weaker isolation and must be recorded as such. Preserve full responses so that
grading can be audited. Do not infer a pass from expected keywords.

## Compare old and revised instructions

1. Record the exact old and revised instruction revisions or hashes. Use the
   same application base revision, fixture, model/version, reasoning setting,
   tools, environment, context allowance, and permissions for both variants.
   Only the instructions under evaluation should differ. Do not substitute
   current source code for one variant or include the earlier implementation.
2. Prepare isolated copies without credentials, shared infrastructure, hidden
   rubrics, previous responses, or expected fixes. Explicitly list which
   instruction files differ. Prefer copies outside the user's working tree;
   do not reset, clean, or switch a dirty working tree to prepare an evaluation.
3. Run all cases once per variant, then repeat ambiguous or failed cases at
   least three times per variant with fresh context. Alternate which variant
   runs first. Use the same repetition schedule for both variants, and keep
   failures rather than discarding or replacing them with a passing rerun.
4. Grade responses against observable decisions in the evaluator rubric.
   Record pass/fail/unresolved per condition with a response quote or artifact
   reference. Report uncertainty and protocol deviations. Do not count a
   pending authorized product decision as an implementation failure.
5. Fix demonstrated instruction defects, rerun affected probes, and retain
   before/after responses. A later changed instruction set is a new variant;
   do not quietly combine its results with the previous one.

No script or automatic paid model runner is provided. Running fresh sessions
uses the normal agent budget; obtain any required execution/cost authorization
before extending the pilot beyond the approved work.

## Then measure actual delivery

For end-to-end evidence, select historical tasks from pre-fix commits: a
correction, existing-contract UI improvement, supplied design with hidden and
populated states, ordinary feature, and authentication/transaction change.
Freeze their source inputs and acceptance rubric before either run. Give agents
the original task and raw assets, not historical fixes or review conclusions.
Use isolated disposable environments and authorize implementation scope
explicitly; the decision-probe wrapper does not authorize implementation.
Actual visual tasks require rendered comparisons, and security tasks require
their normal specialist and integration checks.

Record full delivery through acceptance and subsequent repairs using the
optional [metrics template](../.agent/templates/WORKFLOW_METRICS.md). Include
all agents, retries, and repair requests in both arms. Unknown usage is
`unavailable`, never zero. A single run or a shorter instruction file is not
evidence of token efficiency. Probe cost and actual delivery cost are separate
datasets.

Apply quality guardrails before evaluating savings: no increase in escaped
material defects, user repair rounds, or unauthorized actions; all mandatory
design requirements accounted for with evidence. Report approved exclusions
separately so removing requirements cannot improve a coverage score. Keep
security-sensitive tasks in a separate cohort.

An initial **aspirational** target is a 20% reduction in median full-delivery
tokens on matched tasks, without worsening those guardrails. Report the paired
per-task results, sample size, failures, unavailable measurements, and model
cost assumptions alongside the median. No savings have been established by
adding this protocol. After controlled runs, observe the next 10–15 real tasks
before making a broader efficiency claim.
