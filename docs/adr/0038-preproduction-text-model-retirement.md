---
type: adr
id: ADR-0038
title: Preproduction text model retirement
status: accepted
date: 2026-10-19
supersedes: 'ADR-0021, ADR-0026 and ADR-0036 only for continued execution of retired DeepSeek Chat and arbitrary legacy environment model routes'
---

# ADR-0038: Preproduction text model retirement

## Context

The user confirms that Languon is in development and has no production deployment,
and authorizes removing stale compatibility code and cleaning development data.
DeepSeek Flash already supplies the current DeepSeek capability. DeepSeek Chat
remains executable solely to preserve old catalog/configuration snapshots.
The worker also retains an older arbitrary model URL/key environment route,
although current provider selection uses reviewed fixed catalog entries.

## Decision

Retire DeepSeek Chat from both curated catalogs, readiness publication, playground
selection/defaults and deployment validation. Flash and Kie remain supported.
Remove arbitrary environment model execution: model IDs must resolve to the
reviewed catalog and use its fixed endpoint and provider credential. Reject old
URL/key override variables rather than silently applying or ignoring them.

Retired snapshots fail closed; never reinterpret an admitted job as Flash or
change its recorded price or identity. Retain immutable revisions, terminal job
records, ledger history and generic replay/idempotency protections. Mutable
configuration pointing to a retired model needs an explicit supported selection
through existing administration. A retired explicit learner choice can be
replaced by Auto or a supported model through existing preferences.

No persisted schema changes are needed: model identifiers are strings and
current readers already handle unavailable choices. No automatic destructive
migration runs against development databases. Any targeted local cleanup must
identify a disposable target and verify invariants through the cleanup skill.

This narrowly supersedes the historical-adapter retention requirements of the
related ADRs for this authorized development retirement. Their immutable job,
credit settlement, curated trust, and fail-closed readiness rules remain active.
Versioned formats still admitted by current configuration are not retired here.

## Alternatives considered

### Keep obsolete adapters until old jobs drain

Adds runtime compatibility for a model the user has explicitly retired during
development, when no production continuity obligation exists.

### Rewrite every historical snapshot or reset every database

Changes historical identity/accounting and destroys unrelated development work.
Explicit future selection and rejection of obsolete jobs need no global reset.

## Consequences

### Positive

- Catalogs and local defaults reflect the supported models.
- Arbitrary old provider routes no longer bypass curated configuration.
- Recorded execution and accounting identities remain truthful.

### Negative

- Old nonterminal Chat jobs cannot execute and require deliberate development
  cleanup or recreation through a current supported workflow.

### Risks / limitations

- Future cleanup runs must reestablish deployment state and data ownership.
- Mutable development defaults selecting Chat need an explicit admin change;
  the runtime does not silently choose a different provider.

## Related

- [ADR-0021](0021-dictionary-ai-provider-routing.md)
- [ADR-0026](0026-shared-text-ai-selection-and-user-preferences.md)
- [ADR-0036](0036-task-specific-text-translation-capacity.md)
- [Feature 045](../../.agent/features/045-development-cleanup-and-architecture-diagrams/FEATURE.md)
