---
type: operations
title: Critical workflow verification
source_paths:
    - scripts/critical-flows
    - scripts/run-critical-flows.mjs
    - scripts/check-critical-flows.mjs
    - .github/workflows/reusable-verify-build.yml
    - apps/backend/src/modules/learning/infrastructure/sentence-worker-runtime.ts
    - apps/backend/tests/unit/infrastructure/worker/sentence-worker-runtime.test.ts
---

# Critical workflow verification

The critical suite verifies established app journeys through real web/admin,
backend, PostgreSQL, Redis and workers with deterministic external AI adapters.
Selectable backend stages additionally exercise real admission, provider factories,
SDK serialization and production worker timing with fake external HTTP.
It never calls paid providers or reuses the normal development database.

```sh
pnpm test:e2e:critical -- --list
pnpm test:e2e:critical -- --plan --flow ai-conversation
pnpm test:e2e:critical -- --flow ai-conversation
pnpm test:e2e:critical -- --flow ai-shared-invariants --flow ai-dictionary
# Comprehensive regression: release, explicit request or justified broad impact.
pnpm test:e2e:critical
pnpm test:e2e:critical -- --flow ai-execution-contracts
pnpm test:e2e:critical -- --flow setup-to-generation
pnpm test:e2e:critical -- --flow authentication --flow admin-session-refresh
```

`--list` prints the catalog; with `--flow`, it prints the dependency-expanded
selection. `--plan` prints JSON with scope, exact file selections, commands and
minimum counts without building, acquiring a lock, creating evidence or starting
services. Without `--flow`, the plan explicitly describes the comprehensive gate;
without `--list` or `--plan`, an omitted selection **executes the full gate**.
Inspect a narrow plan before an expensive run. Do not infer adequate coverage from
a group name alone: inspect its files and the changed seam's consumers.

Docker is required for execution; browser entries additionally need the
project-pinned Chromium installation. The runner
builds shared dependencies, creates fresh owned containers, supplies synthetic
runtime configuration and executes exact Playwright and backend Vitest selections. It refuses
occupied ports and concurrent critical runs rather than stopping other services.
It removes only its own containers and their anonymous volumes, and releases its
run lock on normal completion
or handled failure. If killed forcibly, inspect ownership before cleaning a stale
lock or container. Do not reset a normal development database to make tests pass.

A success requires each flow's declared minimum number of executed tests, with no
skipped, flaky or unexpectedly failing tests. Inspect retained traces/reports for failed attempts;
a later passing rerun does not erase the defect or remediation from delivery evidence.
CI runs the comprehensive gate before producing release images and uploads failure
artifacts. Local task completion normally uses affected production-composition
entries and the relevant core browser smoke. A small presentation or tooling change
requires only its proportionate checks; it does not imply an AI stage.

`test-results/critical-flows/<run-id>/summary.json` records the selection, final
status, per-flow results and integer millisecond timings. Run timings separate
shared dependency `buildMs` from `totalMs`; each attempted flow separates container
startup/readiness `setupMs`, test-process/report-validation `executionMs`, owned
service `cleanupMs` and `totalMs`. Failed phases retain elapsed time; phases never
started are absent, not measured zero. An intermediate summary is marked
`incomplete`; it cannot prove completion. Test-process time includes test harness
migration/setup and is **not** pure test-body time: use retained Vitest/Playwright
reports or focused harness instrumentation to distinguish those costs. These are
observed durations, not forecasts or hard time budgets.

## Registered coverage

The authoritative IDs and exact test selections are in
[`scripts/critical-flows/registry.mjs`](../../scripts/critical-flows/registry.mjs).
Use `--list` for current entries. The initial registry covers:

- Empty database: admin publishes required settings and grants credits, then a
  learner detects/translates a folderless text, saves and reloads it.
- Password signup/login/session restoration, password reset and virtual passkeys.
- Admin expiry/refresh and independent recent-sign-in enforcement.
- Admin MCP token issuance, scoped discovery, client instructions, narrow-screen
  revocation, bounded idempotent credit adjustment and native provider-price
  publication/display through real HTTP.
- Native provider-source verification, exact TypeScript/PostgreSQL tariff parity,
  text-call receipt/checkpoint accounting, reported speech credits, immutable
  history and native overrun/refund behavior with synthetic external HTTP.
- Dictionary generation and persisted result recovery.
- Sentence generation, AI checking, unavailable-model guidance with preserved
  answers and AI preferences, and free saved-reference practice for owners and
  shared readers.
