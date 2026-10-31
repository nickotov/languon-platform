# Shared delivery procedure

Read once per correction, improvement, or feature. Root `AGENTS.md` owns
classification, authorization, safety, review triggers, and Git policy; flow
skills select records and scope. This file owns execution. Read specialist
skills only for affected surfaces.

## Small-fix fast path

Default for bounded corrections and focused improvements with established
behavior and no root feature boundary; it adds no flow, deadline, or evidence waiver.

1. **Bound discovery.** Discover documents through indexes/metadata, then read
   applicable instructions and selected requirements fully. Start with the active
   record, affected source and nearby tests; consult historical feature/design
   records only for active requirements or unresolved decisions. Do not replay
   completed milestones. Read skills once per uninterrupted context, follow
   applicable references, bound tool output, and retain running-command handles.
2. **Keep one short plan.** Reuse the outcome's record: observable fix, exclusions,
   risks and smallest adequate checks. A one-pass repair needs no extra milestones
   or artifacts.
3. **Verify narrowly.** Reproduce the defect and run focused regressions first.
   Once stable, run required affected static checks; broaden only for identified
   regression risks or workflow requirements. Apply `$testing` validity rules;
   do not repeat unchanged checks merely for fresh results.
4. **Minimize setup.** Reuse reviewed safe local apps with fake data and established
   fixture helpers instead of ad hoc account/API setup. Unchanged database code
   does not automatically need database verification, but required integration/E2E
   journeys may need disposable infrastructure and cannot become mocks. A rendered
   story/fixture suffices for isolated presentation only if it exercises the real
   affected component and interactions.
5. **Use one adequate browser proof.** Minimize states/viewports.
   `$browser-verification` decides when a durable real-browser test satisfies
   runtime evidence without exploration. A label fix needs no full journey/matrix.
6. **Review by risk.** Apply root independent/specialist triggers to the scoped diff
   and invariants. Async transitions, cancellation or save races may warrant review
   for small visual fixes; copy/isolated style corrections normally do not.

Substantial setup, repeated failures, or roughly 10–15 unresolved investigation
minutes trigger reassessment before broadening. Explain material growth and revised
scope to the user. This checkpoint is neither deadline nor blocker: continue safe
authorized work; request authority only at a root boundary.

Exit: acceptance has valid final-patch evidence; extra setup/checks/review have an
explicit risk or requirement justification.

## 1. Establish the outcome and risk

Inspect applicable instructions, Git state, active record, relevant guides/ADRs
and analogous source. Reuse the same outcome's record across repairs. Assess scope
and risk separately: even a small authentication fix may need specialist checks.

Before coding, record observable acceptance criteria, supported behavior,
exclusions, invariants and completion evidence. Feature text/stable IDs belong in
`FEATURE.md`; corrections/improvements use their single record. Ask about material
product/safety ambiguity while continuing independent authorized work.

Resolve consequential uncertainty before dependent parallel implementation:

- Trace entrypoints, shared contracts, every reader/writer, persistence, external
  adapters and unchanged consumers that could regress. For shared contracts or
  privileged writes, identify each entrypoint's read/preview/apply/publish/edit
  permissions and credential scope. Prove schema widening cannot silently expand
  existing writer authority; matching field types are insufficient.
- Identify compatibility, units/ranges, permission, failure/cancellation, deadline,
  resource-bound and recovery invariants where relevant.
- Name assumptions and their smallest proofs. New SDK/financial/worker seams may
  need a real production-composition integration path before reuse across consumers;
  replace only external transport. Ask bounded specialist questions when helpful.
- Record exact development/final commands and test selections, covered risks, setup
  prerequisites and elapsed-time estimates including cold setup. Prefer recent
  comparable timings; label estimates/unknowns. Tell the user early and revise
  changed selections. Settle consequential unknowns before dependent work fans out.

Use the existing record/ExecPlan, not a research artifact. Established bounded
fixes need only a short source/neighboring-test check; broader research must answer
a named uncertainty, not default to surveying the app.

