# ExecPlan: OpenRouter speech generation and local activation

Feature: [FEATURE.md](FEATURE.md)
Updated: 2026-10-27

## Goal and specification

Deliver AC-1–AC-6 on feature/openrouter-speech from clean main29d5e0f.
No new migration, dependency, public API, distributed infrastructure or billing
policy. Existing saved-source authorization, immutable jobs, private storage and
financial fencing remain authoritative. ADRs0031/0032/0045 apply.

## Milestones and current state

- [x] M1: Curated model, adapter, unified configuration and retained Kie handling;
      deterministic full production-composition execution (AC-1–AC-5).
- [x] M2a: Documentation, critical registry and all automated/browser checks.
- [x] M2b: Local provider/customer prices and ignored env settings applied;
      idempotence verified; bounded real adapter diagnostic returns valid MP3.
- [x] M2c: Coordinated local dev:all restart, then synthetic learner public-API
      admission/worker/private-audio proof (AC-6), completed after user restart.
- [x] M3a: Independent correctness, security and separate evidence reviews;
      material findings remediated and approved.
- [x] M3b: Implementation commits and required local squash merge to main at handoff.

## Decisions

D1: Fixed OpenRouter speech endpoint, reviewed Eleven v4 Turbo/George profile,
explicit MP3/language hint, ZDR/no-collection routing preferences. Bracketed audio
instructions are rejected before dispatch. Account-wide privacy remains separate.
D2: Reuse OPENROUTER_API_KEY; API speech metadata gets no executable adapter/key.
Existing text-AI code still uses the same key in the API process.
D3: Preserve both old Kie configuration identities/credentials and pending tasks.
D4: Env timeout1..45000ms, absent warns/fallback45sec; invalid aborts startup.
Entering storage renews the existing fenced60sec lease; original token/unexpired
ownership required. No stale publication or duplicate settlement.
D5: Provider costUSD0.04/1000chars is distinct from copied provisional customer
100credits/1000,min1. Operator-funded Free policy remains unchanged.

## Verification

Full critical:416 backend/29files +20browser cases,12entries, no skips/retries.
Mapped speech:10/10 across7web and3admin; helper-only prerequisite delta reviewed
for evidence reuse. No single clean composite-command pass is claimed.
Production-composition PG8cases; adapter73cases; retained/Kie44; config8.
Backend typecheck, scoped lint/format, guide validation and final build pass.
Detailed receipts, source fingerprints and failed-attempt remediation are in
[EVIDENCE.md](EVIDENCE.md); review dispositions in [REVIEW.md](REVIEW.md).

## Completed activation and startup correction

User restarted dev:all. Inspection found MinIO stopped while an old retained Kie
job retried storage. Started existing MinIO and ran its idempotent private bucket
initializer; the old job finished without resubmission. Fresh synthetic learner
signup, saved French card and speech API request completed via OpenRouter and
private S3 storage in2210ms. Valid MP3, Free0hold/0charge, estimated provider
expense1160micros, unauthenticated read401, cache replay and single job/expense.

Corrected dev:all to start MinIO and initialize the bucket before applications;
initializer has120sec deadline, failure prevents later stages and existing cleanup
preserves infrastructure. Native startup15/15 tests and independent remediation
review pass. No app process restart by the agent was needed. Guides synchronized.
The unchanged production execution source retains full critical/build/typecheck
evidence; dev-all is not called by the critical runner. No broad rerun needed.
Remaining diagnostic allowanceUSD0.025417; no further paid checks required.
Implementation2030316 plus final completion changes are squash-merged into main
as the required final handoff. No push or branch deletion. Working data retained.
