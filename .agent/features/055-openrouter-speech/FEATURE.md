# OpenRouter speech generation and local activation

Status: Complete
Owner: Codex
Created: 2026-10-26

## Problem and desired behavior

The learner requested a working non-Kie speech provider and its local admin setup.
The app currently implements only fixture and Kie speech. Add OpenRouter behind
the established speech port, use the existing inference key and activate the
reviewed Eleven v4 Turbo model for local pronunciation. This feature was explicitly
authorized after the missing integration boundary was explained.

## Acceptance criteria

- AC-1 — Curated OpenRouter Eleven v4 Turbo synthesis uses the fixed audio/speech
  endpoint, documented preset voices and supported app languages; explicit MP3,
  language hint and zero-retention/no-data-collection preferences; bounded request,
  bytes and validated audio, sanitized failures and no blind paid retry.
- AC-2 — Unified validated environment selects OpenRouter using the existing key,
  role-scopes credentials to workers and exposes a configurable request timeout
  with fallback warning. Timeout remains below the existing60-second speech lease.
- AC-3 — Existing approved audio remains reusable; pending Kie work retains its
  original configuration/credential and polls Kie, never the replacement provider.
- AC-4 — Publish immutable OpenRouter provider costUSD0.04/1000characters and a
  separately versioned existing customer speech tariff for local testing. Preserve
  operator-funded Free policy, credits, budgets and all historical records.
- AC-5 — Retained real PostgreSQL service/worker/provider/storage/settlement tests
  exercise Free/Paid success/failure with only external provider HTTP synthetic,
  exact expenses, no technical-failure charge and cache reuse. Register exact
  required scenarios in the critical gate; real browser playback evidence required.
- AC-6 — Activate local configuration, retain old adapter identity, and observe an
  explicitly budgeted synthetic learner public-API request reaching persisted
  playable audio. Report actual calculated/unknown expense and provider limits;
  do not confuse configuration/probes with playback evidence.

## Scope and exclusions

Implement one new adapter and curated model, no arbitrary provider/model UI,
new API, new wallet or unrelated speech redesign. Admin already manages model
customer tariffs and provider USD prices. Speech provider/profile selection stays
server-owned environment configuration. No learner model selection, automatic
fallback, voice cloning, streaming playback, new languages, dependency or service.
No user content/account/recording deletion or database reset.

## Constraints and sources

ADRs0031/0032 and0045 remain binding. Saved-source authorization, immutable jobs,
private storage, successful-storage-only charging and uncertain submission recovery
stay unchanged. Existing16 app languages are all documented for Eleven v4 family;
activate only currently configured15 mappings initially (preserve scope).
Official sources: https://openrouter.ai/docs/guides/overview/multimodal/tts,
https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/,
https://elevenlabs.io/docs/overview/models. Live public catalog checked2026-10-26:
model elevenlabs/eleven-v4-turbo,21 preset voices,USD0.00004 per character; marketing
launch discount endedOct19 and is not used. Direct adapter and live learner API validation passed (E-9/E-17).

## User-flow documentation

Update existing docs/user-flows/shared-pronunciation-playback.md, operations and
sanitized env examples. Reuse the existing speech guide with related_features
openrouter-speech; there is no separate learner journey needing a duplicate guide.
Preserve stable existing scenarios; inspect mappings.

## Open decisions

None. User authorized adapter+local activation. Live checks use synthetic saved
text and a bounded portion of the remaining originalUSD0.10 diagnostic allowance;
current exposureUSD0.074583 leavesUSD0.025417. Never silently enlarge that budget.
