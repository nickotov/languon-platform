---
type: adr
id: ADR-0034
title: 'Speech model adapter registration'
status: accepted
date: 2026-10-14
supersedes: 'None'
---

# ADR-0034: Speech model adapter registration

## Context

The authorized shared pronunciation feature now adds Kie Gemini alongside Turbo.
Models differ in capabilities, voices, synthesis payloads and output containers.
Scattered conditionals risk mismatched availability, tariffs and retained jobs.

## Decision

Keep the existing application synthesis port and immutable admitted profile.
A reviewed speech-domain catalog defines model identities, language mappings,
voices, settings revisions and bounded input limits. Configuration validation and
speech-tariff discovery use that catalog. Infrastructure model strategies own
vendor request payloads; an infrastructure provider registry owns metadata-only
resolvers and worker adapter factories. Credentials and HTTP remain infrastructure.
Registration is code-owned and does not accept arbitrary learner endpoints.

Retained tasks resolve their original configuration/model/settings; changing a
local default never reinterprets them. Cached approved recordings remain model
independent and are resolved first. No automatic paid fallback. Synthesis-affecting
changes publish a new settings/configuration identity. Language instructions are
versioned synthesis policy, independent of display-label changes.

Validate bounded complete MP3 or PCM16 RIFF/WAV before storing audio. Preserve
DNS-pinned HTTPS, exact host allowlists, private object delivery and byte/duration
limits. Reject unsupported codecs instead of trusting MIME or transcoding implicitly.

## Alternatives considered

### Per-model conditionals across configuration, transport and pricing

Simple initially but duplicates capability decisions and makes historical polling
sensitive to replacement defaults. Shared catalog plus strategy registration gives
one reviewed semantic definition and isolates actual protocol differences.

### Dynamic provider plugins and arbitrary endpoint configuration

Unnecessary for current models and introduces a new trust/deployment boundary.
New providers implement the existing port and add reviewed credential/factory code.

## Consequences

### Positive

- Model additions do not change playback, billing orchestration or worker control.
- Capability validation and tariff discovery use the same model identities.
- Historical task recovery and cached recordings survive default changes.

### Negative

- New vendors still require reviewed credential validation and adapter code.
- Binary formats require explicit validation; arbitrary audio codecs are rejected.

### Risks / limitations

- Documented language support is distinct from actual pronunciation quality.
- Character-based operational cost estimates do not exactly meter token-priced TTS.
- Live access, provider terms, listening quality and production storage remain gates.

## Related

- [ADR-0031](0031-shared-pronunciation-and-retained-recordings.md)
- [ADR-0032](0032-model-price-revisions-and-speech-settlement.md)
- [Feature 042](../../.agent/features/042-shared-pronunciation-playback/FEATURE.md)
