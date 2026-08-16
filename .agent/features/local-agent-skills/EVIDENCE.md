# Verification evidence: Local agent skills

Updated: 2026-08-16

## Automated tests

### Unit

- Command: not applicable.
- Result: no executable application logic changed.
- Coverage added: none.

### Integration and contract

- Command:
  `UV_CACHE_DIR=/private/tmp/languon-uv-cache uv run --with pyyaml python3
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/<skill-name>` for each new skill folder.
- Result: passed for `diagnosing-bugs`, `writing-for-agents`,
  `domain-modeling`, `codebase-design`, `prototype`, and
  `improve-codebase-architecture`.
- Behavior validated: required `SKILL.md`, valid YAML frontmatter, required
  fields, allowed keys, hyphenated names, and bounded descriptions. This
  upstream validator does not inspect folder/name agreement or Codex UI
  metadata.
- Environment note: the validator's undeclared PyYAML runtime was supplied in a
  disposable `uv` cache under `/private/tmp`; no dependency was added to the
  project or user environment.
- Command: `pnpm agent-skills:check`.
- Result: 9 validator regression tests passed and all 14 repository agent skill
  packages validated.
- Behavior validated: frontmatter shape, folder/name agreement, required and
  bounded Codex UI metadata, default-prompt skill references, `SKILL.md` size,
  and explicit-only policy for `prototype` and
  `improve-codebase-architecture`.

### E2E

- Command: not applicable.
- Result: no executable application journey changed.
- Journeys validated: none.

### Skill forward tests

- Commands: six isolated read-only tester-agent scenarios, one per new skill,
  with only the skill path, a realistic request, repository evidence, and a
  side-effect boundary supplied.
- Result: all six followed scope and authority, produced the requested output,
  and avoided unsafe repository changes. The prototype used a disposable state
  simulator under `/private/tmp`, exercised 25 transition combinations,
  captured the decision boundary, and confirmed cleanup.
- Remediation: clarified diagnosis-only durable-state writes and `$testing`
  authority; bounded directly referenced agent docs; located implicit-invocation
  policy in `agents/openai.yaml`; made forward-test success criteria explicit;
  clarified conceptual domain scenarios, prototype scenarios, and historical
  durable-state selection for design and architecture reviews.

## Real application verification

- Environment: repository source plus isolated tester agents; no running app.
- Scenario: representative diagnosis, instruction editing, domain language,
  authentication module design, state prototype, and authentication architecture
  survey requests.
- Observed result: every skill respected read-only or explicit-only scope and
  used Languon's governing instructions. No application verification was needed.
- Artifacts: none retained.

## User-flow guide verification

- Guides created or updated: none; repository skills are not an executable
  browser, API, mobile, admin, CLI, or system journey.
- Commands and journeys checked: no guide behavior or source mapping changed.
- `pnpm docs:user-flows:check` result: passed; 16 tests and 2 current guides with
  mappings validated.
- `pnpm user-flow:e2e -- check <guide-feature-slug>` result for every affected
  guide: not applicable; no affected guide.
- Scenario IDs and exact E2E test files: none.
- E2E environment/command/result and cleanup: not applicable.

## Static checks

- Format: `pnpm format:check` passed for the full repository.
- Lint: `pnpm lint` passed for the full repository.
- Agent skills: `pnpm agent-skills:check` passed its 9 regression tests and the
  live scan of 14 packages.
- Typecheck: not applicable; only Markdown and YAML changed.
- Build: not applicable; no runtime or build input changed.

## Database verification

- Migration command: not applicable.
- Forward result: no persistence change.
- Rollback result: no persistence change.
- Data/invariant checks: not applicable.

## Review

- Reviewer result: initial review reported one Medium lifecycle-routing conflict
  and one Low validation-evidence gap. Both were fixed; final remediation review
  approved with no remaining material findings.
- Security reviewer result: not applicable; no material authentication,
  authorization, data, SQL, rendering, external-call, secret, upload, payment,
  model-tool, or webhook behavior changed.
- Findings resolved: forward-test ambiguities, lifecycle-routing conflict, and
  metadata/package validation gap.

## Remaining risks

- Skill effectiveness will continue to depend on trigger quality and future
  real-world use. The packages are repository-owned and do not update from
  upstream automatically; upstream changes require deliberate review.
