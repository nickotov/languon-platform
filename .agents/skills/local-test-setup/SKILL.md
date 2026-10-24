---
name: local-test-setup
description: Inspect and configure Languon local testing prerequisites using reviewed setup profiles and existing admin controls. Use when preparing a local manual test, diagnosing missing setup, or enabling documented local prerequisites. Do not use for production provisioning, database resets, or paid generation.
---

# Local test setup

Read [local testing setup](../../../docs/operations/local-testing-setup.md) and
its profile definitions before changing settings. Root authorization still applies.
A request to prepare local testing authorizes documented local settings;
a diagnosis-only request authorizes inspection only.

1. Identify the local target, selected profile and intended critical flow. Inspect
   the doctor result and configuration preview. Never assume localhost means
   disposable or that an existing database may be reset.
2. Use the checked-in configuration command and existing admin contracts.
   Keep tokens and credentials in ignored environment files or process input;
   never print them or store browser authentication artifacts in evidence.
   If authentication/recent sign-in is required, report that exact prerequisite.
3. Apply only missing/different settings within existing authorization. Do not
   overwrite unrelated preferences, duplicate grants, reset accounts/content or
   invent provider prices. A real provider profile does not authorize paid calls.
4. Rerun doctor and preview. A second application must require no settings
   mutation. Report blockers with the admin page/field or environment setting.
5. Verify the intended registered critical Playwright flow. Use
   `$critical-browser-verification` for missing manual observations. Configuration
   success alone is not generation success.

For a new important feature, register its prerequisites and critical flow under
[critical workflow verification](../../../docs/operations/critical-workflows.md)
in the same delivery. Do not create independent hard-coded setup instructions.

Finish with target/profile, changed setting names (no secrets), readiness,
idempotence, executed journey and missing evidence. Do not restart or stop
user-owned services unless authorized.
