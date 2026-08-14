---
name: db-verification
description: Safely verify Languon PostgreSQL or Redis changes, including migrations, schemas, queries, repository behavior, transactions, constraints, indexes, cache lifecycle, and rollback behavior against disposable infrastructure. Use for persistence changes, data migrations, repository implementations, transaction bugs, or database-related review. Do not run destructive verification against shared, staging, or production data.
---

# Database verification

## Establish safety and invariants

Read the active correction document or feature/ExecPlan, migration, repository
code, and applicable backend instructions. State data invariants, compatibility,
expected query behavior, and rollback expectations before running commands.

Confirm the target is disposable local or test infrastructure. Resolve the
database host, name, and environment explicitly. Stop before destructive or
irreversible operations when the target could contain shared or valuable data.

## Verify PostgreSQL changes

When applicable:

1. Start from the documented clean schema or representative sanitized fixtures.
2. Apply migrations through the project migration command.
3. Inspect created tables, columns, types, defaults, constraints, indexes, and
   foreign keys.
4. Exercise repository behavior and transaction commit/rollback with integration
   tests.
5. Verify uniqueness, concurrency, error mapping, and query plans when material.
6. Test rollback when a safe down migration is part of the strategy, then apply
   forward again to prove repeatability.
7. Verify compatibility with existing rows and partial rollout when relevant.

## Verify Redis changes

Check key namespacing, serialization, TTL, invalidation, idempotency, concurrency,
reconnect behavior, and the effect of an unavailable cache. Redis must not become
the accidental durable source of truth.

## Report

Record exact commands, target identity without secrets, migration direction,
integration results, invariant checks, query-plan findings when relevant, and
remaining risk in the single correction document or feature `EVIDENCE.md`. Keep
large dumps and credentials out of durable work artifacts.
