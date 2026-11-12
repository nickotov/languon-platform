# ExecPlan: Reliable learning-content tools and context pipeline

## Goal and specification

Implement [FEATURE.md](FEATURE.md) under the user's explicit feature authorization.
Work is on `feature/reliable-learning-content-pipeline`, created from main at
`89ff4193`. Preserve the existing research and feature 060's historical evidence.
The selected implementation gates and independent source/data evidence review
pass. Overall delivery remains in progress until the S3 operational security
remainder is resolved; no main merge is approved.

## Diagnosed causes

The original preflight combined sequential planning, authoring and hypothetical
retrieval allowances, rejecting a viable request before provider dispatch. The
Knowledge planner bypassed prepared observational memory, and completed tool
payloads could remain verbose in later context. Proposal queries also reacted to
turn status changes, causing repeated unchanged reads. These are the diagnosed
starting conditions; the implementations below replace them.

The Hono/Mastra worker continues to own frozen sources, fenced writes, admitted
action limits and settlement. Accepted ADRs 0042, 0045, 0050 and 0052 remain binding.
[ADR-0055](../../../docs/adr/0055-learning-content-context-and-publication.md)
records the accepted technical decision. Acceptance does not close the S3
operational security remainder.

## Decisions

- D1: Implement one current contract. Remove compatibility-only paths for
  unreleased versions while retaining current revision, exact copy and prose
  capabilities. Knowledge bodies use canonical schema version 2, including prose
  proposals; prose-only eligibility depends on content, not an old version reader.
- D2: Share required input envelopes between admission and execution by phase.
  Keep financial upper bounds separate from context fit and reducible history.
  Never reserve sequential phases as one provider call.
- D3: Prepare observational memory once per action and give the planner that
  prepared context. Use a separate constructor-level persistence-only Memory
  instance over the same storage; persist canonical current-turn SDK output,
  without writing prepared projections back over user or historical records.
- D4: One authoring/publication operation validates all requested components and
  publishes once. Singleton tools use that operation; mixed requests do not loop
  through independently publishing tools. Return compact typed receipts while
  retaining exact proposal data for Review and authorized readback.
- D5: Retain existing HTTP/SSE activity, authority and source fences. Studio is
  BL-014 and outside this feature. Live checks follow the standing smoke policy;
  deterministic transport evidence is not live-provider evidence.

## Verification strategy

The selected checks are focused context, authoring, registry and frontend suites
(seconds to approximately two minutes), plus registered production-composition
integration against disposable PostgreSQL/Redis (approximately one minute before
cold setup). They cover the production 64,000-token allowance, reduced limits,
invalid output, exact source authority, cancellation, publication and settlement.
The changed production memory seam receives separate tester assessment.

Mapped browser journeys cover mixed/prose behavior, revision/copy, reference
limits, and 50 entries through Review/Apply/Save/reload followed by a new 10-entry
request with request-count assertions. Allow approximately two to five minutes
plus cold setup. Complete affected package/backend/web static and build checks,
scoped lint/format/diff checks, guide mappings, baseline/final readiness doctor,
and independent completion/security review. A full repository regression is not
selected without evidence of broader shared impact.

## Milestones and ownership

- [x] M1 implementation: pre-release instructions; phase budgets and admission;
      prepared planner context; historical receipts and guarded persistence.
- [x] M2 implementation: shared capability registry, four dedicated tools, atomic
      authoring/publication, canonical revision/copy/prose and obsolete-path retirement.
- [x] M3 implementation: single proposal query owner, targeted SSE reconciliation,
      follow-up generation and request-count browser assertions.
- [x] M4 technical verification: post-S3 registered native/persistence selection,
      affected static/build checks, local metadata cleanup and independent
      source/data/native evidence approval passed.
- [ ] Operational security closure: rotate/revoke the exposed provider key or
      record the user's explicit acceptance of the residual risk. No strict
      completion or main merge until this disposition is recorded.

Context, tools, frontend and canonical-contract workers own their assigned source
and tests. The documentation worker owns this record, evidence/review bookkeeping
and BL-013/015 reconciliation. Root retains integration and final approval.
All workers preserve each other's edits and coordinate shared contract changes.

## User-flow documentation

