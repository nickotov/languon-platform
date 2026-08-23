# Independent review: Lightweight improvements and Figma Make design workflow

Reviewed: 2026-08-23
Reviewer: Independent implementation and security reviewers
Verdict: Approved with one accepted Low follow-up

## Scope reviewed

- `FEATURE.md` and `EXEC_PLAN.md`
- Root routing, templates, local skills, validator, and developer documentation
- Figma MCP configuration, Make archive handling, ADR-0015, and security guards
- Validation evidence and final diff

## Findings

### Routing and Make-resource remediation

- Severity: Medium
- Location: Feature-skill invocation policy; `.agent/PLANS.md`; Figma Make
  instructions and feature artifacts.
- Problem: The initial draft still allowed implicit feature invocation and
  confused Make resources with Figma Design file/node context.
- Impact: A focused improvement could receive feature ceremony; agents could
  overlook an accessible Make project or call the wrong Figma workflow.
- Suggested fix: Disable implicit feature invocation with validator coverage;
  document the Make-link/resource workflow distinctly and align all routing state.
- Resolution: Fixed. `feature-development` is explicit-only and validator-tested;
  Make context now requires a project link plus MCP resources, while Design node
  context remains a separate workflow.

### Figma MCP write-capable tool surface

- Severity: Low
- Location: `.codex/config.toml`
- Problem: The configured Figma MCP exposes write-capable tools as well as the
  read/resource workflow used by this feature.
- Impact: A prompt-injection failure could potentially mutate shared Figma
  content.
- Suggested fix: Allowlist only required read tools/resources once the supported
  Codex MCP configuration syntax is verified; enable writes only for an
  explicitly authorized task.
- Resolution: Accepted with rationale. The repository currently has explicit
  untrusted-resource and no-write-without-user-authorization guards in root
  instructions, design skills, developer documentation, and ADR-0015. Inventing
  unsupported configuration would be riskier; verified allowlisting remains a
  recorded follow-up.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] No user-flow guide changed; `FEATURE.md` records why it is not applicable.
- [x] No guide scenario/revision mapping changed.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Approved. The outstanding Make project link is an external handoff, not a
completion blocker for this workflow/configuration feature.
