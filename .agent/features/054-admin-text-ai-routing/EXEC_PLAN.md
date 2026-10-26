# ExecPlan: Admin-owned text AI routing

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-26

## Goal and specification

Deliver ROUTE-1–10 from FEATURE.md and confirmed design on feature/admin-text-ai-routing, branched from main61a4616. Prior Kie diagnostics and design committed before work. No data resets. Bounded synthetic live checks are now explicitly authorized (USD 0.01 each, USD 0.10 combined).

## Existing architecture

text-ai owns reviewed app/infrastructure catalogs, selected execution and admission participant; administration owns audited settings; feature modules own typed jobs/validation. ai-credits owns exact transaction participants/provider expense. Preserve configuration/worker capability fencing and current narrow-query behavior. ADR0021/0026/0037/0045 apply except newly accepted ADR0046 changes.

## Test and review strategy

Production SDK fake-HTTP adapter fixtures, domain routing tests, real disposable PostgreSQL concurrency/settlement/migration checks, admin HTTP auth and browser journeys, learner critical journeys, affected static checks and full critical gate required. Existing performance fixture required for altered admission. User-flow guide revision/scenario mappings synchronized through user-flow-e2e. Real browser Playwright can provide focused UI proof under browser-verification rules.

Independent completion review and security review required: new admin endpoints/operator spending and credential destinations. Separate tester required: new probe-concurrency harness and cross-flow accounting/fallback behavior; assess exact test sufficiency and bounded execution after author preflight.

## Milestones

- [x] M1 — Provider catalog/environment/adapters and deterministic composition regressions (ROUTE-1).
- [x] M2 — Versioned routing/flow tariffs/admission/fallback and database invariants (ROUTE-2,5,6,10).
- [x] M3 — Bounded audited admin probes/activation/health and admin UI (ROUTE-3,4).
- [x] M4 — Learner model removal preserving controls, multilingual fixtures and setup/guides (ROUTE-7,8,9).
- [x] M5 — Author preflight, full verification, independent reviews/remediation, squash merge (all).

## Current progress

2026-10-26: M1–M4 implemented. Independent correctness and security review findings are remediated, including performance: the unchanged million-history/100-stream/300-admission workload passes84.319ms p95 against100ms. Previous failed runs remain in evidence. Final lint/typechecks pass16 tasks; full web1019, admin73 and contracts170 tests pass. All29 guide mappings validate.

Final full critical run uses owned memory-backed PostgreSQL because Docker disk exhaustion prevents disk-backed test startup; this does not replace the separate disk-backed performance proof. Standard backend build now passes with explicit6144MiB build-only compiler budget and type-only public boundaries; all26 emitted ESM files remain identical. Final critical run passes all11 flows:16 browser tests and255 backend tests/23 files, no skips or retries.

Final0107schema+0108authority migrations replace only this feature's never-deployed generated history. Normal database/history untouched, no production policy publication. Two authorized EvoLink live checks passed; three OpenRouter inference calls rejected a management-only key. No learner holds; measured known expenseUSD0.000300, three unknown expenses. OpenRouter requires a regular inference key before live compatibility can be claimed. Final artifact checks and feature commit c1a1435 passed; conflict-free squash integration onto main performed. Final critical/build results pass. No runtime changes or conflict resolution occurred during integration.

## Decisions and discoveries

D1: Existing schemas pin model identity; fallback requires authorized candidates rather than looking up current default at retry. Preserve old snapshot execution for admitted work.
D2: SDK/gateway internal retries must not multiply allowed attempts; unsupported processing controls prevent route activation.
D3: Key names present in ignored .env.local; examples only in commit. Unified loaders must read optional new keys quietly but activation requires credentials.
D4: No paid provider verification without separate explicit budget. Fixture success is not model/language quality proof.

## Validation links

[EVIDENCE.md](EVIDENCE.md), [REVIEW.md](REVIEW.md).

## Remaining work

Independent reviews, final aggregate critical and standard declaration build passed. Calibrated published per-flow tariffs, matching checks and live route/language verification remain explicit activation prerequisites. BL-005 history now identifies the superseding admin-owned routing decision; BL-011 remains pending and out of scope.

## Additional delivery decisions

D5: Runtime malformed answers are not proof of incompatible credentials/schema. Exact machine-code retirement/auth/schema failures are hard exclusions; learner-provoked generic403 or invalid output cannot permanently disable shared credentials. Unknown upstream probe recovery requires audited explicit upstream-stop attestation and never retries or erases expense.
D6: Existing job revision FKs retain an immutable same-ID reviewed configuration bridge; routing is the sole new-admission authority, history is preserved. Candidate receipts bind actual route/provider price without rewriting original snapshots.
D7: Known batches over20rows remain the explicitly deferred BL-011 repair. This feature preserves logical-batch routing/aggregate limits and does not claim individualchunk accounting or fix that backlog task.
D8: Administrative probe primitive registered operation-bound only; default Studio deliberately lacks operator-spend authority. Browser fixtures are gated by dedicated loopback admin E2E DB, synthetic key and nonproduction environment.

D9: User explicitly authorized real provider/model verification. Provider adapter worker owns at most eight synthetic requests capped at USD 0.08 total; root retains USD 0.02. No automatic paid retries. Native language quality remains a separate claim requiring evidence.
D10: Reviewed provider prices may include an exact per-request minimum, independent of learner tariffs. Operator admission and expense honor that floor; unknown usage remains unknown. This prevents understated EvoLink probe and production costs.

2026-10-26 final performance remediation: same-actor duplicate source-owner queries removed while shared-owner checks remain; ordered capacity lock/markers combined into one materialized SQL statement. Six real PostgreSQL authority/concurrency tests and two lock units pass; security review confirms preserved authority. Independent full workload now passes84.319ms p95, all300admissions/100streams/1Mhistory, source frozen. Final aggregate critical/static/build checks and local squash integration passed.

## Completion

Complete: acceptance, independent correctness/security review, final critical execution, performance, static checks, builds and documentation verified. Feature commit c1a1435 retained; squash integration onto main is conflict-free. No push or branch deletion. Normal database migrations/configuration publication remain explicit operational activation steps, with OpenRouter generation-key and EvoLink processing prerequisites recorded in EVIDENCE.md.
