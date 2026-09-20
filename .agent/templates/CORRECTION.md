# Correction: {{CORRECTION_NAME}}

Status: In progress
Created: {{DATE}}
Updated: {{DATE}}

## Routing decision

- Intended outcome:
- Why this is a correction:
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: continue as an improvement if its conditions hold; otherwise
  obtain feature authorization before expanded implementation. Mark this record
  `Escalated`, preserve discoveries, and link its successor.

## Context and scope

- Current behavior:
- Expected behavior:
- In scope:
- Out of scope:
- Likely files/surfaces:
- Relevant ADRs or constraints:
- Related user-flow guides:

## Acceptance criteria

- AC-1 — One observable outcome. Keep criterion text here; map its ID to the
  evidence below. Add other IDs only for distinct outcomes.

## Plan

Follow `.agent/DELIVERY.md`. For supplied-design fidelity, add the source coverage
inventory to this record using `$ui-ux-composition`.

- [ ] Implement the bounded change.
- [ ] Add or update the smallest reliable regression coverage when useful.
- [ ] Run targeted validation.
- [ ] Update affected documentation or record why none is needed.
- [ ] Inspect the final diff and record results below.

## Verification

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Tests                    | Pending                |
| Lint/typecheck/build     | Pending / not required |
| Runtime/browser/database | Pending / not required |
| Documentation/user-flow  | Pending / not required |

## Outcome and evidence

For material checks, record command, tested revision/patch state, environment,
result, and limitation. Link reused evidence with a validity reason; HEAD alone
does not identify an uncommitted patch.

- Changes made:
- Commands and results:
- Documentation:
- Review:

## Remaining risks

- None known.
