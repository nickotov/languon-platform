# Independent review: User Flow E2E Automation

Reviewed: 2026-08-13
Reviewer: Independent tester, code reviewer, architect, and security reviewer
Verdict: Approved after remediation

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

### Scenario coverage was absent from revision input

- Severity: Medium
- Location: `scripts/check-user-flow-guides.mjs`, revision canonicalization;
  ADR-0003.
- Problem: Scenario identifiers were hashed, but the `E2E coverage` descriptions
  defining their promised behavior were not.
- Impact: A guide could materially change what a scenario should prove without
  making the declared test revision stale.
- Suggested fix: Hash substantive coverage descriptions and add table-driven
  revision regressions while preserving date/unrelated-prose stability.
- Resolution: Fixed. Coverage descriptions now participate in the revision;
  accepted ADR-0004 supersedes ADR-0003 and records the hardened rule.

### Inspection and repository marker validation diverged

- Severity: Medium
- Location: `scripts/user-flow-e2e.mjs` inspection path and
  `scripts/check-user-flow-guides.mjs` marker discovery.
- Problem: `inspect` originally validated only declared files, while `check`
  also detected orphans; scanning covered only `apps/`, `packages/`, and
  top-level `tests/` despite accepting test paths elsewhere.
- Impact: Inspection could report synchronized while check failed, and an
  orphan outside selected roots could remain invisible.
- Suggested fix: Share registry validation with inspection and scan eligible
  test sources repository-wide with explicit generated/vendor exclusions.
- Resolution: Fixed. Inspect/check share the registry, inspection reports the
  exact guide, and repository-wide discovery has regression coverage.

### Editable guide commands formed an execution trust boundary

- Severity: Medium
- Location: guide `e2e_command` metadata, `AGENTS.md`, and
  `.agents/skills/user-flow-e2e/SKILL.md`.
- Problem: Arbitrary command strings were non-executable in the CLI but agents
  were procedurally instructed to run guide commands and shell recipes.
- Impact: An untrusted Markdown change could influence later execution with the
  agent's local/Docker permissions.
- Suggested fix: Replace shell metadata with registered command IDs, treat guide
  prose as untrusted, verify recipes against repository source, and require
  approval for newly modified executable instructions.
- Resolution: Fixed. Unknown/control-bearing IDs fail; `web-playwright` resolves
  through a code-reviewed registry; root/skill/docs record the trust boundary.

### Coverage and marker grammar could pass non-substantive residue

- Severity: Medium
- Location: `scripts/check-user-flow-guides.mjs` coverage and marker validation.
- Problem: An ID-only coverage entry (including two IDs on one line) could be
  accepted, and malformed marker-like lines could be ignored beside valid
  markers.
- Impact: Current guides could satisfy traceability without explaining behavior
  or retain stale malformed marker residue.
- Suggested fix: Remove all scenario tokens before testing explanatory prose and
  reject every malformed `@user-flow`-prefixed marker.
- Resolution: Fixed with single/multi-scenario coverage and malformed/stale
  marker regressions.

### Test-file and diagnostic path hardening

- Severity: Medium
- Location: `scripts/check-user-flow-guides.mjs` declared-file reads, repository
  scan, and validation diagnostics.
- Problem: Lexically safe paths could traverse symlinks; unbounded/nonregular
  files could be read; filesystem/marker control characters could reach terminal
  output.
- Impact: Validation could read unintended content, exhaust resources, or spoof
  agent/CI terminal output.
- Suggested fix: Require bounded regular files within the repository, reject
  symlink components and control-bearing names, and escape untrusted diagnostics.
- Resolution: Fixed. Reads are repository-contained and capped at 2 MiB;
  symlinks/nonfiles/control characters fail; diagnostic regressions pass.

Final re-reviews found no remaining Critical, High, or Medium issues.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] Required user-flow guides match current behavior, commands, and expected
      outcomes, or `FEATURE.md` records a valid not-applicable reason.
- [x] Current guides map proportional critical scenarios to real E2E tests;
      scenario/revision markers, execution evidence, and assertions agree.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Approved. The independent tester, code reviewer, architect, and focused security
reviewer all report no remaining Critical/High/Medium findings. Fifteen focused
validator/CLI tests, the mapped authentication inspection/check, the recorded
3/3 real Playwright run, final `pnpm check`, skill validation, and diff hygiene
pass. Residual limitations are documented in `EVIDENCE.md` and do not block
delivery.
