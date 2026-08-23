---
name: code-review
description: Independently review Languon changes for functional correctness, acceptance-criteria gaps, regressions, race conditions, error handling, DDD/FSD and package-boundary violations, security, material performance issues, and missing tests. Use after implementation, before handoff, or when explicitly asked to review a diff. Do not use for style-only review already covered by formatters and linters.
---

# Code review

## Establish review scope

Read applicable `AGENTS.md`, the active correction or improvement document, or feature
`FEATURE.md`/`EXEC_PLAN.md`/`EVIDENCE.md`, architecture docs, the complete diff,
and relevant surrounding code. Review independently from authoring reasoning.

## Inspect material risk

Trace changed execution paths and verify:

- Every acceptance criterion is implemented with the intended behavior.
- Error, empty, retry, cancellation, concurrency, and boundary cases are sound.
- Backend DDD, frontend FSD, and package public-export boundaries are preserved.
- Untrusted input and model output are validated at the correct boundary.
- Authentication, authorization, tenant isolation, secrets, user data, SQL,
  rendering, external calls, and model tools are safe when applicable.
- Tests exercise the material regression surface at the correct layer.
- Database and cache changes preserve transactions, invariants, and lifecycle.
- Performance or resource use has no material unbounded behavior.

Run focused read-only checks or tests when they materially increase confidence.
Do not modify the implementation during the independent review.

## Report findings

Lead with findings in severity order. For each finding provide:

- severity
- exact file and location
- problem
- user or system impact
- reproduction/failure scenario when possible
- concrete suggested fix

Do not invent issues to populate a report and do not report formatter concerns.
If no material findings exist, say so and list residual risks or verification
gaps. Record review and resolutions in the single correction or improvement document, or feature
`REVIEW.md`, according to the active flow.
