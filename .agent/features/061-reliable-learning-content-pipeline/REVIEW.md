# Review: Reliable learning-content tools and context pipeline

Status: Implementation verified; main integration authorized; user key rotation pending

Independent completion and security review approve the implemented source,
local cleanup and final native evidence. Separate tester assessment covers the
changed production memory/context/persistence seam. This technical approval is
not full-security completion: S3's operational key disposition remains open.

## Findings and remediation

| Finding     | Problem and impact                                                                                     | Remediation and review state                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — Medium | The obsolete generic block publication path remained, allowing two competing contracts.                | Removed its tool, contract and guard; canonical operations own publication. Source remediation approved.                                                                                                                                                             |
| R2 — Medium | Model-authored revisions could churn nested identities and break dependent references.                 | Host reconciliation preserves or assigns identities and remaps cross-target references before publication. Focused regressions pass; source remediation approved.                                                                                                    |
| R3 — Medium | Minimum-fit estimation undercounted nested JSON escaping, risking admission of a call that cannot fit. | Exact planner-envelope serialization repair passes the final registered selection; source and native evidence approved.                                                                                                                                              |
| S1 — Medium | SDK persistence could overwrite admitted user/private-history envelopes or prior assistants.           | Canonical-envelope and current-turn guards, cloned SDK input and tampering tests were added. Scoped security source remediation approved.                                                                                                                            |
| S2 — Medium | Completed recall results escaped historical compaction, retaining verbose data in later context.       | Added deterministic receipt projection. Scoped security source remediation approved.                                                                                                                                                                                 |
| S3 — High   | A configured provider credential persisted in local observational-memory configuration.                | Strict safe metadata allowlisting, safe deep merge and sentinel unit/database tests pass; one verified local configuration was scrubbed. Source/data/native evidence approved. Operational High remains pending key rotation/revocation or explicit user acceptance. |

Source grounding was also hardened: source-bearing standalone tools require host
proof. Authored or invented source text cannot become trusted pending state.
The final registered regression selection and security source review approve
these boundaries.

## Retirement and data checks

The authorized normal-lifecycle deletion was followed by a reviewed local database
check: zero old active turns, zero old active holds and zero unsettled provider-call
records. Obsolete Knowledge branches, revisions and drafts were also zero. This
supports safe retirement of old local content; it does not authorize a shared or
production reset. Accounting and unrelated configuration were retained.

## S3 remediation and operational security remainder

One observation record and one nested configuration were identified locally;
a boolean-only check confirmed its credential matched the configured OpenRouter
credential. The loopback target had zero active actions and turns. After a
graceful idle worker restart, one configuration compare-and-swap scrubbed the
verified record; zero unsafe configurations remain. Observations and all other
fields were preserved. No credential value is reproduced in records and no
exfiltration evidence was found.

Security review approves the strict metadata allowlist, safe merge, sentinel
regressions and local cleanup evidence. Full security Definition of Done still
requires provider-key rotation/revocation or the user's explicit acceptance of
the residual risk. No such disposition is recorded. The feature and BL-013/015
remain in progress; no main merge is approved while this High operational security
remainder is outstanding.

## Final technical evidence decision and retained limits

Independent completion and security review approve source, local database cleanup
and registered post-S3 run `31c235ac-356b-45ff-9992-77d9e965f3dd`: 308/308 tests,
24 files, zero skips/retries. All eight required memory cases and the 55-test store
suite, including two S1 and one S3 case, are present. Post-S3 backend build and
typecheck pass; valid web build/typecheck, all changed-source lint/format/diff checks
and guide mappings pass. Two later test-only non-null assertions emit identical
JavaScript and do not require a behavioral rerun. The
[source identity manifest](evidence/source-state.json) binds handoff evidence to
source state.

Selected real-browser journeys pass, including 50 entries through Apply/Save
followed by 10 entries and bounded refresh requests. The exact Russian two-turn
regression and 17-case opt-in evaluation set are present. A comparative live-model
evaluation is not required; deterministic cases are not live intent-quality proof.

The fresh worker doctor passes; `knowledge-actions` readiness is true. Conversation
readiness is false only because its flow fingerprint changed. Smoke preflight
stopped without paid dispatch, and no MCP alternate listener/token was available.
No live-provider proof is claimed. The architecture diagram is current/rendered;
three unrelated atlas views remain stale and outside this feature's evidence.

ADR-0055 records the accepted technical decision. The implementation is committed
locally on the feature branch. Operational S3 closure is the remaining delivery condition;
no full completion or main merge is approved.

## Integration disposition — 2026-11-11

User explicitly authorized merging the preserved061/062/063 stack after the key
incident was explained and committed to updating the key. This supersedes earlier
no-main restrictions, without claiming rotation or production qualification is
done. See [feature063 integration decision](../063-dictionary-chat-snippets/EXEC_PLAN.md#integration-disposition--2026-11-11).
Existing approved runtime evidence is unchanged; no deployment/push/deletion.
