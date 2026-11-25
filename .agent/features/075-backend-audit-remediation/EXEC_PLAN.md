# ExecPlan for backend audit remediation

## Goal and specification

Deliver [AC-1 through AC-6](FEATURE.md) on feature/backend-audit-remediation based on local main commit 6af72da1.

## Existing architecture

The authentication store owns PostgreSQL session locks. Knowledge transcription dispatch and publication are fenced and use financial authority functions. Migration 0173 superseded the prior attempt guard's duration-specific update branch. The workbook list spans shared contracts, the knowledge store and web callers. Public dependency versions are resolved by pnpm. Admin audit pruning is an existing operational entry point. Applicable decisions include ADRs 0001, 0002, 0016, 0022, 0045 and 0051.

## Milestones and verification

1. AC-1 and AC-6. Trace session and retention callers, run competing two-connection tests and disposable prune tests, with fresh/expired rows and repeated execution.
2. AC-2 and AC-3. Fault-inject rollback/acknowledgement and cancellation, migrate an empty database, exercise production grants, verify receipt replay plus numeric boundaries, run registered ai-speech.
3. AC-4. Check release/advisory evidence, install through pnpm, inspect resolutions, exercise backend and parser fixtures and impacted shared package consumers.
4. AC-5. Verify the shared page contract, 500+ seeded rows across ties, owner scope, actual web continuation and mapped browser flow.
5. Run affected lint, typechecks/builds and user-flow validators. Request independent source/security review after preflight, fix findings, verify final patch and squash into local main per repository policy.

Focused unit checks should take seconds, disposable database verification and affected UI/build gates several minutes each. Network and native package resolution may extend dependency verification. Coordinate registered suites using their shared runner lock.

## Progress and decisions

2026-11-25. Committed the previous improvement, created branch, generated four feature artifacts and started six implementation slices. Use a new forward migration for financial authority. Keep integration tests deterministic. Preserve current auth/financial contracts and existing UI pagination conventions. No strategic architecture change proposed.

## Validation and remaining work

See [evidence](EVIDENCE.md) and [review](REVIEW.md). Detailed check results and review dispositions follow in the verification records.

### Implementation checkpoint

Owner-first session locking, bounded terminal-write replay, migration 0186, dependency resolution, workbook continuation and retention scheduling are in progress. The deployment manifest's reviewed prefix stops at 0171; feature authorization covers the new migration and disposable proof, and does not certify the intervening historical migrations for a release. The ordinary local database has one pending migration. Use migrated disposable instances for financial and retention proof and identify local readiness separately.

2026-11-25 verification checkpoint. AC-1 and AC-6 passed real contention/limited-grant database tests. AC-4 packaging, direct advisory check and Linux native smoke passed. Completed independent review remediation for sustained transient publication errors and indexed workbook seeks. Protected API/web and admin session journeys and shared accounting are being verified in separate local runs after concurrent fresh migrations and cold Next compilation exhausted test harness deadlines. Preserve original timings/failures alongside repeat results in EVIDENCE. Do not relax production timeouts or the financial invariants.

Final checkpoint. AC-1 through AC-6 implemented and verified. The final shared-invariant gate passed all 251 tests in isolation. The two initial review findings and the canonical SQL token issue were resolved. All required implementation and verification work is complete. Local integration uses the feature workflow’s squash commit.