- Text generation, saving, reload and independent/folder organization.
- Chat reconnection, Stop and explicit retry after failure.
- Interactive workbook block authoring and uploaded audio, saved private practice,
  ordered shared reading, independent copies, revocation and inert hostile text.
- Knowledge H1/H2/H3 and thematic-break authoring, formatted proposal cards and
  pure read-only eye preview, desktop/mobile dismissal/focus, explicit apply/undo,
  saved/recovered/shared rich content and explicit unsupported-format fallback.
- Zero-credit rejection for paid work, with a visible error and preserved input.
- Free interview completion with zero learner credits.
- Shared speech playback, Free/Paid confirmation and cache reuse. Its browser
  entry requires the backend execution stage, including OpenRouter speech
  service/worker/storage settlement and fenced publication regressions.

Setup fixtures are appropriate for focused journeys. The empty-database journey
must configure the relevant settings through admin rather than seed those rows.
Synthetic auth owner bootstrap is separate from the configuration under test.

## AI execution regression matrix

Before implementing an AI-related correction, improvement or feature, record the
affected seams and exact checks in its active delivery record. Use this matrix to
select coverage; unrelated presentation changes do not require new AI tests.

| Affected seam                                         | Required retained regression evidence                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt, schema or admission envelope                  | Real admission budget into the actual provider factory, including normal and reduced allowance; outgoing limits and structured validation.            |
| Model routing, provider factory or SDK settings       | Actual default router/factory and SDK with strict fake external HTTP; exact model/output limits, bounded retries and capability isolation.            |
| Worker construction, deadline, Stop or lease handling | Production composition/defaults; success beyond the previous cutoff, hard timeout, cancellation/lost ownership, and no late publication.              |
| Accounting or shared generation configuration         | Real disposable PostgreSQL admission, claim and settlement via shared invariants and affected consumer groups; broaden when impact cannot be bounded. |
| Browser interaction only                              | Affected browser journey and relevant component tests; execution checks when the changed path also touches a seam above.                              |

For an incident, first retain a faithful failing regression when practical, then
verify the repair against that same path. Do not substitute an isolated successful
provider call. Use controlled clocks/delays rather than shortening a test-only
production deadline. Database tests retain real fencing and settlement; timing
unit tests can use a store port fixture to control cancellation and lease loss.

For routing, provider or shared generation configuration changes, retain a
submit-to-result regression for each changed provider family. Use the selected
production configuration shape and actual catalog model IDs, including namespaced
IDs such as OpenRouter's `vendor/model`. Cover Free policy without a customer
tariff and Paid policy with its published tariff wherever affected. In disposable
infrastructure, exercise normal submission, admission, queue/claim, the real
worker/router/provider SDK with only external HTTP replaced, persisted usable
review/result readback and final settlement. Assert both provider success and
controlled failure through real persistence, including circuit-breaker health
writes and hold release/no learner charge on technical failure. An admin probe,
doctor pass, admitted action or queued job alone is not end-to-end evidence;
provider response success can still fail during completion writes.

The reviewed backend selections partition the retained suites; no existing suite
or mandatory incident scenario was removed:

| Flow                     | Selection                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `ai-conversation`        | Conversation admission, production SDK/worker completion, stores, tutor and learner interview accounting.                   |
| `ai-knowledge`           | Knowledge/workbook persistence, field actions, private translation, learning epochs and account/learning purge.             |
| `ai-dictionary`          | Dictionary admission, generation completion, authoring, worker accounting and router gateway wiring.                        |
| `ai-text`                | Text selection and persisted text/private-translation execution.                                                            |
| `ai-sentence`            | Sentence stores, worker role/runtime and private free/paid generation/retention.                                            |
| `ai-speech`              | Speech provider/configuration/accounting/worker, knowledge audio and transcription production execution.                    |
| `ai-shared-invariants`   | Common pricing, admission, financial settlement, provider SDK observations, routing/probes and account-erasure persistence. |
| `ai-execution-contracts` | Compatibility aggregate: every backend suite above, with its existing aggregate minimum count.                              |

`ai-shared-invariants` is itself a substantial selection. During implementation,
run focused files/cases first; for task completion select it when common admission,
routing, provider configuration or accounting is affected, together with the
consumer groups that exercise the changed path. A dictionary-only change normally
selects `ai-dictionary` and the relevant browser flow, not every AI consumer.
A shared worker/configuration change requires tracing affected consumers rather
than treating the word “shared” as an automatic full-gate trigger. Record the
selection and rationale in the delivery record before execution. Broaden to the
complete backend aggregate or full critical gate when impact spans those surfaces,
cannot be reliably bounded, or release/scheduled/user-requested verification calls
for it. Uncertainty is a reason to investigate and, if unresolved, broaden.

