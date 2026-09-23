# AI Provider and Model Management

Status: Complete
Owner: Codex
Created: 2026-09-23

## Problem

Dictionary generation currently selects one environment-configured model at worker
startup. Deterministic mode intentionally returns fixtures. The development
playground's `DEEPSEEK_API_KEY` and the audio subsystem's
`DICTIONARY_AUDIO_KIE_API_KEY` do not configure dictionary text generation;
plain `KIE_API_KEY` is not currently consumed. Administrators cannot select a
provider or model, and changing worker defaults cannot safely serve as a future
per-user selection mechanism.

The feature began as an implementation plan for DeepSeek/Kie text generation
through Mastra and admin configuration. The user subsequently authorized full
feature implementation. Runtime code, migrations, admin UI, documentation,
mapped system E2E, and independent reviews are complete.

## Desired behavior

An active admin owner opens AI settings, sees DeepSeek and Kie text providers and
a curated catalog of compatible models, enables eligible models, and selects one
active provider and default model for dictionary text generation. Settings persist
and apply to newly admitted jobs without restarting the application. Each job
captures its execution configuration; already admitted work does not change model
when the default changes. Mastra continues to run the agents. Learners retain the
existing generate/review/accept experience with no model picker in this version.

Credential provisioning remains server-side through ignored environment files or
existing deployment secrets. The UI reports configured/missing and bounded health
status, never reads, edits, or returns keys. Text generation and TTS stay independent.

## Acceptance criteria

- AC-1 — Both DeepSeek and Kie have bounded text-generation adapters behind Mastra.
  At least one explicitly identified model per provider passes the relevant
  structured-output contract. Unsupported models/protocols cannot be activated;
  generic OpenAI compatibility is not sufficient evidence.
- AC-2 — An active owner can view provider/model settings, change enabled models,
  and atomically save an active provider and enabled default model. Non-members,
  revoked memberships, and expired sessions are denied by the backend. Mutations
  use existing recent-authentication semantics, a bounded reason, optimistic
  version checking, and transactional audit records with no secrets. Preserve
  ADR-0010 audit outcomes for successful writes and authorized rejections (including
  conflicts/recent-auth failures), required event fields, and retention/pruning.
- AC-3 — A versioned persisted configuration survives restarts. New admissions
  resolve its active revision atomically with their budget reservation and job
  creation. Concurrent admin writes return a recoverable conflict rather than
  losing changes. No default or unavailable capability returns an actionable,
  sanitized unavailable result without creating unusable work.
- AC-4 — Jobs pin provider/model, adapter/configuration revision, credential
  reference (never key), and applicable budget policy. Default changes and model
  disabling affect future admissions only. Retries of an existing job retain its
  selection; credential rotation may replace the secret behind the same reference.
  Missing credentials or unsupported pinned revisions fail safely without silently
  falling back to another provider. Duplicate idempotent submissions return the
  original job even after a default change.
- AC-5 — All existing dictionary text-generation paths use the selection boundary:
  inline authoring, saved-card regeneration, pasted terms, import-pair enrichment,
  and document term enrichment. OCR, parsing, TTS, and the isolated Studio playground
  remain separate. A new field/batch retry that creates a new job uses the current
  default; lease recovery or an attempt retry of the same job uses its snapshot.
- AC-6 — Provider-specific readiness and structured-output handling preserve Zod
  validation, cancellation, timeout/retry limits, leases/fencing, proposal review,
  token/cost admission, fair concurrency, and sanitized errors. HTTP application
  health does not depend on vendor availability. Model limits and conservative
  pricing are explicit catalog data; no settings change bypasses budgets. Model
  per-call context/output caps are distinct from aggregate job/batch allowances.
  A global default must support every enabled text-generation format; an unsupported
  combination is rejected before activation with an actionable explanation.
- AC-7 — The catalog and endpoints are trusted server configuration. Admins cannot
  submit arbitrary URLs, headers, credential names, or model identifiers. Remote
  model lists cannot expand the allowlist. Provider responses, traces, audit data,
  browser bundles, and errors do not expose credentials or raw user prompts.
- AC-8 — Admin AI settings provide loading, empty, missing-credential, unverified,
  available/unavailable, save-success, conflict, unauthorized, and retry states.
  Provider switching updates model choices and validates the default. The page
  follows Refine/Ant Design, English i18n, keyboard/accessibility behavior, narrow
  layouts, and light/dark/system themes. Saved state and health observations are
  visibly distinct; saving does not generate billable sample content.
- AC-9 — Existing environment-only installations and in-flight jobs have an explicit
  compatibility path. Expand/activate migrations and worker capability gating
  prevent an old worker from executing newly pinned work under its old default.
  No deployment automatically enables paid generation. Rollback preserves polling,
  cancellation, acceptance, and the ability to drain supported work.
- AC-10 — Automated provider fixtures, disposable PostgreSQL/Redis tests, mapped
  admin-to-worker E2E, real-browser evidence, affected static/build checks, and
  independent completion/security reviews pass. Live vendor verification is
  separately recorded per model; without it, report that activation limitation
  explicitly and never claim live provider readiness.

## Scope

### In scope

- Dictionary text-generation provider/model configuration and job provenance.
- DeepSeek direct API and Kie text API, selected through Mastra adapters.
- Curated provider/model catalog with supported formats, protocol, limits and
  conservative pricing; provider-specific readiness with timestamped observations.
- Owner-only admin resource, API/contracts, persistence, audits, and conflicts.
- Explicit environment compatibility, migrations, worker grants/capabilities,
  operations guidance, deterministic verification, and rollout/rollback evidence.

### Out of scope

- Learner model selection, subscription tiers, new billing, or automatic fallback.
- Arbitrary providers/endpoints or automatic activation of remotely discovered models.
- Browser-managed keys, encrypted secret storage, or a new secret manager.
- TTS/voice configuration UI, OCR vendor changes, or changing Studio model controls.
- Production activation, provisioning, paid benchmark suites, or new native UI.

## Constraints and risks

Accepted ADRs 0002, 0010, 0011, 0012, 0016 and 0020 constrain persistence,
admin authorization, dictionary ownership/jobs, rendered verification, and audio
separation. A proposed ADR must capture durable configuration ownership and
routing/compatibility rules before implementation; do not rewrite accepted ADRs.

Kie's documented text endpoints vary by model. The previously inspected Gemini
endpoint documents JSON Schema output, but `/models` readiness was not established.
DeepSeek documents JSON-object output, which is not proof of Mastra's exact schema
wire-format compatibility. Resolve both with the pinned SDK and explicit adapter
contracts. Do not weaken output validation or the production URL trust boundary.

Readiness must reflect the worker credential/capability context, not merely what
the API process can see. Never broaden credential distribution just to populate
the admin screen. Concurrent configuration changes, mixed worker versions,
budget reservations, and jobs admitted before migration need dedicated tests.

## User-flow documentation

The implemented guide is `docs/user-flows/ai-provider-management.md`, mapped to
the dedicated reviewed command `pnpm test:e2e:ai-provider-management`. README,
admin source mapping, operations guidance, release configuration, and deployment
examples describe the delivered behavior and compatibility path.

## Open decisions

No product question remains open for this version. The delivered scope uses one
global curated default, server-side credentials, no automatic fallback, and no
learner picker. A future provider is added through a reviewed catalog entry,
credential binding, wire-contract fixture, and deployment configuration. Job
ownership plus persisted input/output usage provides the attribution seam for a
later per-user allowance policy. Live paid smoke verification remains a separate
activation step and was not performed.
