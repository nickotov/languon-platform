# ADR-0011: Dictionary persistence and composition

Status: Accepted
Date: 2026-08-21
Supersedes: None

## Context

Languon needs durable user-owned dictionaries and vocabulary cards before later
workbook, lesson, course, grammar, translation, and exercise features exist. A
card has language-relative settings, optional values, ordering, lifecycle,
authorship, revision, sharing, and fork behavior that must remain queryable and
constrained at launch. Later modules also need stable references to dictionary
content without forcing every learning concept into one polymorphic payload.

The persistence shape is costly to reverse once product data and cross-feature
links exist. The stakeholder approved the typed-record, independent-fork, and
explicit-reference strategy on 2026-08-20.

## Decision

- The backend `dictionaries` module owns first-class `dictionaries`,
  `dictionary_settings`, `dictionary_cards`, and `dictionary_card_revisions`
  records. Business schema remains in that module and joins the canonical
  Drizzle aggregate under ADR-0002.
- Current dictionary and card state uses typed relational columns, constraints,
  foreign keys, lifecycle fields, versions, and indexes. A generic
  `asset(type, payload JSONB)` or universal learning-object table is not the
  source of truth for vocabulary.
- Each card has one owning dictionary. Dictionary settings provide defaults.
  Card overrides use typed nullable columns for each optional field's tri-state
  enablement and, where applicable, definition/example language role,
  transcription notation, and bounded custom notation label. `NULL` means
  inherit; explicit values mean override. Disabling an optional field makes its
  value and subordinate settings inactive without deleting them.
- Language identities are canonical BCP 47 tags from a versioned curated shared
  catalog, not a database enum. Definition and example languages are stored as
  `source` or `target` roles relative to a dictionary's distinct language pair.
- Effective settings resolve each non-null card override over the dictionary
  default and then apply dependencies. Example translation can be effective only
  when its resolved setting and the contextual example are both enabled; its
  language is always opposite the effective example role. A parent setting may
  make a child value/override dormant but never deletes it. A direct write that
  tries to enable example translation while its effective example is disabled
  is rejected rather than silently rewritten.
- Dictionary settings have a dedicated optimistic version. AI inputs and
  proposals carry `expectedSettingsVersion`; acceptance locks and compares it
  together with the expected card version before any mutation.
- The dictionary aggregate has its own optimistic version incremented by every
  dictionary mutation, including source/target and lifecycle changes. Every
  generation job carries `expectedDictionaryVersion` and trusted source/target
  tags; batch/document acceptance compares them so a legal empty-dictionary pair
  change cannot receive candidates generated for the previous pair.
- Current card content stays directly queryable. Immutable, schema-versioned
  revision snapshots record current values, raw card overrides, resolved
  effective settings, the dictionary-settings version, trusted authorship
  transitions, and optimistic-conflict history. Revision JSON is validated at
  every boundary and does not replace typed current columns.
- Card authorship is server-computed as `human`, `ai-generated`, or `mixed` from
  trusted mutations and revisions. Clients cannot assign or remove provenance.
- A dictionary has one user owner. `private` content is owner-only. `unlisted`
  anonymous reads use a non-secret random share locator plus a high-entropy
  rotatable capability key. The copyable web URL keeps the key in its fragment,
  which is not sent in an HTTP URL or referrer; client code forwards it only in
  a dedicated share-key API header. PostgreSQL stores the locator, a key digest,
  and safe rotation metadata, never the key. Archived content is unavailable
  through the capability.
- Forking is an idempotent transaction that creates a private dictionary and new
  card identities for the reader, copies current active content, order,
  settings, inactive values, and authorship, and retains only safe source
  provenance. Source and fork never share mutable cards.
- Future workbook, lesson, course, or exercise modules compose vocabulary with
  explicit foreign-key link tables to stable dictionary or card IDs. A later
  publication feature may additionally pin an immutable revision. It must not
  change present ownership or silently turn live links into snapshots.
- A foreign key proves identity, not authority. Every consuming module must
  authorize a live reference both when the link is created and whenever it is
  dereferenced, and must treat archive/access revocation as unavailable rather
  than serving cached content. Use composite owner/workspace keys when the
  product requires same-owner composition. An unlisted share key is never stored
  as durable authority for another aggregate.
