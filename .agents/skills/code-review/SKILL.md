---
name: code-review
description: Independently review Languon changes for functional correctness, acceptance-criteria gaps, regressions, race conditions, error handling, DDD/FSD and package-boundary violations, security, material performance issues, and missing tests. Use after implementation, before handoff, or when explicitly asked to review a diff. Do not use for style-only review already covered by formatters and linters.
---

# Code review

## Establish review scope

Choose and record the review mode and exact diff boundary before reading code:

- **Initial:** read applicable `AGENTS.md`, the active specification/record,
  current plan, relevant evidence/ADRs, the complete scoped diff, and surrounding
  execution paths. Audit acceptance and test coverage independently.
- **Remediation:** read the prior findings and disposition, the diff since the
  reviewed state, affected callers/invariants, and updated evidence. Confirm the
  fixes and look for regressions in that surface; do not restart a full review
  merely because source changed. Include new/untracked files in the boundary.
- **Expanded:** return to broad review when remediation introduces a new trust
  boundary/public contract, material architecture change, or materially broader
  shared-component impact. Explain the expanded risk before broadening.

For an uncommitted patch, identify the base commit plus the captured patch/file
state; a HEAD SHA alone does not identify what was reviewed. Get missing context
from source rather than treating the author's summary as proof. Follow the
[shared delivery procedure](../../../.agent/DELIVERY.md) for batch remediation
and the recurring-findings diagnostic, not a fixed pass quota.

## Inspect material risk

Trace changed execution paths and verify:

- Every acceptance criterion is implemented with the intended behavior.
- Supplied-design inventory rows match the source and rendered evidence;
  missing sections, states, or unjustified deviations cannot pass on tests alone.
- Error, empty, retry, cancellation, concurrency, and boundary cases are sound.
- Backend DDD, frontend FSD, and package public-export boundaries are preserved.
- Untrusted input and model output are validated at the correct boundary.
- Authentication, authorization, tenant isolation, secrets, user data, SQL,
  rendering, external calls, and model tools are safe when applicable.
- Tests exercise the material regression surface at the correct layer.
- Database and cache changes preserve transactions, invariants, and lifecycle.
- Performance or resource use has no material unbounded behavior.

Use `$testing` to assess the validity and coverage of existing evidence. Run a
focused read-only check or test when it resolves a concrete gap, not solely to
duplicate the author's valid run. Independent review does not require a separate
tester for every feature; apply root specialist triggers. Do not modify the
implementation during independent review.

## Report findings

Lead with findings in severity order. For each finding provide:

- stable finding ID and severity
- exact file and location
- problem
- user or system impact
- reproduction/failure scenario when possible
- concrete suggested fix
- acceptance/risk affected, disposition, and evidence needed to close

Do not invent issues to populate a report and do not report formatter concerns.
If no material findings exist, say so and list residual risks or verification
gaps. Report which surface was actually reviewed and which was reused from prior
review. Separate defects from optional improvements; do not keep reopening a
resolved finding without new evidence. Record findings, disposition, and verdict
in the single correction/improvement record or feature `REVIEW.md`. Link to
evidence rather than copying command logs or acceptance text.
