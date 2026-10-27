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
A mandatory backend stage additionally exercises real admission, provider factories,
SDK serialization and production worker timing with fake external HTTP.
It never calls paid providers or reuses the normal development database.

```sh
pnpm test:e2e:critical -- --list
pnpm test:e2e:critical
pnpm test:e2e:critical -- --flow ai-execution-contracts
pnpm test:e2e:critical -- --flow setup-to-generation
pnpm test:e2e:critical -- --flow authentication --flow admin-session-refresh
```

Docker and the project-pinned Chromium installation are prerequisites. The runner
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
CI runs this gate before producing release images and uploads failure artifacts.

## Registered coverage

The authoritative IDs and exact test selections are in
[`scripts/critical-flows/registry.mjs`](../../scripts/critical-flows/registry.mjs).
Use `--list` for current entries. The initial registry covers:

- Empty database: admin publishes required settings and grants credits, then a
  learner detects/translates a folderless text, saves and reloads it.
- Password signup/login/session restoration, password reset and virtual passkeys.
- Admin expiry/refresh and independent recent-sign-in enforcement.
- Admin MCP token issuance, scoped discovery, client instructions, narrow-screen
  revocation and bounded idempotent credit adjustment through real HTTP.
- Dictionary generation and persisted result recovery.
- Sentence generation, AI checking, unavailable-model guidance with preserved
  answers and AI preferences, and free saved-reference practice for owners and
  shared readers.
- Text generation, saving, reload and independent/folder organization.
- Chat reconnection, Stop and explicit retry after failure.
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

| Affected seam                                         | Required retained regression evidence                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt, schema or admission envelope                  | Real admission budget into the actual provider factory, including normal and reduced allowance; outgoing limits and structured validation. |
| Model routing, provider factory or SDK settings       | Actual default router/factory and SDK with strict fake external HTTP; exact model/output limits, bounded retries and capability isolation. |
| Worker construction, deadline, Stop or lease handling | Production composition/defaults; success beyond the previous cutoff, hard timeout, cancellation/lost ownership, and no late publication.   |
| Accounting or shared generation configuration         | Real disposable PostgreSQL admission, claim and settlement, plus the complete critical gate.                                               |
| Browser interaction only                              | Affected browser journey and relevant component tests; execution checks when the changed path also touches a seam above.                   |

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

`ai-execution-contracts` runs full retained sentence-store, text-selection and
dictionary-admission integration suites, plus production sentence-worker runtime
regressions and speech provider/configuration/accounting/worker suites. Speech
execution uses real saved-source resolution and private storage; only provider
HTTP is synthetic. The runner owns a separate disposable database and rejects missing
suites, too few tests, skipped/todo/expected-failure tests, retries and incomplete
reports. CI already executes this entry through `pnpm test:e2e:critical`; required
checks must not rely on opt-in environment variables silently skipping tests.

Run the focused stage while iterating. Shared model, worker, accounting or
configuration changes require the complete gate before handoff. Extend the
reviewed registry selection when another critical capability needs production
execution coverage; keep exhaustive cases in focused lower-layer tests. Replace
only external transport in execution-contract tests, reject unexpected network
calls, and use synthetic inputs without real credentials. This gate never grants
permission for paid provider calls.

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
   Shared auth/accounting/model/worker/configuration changes require the full
   critical gate before handoff. New critical features become part of that same
   gate; they do not need another standalone verification workflow.
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
