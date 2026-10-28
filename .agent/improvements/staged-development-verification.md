# Improvement: Staged development and final verification

Status: Complete
Created: 2026-10-28
Updated: 2026-10-28

## Routing decision

Focused developer-workflow improvement requested after the Feature058 timing audit.
No product behavior, public API, persistence, production dependency, security policy,
runner implementation or Git authority changes. Preserve required final critical,
browser/device, database and security evidence. Current branch; no automatic commit.

## Context and scope

Make risk-focused discovery and narrow unit/contract/integration checks the normal
development loop. Validate consequential assumptions through a small real seam early.
Move broad critical execution after focused preflight and source-review remediation;
withhold final approval until every required final gate has valid evidence.

Scope: root instructions, shared delivery, testing/review skills, plan templates,
developer/critical verification documentation and offline workflow decision probes.
No application test run, database provisioning, test runner change, blanket timeout
increase, paid research or efficiency benchmark. No product user-flow guide changes.
ADR-0016 browser evidence, root safety/classification/Git rules and the AI regression
matrix remain binding. Rollback: restore this scoped instruction diff.

## Acceptance criteria

- AC-1: Discovery scales with uncertainty, maps affected consumers/writers/invariants,
  and names an early proof for a consequential risk without burdening small fixes.
- AC-2: Iteration selects affected behavior and transitive consumers, with fast scoped
  checks; broad runs need a named risk or final-phase readiness.
- AC-3: One independent completion review can inspect stabilized source before broad
  gates and approve final evidence afterward; pending gates never imply completion.
- AC-4: Required critical/security/browser/database checks, evidence validity and
  zero-skipped/retry rules are preserved. Failed gates get diagnosis and focused
  repair before another justified broad run.
- AC-5: Authoritative instructions, templates and developer guidance agree. Changed
  skills package correctly and fresh isolated decision probes exercise the policy.

## Plan

- [x] Inspect instructions, workflow conflicts and applicable evaluation protocol.
- [x] Implement the focused policy and template changes.
- [x] Run packaging, formatting and fresh read-only decision probes; link validation below.
- [x] Independent scoped review; remediate and recheck affected evidence.
- [x] Record final boundary, limitations and completion.

## Verification strategy

Instruction-only change: targeted formatting/link and skill checks; quick_validate
for changed skill folders; new staged-testing case plus existing small-fix, remediation
and authorization cases in isolated instruction snapshots. No application/UI/SQL
changed, so browser, database, builds and application critical gates are not required.
Risk-based independent review checks contradictory policy and preserved requirements.
Comparative runtime/token savings remain unmeasured.

## Outcome and evidence

- E1 — All three changed skills (`testing`, `code-review`, `feature-development`)
  pass `/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py`
  using `PYTHONPATH=/private/tmp/languon-skill-uv-cache/archive-v0/ElB_CfCNseJwadfx`.
  `pnpm agent-skills:check`:10tests/27skills pass; formatting and `git diff --check` pass.
- E2 — Initial revised-only probes01/05/06 pass; case08 has SDV-R1, missing explicit writer-permission discovery. Fresh agents
  received separate physical instruction copies plus one synthetic case, without
  rubric/protocol/prior responses. Full transcripts and per-response hashes:
  [probe evidence](evidence/staged-development-verification/probe-manifest.json).
  [Grading](evidence/staged-development-verification/grading.md) records quotes and
  limits. Instruction digest: `5cf7223f6b980ce2595a17efd1d967f0be557b76c62d619f40ac383e16f4e513`.
- E3 — `pnpm docs:user-flows:check`:16tests/32guides pass. No product guide or
  scenario revision changed. Ordinary updated docs retain/add factual metadata.
- E4 — Initial variant case08 failure retained; only shared delivery's authority
  discovery question strengthened. Three fresh case08 repetitions under variant2
  pass all material conditions (including explicit old-writer/credential authority).
  [Variant2 manifest](evidence/staged-development-verification/probe-manifest-r2.json)
  records new instruction digest `4454ef36a32d3db41468ceee84a863205444f4c3f220ae200e9b2c5ee2a9cfb5`.
  Reuse of unchanged cases01/05/06 is justified in grading. No paired savings study.
- Initial independent review: SDV-R1 Medium — case08 grading overclaimed authority
  coverage. Generic permission wording did not elicit an entrypoint authority map.
  Strengthen the shared-contract/privileged-writer discovery question; retain the
  failed response and reran only case08 in three fresh contexts. SDV-R1 remediated;
  independent regrading confirms all three repetitions; finding resolved and final approval granted.

Changed shared delivery is the procedure authority; root routing stays concise.
The existing small-fix path and all mandatory final evidence remain in place.
No application test, build, browser session or database service was needed.

- E5 — Current local-link check:73links/16documents pass. Final formatting,
  preserved response hashes and current instruction digest checks pass; tracked
  patch whitespace check is clean. No app/build/database/browser gate applies.
- Review — `staged_workflow_review`, initial plus bounded remediation modes:
  SDV-R1 Medium resolved; no remaining material findings. Earlier01/05/06 evidence
  remains valid; all three revised case08 repetitions independently regraded Pass.
  Source boundary: base `b4e4813`, current tracked diff and new case/evidence files.
  Tracked patch SHA256: `ce0005448cb0673dd8ec8fcc68b2941b39a87230f5323f6a92b52ed839791f12` (before this untracked record update);
  untracked transcript/case/instruction hashes are in the two probe manifests.

## Remaining risks

Decision probes assess instruction choices, not real delivery quality or time saved.
No controlled old/new benchmark was run; the initial failed variant is retained.
No implementation work or required verification remains. After verification, the user explicitly requested a local commit on the existing
branch. No branch creation, merge or push is included in that request.
