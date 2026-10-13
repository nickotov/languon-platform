---
type: adr
id: ADR-0032
title: 'Model price revisions and speech settlement'
status: accepted
date: 2026-10-13
supersedes: 'ADR-0022 non-editable catalog tariff and cost-incurred settlement only for speech; ADR-0027 closed job-kind set extended with speech'
---

# ADR-0032: Model price revisions and speech settlement

## Context

Feature 042 is explicitly authorized to charge long uncached speech only after
successful audio publication, and to let administrators edit customer-credit rates
for speech and existing text models. Existing text usage settlement remains valid;
speech publication success is a different customer-billing event from upstream cost.

## Decision

The ai-credits capability owns immutable tariff revisions. An authorized admin
publishes bounded speech character rates or text input/output token rates with
optimistic concurrency and an audit event. Provider/model/voice definitions remain
curated configuration/code; price administration does not accept provider URLs,
credentials or arbitrary model definitions.

A tariff revision is distinct from the existing pricing schema version. Effective
model selection, displayed prices and admission use the same current tariff.
Automatic and explicit text selection pin that revision/rate/reservation maximum
at admission. Future publications never reinterpret admitted or historical work;
existing text models retain their current rates during migration. Text-AI retries,
reported/estimated usage and failure settlement retain their previous semantics.

Speech cache hits and joined requests are free. A cache miss is free only when
normalized text contains no more than 10 language-aware words and 100 Unicode code
points. Chargeable speech quotes price the entire normalized text with integer
arithmetic: max(minimum charge, ceiling(characters * credits per 1000 / 1000)).
The provisional initial rate is 100 credits per 1000 characters, minimum one credit.
Normalization, segmentation, eligibility, profile and price revisions are pinned.

Quotes expire after five minutes and reserve nothing. Confirmation checks current
source authorization/revision, profile and price; stale quotes require refresh.
Inside the same transaction, recheck reusable/in-flight audio and reserve the exact
confirmed charge only when admitting a new job. The first admitted requester pays;
others join without another reservation. Job identity/idempotency and ledger locks
prevent duplicate charges and combined speech/text overspending.

Add a closed speech job kind and explicit success-only settlement outcome to the
existing credit boundary. Settle at most once after bounded audio is validated and
saved successfully. Definitive failure releases the hold even if provider cost was
incurred. Do not represent dispatched failure as an undispatched cancellation.
Unlimited accounts retain measurement policy. Free jobs still consume operational
budgets/capacity without artificial zero-value finite-credit reservations.

Queue timeout is two minutes; the customer billing deadline is ten minutes from
admission. Publication transactions enforce that deadline independently of workers.
After release, billing is permanently closed: late successful audio may be retained
and reused, but never creates a late charge. Known provider-task recovery may
continue for 24 hours. Ambiguous submissions retain uncertainty until reconciliation
and never trigger a blind new provider call. Leaving a page does not cancel an
admitted generation; disclose this before paid confirmation.

Keep provider expenditure separate from customer credit tariffs and retain bounded
operational controls. Initial speech defaults are 10 queued and two active per
actor, four active globally, and 500 free new admissions per actor per UTC day.
Cache hits/joins consume no free admission allowance; exhausted allowance never
silently converts short text into paid generation.

## Alternatives considered

### Debit at submission or charge provider cost after failure

This follows text-model cost semantics but violates the approved speech promise
that credits are charged only after usable audio publication.

### Mutable rates embedded in historical jobs

This would change settled meaning and make retries, displayed prices and quotes
inconsistent. Immutable snapshots apply to newly admitted work only.

### Separate speech wallet

A second wallet would permit inconsistent balances and concurrency races. Reuse
the existing credit invariant with typed speech dispatch and settlement.

## Consequences

### Positive

- Learners confirm an exact charge and never pay for failed speech delivery.
- Administrative rate changes affect future admissions predictably.
- Shared wallet transactions coordinate text and speech without overspending.

### Negative

- Provider costs may be incurred while customer credits are refunded.
- Price publication, stale quotes and billing/publication races need integration proof.

### Risks / limitations

- Initial speech pricing is provisional, not a claim about Kie cost or margin.
- Old workers must fail closed against newly priced/speech jobs.
- Credits remain application allowance, not invoices or payment currency.

## Related

- [Feature 042](../../.agent/features/042-shared-pronunciation-playback/FEATURE.md).
- [ADR-0022](0022-ai-credit-ledger-and-generation-settlement.md).
- [ADR-0027](0027-typed-sentence-work-and-shared-ai-accounting.md).
- [ADR-0031](0031-shared-pronunciation-and-retained-recordings.md).
