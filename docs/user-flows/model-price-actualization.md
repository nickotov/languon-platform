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
    - apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
    - apps/backend/src/modules/speech/domain/speech-models.ts
e2e_command: model-price-actualization
e2e_tests:
    - apps/backend/tests/integration/database/model-price-actualization.journeys.test.ts
e2e_scenarios:
    - official-price-preview-and-idempotent-publication
    - bounded-discovery-across-growing-catalogs
related_features:
    - admin-mcp
    - ai-accounting
    - admin-text-ai-routing
---

# Model price actualization

## What this verifies

An authorized MCP client fetches official provider price metadata, prepares exact
price previews and publishes immutable provider-cost revisions through the existing
apply operation. Customer credit tariffs, routing and historical admitted price
snapshots remain separate. This is an on-demand refresh, with no recurring scheduler
or paid model generation. New catalog models reuse their provider's reviewed source
adapter; new provider families need an adapter before prices can refresh.

## Start the development environment

The registered verification command creates and removes its own disposable loopback
PostgreSQL and Redis services. Docker is required. The backend journey uses real
credentials, database stores, the production price source/coordinator and a real
loopback HTTP MCP server. Only external provider metadata is synthetic. Never point
these tests at the ordinary development database or shared services.

```sh
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

For ordinary local use, start Languon's documented development environment and opt-in
MCP listener with `pnpm dev:admin-mcp`. Follow the existing
[admin MCP guide](./admin-mcp.md) to issue a new token with provider-price write
permission. Existing tokens retain their issuance-time action snapshot and therefore
do not gain this tool automatically. Do not paste token secrets into examples,
logs or chat. Keep the listener loopback-only.

## API verification

1. Initialize the MCP connection and discover tools with the new scoped token.
   Confirm `actualize_model_prices` appears alongside `admin_apply`.
2. Call `actualize_model_prices` with an audited `reason`. Omit `models` to inspect
   configured active text and speech catalog models in pages of at most 50. The
   response includes `totalModels` and `nextOffset`; alternatively select at most
   50 exact provider/model/meter triples from that catalog. Explicit `models`
   cannot be combined with `offset`.
3. Inspect each result. `preview` includes the exact old/proposed values and a
   five-minute preview ID; `unchanged` requires no publication. `unsupported`,
   `unavailable` and `skipped` preserve the existing price. The tool returns
   `applied: false`; fetching never publishes provider prices by itself.
4. Publish each intended preview with `admin_apply`, using a stable UUID
   `operationKey`. Retry the same preview/key pair after interruption. Confirm the
   receipt and new version through `providers_inspect` with a read-enabled token.
5. Apply the current page's intended previews before continuing so they do not
   expire while later pages are fetched. If `nextOffset` is a number, call
   `actualize_model_prices` with that `offset` and the same reason, then repeat
   until `nextOffset` is null. Keep the catalog configuration stable during a
   paged refresh; restart discovery if models or provider credentials change.
6. Refresh again after publication. Identical numerical rates return `unchanged`.
   Changing a price between preview and apply must reject the stale preview.

Expected result: only compatible official rates create previews. No arbitrary URL,
provider secret, paid request, customer tariff update or route activation occurs.

## System verification

Official OpenRouter catalog and endpoint metadata must agree on representable flat
rates. Per-token rates convert exactly to USD per million tokens, and supported
character rates convert to USD per 1,000 characters. Missing cache prices remain
unknown. Conditional tiers, endpoint variation, incompatible units or precision
produce explicit unsupported results rather than estimates. Providers without a
reviewed source adapter retain their manually published prices.

The mapped journey uses a new synthetic model ID to prove discovery is by exact ID,
not a duplicate pricing model list. It retains an old pinned price, publishes a new
revision once despite replay, reads back the new rate and confirms the old revision
and pinned value stay unchanged. This proves immutable price publication and
snapshot retention; the broader execution stage retains actual admission and
settlement coverage for existing generation capabilities.

## E2E coverage

- `official-price-preview-and-idempotent-publication` proves scoped HTTP discovery,
  real source parsing with synthetic external metadata, non-publishing preview,
  exact persisted publication, replay without another revision, stale rejection,
  unchanged refresh, audit and historical pinned-rate retention.
- `bounded-discovery-across-growing-catalogs` proves a 51-model catalog returns
  50 then one preview through real HTTP, reports continuation and total count,
  includes every model exactly once and leaves publication to apply.

The same integration file verifies old/read-only token exclusion, revocation before
metadata fetch/apply, expired previews and preservation of scheduled future prices.
Pure conversion, source errors, malformed metadata and exhaustive pricing variants
remain in focused unit tests. Existing admin MCP browser coverage owns token form
rendering and issuance; this feature adds no application screen or control.

## Expected failure and edge cases

- Missing, expired or revoked credential: deny before tool execution.
- Old token lacking the new action, or missing write authority: omit the tool and
  deny direct invocation. Issue a replacement through admin; MCP cannot self-expand.
- Unsupported provider/model, ambiguous tiers or incompatible meter: report the
  model explicitly and retain its existing price.
- Unavailable/invalid official metadata: preserve rates and report failure without
  leaking upstream response bodies or credentials.
- Future price revision already scheduled: skip it instead of overriding intent.
- Stale or expired preview: refresh and review a new preview. Never force apply.
- Interrupted apply: reuse the same preview and operation key to receive its receipt.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check model-price-actualization
pnpm docs:user-flows:check
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

The registered execution stage includes the exact mapped integration file and
requires executed tests. A test file skipped because disposable configuration is
absent is not successful journey evidence. Shared financial changes also require
the complete critical gate before feature completion.

## Troubleshooting

If discovery omits the tool, inspect the token's permission and immutable allowed
actions; replace an older credential through admin. Unsupported rates need a
reviewed provider adapter or compatible pricing contract, not a guessed rate.
Unavailable results require checking official metadata availability and bounded
network access. A stale preview requires rereading the current version. Use
correlation references for errors, never raw credential or provider response dumps.

## Cleanup

The critical runner stops only its owned services; the journey closes its own HTTP
listener and database client. Normal local use leaves existing infrastructure and
prices intact. Do not reset ordinary development databases, delete shared volumes
or revoke unrelated real tokens to reproduce this journey.
