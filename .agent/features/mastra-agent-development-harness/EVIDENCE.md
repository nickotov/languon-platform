# Verification evidence: Mastra Agent Development Harness

Updated: 2026-08-16

Record exact commands, concise results, relevant scenarios, and remaining risks.
Do not paste full logs when a focused excerpt or artifact reference is enough.

## Automated tests

### Unit

- Command: `pnpm --filter @languon/backend exec vitest run`
- Result: Passed — 29 files and 194 tests passed; 5 files and 35
  infrastructure-gated tests skipped. The Mastra playground journey is executed
  separately against disposable PostgreSQL.
- Coverage added: canonical registry gating, request-context/input/output schema
  validation, application-port authorization, cancellation, sanitized traces,
  missing-model-key tripwire behavior, deterministic workflow/scorer execution,
  modern/legacy step caps, generated-server Host/Origin and exact mutation policy,
  caller-override/body/concurrency refusal, telemetry enforcement, playground URL/
  environment aliases, and root command composition.

### Integration and contract

- Command: live `pnpm dev:mastra`, followed by loopback requests to
  `/api/openapi.json`, `/api/agents`, `/api/tools`, `/api/workflows`,
  `/api/scores/scorers`, the tool execute endpoint, and workflow create/start/run
  endpoints.
- Result: Passed — discovery returned the registered development agent, tool,
  workflow, and scorer; OpenAPI returned `200`; tool and workflow execution
  returned the deterministic synthetic principal and sanitized trace. Agent
  generation without `OPENAI_API_KEY` returned a `200` tripwire result naming
  the required variable and performed no model request.
- Behavior validated: canonical HTTP discovery/execution, validated request
  context, application repository access, actionable credential failure, and
  continued deterministic primitive availability. The hardened real server
  returned `403` for hostile Host/Origin headers, caller model overrides,
  generic model proxies, unrelated mutations, and arbitrary primitive suffixes;
  hostile origins also received `403` on generated `__refresh` and active-run
  restart hooks, while same-origin refresh and exact tool/workflow stream actions
  remained successful.

### E2E

- Command: `node scripts/run-mastra-playground-e2e.mjs`
- Result: Passed — 1 file and 1 journey passed against an ephemeral
  `postgres:17-alpine` container; the wrapper stopped its uniquely named
  container afterward.
- Journeys validated: database creation, all five forward migrations,
  deterministic active/verified principal seed, workflow execution through the
  real Drizzle reader, repeated non-destructive provisioning, write persistence,
  isolation from a simultaneously existing ordinary `languon` database, reset
  refusal without exact confirmation, and confirmed reset/reseed with marker
  removal.

## Real application verification

- Environment: local PostgreSQL from Compose, dedicated
  `languon_mastra_playground`, Mastra CLI 1.25.0 / core 1.57.0, Studio and API
  bound to `127.0.0.1:4111`, no `OPENAI_API_KEY` or Langfuse credentials.
- Scenario: start the root command from the repository root; inspect API
  discovery; execute tool and workflow; invoke the keyless agent; temporarily
  edit and restore the checked-in prompt; use project-managed browser session
  `languon-mastra-ae99c97a3b5df6951e7ff54cb30ba132` to inspect agent, workflow,
  tool, scorer, and request-context presets and execute the tool; then terminate
  the root command.
- Observed result: provisioning reused only the dedicated database, Mastra
  reached ready state, backend and prompt edits each triggered automatic bundle
  and server restart, Studio displayed both context presets and the registered
  primitives, Studio tool execution returned the expected principal and
  sanitized trace, browser JavaScript errors were empty, and shutdown completed
  cleanly. Studio attempted only its cosmetic `models.dev` provider-logo lookup
  outside loopback; the repository wrapper did not authorize it. No external
  model/application request occurred.
- Artifacts: synchronized current guide
  `docs/user-flows/mastra-agent-development-harness.md`; no generated browser or
  Mastra output is tracked.

## Static checks

- Full command: `pnpm check`
- Format: Passed — repository Prettier check.
- Lint: Passed — repository ESLint check; generated `.mastra` output is excluded
  explicitly from Git and ESLint.
- Typecheck: Passed — all 7 workspace packages / 10 Turbo tasks.
- Tests: Passed — root script checks and all workspace test tasks.
- Build: Passed — all 7 workspace build tasks, including the backend playground
  command and copied canonical migrations.
- Documentation/traceability: `pnpm docs:user-flows:check`,
  `pnpm user-flow:e2e -- check mastra-agent-development-harness`, and
  `pnpm user-flow:e2e -- check user-authentication` passed. The authentication
  E2E was not rerun because its observable journey and contract are unchanged;
  its source mapping/check remains synchronized.

## Database verification

- Migration command: `node scripts/run-mastra-playground-e2e.mjs`; schema
  declaration also checked with `pnpm db:check`.
- Forward result: Passed — canonical forward migrations applied to a database
  created from an empty PostgreSQL instance and remained idempotent.
- Rollback result: Not applicable — accepted ADR-0002 is forward-only. The
  explicit exact-name reset path was verified instead and rebuilt current state.
- Data/invariant checks: active and verified fixture, stable IDs, conflict-safe
  idempotent seed, ordinary-database isolation, persisted marker on ordinary
  restart, refusal without confirmation, and marker removal plus fixture
  regeneration after confirmed reset all passed.

## Review

- Reviewer result: Passed after remediation — the final focused correctness
  review found no material issue.
- Tester result: Passed — 31 focused tests, 3 orchestration tests, 194 backend
  tests, full checks, and the disposable journey passed; no material test gap
  remains.
- Security reviewer result: Passed — the final re-review found no material
  security finding.
- Findings resolved: corrected built migration-folder discovery, request-context
  defaults, lifecycle lock scope, and command orchestration coverage; hardened
  the generated server against Host/Origin rebinding, generic proxy access,
  caller model/prompt/provider/tool/version overrides, oversized/unbounded and
  concurrent agent work, arbitrary mutation suffixes, telemetry, and database URL
  aliases; pinned modern and legacy model execution to the same three-step cap.

## Remaining risks

- Credentialed live model smoke was intentionally not run because no development
  key was supplied; deterministic keyless coverage proves the default path.
- Mastra reports in-memory framework storage for Studio run metadata. Persistent
  workflow/eval/trace storage is explicitly deferred and documented; product and
  playground PostgreSQL data are unaffected.
- Mastra Studio owns a cosmetic `models.dev` provider-logo lookup. The safe
  repository browser wrapper leaves it unauthorized; it is not part of harness
  execution or application data flow.
