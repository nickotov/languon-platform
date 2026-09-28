# Dictionary Translation Context

Status: Complete
Owner: Engineering
Created: 2026-09-28

## Problem

The same source word can require different translations in different domains,
senses, situations, or registers. Dictionary generation currently has no durable
semantic hint shared by its cards, and a card cannot replace that hint for one
specific sense.

## Desired behavior

Owners can save optional translation context in Dictionary settings and on an
individual card. Cards inherit dictionary context unless they define their own;
the resolved context guides every AI-generated card field. With no context the
existing generation behavior remains unchanged.

Context is private authoring guidance. It is not shown on ordinary vocabulary
cards, public shares, forks, or exports. Existing request-specific batch context
and instructions remain transient and are sent separately from the resolved
persistent context.

## Acceptance criteria

- AC-1 — Dictionary settings can create, update, and clear a trimmed optional
  translation context of at most 1,000 code points with optimistic conflict
  protection and four-locale accessible copy.
- AC-2 — Add/Edit card provides the conditional **Set context** / **Update
  context** switch, inherited read-only preview, explicit card override, and
  clear-to-inherit behavior; manual create/update persists the result.
- AC-3 — Effective context resolves card override over dictionary context and
  guides Source, Translation, Definition, Transcription, Example, and Example
  translation generation. Null effective context preserves existing behavior.
- AC-4 — Inline AI proposals bind suggestions to their resolved context. Editing
  context invalidates incompatible choices, and stale dictionary/card context
  conflicts rather than accepting output generated from another meaning.
- AC-5 — Full-card, pasted-term, document, and AI-import generation snapshot and
  use persistent context. Transient context/instructions remain separate, are
  combined for that request, and are not saved as card overrides.
- AC-6 — Current state and immutable revisions use typed nullable context data;
  legacy rows/revisions remain readable, and context mutations preserve version,
  authorship, idempotency, capacity, and transaction rules.
- AC-7 — Translation context remains owner-only and plain text: it is absent
  from public reads, public forks, exports, logs, traces, URLs, and terminal job
  payloads, while model input/output stays bounded, tool-free, and validated.
- AC-8 — Context-aware job formats follow expand/activate compatibility and old
  formats remain readable and terminally actionable while retained work drains.
- AC-9 — Dictionary-platform documentation, mapped E2E, disposable database,
  deterministic provider, browser, localization, accessibility, correctness,
  and security evidence prove the completed behavior.

## Scope

### In scope

- Define included behavior.
- Shared contracts, domain normalization/resolution, relational persistence,
  revision snapshots, owner APIs, AI job/provider/prompt paths, and rollout.
- Dictionary settings and shared Add/Edit card form UX with form-version and
  proposal invalidation behavior.
- Existing dictionary-platform guide and mapped Playwright journey.

### Out of scope

- Dictionary creation-dialog context, public display, sharing/fork/export
  portability, card-list/search display, automatic regeneration, and AI-created
  context values.
- New provider/model selection, billing rules, dependencies, or infrastructure.

## Constraints and risks

- ADR-0011 owns typed current state, revisions, inheritance, and optimistic
  versions. ADR-0012 requires durable snapshots and expand/activate job formats.
- Context and transient guidance are untrusted user data, never model authority.
- Existing v1/v2 job and revision data must remain readable through rollout.
- ADR-0016 requires real-browser evidence for the visible forms.

## User-flow documentation

- Update `docs/user-flows/dictionary-platform.md`; this extends the established
  dictionary authoring journey rather than creating a separate product flow.
- Update `owner-creates-edits-and-restores-dictionary` and
  `inline-ai-card-authoring-preserves-field-choices` in
  `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- Validate the guide/revision mapping and execute the exact mapped Playwright
  file against its guarded disposable stack.

## Open decisions

- None. The user selected all generation paths, whole-card semantic alignment,
  private guidance, inherited preview plus empty override, and transient batch
  guidance combined without persistence.
