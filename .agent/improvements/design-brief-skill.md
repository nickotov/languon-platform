# Improvement: Source-grounded design briefs and prompt cookbook

Status: Complete
Created: 2026-09-20
Updated: 2026-09-20

## Routing and scope

User-approved development-workflow enhancement; improvement flow. No product
capability, API, schema, production dependency, security policy, deployment, or
architecture change. Explicit feature lifecycle was not requested. Escalate
before crossing those boundaries. Initial working tree was clean at `2ef153d`.

Add explicit-only design-brief skill, its metadata/validator regression, human
workflow guidance, and a linked prompt cookbook. No new specialist role or
automatic post-delivery step. No Magic Patterns calls or application changes.
Existing root classification, accepted ADRs, and shared delivery remain intact.
No executable user-flow guide changes or E2E mapping changes apply.

Rollback: remove the new skill/docs and their links and validator membership;
no migrations, dependencies, or runtime cleanup required.

## Acceptance

- AC-1: Explicit skill generates portable source-grounded prompt plus stable UI
  IDs; separates supported behavior, UX recommendations, and unresolved choices.
- AC-2: Supports correction deltas and no-op invisible changes; preserves
  authorization, design-system constraints, privacy, and fidelity handoff.
- AC-3: README and agentic docs explain usage; separate cookbook covers common
  request modes and backend-to-design-to-frontend workflow.
- AC-4: Package, formatting/link, regression, and fresh-context behavioral checks
  validate applicable contracts without claiming runtime or cost improvements.

## Plan and verification

- [x] Inspect current workflow, skills, metadata validator, and templates.
- [x] Implement skill, validator regression, documentation, and links.
- [x] Run package and quick validators, formatting, links, and diff checks.
- [x] Run bounded fresh-context behavioral probe and inspect final scope.

No application/browser/database checks: no application behavior changes. A
fresh-context probe is warranted for supported-vs-proposed UX and scope handling;
metadata validation alone does not establish instruction quality. No substantial
test harness or new security surface introduced.

## Evidence and remaining risks

- AC-1/AC-2: skill and explicit-only metadata implemented; validator registry and
  regression test reject implicit invocation and accept explicit configuration.
- AC-3: README, agent-skills, development reference, and handbook link/explain
  the skill and new docs/agentic-prompts.md cookbook. Backend-only scope is
  distinguished from an unfinished end-to-end feature; brief generation cannot
  close frontend acceptance. No mandatory phase or separate agent role added.
- AC-4: `pnpm agent-skills:check` passes 10 tests and all 18 skill packages.
  `uv run --offline --with pyyaml python
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/design-brief` passes. Plain `python` was unavailable and uv cache
  access initially sandbox-blocked; approved offline cache access succeeded.
- Formatting: scoped `pnpm exec prettier --check` passes for the changed/new
  Markdown, YAML, and validator JavaScript files; `git diff --check` passes.
  Read-only Node check resolves all 36 local links in five human docs. User-flow
  search found no guide mapping to the affected validator/docs/skill surface.
- Independent forward test: fresh agent received only skill path, synthetic
  import-v3/v4 facts, and requested outputs; no rubric, expected answer, prior
  rationale, or author conclusions. Read-only shared-checkout access was
  instruction-restricted, not filesystem-isolated. The complete response is in
  [import-probe.md](../evals/design-brief/import-probe.md).
- Probe results: returned portable prompt/checklist; distinguished source from
  executed tests; excluded unsupported cancel/retry/progress; flagged missing
  system reference; preserved UI-01 through UI-09 and added UI-10 for conflict;
  declined design invocation for an unrequested invisible refactor. These are
  bounded behavioral findings, not measured design quality or token savings.
- Author preflight checked scope, portable output, requirement provenance,
  explicit invocation, delta semantics, and downstream fidelity handoff. The
  independent forward test provides the risk-proportional instruction check;
  no additional full code review or runtime security review was warranted.
- Tested state: base `2ef153d` plus this scoped working-tree patch; operational
  snapshot SHA-256 is
  `89111ad70c8384dd0809274584dc07ec41ea172254cbe22379c924d913d4e511`
  (sorted skill/metadata and two validator paths, each path, NUL, bytes, NUL).
  The
  skill/validator content was unchanged between successful checks and handoff.
  Evidence-only record updates do not change that behavior. No commits or
  external design calls made. The cookbook Mermaid flow was manually inspected;
  no rendered-diagram validation claimed.

Comparative token savings and real Magic Patterns design quality remain
unmeasured. Restart the agent session to load the new skill metadata. No external
design generation is authorized by this improvement.
