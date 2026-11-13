# Correction: Playground usage clarifications

Status: Complete
Created: 2026-11-13
Updated: 2026-11-13

## Routing and scope

User requested updating `docs/tutor-playground.md` after encountering missing
verification-agent context and synthetic tool responses. Documentation-only
correction of established behavior; no API, persistence, authorization, provider,
dependency, or runtime change. Current branch retained. No Git operation requested.

## Outcome

- Added Studio entry-point table and verification-agent instructions with the
  exact checked-in `synthetic-principal` context JSON.
- Documented the reported HTTP500 validation failure and its remedy.
- Clarified that tutor/tool mode defaults to deterministic; live requires isolated
  routing/prices/budgets/funding, credentials, explicit mode selection and restart.
- Explicitly identified the absent turnkey live bootstrap and separated
  verification-agent model settings from tutor routing.

## Verification

Source cross-check: `apps/backend/src/mastra/request-context-presets.json`,
verification primitive request-context schema, playground environment and live
admission composition. Existing mapped user-flow guide already documents the
principal preset; its behavior, commands and traceability remain unchanged.

Scoped Prettier, relative Markdown link checks and `git diff --check` passed.
Runtime/tests/build/browser/DB execution not required for this prose-only change;
no new execution evidence claimed. Author diff review completed; independent
review not triggered by this bounded documentation correction. No secrets added.

## Remaining limits

Live configuration bootstrap remains a separate implementation need. This change
documents current behavior and does not configure or invoke paid providers.
