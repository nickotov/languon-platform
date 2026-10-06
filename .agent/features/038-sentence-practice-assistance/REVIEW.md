# Review: Sentence practice assistance

## Backend checkpoint verdict — 2026-10-05

Approved by independent reviewer /root/sentence_web_completion_review after author
preflight and bounded remediation. This is a backend compatibility/security
checkpoint, not overall feature completion, UI approval or a fidelity claim.

Base: e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a.
Reviewed 44-file manifest: cd2d3b9ab05b555f194cd4d9a8727d8c6bfcb5d741edea7bc6522a82ad483d44.
Production/contracts/migrations/tests subset: e2d155412cbd056ed35b93f9663bfb02874efe0fd71bead7c38361b24a892d04.
Pre-existing maintenance excluded using its completed work records and worker
baseline /private/tmp/feature038-worker-baseline.patch. Root integrates decisions;
workers owned bounded non-overlapping implementation/docs/verification seams.

## Findings

### 038-R1 — Medium — Fixed

Location: learning domain sentence-content.ts combined-hint validation.
Individually bounded hints could collectively reproduce the private reference
before explicit reveal. Validation now composes all dictionary/contextual hint
occurrences in source order, preserving repeats, and rejects normalized full
reference containment. Single/two-occurrence regressions pass. The max43-hint
fixture now retains grammatical scaffolding outside lexical hints; all22 real
store/role/HTTP tests pass after the change. Independent remediation review agrees.

### 038-R2 — Low — Fixed

Location: FEATURE.md agent registration boundary and EXEC_PLAN checklist.
The changed sentence agent lacked a durable Studio exclusion rationale. Both
agents remain intentionally worker-only; authenticated job authority, pinned
budgets and leases are unavailable in Studio and no safe synthetic Studio harness
is scoped. The explicit reason now satisfies the backend checklist.

## Scoped security and compatibility audit

Pass. No remaining material findings. Helpers have no entry identity and do not
change coverage or target assessment. Bounds, script/disclosure validation, exact
legacy parsing, explicit format activation, configured worker capabilities,
format/policy SQL constraints, private reference authority, current versions,
erasure, reservation/cancellation/idempotency and restricted roles retain valid
proof. No new authorization route, SQL interpolation, credit exemption, logging
exposure or model tools. Studio remains intentionally excluded.

Evidence assessed:78 contracts/5 prompts, affected backend units and post-fix
domain cases,22 real PostgreSQL/Redis/restricted-role tests, mapped guide checks,
lint/typecheck/build and clean diff. No separate tester was required: existing
integration harnesses and focused worker verification cover the bounded seam;
there is no new harness or unresolved cross-application concurrency at this stage.

## Expected remaining work

Live-model linguistic quality is not proven by deterministic tests. V2 activation
waits for compatible UI/release support. Free client comparison, replacement
results, exact/fresh replay, returned-design fidelity, browser proof and overall
independent completion review remain pending. Feature038 is not Complete.

## Updated-design independent review — 2026-10-06

The independent completion reviewer inspected the v8 source inventory, production frontend/model changes, exact-replay boundary, focused tests, and retained runtime captures. Author remediation resolved the empty-screen duplicate action, pending-reference leave guard, localized result labels, uncertain-reference race, and premature clearing of results during queued fresh generation. The reviewer independently reran all 73 focused tests successfully; no unresolved production correctness finding remains in the reviewed changes. A duplicate-text candidate caused by compressed tool output was checked and withdrawn.

The first two full-suite reruns were diagnostic (5/7 each), not accepted as full passing proof. Their passing scenario captures are retained with explicit diagnostic manifests. Remaining failures were stale harness assumptions and normal bounded request-rate retries. The final run adds contextual hover disclosure and keyboard Escape/focus evidence to close SPH-04/18. Final browser verdict is approved by the independent reviewer after the consolidated seven-scenario run and retained capture manifest.

Git scope remains a separate authority gap: the working tree includes earlier completed sentence-practice corrections/improvements and shared-dialog maintenance, with no exact whole-tree baseline allowing the feature-only commit to be established safely. Existing maintenance records exclude automatic commit/merge. Preserve those changes; obtain concrete scope authorization before including them in the required local feature commit and squash merge. No review approval grants that authority.

## Final independent verdict — 2026-10-06

Product implementation and security checkpoint approved. The independent reviewer inspected the replay boundary, controller/UI state machine, affected callers, v8 design inventory, contracts, tests and final browser evidence, and reused the remediated backend compatibility/security checkpoint. AC-1–AC-7 and SPH-01–SPH-20 are supported. No remaining material implementation, acceptance, architecture, race, performance or security defect was found. C1–C5 are resolved as described above; backend R1/R2 remain resolved. Final Chromium mapped suite: seven passed in 2.5m, 72 SHA-listed PNGs, no unexpected browser errors. Tested spec SHA-256 `f027a321ca1321f973b723ef7df066c7699f6284e7457577a8d02cb76ab409c9` matches the retained final manifest; subsequent guide-marker edits are comment-only.

Security: versioned model output is strictly inventory/association/script/disclosure validated; SQL remains parameterized; replay preflights the complete ordered list and reauthorizes every current owner/shared/private/version/scope request; reference stays private until authorized free reveal; replay creates no generation job, reservation or spend; React escapes rendered model content; no raw prompt, answer or model-text logging was introduced.

**038-C6 — Medium, delivery/DoD blocker (open).** Location: FEATURE scope, EXEC_PLAN M5, current worktree based on `e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a`. The tested feature is interleaved with pre-existing uncommitted local-default, idiomatic-generation, learning-dialog and reliability maintenance whose records exclude automatic commit/merge; partial baselines cannot safely reconstruct a complete standalone staging set. Staging all paths could commit earlier user work; subtracting it could produce an untested controller/UI. Obtain explicit authority for a documented combined boundary or separately land prerequisite maintenance, then inspect the exact staged manifest/diff and `git diff --cached --check`, and rerun checks affected by separation or conflict resolution. This blocks Git lifecycle completion, not product/security approval. No blanket stage or merge is authorized by this verdict.

Reviewed manifest: 328 dirty/untracked files including retained source/evidence, relative-path/NUL/content/NUL SHA-256 `06ac413b11228d99ffcecc5ffc6c99d47dc4fcd7396ec294bf03ca696c35e381`; later root evidence/record and comment-only marker updates are bookkeeping.

Limits: fake providers do not prove live-model linguistic quality. V2 activation stays explicit/default-v1 as scoped. Source/content/state/runtime fidelity is supported without external pixel-equivalence evidence. Keyboard and 200% zoom checks use documented viewport simulations. These are documented limits, not production review blockers. Feature remains in progress pending C6 and required Git completion.

## Authorized combined commit — 2026-10-06

The user requested “commit” after completion of the check-validation improvement.
This authorizes a combined local commit of sentence-practice assistance and its
interleaved local-default, idiomatic-generation, learning-dialog, reliability and
check-validation maintenance, including tests, migrations, design snapshots and
verification evidence. The exact staged manifest is inspected before committing.
038-C6's commit-scope authority gap is resolved by this explicit request. No push
or branch deletion is requested; integration into main is not performed by this
commit-only action and remains separate from product verification.
