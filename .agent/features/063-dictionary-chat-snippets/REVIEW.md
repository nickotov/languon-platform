# Review: Dictionary chat snippets

Status: Complete — accepted, independently verified; local main squash authorized

## Boundary

Independent completion and security reviewers assessed the scoped feature against11a07a5c after focused author preflight, then the actual remediation diff. Existing feature061/062 release qualification is preserved, not approved by this review. Final evidence review reuses valid reports instead of restarting source review or broad suites.

## Findings and resolution

| ID     | Severity / location               | Problem and fix                                                                                                                                                                                           | Proof                                                                                                   |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| S63-R1 | Medium; native snippet generation | Prompt-only count could accept partial results. A bounded generation brief now resolves requested/default count before dedicated accounted authoring, validates exact full output and aborts on failure.  | Tool/domain and actual-SDK partial-count failure                                                        |
| S63-R2 | Medium; exact source readback     | Read limit exposed40 of100 cards. Up to10 pages now cover100; revision authoring receives the exact server-authorized full retained source.                                                               | 100-card actual-SDK revision                                                                            |
| S63-R3 | Medium; Apply retry               | 409 replay reused stale versions forever. Conflict recovery fetches versions and creates a new operation; Replace reopens current-count confirmation. Ambiguous transport retries retain exact operation. | 10 component tests; browser confirmation flow                                                           |
| S63-R4 | Medium; dictionary transaction    | Apply bypassed global mutation admission. Existing acquireGlobalPermit runs before owner/resource locks.                                                                                                  | Real PG saturation red→green;5/5 final store                                                            |
| S63-S1 | Medium; authoring validation      | Missing enabled fields could fail outside the fatal authoring boundary and permit charged outer success. Semantic validation moved inside that boundary.                                                  | Exact10 missing-definition actual-SDK case: no artifact/mutation/outer success/learner charge;5/5 final |

Completion remediation review approved R1–R4 with no new material findings. Security source remediation closed S1 with no remaining material security findings. Both reviewers verified the final SDK5/5 and PG5/5 reports, current source/report hashes, browser1/1 and selected static/runtime evidence. Final evidence approval returned2026-11-11.

## Final verdict

Approved for local feature063 acceptance by /root/snippets_completion_review and /root/snippets_security_review. All83 scoped source hashes and9 retained report hashes match current state. Selected local gates are green (see EVIDENCE.md and manifest); no remaining concrete feature gap or material security finding. Main/release integration remains withheld for inherited prerequisites, independently of local snippet readiness.

## Integration disposition — 2026-11-11

User explicitly authorized merging the preserved061/062/063 stack after the key
incident was explained and committed to updating the key. This supersedes earlier
no-main restrictions, without claiming rotation or production qualification is
done. See [feature063 integration decision](../063-dictionary-chat-snippets/EXEC_PLAN.md#integration-disposition--2026-11-11).
Existing approved runtime evidence is unchanged; no deployment/push/deletion.
