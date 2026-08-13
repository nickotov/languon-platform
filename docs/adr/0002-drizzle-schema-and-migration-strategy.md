# ADR-0002: Drizzle schema and migration strategy

Status: Accepted
Date: 2026-08-12
Supersedes: None

## Context

Languon currently has a low-level `postgres` client factory but no business
schema, ORM, migration runner, migration commands, or deployment convention.
Authentication introduces the first product tables, transaction-heavy
repositories, uniqueness constraints, and a need to reproduce the schema in the
ordinary development database, disposable integration databases, and the
isolated Mastra playground.

The choice becomes a constraint for every future persistence feature and affects
application deployment and rollback. Database-framework and migration strategy
are explicitly strategic under the repository ADR policy.

## Decision

- Drizzle ORM is the canonical TypeScript PostgreSQL mapping/query layer.
  Drizzle Kit is the canonical code-first migration generator and validator.
- Business schema definitions remain colocated with their owning backend module's
  infrastructure. A backend Drizzle schema entry aggregates those public module
  schema exports for generation and typed database construction.
- `@languon/database` exposes framework infrastructure factories, low-level
  database types, and reusable migration invocation only. It does not own auth or
  other business schemas and does not implement business repositories.
- Generated SQL migrations and Drizzle metadata are committed. TypeScript schema
  is the declarative mapping of current intended state; reviewed ordered SQL and
  metadata are the authoritative transition history applied to databases. They
  are versioned together, and generated SQL is never edited by hand merely to
  conceal a schema mismatch.
- Repository commands expose at least `db:generate`, `db:check`, `db:migrate`,
  and development-only `db:studio`. Shared development, staging, and production
  never use `drizzle-kit push`.
- Migration application is an explicit development/deployment step before
  backend startup, run by singleton orchestration with a PostgreSQL advisory lock
  as a concurrency backstop. Ordinary HTTP process startup does not mutate schema.
- The same checked-in migration set is invokable programmatically only when
  trusted composition grants an explicit disposable-purpose capability for a
  test/playground database. Hostname or database-name heuristics alone never
  authorize destructive or lifecycle operations.
- Migrations are forward-oriented. A safe explicit down migration may be added
  and verified when reversal cannot lose or reinterpret data. Otherwise rollback
  uses a new forward correction and deployment rollback is coordinated with
  compatible application versions.
- Migration tests cover clean application, idempotency, concurrent invocation,
  constraints/indexes, compatibility expectations, and checksum/history
  integrity against disposable PostgreSQL.

## Alternatives considered

### Continue with raw `postgres` queries and a custom migration ledger

This preserves the smallest dependency set but makes Languon own schema diffing,
migration metadata, and more repetitive persistence mapping. Drizzle provides a
typed query layer while still producing reviewable SQL and supporting the
existing PostgreSQL driver.

### Drizzle `push` as the ordinary workflow

Push is convenient for prototypes but bypasses committed, reviewable migration
history and makes shared-environment rollout harder to audit. It is excluded
outside explicitly disposable experimentation.

### Run migrations on every backend startup

This makes local startup convenient but couples schema mutation to every process,
creates multi-replica races, and obscures deployment failure boundaries. An
explicit command is easier to verify and operate.

### Centralize all business tables in `@languon/database`

This would turn an infrastructure package into a cross-module business model and
violate the repository's DDD/package guidance. Module-owned schemas preserve
ownership while a thin aggregate supports migration generation.

### Adopt a schema/client-generating ORM

Tools such as Prisma could provide a broad client and migration system, but they
introduce a generated runtime/client model and a larger architectural shift. The
requested Drizzle approach stays close to SQL and the existing driver.

## Consequences

### Positive

- Future modules share one reviewable migration history and command lifecycle.
- Business repositories gain strict TypeScript inference without losing SQL
  visibility.
- Disposable integration and Mastra playground databases can apply the same
  canonical schema.
- Module/package ownership remains aligned with existing architecture.

### Negative

- Both schema TypeScript and generated SQL/metadata must remain synchronized.
- Contributors need Drizzle Kit and must review generated migration output.
- Forward-only correction can require coordinated multi-release rollouts when a
  schema change is not safely reversible.

### Risks / limitations

- Generated migrations can encode destructive changes; review and disposable
  verification remain mandatory.
- Programmatic migration discovery must work in built output, not only from the
  source tree.
- Migration command credentials are operational secrets and must not be printed
  or bundled into client applications.
- Deployment orchestration must provide a singleton migration job even though
  the advisory lock protects against accidental concurrent invocation.
- Schema changes used by old and new application versions require explicit
  expand/migrate/contract planning.

## Related

- [Architecture](../architecture.md)
- [Development](../development.md)
- [User Authentication feature](../../.agent/features/user-authentication/FEATURE.md)
- [User Authentication ExecPlan](../../.agent/features/user-authentication/EXEC_PLAN.md)
- [Drizzle migration fundamentals](https://orm.drizzle.team/docs/migrations)
