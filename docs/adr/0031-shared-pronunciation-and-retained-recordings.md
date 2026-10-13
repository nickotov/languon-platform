---
type: adr
id: ADR-0031
title: 'Shared pronunciation and retained recordings'
status: accepted
date: 2026-10-13
supersedes: 'ADR-0020 dictionary ownership, deduplication, development storage and deletion; ADR-0023 pronunciation erasure; ADR-0027 copied-content erasure only for retained speech derivatives'
---

# ADR-0031: Shared pronunciation and retained recordings

## Context

Feature 042 has explicit user authorization for cross-user pronunciation reuse,
on-demand speech in dictionary and sentence learning, private S3 storage, and
indefinite retention of successful audio and its normalized text. That changes the
owner-scoped derived-data lifetime in the existing pronunciation implementation.
The user approved retaining these derivatives after account/content deletion,
with administrative removal as the only successful-recording erasure mechanism.

## Decision

A focused backend speech module owns canonical text, immutable recordings,
generation jobs and object inventory. Dictionaries and learning own saved-source
resolution and live authorization through application ports. Extend the existing
worker process and typed provider/storage ports rather than introducing a generic
media or universal AI-task service.

Canonical identities use versioned conservative Unicode NFC/whitespace
normalization and an opaque server HMAC. Preserve language, case, accents and
punctuation. Recordings separately pin provider/model/voice/settings/format and
pronunciation-policy revisions. Existing approved recordings are selected before
new defaults. Database uniqueness and transactional admission coordinate one
provider submission for concurrent equivalent requests across actors.

The server resolves saved references; there is no arbitrary-text synthesis API.
Authenticated owners/shared readers retain current source access. Hidden reference
answers and unchecked/draft learner answers are not playable. Private recordings
are delivered only through freshly authorized backend requests; object/provider
URLs and canonical identities are not exposed to learners. Reuse does not grant
access to another actor's source or reveal its ownership.

Successful canonical text and recordings remain indefinitely, including after
source or account removal. Remove bindings and account associations; retain no
account ownership link on canonical text/recordings. The retained text may itself
contain personal information: this is an explicit product retention choice, not
an anonymization claim. Update account/content deletion copy accordingly.
Financial/work state is reconciled before removing actors; deleted accounts can
never receive a late debit. Existing deletion journal, backup and unrelated
content-erasure policies remain in force.

Only an authorized administrator may erase a successful recording. Confirmation
covers current affected binding counts and optimistic version checks. Immediately
make playback unavailable, then delete all S3 versions through durable inventory
and retryable cleanup. Audit the operation without copying normalized text into
logs. Automatic cleanup covers failed/temporary uploads, not age-based expiration
of successful recordings.

Production uses private Selectel-compatible S3 with a dedicated speech prefix and
scoped credentials. Standard development uses a separate persistent MinIO
container and private versioned speech bucket, with loopback-only API/console and
bucket-scoped application keys. Disposable tests use separate projects/buckets;
fixture speech remains the default and never claims pronunciation quality.
PostgreSQL byte storage remains a migration/test compatibility adapter, not the
standard development setup.

Migration is additive, preserves existing audio without synthesis and fences old
workers before transferring job ownership. Known tasks retain original identities;
unknown submissions are reconciled rather than blindly retried. Rollback disables
admission while compatible playback/recovery remains available. Live provider and
Selectel activation still require separately recorded conformance/quality evidence.

## Alternatives considered

### Keep owner-scoped recordings and delete on account removal

This is the previous policy, but cannot meet the expressly requested reuse and
indefinite shared retention. Preserve ownership of source access instead.

### Expose public objects or a searchable learner audio library

This would reveal private text and bypass saved-source authorization. Administrative
inventory remains privileged; learner playback is bound to accessible content.

### Generic media service or a new worker pool

Neither is required by the two implemented consumers. A focused speech module
reuses the existing bounded runtime and infrastructure seams.

## Consequences

### Positive

- Equivalent content reuses recordings across learners without another provider call.
- New provider defaults do not invalidate approved reusable audio.
- MinIO development exercises the production storage protocol.

### Negative

- Retained derivatives contain text and incur continuing storage costs.
- Account deletion no longer erases these specific successful derivatives.
- Shared assets, access bindings and financial state require separate lifecycles.

### Risks / limitations

- Already delivered bytes cannot be revoked retroactively.
- Administrative erasure must handle versioning and concurrent publication.
- Fixtures/MinIO do not prove pronunciation quality, Russia access or Selectel behavior.

## Related

- [Feature 042](../../.agent/features/042-shared-pronunciation-playback/FEATURE.md).
- [ADR-0020](0020-dictionary-pronunciation-audio.md).
- [ADR-0023](0023-archived-dictionary-content-deletion.md).
- [ADR-0027](0027-typed-sentence-work-and-shared-ai-accounting.md).
- [ADR-0019](0019-account-deletion-journal-commit-and-replay.md).
- [ADR-0032](0032-model-price-revisions-and-speech-settlement.md).
