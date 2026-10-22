# Accounting records and speech author evidence

Date: 2026-10-22. Scope: Feature052 financial records/reporting/provider tariffs and speech provider-cost integration. Overall feature completion and independent/security review remain with the coordinator.

## Implemented invariants

- Manual USD payment/refund/provider-deposit/balance/bill records use exact arithmetic, validated contracts, owner-only administrative writes and stable idempotency identities. Payment issuance and explicit available-only purchase-lot revocation are atomic with the financial record. Reserved/consumed credits cannot be clawed back.
- Provider rates are independently reviewed, versioned, effective-dated and pinned at admission. Execution snapshots retain numerical provenance, without copying administrator identity or free-text review metadata. Admin rate listings preserve the original review evidence. No production USD prices or spending limits were invented.
- Reports serve durable bounded range snapshots; requests do not aggregate history. Background refresh uses durable dirty versions, fenced leases, bounded scheduling and explicit pending HTTP 503 responses. Unchanged ranges renew without rescanning history. Changed selected ranges still require aggregation; this is not a claim of history-independent refresh performance.
- Anonymous purchase consumption/removal/value facts are captured before private-wallet deletion. Checked purge definers redact financial owner/actor references, retain numerical provider costs and global operator expenditure, and erase private daily owner scopes. The actual restricted role cannot read payment/report JSON.
- New speech clips pin numerical USD tariffs and reserve the shared operator allowance, including free clips. Claim acknowledges a provider attempt before dispatch. Ready synthesis records estimated character-based cost independently of customer publication success. Known unsubmitted work records zero; ambiguous execution records unknown expense with conservative operator expenditure. Existing success-only customer charging, joins, cache and publication/deadline semantics are retained.
- Speech admission queries compact daily quotas instead of history sums/counts. Existing active-capacity queries have partial indexes. Worker quota cleanup is bounded to 1,000 old rows per tick. Account purge cancels undispatched queued speech and immediately scrubs its pending text; ready audio and already dispatched shared recovery are preserved.

## PostgreSQL execution

Target: disposable local PostgreSQL localhost:55481, database languon_auth_accounting_test. The private environment file was sourced without printing credentials. All suites ran sequentially under exclusive ownership of this target; no other databases were reset. Tests apply forward migrations from a clean schema.

Commands, run from the repository root with the private test environment loaded:

```sh
pnpm --filter @languon/backend exec vitest run tests/integration/modules/speech/speech-accounting.test.ts --hookTimeout=120000 --testTimeout=30000 --bail=1
pnpm --filter @languon/backend exec vitest run tests/integration/database/ai-accounting.test.ts --hookTimeout=120000 --testTimeout=30000 --bail=1
pnpm --filter @languon/backend exec vitest run tests/integration/modules/speech/shared-speech-store.test.ts --hookTimeout=120000 --testTimeout=30000 --bail=1
pnpm --filter @languon/backend exec vitest run tests/integration/modules/speech/shared-speech-sources.test.ts --hookTimeout=120000 --testTimeout=30000 --bail=1
pnpm --filter @languon/backend exec vitest run tests/integration/modules/speech/speech-worker-role.test.ts --hookTimeout=120000 --testTimeout=30000 --bail=1
```

| Scope                                                                   | Result       | Duration |
| ----------------------------------------------------------------------- | ------------ | -------- |
| New speech accounting                                                   | 7/7 passed   | 10.43s   |
| Financial accounting, including actual deployed restricted purge grants | 9/9 passed   | 26.10s   |
| Existing shared speech store                                            | 33/33 passed | 49.12s   |
| Existing speech source authority                                        | 7/7 passed   | 4.03s    |
| Actual restricted speech worker role                                    | 2/2 passed   | 5.18s    |

Total: 58 passing PostgreSQL cases. Financial/purge and existing speech final runs include migration 0099. The seven speech accounting cases passed on 0098; 0099 changes only deferred-validator execution privileges, and its actual restricted-role behavior is covered by the final financial run.

