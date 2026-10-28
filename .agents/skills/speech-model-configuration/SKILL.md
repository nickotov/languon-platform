---
name: speech-model-configuration
description: Add or update Languon speech provider/model definitions, language and voice mappings, or synthesis profiles with capability and compatibility evidence. Use for integrating a TTS model or configuring supported pronunciation languages. Do not use for learner playback UI, tariff-only administration, arbitrary model endpoints, or paid pronunciation benchmarks alone.
---

# Speech model configuration

For provider/model research, current pricing, cross-provider defaults or preparing
an authorized model switch, start with
[$ai-provider-model-onboarding](../ai-provider-model-onboarding/SKILL.md).
This skill owns the speech-specific capability and historical-profile steps; do
not duplicate the onboarding workflow or treat metadata as live synthesis proof.

## Establish the change

Read root/closest `AGENTS.md`, the active feature or improvement record, and
[ADR-0031](../../../docs/adr/0031-shared-pronunciation-and-retained-recordings.md)
and [ADR-0032](../../../docs/adr/0032-model-price-revisions-and-speech-settlement.md).
Use the root classifier; a new production provider/integration needs explicit
feature authorization. Existing authorization persists for its agreed scope.

Inspect the speech module and existing dictionary audio provider/environment
adapters with `$efficient-code-search`. Identify the public provider port,
configuration parser, immutable profile, model definition and consumers before
editing. Complete this step with the actual extension seam and affected tests.

## Verify the provider contract

Read current official documentation for the exact provider route and model, not
the upstream model's general marketing page. Record supported language codes,
voice constraints, input/output limits, settings, submission/polling states,
idempotency guarantees, error outcomes and result-download hosts. Distinguish
documented facts from unverified listening quality, access, prices and terms.

Compare the contract with an existing adapter. Extend curated configuration when
the protocol fits; add an adapter behind the provider port when it differs. Keep
SDKs/HTTP and credentials in infrastructure. Do not make learner requests select
arbitrary URLs, voices or model settings. Completion requires an explicit mapping
for every enabled application language and a bounded definition for every limit.

## Implement a versioned profile

Validate model/language/voice/settings configuration at the boundary. Availability
is the intersection of documented model support, configured voice, credentials
and operational enablement; cached approved recordings remain independently
usable. Do not add an application language merely because a provider supports it.

Publish a new configuration identity when synthesis behavior changes. Preserve
historical identities for already admitted tasks and result recovery; never
reinterpret a stored provider task using a replacement model or voice. Reusable
approved audio is looked up before the new default profile.

Publish customer-credit tariffs and provider USD prices as separate immutable
records through their current financial contracts. Preserve official billing
meters and rules; label operational estimates rather than presenting them as
actual rates. New prices do not edit old jobs or imply a USD-to-credit conversion.
Unknown submission outcomes require reconciliation rather than blind
resubmission. Complete this step with validated configuration, retained-profile
behavior and safe result-download handling.

## Verify without live charges

Use `$testing` for scoped capability/adapter tests and `$db-verification` when
profile persistence or job admission changes. Tests use deterministic fixtures
or a local fake provider, never paid requests. Cover unsupported/missing mappings,
settings limits, immediate/pending success, definitive failure, unknown submission,
malformed task identity, unsafe result URLs, historical polling and unchanged
cache reuse after a default switch.

For a fixture-only worked example, add a new revision with the same documented
test protocol and a single supported `fr` mapping, mark unsupported `tr` absent,
and assert old pending jobs still poll with their original revision while an
existing approved French recording requires no new submission. This exercises
configuration behavior without claiming real French pronunciation.

Update sanitized environment examples and
[speech operations](../../../docs/shared-pronunciation-operations.md). Record
official-source links and remaining live activation evidence in the active work
record. Credentials, paid listening samples, Russia connectivity and Selectel
conformance are not established by fixtures. Finish with affected checks and
review evidence; do not activate production or run a paid probe without scope
authorization.
