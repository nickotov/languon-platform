# Evidence: Admin-owned text AI routing

Base: `61a4616`; branch `feature/admin-text-ai-routing`. Final aggregate verification passed. This record distinguishes implementation evidence from external activation prerequisites.

## Acceptance coverage

| Criteria    | Evidence                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ROUTE-1     | Production SDK fake-HTTP adapter regressions: 94 focused tests passed; full text-ai unit tree 161 tests/19 files passed. Fixed reviewed catalogs, endpoint/processing controls and unified environment are covered.                                                                                                                                      |
| ROUTE-2,5,6 | Disposable PostgreSQL routing, probe, worker-role, conversation accounting, minimum-cost and job-store suites cover pinned candidates/prices, actual dispatch receipts, no-charge failures, one safe fallback and emergency disable. Conversation accounting15/15, batch2/2 and card-authoring9/9 passed after replacing obsolete legacy-model fixtures. |
| ROUTE-3,4   | Probe authority12 PostgreSQL +5 admin HTTP checks passed; SDK→receipt→health observer2 passed. Actual admin browser covers12 synthetic flow checks, activation, responsive rendering, disable/restore and audited uncertain-probe recovery.                                                                                                              |
| ROUTE-7     | Model-neutral learner surfaces retain manual preference/budget controls. Full web138 files/1019 tests passed serially; full admin11 files/73 tests passed serially. Portrait semantic-validation/fallback/settlement71 tests passed. Public model identity redaction and conclusive-only fresh-runner fallback have focused backend coverage.            |
| ROUTE-8,9   | Extensible synthetic multilingual fixtures;41 setup/readiness tests passed. Doctor read-only PG parity:13 records,12 allowed/1 blocked; unknown fingerprint blocked.29 user-flow mappings validate; setup profile docs match. Final aggregate critical run passed below.                                                                                 |
| ROUTE-10    | Independent unchanged-workload benchmark passed84.319ms p95; details below. No learner-time provider checks or history scans.                                                                                                                                                                                                                            |

## Final commands and browser evidence

- `pnpm turbo run lint typecheck --filter=@languon/backend --filter=@languon/web --filter=@languon/admin`:16 tasks passed, including dependencies.
- `pnpm --filter @languon/web exec vitest run --maxWorkers=1`:138 files,1019 tests passed. The captured-passage mock now invokes the established admission `onAccepted` callback; assertions and product behavior were preserved. Earlier isolated Knowledge7 and admin refund1 timeout reruns passed; final serial suites remove the resource-concurrent ambiguity.
- `pnpm test:critical-tooling`:66 passed, no skips. Initial restricted-sandbox socket errors were environmental; authorized loopback rerun passed.
- Contracts:18 files/170 tests passed. Admin:11 files/73 tests passed.
- `pnpm docs:user-flows:check`:29 guides and E2E mappings passed. `pnpm check:setup-docs`:matches.
- `pnpm styles:check`:passed; frontend architecture9 tests passed; all affected non-generated files pass Prettier. Credential-shaped scan and exact comparison against all four configured provider credentials found no secret in the outgoing patch.
- `pnpm db:check`:passed. `node scripts/migration-classification.mjs`:migrate.
- Web/admin production builds passed. Standard `pnpm --filter @languon/backend build` now passes with the explicit build-only6144MiB compiler heap ceiling, including DTS124.501sec and migration copying. Earlier default-heap OOMs remain recorded; production runtime memory is unchanged. Typed public boundaries reduced the worker declaration from999.69KB to11.50KB; all26 emitted ESM files remain byte-identical. See [build verification](evidence/build-verification.json). Build hosts need memory headroom for compiler overhead/concurrent workspaces; no test or declaration check was dropped.
- Final full critical command: `PATH="/tmp/languon-critical-docker-bin:$PATH" pnpm test:e2e:critical`, evidence `test-results/critical-flows/b8c7d2cb-58b7-4c30-b238-0165ee291854`, log `/tmp/languon-routing-critical-complete-tmpfs.log`. **Passed: all11 flows,16 browser tests and255 backend tests across23 files, no skips or retries.** [Retained summary](evidence/critical-flow-summary.json). Temporary wrapper adds only a1GB PostgreSQL data tmpfs to this run's unpredictable owned container names; application/tests/ports/images/assertions are unchanged. This is correctness/browser evidence, not disk-durability or performance evidence.

Earlier focused browser evidence remains valid:

- Admin routing: `1c05593d-5606-4da5-9c30-fa0c62490649`.
- Empty setup→paid generation→durable save: `754d66c2-faf1-45ab-b07c-81431e44f524`.
- Admin refresh3 cases: `8d54eaac-1f37-4b34-975b-7f91621ba19b`.
- Dictionary generation/reload/review/save: `fe944cd1-abd0-40ec-86cf-981e3f1a9199`.
- Remaining browser suites passed in `a9b2cdd8-89be-47b1-aba7-fb241f9cdd40`; that aggregate backend run had244 passes/2 obsolete batch-fixture failures, subsequently fixed and2/2 passed. It is not represented as a passing full run.