The additional speech worker role cases provision the exact dictionary-worker deployment SQL and connect with startup `options=-c role=<random NOLOGIN role>` on every pooled connection. They assert `current_user`, execute the real worker for free synthesis success and paid technical failure, delete a seeded expired quota row through actual bounded maintenance, and verify customer holds, provider facts, operator terminal state and publication/failure metadata. The coordinator added the required quota DELETE grant; no hidden test grants or production-code bypass are used.

The financial role case provisions a random role through the exact deployment SQL, exercises it with a separate connection, denies payment/report JSON reads, purges active and queued speech plus wallet/private scopes, retains unknown/known numerical costs, verifies non-reset global expenditure, and cleans up the role/connection. No hidden grants are added.

Remediation during verification:

- Deferred constraint failures surface as raw PostgreSQL errors at commit; the old-worker rejection assertion now accepts that error shape.
- The speech deferred authority validator initially lacked numerical-table privileges under the actual purge role. Forward migration 0099 makes this fixed-path, qualified-table trigger SECURITY DEFINER; no additional table access was granted to the purge role. The complete financial suite then passed.
- Existing speech fixtures now represent their original 1,000-credit balance as 1,000,000 milli-credits and parse quote amounts exactly; legitimate balance/concurrency assertions were preserved.

Final migration SHA256:

```text
0097_accounting_speech_provider_costs.sql 695358b78fc7666b50d4e913fbca5bbaf1658d432eb7f1cf7b500199b036e772
0098_accounting_speech_guards.sql 40e3ef57bd9e8e40c35cca66c707c62216986890bd1ff24f48e5e8d217da0acc
0099_accounting_speech_authority_privileges.sql 882f7a59908a65308980d218bd103e201bb4ab227bdcd338aec774889f7b08cc
```

## Other author checks

- Full backend `tsc --noEmit --pretty false` passed after the new speech tests and privacy changes.
    - 26 focused existing/new speech unit cases and 17 accounting unit/route/worker cases passed.
- Scoped ESLint and `git diff --check` passed.

## Deployment boundary for independent review

New API admission always writes accountingVersion 1, and the database rejects an old worker dispatching such a row without the provider accounting acknowledgement. The schema retains default 0 for historical-row compatibility. A fully old admission binary could still create version 0 rows if deliberately attached to the new database. The approved fresh-development cutover explicitly stops all old API/workers and uses a new database; old binaries retain their old database configuration. Overlapping/blue-green deployment against the new database is unsupported and rejected by the release contract. The coordinator chose to preserve this boundary for independent review rather than add an unverified late migration after passing coverage.

## Security remediation verification (0100–0105)

The PostgreSQL results above describe the initial implementation. Security remediation replaces caller-set purge authority and free-form worker financial writes with checked SQL entry points; the following results supersede initial evidence for those seams.

- `pnpm --filter @languon/backend exec tsc --noEmit`: passed after remediation (real exit 0; `/private/tmp/accounting-security-typecheck.log`). Focused ESLint and formatting checks passed for affected financial, purge, speech and fixture files.
- `ai-accounting.test.ts`: **9/9 passed**, real exit 0, 12.57s, migrations through 0102, same dedicated disposable PostgreSQL target and exclusive sequential execution as above. Log `/private/tmp/accounting-security-financial.log`.
- The actual restricted purge role cannot directly delete grants/actions even after spoofing all owner/worker/fence GUCs, cannot update user lifecycle or deletion date, cannot revive a cancelled request, and cannot use absent, wrong-worker, wrong, or stale fencing identities. A valid next-fence reclaimed deletion atomically erases wallet identities while retaining anonymous purchase attribution, provider costs and global operator totals. Payment/report JSON remains unreadable.
- Legitimate API cancellation/rescheduling remains supported: `drizzle-account-deletion-store.ts` updates the cancelled request to `pending` with a fresh schedule. The claim trigger only constrains transitions into `running`; the restricted purge role cannot rewrite the deletion calendar or reactivate a user.
- Final `speech-worker-role.test.ts`: **2/2 passed**, real exit 0, 3.69s, through 0105. Both free synthesis success and paid technical failure use only deployed worker grants. Live wrong-token, expired matching-token, missing token and retired-helper dispatch fail; raw marker backdating and expense preemption fail; canonical replay succeeds and conflicting outcome replay fails. Dispatch markers and numerical facts come from checked SQL. Log `/private/tmp/accounting-security-speech-role-final.log`.
- Final `ai-accounting.test.ts`: **9/9 passed**, real exit 0, 16.82s, through 0105. The purge role cannot execute generic text/action/speech settlement, arbitrary expense recording or report dirty helpers; scoped recovery rejects wrong claims and non-interview actions. Valid fenced speech/financial purge preserves anonymous facts. Log `/private/tmp/accounting-security-financial-final.log`.
- Full dedicated-role account purge coordinator: **1/1 selected case passed**, real exit 0, 2.93s. Its real current lease drives checked inspection, erasure and completion. Only missing opaque reservation lifecycle columns and the new preparation action UUID received SELECT grants; private payload grants were not expanded. Log `/private/tmp/accounting-security-purge-coordinator.log`.
- Final affected speech suites through 0105: accounting **7/7** (8.04s), existing shared store **33/33** (41.08s), source authority **7/7** (3.49s), all real exit 0. Logs `/private/tmp/accounting-security-speech-accounting.log`, `/private/tmp/accounting-security-shared-speech.log`, `/private/tmp/accounting-security-speech-sources.log`.
- `AccountPurgeService` focused unit cases: **4/4 passed** after explicit expected worker identity was passed into claim-scoped inspection. Historical timestamps in actual lease fixtures were replaced by current timestamps to exercise PostgreSQL clock checks honestly; no lease validation was relaxed.

