---
type: design
title: AI credits and provider expense accounting
status: approved
source_paths:
  - apps/backend/src/modules/ai-credits
  - apps/backend/src/modules/text-ai
  - apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts
  - apps/admin/src/pages/ai-settings
---

# AI credits and provider expense accounting

Design discovery requested through grill-with-docs and approved by the user in
Q38. This records agreed product requirements and the delivery design. The user
authorized feature implementation on 2026-10-22; completion remains tracked in
[Feature052](../.agent/features/052-ai-accounting/FEATURE.md).

## Agreed requirements

1. Maintain published customer usage tariffs per model/capability independently
   from provider prices. Admins configure separate input/output credits per
   million tokens and an optional cached-input rate. Fractional rates are
   supported. Started work retains its tariff.
2. Dollar spending information is admin-only. Learners see credits held and
   charged. Reports distinguish measured usage from estimates. Revenue and
   margin reporting use actual purchase records; granted credits are not revenue.
3. Technical failures producing no usable result do not charge learners.
   Languon still records provider expense. Successfully delivered results remain
   chargeable when the learner dislikes them. Learner-initiated stops are
   chargeable according to the measurement rules below.
4. Apply an affordable output cap and no minimum request fee or configured
   minimum output. Permit tiny affordable outputs with an explicit warning,
   approximate output-token allowance, and Send/Top up choices. Reject when
   input and any output cannot be funded. The initial shared maximum is 10,000
   total output tokens per action, allocated across calls and constrained by
   the credit budget and each model's supported limits. Charge actual billable
   usage afterward. Failed attempts consume operational capacity without adding
   customer charges. All attempts consume the total execution allowance,
   including the output-token cap.
5. Support both learner-funded private document preparation, within an explicitly
   approved processing budget, and operator-funded shared-library preparation.
   Track preparation independently of later questions so OCR and embeddings
   are not inadvertently charged repeatedly.
6. Each learner action has a bounded total budget for necessary processing.
   Optional background maintenance is an operator expense. Technical retries
   stay within that authorization and failed attempts do not inflate the
   learner's charge. A learner-configurable default maximum credits per action
   lives in profile AI settings. Show the maximum near the composer; sending
   authorizes spending within it and available balance. Exceeding that maximum
   requires confirmation. Larger document jobs have explicit budget confirmation.
   Do not reserve the entire balance simply because it is available.
7. For learner-initiated stops, prefer provider-reported usage. Otherwise use a
   defensible conservative estimate of input/output actually processed, capped
   by the hold and marked estimated. Do not default to charging the entire
   reservation. Languon absorbs expense with no defensible measurement.
8. A technically interrupted chat answer is not charged, even if partial text
   remains visible. Document processing charges only independently usable,
   successfully completed stages within its approved budget. This is the
   initial policy; the user may change it later.
9. Provider cost rates are initially admin-reviewed and versioned, with source
   and effective date. Future automatic fetching can propose rates for review.
   Invoice adjustments remain separate, and provider price corrections never
   silently rewrite historical customer charges.
10. Support fractional credits, provisionally to 0.001 credit, using exact
    arithmetic. Sum billable usage and round upward once per settled action.
    Independently settled stages use cumulative rounding so splitting work does
    not increase total charges. Validate precision against intended pack prices
    and cheapest tariffs before implementation. Learner UI shows rounded values
    and permits viewing exact values. Nonzero charges below display precision
    show e.g. '<0.01 credits', never zero. Transaction details show the exact
    settled amount. Admission always uses the exact balance.
11. Pin customer tariff, action budget and charging-policy version at admission.
    New rules apply to new actions. Corrections are separate adjustments with a
    reason, preserving original history.
12. Initially provide separate cash-activity and usage-economics views. Cash
    activity includes actual payments, refunds and payment fees. Usage economics
    allocates purchase value to consumed paid credits and subtracts attributable
    provider expense. Granted credits have no purchase value but their expense
    stays visible. Show unused purchased credits separately; this operational
    metric is not labelled accounting profit.
