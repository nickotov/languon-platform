# Shared delivery procedure

Read this once when implementing a correction, improvement, or feature. Root
`AGENTS.md` owns classification, authorization, safety, review triggers, and Git
policy. Flow skills select the record and scope; this file owns the common
execution sequence. Read specialist skills only for affected surfaces.

## 1. Establish the outcome and risk

Inspect applicable instructions, current Git state, the active record, relevant
guides/ADRs, and analogous source. Reuse an existing active record for the same
outcome; do not create a new record for each repair. Assess scope and risk
separately: a small authentication fix can require specialist verification.

Write observable acceptance criteria before implementation. For a feature,
`FEATURE.md` owns their text and stable IDs. For a correction or improvement,
use its one record. Identify supported behavior, explicit exclusions, affected
invariants, and what evidence will establish completion. Resolve only material
product/safety ambiguity with the user; continue independent authorized work.

For saved design prompts and returned designs, apply [versioned handoff
rules](DESIGN_HANDOFF.md); DESIGN.md owns provenance and revision pointers only.

When implementing a supplied design, use `$ui-ux-composition` fidelity mode and
its source-derived coverage inventory before coding. Missing backend support is
not permission to silently remove designed UI or invent working capabilities.

Exit: scope is accounted for, relevant risk triggers are identified, and every
acceptance criterion has a planned verification method.

## 2. Implement and verify in coherent slices

Use `$testing` to choose the cheapest reliable checks, including browser/device,
database, security, and mapped E2E evidence where required. Run focused checks
while iterating. Investigate failures and fix their cause before broadening.
Do not request independent review after each task by default. An early review
is useful only for a specific consequential uncertainty; state its question.

Keep changed user-flow behavior and mapped tests synchronized. Resolve exact
mapped test files and reviewed commands before starting E2E; do not accidentally
select the whole suite through ambiguous argument forwarding.

Record material decisions and the next action, not a transcript of routine
tool calls. Delegate bounded, non-overlapping work only when useful. Give an
agent the task, relevant source/spec paths, diff boundary, and evidence needed;
prefer a fresh context to copying a long conversation. Do not coach a reviewer
toward the author's desired conclusion.

Exit: the scoped implementation works and evidence covers the changed behavior.

## 3. Author preflight

Before an independent completion review or lightweight handoff:

- Map every acceptance ID to implementation and valid evidence; make gaps
  explicit. For fidelity work, reconcile every source inventory row, including
  hidden/empty/populated states and material deviations.
- Check relevant failure, cancellation, permission, responsive, localization,
  and accessibility behavior. Select combinations by distinct risks.
- Confirm public exports/callers and contracts where changed; inspect the final
  diff for accidental scope, secrets, generated output, and temporary artifacts.
- Complete affected documentation and guide checks. Verify commands exist.
- For backlog work, reconcile the task and index using the synchronization rule
  below; a partial delivery must not imply the whole backlog task is Done.
- Apply `$testing` evidence validity rules to the final patch. Reuse valid
  results; rerun checks invalidated by source, configuration, test, or environment
  changes. Do not skip required layers to reduce cost.

Exit: there are no known unfinished acceptance items hidden behind a passing
build, test count, screenshot, or a checked milestone.

## 4. Review, remediate, and close

Apply root review triggers and `$code-review`. Initial independent review covers
the complete scoped diff and its relevant context. The reviewer also assesses
test coverage. When a root tester trigger applies, give the tester a concrete
bounded question, such as new-harness adequacy or unresolved concurrency, and
valid evidence to assess rather than repeat. A green new harness does not waive
the root trigger. Security review remains independently
required by root risk triggers. Complementary reviews may run concurrently.

Batch findings, triage their validity, and fix material defects together. Keep
stable finding IDs and reasons for accepted/deferred/rejected findings. Verify
repairs with affected checks and request a **remediation review** of the fixes,
affected callers/invariants, and evidence. Expand to a full review only for a
new or substantially changed risk surface; record why. A new material defect
found during focused review must still be addressed.

After two remediation cycles with material findings still appearing, diagnose
the recurring cause (incomplete specification, oversized scope, missing test
seam, or architectural uncertainty) and change the approach before another
cycle. This is not a review cap or permission to leave defects unresolved.

