# ExecPlan: AI Provider and Model Management

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-23
Status: Complete
Branch: `feature/ai-provider-management` (created from clean `main`)

## Goal and specification

Enable owner-managed DeepSeek/Kie dictionary generation through Mastra.
[FEATURE.md](./FEATURE.md) owns AC-1 through AC-10 and exclusions. Full feature
implementation was authorized after the initial planning pass. The runtime,
migration, admin page, guide, and deterministic checks have been implemented;
this plan remains active through final verification, independent review,
remediation, and local squash merge.

## Existing architecture

- `apps/backend/src/infrastructure/worker/dictionary-worker-environment.ts`
  validates mode, worker model credentials and lifecycle format lists.
  `dictionary-worker-command.ts` composes the worker; provider instances and
  budgets are currently process-level inputs.
- `apps/backend/src/modules/dictionaries/infrastructure/ai/*` owns Mastra agents
  and structured proposal generators. Card/authoring readiness appends `/models`
  to the configured endpoint; card authoring calls `agent.generate` with a Zod
  `structuredOutput.schema`. Provider API compatibility needs verification.
- Dictionary application services admit jobs through generation/document stores;
  `dictionary-worker-composition.ts` supplies format-specific executors. Extend
  their existing application ports rather than import vendor SDKs into services.
- `apps/backend/src/modules/administration` owns membership checks, recent auth,
  audit, HTTP composition and persistence. Its current audit structures focus on
  user targets: inspect/generalize narrowly for configuration targets without
  pretending a settings revision is a user or weakening old event validation.
- `apps/admin/src/app`, `pages`, and `shared` own Refine routing/resources, page
  UI, API/data provider, access, theme and i18n. Use lower-layer public exports.
- `packages/contracts` owns public Zod schemas; module-local Drizzle schemas feed
  the backend schema aggregate. No app-to-app imports or business schemas moved
  into the database infrastructure package.
- ADR-0002 requires generated migrations and disposable database evidence;
  ADR-0010 governs owner authorization/audit; ADRs 0011/0012 govern dictionary
  transactions, worker privileges and two-release job format activation;
  ADR-0016 requires real-browser evidence; ADR-0020 keeps audio independent.

## Proposed design and interfaces

These targets now describe the implemented contract, subject to final review and
the limitations recorded in EVIDENCE.md.

1. Keep generation configuration and immutable revisions in the dictionary module,
   adjacent to the jobs they govern. Expose focused application operations/ports
   for admin inspection and mutation. Administration owns authorization and routes;
   infrastructure composition supplies an atomic settings/audit transaction seam.
   Avoid building a speculative cross-product provider service.
2. Persist a global selection revision containing active provider, enabled catalog
   model IDs and default model. Separate immutable routing/budget revisions from
   transient provider health. Never store keys in these rows. Model catalog entries
   declare supported job formats and protocol, per-call context/output caps,
   separately bounded aggregate job/batch allowances, and pricing bounds. Existing
   batch envelopes (262144 input / 40960 output) are totals across calls, not model
   request limits. A single-call card/authoring request must never send a batch
   allowance as its model output limit. Budget estimation/reservation and each
   call must apply compatible caps and account for prompt/schema overhead.
   Activation validates support for every currently enabled text-generation format;
   reject incompatible global defaults rather than disable established workflows.
3. Proposed admin endpoints: GET/PATCH `/api/admin/ai-settings` with version/reason
   on PATCH and a sanitized catalog/status response. Confirm project path/error
   conventions before contracts. No free-form URL/model/key input and no paid
   request hidden behind GET, Save, or a readiness button.
4. Resolve the active configuration inside job admission, reserve the matching
   budget and pin its immutable execution identity in one transaction. Idempotent
   replay checks the existing job first; a settings change must not turn the same
   client request into a conflict or second charge. Legacy jobs have an explicit
   legacy routing identity during transition; never backfill them from a later
   mutable admin default without proving original provenance.
5. Worker dispatch resolves the pinned revision into a Mastra agent/provider
   factory. Cache only by immutable revision, with bounded cache size; configuration
   activation applies to new jobs immediately through the DB admission path.
   Retain old revisions while referenced work/proposals remain. Disabled models
   drain admitted jobs; secret revocation remains the operational stop mechanism.
6. Readiness is provider-specific. Worker-owned checks publish bounded, sanitized,
   timestamped capability/credential observations for admin/API consumption;
   stale/unknown status must not be labeled healthy. Avoid requiring API processes
   to possess worker model keys. Model listing is not structured-generation proof.
7. Add explicit DeepSeek/Kie text credential bindings, documenting the reuse of
   `DEEPSEEK_API_KEY` / `KIE_API_KEY` for text only where allowed in the worker
   environment. Preserve the legacy `DICTIONARY_GENERATION_MODEL_*` compatibility
   path until explicitly switched; define precedence and reject ambiguous setup.
   Leave `DICTIONARY_AUDIO_KIE_API_KEY` and audio budgets unchanged. Never silently
   enable Mastra merely because a vendor key exists.
