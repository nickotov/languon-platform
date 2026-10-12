# Improvement: Saved surveys and reusable research skill

Status: Complete
Created: 2026-10-12
Updated: 2026-10-12

## Routing and scope

Documentation and developer-tooling improvement: save the completed voice
assessment desk research and add a repository survey skill. No product feature,
contract, schema, dependency, security policy, or architecture decision changes.
The user requested saving research and creating the skill, not implementing the
researched feature. Follow root classification if later work expands scope.

Initial working tree was clean. Scope: `docs/surveys/`, `.agents/skills/survey/`,
discovery links in README and the skills guide, and this record. Existing
user-flow guides have no mapping to this documentation-only surface; no guide,
scenario, backlog task, or E2E behavior changes. No ADR is created: the survey's
architecture suggestions remain proposals, not accepted decisions.

Rollback: remove the new survey/skill and their discovery links. No runtime or
infrastructure cleanup is needed.

## Acceptance criteria

- AC-1: A dated Markdown survey preserves the user's requirements, research
  findings, linked sources, recommendation, and unverified questions.
- AC-2: `$survey` supports a short research brief and implicit invocation for
  research surveys; asks focused questions, verifies current sources, separates
  facts from proposals, and saves indexed Markdown unless the user says otherwise.
- AC-3: Survey requests do not imply implementation, paid experiments, vendor
  outreach, or a binding architecture decision. Existing authority still applies.
- AC-4: Skill packaging, formatting, metadata, local links, and representative
  trigger/scope cases are checked; limitations are reported accurately.

## Plan

- [x] Read applicable instructions, metadata rules, skill authoring guidance,
      analogous documentation, and user-flow index.
- [x] Save the survey, add the skill, and link discovery documentation.
- [x] Run scoped validators, formatting, metadata/link checks, and author preflight.
- [x] Record evidence and complete this improvement.

## Verification strategy

Use skill-creator quick validation, `pnpm agent-skills:check`, scoped Prettier,
local Markdown link/frontmatter inspection, and `git diff --check`. Manually
assess positive and negative trigger examples and authority boundaries. This
short research-only skill introduces no executable helper or runtime surface;
no browser/database/build or full repository test run is warranted. Independent
review is not required by this bounded documentation risk; no runtime, paid
provider benchmark, or automatic-routing success will be inferred from metadata.

## Outcome and evidence

- AC-1: Saved `docs/surveys/voice-answers-pronunciation-assessment.md`, indexed
  in `docs/surveys/README.md`. Preserves confirmed conversation requirements,
  dated desk-research findings, citations, proposed integration, costs, privacy,
  benchmark plan, and unverified eligibility/quality. No fresh web research claimed.
- AC-2/AC-3: Added `.agents/skills/survey/SKILL.md` and UI metadata; linked the
  skill and destination from README and `docs/agent-skills.md`. Automatic selection
  uses the supported default; explicit `$survey` also works as an invocation form.
- AC-4: `pnpm agent-skills:check` passed 10 tests and validated 21 packages.
  An initial explicit `allow_implicit_invocation: true` failed the repository's
  restricted metadata validator; removing that optional flag preserves the
  automatic default without changing the validator or existing skills.
- `uv run --offline --with pyyaml python
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/survey` passed. Default Python lacks PyYAML; approved offline uv
  cache access supplied the existing package without repository dependencies.
- `pnpm exec prettier --check README.md docs/agent-skills.md
docs/surveys/README.md docs/surveys/voice-answers-pronunciation-assessment.md
.agents/skills/survey/SKILL.md .agents/skills/survey/agents/openai.yaml
.agent/improvements/survey-workflow.md` passed.
- Inline read-only `uv run --offline --with pyyaml python -` inspection parsed
  the three affected `docs/` frontmatter blocks, matched titles to H1 headings,
  and resolved 43 local file links across README, the skills guide, the two
  survey documents, and SKILL.md. External URLs and fragment anchors were not
  re-fetched/validated. `git diff --check` passed.
- Manual trigger/scope review: “Make a survey of pronunciation providers” and
  “Update the voice-assessment survey” match; “Create a customer questionnaire,”
  “Implement voice answers,” and “Review this diff” do not trigger this skill
  by themselves. A chat-only research request overrides file saving. These are
  author-interpreted examples, not measured automatic-routing or agent executions.
- Final preflight checked all new file contents and the two discovery edits;
  no runtime, dependencies, generated output, secrets, commits, or unrelated
  changes. No independent review required for this simple research-only package.
- Tested state: Node v24.8.0, pnpm 10.13.1, base `c6bff3f`, plus the six changed
  content files (excluding this evidence record). SHA-256 of sorted path, NUL,
  file bytes, NUL is
  `7107e1044f2ed9dafa0c2c830fed5600bd5fd687b0932ab34dd712e14546304d`.
  Content remained unchanged after successful validation; final record-only
  edits do not invalidate package/link checks.

## Remaining risks

Provider availability, pricing, retention, and quality need revalidation before
implementation. A new agent session is required to discover the new skill.
