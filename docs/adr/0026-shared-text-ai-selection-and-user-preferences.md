---
type: adr
id: ADR-0026
title: Shared text AI selection and user preferences
status: accepted
date: 2026-10-04
superseded_in_part_by: 'ADR-0037: contextual-conversation Auto selects compatible Flash; other tasks unchanged; ADR-0038 retired DeepSeek Chat/arbitrary legacy model execution; ADR-0046 learner model selection replaced by administrator-owned text routing'
supersedes: 'ADR-0021 configuration ownership and global-only selection; other routing guarantees remain active'
---

# ADR-0026: Shared text AI selection and user preferences

## Context

The authorized BL-005 prerequisite to sentence practice introduces a learner model
preference across text tasks. Dictionary-only configuration ownership and a
global-default revision cannot represent a different model for each learner
without changing admitted work. Existing credit rates, worker capabilities and
curated-provider trust must survive this ownership change.

## Decision

The backend `text-ai` module owns the reviewed catalog, user Auto/explicit
preferences, selection policy and provider execution information. Its transaction
participant resolves the authenticated actor's choice for a requested registered
capability. Existing configuration tables may retain their physical names; admin
authorization and audit remain administration-owned. Dictionary and learning
modules retain prompts, agents, typed work, results and orchestration.

An absent preference is Auto. Auto resolves exactly the platform default at new
admission. Explicit selection must be curated, enabled, compatible and operationally
ready; missing credentials, unsupported work or unavailable workers fail without
fallback. Preserve disabled choices so the learner can deliberately change them.
Public model summaries expose labels, capabilities and reviewed relative credit
rates, never credentials, URLs, credential names or worker internals. Preferences
are learner-owned, versioned and erased during account purge.

Admission rechecks authority and same-key replay before resolving current policy.
Each newly selected dictionary job pins a versioned execution snapshot including
model, provider, adapter, limits and pricing while retaining configuration revision
provenance. Preference/default/rate changes affect future work only. Historical
jobs retain their previous snapshot path. Retried jobs never resolve today's
preference, and supported historical pricing cannot be rejected simply because
the current catalog rate changed.

New worker observations advertise selected-execution support. Admission requires
matching current capability evidence; a transaction-local database guard prevents
old workers from claiming selected jobs. Rollout expands schema and worker support
before admission activation; rollback disables new admissions and drains pinned
jobs on supported workers. Existing managed-routing and credit-enforcement gates
and pricing stay unchanged.

Trusted provider/model resolution is infrastructure. Application ports exchange
plain types; no generic public prompt/schema/tool executor is introduced. Later
learning operations register reviewed capabilities and use the same selection
boundary without importing dictionary application internals. Text preference
does not define TTS, OCR, subscriptions or new allowance policy.

This narrowly supersedes ADR-0021's configuration ownership and global-only
selection. Its curated endpoints, server-side credentials, immutable routing,
bounded adapters, fail-closed readiness and capability discipline still apply.
The choice implements the authorized product preference within established DDD
and provider architecture, without adopting a framework, provider, pricing or
deployment strategy.

## Alternatives considered

### Change the global default on each user request

This couples users, changes admin configuration, generates excessive revisions
and risks interpreting one learner's work through another learner's preference.

### Resolve a mutable preference at dispatch

Queued work and retries change model, limits and price after admission and can
violate the reserved credit envelope.

### Generic AI execution and universal job registry

This merges task contracts and orchestration unnecessarily. Shared selection and
provider infrastructure with module-owned typed jobs establishes the needed seam.

## Consequences

### Positive

- Models are learner-selectable while admitted work remains immutable.
- Dictionary and later learning tasks share selection without business coupling.
- Curated provider trust and existing credit policy remain intact.

### Negative

- Snapshot versions and capability checks add compatibility work.
- Unsupported explicit choices need actionable UI recovery in a later delivery.

### Risks / limitations

- Schema expansion alone is insufficient: every active worker must be capable.
- Historical adapters/pricing must remain usable until admitted work drains.
- Backend completion does not implement the deferred profile preference UI.

## Related

- [ADR-0012](0012-dictionary-worker-and-document-ingestion.md)
- [ADR-0021](0021-dictionary-ai-provider-routing.md)
- [ADR-0022](0022-ai-credit-ledger-and-generation-settlement.md)
- [Architecture](../architecture.md)
- [Feature 035](../../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md)
- [Backend-first delivery plan](../sentence-practice-implementation-plan.md)
