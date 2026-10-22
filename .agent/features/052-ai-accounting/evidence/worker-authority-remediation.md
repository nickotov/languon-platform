# SEC-052-02 worker financial authority remediation

Status: owned generic financial authority and quota remediation verified, 11/11 through 0105; speech execution proof remains assigned to the records worker.

The API owns typed jobs, immutable capability policy, action/customer allocations
and operator action authorization. The execution role no longer has raw INSERT or
financial UPDATE rights for those records, usage attempts, provider expenses,
customer history or report versions. Raw legacy customer reservation mutations
are also revoked: the accepted contract cutover drains old work before selecting
the separate empty development database. The preserved old database needs its old
application and grants for rollback.

New checked seams live in
`apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql`:

- `languon_admit_text_provider_attempt` derives reviewed provider prices and all
  execution/customer affordability limits from the API-pinned typed feature.
  It requires the current live token or worker/fence against the actual typed job,
  checks database-clock deadlines, prevents dispatch replay and ambiguous answer
  retries, and records the actual execution job on the attempt. Child attempts
  remain independent of the parent action's global ordinal.
- `languon_settle_credit_action` calculates customer charges from stored eligible
  usage and pinned tariffs, rounds once, caps by the hold, closes the operator
  authorization and writes numerical customer history. Mandatory deferred typed
  terminal proof validates the requested outcome at commit. Preparation actions
  exclude invalid/failed child output from customer charges, even when the
  provider call was reported successful before structured-result validation.
- `languon_admit_speech_provider_attempt` uses the existing API-pinned queued
  speech job, reviewed character rate and existing operator authorization.

The generic participant invokes these checked functions. Provider observations,
speech final accounting and fenced purge helpers are owned by the records
remediation and invoked through exact function grants. Report dirty marking is
SECURITY DEFINER with fixed search path and PUBLIC execution revoked. Operator
admission additionally validates actual current published application limits;
caller-supplied larger daily limits cannot replace them.

`dictionary-worker-role.sql` grants only checked financial functions plus SELECT
and immutable-column row-lock permissions. It grants no preparation parent/child
INSERT or financial-pin mutation. `account-purge-worker-role.sql` grants fenced
purge/claim/completion helpers and no raw financial DELETE, report-version UPDATE
or user lifecycle UPDATE.

Verification so far: scoped ESLint and Prettier passed for owned participant,
schema and restricted-worker test changes. Expanded real-role tests cover positive
execution/settlement, direct financial/admission mutation denial, wrong-owner,
missing/stale/expired lease witnesses, provider-budget tampering, dispatch replay,
and expense provenance replay/forgery. Six cases passed through the immutable forward migration 0102 (SHA
72c8eba5b61d25539fc5147171225bcc1f098a8f7a703223391a18c78f50c521),
command `pnpm --filter @languon/backend exec vitest run tests/integration/database/dictionary-worker-accounting-role.test.ts --hookTimeout 120000 --testTimeout 30000`
with the private designated environment, actual exit 0, 3.74 seconds. Target:
localhost:55481 / languon_auth_accounting_test, isolated disposable PostgreSQL.
The first run at 0101 exposed a PL/pgSQL alias/row-variable collision; 0102 fixes
it without rewriting applied history. The final six-case run includes a large
exact budget with the cheapest tariff to prove arithmetic caps before bigint
narrowing, and exact SQLSTATE assertions for denial paths.

Subsequent test-only addition exercises the operational cohort cap directly;
it remains pending. Records verification found the remaining raw paid-speech
customer dispatch marker; the checked speech helper now performs that fixed
reservation mutation. This requires another append-only forward migration and
actual restricted speech-role verification. No overall security completion claim
is made.

## Verified follow-up through 0104

The same exact command passed **8/8** with actual exit 0 in 3.85 seconds
(session 74939). Forward migration 0104 SHA:
`6b115c9ae1bf62d9039c751e21d59f32199030ce0c5b12aa118415be6f7a5b3d`.
The restricted role was applied from its deployment script, including revocation
of direct report-dirty execution. Direct invocation fails with SQLSTATE 42501.

