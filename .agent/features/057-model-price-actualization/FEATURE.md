# Automatic provider model price actualization

Status: Complete
Owner: Codex
Created: 2026-10-28

## Problem

Provider costs are manually maintained across growing model/provider catalogs.
The user authorized feature delivery and explicitly requires future model and
provider extensibility.

## Desired behavior

An appropriately scoped MCP client invokes `actualize_model_prices` to discover
current official rates and create exact existing price previews. The client can
complete updates through `admin_apply` without entering numerical prices. There
is no recurring scheduler in this delivery. Existing customer tariffs, routing,
credentials, admitted work and historical expense remain unchanged.

## Acceptance criteria

- AC-1 — Discover configured active text and speech model pairs from existing
  catalogs, not a second model list. Optional selection is restricted to these
  pairs. Omitted selections discover the complete catalog through deterministic
  continuation pages of at most 50 targets, without a global catalog cap. New
  models use the existing provider adapter without MCP code changes.
- AC-2 — A provider adapter registry fetches bounded official read-only metadata,
  validates rates/units and retains provenance. Unknown providers, missing models,
  ambiguous/tiered or incompatible prices produce explicit non-mutating results.
- AC-3 — MCP `actualize_model_prices` reports per-model changed/unchanged/skipped
  results and previews supported changes through existing price-write authority,
  expected versions, five-minute expiry, audit and idempotent apply. Existing
  tokens do not automatically gain the new action. No paid generation calls.
- AC-4 — Failures are isolated per provider, leave existing rates intact, and
  never invent zero prices or estimates. Preserve scheduled future publications.
- AC-5 — Exact conversion and comparison avoid floating arithmetic. Immutable
  price revisions affect future admissions only; customer tariffs are separate.
- AC-6 — Unit, disposable DB/HTTP transport journey, affected static/build checks,
  guide traceability, required critical gate and independent/security reviews
  establish the final implementation and document actual limitations.

## Scope

On-demand automatic fetching and preview creation; existing apply publishes.
OpenRouter support initially; add other adapters only where official sources
provide a defensible compatible rate. The registry is open to reviewed future
adapters. Provider/model onboarding remains curated under ADR-0046.
No scheduler, scraping via an LLM, arbitrary URLs, route activation, tariff
recalculation, migration, production deployment or paid model checks.

## Constraints and risks

External metadata is untrusted. Fixed HTTPS destinations, redirect rejection,
response/time/concurrency bounds and sanitized errors. Do not interpret gateway
base prices as exact when endpoint/tier rates differ. Unsupported entries preserve
existing prices. No token self-expansion.

## User-flow documentation

Canonical guide: docs/user-flows/model-price-actualization.md (API/system).
Existing docs/user-flows/admin-mcp.md updated only if its actual contract changes.
Focused real HTTP MCP plus disposable PostgreSQL journey maps the new guide;
existing MCP browser journey retained for token issuance. No application UI changes.

## Open decisions

None. Start with on-demand refresh as proposed and authorized; scheduling is deferred.