8. Roll out additive persistence/worker support first, activation second. If new
   job semantics require format versions, follow all six lifecycle declarations
   and rollback-floor checks. An old worker must never claim pinned work and ignore
   its routing data. Review worker DB grants and immutable release metadata.
   Revert defaults through a new revision; do not drop referenced revisions/tables
   as rollback. Drain before retiring legacy support.

## Test and review strategy

Apply testing, db-verification, frontend-development, ui-ux-composition,
browser-verification, user-flow-e2e and code-review skills when executing their
surfaces. No supplied design exists; use existing admin patterns and tokens.

- Unit/provider contracts: pinned Mastra request mapping for both vendors; valid
  and malformed JSON/schema output; absent/invalid usage; unsupported models;
  missing credentials, throttling, timeouts, cancellation, no implicit fallback;
  catalog limits and budget calculations; per-call caps versus aggregate batch
  envelopes, context/schema overhead, aggregate reservation limits, mixed-format
  activation rejection; smaller-cap models across maximum supported batch/document
  inputs and default switches between capability envelopes; stale health and
  bounded caching.
- Disposable PostgreSQL/Redis integration: configuration/audit atomicity, owner
  revocation and recent auth, success and authorized-rejection audit outcomes,
  ADR-0010 retention/pruning and event fields, optimistic conflicts, admission/default races,
  idempotency across revision changes, recovery/retries, immutable snapshots,
  legacy migration, constraints, worker privileges and mixed-version claiming.
  Verify clean migration, repeat/concurrent runner safety and forward rollback
  compatibility; do not point tests at ordinary local or shared databases.
- HTTP/contracts: Zod inputs/outputs, unknown field rejection, no secrets, status
  mapping and trusted catalog/endpoint restrictions. Component tests cover admin
  selection, unsaved/saved state, conflicts, credential/health states and access.
- Real E2E: admin saves selection, web admits a job, real worker consumes it using
  an injected deterministic provider transport, proposal is reviewed/accepted;
  switch default while work is queued and prove old/new jobs use different pinned
  revisions; non-owner denial. Do not mock internal persistence or routing.
- Browser: project-pinned safe wrapper, desktop and narrow viewport, light/dark,
  keyboard, errors/loading/conflict states; no unexpected console/network errors.
- Focused commands from root: `pnpm --filter @languon/backend test -- <exact-test-files>`,
  equivalent admin/contracts tests, affected workspace lint/typecheck/build,
  `pnpm db:check`, and scoped Prettier checks. Resolve file paths before execution;
  placeholders here are not executable evidence. Final feature checks use the
  repository-required checks with final-patch evidence validity.
- Live vendors: recheck official specs at implementation time; controlled synthetic
  smoke per selected model only if authorized. Record vendor/model/date/protocol,
  validation/usage result and cost cap without keys, prompts or raw responses.
  Deterministic proof alone does not establish live compatibility.
- Independent completion review: required after author preflight, all ACs/diff.
- Security review: required for admin writes, SQL, credential references, external
  requests and model output; assess SSRF, authorization/audit and leakage.
- Separate tester: required for the new admin-to-worker cross-application journey
  and concurrent/default-switch/mixed-worker evidence. Bounded assignment: assess
  harness isolation and whether tests exercise actual routing/admission invariants.

## User-flow documentation and E2E

Current mappings inspected on 2026-09-23; both synchronized. Inspection proves
traceability only, not execution. Preserve existing IDs and revise markers only
when corresponding guide semantics change.