13. First delivery covers existing text, interview and speech usage, revised
    credit rules, admin dollar reporting, manual provider-bill reconciliation,
    and explicit estimated/unknown costs. Design future ingestion and service
    boundaries, but defer document ingestion, automatic invoice imports, Bifrost
    deployment and microservice extraction.
14. A valid response reaching its output/credit-derived limit is chargeable.
    Show 'Response limit reached' and an explicit Continue action with a new
    budget; do not continue automatically. Invalid structured output is a
    technical failure and not chargeable.
15. An admin-configured application default credit budget is copied into the
    learner's AI settings and is learner-editable. Choosing an expensive model
    cannot silently raise it. Explain when the budget permits fewer output
    tokens. Its initial numerical value remains to be calibrated.
16. Successful responses with missing trustworthy usage follow the same rule
    as user stops: a defensible estimate, labelled and capped by the hold.
    Without defensible measurement, release the customer hold and record
    provider expense as unknown, not zero. Subsequent provider reconciliation
    cannot produce a surprise additional learner charge.
17. Atomically check available credits and reserve at submission. If concurrent
    spending reduces a previously shown output allowance, show the new allowance
    and require confirmation rather than silently reducing it or overspending.
18. All attempts consume the action's execution allowance. Only eligible usage
    contributes to the customer charge. Permit at most one automatic retry when
    safe and within remaining token and provider-cost limits; do not blindly
    retry ambiguous upstream execution.
19. Interviews will be free to learners, with provider expense borne by Languon.
    Preserve other existing free and unlimited exceptions. Free work has no
    customer hold or charge, retains expense measurement and execution/rate/
    operator-cost limits, and is labelled Free. Never silently convert admitted
    free work into paid work. Allow future capabilities to have operator-funded
    policies through the admin-controlled capability policy defined below.
20. Reconcile provider bill differences at provider/billing-period level when
    request-level evidence is missing. Keep the unallocated adjustment visible
    alongside calculated costs and invoice totals. Do not invent user allocation
    or change customer charges.
21. The user allows a fresh development-data start because there are no deployed
    real users. Historical-data migration is not a requirement. No reset is
    performed during discovery; exact reset scope and target are implementation
    details to identify before execution.
22. The first durably recorded terminal outcome wins and settlement occurs once.
    An explicit Stop cannot undo an already completed response. Backend generation
    continues after page closure or network loss and saves results for replay.
    Successful work charges normally; technical failure does not. Explicit Stop
    cancels and charges eligible partial usage. Show: 'Generation continues if
    you leave. Use Stop to cancel.' Reconnection never regenerates or recharges.
    Display separate execution and billing states together, e.g. Completed with
    a credit charge, Stopped with partial charge, Failed with No charge, or
    Completed with Free.
23. Admins control the charging policy per capability, initially setting
    interviews to Free. Preserve conditional speech exemptions and unlimited
    accounts. Replace the interview-specific credits-bypass flag with the
    consistent capability policy. Admitted work retains its original policy.
    Free capabilities retain operator spending limits independent of learners'
    customer-credit budgets.
24. Initially record externally received payments manually in admin, linked to
    the credited purchase lot, with payment reference, amount, currency, fees
    and subsequent refunds. Checkout/payment-provider integration remains out
    of scope. The user will convert payment values to USD manually; automated
    foreign-exchange handling is not required. USD values
    are required for reports; original-currency evidence can be retained as
    optional supporting information, without building conversion logic.
25. Record actual external refunds separately from credit adjustments. Show
    associated available, reserved and consumed credits; admins explicitly
    choose available credits to revoke. Do not revoke reserved credits, rewrite
    consumed usage or silently create debt. Refunded consumed value remains
    visible as business loss. Recording a refund does not send money.
26. Keep accounting inside the current backend with a dedicated module boundary.
    Document a future service contract, but defer separate hosting and Kafka.
