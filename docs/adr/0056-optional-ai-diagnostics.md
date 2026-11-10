---
type: adr
id: ADR-0056
title: Optional AI diagnostics independent of routing and generation
status: accepted
date: 2026-11-10
supersedes: 'ADR-0046 matching diagnostic evidence for activation/publication/admission and manual-check recovery of runtime exclusions; ADR-0049 native activation check-evidence requirement; other routing, privacy, accounting and retry requirements remain active'
---

# ADR-0056: Optional AI diagnostics independent of routing and generation

## Context

A conversation prompt change invalidated a previously successful flow diagnostic,
causing normal generation to return 503 while credentials, published routing,
prices, budgets and workers remained configured. Mandatory paid checks coupled
service availability to diagnostic history, including prompt/schema edits and
switches to otherwise supported models. The conversation diagnostic only checks
a small synthetic response and cannot certify the entire production tool pipeline.

The user explicitly approved implementing diagnostic-only checks on 2026-11-10.
This approval supersedes the corresponding ADR-0046 policy; no new provider,
spending, privacy exception or financial authority is introduced.

## Decision

Quick-response and selected-flow checks are optional administrative diagnostics.
They use synthetic input, explicit bounded operator expense authorization and
existing audited accounting. Their results, absence, age and fingerprints never
authorize or prohibit routing publication, model switching, request admission
or worker dispatch, in development or production. Checks neither update runtime
circuits nor automatically enable or disable routes. No background paid checks
or per-request verification is introduced.

Supported, enabled routes remain subject to adapter/capability support, current
credentials, processing/privacy restrictions, provider prices, applicable customer
tariffs, configured financial limits and compatible execution workers. Provider
responses remain untrusted and are validated before persistence/publication.

Actual admitted provider failures retain reason-specific scope and bounded
60-second cooldown protection: authentication failures affect their provider,
model and transient availability failures affect their route, and schema failures
affect their route/flow/current execution fingerprint. Learner-induced invalid
output or rejected requests do not exclude a shared flow. Exclusions expire
automatically without a later manual check. A recent provider/route cooldown can
remain for at most 60 seconds after a credential/configuration change; this
preserves shared-failure protection without adding a credential-identity schema.
Preserve explicit emergency disable, admitted immutable candidates/prices,
safe retry limits, cancellation/fences and settlement protections. Recovery never
licenses a blind retry of an uncertain or already-streamed attempt.

Doctor reports prerequisite configuration/runtime readiness separately from
informational historical diagnostics. A diagnostic-only issue never causes a
nonzero readiness exit. Configuration readiness is not proof of live connectivity.

Retain historical diagnostic, dispatch, health and financial records unchanged.
Replace policy through a forward SQL migration and matching application code;
do not fabricate successful checks, reset history or add bypass flags.

## Alternatives considered

### Relax only local development or prompt hashing

Leaves production availability dependent on diagnostic history and keeps the same
failure mode for model switches and schema changes. Rejected.

### Automatically run checks on change

Creates implicit paid calls, operational complexity and another availability
dependency. Rejected.

### Remove configuration and runtime protections together

Would weaken unrelated privacy, financial and resource guarantees. Diagnostic
history has no authority over those existing requirements.

## Consequences

- Prompt edits and switches to supported configured models require no paid check.
- Operators may run a diagnostic and inspect response/failure, latency and cost.
- Misconfigured or unavailable providers can fail real requests; configuration
  checks, bounded runtime recovery, safe errors and monitoring remain necessary.
- A diagnostic pass cannot guarantee future availability or language quality.
- Database workers and application admission must use the same revised policy;
  changing the admin presentation alone does not implement this decision.

## Related

- [Prior routing decision](0046-admin-owned-text-ai-routing.md)
- [Routing design](../text-ai-routing-design.md)
- [Feature specification](../../.agent/features/062-optional-ai-diagnostics/FEATURE.md)
