# Reliable dictionary card search

Status: Complete
Created: 2026-11-12

## Authority and scope

User reported focus loss after every character and missing bon→bonjour matches,
requested debounced search over source/translation/definition/example/translated
example with bounded database work, and explicitly approved the full fix including
index migration. Root AGENTS classifies migrations as feature work; no further
scope approval required. This repairs an existing journey, not a new endpoint.
Branch feature/dictionary-card-search from clean main9b8b4eaa. No paid calls,
new runtime dependency, user-data deletion or shared/production DB operations.

## Acceptance

- AC1: Search input remains mounted/focused with its caret while typing and while
  pending results resolve or fail. Update only the card-results region.
- AC2: Case-insensitive word-prefix matching finds bon→bonjour across source,
  translation, definition, example and exampleTranslation, including unloaded
  cards. Search uses literal parsed words; multiple words require matching
  prefixes, not user-supplied SQL/tsquery operators. No new fuzzy/infix promise.
- AC3: Commit the trimmed request search after300ms idle, not each keystroke.
  Empty/whitespace clears filters without a remote search variant. In-flight
  request cancellation and query keys prevent stale response overwrite; API
  pages remain bounded, never fetch/filter the entire dictionary in the client.
- AC4: Preserve owner/lifecycle/version/cursor isolation and reset pagination for
  a new committed search. Preserve selection/mutation safety during transitions.
- AC5: Generated schema/SQL migration updates the existing GIN search expression
  to cover all five stored fields, matching the runtime predicate; no card row
  format/content or API request/response shape change. Existing rows searchable.
- AC6: Disposable PG proof covers field/prefix/Unicode/punctuation correctness,
  authorization/lifecycle/pagination, forward migration/index integrity and real
  query plans at the10,000-card dictionary bound with other-owner data. Document
  actual access paths/cost limits; do not promise unlimited concurrent throughput.
- AC7: Focus/request-count regressions and actual browser search pass; current
  dictionary-platform guide and stable mapped scenario reflect behavior. Required
  independent completion and focused SQL/security review approve final evidence.

## UI direction

Extend existing EditorToolbar/Input and card loading/error primitives. Preserve
layout/colors/placeholder, accessible labels and existing component folders. No
new standalone UI block or whole-chat story; focused interaction proof is needed.

## Design decisions and exclusions

Keep existing Postgres simple-config GIN full-text strategy under ADR0011; use
prefix lexemes rather than leading-wildcard scans or new trigram extensions.
Add translated example to the same document expression and use the exact same
expression in the index/query. Retain existing limit+1 cursor pagination, max200
query characters and existing rate/owner checks. No new ADR needed for this
bounded extension of accepted persistence/index strategy. Debounce is not a
substitute for real plans; measure common/rare terms and empty/broad searches.
No auth/billing/model/worker/shared-link or global navigation changes.
