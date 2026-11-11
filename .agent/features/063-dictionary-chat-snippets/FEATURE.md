# Dictionary chat snippets with explicit insertion

Status: Locally complete and independently approved; main/release integration withheld for inherited qualification
Created: 2026-11-11

## Authorization and source

User confirmed the full design and explicitly requested implementation. This is a feature: new typed chat tool, durable snippets, dictionary-owned application and owner UI. [Design interview](../../improvements/dictionary-chat-snippet-design.md), root CONTEXT and ADR0057 own settled language/policy; no further routine scope approval is required.

## Goal

In an owned dictionary's contextual chat, ask for complete words/phrases matching its context/settings and canonical language-authoring rules. Review read-only cards, select all/some and explicitly Append/Prepend/Replace. Edit only in the dictionary after insertion.

## Acceptance

- AC1 — Owner dictionary chat exposes typed snippet generation; other source kinds/shared readers have no write/generation authority. Source target is server-bound, never model-selected.
- AC2 — Generation uses trusted frozen language pair/effective dictionary settings/translation context plus authorized relevant material and user request. Complete enabled fields, grammar, gender/inflection and appropriate articles follow the strongest existing card-authoring policy. Default10, bounded existing limits; no silent partial/truncated proposal.
- AC3 — Validated snippets persist privately with their conversation and survive reload. Content is read-only; fields are not editable in chat. All/individual selection preserves source order and requires at least1selected card.
- AC4 — Only an explicit learner action appends, prepends or replaces in the same owned active dictionary, atomically. Shared/foreign/source-inaccessible access and forged selections are rejected.
- AC5 — Replace confirms current active count, archives all active cards preserving their IDs/history and inserts new cards with fresh IDs/progress. Title/settings and preexisting archived cards remain intact. No permanent deletion or one-click Undo is introduced.
- AC6 — New cards use canonical field/settings/size/capacity validation, revisions and trusted AI authorship. Apply is deterministic/no AI call. Ordinary later edits use existing dictionary editor/provenance behavior.
- AC7 — Deliberate duplicates/repeated application are allowed with a non-blocking notification, no merge/skip/gate. Replace compares final list; append/prepend compare existing plus new. One operation retry is idempotent; later deliberate operations are distinct.
- AC8 — Generation-time settings age never gates Apply. Use current settings/normal current write concurrency, no stale banner/forced refresh/automatic regeneration; preserve original generation provenance. User owns content suitability.
- AC9 — AI follow-ups read exact retained snippet data and create a new snippet; preserve previous output. No reconstruction from only compaction receipts/memory, no dictionary mutation during generation.
- AC10 — Preserve admitted chat accounting, output/input/call limits, leases, cancellation/source lifecycle and safe typed external-output handling. Free/Paid real worker/SDK completion and technical failure remain deterministic testable with fake external HTTP.
- AC11 — UI extends existing source-chat proposal/preview and dictionary selection/confirmation/toast patterns using shared primitives/tokens/CSS Modules. Keyboard, loading/error/retry, narrow layout, readable field labels and all enabled fields are usable.
- AC12 — Current affected guides/scenarios, focused real DB/HTTP/production composition and browser evidence, types/runtime packaging and independent completion/security review cover final source. No paid calls or production deployment claimed.

## Scope and exclusions

No new model/provider, standing expense authority, editable chat draft, per-card consumed-state UI, arbitrary target dictionary, reader mutation, automatic regeneration, global harness redesign, unrelated billing/deletion/provider refactor or production deployment. Existing conversation/source retention governs snippets. Backend/SDK remain behind their infrastructure seams.

## UI direction and inventory

Extend approved existing patterns, not a redesign: dictionary companion chat and tool status; existing read-only card/field preview; checkbox selection/Select all; explicit Append/Prepend/Replace controls; existing destructive confirmation with affected count; normal success/duplicate toast and error. Snippets remain in messages after apply/reload. Existing dictionary editor stays authoritative for editing. Include empty/loading/tool-failure, disabled pending actions, owner/shared, selected subset/all, duplicate notice, replace confirmation/cancel, success/refetch, narrow viewport and keyboard states.

## Branch and inherited limits

Branch feature/dictionary-chat-snippets created from main then fast-forwarded over explicitly preserved prerequisite source through11a07a5c; main unchanged. Feature061/062 and their open production qualification are not reimplemented or accepted here. Scope this feature diff to that prerequisite baseline plus approved design; do not squash unrelated prerequisite work into main. Main merge remains subject to those existing blockers; this feature delivers verified current local behavior separately.
