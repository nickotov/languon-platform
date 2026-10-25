# Improvement: AI execution deadlines and mandatory regressions

Status: Complete
Created: 2026-10-25
Updated: 2026-10-25

## Routing decision

The user requests repair of recurring sentence-check timeouts and development
instruction improvements. This is a bounded internal execution/tooling improvement:
no new product journey, public contract, schema, charging policy, production
dependency or deployment change. Reuse the existing critical runner and CI gate.
Escalate before crossing a feature boundary. Preserve unrelated uncommitted work.

## Context and scope

The reported job failed in approximately 20.5 seconds; the production sentence
worker hard-coded a 20-second deadline while text generation allows 180 seconds.
Existing unit tests override worker settings; browser journeys inject deterministic
providers. Production provider/PG tests were not mandatory in CI and can skip
outside explicitly enabled disposable infrastructure.

In scope: use the existing 180-second bounded deadline, retain heartbeat/fencing,
extract the actual production runtime policy for faithful regression tests, add
its tests and existing provider/PG suites to the existing critical runner, and
keep one canonical AI change-impact matrix linked from root/backend instructions.
No paid provider calls, normal database resets or automatic job retries.
BL-011 multi-chunk accounting repair remains explicitly deferred by the user.
Rollback: revert this scoped runtime factory/composition and critical-stage changes;
no persisted data changes require rollback.

## Acceptance criteria

- AC1: Production sentence checking can finish after 20 seconds while remaining
  bounded to 180 seconds, with heartbeat renewal, cancellation and no late publish.
- AC2: Existing critical CI command runs real backend execution regressions on
  owned disposable infrastructure and rejects missing, skipped or flaky evidence.
- AC3: Agent instructions route AI changes to a concise, seam-based matrix with
  checkable evidence obligations and clear fake/live evidence limits.

## Plan and change-impact matrix

| Seam                          | Required evidence                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production worker runtime     | Five real-default runtime tests: slow success, hard timeout, Stop, lost lease, shutdown. Actual provider/SDK and synthetic fake HTTP where feasible. |
| Admission/provider/settlement | Existing full real-PG sentence, selection and dictionary-admission suites, mandatory backend stage.                                                  |
| Shared worker/config gate     | Complete critical gate, no skips or retries; focused tooling safety tests.                                                                           |
| Agent instructions            | Canonical matrix, root/backend pointers, documentation formatting and independent review.                                                            |

## Verification

- `pnpm --filter @languon/backend test tests/unit/infrastructure/worker/sentence-worker-runtime.test.ts`: 5 passed (real runtime defaults, real SDK, strict fake external HTTP).
- `pnpm --filter @languon/backend test tests/unit/modules/learning/application/sentence-worker-service.test.ts`: 15 passed.
- `pnpm --filter @languon/backend typecheck`: passed; focused runtime/test and runner ESLint passed.
- `node --test scripts/critical-flows/registry.test.mjs`: 13 passed with local-port permission. Independent tester's sandbox-only attempt had one EPERM port-binding failure; report-validation tests passed there, and the authorized complete rerun passed all 13.
- Prettier and `git diff --check`: passed for scoped changes.
- `pnpm critical-flows:check`: 10 entries valid; `--list` shows backend stage.
- `pnpm docs:user-flows:check`: 16 checker tests and 28 guide mappings passed.
- `pnpm user-flow:e2e -- check sentence-practice-backend`: synchronized.
- Full `pnpm test:e2e:critical`: passed all 10 entries, 14 browser checks and 50 backend tests, no skips/retries. Evidence `test-results/critical-flows/8501373c-a334-418f-aef6-f607214a0db9/`.

No UI markup changes. Existing browser sentence journey passed, proving unchanged
interaction with deterministic internal provider; real SDK timing and PG execution
are separate retained coverage. Existing guide outcomes, commands and error codes
remain unchanged; operational gate instructions are updated in the canonical
operations document. No new guide or scenario is introduced.

## Outcome and evidence

Production command now selects a factory with the real 180-second policy, keeping
the same slots, leases, heartbeat and attempts. Existing configurable composition
remains available for established test fixtures. Critical CI automatically includes
the new backend stage with a strict complete-report check. Root and backend
instructions point to one seam-based matrix, rather than duplicate test lists.

Independent initial review: no material runtime/gate defects; one low finding
F-01 identified a stale README command description. Fixed with a focused one-line
change, then remediation review confirmed no unresolved findings. Separate tester
independently parsed actual backend JSON: exact four suites (28+15+2+5), all 50
passed, with retry=0, repeat=0 and expected-failure=false metadata. Test evidence
covers these retained suites, not every AI capability or the deferred BL-011 work.

Instructions were reviewed for actionable triggers, authority and evidence claims;
no isolated before/after workflow pilot or token-saving claim is made.

Base `1583902`, final scoped content hash
`8e571ca7af6866c2a9e3eb48b14282f9a48338c11710679e18d1f0055ce47420`.
Hash covers sorted path+NUL+bytes+NUL for root/backend AGENTS, README, canonical
operations document, sentence runtime/composition/command/test, critical registry,
registry tests/runtime/retry reporter, runner and checker. Tested code/test/config
remained unchanged after the full gate; only prose/evidence metadata changed.
Final diff whitespace check passed; unrelated dirty work was preserved.

Reloaded normal `pnpm dev:all` through its existing Orca terminal. New worker
PID 78808 reported ready; backend `/livez` returned status `ok`. The previous
worker reported inability to confirm lease release during SIGINT; no job was
manually reset or replayed, and existing recovery/fencing remains authoritative.
The critical run cleaned up all its owned containers and restored the generated
web declaration file. Normal application data was not reset.

Local deadline correlation establishes a premature
application cutoff; it does not prove that the live provider would complete
within the longer deadline. No live provider success claim is authorized.

## Remaining risks

Provider latency/outages still possible within the bounded deadline. Long calls
occupy existing execution slots, without increasing concurrency or retry limits.
