# Architecture

## System boundaries

Languon begins as a modular monorepo. Applications own delivery concerns while
shared packages expose narrowly scoped capabilities. Cross-workspace imports
must use package public exports; applications must not import another
application's source files.

```text
web / admin / mobile
        |
        v
   HTTP contracts
        |
        v
     backend
        |
        +--> PostgreSQL
        +--> Redis
        +--> Mastra / model providers
        +--> Langfuse
```

## Backend

The backend follows domain-driven design inside each business module:

```text
interface/infrastructure --> application --> domain
```

- Domain contains entities, value objects, domain services, and repository
  contracts. It has no Hono, database, cache, model-provider, or external SDK
  dependencies.
- Application coordinates use cases and depends on abstractions. Use
  constructor injection and explicit transaction boundaries.
- Infrastructure implements repositories and external adapters for PostgreSQL,
  Redis, Mastra, model providers, and Langfuse.
- Interface code owns Hono routes, authentication boundaries, request/response
  mapping, and OpenAPI declarations.

Validate all external data with Zod at its system boundary. Keep transport and
persistence representations out of domain objects.

## Web and admin

Both Next.js applications use a pages-first Feature-Sliced Design. The allowed
dependency direction is:

```text
app -> pages -> widgets -> features -> entities -> shared
```

A layer imports only from lower layers. Next.js route files in `src/app/` stay
thin and compose page slices from `src/fsd/pages/`. FSD layers live below
`src/fsd/` because Next.js reserves a top-level `src/pages/` directory for the
legacy Pages Router. Server state belongs in TanStack Query when it needs client
caching; shared client state belongs in Zustand; component-local state remains
React state.

## Mobile

The Expo application groups user-facing screens separately from reusable
features, entities, and shared platform adapters. Platform-specific code must
be isolated behind an interface and verified on each affected platform.

## Contracts

`@languon/contracts` is the source of truth for data crossing application
boundaries. Export Zod schemas and derive TypeScript types from the schemas.
The backend uses the same schemas to generate and validate OpenAPI operations.

## Data and prompts

- PostgreSQL is the durable source of truth.
- Redis is used only for explicitly disposable cache, coordination, and
  short-lived state.
- Database access is implemented in backend infrastructure through
  `@languon/database`; domain and application layers never issue SQL directly.
- Local prompts in `@languon/prompts` are deterministic fallbacks for local,
  test, and staging workflows. Configured environments may resolve managed
  prompts through Langfuse, with local fallback on an unavailable prompt.

This document describes the current structure and boundaries. ADRs under
[`docs/adr`](./adr/README.md) explain why durable choices were made. Read the
relevant accepted ADRs before changing a boundary. Keep feature-local choices in
the active `EXEC_PLAN.md`; promote choices that future features must respect to
an ADR before implementation diverges from the documented architecture.