Before substantive UI coding, choose the [design direction](DESIGN_HANDOFF.md#choose-the-ui-direction-before-implementation).
Approved-pattern extensions and small corrections remain autonomous; new agent
directions need concrete previews and user approval. Apply versioned handoff rules
to saved prompts/returned designs; `DESIGN.md` owns only provenance/revision pointers.
For supplied designs, use `$ui-ux-composition` fidelity mode and its source coverage
inventory before coding. Missing backend support authorizes neither silent UI
removal nor invented capabilities.

Before AI execution changes, run the affected capability doctor to distinguish
existing readiness gaps from regressions. Follow [AI smoke policy](AI_SMOKE_POLICY.md)
for live authorization, bounds and reporting; deterministic tests never call paid providers.

Exit: scope, consumers and risks are accounted for; consequential unknowns have
proof or explicit unresolved decisions; every criterion has development/final checks.

## 2. Implement and verify in coherent slices

Use `$testing` for the cheapest reliable checks, including required browser/device,
database, security and mapped E2E evidence. Iterate with affected unit/contract/
integration cases and static checks; whole-workspace suites, full builds and
critical stages are not per-edit defaults. Fix failure causes before broadening.
Early critical smoke needs a named startup/wiring/other risk beyond smaller checks;
record its timing rationale and exact selection. Required real database/browser
proof may resolve consequential assumptions early. Early independent review needs
a specific consequential question, not a request after every task.

Synchronize changed user flows and mapped tests. Before E2E, resolve exact mapped
files and reviewed commands; ambiguous argument forwarding must not select all tests.
Record material decisions and next actions, not routine calls. Delegate useful,
bounded, non-overlapping tasks with source/spec paths, diff boundaries and required
evidence; prefer fresh context over long transcripts. Do not coach review verdicts.

Exit: scoped implementation has focused evidence and explicit remaining checks.
Source ready for review does not complete a milestone with outstanding proof.

## 3. Focused author preflight

Before source review (or final verification when review is not required):

- Map every acceptance ID to implementation/evidence; expose gaps. For fidelity,
  reconcile every inventory row, hidden/empty/populated states and material deviations.
- Check relevant failure, cancellation, permissions, responsive behavior,
  localization and accessibility; select combinations by distinct risks.
- Apply the [readability author checks](../docs/code-readability.md#author-and-reviewer-checks)
  to handwritten changes: main flow, named decisions, cohesive extractions and
  preserved lifecycle/React semantics. Formatting alone is not a clarity check.
- Verify changed exports/callers/contracts; inspect the final diff for accidental
  scope, secrets, generated output and temporary artifacts.
- Complete affected documentation/guide checks; verify commands exist.
- Prepare the [critical workflow gate](../docs/operations/critical-workflows.md):
  register new important journeys, exact selections and prerequisites; select
  affected core smoke/shared consumers by risk. Full regression needs evidenced
  shared impact, a release/scheduled run or explicit request, not feature completion.
  Mark final execution pending without running it merely to enter review; focused
  tests must already cover consequential implementation seams.
- Reconcile backlog tasks/index under the rule below; partial delivery is not Done.
- Apply `$testing` validity rules to the final patch: reuse valid evidence, rerun
  checks invalidated by source/configuration/test/environment changes, and retain
  required layers regardless of cost.

Exit: implementation gaps are resolved, fixtures valid, focused coverage ready
for review and pending gates visible. Source readiness/passing counts cannot hide
missing completion evidence.

## 4. Review and remediate stabilized source

Apply root triggers and `$code-review`. Initial independent review covers the whole
scoped diff/context, coverage and planned gates; explicitly pending broad execution
means source findings remain separate from final approval. This is one completion
review with source/remediation and evidence phases. Root tester triggers still apply
to green new harnesses: give testers bounded questions (e.g. harness adequacy or
unresolved concurrency) and valid evidence to assess without repetition. Root-triggered
security review remains independently required; complementary reviews may run concurrently.

Batch and triage findings; fix material defects together. Preserve finding IDs and
accepted/deferred/rejected reasons. Run affected repair checks, then request
**remediation review** of fixes, affected callers/invariants and evidence. A new or
substantially changed risk surface alone warrants full review; record why. Address
new material defects found during focused review too.

If material findings persist after two remediation cycles, diagnose the recurring
cause (specification, scope, test seam or architecture) and change approach before
another cycle. This neither caps review nor permits unresolved defects.

Exit: material findings are resolved or justified under root policy, repairs pass,
and no known defect awaits expensive rediscovery. When review is not required,
proceed from preflight directly to the same final readiness check.

## 5. Run final gates and approve evidence

Before remaining selected checks:

- Stabilize implementation/repairs, validate changed fixtures and run affected fast
  checks. Select every required risk layer, beyond edited files; reuse valid results.
  Explain regression scope before full-suite selection; breadth is not automatic.
- Verify reviewed setup/profile commands, infrastructure ownership and readiness.
  For AI changes, compare final affected capability doctor results from the intended
  running environment with baseline. Separately record deterministic implementation,
  local readiness and live proof under [AI smoke policy](AI_SMOKE_POLICY.md).
  Invalidated matching flow evidence requires only authorized bounded live smoke,
  then another doctor run. Reuse standing authorization; ask only for out-of-policy
  expense/action. Missing credentials/readiness or exhausted limits remain explicit
  local/live gaps: never bypass admission or claim deterministic proof is live.
  See [local testing setup](../docs/operations/local-testing-setup.md#admin-activation).
  For new/changed test infrastructure, measure cold setup separately from test bodies
  and justify bounded setup watchdogs. Preserve product deadlines/cancellation
  assertions; diagnose timeouts instead of automatically increasing them. Avoid
  competing builds/resets on shared test resources.
- Capture relevant tracked/untracked patch state and selections. Run required
  critical, browser/device, database, static/build checks and documented setup paths.
  Still-valid early checks count if they cover every selected requirement.

Classify failures as implementation, fixture, environment or assumption; batch fixes
and start with the smallest reproducer/affected checks. Before another broad run,
explain invalidated evidence and selection necessity. Repeated failure types require
revisiting discovery/setup/coverage before relaunch. Reuse unaffected results through
supported selections and `$testing` rules. Never rewrite failed raw reports as passes
or count skipped/retried tests as complete critical evidence.

Have the reviewer assess final reports/changed surfaces in remediation mode;
unchanged source needs evidence confirmation, not full review. Approval, milestone
completion and handoff require all final coverage with valid evidence. Missing
configuration and failed/skipped required checks remain gaps. Preserve ADR-0016 real
browser/device proof and risk-triggered security/database review.

Finish only with acceptance/verification complete, no unresolved critical/high or
material security findings, and relevant medium findings resolved or explicitly
justified. Update the active record, follow root Git policy, and report actual gaps.

## After user acceptance

Only after user acceptance, append a few-line retrospective to the existing
correction/improvement record or feature ExecPlan. Tests/review do not imply
acceptance; technical handoff may precede this pending entry. Add no artifact,
approval gate or recurring checklist.

Separate investigation, implementation, environment/setup, test execution and rework
time; label estimates/unavailable measurements. Note the largest avoidable delay or
escaped defect and one concrete prevention (or state none was evidenced). Record
follow-ups only for separate work without expanding the accepted task. The optional
[metrics template](templates/WORKFLOW_METRICS.md) supports controlled comparisons,
not mandatory instrumentation.

## Backlog synchronization

Apply automatically to delivery tied to `docs/backlog/` by BL ID, filename or matching
scope. During discovery, use the [compact index](../docs/backlog/INDEX.md), inspect
frontmatter, then fully read the task and relevant [shared context](../docs/backlog/README.md).
Record BL ID/path in the active delivery record. Backlog text waives neither root
classification nor feature authorization.

1. Keep frontmatter `status` and delivery-record link current. Partial delivery
   retains non-terminal filename/status and records completed/remaining scope.
   Planning, partial passes, blockers or completed milestones do not complete a task.
2. Only after the entire agreed task is implemented, verified and meets its
   Definition of Done, rename `NNN-slug.md` to `NNN-slug-done.md`, append “— Done”
   to the heading, set `status: done` and update `updated`. Preserve the stable
   frontmatter `title` without suffix. Add existing paths to `evidence`, explaining
   them in the body: completed delivery/evidence records, verified current guides,
   or implementation ADRs supplying actual proof. Proposed designs/plans or
   architectural constraints alone are insufficient. Explicitly state when no
   separate evidence document exists; invent none and preserve required workflow proof.
3. Skip only on explicit user request or a recorded approved scope decision:
   rename to `NNN-slug-skipped.md`, append “— Skipped” to the heading, set
   `status: skipped`, update `updated`, and record `skip_reason`/`skip_decision`
   with body detail/history (decision reference, or explicit user instruction if
   undocumented). Difficulty, unavailable services, failure, deferral and partial
   delivery do not authorize skipping.
4. Update index status/link and affected repository links together. Preserve numeric
   ID, slug, original references/requirements; create no duplicate terminal files or
   unrelated renumbering. Agreed reactivation removes terminal suffix/status while
   retaining evidence and skip/completion decisions in task history.
5. Before handoff, check filename/heading/frontmatter/index agreement, evidence/
   decision links and inbound references. Report disposition. Done follows final
   verification/review, never anticipated success.

Exit: each affected task has one canonical numbered file, accurate disposition,
required evidence/decision references and resolving index/inbound links. No reminder
or commit/push authorization is implied. Frontmatter is authoritative; the index
mirrors it. Non-terminal statuses are `pending`, `in-progress`, `blocked`; follow
the [metadata contract](../docs/document-metadata.md#specialized-schemas).

## Durable state ownership

| Record                        | Owns                                                                           | References instead of copying            |
| ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| Correction/improvement record | Scope, plan, decisions, evidence, review, remaining risks                      | Guide/ADR/source paths                   |
| Feature `FEATURE.md`          | Scope, acceptance text/IDs, source design inventory, approved deviations       | Execution/evidence links                 |
| Feature `EXEC_PLAN.md`        | Progress, milestones, decisions, next action                                   | Acceptance/evidence IDs, review findings |
| Feature `EVIDENCE.md`         | Check commands/results, tested state, acceptance-to-proof mapping, limitations | `REVIEW.md` verdict                      |
| Feature `REVIEW.md`           | Review boundary/mode, findings/dispositions, final verdict                     | Evidence/acceptance IDs                  |

On continuation, read the feature specification/current plan, then referenced or
diff-invalidated evidence/review entries. Do not replay completed work or load
unrelated history; keep active state concise and superseded detail in Git.

For efficiency pilots or requested measurement, use `templates/WORKFLOW_METRICS.md`
and repository-root `docs/agentic-workflow-evaluation.md`. Otherwise measurement is
optional; no automatic paid evaluation, session-log collection or fabricated token
accounting is required.
