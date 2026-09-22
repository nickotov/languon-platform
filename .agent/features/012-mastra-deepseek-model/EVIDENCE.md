# Verification evidence: Mastra DeepSeek Model

Updated: 2026-08-16

Record exact commands, concise results, relevant scenarios, and remaining risks.
Do not paste full logs when a focused excerpt or artifact reference is enough.

## Automated tests

### Unit

- Command:
  `pnpm --filter @languon/backend exec vitest run tests/unit/infrastructure/playground/playground-environment.test.ts tests/unit/modules/development-harness/infrastructure/mastra/development-harness-primitives.test.ts tests/unit/mastra/development-server-policy.test.ts`
- Result: Passed — 3 files, 50 tests on the final security-remediated tree;
  backend typecheck also passed.
- Coverage added: DeepSeek default/fallback environment output, generic valid
  `provider/model` primary, malformed model refusal, empty/whitespace DeepSeek
  key normalization, alternate-key isolation, no-key tripwire metadata,
  non-duplicated default model, ordered alternate-primary/fallback list, zero
  per-model retries, pinned DeepSeek HTTPS destination, dotted-provider URL
  override rejection, prompt-safe error logging, Studio request normalization,
  processor replacement rejection, and request bounds.

### Integration and contract

- Commands: backend typecheck; `node --test scripts/dev-mastra.test.mjs`; real
  generated-server requests to agent discovery, agent detail, OpenAPI, and
  no-key generation in default DeepSeek mode; agent detail in alternate
  `openai/gpt-5-mini` primary mode.
- Result: Passed — backend typecheck and 3 orchestration tests; real default
  metadata reported `provider=deepseek`, `modelId=deepseek-chat`, and
  `maxSteps=3`. No-key generation returned HTTP 200 with a non-retryable
  `DEEPSEEK_API_KEY` tripwire and no model steps/usage. Alternate configuration
  reported OpenAI/GPT-5 Mini as active primary while the focused composition
  assertion retained DeepSeek Chat second.
- Final generated-server regression: a representative current Studio stream
  body with `modelSettings: { maxRetries: 2 }` returned HTTP 200 and the
  expected no-key SSE tripwire; retry escalation and `inputProcessors: []`
  each returned HTTP 403. No external model call occurred.
- Behavior validated: environment-selected model configuration reaches the
  generated server, DeepSeek is the no-override default/fallback, missing
  fallback credentials fail before an external call, and the existing server
  policy remains assembled.

### E2E

- Command: `node scripts/run-mastra-playground-e2e.mjs` against its disposable
  Docker PostgreSQL container.
- Result: Passed on the final guide revision — 1 file, 1 scenario; runner
  removed its task-owned container.
- Journeys validated:
  `mastra-agent-development-harness/playground-provision-run-persist-reset`,
  including migrations, fixture/repository path, DeepSeek-configured
  deterministic workflow/scorer, restart persistence, application/admin
  database isolation, reset refusal, confirmed reset, and concurrency.

## Real application verification

- Environment: local Compose PostgreSQL, dedicated
  `languon_mastra_playground`, Mastra CLI 1.25.0/core 1.57.0, loopback Studio/API
  at `127.0.0.1:4111`, no DeepSeek or alternate-provider credential. Explicit
  safe environment values were supplied because the existing ignored
  `.env.local` lacks the playground URLs; that file was not modified.
- Scenario: boot and inspect default `deepseek/deepseek-chat`; make a no-key
  agent request; inspect Studio model details, errors, console, and network;
  restart with `openai/gpt-5-mini` as the alternate primary and inspect API and
  Studio; stop both servers and close both task-scoped browser sessions.
- Observed result: default Studio displayed `deepseek / deepseek-chat`;
  alternate Studio displayed `openai / gpt-5-mini`; both pages had no browser
  errors. Default console reported telemetry disabled. All application/API
  requests were loopback and successful. Studio attempted its known cosmetic
  `https://models.dev/logos/deepseek.svg` image, which the repository browser
  containment did not authorize. No paid model or other external application
  request occurred.
- Artifacts: no screenshot or generated Mastra output retained; browser
  sessions `languon-mastra-deepseek-model-af41e5f069e6d1d388d6a9158050b824`
  and `languon-mastra-alternate-primary-d22fc54079daecfa948f123dfcd542a3`
  were closed.

## User-flow guide verification

- Guides created or updated:
  `docs/user-flows/mastra-agent-development-harness.md`; no new guide because
  the provider choice is part of the same Studio/API/CLI/system journey.
- Commands and journeys checked: inspected before edits, synchronized the
  revision marker after behavior edits, ran the mapped journey, and checked
  the current guide.
- `pnpm docs:user-flows:check` result: Passed — 3 guides and mappings.
- `pnpm user-flow:e2e -- check mastra-agent-development-harness` result: Passed
  with revision `sha256:964c8e21a3371c9c`.
- Scenario IDs and exact E2E test files:
  `playground-provision-run-persist-reset` in
  `apps/backend/tests/e2e/mastra-development-harness.journey.test.ts`.
- E2E environment/command/result and cleanup: disposable PostgreSQL via
  `node scripts/run-mastra-playground-e2e.mjs`; 1/1 passed; runner cleanup
  completed.

## Static checks

- Full command: `pnpm check`.
- Format: Passed — repository Prettier check.
- Agent/docs checks: Passed — 14 skills and 3 user-flow guides/mappings.
- Lint: Passed — repository ESLint.
- Typecheck: Passed — 10/10 Turbo tasks.
- Tests: Passed — root script checks and all workspace tests; backend 213
  passed/35 intentionally skipped in ordinary no-infrastructure run.
- Build: Passed — 7/7 workspace build tasks.

## Database verification

- Migration command: Not applicable; no schema or migration changed.
- Forward result: Existing canonical migrations passed in the mapped disposable
  E2E journey.
- Rollback result: Not applicable.
- Data/invariant checks: mapped journey confirmed isolated target, admin and
  ordinary application database safety, persistence, and reset invariants.

## Review

- Tester result: Passed; no material verification gap remains in scope.
- Reviewer result: Passed; no material findings remain.
- Security reviewer result: Passed; no remaining material security findings.
- Findings resolved: credential-processor bypass, Studio request compatibility,
  workflow/internal route authority, model-step normalization, valid alias
  syntax, provider endpoint redirection (including dotted providers), and raw
  provider-error logging.

## Remaining risks

- Credentialed primary failure followed by a live DeepSeek response was not
  executed because no development `DEEPSEEK_API_KEY` is available and tests
  must not make paid/nondeterministic calls. The ordered Mastra-native fallback
  configuration and zero-retry bounds are asserted deterministically; live
  credential smoke remains an explicit developer opt-in.
- A local process can repeatedly invoke the unauthenticated loopback agent while
  a paid development credential is loaded. Per-run steps, retries, concurrency,
  body size, timeout, Host, and Origin are bounded; a cumulative local spend
  budget remains outside this development-only feature.
