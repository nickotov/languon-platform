# Backend architecture instructions

## Architecture

Follow domain-driven design per business module. Dependency direction is:

```text
interface/infrastructure -> application -> domain
```

- `domain` contains entities, value objects, domain services, policies, and
  repository contracts. It must not import Hono, PostgreSQL/Redis clients,
  Mastra, Langfuse, model SDKs, or environment configuration.
- `application` coordinates use cases and transaction boundaries. Use
  constructor dependency injection and depend on domain or application ports.
- `infrastructure` implements persistence, cache, AI, observability, messaging,
  and other external adapters.
- `interface` owns Hono routes, authentication/authorization boundaries,
  request/response mapping, OpenAPI metadata, and transport errors.

Do not query PostgreSQL or Redis from domain or application code. Do not expose
database rows, SDK types, or Hono contexts across layer boundaries.

## Persistence readability

When adding or changing module Drizzle persistence implementations:

- Keep each handwritten implementation file within 500 nonblank, noncomment
  lines. The authoritative size and spacing rules are in
  [`scripts/eslint-persistence-readability.mjs`](../../scripts/eslint-persistence-readability.mjs),
  enforced by the normal ESLint commands. Declarative `schema.ts` files and
  tests are excluded from this implementation-size policy.
- Extract cohesive operations or responsibilities into clearly named internal
  modules before reaching the limit. Keep the public store interface stable.
  Use explicit typed dependencies and the existing transaction when extracting
  persistence operations. Keep related queries and invariants together.
- Separate validation, reads, decisions, writes and result construction with
  blank lines where the logical stage changes. Separate methods visibly. Use
  named intermediate values when nested expressions obscure intent, then run
  ESLint and Prettier on the affected files.
- Preserve transaction boundaries, lock ordering, query behavior, authorization,
  idempotency, cancellation and settlement semantics during extraction. Verify
  affected repository behavior against disposable infrastructure.
- Do not compress code, remove useful whitespace, create numbered fragments,
  introduce inheritance chains, or move unrelated logic into generic helper
  files to satisfy the limit. A temporary exception requires a specific
  rationale in the active work record and an exact, reviewed numeric allowance
  in lint configuration; never disable the rule for an entire directory.

## API and validation

- Validate path, query, header, body, environment, event, and external API data
  with Zod at the boundary.
- Define reusable boundary schemas in `@languon/contracts`; derive types from the
  schemas.
- Document externally reachable operations in OpenAPI and keep response status
  codes and error shapes explicit.
- Map domain/application failures to transport failures in interface code.
- Preserve request cancellation and avoid unbounded model or database work.

## AI and prompts

Keep Mastra agents, model providers, tool implementations, and Langfuse clients
in infrastructure. Resolve prompt identifiers through `@languon/prompts` and
retain deterministic local fallbacks for development and tests. Treat model
output as untrusted input and validate structured results before domain use.

### Mastra primitive registration

Whenever backend work adds or materially changes a Mastra agent, tool,
workflow, processor, or scorer, follow the registration checklist in
[`docs/development.md`](../../docs/development.md#registering-mastra-primitives).
Do not rely on filesystem discovery or create a Studio-only copy.

Before completing that work:

1. Keep the primitive in its owning module's infrastructure layer and expose it
   through a focused module composition factory.
2. Register it in `apps/backend/src/mastra/composition.ts`; register standalone
   tools in the canonical `tools` map and also attach tools to every agent that
   may call them.
3. If Studio must execute it, extend the development server policy only for its
   exact ID, route, and validated request shape. Preserve model, prompt, tool,
   step, concurrency, Host/Origin, and generic-proxy restrictions. Follow the
   root feature/security workflow whenever this changes the execution boundary.
4. Wire playground execution only to synthetic fixtures and isolated
   playground infrastructure. Production user identity must come from verified
   interface-layer authentication and a server-created request context, never
   from a caller-selected Studio field.
5. Run focused registry/policy tests and verify discovery plus a deterministic
   execution in the real `pnpm dev:mastra` Studio/API journey. Update the Mastra
   user-flow guide and mapped evidence when its observable journey changes.

Completion requires every intended playground primitive to be discoverable and
executable through the canonical composition, or an explicit durable reason
that the primitive is intentionally excluded from Studio.

## Commands

```sh
pnpm dev:backend
pnpm --filter @languon/backend test
pnpm --filter @languon/backend test:coverage
pnpm --filter @languon/backend typecheck
pnpm --filter @languon/backend build
```

Use integration tests with disposable PostgreSQL/Redis for repositories,
transactions, cache behavior, and migrations. Unit-test domain logic without
infrastructure mocks. Any database change must use `$db-verification` and record
forward migration, rollback when safe, and invariant evidence.
