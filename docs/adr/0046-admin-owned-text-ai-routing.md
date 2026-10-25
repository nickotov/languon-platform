---
type: adr
id: ADR-0046
title: Admin-owned text AI routing and verified model routes
status: proposed
date: 2026-10-25
supersedes: 'Proposed partial replacement of ADR-0026 learner model selection, ADR-0037 contextual Auto/Flash-only routing, ADR-0021 no-fallback routing and ADR-0045 model-oriented customer tariff selection; other guarantees remain active'
---

# ADR-0046: Admin-owned text AI routing and verified model routes

## Context

A retired Kie model passed route-reachability checks and failed real generation.
The user confirmed twenty design decisions to add gateways, verify model routes,
assign models per flow and remove learner model selection. Multiple backend
models must not make learner pricing unpredictable or bypass existing funding,
privacy, worker compatibility and immutable admission guarantees.

This record is proposed pending final shared-understanding confirmation. It is
not implementation evidence or authorization to activate routes or spend money.

## Decision

Keep text-ai responsible for reviewed provider/model routes and admin-owned,
versioned flow routing. Keep ai-credits financially authoritative and domain
modules responsible for typed work, prompts, validation and result publication.
No separate gateway service, Kafka or Bifrost is introduced.

Add OpenRouter and EvoLink through reviewed adapters. Configure a global primary
and ordered fallbacks with per-flow overrides. Provider endpoints, credential
references, supported model IDs and contracts remain code-owned; admin cannot
supply arbitrary destinations. Gateway routing must preserve approved upstream,
privacy, parameter, attempt and cost constraints.

Remove learner model selection in both UI and backend policy. Learners retain
presentation, personalization and spending preferences. Authorized admin retains
model identity and provider expense; ordinary learner surfaces omit model names.

Separate administrative enablement, recent successful response/flow checks and
runtime health. Activation needs matching flow-compatible evidence within 24
hours. Age alone does not interrupt an unchanged route. Checks use bounded audited
operator spending and synthetic data, not learner funds or request-path probes.

Pin routing candidates, flow credit tariff, funding policy, provider prices and
limits at admission. Allow only one safe automatic reattempt inside the original
authorization. Do not blindly retry ambiguous executions or replace visible
streamed output. Current Disable prevents new dispatch, including queued work,
without silently adding today's fallback candidates to old actions. Running
requests finish unless explicitly stopped.

Publish learner tariffs by flow independently of selected model costs. Preserve
technical-failure/no-charge, explicit Stop, Free policies, exact arithmetic and
immutable historical financial records. Missing configuration fails closed.

Hard retirement/credential/schema exclusions require successful manual recheck;
bounded transient circuits may recover without paid checks on every submission.
Quick response does not certify language quality or unrelated flow compatibility.

The detailed [design](../text-ai-routing-design.md) records scope, checks, limits,
rollout and verification. On acceptance, update relationship metadata of affected
accepted ADRs without rewriting their historical decisions.

## Alternatives considered

### Learner-selected models with stronger health checks

Retains API and preference complexity and exposes operational model availability
to learners. The user chose application-owned routing and learner-facing simplicity.

### Arbitrary admin model IDs and URLs

Faster onboarding cannot establish schema/streaming compatibility, constrain
credential destinations or prove requested processing restrictions. Keep review
at the adapter/catalog seam.

### Let gateway defaults own routing and failover

May invisibly change upstreams, retry counts, cost or supported parameters.
Gateway controls must fit Languon's authorization rather than replace it.

### Probe every request or require continuously fresh paid checks

Adds latency, operator expense and probe-driven outages. Use bounded manual
activation evidence and actual runtime observations instead.

## Consequences

### Positive

- Retired routes are distinguishable from functioning model completions.
- Flow compatibility and stable learner tariffs survive provider substitution.
- Learners retain useful controls without managing infrastructure choices.

### Negative

- Model onboarding remains reviewed deployment work.
- Versioned fallback policies, check evidence and exclusions add state and tests.
- Gateway controls can prevent activation even when a simple completion works.

### Risks / limitations

- Catalog presence and successful probes do not guarantee quality or future uptime.
- Live quality evidence and actual tariff publication remain activation inputs.
- Existing learner-selection APIs, persisted preferences and old snapshots need
  explicit migration behavior; hiding controls alone is insufficient.
- Historical work and pricing cannot be rewritten to current routing.

## Related

- [Research and interview decisions](../surveys/text-ai-provider-routing.md).
- [Consolidated design](../text-ai-routing-design.md).
- [ADR-0021](0021-dictionary-ai-provider-routing.md).
- [ADR-0026](0026-shared-text-ai-selection-and-user-preferences.md).
- [ADR-0037](0037-independent-knowledge-and-agent-proposals.md).
- [ADR-0045](0045-action-accounting-and-provider-expenses.md).
