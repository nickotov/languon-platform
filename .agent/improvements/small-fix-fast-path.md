# Improvement: Small-fix delivery fast path

Status: Complete
Created: 2026-10-04
Updated: 2026-10-04

## Routing decision and scope

User authorized implementing the workflow recommendations after reviewing the
swipe-fade task overhead. This is a focused developer-workflow improvement,
not a product feature. No runtime, dependencies, public contracts, persistence,
security policy, deployment, or accepted ADR changes. ADR-0016's real-browser
requirement remains intact. Existing dirty application work is excluded.

Affected files: root `AGENTS.md`, `.agent/DELIVERY.md`, testing and browser
verification skill entrypoints. No user-flow commands or application behavior
change, so guide/E2E synchronization and runtime/database checks are inapplicable.
Rollback: remove the added guidance; no migration or runtime rollback needed.

## Acceptance criteria

- AC-1: Small fixes default to bounded discovery, one concise record, focused
  tests, reused valid evidence, and justified infrastructure/review expansion.
- AC-2: Adequate durable real-browser evidence avoids duplicate exploratory
  sessions without weakening wrapper restrictions, fidelity, or E2E obligations.
- AC-3: Complexity checkpoints never authorize skipped gates, premature stopping,
  or feature/security boundary bypasses.

## Plan and verification

- Implement recommendations in existing authoritative workflow homes.
- Check formatting, skill packaging, links, and the focused diff.
- Run bounded fresh-context decision probes using reusable workflow cases;
  retain raw results and assess safety/proportionality. Do not claim measured
  time/token savings from instruction changes or decision probes.

## Outcome and evidence

- AC-1–AC-3 implemented in the four scoped instruction files. The shared delivery
  document owns the fast path; root routing and specialist skills link/apply it.
- `pnpm exec prettier --check AGENTS.md .agent/DELIVERY.md .agents/skills/testing/SKILL.md .agents/skills/browser-verification/SKILL.md .agent/improvements/small-fix-fast-path.md .agent/improvements/evidence/small-fix-fast-path-validation.md` passes.
- Official packaging checks pass for both changed skills:
  `uv run --offline --with pyyaml python /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/<testing|browser-verification>`.
  Host `python` was absent and `python3` lacked PyYAML; the existing offline uv
  cache required approved sandbox access. No dependency installation or downloads.
- Local Markdown link targets exist; the fast-path heading matches the new
  anchors. `git diff --check` and focused author diff inspection pass.
- [Independent raw validation](evidence/small-fix-fast-path-validation.md): fresh
  context read-only probes for reusable cases 01 and 06, plus browser-evidence
  sufficiency and scoped authority-conflict review. No material findings.
  Evaluator rubric read only after saving the response: all observable conditions
  for cases 01 and 06 pass. The browser scenario preserves gap-filling and final
  patch validity requirements. These are current-instruction decision probes,
  not an isolated old/new comparison; two cases shared one fresh probe context.
- No application/browser/database execution or full lint/build is needed for
  this instruction-only patch. Existing UI changes remain excluded and untouched.
  No application guide/E2E markers or accepted ADR text changed. No commit made.

## Remaining risks

Final instruction patch identity (base `61739a8`, SHA-256; only record/evidence
prose changed after these sources were independently checked):

| File                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md`                | `f506333bc09b9120b48357112f182d2af2a8332dbb78b3300897a319673afb19` |
| `.agent/DELIVERY.md`       | `dfba5ad977164e937d71abd21f6a0bec83d69247150458e4e64bec6376cb98b4` |
| Testing skill              | `c2a0c52fa16a977a51665bc6d6f0dcc2d725d6d6ea50102b212a4e4e058a8809` |
| Browser-verification skill | `a3e16e51f1c0831029956488be4286e0ebb8e35e259899e4ce62501ab41d0beb` |

Actual delivery-time savings remain unmeasured; future task observations must
confirm efficiency without increasing escaped defects or user repair rounds.
