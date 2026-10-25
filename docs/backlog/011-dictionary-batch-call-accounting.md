---
type: backlog-task
id: BL-011
title: Dictionary batch call accounting
status: pending
created: 2026-10-25
updated: 2026-10-25
original_tasks: '2026-10-25 AI generation failure audit'
evidence: []
---

# BL-011 — Dictionary batch call accounting

[Backlog index and shared constraints](README.md).

## Confirmed problem

Pasted-term and imported-pair jobs above 20 rows require multiple provider calls.
Current accounting represents a whole batch worker attempt as one provider call.
For 21 rows, conservative input includes two framing allowances, exceeding
65,536 bytes. The database admission function applies the model's 64,000-token
per-call ceiling to this aggregate and rejects the claim as
`ai_credits_exhausted` before any provider request, including operator-funded work.

There is a second obstruction: the batch worker requires at least 8,192 output
tokens for every chunk, while a newly admitted attempt can have only 8,192 total.
Two chunks therefore cannot execute. Raising the learner's balance or granting
more credits does not correct either model/aggregate mismatch.

Diagnosis and verified adjacent fixes are recorded in
[the active delivery record](../../.agent/improvements/ai-admitted-execution-consistency.md).
The earlier one-chunk adapter constructor failure is fixed separately; it does
not establish support for larger batches.

## Scope for future authorized delivery

Separate aggregate action authorization from actual provider-call limits,
including the checked database execution witness, attempt usage and settlement.
Prepare the design against [ADR-0045](../adr/0045-action-accounting-and-provider-expenses.md)
and current accounting guards before implementing a migration or changing call
identity. Do not weaken guards, reinterpret historical charges, raise limits,
truncate rows or create additional charged actions automatically.

Keep one approved action budget across chunks and safe retries. Allocate its
remaining input, output and operator-cost allowance across calls. Each call must
respect its model limits; all calls together must respect the action's allowance,
including the existing 10,000 total output ceiling. Remove runtime assumptions
that every chunk requires the legacy maximum output allocation.

## Acceptance and verification

- Real admission, claim, worker, default router and Mastra with fake external HTTP
  complete 21-row and maximum-size supported batches for pasted terms and imports.
- Assert outgoing per-call limits, aggregate usage, operator-cost bounds, one hold,
  exact settlement, idempotency, cancellation and bounded safe retry behavior.
- Insufficient budgets fail before dispatch or require existing explicit consent;
  invalid structured results remain technical failures without customer charges.
- Verify unchanged one-chunk behavior, snapshot validation, operator-funded and
  learner-funded work, unknown usage and restricted worker/database permissions.
- Add the larger-batch regression to the appropriate durable tests and run the
  full critical gate. No paid providers are needed for regression verification.

## Scope decision

On 2026-10-25 the user explicitly chose to finish the verified fixes and record
this larger accounting repair separately. No accounting guard or migration was
changed for this task. It remains pending and requires explicit feature delivery
before implementation; this document is not implementation authorization.
