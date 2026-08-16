# Independent review: Mastra DeepSeek Model

Reviewed: 2026-08-17
Reviewer: Independent reviewer and security reviewer agents
Verdict: Pass

## Scope reviewed

- Feature specification, ExecPlan, implementation diff, tests, guide, and
  recorded validation evidence.
- Generated Mastra server behavior for Studio chat, workflow streaming,
  authority checks, model-policy overrides, credential gating, and failure
  handling.
- DeepSeek and alternate-provider credential, destination, retry, logging, and
  cost boundaries.

## Findings

### Caller could replace the credential processor

- Severity: High
- Location: `apps/backend/src/mastra/development-server-policy.ts`
- Problem: generated agent requests accepted caller `inputProcessors`, allowing
  removal of the no-key tripwire.
- Impact: a no-key request reached model resolution instead of failing
  deterministically and caller execution policy was not pinned.
- Suggested fix: reject processor and other execution-policy overrides at the
  HTTP boundary.
- Resolution: Fixed. The exact execution envelope is allowlisted, nested
  policy keys and privileged roles are rejected, and real generated-server
  checks prove `inputProcessors: []` returns 403.

### Strict remediation broke generated Studio chat

- Severity: High
- Location: `apps/backend/src/mastra/development-server-policy.ts`
- Problem: generated Studio sends `runId`, `untilIdle: true`, and
  `modelSettings: { maxRetries: 2 }`; an initial strict allowlist rejected that
  normal request.
- Impact: the documented Studio agent journey could not execute.
- Suggested fix: accept the exact inert Studio envelope, strip retry settings
  before dispatch, and retain the server limits.
- Resolution: Fixed. The current generated server returns the expected 200 SSE
  no-key tripwire for the representative Studio request; retry escalation and
  processor replacement return 403. Unit coverage asserts the downstream body
  has no `modelSettings` and preserves a validated lower `maxSteps`.

### Workflow and internal mutation authority gaps

- Severity: High / Medium
- Location: `apps/backend/src/mastra/development-server-policy.ts`
- Problem: the workflow stream route was initially absent and internal refresh
  and active-run restart routes were outside the authority boundary.
- Impact: Studio workflow execution failed, while hostile origins could reach
  internal mutations.
- Suggested fix: allow the exact workflow stream path and apply Host/Origin
  authority checks to every route.
- Resolution: Fixed. Generated-server rechecks returned 200 workflow stream,
  403 hostile-origin internal mutations, and 200 same-origin internal hooks.

### Provider endpoint and prompt-log exposure

- Severity: Medium
- Location: model composition and process/server policy.
- Problem: Mastra registry strings honored provider `*_BASE_URL` values and
  default logging serialized prompt-bearing provider errors.
- Impact: credentials/prompts could be redirected or written to terminal logs.
- Suggested fix: pin the DeepSeek HTTPS origin, reject endpoint overrides, and
  suppress provider error payload logging.
- Resolution: Fixed. DeepSeek uses an explicit `https://api.deepseek.com`
  config, both Mastra-exact and normalized provider override names are refused
  (including dotted `wafer.ai`), and the harness uses `logger: false`.
  Intercepted-fetch coverage asserts the exact endpoint and absence of sentinel
  prompt/key material in captured console output.

### Valid model-router aliases were rejected

- Severity: Medium
- Location:
  `apps/backend/src/infrastructure/playground/playground-environment.ts`
- Problem: the model syntax rejected valid leading `@` and `~` model aliases.
- Impact: supported Cloudflare and OpenRouter model identifiers could not be
  selected.
- Suggested fix: admit those leading characters without weakening traversal,
  whitespace, or length protections.
- Resolution: Fixed with pinned-registry examples and malformed-ID regressions.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] Required user-flow guides match current behavior, commands, and expected
      outcomes.
- [x] Current guide maps its critical scenario to the disposable E2E test and
      its revision marker is synchronized.
- [x] No debugging artifacts or accidental scope changes remain in the current
      audit.

## Final verdict

Pass. No material findings remain. A real credentialed provider-failure
fallback was intentionally not run; deterministic transport, ordered fallback,
zero-retry, and generated-server checks are the proportional non-paid evidence.
