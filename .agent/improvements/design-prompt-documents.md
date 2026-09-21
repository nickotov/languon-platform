# Improvement: Persist source-linked design prompts

Status: Complete
Created: 2026-09-21
Updated: 2026-09-21

## Scope and routing

Focused development-workflow improvement: persist the already requested
dictionary brief and change design-brief's default output to docs/design-prompt.
No application behavior, API, persistence, production dependency, security policy,
deployment, or architecture change. No explicit feature lifecycle requested;
pause and obtain authorization before crossing a feature boundary.

Initial tree clean at `9061e65`. Existing source analysis from that same revision
is reused for the saved brief, without claiming new runtime verification.
In scope: skill instructions, saved prompt/index, human usage docs, this record.
Out of scope: Magic Patterns calls, application fixes, commits, frontend work.
No executable user-flow changes; linked ADRs constrain the described feature,
not a new architectural decision. Rollback: revert this focused docs/skill patch.

## Acceptance and plan

- AC-1: Dictionary prompt/checklist saved with relative feature, implementation,
  guide, evidence, and ADR links plus explicit source limitations.
- AC-2: Skill defaults to docs/design-prompt, updates canonical briefs/index,
  validates source links, and respects explicit no-write or alternate-path requests.
- AC-3: README and usage documentation agree with the new default.

- [x] Read skill authoring and shared delivery instructions; inspect Git/docs.
- [x] Save source-linked dictionary brief and align skill/usage documentation.
- [x] Validate skill package, links, formatting, policy consistency, and final diff.

## Verification and review

- AC-1: [saved dictionary prompt](../../docs/design-prompt/dictionary-ai-cards.md)
  retains all ten UI requirement sections and the copyable prompt, adds feature
  specification/plan/evidence/review links, ADRs, guide, and source/test links.
- AC-2: skill now saves/indexes canonical briefs by default, records source
  metadata and applicable links, preserves explicit no-write/path overrides,
  and updates current full prompts as well as supplying design deltas.
- AC-3: README, skills guide, development reference, handbook, and cookbook
  updated; targeted search found no stale default-output instructions there.
- `pnpm agent-skills:check`: 10 tests pass, all 18 packages valid.
- `uv run --offline --with pyyaml python
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/design-brief`: passes using approved existing offline cache.
- Scoped Prettier formatting/check and `git diff --check`: pass. Read-only Node
  check resolves 77 relative links in the skill and seven human documents and
  confirms UI-01 through UI-10 remain in the copyable block. This is structural
  evidence, not a new behavioral or runtime evaluation.
- Final content snapshot SHA-256:
  `f69e869aac8ab3bf0c7d54a46df11777c1ee7af7998e1821d79e12490867cd5c`.
  Input: sorted skill path, README, two design-prompt files, and four agentic
  usage docs; each path, NUL, bytes, NUL. Base `9061e65`, local Node/pnpm.
- Author preflight checked default save, explicit response-only/custom paths,
  absent-source handling, canonical updates, index discovery, no external
  actions, and unchanged feature authority. This narrow output-location change
  introduces no new complex design reasoning or independent-review trigger.
- No browser/database/application tests required for this documentation-only
  work; no executable guide changes, new runtime validation, remote calls, or
  commits made. Earlier synthetic probe is historical and was not rerun.

## Remaining risks

Design-system reference and live capability availability remain unverified. The
saved dictionary brief retains its previously identified transcription-limit
discrepancy rather than changing application behavior.
