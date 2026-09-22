# Inline AI Card Authoring

Status: Complete
Owner: Engineering
Created: 2026-08-26

## Problem

The existing dictionary AI journey starts only from an already-saved card and
opens a separate whole-card replacement review. Creating a card remains entirely
manual and requires both source and translation before saving. This misses the
primary authoring job: enter one source word or phrase, ask AI to propose the
remaining enabled fields beside their inputs, and decide field by field what to
use without losing manual work or earlier suggestions.

The current experience therefore makes the implemented AI capability difficult
to discover and unusable for first-pass card creation. Requiring a placeholder
or incomplete saved card would violate the typed card model and explicit-save
semantics.

## Desired behavior

In the existing Add Card desktop dialog/mobile bottom sheet, the owner may enter
a valid source phrase and select **Generate with AI**. The form stays editable
while a durable, cancellable `card-authoring:v1` job generates one bounded plain-
text suggestion for Translation and every currently enabled optional field. AI
never changes Source, dictionary settings, or card overrides.

Suggestions render immediately below their corresponding input with correct
language metadata. Each suggestion has a stable identity and explicit
**Accept**, **Discard**, and **Regenerate** actions. Accept fills only that input
and records its AI contribution; it does not remove the suggestion. Discard
hides only that suggestion and never clears field content. Regenerate makes a
field-targeted provider request and appends a distinct result while preserving
the other available choices. **Regenerate all fields** similarly appends one new
choice to every eligible field without overwriting accepted or manually entered
values.

Suggestions are deduplicated and bounded to six visible choices per field. At
the bound, generation requires the user to discard a choice; discarded
identities are sent when the next successor is enqueued so a discarded choice
does not consume the cumulative proposal bound or reappear. Previous suggestions
remain selectable throughout the open authoring draft. Closing or cancelling Add
Card retains today's behavior and abandons the unsaved draft; it creates no card.

The latest successor proposal remains durable and validated by the backend, but
the Add Card overlay is not restored automatically after deliberate close or
navigation in this iteration. A source change marks all existing suggestions as
stale and disables accepting or regenerating from them; generating again starts
a new lineage for the current source.

Final **Save card** remains the only card-creation commit. With no accepted AI
suggestion it uses the normal manual creation path and records `human`
authorship. With one or more accepted suggestion identities it atomically
accepts the latest authoring proposal, revalidates owner, active dictionary,
language pair, dictionary/settings versions, field constraints, duplicate and
capacity rules, creates the card and immutable revision, and records `mixed`
authorship. Unaccepted or discarded suggestions never become card content.

Local development uses the deterministic provider and never calls a paid model.
Production availability remains controlled by the existing two-release format
capability, provider-readiness, budget, and drain rules.

## Acceptance criteria

- [x] AC-1 — Add Card exposes a labelled AI action only for a valid non-blank
      1–200-code-point Source, while source/translation/manual optional editing
      and ordinary manual Save remain available.
- [x] AC-2 — A new versioned, cardless `card-authoring:v1` job snapshots the
      owned active dictionary, source/target pair, dictionary/settings versions,
      current draft values/overrides, resolved effective settings, generation
      scope, and optional predecessor without creating a card.
- [x] AC-3 — Whole-set generation targets Translation plus every enabled
      optional field, never Source or disabled fields, and appends validated,
      deduplicated suggestions without overwriting the draft.
- [x] AC-4 — Field regeneration calls the provider for exactly one eligible
      field, preserves other fields and earlier suggestions, retains stable
      suggestion identities, and supports six visible suggestions per field.
- [x] AC-5 — Inline suggestion controls Accept, Discard, and Regenerate affect
      only their field/suggestion; accepted choices fill the input, discarded
      choices never erase draft text, and later successor generation omits
      discarded identities.
- [x] AC-6 — Changing Source marks loaded suggestions stale and prevents their
      acceptance or successor use; generating for the new valid Source starts a
      separate lineage while preserving the user's current manual field values.
