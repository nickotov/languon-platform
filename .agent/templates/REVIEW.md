# Review: {{FEATURE_NAME}}

Reviewed: {{DATE}}
Reviewer: Unassigned
Verdict: Pending

## Review boundary

- Mode: Initial / Remediation / Expanded.
- Trigger and question:
- Reviewed state: base + head or captured patch/file state including untracked
  files; for remediation, identify the previously reviewed state too.
- Scope/affected callers or invariants:
- Inputs: specification IDs, relevant plan/source/ADRs, evidence IDs.
- Separate tester/security review: root trigger and bounded assignment, or why
  not required.
- Expansion reason, if this is a new broad review:

## Findings

Use stable IDs. Report material defects with evidence; separate optional work.
Use `None` when there are no material findings.

### R-1

- Severity: Critical / High / Medium / Low
- Location:
- Problem and failure/reproduction scenario:
- User/system impact and acceptance/risk affected:
- Suggested fix:
- Disposition: Open / Fixed / Accepted with rationale / Rejected with evidence
- Resolution evidence IDs and affected follow-up review:

## Completion audit

- Acceptance criteria and source-design inventory reconciled with implementation
  and valid evidence.
- Material regression/architecture/security risks assessed.
- Applicable guides, mappings, and required verification current.
- No accidental scope, secrets, or temporary/generated artifacts.
- Remaining uncertainty and boundaries of this review explicit.

## Remediation and final verdict

Record batched repairs, which evidence was invalidated/reused, and the scope of
follow-up review. A fix does not automatically require another full review.
Follow `.agent/DELIVERY.md` for recurring-findings diagnosis after two cycles;
never use a cycle count to waive material defects.

Final verdict and remaining risks:
