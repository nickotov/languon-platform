# Inline AI Field Generation and Source Normalization

Status: Complete
Owner: Engineering
Created: 2026-09-27

## Problem

Inline AI authoring currently leaves the manual input visible beside a separate
suggestion section, supports first-time generation only for the whole new-card
draft, and excludes Source. The duplicated controls are confusing, saved-card
editing cannot use the inline flow, and a misspelled or non-canonical Source can
be carried into every generated field.

## Desired behavior

Add card and Edit card expose an AI action beside each rendered field plus the
existing whole-card action. A targeted field shows progress and then an inline
review in the input's place. Accept returns the editable input populated with
the suggestion; Reject restores the prior draft. Older alternatives stay behind
a compact control rather than alongside the input.

Source generation corrects spelling, capitalization, and grammar, selects the
conventional lemma or verb infinitive, and adds an article where that source
language normally requires one for a dictionary entry. It never translates the
Source or changes a correct entry merely to produce output. Whole-card results
are based on the normalized Source and remain unusable until a proposed Source
change is accepted; rejecting it clears its dependent results.

The flow remains review-only. Save is the sole create/update commit. The current
saved-card whole-rewrite flow remains available as an advanced action.

## Acceptance criteria

- AC-1 — Every rendered card field in Add card and Edit card has an accessible
  field-local AI action; first-time whole and single-field requests are supported,
  with one authoring request active per draft.
- AC-2 — Targeted progress and review replace the corresponding input while its
  prior draft value is retained; Accept restores an editable populated input,
  Reject restores the prior value, and retained alternatives are available only
  through a compact previous-options control.
- AC-3 — Source-only generation returns either one bounded canonical Source
  suggestion or an explicit unchanged result and produces no other field.
- AC-4 — Whole generation normalizes Source first and generates all enabled
  fields from that basis; dependent results cannot be accepted before a proposed
  Source, and rejecting Source removes its dependent results.
- AC-5 — Per-field generation changes only the requested enabled field. Example
  translation requires a non-empty Example. Manual Source edits keep draft text,
  clear incompatible AI provenance, and invalidate incompatible alternatives.
- AC-6 — Generate all, Accept all, Reject all, cancellation, retry-safe failures,
  and bounded six-choice history continue to work with the replacement UI.
- AC-7 — `card-authoring:v2` supports create and update targets, Source identities,
  source-basis validation, initial field scope, cumulative successors, strict
  model validation, idempotency, budgets, credits, expiry, and redaction while
  v1 jobs remain readable and terminally actionable during rollout.
- AC-8 — Final acceptance creates or updates exactly one active owned card with
  dictionary/settings/card version checks, duplicate warning, normal field and
  capacity rules, immutable revision/provenance, and idempotent replay. A draft
  with no selected AI value uses the ordinary manual mutation path.
- AC-9 — Saved cards retain the separate custom-instruction whole-card rewrite,
  presented distinctly from inline field assistance.
- AC-10 — English, French, Spanish, and Russian copy, keyboard/focus behavior,
  live status, `lang`/`dir`, 320 px layout, 200% text, error recovery, and safe
  cleanup on draft close meet the existing shared-UI and accessibility contract.
- AC-11 — The dictionary-platform guide, mapped Playwright journeys, contracts,
  domain/provider/worker, HTTP, PostgreSQL, component, browser, rollout,
  correctness, and security verification cover the final behavior without paid
  or nondeterministic model calls.

## Scope

### In scope

- Versioned contracts, prompt/provider validation, worker dispatch, persistence,
  create/update acceptance, capability rollout, credits, and operational signals.
- Inline Add/Edit card UI states, field and bulk actions, alternatives, four-locale
  copy, shared Field action composition, stories, and orchestration cleanup.
- Dictionary-platform guide and mapped E2E/browser evidence.

### Out of scope

- Provider/model selection, subscription or credit-policy changes, concurrent
  field jobs in one draft, automatic saving, or restoration of a deliberately
  closed unsaved draft.
- Changes to batch, document, import-pair, pronunciation, or advanced
  `single-card:v1` generation semantics.

## Constraints and risks

- ADR-0011 owns card persistence and provenance; ADR-0012 requires fenced durable
  jobs and expand/activate compatibility; ADR-0016 requires real-browser proof;
  ADR-0021 owns provider routing; ADR-0022 owns credit reservation/settlement.
- Model input/output is untrusted bounded text. No content enters logs, metrics,
  URLs, or browser storage, and the agent receives no tools.
- Existing `card-authoring:v1` work must drain safely across mixed releases.

## User-flow documentation

- Update `docs/user-flows/dictionary-platform.md` and its source mappings.
- Update `inline-ai-card-authoring-preserves-field-choices` and add a saved-card
  inline-authoring scenario in
  `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- Verify `pnpm docs:user-flows:check`,
  `pnpm user-flow:e2e -- check dictionary-platform`, and the mapped Playwright
  command against disposable local infrastructure.

## Open decisions

- None. The user selected editable post-accept inputs, coherent Source-based
  whole generation, retained alternatives behind a compact control, both Add and
  Edit card support, an Example prerequisite, and retention of advanced rewrite.