- [x] AC-7 — Final proposal acceptance creates exactly one card atomically with
      normal validation, duplicate warning, capacity, order, revision, optimistic
      conflict, and idempotent replay behavior; accepted AI contribution yields
      server-owned `mixed` authorship and manual-only creation remains `human`.
- [x] AC-8 — Queued/running generation is cancellable; retryable capability,
      admission, rate, provider, invalid-output, network, and polling failures
      retain manual values and already loaded suggestions and expose safe inline
      retry/recovery without raw provider detail.
- [x] AC-9 — Jobs/proposals use existing leases, fencing, immutable budgets,
      expiry/redaction, rollout overlap, operational signals, and no-content
      logging; ambiguous enqueue/regenerate requests reuse payload-scoped
      idempotency keys.
- [x] AC-10 — The form uses shared UI-kit primitives and existing dialog/sheet
      composition; at 320 px and 200% text, proposal values/actions wrap without
      horizontal overflow, keyboard/focus order is logical, status is announced,
      and every value has correct `lang`/`dir` metadata in en/es/fr/ru UI.
- [x] AC-11 — The canonical dictionary user-flow guide and mapped Chromium
      scenario cover the critical source-only creation, whole and field
      regeneration, preserved alternatives, accept/discard/manual edit, and mixed
      Save journey. Focused component/API/HTTP tests cover cancel, stale Source,
      reload-safe job responses, and capability-unavailable states.
- [x] AC-12 — Contract, domain/provider, worker, PostgreSQL, HTTP, component,
      E2E, browser, rollout, correctness, and security verification pass without
      paid or nondeterministic provider calls.

## Scope

### In scope

- New `card-authoring:v1` contracts, durable job/proposal input and result,
  provider port/adapter/prompt, worker dispatch, persistence, acceptance, field/
  whole successor generation, capability and rollout metadata.
- Add Card inline generation state and controls, four-locale copy, responsive
  styling, stories, API/query/mutation composition, and server-owned provenance.
- Existing dictionary guide/design-system guidance, mapped journey, operational
  format signals, deployment overlap, and proportional verification.

### Out of scope

- AI changing Source, settings, language pair, or overrides; AI enabling fields
  that are disabled by effective settings.
- Automatic saving, placeholder/incomplete cards, anonymous/shared authoring, or
  changes to existing-card regeneration, pasted batches, documents, or imports.
- Persisting every keystroke or automatically reopening an intentionally closed
  Add Card draft.
- New model vendor, pricing, billing, quota purchasing, or production activation.

## Constraints and risks

- ADR-0011 keeps current cards relational and authorship/revisions server-owned.
- ADR-0012 requires durable versioned proposals, provider isolation, fencing,
  idempotency, redaction, budgets, and two-release format compatibility.
- ADR-0016 makes runtime shared-kit composition and browser evidence authority;
  no separate design-source approval gate applies.
- User text and model output remain bounded plain text and must not enter logs,
  traces, metrics, URLs, or browser storage.
- Successor proposals must bound cumulative content and cost without deleting an
  undiscarded alternative. Source/settings/version conflicts must fail atomically.

## User-flow documentation

- No separate guide: this extends the current Add Card journey in
  `docs/user-flows/dictionary-platform.md`, which will list this feature under
  `related_features` and receive the new behavior, failure guidance, scenario,
  revision marker, and evidence.
- Stable critical scenario:
  `inline-ai-card-authoring-preserves-field-choices` in
  `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- Required mapping checks: `pnpm docs:user-flows:check` and
  `pnpm user-flow:e2e -- check dictionary-platform`, followed by the mapped
  Playwright file against fresh disposable infrastructure.

## Open decisions

- None. The user explicitly requires retained alternatives, atomic field
  regeneration, and whole-set regeneration. Durable feature-local defaults for
  bounds, authorship, source staleness, and close behavior are recorded above.
