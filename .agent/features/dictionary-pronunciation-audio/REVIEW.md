# Review: Dictionary pronunciation audio

Reviewed: 2026-09-21
Reviewer: architect agent `audio_architecture`
Verdict: Architecture recommendations incorporated; user plan review pending

## Review boundary

- Mode: Early specialist design review, explicitly requested by user.
- Question: how to integrate configurable async TTS and dev/prod byte storage
  into dictionary, worker, access, deletion and release boundaries without
  generic abstractions or hidden mobile scope expansion.
- Inputs: current source/ADRs and user requirements. Agent was read-only.
- This is not implementation completion review or security approval. Independent
  completion/security reviews and focused concurrency tester remain required.

## Findings and disposition

| ID / severity | Location                                                       | Problem and impact                                                                     | Suggested fix / disposition                                                                           |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| R-1 / High    | Existing proposal executor and release dictionaryJobs metadata | Audio cannot satisfy proposal payload/token/acceptance semantics                       | Separate speech application queue and capability metadata; incorporated in plan/ADR                   |
| R-2 / High    | Proposed cache identity                                        | Provider-only rendition lookup would invalidate existing audio on default switch       | Resolve logical field binding first; incorporated                                                     |
| R-3 / High    | Provider submit boundary                                       | Crash after upstream acceptance can duplicate paid generation on retry                 | Durable submit intent, unknown state, conservative reservation and reconciliation; incorporated       |
| R-4 / High    | Purge store/service and storage dispatch                       | Existing enumeration omits audio; SQL deletion could orphan bytes or allow late writes | Typed audio inventory, cancellation/quiescence, all-version cleanup before finalization; incorporated |
| R-5 / Medium  | Web playback transport                                         | Audio element URL cannot attach existing bearer headers                                | Authenticated bounded fetch/Blob, CSP and revocation/error checks; incorporated                       |
| R-6 / Medium  | Native and shared-reader scope                                 | No native dictionary journey; anonymous read should not implicitly authorize spend     | Explicit owner-web v1 proposal and deferred native/shared playback; awaiting user scope review        |
| R-7 / Medium  | Provider-default switching                                     | Pending task may be polled using new credentials/model configuration                   | Persist original provider config identity and retain until drain; incorporated                        |

## Completion audit

R-8 / Medium — Final draft review identified that the 120-second visible deadline
did not explicitly separate upstream settlement/cleanup from terminal UI states
(EXEC_PLAN.md, Durable lifecycle and budgets). This could cause duplicate paid
submission on repeated Play or indefinitely block purge. Fixed in the plan:
retain task identity/reservations until reconciliation, release local execution
capacity independently, suppress duplicate submit, prohibit surprise playback,
and require local writer/object erasure without claiming upstream erasure. Added
timeout→late-success/repeated-Play fault-injection cases. Disposition: addressed
in planning; runtime proof remains required under AC-6/8/9.

Only planning is in scope now. No implementation acceptance item is marked done.
Architect findings refine the proposal; they are not confirmed runtime defects.
Final artifact consistency review and user review remain distinct from future
delivery preflight and completion review.

## Remediation and final verdict

Main agent incorporated the architectural recommendations into FEATURE.md,
EXEC_PLAN.md and proposed ADR-0020. The architect completed final draft review
and found the proposal ready for user review after the R-8 clarification above;
that clarification is now incorporated. No other material design gaps reported.
Do not implement until the user approves. No paid calls, provisioning or feature
completion/merge is authorized by this planning-only handoff.