27. Record provider deposits manually with provider, date, USD amount and
    reference. Show deposited funds, calculated usage and latest reported balance
    separately. Provider balance snapshots carry their observation date. Label
    derived remaining balances as estimates because other tools and adjustments
    can affect the account. Deposits are not generation expense.

## Agreed deployment boundary

Keep accounting in the current backend with one owning module and explicit
contracts. Separate service deployment and Kafka are deferred. A workspace package
is not a prerequisite; extract cohesive logic only when there is real reuse.
Preserve shared-transaction guarantees until an explicit distributed protocol
replaces them. Future service calls must confirm reservation before provider
dispatch; asynchronous expense events alone cannot authorize spending.

## Approved implementation design

This section translates agreed behavior into the approved design, not implemented
contracts. User approval of this document does not itself supersede existing ADRs;
the delivery outline includes the required superseding records.

### Ownership and records

- Accounting owns credit lots, holds, allocations, settlement, customer tariff
  revisions, capability charging policies, provider cost rate revisions,
  numerical usage/expense records and financial adjustments.
- Feature modules own typed jobs, prompts, validation, publication and retained
  results. Do not introduce a universal model executor or move learning content
  into the accounting boundary (ADR-0027).
- An action groups its stages and provider attempts. Each has stable identity;
  retries create attempts under the same action rather than fresh spending
  authorization. A stage can be independently settled only when the product
  defines a separately usable result; initial chats settle as one action.
- Keep provider-reported usage, estimated usage, calculated USD cost and
  invoice-reconciled adjustments distinct. Unknown expense is not zero. Store
  normalized non-overlapping meter quantities alongside measurement provenance;
  cached tokens must not be counted as both full-price and cached input.
- Customer charges use snapshotted tariffs and policy; provider expense uses
  attributable rate revisions. Do not derive either price from the other.
- Paid-credit consumption retains purchase-lot attribution. Cash refunds and
  credit adjustments are distinct entries; reports must avoid double-counting
  a refund as both a cash expense and an additional invented provider expense.

### Action flow

1. Resolve capability policy, selected model, rates, learner action budget and
   server execution limits. Estimate bounded input and allocate output across
   required calls. Operator-funded work skips the customer affordability gate.
2. Show the applicable maximum and any reduced allowance. Atomically recheck
   balance and create the bounded hold with the durable job. Return a refreshed
   allowance for confirmation if concurrent spending changed the accepted offer.
3. Dispatch only admitted work. Enforce total output and provider-cost limits
   across attempts; make at most one safe automatic retry. Meter free and failed
   work as well as customer-funded successful work.
4. Persist validated public response events and results independently of browser
   connection state. Reconnect replays the existing action. Explicit Stop is
   an idempotent backend command, not merely closing the browser stream.
5. Determine the authoritative outcome, calculate eligible usage, round once,
   and settle or release exactly once. A single action budget also bounds the
   rounded charge; admission must account for the smallest credit unit.
6. Recover interrupted accounting operations without dispatching a duplicate
   provider request or releasing a hold while the action can still charge.
   Expiry/recovery deadlines must be bounded and recorded in implementation.

The 10,000-token ceiling governs token-generating work. Speech retains its
character-based tariff and applicable output/duration limits; do not invent a
token conversion for non-token meters. Future OCR and embedding adapters expose
their actual units under the same action-budget accounting.

### Future service contract

Conceptual operations: quote, reserve, record attempt/usage, settle, release,
record payment/refund/adjustment, and query balance/history/reporting. Commands
carry action identity and idempotency identity; repeated identical commands
return the prior result, while conflicting reuse is rejected. References link
accounting to feature jobs without sending prompts or document contents.

A future network adapter must support lookup after an ambiguous command timeout,
durable delivery of outcomes, deduplicated consumption and reconciliation of
orphaned reservations. Events may update reporting asynchronously; they must not
permit generation before reservation acknowledgement. These are future extraction
requirements, not a request to deploy an event broker now.

