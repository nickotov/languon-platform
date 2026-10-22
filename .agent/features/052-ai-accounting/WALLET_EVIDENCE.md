# Wallet and operational capacity implementation evidence

Status: wallet, operational capacity and action authority slices verified on disposable PostgreSQL; final composed migration/review remain root-owned.

## Wallet scope

- Added trigger-maintained per-grant remaining/reserved/consumed/removed projections and per-owner reserved/consumed totals. Immutable ledger retained. Admission and summaries no longer aggregate ledger/allocation history.
- Allocation insert performs conditional debit against projection; settlement/release visits only its own allocations, including expired lots. Direct projection edits and unauthorized ledger deletion rejected. Purge removes projections with ledger.
- Added purchase-specific available-value revocation with source idempotency; held/consumed value and other grants cannot be revoked accidentally.
- Pinned immutable capability funding at first reservation; operator funding reserves zero and remains pinned across retries.

## Checks

Base: d441863f55a8a53e9d712bf98f6805049a45ff4b with uncommitted feature changes.

W1: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/ai-credits/domain/ai-credit.test.ts` passed 9/9.

W2: With private test env sourced (never printed), `pnpm --filter @languon/backend exec vitest run tests/integration/database/ai-credit-participant.test.ts --hookTimeout 120000 --testTimeout 30000` passed 28/28 in 185.82s. Real disposable PostgreSQL: loopback port55481 database languon_auth_accounting_test. Covers existing typed retries/unlimited/expiry/authorization/concurrency/purge guards and new projection settlement/replay/rollback, targeted purchase refund (held and consumed value protected), immutable projection enforcement and pinned operator policy.

The initial sandboxed attempt failed before database work with loopback EPERM. An escalated rerun with default10s hooks was stopped after migration hooks overlapped during heavy machine load; final successful run used120s hooks to retain sequential schema resets. No tests or assertions were weakened.

W3: Focused ESLint on owned wallet/capacity source and two integration test files passed. `git diff --check` passed. Root coordinates one final backend typecheck; duplicate per-agent compiler runs were stopped centrally.

W2 superseded by W4 below, which includes action purge, technical failure and report dirty-hook integration.

## Capacity scope

Five compact operational tables: active jobs, queue totals, normalized provider usage, active totals, settled minute buckets. Exact rolling24h admission combines indexed buckets and the partial boundary minute. Source triggers include all current job/call kinds, archival de-duplication and new action attempts; legacy SQL overlap guards also query projections. No request-time cleanup. Maintenance entry cleanupTextAiCapacity batches expired projection removal while retaining audit archives. New integration case covers strict boundary, rollback, source timestamp updates, cleanup and projection tamper rejection. Root integrates source SQL and generated schema before execution.

## Subsequent authorized outcome and review remediation

Added `settleFailedAttempt` with explicit `technical_failure` provenance, zero customer charge, full hold release and no fabricated measured usage. Enum addition must commit before the generated reservation-state constraint and new guard functions. Domain suite now passes12/12; two additional PostgreSQL cases (before/after dispatch) await the final migration.

Independent invariant reviewer identified action-attempt capacity rows being labelled conversation despite portrait ownership. Corrected the source to derive immutable parent capability, added a settled portrait overlap/purge regression, and supplied `capacity-remediation.sql` as forward overrides and repair of already-misclassified numerical rows. The same override fixes multiple zero-usage records sharing empty counter rows and handles archive identity updates. Separate dirty-report trigger runs only on consumed/removal deltas, covering both legacy and action settlement without touching report locks during holds/releases.

Command routing note: the earlier `pnpm --filter @languon/backend test -- <path>` forwarded a literal `--` and selected the broad suite rather than the intended file. That run reported an unrelated contextual-tutor case failure and was not used as evidence. All scoped passing commands above use `pnpm --filter @languon/backend exec vitest run <path>` explicitly.


## Final focused integration checks (2026-10-22)

W4: Same private disposable environment and W2 command, with integrated migrations through0094, passed31/31 wallet integration cases in98.85s at19:26 UTC. Includes before/after-dispatch technical failure, consumed/removal-only dirty reports, projection invariants and action-aware purge.

W5: `pnpm --filter @languon/backend exec vitest run tests/integration/modules/text-ai/text-ai-capacity.test.ts tests/integration/database/action-authority.test.ts --hookTimeout 120000 --testTimeout 30000` passed24/24 (capacity14, authority10) in7.80s at19:34 UTC. Vitest fileParallelism:false serializes shared disposable schema resets. Latest composed0089 and0093 sources covered legacy/new-action capacity de-duplication, exact24h windows, cleanup, portrait classification, forged policy/funding/capability rejection, terminal source outcome, pending provider attempts, missing linked expenses, immutable trigger-authored proof, and settlement plus private feature erasure in one transaction.

Initial W5 attempt passed13/14 capacity cases but exposed PL/pgSQL shared trigger record-field planning (`OLD.action_id` on an action row). Fixed the source to extract branch-specific identity from JSON record values, recomposed the migration, and reran successfully. No production guard or assertion bypass used. A subsequent explicit NULL terminal measurement defense was supplied to root and recomposed after W5; final root migration suite covers that additional guard.

Action authority preserves only owner/job identity and terminal numeric state after private feature deletion. Caller DML cannot manufacture/delete proof; feature terminal/deletion triggers validate actual source and immutable charging-policy owner/capability/version. Effective unlimited entitlement is checked on admission; customer zero hold requires every effective tariff rate to be zero. Every settled provider attempt must carry one linked immutable expense.

## Additional bounded harness work

Authored `accounting-cutover.test.ts`: uses a byte-identical migration prefix through0088 and the genuine forward migration runner. Three pending PostgreSQL cases require the precise55000 cutover preflight cause for an existing7-unit grant (amount remains7) and queued/running free legacy portrait jobs with an empty credit ledger (job remains unchanged). No migration checks are copied into tests and no production triggers are disabled. Focused formatting/lint passed; execution awaits root's shared DB slot.

Updated performance harness fixture compatibility with current authority guards: one million valid immutable zero-amount policy-update ledger facts across the same100active owners replace impossible naked settled actions. Evidence now separately counts real settled baseline actions and explicitly excludes million-action/allocation/provider-history performance claims. All three operator cost limits and reviewed cache rate fixture values are populated. Focused formatting/lint passed; no load execution performed while other agents change source.
