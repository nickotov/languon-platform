---
type: adr
id: ADR-0051
title: Duration-based transcription authority and accounting
status: accepted
date: 2026-10-29
supersedes: 'None'
---

# ADR-0051: Duration-based transcription authority and accounting

## Context

Interactive workbook authors need uploaded audio transcription. Its provider bills
in audio duration, while existing text action envelopes use token limits. Reusing
a token field for milliseconds would weaken both financial provenance and worker
admission. Source audio duration, provider-reported usage, the customer tariff and
the operator's maximum expense are separate facts.

ADR-0045 already owns bounded customer holds, technical-failure refunds and
independent provider expenses. ADR-0049 owns native pricing and database-issued
call receipts. Transcription must extend these authorities rather than introduce
a wallet, worker pool or unguarded HTTP path.

Accepted as the necessary typed extension of ADR-0045/0049 within the user's
explicitly authorized transcription feature. This creates no default tariff,
provider activation or paid-service commitment. Independent bounded financial
and processing reviews and real restricted-role evidence are recorded in the
feature evidence; acceptance does not claim final feature verification.

## Decision

Add the closed native meter `audioInputMilliseconds` and provider-price kind
`audio-duration`. TypeScript and PostgreSQL evaluators apply the same native
rational arithmetic, applicability, minima and rounding rules. Duration actions,
attempts and call receipts carry explicit duration dimensions; their token limits
are zero. Existing token actions and text call observations retain their original
contracts.

A versioned transcription configuration pins an immutable native provider price,
an independently configured customer `creditsPerMinute` tariff, reviewed billing
evidence, and finite byte, duration and provider-expense bounds. Reuse the existing
speech capability's customer/operator funding policy. An explicit zero tariff is
supported; no tariff or credit-to-USD conversion is inferred from provider price.
Configuration publication uses existing admin authentication, recent-auth,
preview/apply and audit boundaries. Preparation does not activate a provider.

Private-audio processing also requires a separate code-owned engineering review
of the fixed provider/model/endpoint and its published data controls. Actual
organization/project data sharing is a fresh owner-attested fact, separate from
billing evidence, with a finite expiry and a private server-derived credential
pin. Rotation invalidates the attestation/preview. Dispatch and pre-HTTP checks
revalidate that pin; a configured key or price alone never authorizes processing.
The current global endpoint promises no region or external contractual approval.

A paid author operation first returns its maximum customer charge. Matching
explicit confirmation admits work and reserves the existing action's complete
hold. Verified source duration determines this customer tariff, rounded once to
milli-credits. Successful usable transcription charges the prepared tariff;
technical failure or cancellation refunds the customer. The source checksum,
asset/note ownership, configuration and price snapshots remain pinned.

The existing shared worker pool executes a dedicated typed transcription job.
Immediately before HTTP, a database function checks a live worker observation,
active owner/source, fenced lease, deadline, full customer hold, operator allowance
and unchanged configuration. It issues one receipt bound to the exact uploaded
bytes and their verified duration. The infrastructure adapter requires this permit
and revalidates the media; it cannot dispatch through a fallback authority. Work
that may have reached a provider is not automatically retried.

Verified source duration is an upper-bound input only for provider reservation.
Actual provider expense uses the issued receipt's optional provider-reported
duration under the pinned native rules. Convert decimal seconds exactly to integer
milliseconds, without rounding fractional milliseconds or using binary-float
multiplication as billing arithmetic. Missing or unrepresentable usage remains
unknown. A usable transcript can therefore have an unknown provider expense.
Known incurred overruns retain the existing guarded native-expense treatment.
Late observations may be retained without publishing cancelled output, reopening
work, charging a learner, or rewriting an immutable settled expense.

Deleting a source settles outstanding actions before erasing private payloads.
Account deletion uses the existing fenced cleanup authority, preserves financial
facts according to accounting retention policy and clears configuration creator
attribution without rewriting the audited reason or billing evidence. A content-
free operation receipt prevents a deleted operation from being recreated.

## Alternatives considered

### Treat audio milliseconds as input tokens

This would reuse arithmetic superficially but confuse token budgets, native
receipt validation and provenance. Separate dimensions preserve established text
semantics and reject cross-meter observations.

### Charge provider USD converted into learner credits

This would couple learner pricing to provider selection and invent a conversion
policy. The existing customer-tariff and provider-expense separation remains in
force.

### Infer billed usage from the uploaded file

Source-derived duration supports a conservative dispatch ceiling, not proof of
provider billing. It cannot establish provider minima, rounding or actual usage.
Unknown observations remain unknown.

## Consequences

### Positive

- Existing action, wallet, operator limits and financial receipts remain canonical.
- Transcription has a typed production composition test with fake external HTTP.
- Prepared audio, published transcripts and learner credits have distinct owners.

### Negative

- Duration-specific job, configuration and SQL authority require dedicated tests.
- Provider execution remains unavailable until credentials, a live executor,
  customer tariff and reviewed compatible native billing rules are all present.

### Risks / limitations

- Official [model metadata](https://developers.openai.com/api/docs/models/gpt-transcribe.md)
  currently lists `gpt-transcribe` at USD 0.0045 per minute. The published rate
  alone does not establish file-transcription minima or rounding. Missing billing
  rules block readiness; live-voice billing prose cannot establish file-STT rules.
- The [transcription API reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create.md)
  exposes optional duration usage. Provider expense can remain unknown after
  successful output. Public-tariff calculation is not invoice reconciliation.
- This record defines implementation boundaries, not authorization to activate
  a provider, configure a default customer price or make a paid API call.
- Remote-video transcript acquisition and course generation remain separate work.

## Related

- [ADR-0045: Bounded action accounting](./0045-action-accounting-and-provider-expenses.md)
- [ADR-0049: Native provider pricing](./0049-native-provider-pricing-and-accounting.md)
- [ADR-0050: Interactive workbook boundaries](./0050-interactive-workbook-content-and-learning-boundaries.md)
- [Feature 059](../../.agent/features/059-interactive-workbooks/FEATURE.md)
- [Feature execution plan](../../.agent/features/059-interactive-workbooks/EXEC_PLAN.md)
