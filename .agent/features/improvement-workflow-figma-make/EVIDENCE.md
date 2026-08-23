# Verification evidence: Lightweight improvements and Figma Make design workflow

Updated: 2026-08-23

## Automated tests

### Unit

- Command: Not applicable.
- Result: No runtime behavior or deterministic code changed.
- Coverage added: Not applicable.

### Integration and contract

- Command: Not applicable.
- Result: No application integration or public contract changed.
- Behavior validated: The Figma MCP connector was available, authenticated, and
  resource-capable in the active Codex session; no Make project link was supplied
  for the local archive.

### E2E

- Command: Not applicable.
- Result: No executable browser, API, mobile, admin, CLI, or system journey changed.
- Journeys validated: Not applicable.

## Real application verification

- Environment: Not applicable; no runtime UI changed.
- Scenario: Not applicable.
- Observed result: Not applicable.
- Artifacts: `design/ai generated languon design.make` integrity checked with
  `unzip -t`; the ZIP archive contains `canvas.fig` and passed without errors.

## User-flow guide verification

- Guides created or updated: None. This feature changes repository workflow and
  local MCP configuration, not an executable journey or reviewed command behavior.
- Commands and journeys checked: `pnpm docs:user-flows:check`.
- `pnpm docs:user-flows:check` result: Passed — 16 tests and seven guide/E2E
  mappings validated.
- `pnpm user-flow:e2e -- check <guide-feature-slug>` result: Not applicable; no
  guide maps to this feature. An exploratory `dictionary-platform` check was not
  valid because no guide with that slug exists, so it is not used as evidence.
- Scenario IDs and exact E2E test files: Not applicable.
- E2E environment/command/result and cleanup: Not applicable.

## Static checks

- Format: `pnpm exec prettier --check` over every changed Markdown/YAML artifact
  — passed. The installed Prettier configuration has no TOML parser, so
  `.codex/config.toml` was inspected through the active authenticated Figma MCP
  configuration rather than falsely reported as formatter-validated.
- Lint: `pnpm agent-skills:check` — passed: 9 validator tests and 17 repository
  agent skills validated.
- Typecheck: Not applicable; no TypeScript changed.
- Build: Not applicable; no build input changed.
- Skill package: `uv run --quiet --with pyyaml .../quick_validate.py
.agents/skills/improvement-development` — passed: `Skill is valid!`.
- Diff integrity: `git diff --check` — passed.

## Database verification

- Migration command: Not applicable.
- Forward result: Not applicable.
- Rollback result: Not applicable.
- Data/invariant checks: Not applicable.

## Review

- Reviewer result: Passed — independent implementation review found no material
  findings after routing, Make-resource, and documentation remediations.
- Security reviewer result: Passed — no material exploitable finding. One Low
  defense-in-depth opportunity was recorded: restrict Figma's write-capable tool
  surface only after verifying supported Codex MCP allowlisting syntax.
- Findings resolved: The explicit-only feature policy is validator-enforced;
  Make-resource access is distinguished from Design file/node context; fetched
  resources are untrusted; and Figma writes require explicit user authorization.

## Remaining risks

- Figma MCP cannot fetch Make context from the local `.make` archive alone. The
  next Figma-derived implementation needs the shared Figma Make project link;
  until then, agents use the applicable legacy Pencil source and record the
  handoff.
- The configured Figma connector exposes write-capable tools. Until a verified
  allowlist configuration is adopted, repository guardrails require explicit user
  authorization for every Figma write.
