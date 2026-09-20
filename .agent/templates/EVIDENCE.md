# Verification evidence: {{FEATURE_NAME}}

Updated: {{DATE}}

This file owns check results and acceptance-to-proof mapping. Link its IDs from
the plan and review. Keep concise evidence, not full logs.

## Acceptance coverage

| Acceptance/design ID | Implementation | Evidence IDs | Result/limitation |
| -------------------- | -------------- | ------------ | ----------------- |
| AC-1                 |                |              |                   |

Reconcile all required design rows and explicit deviations against the source;
do not use successful runtime tests as proof of source completeness.

## Check records

Use one record per material check or coherent group; omit irrelevant categories.

### E-1 — Check name

- Layer and behavior proved:
- Exact command and selected tests/scenarios:
- Tested state: commit, or base plus captured patch/content hashes including
  relevant untracked files. HEAD alone is insufficient for uncommitted work.
- Relevant environment/configuration (sanitized):
- Result and artifacts:
- Limitations:
- Reused or rerun after changes: reason and compared patch/environment state.

Include browser reference/runtime viewport, theme, data state, compared design
rows, and remaining deviations when fidelity applies. Include database
forward/rollback/invariant and disposable-environment evidence when applicable.

## User-flow evidence

List affected guides, exact mapped scenarios/test files, mapping/guide check
results, execution evidence IDs, and cleanup. Record why not applicable when
there is no executable journey. Preserve required guide/revision synchronization.

## Review link

Findings, resolutions, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining gaps and risks

List unverified behavior, invalidated results, environmental limits, and follow-up.
Do not mark unavailable evidence as passing.