The no-argument comprehensive gate retains all browser entries and the complete
backend aggregate, without executing its seam groups again. Explicit selections
combine groups and dependencies once. `speech-playback` requires `ai-speech`,
so targeted speech verification retains production execution without pulling in
unrelated AI domains. `text-generation` retains `setup-to-generation`. Dependencies
provide separate coverage in fresh services, never shared fixture state.

Every backend group uses the same disposable infrastructure, exact reviewed file
allow-list, serial execution and no-retry controls. Report checks require every
selected suite and its mandatory incident titles, reject unexpected or missing
files, too few tests, skips/todos/expected failures, retries and incomplete reports.
Only selected suites' incident titles are required for a narrow run; the aggregate
still requires every retained incident. CI continues to execute the complete gate.

For incident repair, iterate on its failing regression first, then affected
production composition and relevant core smoke after the patch stabilizes. Keep
exhaustive cases at their existing lower layers; no test deletion or weakened
assertions is authorized by narrower selection. Extend the reviewed selections
when a critical path needs coverage. Replace only external transport, reject
unexpected network calls and use synthetic inputs without real credentials. This
gate never grants permission for paid provider calls.

Record evidence precisely:

- Internal deterministic adapters establish browser journey behavior.
- Real production composition/SDK with fake HTTP establishes wiring, budgets,
  deadlines and controlled failure behavior.
- Explicitly authorized live calls establish only the observed provider behavior
  for that request; they do not replace reproducible regressions.

A passing browser fixture cannot establish live availability, production provider
construction or model quality. Required skipped or unavailable checks remain
missing evidence, even if other layers pass.

## Extend for a new important feature

1. Decide whether failure would block authentication, the core learning/content
   workflow, generation, charging, or preservation of user work. Register that
   journey as critical; keep exhaustive edge cases at cheaper test layers.
2. Reuse or add a real Playwright test and its normal user-flow guide mapping.
   Assert an observable outcome, relevant reload/persistence, visible material
   errors and unexpected console/network failures. Do not mock internal services.
3. Add a registry entry with stable ID, exact test file/selection, minimum test count, supported
   runtime prerequisite and required environment. Reuse existing orchestration;
   add a runtime adapter only for a genuinely different infrastructure need.
   Use `dependsOn` for prerequisite coverage that must run with a targeted flow;
   each dependency uses its own fresh environment, not shared test data. New
   scenario flags must also be added to the reviewed registry allow-list.
4. If it needs new configuration, extend the doctor capability requirements and
   reviewed profile definition, and regenerate/check setup documentation. Include
   its empty-start setup route in the admin setup journey where applicable.
5. Run registry validation, the affected critical entries and their setup path.
   Trace shared auth/accounting/model/worker/configuration changes to affected
   consumers and select their production-composition and core-smoke entries.
   Require the complete gate when the blast radius cannot be bounded or for
   release/scheduled/explicitly requested regression. New critical features join
   the existing gate; they do not need another verification workflow.
6. Record exact selection, revision/patch, runtime configuration, results,
   failures/remediation and limits in the active delivery record. Skipped or
   unavailable required flows remain missing evidence.

For additional visual/manual observations, use
[`critical-browser-verification`](../../.agents/skills/critical-browser-verification/SKILL.md)
with Luna where available. It uses the existing safe browser wrapper. This is
exploratory evidence, not a substitute for the registered regression gate.

## Manual development readiness

Use [local testing setup](./local-testing-setup.md) for the doctor and idempotent
admin configuration. Deterministic passing tests prove application behavior under
controlled provider output; they do not establish live provider availability or
model quality. Real-provider calls require separate explicit spending authority.

Prefer reviewed idempotent admin setup profiles and existing admin controls for
prerequisites. Do not create another setup CLI/MCP or invent commands to close an
evidence gap. When live spending is explicitly authorized, smoke-test each
affected flow as a synthetic learner through normal public APIs or the browser,
using the selected configuration and a bounded authorized cost. Follow the job
through persisted usable review/result readback and settlement; record the route,
funding policy, outcome and observed cost or unknown expense. A successful model
probe or enqueue does not complete this smoke. Without that authority or live
credentials, record live evidence as missing; keep the deterministic gate runnable
without live credentials or paid calls and report its result separately.