Provider observations now bind immutable text attempts or dispatched speech jobs, derive provider/model/rate/amount/time/reference in SQL, reject arbitrary/null generic expense facts, and retain only the narrowly permitted anonymous attempt unlink during checked purge. Manual unallocated financial adjustments remain separate administrative bill records.

The purge financial role no longer receives generic financial EXECUTE or raw ledger mutation privileges. Its interview recovery helper accepts only owner/worker/fence/operation, derives the typed terminal outcome, preserves previously observed measurements and records unknown pending calls without caller-supplied usage, rates, charges or outcomes. Fenced speech purge performs customer release and private association cleanup internally. Existing authenticated-user deletion behavior and preexisting unrelated domain grants are outside this narrowed financial authority change; this evidence does not claim that every historical purge-role privilege has been redesigned.

## Scheduling and final callsite verification (0106)

All checks used the same disposable target, sequential exclusive execution, real process exit 0:

| Selected scope                                               | Result | Duration |
| ------------------------------------------------------------ | ------ | -------- |
| Sentence busy inspection and restricted purge                | 2/2    | 3.39s    |
| Texts busy inspection and restricted purge                   | 2/2    | 12.88s   |
| Conversation full account purge with independent copies      | 1/1    | 7.55s    |
| New scheduled-speech cancellation and in-flight drain        | 1/1    | 2.48s    |
| Actual purge role scheduled-helper denial and fenced erasure | 1/1    | 3.20s    |

The new scheduled-speech case rejects an active unscheduled owner, cancels undispatched queued speech with zero unused operator cost, and preserves dispatched payer/reservation/operator authorization without inventing an early unknown expense. A deterministic in-flight completion then records its known character-based USD cost and releases the already-inactive payer's customer hold with zero charge. The API scheduling helper is PUBLIC-revoked and unavailable to purge/worker roles; actual purge credentials receive SQLSTATE 42501. Daily admission quotas remain intact at scheduling. The due purge still uses the expected worker and fence.

Success eligibility reads current payer status at settlement. A scheduling transaction overlapping settlement can linearize at that eligibility check; this evidence does not claim an additional absolute commit-order billing guarantee.

The existing busy assertions remain intact: their fixtures now use actual scheduled deletion and claimed worker identities rather than unclaimed inspection. Relevant logs are `/private/tmp/accounting-security-sentence-purge.log`, `/private/tmp/accounting-security-texts-purge.log`, `/private/tmp/accounting-security-conversation-purge.log`, `/private/tmp/accounting-security-scheduled-speech.log`, and `/private/tmp/accounting-security-scheduled-purge-permissions.log`.

Final scoped ESLint and `git diff --check` passed after these changes. The coordinator owns final combined compilation/build, independent review, privacy-risk disposition and feature completion; no additional compiler or database process is running from this task.