### Delivery and verification outline

1. Finalize initial tariff/pack calibration and proposed ADRs replacing affected
   portions of ADR-0022/0032/0044. Keep current accepted ADR text intact until
   the superseding decision is adopted.
2. Establish fractional arithmetic, rate/policy revisions, action/attempt expense
   accounting and payment/deposit records. Use a reviewed development reset and
   fresh seeds; do not silently reset databases during normal startup.
3. Integrate existing text, portrait and speech flows with bounded admission,
   outcome settlement and durable replay; replace the interview bypass flag.
4. Add learner AI budget settings, composer disclosures, result billing states,
   and admin policy/pricing/payment/expense/reconciliation screens.
5. Verify concurrent admissions, duplicate commands, retries, missing usage,
   stop/completion races, disconnect replay, free policies, rate changes,
   fractional rounding, refunded lots and settlement recovery using deterministic
   provider fixtures and disposable databases. Include browser journeys and
   independent completion/security review before declaring implementation done.

## Verified current foundations and gaps

- [ADR-0022](adr/0022-ai-credit-ledger-and-generation-settlement.md) establishes
  a dedicated credit module, immutable grants, holds, and usage settlement.
- [ADR-0032](adr/0032-model-price-revisions-and-speech-settlement.md) establishes
  immutable admin-published tariffs and success-only speech charging. Text
  currently retains cost-incurred failure charging. Agreed requirement 3 needs
  an explicit superseding decision before implementation.
- Provider cost rates and customer tariffs already exist separately. Provider
  rates are code-owned; their presence is not verification of current vendor prices.
- Some fields named actual cost contain conservative estimates, including prior
  dictionary attempts and conversation calls with missing usage. They cannot
  be relabelled as invoice-confirmed expenditure.
- Inspected token accounting retains input/output quantities without distinct
  cached-input meters. Accurate cache discounts need preserved usage detail.
- Inspected admin surfaces expose wallet history and customer tariff editing,
  but no normalized provider expense or margin dashboard.
- Wallet/job admission currently shares PostgreSQL transactions. Later service
  extraction needs explicit idempotency and recovery protocols to replace that
  atomicity; moving files into a service is insufficient.
- [ADR-0041](adr/0041-durable-tutor-streaming-presentation.md) already preserves
  durable worker execution, persisted events, replay cursors and explicit Stop;
  browser subscription status is separate from execution state. Reuse this
  foundation for reconnect behavior rather than redirecting a browser-owned call.
- Credit grants labelled purchase are not actual payment records. The inspected
  grant schema contains no cash amount, currency, fees or payment-refund fields;
  checkout/payment integration is excluded from the current wallet user flow.
  Revenue reporting therefore needs a new source of actual payment facts.

Evidence: `text-ai/application/text-ai-provider-catalog.ts`,
`ai-credits/application/ai-credit-participant.ts`,
`ai-credits/domain/ai-credit.ts`,
`conversations/infrastructure/conversation-accounting.ts`, and dictionary
generation persistence under `apps/backend/src/modules/`.

## Implementation prerequisites

- Default credit budget calibration against pack values and initial tariffs.
- Numerical operator expense/rate limits for free and paid capabilities.
- Safe development reset scope and configuration seed values.

No production tariff, provider price, monetary limit or exchange rate is invented
by this document. Initial amounts and the provisional 0.001-credit precision
must be validated together before enabling real paid use. Documentation changes
alone do not activate any of these behaviors.

## Research references

- [Bifrost repository](https://github.com/maximhq/bifrost): unified provider
  routing, fallbacks, caching and observability capabilities.
- [Bifrost virtual keys](https://docs.getbifrost.ai/features/governance/virtual-keys):
  provider access controls, budgets and rate limits. These are distinct from
  Languon's customer grant, reservation and outcome-charging requirements.