The added regressions prove that three full-output reservations exhaust the
owner's operational cohort allowance despite raised caller budgets and ample
USD authorization. Reporting usage with a year-2000 caller timestamp still
persists the actual current database time; settling one attempt cannot remove it
from the rolling daily allowance. A checked affordable-output denial rolls back
a nested savepoint before the caller publishes terminal failure and releases its
hold in the same outer transaction, avoiding PostgreSQL 25P02.

A final speech-specific refinement now requires a claimed speech job's exact live
lease token. The former UUID-only overload is replaced by a failing stub and is
not granted to the worker. Checked dispatch owns both provider and customer
reservation timestamps. Records owns the same-transaction claim reordering and
its actual restricted speech-role tests. This refinement requires append-only
0105 or later; its runtime verification is not established by the eight generic
cases above. Generic checked dispatch/settlement SQL is unchanged by this final
speech refinement.

## Final owned authority verification through 0105

**11/11 passed**, actual exit 0, 8.31 seconds, session 37354:

```sh
pnpm --filter @languon/backend exec vitest run \
  tests/integration/database/dictionary-worker-accounting-role.test.ts \
  tests/integration/database/speech-quota-worker-authority.test.ts \
  --no-file-parallelism --hookTimeout 120000 --testTimeout 30000
```

The environment selected the newly created, previously absent owned disposable
database `localhost:55481/languon_auth_worker_authority_052_20261022_test`.
The shared integration database was not reset or mutated. The tests reset only
their owned target and replayed checked-in migrations through 0105.
Migration SHA:
`2e616258a60d5169639a9f48a58f28f7cf0164d2a2a0027a4d6710b934a61eb5`.

The nine generic cases additionally prove three legitimate successful tutor
answer steps within one action, with a single 0.001-credit cumulative charge.
Successful tool steps are not retries. Conversation execution still has five
calls/two supporting calls, shared output/input/cost caps, no overlapping unknown
answer and at most one retry after failed answer attempts. Portrait and typed
legacy child limits remain separate.

The two quota cases prove that direct current-day INSERT, UPDATE and DELETE are
permission denied (42501). Checked cleanup has a database-owned seven-day cutoff,
rejects invalid/null/over-1000 batch sizes (23514), removes 1003 expired records in
bounded 1000/2/1 batches, and preserves both the exact retention-boundary day and
current-day counters unchanged. Worker maintenance invokes this checked helper;
API admission remains the writer of current counters. Account purge retains its
separate checked owner-removal seam.

Final scoped ESLint, Prettier and diff checks passed. Tested source SHA-256:

| Path | SHA-256 |
| --- | --- |
| `worker-financial-authority.sql` | `dca391f00cd4a0509a7db6c27c35099ddd411bc53a789eabff3fcf25212acf17` |
| `drizzle-action-accounting-participant.ts` | `b6afc1a67a36fad95e3b518ac084356ad7cfcad2cf5b404b3136f40fbf1c9bd9` |
| `infra/deploy/sql/dictionary-worker-role.sql` | `33d4092741f4efe22383a6d91355ce849e52b1995eb87207634d0ed5c8a16315` |
| `dictionary-worker-accounting-role.test.ts` | `d75dcca80cba03595f24753dfe79dd7cc14462675f222199f2b6f66cee1bb5bc` |
| `speech-quota-worker-authority.test.ts` | `d9cdf865ee32c2b77c4adf0318af9b39171cb0005bc6fc43cfead1f8aa2ed6db` |

Speech synthesis/lease positive and adversarial execution remain assigned to the
records worker's actual-role suite. This evidence does not replace that suite,
final completion/security review, browser evidence or the performance acceptance
run. No paid model/provider requests, production database changes or commits
were performed by this remediation owner.
