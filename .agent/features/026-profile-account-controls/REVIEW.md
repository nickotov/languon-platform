# Independent review: Profile Account Controls

Reviewed: 2026-09-15
Reviewer: Independent implementation reviewer, independent security reviewer, independent test auditor
Verdict: Pass after remediation

## Scope reviewed

- `FEATURE.md`, `EXEC_PLAN.md`, implementation diff, tests, evidence, guides, ADRs, and deployment/recovery instructions.

## Findings and resolutions

- Critical — `s3-account-deletion-recovery-reader.ts`: current-object listing could hide retained deletion events behind S3 delete markers, reactivating a restored account. Fixed with retained-version listing, delete-marker/ambiguous-version rejection, and regression tests.
- High — `drizzle-account-deletion-store.ts` / `drizzle-dictionary-store.ts`: an authenticated in-flight share rotation could restore a bearerless unlisted link after removal. Fixed with dictionary-version bump and active-owner check; disposable SQL regression passed.
- High — `deployment.mjs` / `drizzle-account-deletion-recovery-store.ts`: routine replay could race admin cancellation/purge, reset running lease, or deadlock from inverted locks. Fixed by quiesced-only replay, request-before-user locks, and no-op for current pending/running claims; deployment/order tests passed.
- High — `account-deletion-recovery-gate.ts`: committed cancellation followed by disablement could be mistaken for uncancelled deletion. Fixed by committed request state/version evidence and regression test.
- High — `drizzle-account-deletion-store.ts` / recovery gate: a journal intent from rolled-back SQL could authorize automatic purge. Fixed with matching post-commit marker and indeterminate-intent fail-stop; injected SQL failure test passed.
- Medium — stale schedule/recent-auth time; local-only signed-out UI; broad purge-role sensitive reads. Fixed with fresh DB timestamp after locks, AuthProvider cross-tab sign-out publication, and column-only SQL grants validated on disposable DB.
- Medium test gaps — deletion HTTP 403/409/503 and cookie boundaries, handle conflict draft preservation/API methods, purge email/credential/redaction. Focused unit, UI, and disposable SQL tests added and passed.

## Acceptance, architecture, and test audit

- [x] Every criterion is implemented and evidenced.
- [x] Applicable DDD/FSD and deployment boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] Current user-flow guides and scenario/revision markers agree with mapped E2E assertions and execution evidence.
- [x] Generated browser output was removed; unrelated `design/main.pen` remains user work and must not be staged.

## Final verdict and residual risk

Independent remediation re-reviews found no remaining high-severity code finding. Production S3 Object Lock/versioned retention, IAM, and actual restore drill are operator-provisioned; the manual quiesced gate requirement for a restored DB with persisted active-slot state is documented. The broad repository-wide formatting check has pre-existing failures; remediated files were formatted without an unrelated rewrite.
