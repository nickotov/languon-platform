# ADR-0022: AI credit ledger and generation settlement

Status: Accepted
Date: 2026-09-25
Supersedes: None

## Context

Dictionary text generation already records owner-attributed reserved and actual
provider tokens and cost. Product access, however, is constrained by hard-coded
rolling attempt limits. Future subscription allowances, purchased extras, and
admin grants require a durable balance that remains correct under concurrent job
admission, retries, provider failures, expiry, admin mutation, and account purge.

A single mutable balance cannot explain where value came from, preserve expiry,
support purchase/subscription idempotency, or distinguish reported usage from a
conservative estimate. Raw provider tokens also have materially different costs
between models and between input and output.

## Decision

AI credits form a dedicated backend bounded module. It owns account access policy,
source-specific credit grants, reservation allocation, settlement/release, and
history. Administration owns privileged authorization and audit; generation owns
job orchestration. Their persistence adapters participate in the credit module's
invariants within the same PostgreSQL transaction as the admin mutation or job
state change.

An absent account is limited with zero credits. Unlimited policy may be permanent
or expire. Unlimited usage is measured but does not consume finite grants. Jobs
pin the effective policy and immutable model credit rate at admission, so later
policy/catalog changes do not reinterpret admitted work.

Credit grants are immutable source lots with bounded integer amounts, validity,
source type, and idempotent source reference. Subscription grants may expire at
period end, purchases do not expire, and admin grants may optionally expire.
Allocation consumes earliest expiry first, non-expiring lots last, then stable
creation order. Reserved value remains settleable after its lot expires.

Generation reserves one attempt atomically with admission and extends by one
attempt before each retry. Terminal settlement consumes normalized credits from
provider-reported input/output usage and releases the remainder. If trustworthy
usage is absent after provider cost may have been incurred, settlement consumes
the conservative reservation and records `estimated`; it never presents that
amount as provider-reported. A provider-free cancellation/failure releases value.

Credit rates are reviewed catalog data, separate from editable admin input and
from raw vendor cost fields. Each configuration revision and job pins a credit
pricing revision plus input/output rates and a maximum attempt reservation. New
rates affect new jobs only.

Credit entitlement remains separate from operational controls. Global provider
budgets, owner/global concurrency, queues, rate limits, and circuit breakers stay
active. Credit-accounted jobs no longer use the rolling owner daily attempt limit.

Rollout is expand-first and inactive by default. Existing jobs/revisions remain
legacy and are never charged retroactively. Activation requires managed routing,
a priced active revision, current API/worker support, and a worker transaction
capability that prevents an old worker from claiming credit-accounted work.

## Alternatives considered

### Store a mutable balance on the user

This is simple but loses source, expiry, auditability, reservation ownership, and
safe future purchase/refund semantics. Concurrent jobs can overspend without an
allocation ledger.

### Count raw input and output tokens equally

Provider/model prices vary enough that one-for-one raw tokens make subscription
allowances economically unstable and make later model choice unsafe.

### Reserve every retry at admission

This guarantees retry funding but locks several times the ordinary requirement,
causing valid jobs to be rejected. One-attempt reservation matches existing
provider-budget behavior and fails before another paid retry when funds run out.

### Put credits inside dictionary or administration modules

That would couple future subscription/purchase issuance to a feature-specific job
store or privileged UI. The dedicated module keeps ledger rules reusable while
transaction participants preserve atomicity at established infrastructure seams.

## Consequences

### Positive

- Subscription, purchase, migration, and admin sources can issue idempotent lots.
- Concurrent jobs cannot spend the same credits and every charge has provenance.
- Expiry, unlimited overrides, retries, refunds of unused reservations, and
  missing provider usage have explicit semantics.
- Provider/model choice can later expose its credit rate without changing ledger
  meaning or treating credits as currency.

### Negative

- Job admission, retry, settlement, admin mutation, purge, and worker rollout all
  gain transaction coordination and additional persistence.
- Conservative settlement may consume more credits than actual provider usage
  when a provider omits usage; the measurement source must remain visible.
- Old workers cannot process credit-accounted work, requiring capability rollout.

### Risks / limitations

- Credits are future product value but are not money, payment records, invoices,
  or tax records. A later billing feature must define financial retention/refunds.
- Catalog rate mistakes affect newly admitted work; review, bounds, immutable
  snapshots, and deterministic tests are required.
- Activating zero-credit default before grants/unlimited overrides are configured
  intentionally blocks every limited user.

## Related

- [ADR-0002](./0002-drizzle-schema-and-migration-strategy.md)
- [ADR-0010](./0010-admin-application-and-authorization.md)
- [ADR-0011](./0011-dictionary-persistence-and-composition.md)
- [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md)
- [ADR-0021](./0021-dictionary-ai-provider-routing.md)
- [Feature 029](../../.agent/features/029-ai-credit-wallet/FEATURE.md)
- [Feature 029 ExecPlan](../../.agent/features/029-ai-credit-wallet/EXEC_PLAN.md)
