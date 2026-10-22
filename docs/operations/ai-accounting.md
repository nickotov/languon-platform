---
type: operations
title: AI accounting calibration and development cutover
source_paths:
    - apps/backend/src/modules/ai-credits
    - apps/backend/drizzle
    - infra/deploy/sql/dictionary-worker-role.sql
    - infra/deploy/sql/account-purge-worker-role.sql
---

# AI accounting calibration and development cutover

This release changes ledger storage from whole credits to milli-credits and
changes technical-failure charging. It is a development-only cutover under
[ADR-0045](../adr/0045-action-accounting-and-provider-expenses.md). It must not be
rolled onto a populated production ledger with old processes still running.

## Fresh development database

Stop the API, generation workers, purge worker and fixture processes using the
old development database. Preserve that database. Create a separately named,
empty local development database and update the ignored local database setting
to that name; never print credentials into evidence or shell output.

Run the canonical migration command against the new database, then apply the
reviewed worker-role grants. Migrations retain their historical sequence and
include an empty-ledger/drained-work guard. A populated ledger is an intentional
failure requiring a separate migration strategy, not an invitation to bypass the
guard, alter migration hashes or delete migration history.

After starting the new application, verify empty balance/history, administrative
calibration, a synthetic credited account, and one completed/failed action.
Existing local accounts/content remain in the preserved old database. Moving
back requires stopping all new processes first and restoring the prior database
setting and compatible code together. Do not run old code against the new
milli-credit database or copy old wallet rows into it.

The migration deployment classification must remain `contract` for the reviewed
cutover. The normal blue/green release gate rejects this classification. That is
intentional; this development authorization is not production rollout approval.

## Administrative calibration

In Accounting, set the application credit maximum per action and provider USD
maximums per action, per account/day, and globally/day. New learner preferences
copy the configured application default; changing models cannot raise a learner's
saved maximum. Existing preference values remain explicit.

Publish reviewed provider rates for each enabled model and supported meter,
including cache categories the adapter can use. Record the price source and
effective date. Publish customer credit tariffs independently in AI settings.
Check fractional credit precision against intended credit-pack values and the
cheapest tariff before enabling real paid generation. Test fixture rates are
synthetic and must not become production economic defaults.

Interviews initially use the Free capability policy. The removed
`AI_INTERVIEW_CREDITS_BYPASS` environment variable no longer controls charging.
Free work requires provider/operator configuration and obeys execution, rate,
quota and dollar limits. Policy changes apply to new admissions; admitted work
retains its policy. A free action cannot become paid during execution.

Record externally received payments with their purchase lot, USD-converted value,
fees and reference. Granted credits are not sales revenue. Record refunds
separately, including unused-credit revocation when appropriate. Provider deposits
and reported balances are cash/balance observations, not generation expense.
Invoice differences stay unallocated at provider/period level unless evidence
supports finer attribution.

## Operational checks

Use the exact settled amount for transactions and admission. Compact learner
amounts may round for display, but a nonzero amount below display precision is
shown as less than 0.01 credit. Technical failures show No charge; explicit Stop
can charge measured or defensibly estimated eligible partial usage.

Monitor failed admission reasons, held-credit age, active actions, unknown
provider expenses, daily reserved/consumed operator limits, background cleanup,
report freshness, lock waits and admission latency. A missing mandatory control
must reject new dispatch rather than bypass accounting. Already admitted work
retains its bounded authorization and must settle once.

Reports distinguish calculated/measured/estimated/unknown expense. A derived
provider remaining balance is an estimate because other tools may spend against
the same account. Reporting is refreshed in the background, separate from the
generation connection pool; inspect the shown generation timestamp.

A learner leaving the page does not cancel generation. Reconnection retrieves
persisted results. Explicit Stop requests cancellation. Support should not repeat
submission to recover a lost response or issue a second debit.

## Verification boundary

Current check results and missing evidence belong to
[Feature052 evidence](../../.agent/features/052-ai-accounting/EVIDENCE.md).
The deterministic load harness does not call paid providers and cannot establish
provider latency or production deployment capacity. Its recorded hardware,
fixture sizes, query plans, source hashes and exclusions qualify every result.
