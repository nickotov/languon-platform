# Review: Tutor and learning-tool playground

## Boundary and source review

Base f8e6a5a2 plus tracked/untracked BL014 patch; independent completion reviewer playground_review, security reviewer playground_security and separate tester playground_verification. No paid calls. Final source, test and security evidence approved.

## Findings and remediation

- R1 High: submitted-turn cancellation before claim and ignored processNext(false) could leave queued sessions stuck. Fixed: stop own admitted turn on exception, require successful claim and terminal status. Source remediation approved; real post-submit-abort and failed-claim cleanup regressions pass.
- R2 High: scoped exact claim could never recover a different expired same-owner turn blocking capacity after restart. Fixed: recover expired same-owner turns while keeping queued selection exact; ordinary claim unchanged. Source remediation approved; stale-A/exact-B DB regression passes.
- R3 Medium: z.unknown output did not describe the actual primitive boundary. Fixed: exact canonical proposal/result/diagnostic/terminal schemas, nullable persisted failureCode and explicitly named4tool adapters. Source remediation approved.
- S1 Medium material: initial live draft dispatched with synthetic in-memory accounting. Fixed: production admission, claimed DB execution snapshot, provider runtime, real createConversationAccounting under lease, native witness and interrupted settlement for full tutor and standalone tools. Independent final security source review passes, no remaining material finding; configured real-SDK HTTP fixture persists native expense and settlement.
- T1 High evidence defect: unrelated queued fixture was placed in same conversation and legitimately blocked follow-up. Fixed by separate same-owner conversation; mapped journey subsequently passes. Targeted lifecycle cases subsequently pass.
- B1 runtime integration: Studio emits perStep:false and blank optional session field. Narrow inert-field acceptance and exact blank-session normalization added; real Studio workflow retry and same-session follow-up pass. No general override expanded.

## Review outcome

PASS — independent completion and security source/remediation/final evidence approvals. No unresolved material findings. Final frozen-patch typecheck, scoped lint, full backend build/DTS,71 focused tests,3 startup tests,16 documentation validator tests,34 guide mappings, disposable DB/native-expense journey and real Studio browser proof pass.

Standalone live-tool financial dispatch is a bounded unexecuted variant: it shares the exact claimed-turn credential resolver/accounting/witness setup with the covered live workflow and branches only into the existing canonical tool/gate. Canonical standalone tool publication and result contracts are separately tested deterministically. No paid provider execution claimed. Actual third-party connectivity/model quality and standalone admin bootstrap/live local configuration are outside this proof. All reviewers accept this boundary; no additional paid call is required.
