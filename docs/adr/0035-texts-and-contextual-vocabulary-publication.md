---
type: adr
id: ADR-0035
title: 'Texts ownership and contextual vocabulary publication'
status: accepted
date: 2026-10-15
supersedes: 'ADR-0012 review-first rule only for explicit selected-phrase Add; extends ADR-0027 closed text job kinds'
---

# ADR-0035: Texts ownership and contextual vocabulary publication

## Context

The user approved a backend-first Texts feature with private folders, whole-text
translation, explicit saves, manually editable sentence pairs, unlisted sharing,
and contextual vocabulary collection. They explicitly chose automatic generation
and saving after Add, including atomic creation of a new destination dictionary.
Frontend implementation waits for a returned Magic Patterns design.

## Decision

The texts module owns typed relational folders, texts, revisions, capability
shares, idempotency receipts, and detection/translation jobs. An ordered, bounded,
Zod-validated alignment is a text value object stored with its typed current text
row; it is not a generic asset payload or shared vocabulary identity. Stable pair
IDs join exact source segments to translation segments and preserve manual edits.
Source offsets use JavaScript UTF-16 indices; product length limits count Unicode
code points. Paragraph whitespace survives source reconstruction.

Dictionary cards remain dictionary-owned. A dedicated text-selection-card job
receives a server-authorized occurrence and temporary surrounding sentence context.
This context is not the short persisted dictionary/card semantic hint. Both sides
of a text can be vocabulary sources, with language direction derived server-side.
The user’s Add command authorizes a single complete generated card; publication
validates output and current source/destination authority and versions. A new
dictionary, settings, card, revision and operation outcome commit atomically.
Retries return the existing outcome and never create another card. This narrowly
supersedes ADR-0012’s universal review-before-card-mutation rule for this operation;
other dictionary generation remains review-first. Text translation remains a
proposal until explicit Save.

Texts work uses the shared model-selection, immutable tariff, capacity and credit
transaction participants. The closed accounting kinds gain text-detection,
text-translation and text-selection-card. Typed tables retain their own domain
lifecycles. Existing worker slots execute all supported domains; no second budget,
wallet or unbounded worker pool is introduced. Namespaced capability observations
and database transaction guards reject older workers that cannot account for new
active or recent usage. Expand/activate and compatible rollback-floor rules remain.

Text/folder sharing follows the established dictionary capability strategy: random
locator and secret, digest-only secret storage, fragment-to-header transport,
no-store/no-referrer/no-index, non-enumerating reads and live access checks. A shared
folder contains its active saved translations, including later saved changes;
drafts remain private. Copies are independently owned snapshots. Revocation or
archive prevents pending collection publication, but completed copies/cards remain.
Account purge cancels and settles dependent work, removes private content and raw
context, and retains only permitted numerical accounting. Purge roles read opaque
source ownership and lifecycle metadata, never copied text or share digests.

The new private-context agents are registered in the canonical Mastra composition
but intentionally excluded from unrestricted Studio execution. Production requests
must pass authenticated durable admission and credit accounting; a playground
proxy is not authority to execute learner work.

## Alternatives considered

### Store texts inside dictionaries or a generic content table

Rejected: text editing/alignment/sharing are separate invariants, and vocabulary
cards retain their existing ownership, settings, revisions and learning references.

### Save generated cards through browser polling and acceptance

Rejected: closing the browser could leave requested publication incomplete, while
new-dictionary creation could leave empty dictionaries after model failure.

### Reuse persisted dictionary translation context for excerpts

Rejected: the short semantic hint has different limits, persistence and privacy
semantics. Occurrence context belongs to temporary task input.

## Consequences

### Positive

- Whole-text context and stable sentence pairing support bilingual reading.
- Explicit publication and idempotent durable jobs survive reconnects safely.
- Existing pricing, provider trust and operational capacity remain authoritative.

### Negative

- New typed jobs expand shared accounting, purge, role and compatibility checks.
- Live folder sharing requires clear disclosure in the later design.

### Risks / limitations

- A 20,000-character source limit does not guarantee a chosen model can process
  every article: conservative complete-input/output preflight may require a more
  capable model or shorter text. No silent truncation or model fallback occurs.
- Whole-folder copies are bounded and may require copying individual texts for
  very large collections. Backend responses must expose this limitation safely.
- Backend verification and a design prompt do not establish frontend completion.

## Related

- [ADR-0011](0011-dictionary-persistence-and-composition.md).
- [ADR-0012](0012-dictionary-worker-and-document-ingestion.md).
- [ADR-0026](0026-shared-text-ai-selection-and-user-preferences.md).
- [ADR-0027](0027-typed-sentence-work-and-shared-ai-accounting.md).
- [Feature](../../.agent/features/043-texts/FEATURE.md).
- [Execution plan](../../.agent/features/043-texts/EXEC_PLAN.md).
