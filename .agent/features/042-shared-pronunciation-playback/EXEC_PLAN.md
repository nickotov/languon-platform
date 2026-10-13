# ExecPlan: Shared pronunciation playback and model pricing

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-14
Branch: feature/shared-pronunciation-playback

## Goal and specification

Deliver the approved shared pronunciation and administrative pricing feature. FEATURE.md owns AC text. Use .agent/DELIVERY.md and .agent/PLANS.md.

## Existing architecture

Feature 027 provides dictionary-owned private audio, Kie/fixture ports, worker leases and S3/bytea storage. Features 036–039 own sentence visibility/history/library; 033–034 own flashcards. ai-credits uses transaction participants and typed guarded reservations; text-ai owns model selection. ADR-0020/0022/0023/0026/0027/0028 govern impacted behavior. Successful global recording retention and speech success-only billing require successors.

## Test and review strategy

Unit normalization/pricing/state tests; disposable PostgreSQL admission/ledger/race/migration tests; actual MinIO adapter conformance; web/admin E2E and real browser desktop/narrow proof. Independent completion and security reviews required. Separate bounded tester reviews the accounting/concurrency harness. No native tests or paid provider calls; record live production activation separately.

## Milestones

- [x] M1 — Specification/contracts/ADRs (AC-1–12).
- [x] M2 — Shared speech persistence/provider/worker and MinIO (AC-2/3/5/6/10).
- [x] M3 — Immutable model pricing and speech credit accounting (AC-3/4/8).
- [x] M4 — Authorized sources and web learning playback (AC-1/5/9).
- [x] M5 — Admin recordings/pricing and configuration skill (AC-7/8/11).
- [x] M6 — Migration/rollout, evidence, independent review/remediation (AC-10/11/12).

## Current progress

- 2026-10-13 — Inspected clean main at35534de; created feature branch. User authorized implementation of the approved plan.
- 2026-10-14 — All scoped backend/web/admin/storage/pricing/migration/configuration work complete. Author static/build/runtime checks and guide traceability pass; EVIDENCE.md records exact results and the isolated web timeout recovery.
- Independent completion and security reviewers report no open material findings after R-1–R-5 and S-1–S-10 remediation. Reviewed patch boundary/digest is recorded in REVIEW.md.
- Disposable PostgreSQL/Redis containers and volumes removed; browser test ports closed. Existing development PostgreSQL/Redis preserved. Final diff is focused and generated next-env restored.

## Decisions

- D-1 — Global canonical text/recordings independent of account; retain indefinitely, admin-only physical erasure.
- D-2 — Source authorization stays in owning domain; typed saved references, no arbitrary text endpoint.
- D-3 — Speech-only success billing: reserve exact quote, close at 10-minute deadline, never charge after release; known task recovery 24h and no blind ambiguous retry.
- D-4 — Pricing schema version and immutable tariff revision are distinct; Auto/explicit/display use one rate source.
- D-5 — Ready recording lookup precedes new configured profile; provider changes affect misses only.
- D-6 — Current app languages only; local fixture+MinIO; no paid/live activation in this implementation unless explicitly authorized later.

## Validation

[EVIDENCE.md](./EVIDENCE.md) owns checks/proof. [REVIEW.md](./REVIEW.md) owns review/remediation.

## Remaining work

No implementation or verification work remains. Required local feature commit/squash delivery follows the repository workflow. Live provider/Selectel activation remains a separately documented release gate; default generation flags stay off.
