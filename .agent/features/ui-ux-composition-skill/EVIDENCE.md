# Verification evidence: UI/UX composition skill

Updated: 2026-08-23

## Automated and contract checks

- `pnpm agent-skills:check` — passed: 9/9 validator tests and 16 skill packages
  accepted, including implicit invocation metadata and the checklist pointer.
- `pnpm exec prettier --check .agents/skills/ui-ux-composition
.agent/features/ui-ux-composition-skill` — passed.
- `pnpm format:check` — passed in the independent tester run.
- `git diff --check` — passed.
- Package inspection — passed: exactly `SKILL.md`, `agents/openai.yaml`, and
  `references/review-checklist.md`; the one-hop reference resolves.
- Skill-creator generic validator attempted exactly with
  `python3 /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/ui-ux-composition`. It could not start because the host Python
  lacks PyYAML (`ModuleNotFoundError: No module named 'yaml'`). No global package
  was installed. The repository-native validator passed and is authoritative for
  this repository.

## Fresh-context forward tests

### Compose mode

- Prompt surface: responsive web/mobile account-security settings plan with no
  available design-system source and no implementation request.
- Result: passed. The agent defined the primary task and section hierarchy,
  selected dialog/sheet/route containers by task depth, planned 320–1440 px and
  relevant states, disclosed missing design-system evidence, and stopped without
  editing or claiming rendered evidence.

### Implement mode

- Prompt surface: improve a deliberately mechanical four-card team-settings HTML
  fixture using supplied tokens.
- Result: passed. The agent reused the tokens, corrected hierarchy, labels,
  control semantics, responsive layout, destructive confirmation, focus, and
  status treatment. It rendered 320, 390, 768, and 1280 px plus the mobile
  deletion dialog; verified no overflow or console errors, Escape behavior,
  acknowledgement gating, and zero definite axe A/AA violations. The disposable
  fixture was removed and no repository files changed.

### Review mode

- Prompt surface: review the current web dev panel composition without fixes.
- Result: passed. The agent inspected runtime, design, and documentation and
  rendered 320x700, 390x844, and 1440x1000. It reported evidence-backed major
  hierarchy/responsive/design-drift findings and changed no files, proving the
  read-only mode boundary. Panel remediation is outside this feature's scope.

## Independent verification

- Tester verdict: passed after remediation. Initial material findings were an
  unconditional Review-mode fix instruction and an overly broad implicit trigger.
  Both were fixed; the final pass found no material trigger, authority, safety,
  scope, or completion ambiguity.
- Reviewer verdict: passed after remediation. Mode-specific workflow branches,
  explicit exclusions, a verification-only checklist, and the user-flow
  not-applicable rationale resolved all findings.
- Security review: not applicable. This package changes agent instructions only;
  it adds no authentication, data, rendering sink, external call, executable
  trust boundary, or model-tool permission.

## Runtime and user-flow verification

- Unit, integration, product E2E, browser/device, typecheck, build, database, and
  user-flow checks are not applicable to this Markdown/YAML-only agent skill.
  Rendered forward testing verifies the skill behavior itself; future product UI
  work remains routed to `$browser-verification` and `$testing`.

## Remaining risks

- The generic skill-creator validator remains unavailable until PyYAML is present
  in that external validator's Python environment. Repository validation and
  independent package inspection passed, so this is a tooling limitation rather
  than an uncovered package failure.
