# Skill implementation and validation

Owner: skills worker
Updated: 2026-10-19

## Delivered scope

- `.agents/skills/development-cleanup`: bounded evidence-based runtime retirement,
  indirect/configuration/persisted reachability analysis, historical-record
  preservation, current failure/replay/accounting protections, scoped disposable
  data verification and established delivery/testing routing.
- `.agents/skills/architecture-diagrams`: actual implementation traced against
  accepted ADR/current docs, explicit disagreements and planned components,
  selected input fingerprints, reviewed stamping and rendered viewer validation.
- Both packages contain `SKILL.md` and matching `agents/openai.yaml`; automatic
  discovery remains enabled. No additional helper or duplicated catalog format.

## Packaging evidence

2026-10-19, feature working tree:

- `pnpm agent-skills:check`: passed 10 checker tests and validated all 24 skills.
- `pnpm exec prettier --check .agents/skills/development-cleanup .agents/skills/architecture-diagrams`:
  passed.
- Resolved skill-creator validator:
  `/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.
  System `python3` lacks PyYAML; `uv --offline` cache initialization also lacks write
  permission. Reused an existing read-only cached dependency; no install required:

    ```sh
    env PYTHONPATH=/Users/nickkotov/.cache/uv/archive-v0/ZycKpMinGWBWpv6o/lib/python3.13/site-packages /opt/homebrew/bin/python3.13 /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/development-cleanup
    env PYTHONPATH=/Users/nickkotov/.cache/uv/archive-v0/ZycKpMinGWBWpv6o/lib/python3.13/site-packages /opt/homebrew/bin/python3.13 /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/architecture-diagrams
    ```

    Both returned `Skill is valid!`.

## Behavioral evidence

Independent isolated fixture probes received only the skill path, request and raw
task artifacts. Reports live under `/private/tmp/languon-skill-probe.3ie6Dg/` and
are disposable evidence; the conclusions below preserve the outcome durably.

- Cleanup probe: inspected an old model's computed registry key, persisted row,
  null-snapshot replay guard, accepted replay ADR, historical survey and explicitly
  shared non-disposable localhost target. `cleanup/audit.md` retained active
  replay/accounting protections and historical evidence, identified the indirect
  runtime use and unresolved compatible retirement choice, and refused data deletion
  despite development stage/localhost. It distinguished fixture counts from live
  preflight counts and made no runtime completeness claim. Only its report changed.
- Diagram probe: `diagrams/output.md` traced insert, publication, generation and
  failures from fixture code; labeled queue wiring as unverified and mobile as
  planned; recorded the conflict with an accepted durable-outbox ADR. It recorded
  selected source hashes and explicitly reported absent checker/rendered evidence
  instead of claiming execution. The first probe exposed an underspecified hash
  prefix: clarified `sha256:<digest>` in the skill; follow-up reread corrected the
  prefix without changing the digest or claiming unavailable rendered evidence.

These are read-only decision/documentation probes, not application runtime evidence
or comparative efficiency measurements. Actual cleanup and diagram workers were
given the skills to read and run for this feature. Runtime evidence belongs to the
feature's main EVIDENCE.md.

## Discovery and boundaries

Descriptions include positive triggers (stale runtime retirement/current-state
flow diagrams) and exclusions (general review/blanket resets/speculative design).
Both route delivery, ADR and sensitive verification to their authoritative homes.
The cleanup skill verifies deployment stage on each run rather than encoding the
current preproduction stage permanently. The diagram skill treats freshness as
unchanged recorded inputs, with explicit discovery of newly relevant modules.
