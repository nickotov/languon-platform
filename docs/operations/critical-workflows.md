---
type: operations
title: Critical workflow verification
source_paths:
    - scripts/critical-flows
    - scripts/run-critical-flows.mjs
    - scripts/check-critical-flows.mjs
    - .github/workflows/reusable-verify-build.yml
---

# Critical workflow verification

The critical suite verifies established app journeys through real web/admin,
backend, PostgreSQL, Redis and workers with deterministic external AI adapters.
It never calls paid providers or reuses the normal development database.

```sh
pnpm test:e2e:critical -- --list
pnpm test:e2e:critical
pnpm test:e2e:critical -- --flow setup-to-generation
pnpm test:e2e:critical -- --flow authentication --flow admin-session-refresh
```

Docker and the project-pinned Chromium installation are prerequisites. The runner
builds shared dependencies, creates fresh owned containers, supplies synthetic
runtime configuration and executes exact Playwright selections. It refuses
occupied ports and concurrent critical runs rather than stopping other services.
It removes only its own containers and releases its run lock on normal completion
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
- Dictionary generation and persisted result recovery.
- Text generation, saving, reload and independent/folder organization.
- Chat reconnection, Stop and explicit retry after failure.
- Zero-credit rejection for paid work, with a visible error and preserved input.
- Free interview completion with zero learner credits.

Setup fixtures are appropriate for focused journeys. The empty-database journey
must configure the relevant settings through admin rather than seed those rows.
Synthetic auth owner bootstrap is separate from the configuration under test.

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
