---
type: adr
id: ADR-0021
title: 'Dictionary AI provider routing'
status: accepted
date: 2026-09-23
supersedes: 'None'
---

# ADR-0021: Dictionary AI provider routing

## Context

Dictionary generation previously used one process-level model configuration.
Administrators need to choose a supported provider and model without changing
already admitted work. The worker must keep Mastra as the agent layer, enforce
provider-specific request limits, preserve budget accounting, and avoid exposing
credentials or arbitrary outbound destinations through the admin application.

## Decision

Dictionary AI configuration belongs to the dictionaries module. The current
selection points to an immutable revision containing a curated provider/model
identity, adapter revision, credential reference, supported formats, per-call
limits, aggregate job budget, and enabled model IDs. Generation admission pins
that revision and copies its budget onto the job in the same transaction.
Idempotent replay returns the original job before consulting the current default.

The worker resolves the pinned revision through an infrastructure adapter and a
bounded cache. A retry of the same job uses the same revision. Disabling a model
affects future admission while admitted jobs can drain. Missing credentials or
unsupported revisions fail without falling back to another provider. Legacy jobs
without a revision use the existing environment configuration during migration.

The provider catalog is code-owned. Admin requests may select catalog IDs but
cannot supply URLs, headers, keys, credential names, or arbitrary model IDs.
Credentials remain environment or deployment secrets. The admin API returns only
configured/missing and bounded health observations. Text generation and TTS use
separate settings and budgets.

Workers publish sanitized, expiring observations keyed by bounded worker/release
identity plus provider/model. Admin reads aggregate the active observations and
fail closed when any current worker reports unavailable. Route reachability that
does not authenticate a credential or model remains unverified. A database
trigger separately requires a transaction-local managed-routing capability for
the queued-to-running transition of pinned jobs, preventing an older worker from
executing them under its environment default.

Provider selection is global in this revision. The job continues to retain its
owner and input/output usage, providing the attribution needed for a later
per-user allowance feature without defining that product policy here.

Rollout follows ADR-0012 capability discipline: expand persistence and worker
support before activation, prove all active workers can recognize managed jobs,
then enable admission. Rollback drains pinned revisions before their adapter or
credential reference is retired.

## Alternatives considered

### Mutable provider lookup at dispatch

This is smaller but queued jobs change behavior and price when an administrator
changes the default. Retries can also use different models, which breaks
determinism and budget reservations.

### Arbitrary OpenAI-compatible configuration in admin

This makes provider onboarding appear dynamic but exposes an SSRF and credential
selection boundary and cannot establish structured-output compatibility. New
providers instead add a reviewed catalog entry and adapter contract tests.

### Provider-specific application services

Calling vendors directly from admission or HTTP handlers bypasses the existing
Mastra agents and duplicates validation, cancellation, retry, and usage handling.

## Consequences

### Positive

- Queued work is stable across default changes and retries.
- Provider credentials and outbound URLs remain trusted server configuration.
- OpenAI-compatible providers can reuse one adapter after compatibility tests.
- Provider/model usage stays attributable to the owning generation job.

### Negative

- Adding a provider requires a code and deployment change.
- Immutable revisions and legacy compatibility increase persistence and rollout
  complexity.
- Admin health can be stale and must remain distinct from saved configuration.

### Risks / limitations

- OpenAI-compatible does not guarantee JSON Schema behavior; every catalog model
  needs contract evidence before activation.
- Mixed worker releases can misroute managed jobs unless activation uses the
  worker capability gate described by ADR-0012.
- Provider-reported token usage may be absent. Conservative settlement must be
  identified separately from reported usage before it is used for billing.

## Related

- [ADR-0010](./0010-admin-application-and-authorization.md)
- [ADR-0011](./0011-dictionary-persistence-and-composition.md)
- [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md)
- [ADR-0020](./0020-dictionary-pronunciation-audio.md)
- [Feature 028](../../.agent/features/028-ai-provider-management/FEATURE.md)
- [Feature 028 ExecPlan](../../.agent/features/028-ai-provider-management/EXEC_PLAN.md)
