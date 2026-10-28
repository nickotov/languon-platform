---
type: adr
id: ADR-0048
title: Official provider price actualization through reviewed adapters
status: accepted
date: 2026-10-28
supersedes: 'None'
superseded_in_part_by: 'ADR-0049 native pricing/accounting and complete provider coverage; source adapter and delegated-MCP boundaries remain active'
---

# ADR-0048: Official provider price actualization through reviewed adapters

## Context

The user authorized automatically fetching provider model prices through MCP,
including future additions to provider and model catalogs. Provider cost records
are flat immutable USD revisions while official metadata can contain conditional
tiers, endpoint differences or billing meters the application cannot represent.

## Decision

Keep fetching behind the ai-credits application price-source port, with reviewed
infrastructure adapters registered by provider ID. Discover targets from existing
configured active text and speech catalogs. Adding a compatible model reuses its
provider source; adding a provider requires a reviewed source implementation,
without a new MCP operation or a duplicate pricing model catalog.

Fetch only official read-only metadata through fixed HTTPS destinations, bounded
timeouts/responses and rejected redirects. Validate external data and convert
decimal units exactly into the existing accounting schema. Publish only prices
whose meter and conditional semantics can be represented faithfully. Report
unsupported, absent, ambiguous and unavailable prices without changing existing
rates or inventing estimates. Preserve already scheduled price publications.

Expose `actualize_model_prices` for on-demand fetching and exact existing price
previews. Publication uses `admin_apply`, expected versions, audit and replay.
The new `provider-prices.actualize` action is included only in newly issued
pricing-write credentials; existing snapshots do not gain authority. No customer
tariffs, route activation, historical snapshots or provider secrets change.

Initially support uniform compatible OpenRouter text and documented ElevenLabs
character pricing. Unknown providers report unsupported. No scheduler is added.
This follows the existing financial, catalog and MCP boundaries, creates no new
deployment or cost commitment, and is accepted within the authorized feature.

## Alternatives considered

### Fetch pricing with a language model or scrape arbitrary URLs

Unbounded sources and inferred numbers are unsuitable for automatic financial
publication. Explicit provider adapters are reviewable and deterministic.

### Flatten tiers and select the cheapest gateway endpoint

This can understate operator expense. Tier and endpoint-aware accounting needs
separate delivery before those models can be automatically updated faithfully.

### New bulk publication and scheduling infrastructure

The existing per-model preview/apply boundary already preserves concurrency,
authorization and replay. Scheduling is outside the initial on-demand scope.

## Consequences

### Positive

- Model additions reuse sources without duplicating MCP or numerical prices.
- Existing versioning, audits, snapshots and customer tariffs retain their meaning.

### Negative

- Some configured providers and models remain manual until compatible sources exist.
- A refresh may return previews for some models and unsupported results for others.

### Risks / limitations

- Official schemas may change; failed validation preserves existing rates.
- Published metadata is not invoice reconciliation or proof of runtime availability.
- Pricing authority requires a newly issued token with the new action snapshot.

## Related

- [ADR-0032](0032-model-price-revisions-and-speech-settlement.md).
- [ADR-0045](0045-action-accounting-and-provider-expenses.md).
- [ADR-0046](0046-admin-owned-text-ai-routing.md).
- [ADR-0047](0047-delegated-local-admin-mcp.md).
- [Feature 057](../../.agent/features/057-model-price-actualization/FEATURE.md).