## Independent performance proof

[Final raw evidence](evidence/performance-final.json), run328125b4: loaded p95 **84.319ms**, p50 **50.093ms**, all300 admissions successful,100 active streams/zero failures,1million immutable history rows,52 queries/admission, baseline phase89.438ms. Runtime source was frozen throughout the representative local disk-backed test. Subsequent erased type annotations are checked against emitted ESM hashes; fixture and documentation edits do not change the measured runtime.

The unchanged100ms target was not waived. Preserve failed runs: [before batching](evidence/performance-before-batching.json)110.710ms, [after batching](evidence/performance-after-batching.json)129.878ms, [after preparation moved before fence](evidence/performance-after-prefence.json)124.568ms. Isolated base61a4616 also [failed105.400ms](evidence/performance-baseline-61a4616.json). Final improvement combines bounded candidate queries, transaction-only policy reads, read-only preparation with under-fence revision/health/price validation, same-actor source authority reuse and ordered capacity-lock markers. Independent correctness and security reviews accepted the final delta.

Probe lookup index proof used25000 history rows, no Sort/SeqScan: flow0.143ms/provider-auth0.203ms. These are local measurements, not provider latency guarantees.

## Live providers and activation prerequisites

The user explicitly authorized real provider/model checks; synthetic inputs only, maxUSD0.01/check andUSD0.10 combined, no automatic paid retries. [Safe live evidence](evidence/live-provider-probes-2026-10-25.json):5 generation requests, no learner holds. EvoLink Luna quick and actual card-authoring prompt/schema checks passed; measured calculated expenseUSD0.000300. Three OpenRouter routes rejectedHTTP401; those expenses are unknown, not zero. No live multilingual quality claim is made.

[Credential-type diagnostic](evidence/openrouter-auth-type-2026-10-26.json): official non-generation GET `/api/v1/key` returned200 and `is_management_key:true`, not expired. The supplied OpenRouter credential is a management key, unsuitable for inference. Operator was asked to replace the ignored environment value with a regular generation key; no secret is printed or stored. OpenRouter live compatibility remains unverified pending replacement. Provider availability is activation-gated rather than assumed from account balance.

EvoLink learner dispatch remains processing-ineligible until its processing/privacy requirements are approved; synthetic checks are permitted. Actual calibrated per-flow tariffs, provider rates and matching fresh checks must be published explicitly in admin. No normal-database reset, feature migration or production policy publication occurred. Existing balances/history remain intact; only never-deployed feature migrations were consolidated into0107schema+0108authority.

## Boundaries and retained limitations

- CR-054-10: credential/adapter/flow-contract changes after admission fail closed before HTTP/no learner charge. Perform matching admin checks and start an explicit new action. Automatic pre-HTTP receipt reissue is not implemented; superficial fallback would break provider/receipt authority.
- BL-011 physical accounting for batches over20 rows remains explicitly deferred. This feature does not claim that repair.
- Runtime health accepts only trusted bound dispatch evidence; generic400/403, invalid learner-influenced output, Stop and local timeout cannot disable shared routes. Unknown expense remains unknown.
- Docker disk exhaustion blocked normal disposable PostgreSQL startup in final run74791c00. No unowned prune/data deletion was performed. One provably owned orphan volume was removed, amount freed unknown; final correctness run uses tmpfs. Card-authoring9/9 proof also used tmpfs. Existing disk-backed benchmark evidence is separate.
- Fixed reviewed SDK origins remain the egress boundary; there is no independent network allowlist. Credential rotation requires draining old workers. No Bifrost/Kafka/service extraction, speech model changes or sidebar redesign.

## Review

Independent correctness/test review has no remaining material findings; performance finding resolved by final proof. Independent security review reports no material findings. Final aggregate critical and standard declaration-build gates passed; see [REVIEW.md](REVIEW.md).

## Author preflight and integration

All acceptance criteria implemented; checks and independent review gates passed. No unresolved material findings. Final diff/format checks and provider-secret scans passed. Generated Next environment references restored to the pre-run version. Feature commit `c1a1435` is preserved; conflict-free squash integration onto main contains the same verified runtime, with completion-record changes only. No conflict-resolution retest is required; no push, branch deletion, normal-data reset or provider policy publication is authorized by this evidence.

## Commit scope audit

Automatic approval review initially rejected the305-file/80822-added-line commit because the broad scope might include unrelated/generated work. The staged audit attributes36790 lines to the two required Drizzle schema snapshots and24991 lines to retained raw successful/failed benchmark evidence:61781 lines,76.4% of additions. Remaining additions are9096 runtime/contracts/migration lines,8838 tests/fixtures and1107 guides/configuration/workflow lines. No dependency, cache, build output, normal database data or credential file is staged. The worker deployment grant change supplies narrowly scoped routing reads and checked dispatch/health functions; root command changes point to the revised routing journey. BL-005 changes preserve history and identify its approved superseding decision. Independent bounded scope review inspected the staged boundary and found no unrelated or accidental work; the same authorized local commit is justified. No prior migration was rewritten; no compression, alternate Git path or approval bypass.
