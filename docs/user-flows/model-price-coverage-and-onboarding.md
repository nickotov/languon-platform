---
feature: model-price-coverage-and-onboarding
title: Native provider pricing coverage and onboarding
status: current
last_verified: 2026-10-28
surfaces:
    - api
    - system
source_paths:
    - packages/contracts/src/ai-provider-prices.ts
    - packages/contracts/src/provider-native-pricing.ts
    - apps/backend/src/modules/ai-credits/application/provider-price-source.ts
    - apps/backend/src/modules/ai-credits/infrastructure/pricing/**
    - apps/backend/src/modules/ai-credits/domain/native-provider-pricing.ts
    - apps/backend/src/modules/admin-mcp/**
    - apps/backend/src/infrastructure/admin-mcp/**
    - apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
    - apps/backend/src/modules/speech/domain/speech-models.ts
    - .agents/skills/ai-provider-model-onboarding/**
    - .agents/skills/speech-model-configuration/**
e2e_command: model-price-actualization
e2e_tests:
    - apps/backend/tests/integration/database/model-price-actualization.journeys.test.ts
e2e_scenarios:
    - native-price-verification-without-publication
    - native-price-publication-and-legacy-snapshots
related_features:
    - model-price-actualization
    - admin-mcp
    - ai-accounting
    - admin-text-ai-routing
    - shared-pronunciation-playback
---

# Native provider pricing coverage and onboarding

## What this verifies

Read-only MCP verification covers every real catalog identity, including unconfigured
and retired entries. Official billing rules and source evidence remain separate from
stored-price comparison, price publication and execution readiness. Native pricing
supports text tokens, characters and speech/audio tokens, currencies, rounding,
component minimums, endpoint/context tiers and bounded schedules.

The developer onboarding workflow researches exact providers/models and prepares
bounded, compatible defaults through the unified
[`ai-provider-model-onboarding` skill](../../.agents/skills/ai-provider-model-onboarding/SKILL.md).
See [development usage](../development.md) for invocation. Research, a verified price,
a published price, readiness checks and actual route activation are distinct outcomes.

## Start the development environment

Use the existing critical runner, which owns disposable loopback PostgreSQL/Redis
and refuses normal development targets. The mapped pricing journey runs a real
loopback MCP server, SDK transport, credentials, database stores and native source
parser; only external pricing metadata is deterministic. Docker is required.

```sh
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

For normal local use, start the documented development environment and
`pnpm dev:admin-mcp`. Create a replacement credential through the existing
[admin MCP flow](./admin-mcp.md): `providers.read` newly snapshots
`provider-prices.verify`. Add provider-price write permission only when publishing
is intended; native writes and actualization have their own immutable action IDs.
Old credentials gain no new methods or write contracts automatically. Keep secrets
in the configured environment and the listener on loopback.

## API verification

1. Discover `verify_model_prices` with the newly issued read credential. An old read
   credential must omit it and reject direct invocation. A read-only credential must
   not expose `actualize_model_prices` or native-price previews.
2. Invoke `verify_model_prices` with a `reason`. Omit `models` for all real catalog
   entries; use `nextOffset` continuation in pages of at most 50, or select exact
   provider/model/meter triples. Explicit `models` and `offset` are mutually exclusive.
3. Inspect `catalog.configured` and `catalog.retired`, source `verification`,
   `comparison`, `publication`, `pricing.nativeRules` and `executionReadiness`.
   Missing credentials do not prevent public price research. A retired/missing exact
   identity must be explicit; a replacement page or similarly named model is not its
   current price.
4. Confirm verification leaves price revisions and preview inventory unchanged.
   Inspection audit records are expected. Repeating verification after a separately
   authorized publication should report `matches` without another publication.
5. To update prices, use the separately scoped `actualize_model_prices` and
   `admin_apply` flow in the [publication guide](./model-price-actualization.md).
   Native revisions keep old numerical amount fields null. Replays produce one
   revision and old pinned flat snapshots retain their old cost meaning.

Expected result: verification is usable without pricing-write authority, returns
explicit source/readiness outcomes and never generates, publishes or switches models.

## System verification

Current real catalog coverage includes DeepSeek, EvoLink, Kie and OpenRouter.
Source fixtures establish each official response format and exact identity mapping.
Conditional rates are represented in native rules; they are not rejected merely for
being tiered or token-based. Invalid/changed source semantics remain explicit errors.
DeepSeek holiday coverage and promotional validity have finite, reviewed boundaries.
EvoLink native units retain conversion and component-rounding order rather than using
rounded USD display values as exact source amounts.

Kie's retired Gemini 2.5 text identity has no current matching quote; its old product
URL now describes replacement IDs. Verification reports that mismatch. Kie Gemini
speech has verified native input/audio-token tariffs and reported-credit expense
support, but upstream model token limits do not establish a broker task spending
cap. Its new native dispatch stays blocked until a reviewed task bound exists. Price
support must not be confused with readiness to spend operator funds.

Financial tests separately establish exact TS/SQL parity, safe reservation bounds,
per-call native minima, observed cost/credit provenance, immutable pins and fenced
settlement. Missing or ambiguous execution evidence yields unknown expense instead
of using a reservation ceiling as actual cost. These checks use fake external HTTP;
no paid probe or invoice accuracy is implied.

## E2E coverage

- `native-price-verification-without-publication` proves real HTTP discovery/action
  isolation for old and newly issued read credentials, verification without a
  generation credential, explicit retired exact-identity absence, independent
  comparison/publication/readiness fields, audit and zero preview/price mutation.
  It verifies a later published native price reports `matches` without another write.
- `native-price-publication-and-legacy-snapshots` proves native preview/apply/replay,
  exact persisted native cost meaning, rejection by the legacy flat writer and
  preservation of a historical flat pinned revision.

The shared file also retains pagination, expiry, scheduled-publication and revocation
coverage in the existing price-actualization guide. Source adapters and native
accounting matrices belong in focused parser/domain/disposable-DB execution tests.
Skill packaging and read-only agent decision probes establish developer guidance;
they do not replace real application proof or authorize paid checks.

## Expected failure and edge cases

- Old issuance snapshot or missing read permission: no new verification method.
- New read-only credential: verification allowed, financial preview/apply denied.
- Missing generation credentials: pricing can verify; readiness reports the gap.
- Retired/missing exact model: report source identity failure and retain historical
  prices; do not borrow replacement rates or reactivate a route.
- Source outage, schema change, expired calendar/promotion or unsupported new rule:
  report failure and preserve stored prices. A new provider needs a reviewed adapter.
- Native price without finite provider-backed execution bounds: priced but blocked,
  not silently projected to a character estimate.
- Unknown reported usage or unresolved price variant: actual expense stays unknown;
  the reserved upper bound is not fabricated as a measured charge.
- Stale/expired preview or interrupted apply: use the established refresh/replay rules.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check model-price-coverage-and-onboarding
pnpm docs:user-flows:check
pnpm test:e2e:critical -- --flow ai-execution-contracts
```

The complete critical gate remains required for shared accounting/execution changes.
No skipped required test is accepted as evidence. Onboarding-skill validation uses
the established repository skill validator and independent bounded decision probes;
see feature evidence for those commands and their exact limits.

## Troubleshooting

If a method is missing, distinguish an old listener or old credential action snapshot
from an unimplemented adapter. Inspect exact IDs and official source evidence before
changing a catalog entry. Pricing verification cannot fix missing credentials,
processing-policy review, task bounds or compatibility checks. A language-model
research answer is not a substitute for an audited exact publication preview.

## Cleanup

Stop only owned verification listeners and containers. Preserve application data,
old price revisions, admitted snapshots and unrelated credentials. The runner closes
its ephemeral services; ordinary public metadata verification needs no data cleanup.