| Guide                   | Reviewed command / exact mapped files                                                                                                                                           | Critical scenarios                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dictionary-platform`   | `web-playwright`: `pnpm --filter @languon/web test:e2e`; `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`                                                              | `owner-creates-edits-and-restores-dictionary`, `anonymous-reader-forks-unlisted-dictionary`, `card-ai-proposal-survives-review-and-conflict`, `inline-ai-card-authoring-preserves-field-choices`, `batch-generation-review-commits-selected-cards`, `document-generation-cleans-original-and-commits-final-review`, `quizlet-import-and-export-round-trip` |
| `admin-user-management` | `admin-user-management`: `pnpm test:e2e:admin-user-management`; `apps/admin/tests/e2e/admin-user-management.journeys.spec.ts`, `infra/deploy/tests/admin-edge.journey.test.mjs` | `admin-owner-password-login-and-user-inspection`, `admin-owner-disable-and-restore-user`, `admin-owner-cancels-scheduled-deletion`, `admin-recent-authentication-required`, `admin-non-member-denied`, `admin-owner-passkey-login`, `admin-private-edge-authentication`                                                                                    |

The implemented guide is `docs/user-flows/ai-provider-management.md`. Its current
mapped browser scenario lives in the existing guarded admin journey file,
`apps/admin/tests/e2e/admin-user-management.journeys.spec.ts`, and has passed with
disposable PostgreSQL/Redis infrastructure. Remaining cross-application coverage
and final traceability checks are tracked under M5 and EVIDENCE.md.

New stable scenarios: `admin-configures-dictionary-ai-default`,
`dictionary-ai-jobs-retain-provider-selection`, `admin-ai-settings-non-owner-denied`,
`admin-ai-settings-conflict-recovery`. Existing dictionary guide executes its exact
mapped file against guarded dictionary E2E infrastructure; existing admin guide
retains its composite command including edge test. Use synthetic accounts only.

During implementation update README, operation instructions, guide index and
source mappings. Run `pnpm docs:user-flows:check` and
`pnpm user-flow:e2e -- check <slug>` for each affected guide; record exact executed
scenario selection and cleanup in EVIDENCE.md. Related release/Studio guides need
new inspection if touched. No guides are changed in this planning turn.

## Milestones

- [x] M0 — Repository discovery and reviewable planning artifacts.
      Scope, architecture, current guide mappings and all AC verification methods
      recorded. Planning validation only: see E-P1/E-P2 in EVIDENCE.md.
- [x] M1 — Compatibility and architecture contract (AC-1, AC-6, AC-7, AC-9).
      Inspect pinned Mastra transport and both vendor specifications; choose initial
      model IDs/protocols and readiness strategies. Write fixture-driven adapter
      contract tests and a proposed indexed ADR for configuration ownership, atomic
      audit/admission, credential/readiness boundaries and rollout. Verify no conflict
      with accepted ADRs; strategic changes require a decision before dependent code.
- [x] M2 — Persistence, contracts and admin application operations (AC-2–4, AC-7, AC-9).
      Generate additive migrations, configuration revisions, job routing snapshots,
      admin schemas/routes/audit and worker grants. Verify transactional races,
      permissions, idempotency, migration and legacy/mixed-version behavior using
      disposable services before activating new admissions.
- [x] M3 — Mastra provider routing and worker integration (AC-1, AC-3–7, AC-9).
      Wire DeepSeek/Kie factories for each existing generation format, per-job budgets,
      credential binding, health observations and bounded caching. Verify fake vendor
      contracts and real worker integration, retries, cancellation and queued switches.
      Record any separately authorized live-smoke evidence and its limitations.
- [x] M4 — Admin AI settings page (AC-2, AC-8).
      Add lazy Refine resource, data-provider operations and Ant Design stateful form.
      Validate component/contracts, authorization failures, concurrent saves and real
      desktop/narrow browser states using the running backend.
- [x] M5 — Cross-application evidence and documentation (AC-5, AC-9, AC-10).
      Extend guarded E2E setup, create/update guides and mapped scenarios, verify
      deployment expand/activate/rollback compatibility, run affected regression and
      static/build checks. Separate tester assesses cross-app/concurrency coverage.
- [x] M6 — Author preflight, independent reviews and verified completion (all ACs).
      Reconcile acceptance-to-proof table, inspect final diff, run independent
      completion/security review, remediate and revalidate affected evidence. Follow
      feature Git policy only after implementation is authorized and complete; never
      squash-merge a planning-only feature as if it were delivered.

## Current progress

- 2026-09-23 — Created the feature workspace and branch; completed the initial
  architecture and verification plan.
- 2026-09-23 — After explicit implementation authorization, added persisted
  versioned settings, pinned job routing, DeepSeek/Kie adapters, admin contracts/UI,
  deployment gates, migration, documentation, and deterministic coverage. Focused
  database, unit, admin E2E, and real-browser checks passed during development.
- 2026-09-23 — Added the mapped admin-to-worker system journey. It exposed and
  verified a mixed-provider budget-accounting correction: claim checks now compare
  usage only within the job's immutable policy envelope.
- 2026-09-23 — Final lint, build, unit, disposable database, migration, deployment,
  guide, browser/E2E, completion, security, and verification checks completed.

## Decisions and discoveries

- D-1 — Mastra stays the agent layer; vendor adapters handle incompatible transport
  details. Replacing Mastra or moving calls into HTTP handlers is out of scope.
- D-2 — One global active text provider/default now; enabled curated catalog is the
  extension point for later user choices. No user preference schema/API now.
- D-3 — Server-side environment credentials and fixed endpoint catalogs avoid a new
  secret-storage system and arbitrary outbound destinations. Dynamic key entry
  and unrestricted discovery rejected for this scope. Capture durable rule in M1 ADR.
- D-4 — Pin routing/budget at admission to make default changes and retries
  deterministic. Mutable dispatch-time defaults rejected. M1 ADR must preserve
  ADR-0012 rollback-floor and format lifecycle constraints.
- D-5 — Existing DeepSeek playground wiring is not dictionary compatibility proof;
  Kie TTS wiring is not text support. Official docs previously inspected:
  https://api-docs.deepseek.com/guides/json_mode and
  https://docs.kie.ai/market/gemini/gemini-2-5-pro . Refresh in M1; do not hard-code
  legacy playground model names as an up-to-date catalog.

## Validation links

[Acceptance coverage and evidence](./EVIDENCE.md), [review state](./REVIEW.md).
Deterministic evidence covers the complete internal journey. No paid live vendor
request was made, so current account/model readiness remains an explicit
activation limitation.

## Remaining work

No feature implementation work remains. Production activation still requires a
compatible worker rollout, managed-routing gate activation, configured worker
credentials, and a separately authorized bounded live smoke check.
