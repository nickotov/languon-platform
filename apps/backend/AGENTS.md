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
