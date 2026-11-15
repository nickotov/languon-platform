# Contextual block insertion and exercise discovery

Status: Complete
Completed: 2026-11-15
Created: 2026-11-15

## Authorization and scope

User approved the complete conversation plan with “Implement the plan.” Feature
069 owns editor slash insertion, contextual exercise previews and inline typed
chat references. Existing UI patterns are the approved direction, with bounded
ui-designer brief from planning. Follow ADR-0016/0029/0050/0052/0054/0055/0058.
No paid generation, provider change, automatic publication or native UI changes.

## Acceptance

- AC1: Searchable editor `/` picker with Basic/Learning/Exercises/Library groups,
  all19 named activities grouped by category, nested actions and separate Preview.
  Preserve IME/literal slash/cancel, editor bookmarks, undo and disabled behavior.
- AC2: Exercise actions Generate with AI (prepare editable chat draft, explicit
  Send), Create manually · Custom (matching format, no named semantics), Preview.
  Never overwrite existing draft prose or silently insert generated content.
- AC3: Shared desktop-dialog/mobile-sheet previews reuse canonical synthetic
  sources and interactive examples. Prepared checking is local; illustrative
  feedback stays explicit. No save, mutation, credit or model request. Restore
  suspended picker query/scroll/focus on close.
- AC4: Workspace chat has atomic inline exercise/document-block chips at caret,
  searchable slash/button picker and preview. Preserve selection, keyboard/IME,
  undo/redo, Enter/ShiftEnter, accessible removal, plain-text clipboard and copied
  Text attachments. No page-to-feature imports or new runtime dependencies.
- AC5: Typed prompt mention metadata accompanies canonical message text; validate
  UTF16 ranges, identities and bounds. Server uses catalog IDs, not display text,
  and resolves document IDs only from authorized snapshots. Persist metadata in
  messages and execution; fingerprint/retry/history preserve meaning and authority.
- AC6: Chip-only generation constrains selected activity types, shares one source
  set, derives quantity from prose or defaults to one per type. Explanation-only
  queries remain valid. Missing/incompatible sources/counts clarify without
  substitution. Advanced picker explicit settings and chips remain synchronized.
- AC7: Unit/contract/persistence/production-composition/browser coverage, updated
  mapped guides, static/build checks, independent completion and security review
  pass. No real paid services. Four artifacts reflect actual final evidence.

## Design inventory

Existing Popover/Dialog/CSSModules/tokens. Desktop searchable anchored drilldown,
mobile sheet with Back/Close and safe-area/keyboard clearance. Exercises row has
name/description plus independent Preview; next action level Generate/Custom.
Preview identity/purpose/checking/source/interactive block and contextual footer.
Chat chip icons distinguish activity/source; long localized labels and missing
sources remain readable. No hover-only navigation or nested interactive controls.

## Scope decisions

All19 catalog activities; manual remains Custom. Generation prepares chat and
waits for Send, then Review/Insert/Save. Multiple types share source set. Type
chips do not lock quantity; omitted count is one of each. Existing advanced
picker remains authoritative for its explicit count, with conflicts clarified.
Native mobile composer excluded; web mobile browser included. Existing plain-text
messages remain supported as normal messages without mention metadata.
