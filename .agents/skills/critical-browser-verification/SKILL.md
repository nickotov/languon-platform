---
name: critical-browser-verification
description: Run a bounded exploratory Languon critical-flow checklist in the real local browser, optionally delegated to Luna, and report interaction/network evidence. Use after setup or implementation when manual browser evidence is needed. Do not use as a replacement for required Playwright tests or to configure production.
---

# Critical browser verification

Read the selected flow in the [critical workflow guide](../../../docs/operations/critical-workflows.md)
and follow `$browser-verification` for the safe wrapper, synthetic accounts,
network/console inspection and session cleanup. Use `$local-test-setup` when
prerequisites are missing; do not bypass readiness by disabling accounting.

Reuse valid Playwright evidence for assertions it covers. For remaining manual
observations, give a bounded worker the flow ID, local URLs, synthetic starting
state, expected results and failure cases. Use `gpt-6-luna` when available and
the user requests Luna or authorizes this workflow's delegated verification.
Pass no previous verdict or expected implementation diagnosis. If unavailable,
disclose the model used; do not claim Luna execution.

The worker must:

1. Inspect the starting page through a task-scoped safe browser session.
2. Perform each selected interaction, check the rendered result, then reload
   when persistence matters. Check narrow viewport when layout is in scope.
3. Capture unexpected console errors and failed requests, including endpoint,
   status and correlation ID when available, without authentication or personal
   payloads. Explicitly assert expected failures rather than ignoring them.
4. Report reproduction at the first actionable blocker; continue independent
   observations only when their prerequisites hold.
5. Close its session and return per-step pass/fail/unverified results with model,
   tool, environment, revision/patch, observations and artifact paths.

The implementation agent owns diagnosis and repairs. Convert newly discovered
critical regressions into durable tests at the correct layer, rerun them and the
affected registered flow. Escalate ambiguous failures for stronger diagnosis
rather than repeating blind actions. Never report skipped steps as passing or
label exploratory browser verification a Playwright E2E result.
