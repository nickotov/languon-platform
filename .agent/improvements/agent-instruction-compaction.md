# Improvement: Concise agent instructions

Status: Complete
Created: 2026-10-31

## Scope

User requests shorter agent instructions without losing requirements. Improvement:
wording and deduplication only; no product, tooling, policy or Git-authority change.
Preserve prior uncommitted work, including incremental testing, design approval and
standing AI allowance. No commit requested.

Five targets: root and backend AGENTS.md; shared DELIVERY, PLANS and DESIGN_HANDOFF.
Other app instructions are already brief. Baselines captured from the working tree
before edits under `/tmp/languon-instruction-compaction-20261031/`, including hashes
and counts; HEAD alone omits the previous authorized workflow changes.

## Acceptance and verification

- Preserve every obligation, condition, exception, boundary, command and link target.
- Reduce words/bytes through shorter wording and deduplication, not line wrapping
  or relocation into extra mandatory reads. Retain readable prose and anchors.
- Independent baseline-to-rewrite semantic review; focused read-only workflow
  decision probes; scoped formatting and local link/anchor checks.
- No application/browser/DB/provider checks: executable behavior is unchanged.
  Mechanical checks should take seconds; review duration depends on omissions.
  No measured model-quality or runtime-efficiency claim from size reductions.

## Plan and ownership

- Root: root instructions, integration, evidence and final diff.
- compact_delivery: DELIVERY.md.
- compact_supporting_instructions: PLANS, DESIGN_HANDOFF, backend instructions.
- Independent reviewer: semantic retention against exact pre-edit snapshots.

## Evidence and remaining work

All five rewrites complete. Independent semantic review found two root wording
gaps: new-doc metadata coverage and unconditional affected-guide validation. Both
were restored and independently approved on final review. The full five-file
clause audit found no remaining material omissions or policy changes. Fresh read-only
case 06 and 09 decision probes passed in isolated agent contexts on the shared
checkout. Case 06 retained feature authorization for auth-policy changes, security
review, real database/replay proof and affected test selection. Case 09 retained
visual-direction approval, autonomous tooltip correction, focused browser proof
and retrospective only after user acceptance. These probes establish bounded
instruction decisions, not measured quality or runtime improvements.
Compared with exact working-tree baselines, scoped files total 8,569 → 6,445 words
(−24.8%), 65,778 → 54,221 bytes (−17.6%) and 1,133 → 947 lines (−16.4%).
Root instructions: 3,025 → 2,057 words; DELIVERY: 2,866 → 2,167;
PLANS: 736 → 602; DESIGN_HANDOFF: 966 → 790; backend: 976 → 829.

Passed `pnpm exec prettier --check AGENTS.md .agent/DELIVERY.md .agent/PLANS.md .agent/DESIGN_HANDOFF.md apps/backend/AGENTS.md`
and scoped `git diff --check`. Local Markdown audit preserved every heading/link
target, resolved all outgoing links/fragments and all 59 inbound links to these
files. Audit script: `/tmp/languon-instruction-compaction-check.py`; counts, report
and hashes: `/tmp/languon-instruction-compaction-20261031/final-mechanical-report.json`
and `final-sha256.txt` in the same directory. These checks prove packaging, not
semantic quality or runtime/token savings. Metrics/hashes refreshed after the two review fixes. These restore original doc
requirements without changing the security/design decisions exercised by the probes;
their evidence remains valid.

Rollback only these scoped prose edits to their saved pre-edit contents, preserving
unrelated work. Acceptance retrospective remains pending until user acceptance.

Final verdict: semantic-retention review approved; both findings resolved.
Formatting, links/anchors, whitespace and decision probes passed. No application
code, configuration or tests changed in this compaction; prior uncommitted work
is preserved. No commit made. User acceptance/retrospective remains pending.
