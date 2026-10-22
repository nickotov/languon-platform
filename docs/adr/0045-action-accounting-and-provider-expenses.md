---
type: adr
id: ADR-0045
title: 'Bounded action accounting and independent provider expenses'
status: accepted
date: 2026-10-22
supersedes: 'ADR-0022 whole-credit units, per-attempt customer funding and conservative full-hold failure charges; ADR-0027 history-union admission accounting; ADR-0032 text failure semantics; ADR-0044 interview-specific charging bypass'
---

# ADR-0045: Bounded action accounting and independent provider expenses

## Context

The user approved the accounting design and requested its implementation. Customer
credit tariffs must remain independent of provider prices, technical failures must
not debit learners, and free capabilities must still have bounded operator expense.
The existing transaction participants and typed feature workers provide these
boundaries without introducing a second service or distributed transactions.

## Decision

Keep accounting inside the backend's dedicated ai-credits module. Feature modules
retain job ownership, authorization, result validation and publication. Accounting
participants join their PostgreSQL transactions. Do not introduce Kafka, Bifrost,
a separate deployment, checkout, or document ingestion in this delivery. A future
service must preserve idempotent admission, attempt authorization and settlement;
transport changes cannot weaken these contracts.

Store credit amounts as integer milli-credits: 1,000 units equal one credit.
Boundary amounts use canonical decimal strings. Compute tariffs with exact
arithmetic, sum eligible usage, then round upward once per settled action to
0.001 credit. UI rounding never authorizes spending. Independently settled future
document stages must use cumulative rounding; their implementation is deferred.

Publish immutable customer tariffs separately from reviewed provider USD prices
with source and effective date. Pin tariffs, policy, budget and provider prices
when admitting work. Corrections to financial history are new reasoned records;
price changes never rewrite learner charges. Application defaults and provider
USD limits require explicit administrative calibration, rather than invented
production prices.

A learner action reserves a bounded affordable credit maximum, never the entire
balance simply because it is available. Sending authorizes the configured maximum.
An affordable output reduction requires confirmation; concurrent balance changes
must not silently shrink a confirmed allowance. Initially permit up to 10,000
output tokens across an action's calls and at most one safe automatic retry.
All attempts consume execution and operator allowances. Failed attempts do not
increase learner charges. Never blindly retry an ambiguous upstream submission.

Successful results are chargeable. Technical failures and invalid structured
results release learner funds even when provider expense was incurred. Explicit
Stop charges eligible partial usage. Prefer reported usage; otherwise charge
only a defensible estimate, labelled estimated and capped by the hold. Without
such evidence, release the hold and retain unknown provider expense. Reconciliation
may correct internal expense without a surprise learner debit.

Use admin-controlled capability charging policies. Interviews initially use
operator funding, with 30 admitted actions per account per UTC day and one active
interview action. Failures consume the admission quota. Preserve unlimited
accounts and conditional speech exemptions. Free work never silently becomes paid;
admitted work keeps its funding policy. Remove the interview-specific environment
bypass in favor of this shared policy.

Every new dispatch also requires reviewed provider rates and bounded operator
cost authorization. Per-action, account/day and global/day USD limits span models,
capabilities and price revisions. Free and unlimited customer funding cannot bypass
these controls. Redis burst limits precede expensive work; PostgreSQL remains
financial authority. Required admission controls fail closed.

Maintain transactional grant/wallet and capacity projections rather than scanning
historical ledgers on admission. History remains immutable evidence. Cleanup runs
in bounded background batches; reporting uses a separate small connection pool
and dirty-version snapshots with a maximum 60-second freshness target. Measure
admission performance under the documented fixture; architecture alone is not
performance evidence.

The backend owns generation independently of browser subscriptions. Disconnecting
or leaving the page does not cancel work. Reconnection replays persisted output
without another generation or charge. Explicit Stop is separate. Persist streaming
text in bounded batches (100ms or 4KiB), and show execution and billing states
together with exact transaction details.

Admin-only financial reporting separates cash receipts/refunds/fees, recognized
purchase-credit usage value, provider expense, and unknown costs. Granted credits
are not revenue. Manually record provider deposits, reported balances and invoice
differences; unallocated reconciliation differences belong to provider/period,
not invented request-level allocations. Preserve anonymous financial attribution
through account purge while removing personal links and private content.

This development-only transition requires an empty ledger and drained work. Use a
new development database, retaining the old database separately; do not reinterpret
old whole-credit data in place. Existing append-only migration history is retained.
A production migration would require a separately approved conversion strategy.

## Alternatives considered

### Extract a service and Kafka immediately

This adds distributed authorization, settlement and recovery failure modes before
there is a measured deployment need. Keep explicit module contracts first.

### Adopt an AI gateway as the wallet

Routing and provider telemetry do not define Languon's customer tariffs, purchase
lots, usable results, refunds or publication semantics. A gateway can be evaluated
later behind the provider boundary without becoming financial authority.

### Charge every provider attempt or consume the entire hold when usage is absent

This transfers technical failures and uncertain measurement to learners, contrary
to the approved policy. Record operator expense separately.

## Consequences

### Positive

- Customer promises and provider expense have independent, auditable histories.
- Concurrent admissions cannot spend the same funds or multiply model allowances.
- Existing typed workers retain their authorization and publication boundaries.

### Negative

- Exact arithmetic, pinned policies and durable projections require database guards
  and concurrency verification.
- Free work and technical failures consume operator funds; limits need calibration.
- Manual reporting and reconciliation do not provide tax or statutory accounting.

### Risks / limitations

- Acceptance does not establish implementation or performance completion; feature
  evidence and independent reviews remain required.
- Production activation requires calibrated prices, limits, scoped worker grants,
  and verified deployment procedures. No production deployment is authorized.
- Future ingestion, invoice automation and service extraction remain deferred.

## Related

- [Approved design](../ai-credit-accounting-design.md).
- [Calibration and development cutover](../operations/ai-accounting.md).
- [Feature 052](../../.agent/features/052-ai-accounting/FEATURE.md).
- [ADR-0022](0022-ai-credit-ledger-and-generation-settlement.md).
- [ADR-0027](0027-typed-sentence-work-and-shared-ai-accounting.md).
- [ADR-0032](0032-model-price-revisions-and-speech-settlement.md).
- [ADR-0041](0041-durable-tutor-streaming-presentation.md).
- [ADR-0044](0044-learner-portrait-approval-and-use-boundaries.md).