Finish when acceptance and required verification are complete and no unresolved
critical/high or material security findings remain; resolve relevant medium
findings or explicitly justify their disposition. Update the active record and
follow root Git policy. Report actual verification gaps, not invented success.

## Backlog synchronization

Apply this automatically when delivery is tied to a task in `docs/backlog/`,
including a request identified by its BL ID, filename or matching task scope.
Select it through the [compact index](../docs/backlog/INDEX.md), inspect its
frontmatter, then read the task file and relevant
[shared context](../docs/backlog/README.md) in full during scope discovery;
record the BL ID and task path in the active correction/improvement/feature record.
Backlog descriptions do not waive root classification or feature authorization.

1. During delivery, keep frontmatter `status` and delivery-record link current.
   If only part is delivered, describe completed and remaining scope and retain
   a non-terminal filename/status. Planning, a passing partial check, a blocker,
   or a completed delivery milestone alone does not complete the whole task.
2. After the entire agreed task is implemented, verified and meets the applicable
   Definition of Done, rename `NNN-slug.md` to `NNN-slug-done.md`, append “— Done”
   to its heading, set frontmatter `status: done`, and update `updated`.
   Keep the frontmatter `title` as the stable task name without the suffix.
   Add existing evidence paths to frontmatter `evidence` and explain them in the
   body. Link existing documents
   substantiating implementation: the completed delivery/evidence record, current
   verified guide, or an implementation ADR when it actually supplies evidence.
   A proposed design/plan or architectural constraint alone is not proof. If no
   separate evidence document exists, state that explicitly rather than inventing
   one; preserve all evidence required by the delivery workflow.
3. For an explicit user skip request or previously recorded approved scope
   decision, rename to `NNN-slug-skipped.md`, append “— Skipped” to its heading,
   set frontmatter `status: skipped`, update `updated`, and record `skip_reason`
   and `skip_decision` with detail/history in the body (a decision reference or the
   explicit user instruction when no document exists). Do not infer permission to
   skip from difficulty, unavailable services, failure, deferral or partial delivery.
4. Update the index status/link and all affected repository links in the same
   change. Keep the numeric ID, slug, original task references and requirements;
   do not create duplicate terminal files or renumber unrelated tasks. On agreed
   reactivation, remove the terminal suffix/status and preserve previous evidence
   and skip/completion decisions in the task's history.
5. Before handoff, check filename/heading/frontmatter/index agreement, evidence/decision
   links and inbound references. Report the backlog disposition in the final
   handoff. A Done update follows final verification/review, not anticipated success.

Completion condition: every affected backlog task has one canonical numbered
file, accurate disposition, required evidence/decision references, and resolving
index/inbound links. No separate reminder or commit/push authorization is implied.

Frontmatter is authoritative; the compact index mirrors it. Non-terminal statuses
are `pending`, `in-progress` and `blocked`; use the
[metadata contract](../docs/document-metadata.md#specialized-schemas).

## Durable state ownership

| Record                        | Owns                                                                           | References instead of copying                 |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Correction/improvement record | Scope, plan, decisions, evidence, review, remaining risks                      | Relevant guide/ADR/source paths               |
| Feature `FEATURE.md`          | Scope, acceptance text/IDs, source design inventory and approved deviations    | Execution and evidence links                  |
| Feature `EXEC_PLAN.md`        | Current progress, milestones, decisions, next action                           | Acceptance IDs, evidence IDs, review findings |
| Feature `EVIDENCE.md`         | Check commands/results, tested state, acceptance-to-proof mapping, limitations | Review verdict in `REVIEW.md`                 |
| Feature `REVIEW.md`           | Review boundary/mode, findings/dispositions, final verdict                     | Evidence IDs and acceptance IDs               |

On continuation, read the feature specification and current plan, then the
evidence/review entries they reference or that the new diff invalidates. Do not
replay completed work or load unrelated historical artifacts. Keep active state
concise; Git retains superseded detail.

For an efficiency pilot or user-requested measurement, use
`templates/WORKFLOW_METRICS.md` and `docs/agentic-workflow-evaluation.md` (from the
repository root). Measurement is optional outside a pilot; no automatic paid
evaluation, session-log collection, or fabricated token accounting is required.