The Knowledge workspace, interactive workbooks and contextual assistant guides
now describe the current budget, canonical publication and targeted refresh
behavior. Preserve existing scenario IDs and revision markers. The documentation
validator reports 33 guides and the three affected mappings passing. These checks
prove traceability, not execution; executed browser evidence is recorded separately.

## Progress and discoveries

On 2026-11-06, the feature branch and artifacts were created, root/package
pre-release policy was updated, and the implementations above landed in the work
in progress. Browser journeys passed on an isolated deterministic 64K composition.
The user-authorized obsolete local Knowledge content was retired through the
normal deletion lifecycle; see [EVIDENCE.md](EVIDENCE.md) for exact counts and scope.

Pinned Mastra 1.57 can fall back to constructor observational-memory configuration
when given a false runtime override, requiring constructor-level persistence-only
Memory. Tool descriptor registration also needs to preserve `toModelOutput`.
Review identified identity reconciliation, persistence authority, recall projection
and nested JSON budget issues; remediation status is in [REVIEW.md](REVIEW.md).

The observer fixture failure was traced to synthetic repetitive output and an
invalid single-line closing tag rejected by the SDK, then repaired. Registered
run `91b9b0e5-9f74-4afa-848f-a76194da7e75` passed all 297 tests across 23 files with
zero skips or retries before the subsequent S3 repair. Earlier diagnostics remain
historical and are not evidence of an unresolved runtime-memory failure.

Security review then found S3: a configured OpenRouter key persisted in one local
observational-memory configuration. A strict safe metadata allowlist, safe deep
merge and sentinel unit/database regressions now protect persistence. After a
reviewed idle-worker restart, a single configuration compare-and-swap scrubbed
the verified local record, preserving observations and all nonconfiguration data.
The final post-S3 registered selection passed 308 tests across 24 files with no
skips or retries; backend build/typecheck and scoped static checks also passed.
Independent completion and security reviewers approve this source, cleanup and
native evidence. Key rotation/revocation remains external user action; no
exfiltration evidence was found.

## Remaining work and operational limitation

The final fresh worker doctor passes. `knowledge-actions` is ready; conversation
readiness is false only because its flow fingerprint changed. Smoke preflight
stopped without a paid call. No Admin MCP listener on port 3002 or MCP token was
available for the alternate path. Readiness and live-provider proof remain
separate; no paid provider execution is claimed.

The exact Russian two-turn regression and 17-case opt-in evaluation set are
present (29 request-execution tests). The architecture diagram is current and
rendered; three unrelated atlas views remain stale and are outside this feature.
The final [source identity manifest](evidence/source-state.json) records the source
state for handoff; root owns its capture.

The only delivery closure requirement is S3's operational security disposition:
rotate/revoke the provider key or obtain the user's explicit acceptance of its
residual risk. Keep the feature and BL-013/015 in progress. The implementation is
committed locally on the feature branch; no main merge is approved while this
High security remainder is outstanding.

## Integration disposition — 2026-11-11

User explicitly authorized merging the preserved061/062/063 stack after the key
incident was explained and committed to updating the key. This supersedes earlier
no-main restrictions, without claiming rotation or production qualification is
done. See [feature063 integration decision](../063-dictionary-chat-snippets/EXEC_PLAN.md#integration-disposition--2026-11-11).
Existing approved runtime evidence is unchanged; no deployment/push/deletion.

## BL-013 closure instruction — 2026-11-12

After implementation and the outstanding key rotation were explained, the user
explicitly said “so mark it as done” for BL-013. The implemented and verified
[task](../../../docs/backlog/013-dedicated-learning-content-tools-done.md) is now
Done under that instruction. This supersedes earlier directions to keep BL-013
in progress. Key rotation remains unconfirmed; this does not close S3, change
BL-015's status, or assert new implementation/runtime evidence.

## BL-015 closure instruction — 2026-11-12

After BL-015's implemented behavior, verification and remaining key-rotation item
were explained, the user explicitly said “so mark it done”. The implemented and
verified [task](../../../docs/backlog/015-reliable-tutor-generation-routing-done.md)
is now Done under that instruction, superseding earlier directions to keep BL-015
in progress. Key rotation remains unconfirmed; this does not close S3 or assert
new runtime evidence or live-model intent-quality proof.
