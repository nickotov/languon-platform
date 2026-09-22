# Independent review: Local agent skills

Reviewed: 2026-08-16
Reviewer: Independent reviewer agent
Verdict: Approved

## Scope reviewed

- `FEATURE.md`, `EXEC_PLAN.md`, and `EVIDENCE.md`
- Full implementation diff and all six new skill packages
- `docs/agent-skills.md`, `docs/agentic-development.md`, and `README.md`
- Existing Languon workflow boundaries and upstream provenance

## Findings

### R1 — Codebase design lifecycle conflict

- Severity: Medium
- Location: `.agents/skills/codebase-design/SKILL.md` frontmatter description
- Problem: the initial trigger prohibited every architecture implementation
  without a feature decision, while root policy permits a bounded correction
  and the skill body deferred to correction/feature classification.
- Impact: agents could force unnecessary feature ceremony or refuse an
  otherwise valid correction, creating a competing lifecycle rule.
- Suggested fix: defer implementation to root classification and reserve the
  feature requirement for significant or cross-boundary design changes.
- Resolution: Fixed. The frontmatter now states the root classifier owns routing
  and identifies only significant/cross-boundary changes as feature work.

### R2 — Skill metadata validation evidence gap

- Severity: Low
- Location: `EXEC_PLAN.md` test strategy/validation and `EVIDENCE.md` contract
  evidence
- Problem: `quick_validate.py` checks `SKILL.md` frontmatter but not directory
  name agreement, `agents/openai.yaml`, UI metadata, default prompts, or
  explicit-only policy.
- Impact: AC-1 and AC-3 relied partly on untested metadata even though the files
  were manually correct.
- Suggested fix: add and run a focused package assertion, then narrow the
  upstream validator claim.
- Resolution: Fixed. Added dependency-free `pnpm agent-skills:check`, nine
  regression tests covering required metadata and every documented size bound,
  full live validation of all 14 local skill packages, and
  accurate evidence boundaries.

## Acceptance-criteria audit

- [x] AC-1 through AC-4 are implemented and evidenced.
- [x] AC-5 is evidenced by the final gate rerun and approved remediation review.

## Architecture and test audit

- [x] Applicable architecture and workflow boundaries are preserved after R1.
- [x] Tests cover the material package and metadata regression surface after R2.
- [x] No user-flow guide is applicable; repository guide validation passes.
- [x] No debugging artifacts, installed upstream dependency, or accidental
      application scope remains.

## Final verdict

Approved. Both findings are fixed. The reviewer independently confirmed that
`pnpm agent-skills:check` passes all nine regression tests and validates all 14
repository packages; formatting and diff checks also pass. No material finding
or security-review trigger remains.
