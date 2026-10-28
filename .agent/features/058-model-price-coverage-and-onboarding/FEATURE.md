# Complete provider pricing and model onboarding

Status: Complete
Owner: Codex
Created: 2026-10-28

## Problem and authorization

Feature 057 implemented only flat OpenRouter price fetching. The user explicitly
corrected this scope: all catalog models need pricing support and verification;
onboarding must research real providers/models, actual prices and switch-ready
defaults through a documented reusable skill. This continues the earlier explicitly
authorized pricing feature. On 2026-10-28 the user chose extending pricing AND
accounting to native billing units, tiers and schedules rather than retaining flat
estimates. This authorizes the necessary financial contracts, persistence and
execution integration, not production activation or paid probes.

## Acceptance criteria

- AC-1 — Every real provider/model in the existing catalogs has reviewed source
  coverage, including eight active entries and one retired Kie text entry. Public
  metadata verification is independent of credentials; exclude synthetic fixtures.
  Exact identity, rates, units, component minima/rounding, tiers, schedules and
  source provenance are retained. Retired/missing identities report that fact and
  never inherit a replacement model's price.
- AC-2 — MCP verify_model_prices supports one/selected/all models with bounded
  pagination and distinguishes source verification, stored-price comparison,
  publication readiness and execution readiness. It creates no financial writes,
  previews, model calls or routing activation. New read action remains issuance-scoped.
- AC-3 — Actualization can prepare every supported native tariff through a new
  immutable write action, preserving preview/apply/version/replay/audit controls.
  Old flat writer and old credentials never acquire broader native authority.
  Unknown source shapes, stale calendars and failed source requests fail explicitly
  without invented estimates or replacement-model rates.
- AC-4 — A closed versioned native-rule contract and exact TS/SQL evaluators honor
  native currency conversion, precision, component minima/rounding, context tiers,
  time windows and endpoint/tier applicability. Admission reserves a faithful upper
  bound; settlement reports actual resolved expense or explicit unknown, never the
  reservation as actual. Preserve legacy revisions and admitted snapshots.
- AC-5 — Real text/probe/speech execution carries validated provider usage and
  endpoint/tier/reported-USD or consumed-credit evidence, fenced and replay-safe.
  Kie token speech preserves native pricing and reported credits. Without a
  reviewed finite task bound, execution readiness is blocked, not represented as a
  per-character rate or an enforced provider cap. Customer credit tariffs remain
  separate and unchanged.
- AC-6 — Unified ai-provider-model-onboarding skill researches current primary
  sources, verifies real exact identities, integrates existing/new providers/models
  when authorized, derives bounded defaults from actual capabilities/app profiles,
  asks material questions, and accurately distinguishes configured/priced/test-ready/
  active. Reuse speech-model-configuration and document invocation in development,
  agentic-development and skills docs. Validate packaging and independent behavior.
- AC-7 — Source/parser/domain/contract tests, real disposable DB TS/SQL parity and
  execution/accounting journeys, static/build checks, current user-flow mappings,
  full critical gate, independent completion/security review and targeted independent
  testing establish the final tree. Public metadata smoke is not paid execution proof.

## Scope and exclusions

Cover all current real catalog models: DeepSeek Flash; EvoLink Luna; OpenRouter
Luna/Qwen/Gemini/ElevenLabs; Kie ElevenLabs/Gemini3.8 speech and retired Gemini2.5
text identity. No arbitrary new provider/model is added merely to exercise the
skill. No recurring scheduler, production rollout, real activation, secret issuance,
paid generation, tariff policy change or rewriting old financial history.

## Constraints and source findings

Native revisions are authoritative and legacy numerical amount fields remain null,
so old readers/workers fail closed. Optional nativeRules preserve old flat snapshots.
Speech-tokens needs an additive meter constraint change and usage persistence.
Evo uses integer UC before rational USD conversion; published USD decimals are
reference display. DeepSeek calendar coverage is bounded and sourced to official
2026 holidays; never assume future dates. Kie Gemini25 oldURL now names different
models. Kie Gemini38 reports creditsConsumed but no documented per-task token cap;
upstream model limits alone do not establish broker task bounds.

## Documentation and verification surfaces

Update docs/user-flows/model-price-actualization.md and affected speech/accounting
or routing guides when observable behavior/source mapping changes. New canonical
guide model-price-coverage-and-onboarding covers the API/system journey; skill
invocation is documented in development rather than fabricated product UI.
Any UI needed to avoid blank/misleading native prices requires real browser proof.
Supersede only the flat-only portion of ADR-0048 through a new indexed ADR.

## Open decisions

No further product choice pending. User selected full native accounting. Preserve
hard spending bounds and fail closed when provider contracts cannot substantiate
execution readiness; show the specific prerequisite instead of claiming support is
absent or silently relaxing operator limits.
