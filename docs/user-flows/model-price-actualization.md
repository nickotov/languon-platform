---
feature: model-price-actualization
title: Model price actualization
status: current
last_verified: 2026-10-28
surfaces:
    - api
    - system
source_paths:
    - apps/backend/src/modules/admin-mcp/application/admin-mcp-price-actualization-service.ts
    - apps/backend/src/modules/admin-mcp/interface/http/admin-mcp-server.ts
    - apps/backend/src/modules/admin-mcp/domain/admin-mcp.ts
    - apps/backend/src/infrastructure/admin-mcp/**
    - apps/backend/src/modules/ai-credits/application/provider-price-source.ts
    - apps/backend/src/modules/ai-credits/infrastructure/pricing/**
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices.ts
    - packages/contracts/src/ai-provider-prices.ts
    - packages/contracts/src/provider-native-pricing.ts
    - apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
    - apps/backend/src/modules/speech/domain/speech-models.ts
e2e_command: model-price-actualization
e2e_tests:
    - apps/backend/tests/integration/database/model-price-actualization.journeys.test.ts
e2e_scenarios:
    - official-price-preview-and-idempotent-publication
    - bounded-discovery-across-growing-catalogs
related_features:
    - model-price-coverage-and-onboarding
    - admin-mcp
    - ai-accounting
    - admin-text-ai-routing
---

# Model price actualization

## What this verifies

An authorized MCP client fetches official provider tariffs, prepares exact native
price previews and publishes immutable provider-cost revisions through existing
apply controls. Native rules retain billing units, precision, currencies, component
minimums and rounding, context tiers, schedules and endpoint applicability. They
are independent of customer credit tariffs, routing activation and historical pins.

This guide covers publication and continuation. The related
[native price coverage guide](./model-price-coverage-and-onboarding.md) covers
read-only verification, exact identities and execution readiness. Refreshing prices
is on demand and never invokes a paid model.

## Start the development environment

The registered verification command creates and removes its own disposable loopback
PostgreSQL and Redis services. Docker is required. The backend journey uses real
credentials, database stores, production source parsing/coordinator and a real
loopback HTTP MCP server. Only external provider metadata is synthetic. Never point
these tests at the ordinary development database or shared services.

```sh
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

For ordinary local use, start the documented development environment and opt-in MCP
listener with `pnpm dev:admin-mcp`. Follow the existing [admin MCP guide](./admin-mcp.md)
to issue a new credential with provider-price write permission. The issuance snapshot
must include `provider-prices.native-write` and `provider-prices.actualize-native.v1`.
Existing credentials retain their old flat authority; they do not gain native writes
by upgrading the application. A newly issued read-enabled credential can inspect and
verify prices. Keep the listener loopback-only and secrets out of logs and examples.

## API verification

1. Initialize and discover tools with the newly scoped credential. Confirm
   `actualize_model_prices` and `admin_apply` appear. The legacy flat preview tool
   cannot accept native rules; `preview_provider_prices_native_write` is separately
   action-scoped.
2. Call `actualize_model_prices` with an audited `reason`. Omit `models` to inspect
   real catalog entries, including unconfigured and retired identities, in pages of
   at most 50. Alternatively select at most 50 exact provider/model/meter triples.
   Explicit `models` cannot be combined with `offset`.
3. Inspect each result's source verification, stored-price comparison, publication
   and execution-readiness fields. `preview` contains old/proposed values and a
   five-minute ID. Native revisions contain `nativeRules`; legacy numerical amount
   fields are null. `unchanged` needs no publication. Retired/missing exact identities,
   failed sources and scheduled revisions remain explicit and preserve current data.
4. Publish each intended preview with `admin_apply` and a stable UUID `operationKey`.
   Reuse the same preview/key pair after interruption. Confirm the receipt and version
   through `providers_inspect` with read authority.
5. Apply the current page's intended previews before fetching later pages. When
   `nextOffset` is a number, call again with that `offset` and the same reason until
   `nextOffset` is null. Keep catalog configuration stable during traversal; restart
   at offset zero if models or credentials change.
6. Refresh again after publication. Identical monetary rules return `unchanged`;
   retrieval time alone does not publish another revision. A concurrent price change
   or expired preview must reject apply and require a fresh preview.

Expected result: exact source-backed native revisions are published once. Price
publication does not switch models, authorize generation or change customer tariffs.

## System verification

Reviewed adapters cover the current DeepSeek, EvoLink, Kie and OpenRouter catalog.
Conditional prices retain their conditions instead of being flattened or labelled
unsupported merely because their units differ. Unknown source shapes fail explicitly.
A retired model's old URL can point to a replacement; verify the exact model identity
and never substitute its new occupants' prices.

Native rules are authoritative. Old flat pins retain their original meaning, and new
native records leave old flat amount fields null so incompatible workers fail closed.
Native TS/SQL calculation, admission bounds and execution/settlement are separately
covered by financial execution tests in the same critical stage. Source verification
alone proves neither invoice reconciliation nor model availability.

## E2E coverage

- `official-price-preview-and-idempotent-publication` proves scoped real HTTP
  discovery, native source parsing with synthetic metadata, non-publishing preview,
  exact persisted publication/replay, stale rejection, unchanged refresh, audit and
  retained legacy pinned rates. It also rejects native rules through the flat writer.
- `bounded-discovery-across-growing-catalogs` proves a 51-model catalog returns
  50 then one native preview, reports continuation/count, includes each model exactly
  once and leaves publication to apply.

The same integration file verifies old/read-only authority exclusion, revocation,
expired previews and future price schedules. Its related coverage guide owns the
read-only verification scenario. Official-shape source fixtures cover all providers;
exhaustive native arithmetic and TS/SQL parity stay at lower layers.

## Expected failure and edge cases

- Missing, expired or revoked credentials: deny before tool work.
- Old pricing action snapshot: omit the native method and reject direct invocation;
  issue a replacement through admin rather than expanding old authority.
- Native payload through the legacy flat writer: reject without a preview or update.
- Retired or absent exact identity: report it; do not publish a replacement price or
  reactivate the retired route.
- Invalid/stale source, calendar coverage or native rule shape: preserve prices and
  report the source failure without guessing values or exposing raw credentials.
- Future price revision: preserve its scheduled publication.
- Stale or expired preview: fetch a new preview; never force apply.
- Interrupted apply: reuse the exact preview and operation key.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check model-price-actualization
pnpm docs:user-flows:check
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

The registered stage executes the exact mapped file on owned disposable services.
Skipped DB tests are missing evidence. Shared accounting changes also require the
complete critical gate before feature handoff.

## Troubleshooting

Missing methods usually require checking listener version and the credential's
immutable actions, not changing its existing row. Source failures require current
exact-model documentation or a reviewed adapter correction. Different native units
are not a reason to invent a character price. A verified tariff can coexist with a
blocked execution prerequisite; inspect those independent fields. Use correlation
references and never paste raw credentials or upstream response dumps.

## Cleanup

The critical runner stops only its owned services; the journey closes its own HTTP
listener and database client. Do not reset development databases, delete shared
volumes or revoke unrelated tokens. Ordinary price updates retain immutable history.
