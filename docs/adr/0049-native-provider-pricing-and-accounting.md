---
type: adr
id: ADR-0049
title: Native provider pricing and authoritative usage accounting
status: accepted
date: 2026-10-28
supersedes: 'ADR-0048 flat-only publication and initial provider-coverage restriction; existing source/MCP boundaries remain active'
---

# ADR-0049: Native provider pricing and authoritative usage accounting

## Context

The user required pricing support and verification for every real catalog model,
then explicitly chose native billing units, tiers and schedules over retaining
flat accounting estimates. Flat USD/token or USD/character records cannot represent
endpoint-specific rates, scheduled discounts, native-credit rounding or audio-token
speech. Merely adding parsers would leave application and database financial
authority inconsistent.

## Decision

Keep price discovery behind reviewed ai-credits infrastructure adapters and use
existing real text/speech catalogs. Public metadata verification does not require
generation credentials and includes retired identities. Distinguish source
verification, stored-price comparison, publication and execution readiness. An old
product URL naming a replacement model never establishes the old model's price.

Extend immutable provider-price revisions with a strict, versioned `nativeRules`
contract. It contains bounded alternative price cards, explicit endpoint/tier,
token-range and absolute UTC-window applicability, closed usage meters, exact
decimal rates, component/request minima and explicit rounding. Preserve native
currency and rational USD conversion. Rates keep their published precision;
internal settlement still rounds once to whole USD micros. Official billing rules
apply per provider call before the final attempt-level micro conversion.

Native rules are authoritative. Keep legacy flat amount fields null on native
revisions, so old readers/workers fail closed. Existing flat revisions and admitted
snapshots retain their original interpretation. Add the speech-token meter and
nullable usage/identity persistence through additive migrations; never reinterpret
old jobs or charge learners retroactively.

Implement matching pure TypeScript/PostgreSQL evaluation. Reserve a conservative
maximum across reachable cards and bounded calls; never present that ceiling as
actual expense. Actual expense comes from reported USD, reported credits under a
pinned conversion, or unambiguously applicable public tariff and usage. Missing
evidence remains unknown. Published-tariff calculation is not invoice reconciliation.

The database issues native text-call receipts before provider HTTP. Trusted SDK
observations checkpoint each receipt before a later call can reclaim unused
allowance. Settlement verifies receipt identity, usage bounds and exact replay,
then freezes the observations. Late observations may be retained for an issued
receipt without authorizing HTTP, publishing output or rewriting an immutable
settled expense. Existing typed lease/fence and refund rules remain authoritative.

Preserve full known native expense if a provider unexpectedly exceeds a reserved
bound. Guard the exception with authoritative expense provenance, consume the
actual amount and include active overrun deltas in future admission. This does
not relax dispatch limits or authorize overspending; it prevents loss of incurred
facts and avoids trapping learner refunds. Legacy overrun rejection remains.

Native gateway requests enforce text-only input before omitting an irrelevant
image-price filter. Existing privacy, parameter, retry and cost constraints remain.
Scope a new request-policy fingerprint to native prices; native activation requires
matching check evidence while unchanged legacy fingerprints remain usable.

Expose read-only `verify_model_prices` and native actualization through new
issuance-scoped actions. Keep the old flat writer separate. Reuse the existing
preview/apply/version/audit/replay boundary. Price publication does not activate
models, change customer tariffs, issue credentials or run paid checks.

Kie Gemini speech prices and consumed-credit observations are supported in their
native units. Upstream model limits do not prove a broker task spending cap;
dispatch requires a reviewed task-bound profile. Verification must expose this
readiness gap rather than fabricate a character rate or a provider guarantee.

Compose the general provider/model onboarding skill with the existing speech
skill. Require current official identity/pricing, bounded compatible settings and
material questions; distinguish configured, priced, ready-to-check and activated.

This follows the existing accounting/MCP architecture and the user's selected
scope. It introduces no new deployment, paid service or production activation.

## Alternatives considered

### Force all sources into flat estimates

Would discard billing units and conditions and can misstate actual expense. The
user explicitly chose native accounting instead.

### Select the cheapest endpoint or use reservation as actual cost

Neither proves which endpoint served a call or what was charged. Preserve
execution facts and unknowns instead of inventing an exact charge.

### Generic expression engine or live research during learner requests

Arbitrary expressions and unbounded external work would expand the trust and
latency boundary. Use reviewed adapters and a closed deterministic rule contract.

## Consequences

### Positive

- Every current real model has source coverage and an honest verification result.
- Native billing and immutable historical accounting coexist.
- Provider onboarding includes actual price support rather than a second model list.

### Negative

- Financial readers, SQL authority and workers must be deployed compatibly before
  native publications are enabled.
- Schedule calendars, promotional expiry and provider contract changes need review.

### Risks / limitations

- Source metadata, provider-reported usage and public tariffs are not invoices.
- A retired identity or missing enforceable task bound cannot be made executable
  by a successful price lookup.
- No scheduler or production rollout is authorized by this decision.

## Related

- [ADR-0045](0045-action-accounting-and-provider-expenses.md).
- [ADR-0046](0046-admin-owned-text-ai-routing.md).
- [ADR-0047](0047-delegated-local-admin-mcp.md).
- [ADR-0048](0048-official-provider-price-actualization.md).
- [Feature 058](../../.agent/features/058-model-price-coverage-and-onboarding/FEATURE.md).
- [Native pricing guide](../user-flows/model-price-coverage-and-onboarding.md).