- API contracts expose domain representations from `@languon/contracts`, not
  database rows or revision payloads. Owner read models expose dictionary
  defaults, raw card overrides, resolved effective settings, and inactive-value
  state so clients never need to reproduce inheritance. Authorization derives
  the owner from the verified server principal established by ADR-0001.
- Retry-safe dictionary create, fork, and bulk operations use a dictionary-owned
  idempotency record keyed by owner, operation, and client key, with a request
  fingerprint and result identity written in the same transaction. This is not
  a generic cross-application idempotency abstraction.
- Public responses use `Referrer-Policy: no-referrer`, no-index metadata,
  `Cache-Control: private, no-store`, disabled Next/static/ISR/shared-server
  caching, non-enumerating not-found behavior, and bounded rate limits. Rotation
  and archive therefore cannot leave capability content in a shared cache. Edge
  and application telemetry excludes the share-key header and never records
  fragments, raw keys, or key digests.
- Dictionary names, descriptions, card values, inactive values, and every model
  warning/reason/alternative are plain text. Web code renders them as inert text
  nodes and never through raw HTML insertion. Markup or links require a later
  reviewed allowlist sanitizer and safe-protocol contract; CSP remains a
  secondary defense rather than the sanitizer.

## Alternatives considered

### Generic asset table with a JSON payload

One table could hold cards, exercises, grammar items, and future content types.
It was rejected because callers would inherit runtime type dispatch, weaker
constraints and foreign keys, harder indexed queries, and migration coupling
before those content kinds share proven behavior.

### Shared card library with many-to-many dictionary membership

This could deduplicate vocabulary across dictionaries. It was rejected because
membership would introduce shared editing, override ownership, fork syncing,
conflict, deletion, and publication semantics that the initial product neither
needs nor defines.

### Copy every embedded card into its future parent

Snapshots make consumers independent of later edits. They were rejected as the
default because they duplicate identities and hide updates. Explicit live links
preserve composition; publication can opt into a revision snapshot when that
observable behavior exists.

### Store current cards only as revision JSON

An append-only document model simplifies history writes, but makes ordinary
search, filtering, validation, indexing, and cross-feature references depend on
JSON shape and replay. Typed current columns plus immutable revisions keep both
operational reads and lineage explicit.

## Consequences

### Positive

- Dictionary/card invariants remain enforceable and performant in PostgreSQL.
- Future learning modules can reference stable vocabulary identities without a
  persistence redesign or generic asset abstraction.
- Independent forks have simple ownership and authorization semantics.
- Immutable revisions support honest AI authorship and optimistic conflicts.
- The curated language catalog can expand without a database migration.

### Negative

- Settings inheritance requires explicit resolution code and symmetric tests.
- A fork copies rows and consumes storage rather than sharing content.
- New content kinds need their own typed models and explicit composition links.
- Current columns and revision snapshots must evolve through coordinated schema
  versions and expand-compatible migrations.

### Risks / limitations

- Capability links grant read access to anyone who possesses them; key entropy,
  digest storage, constant-time comparison, rotation, archive revocation,
  no-referrer/no-index responses, and non-enumerating failures are mandatory.
- Reorder, fork, archive, and revision transactions can become expensive at the
  10,000-card limit; pagination, gap ordering, bounded transactions, indexes,
  and query-plan verification are required.
- An explicit link does not yet define later workbook publication behavior.
  The consuming feature must choose live or revision-pinned semantics and record
  that decision before implementation.
- Revision snapshots may contain user content. Retention, authorization, and
  export/erasure behavior must be handled as product data even though revision
  history has no initial UI.

## Related

- [Architecture](../architecture.md)
- [ADR-0001: User authentication and session strategy](./0001-user-authentication-and-session-strategy.md)
- [ADR-0002: Drizzle schema and migration strategy](./0002-drizzle-schema-and-migration-strategy.md)
- [Dictionary Platform feature](../../.agent/features/dictionary-platform/FEATURE.md)
- [Dictionary Platform ExecPlan](../../.agent/features/dictionary-platform/EXEC_PLAN.md)
