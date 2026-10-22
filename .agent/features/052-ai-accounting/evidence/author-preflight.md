# Author preflight

Feature052, base main d441863, branch feature/ai-accounting. AC9 performance now passes. Independent completion/security review and development
cutover remain explicitly pending. No merge is authorized by a passing partial
check.

## Acceptance map

| ID | Implementation | Valid supporting evidence |
| --- | --- | --- |
| AC1 | contracts credit amount parser; ai-credits domain rates/action arithmetic; immutable price/policy schema and SQL | Pricing/parser tests; action15; records9; backend/web/admin types and builds |
| AC2 | generic action participant; quote admission; preference budget; accounted model gate and all legacy adapters | action15, legacy66, strict admission28unit+5PG, composed fixture browser |
| AC3 | per-attempt expenses/outcome settlement; durable Stop marker; authority SQL | action15 measured partial Stop; wallet31; restricted dictionary role3 and speechrole2 |
| AC4 | capability policies + interview action accounting; UTC counter; operator budgets | policy/interview unit/PG; final operator and authority cases |
| AC5 | wallet/grant/capacity projections; lock-free published prices; private maintenance/report pools | capacity14; wallet31; unchanged million history/no history SELECT capture; final calibrated latency passed (AC9 artifact recorded) |
| AC6 | durable conversations; turn buffer100ms/4KiB; private progress transaction; UI usage/Continue | conversation-store37 including Stop under unrelated capacity lock; action15; learner accounting2 E2E, frontend26; browser screenshots |
| AC7 | accounting records/routes/report worker; provider rates; admin accounting screen | records/speech58 PG; admin accounting E2E1; <=60s freshness; actual restrictedpurge |
| AC8 | Redis before heavy admission; action budgets; source/lease/authority/worker role guards | capability/authority/capacity tests; restrictedrole denied mutations; strict default fence; finalsecurity review pending |
| AC9 | opt-in real Hono+Redis+PG+SSE fixture and independent tester review | Final source-stable fixture300/300, p95 93.280ms under100ms; see accounting-load-staged-final.json |
| AC10 | ADR0045, operations/architecture,28 mapped guides,9 diagrams | doc/mapping checks, diagram render2 and hashes; independent review, fresh development cutover and merge pending |

## Scope and evidence validity

No application source imports across apps. Contracts expose decimal credit
strings; internal arithmetic uses bigint milli-credits. Provider SDKs remain
in infrastructure. No production dependencies, Kafka, ingestion, service host,
Bifrost, checkout, automated pricing or invoice import were added.

Migration history through0099 is append-only. Generated Drizzle metadata was
created by the project generator. Deployment classification remains contract;
normal production release gate intentionally rejects it. Old/new API binaries
must not overlap against the new database. Genuine old-ledger/active-work
forward-migration rejection passed3 cases with unchanged values/states.

Customer/provider tariffs and operator limits require explicit admin calibration;
synthetic test rates are confined to guarded deterministic fixtures. Production
pack economics were not invented. Free interview policy still obeys rate,
execution, account/day quota and shared operator-dollar limits.

Previous final builds remain valid for web/admin runtime: later frontend changes
are deterministic fixture/E2E locator changes only. Backend final build refreshed after private progress, strict composition and
capacity-lock changes; final build passed. Shared contracts/database sources have not
changed since their final successful consumer checks.

The original database suites are reused only where their paths are unchanged or
subsequent affected proofs cover the final changes. Latest action15 reran after
the private progress change, and conversation37 exercises live source/lease/Stop
and account deletion/concurrency fences. Financial/speech final58 include actual
restricted roles through0099. Pure formatting does not change these behaviors.

The added card browser proof passed under strict accounted fixtures. Its batch
companion exposes an unchanged baseline320px/200% layout failure; no production
CSS alteration or removed assertion hides it. Focused desktop accounting proof
is separate and does not establish that baseline narrow layout works.

## Documentation and review boundary

No matching accounting backlog item exists in docs/backlog/INDEX.md; no unrelated
backlog status is changed. All28 existing/current user-flow mappings pass. Changed
source fingerprints require reviewed diagram freshness, not an implicit topology
change. Source manifest will identify tracked and untracked review files by
path/content SHA256 before independent review; credentials/ignored envs excluded.

Required complementary reviews: independent completion review including acceptance
and test validity, plus security review for billing, personal data, SQL, role
boundaries and the new unlocked preflight/Stop paths. The independent performance
tester reviewed the harness and the final run records measured evidence. No author
self-review substitutes for the pending final remediation verdicts.

## Final lock-order and preprocessing remediation (2026-10-22)

- Claim/Stop source and turn locks now follow one order; compact capacity
  checks precede candidate authorization, and unusable candidates end the
  transaction so their locks are not retained while considering another actor.
- Action-accounted queued Stop reserves operator settlement locks before the
  capacity projection update. PostgreSQL race suites passed 55/55.
- Conversation POST preparation uses dedicated 30/min, one-per-learner and
  ten-global limits with 300-second Redis lease expiry. Unit route/service tests
  passed 9/9; two-client Redis integration passed 6/6.
- Final AC9 artifact is `accounting-load-claim-order-final.json`, run
  `ae53ad48-d711-47ab-905e-accc509111bf`: 300/300 loaded admissions, p95
  94.457ms, no failures, source unchanged. The 100ms loaded p95 threshold passes.
- Final independent completion/security verdict, current bundle, browser rerun,
  remaining feature-flow gates, preserved-data development cutover and Git
  integration are still required.
