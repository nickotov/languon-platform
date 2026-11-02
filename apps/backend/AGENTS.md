# Backend architecture instructions

## Architecture

Use domain-driven design per business module with dependency direction:

```text
interface/infrastructure -> application -> domain
```

- `domain`: entities, value objects, domain services, policies and repository
  contracts; no Hono, PostgreSQL/Redis clients, Mastra, Langfuse, model SDK or
  environment configuration imports.
- `application`: use cases and transaction boundaries; constructor dependency
  injection through domain/application ports.
- `infrastructure`: persistence, cache, AI, observability, messaging and other
  external adapters.
- `interface`: Hono routes, authentication/authorization boundaries,
  request/response mapping, OpenAPI metadata and transport errors.

No PostgreSQL/Redis queries from domain/application code or database rows, SDK
types or Hono contexts across layer boundaries.

## Persistence readability

For added/changed module Drizzle persistence implementations:

- Limit handwritten implementation files to 500 nonblank, noncomment lines.
  [`scripts/eslint-persistence-readability.mjs`](../../scripts/eslint-persistence-readability.mjs)
  owns size/spacing rules, enforced by normal ESLint commands. Declarative
  `schema.ts` and tests are exempt from the size limit.
- Before reaching the limit, extract cohesive operations/responsibilities into
  clearly named internal modules with explicit typed dependencies and the existing
  transaction. Preserve the public store interface; keep related queries/invariants
  together.
- Separate validation, reads, decisions, writes and result construction with blank
  lines at logical stage changes; visibly separate methods. Name intermediate
  values when nesting obscures intent. Run affected ESLint and Prettier.
- Preserve transaction boundaries, lock ordering, query behavior, authorization,
  idempotency, cancellation and settlement semantics. Verify affected repository
  behavior against disposable infrastructure.
- Never satisfy the limit by compressing code, removing useful whitespace,
  numbering fragments, introducing inheritance chains or moving unrelated logic
  into generic helpers. Temporary exceptions need a specific active-record rationale
  and exact reviewed numeric lint allowance; never disable directory-wide.

## API and validation

- Validate path, query, header, body, environment, event and external API data
  with Zod at boundaries.
- Put reusable boundary schemas in `@languon/contracts`; derive their types.
- Document externally reachable operations in OpenAPI with explicit response
  status codes and error shapes.
- Map domain/application failures to transport failures in interface code.
- Preserve request cancellation; avoid unbounded model/database work.

## Environment configuration

Expose loaders through `src/config/environment.ts`; separate process-specific
schemas and load only at process startup. Define settings in their owning schema;
use `parseEnvironmentSchema` for sanitized fallback warnings and required/invalid
setting errors. Inject validated values into services; no environment reads in
generation code. Keep optional values without defaults quiet and conditional
requirements intact. Never print supplied values/credentials in diagnostics.

## AI and prompts

Keep Mastra agents, model providers, tool implementations and Langfuse clients
in infrastructure.
Resolve prompt identifiers through `@languon/prompts`; retain deterministic local
fallbacks for development/tests. Treat model output as untrusted; validate
structured results before domain use.

### AI execution regression coverage

For AI execution changes, follow the
[AI execution regression matrix](../../docs/operations/critical-workflows.md#ai-execution-regression-matrix).
Exercise production composition and admitted budget, replacing only external
provider HTTP. Cover affected reduced allowances, outgoing model limits and
unrelated-capability isolation. Worker timing changes require slow success,
bounded timeout and cancellation evidence with production defaults. Keep snapshot
validation and fenced settlement real in integration coverage.

For routing/provider/configuration changes, retain submission through real worker,
router and SDK to persisted usable result/review readback and settlement for every
changed provider family. Use selected production configuration and actual model
IDs, including namespaced IDs. Where affected, cover Free without a customer tariff
and Paid with its tariff. Verify success/failure persistence, including circuit-breaker writes,
against disposable infrastructure as the matrix requires.

Run the registered backend execution stage: mocked-agent unit tests, browser
fixtures, isolated provider success, admin probes, doctor readiness or
admission/enqueue alone do not prove completion or repair of a reported failing
execution path. Follow the matrix's live smoke rule when spending is explicitly
authorized; otherwise record missing live evidence separately from deterministic
results. Deterministic gates never require live credentials or paid calls.

### Mastra primitive registration

For added/materially changed Mastra agents, tools, workflows, processors or scorers,
follow [`docs/development.md`](../../docs/development.md#registering-mastra-primitives)'s
registration checklist; do not rely on filesystem discovery or create Studio-only copies.

Before completion:

1. Keep primitives in their owning module's infrastructure, exposed through a
   focused module composition factory.
2. Register in `apps/backend/src/mastra/composition.ts`; put standalone tools in
   the canonical `tools` map and attach tools to every agent that may call them.
3. For Studio execution, extend development server policy only for the exact ID,
   route and validated request shape. Preserve model, prompt, tool, step,
   concurrency, Host/Origin and generic-proxy restrictions. Execution-boundary
   changes follow root feature/security workflow.
4. Use only synthetic fixtures and isolated playground infrastructure for
   playground execution. Production user identity requires verified interface-layer
   authentication and server-created request context, never caller-selected Studio fields.
5. Run focused registry/policy tests; verify discovery and deterministic execution
   in the real `pnpm dev:mastra` Studio/API journey. Update the Mastra user-flow
   guide and mapped evidence for observable journey changes.

Every intended playground primitive must be discoverable/executable through
canonical composition or have an explicit durable reason for Studio exclusion.

## Commands

```sh
pnpm dev:backend
pnpm --filter @languon/backend test
pnpm --filter @languon/backend test:coverage
pnpm --filter @languon/backend typecheck
pnpm --filter @languon/backend build
```

Integration-test repositories, transactions, cache behavior and migrations against
disposable PostgreSQL/Redis. Unit-test domain logic without infrastructure mocks.
Every database change requires `$db-verification` and evidence of forward migration,
rollback when safe, and invariants.
