---
type: adr
id: ADR-0033
title: 'Additive enum migration commit boundaries'
status: accepted
date: 2026-10-14
supersedes: 'None; supplements ADR-0002'
---

# ADR-0033: Additive enum migration commit boundaries

## Context

PostgreSQL rejects references to a newly added value of an existing enum before
the adding transaction commits. Generated migration 0057 adds speech measurement
values and references them in a check constraint. Fresh installation succeeds
because the enum itself is new in that transaction, whereas an existing 0056
database fails with 55P04. Historical migration files and recorded hashes must
remain immutable, including for databases already installed successfully.

## Decision

Keep Drizzle's canonical files, migration execution and ledger, the trusted
purpose capability, and reserved-session advisory lock. After validating the
applied hash prefix, precommit only complete additive `ALTER TYPE ... ADD VALUE`
statements from pending migrations whose enum types already exist. Hold the same
session lock across these autocommit statements and subsequent Drizzle execution.

Make only these exact precommitted enum statements idempotent with `IF NOT EXISTS` at execution,
including within the normal migration transaction. Do not change files or ledger
hashes. Ordinary DDL and migration-history writes retain their existing atomic
transaction. On failure, unused additive labels may remain committed, while
ordinary DDL/history rolls back; rerunning the same reviewed migrations recovers.
Do not remove labels or rewrite applied migration history during recovery.

The parser handles only a complete additive statement, preserving identifiers,
labels and BEFORE/AFTER ordering. It does not transform functions, ordinary DDL,
renames or compound SQL. New enums absent before the run follow Drizzle's normal
fresh-install transaction, including its duplicate-label errors. Validate existing
labels against pending BEFORE/AFTER positions or append order before and after
precommit, including the projected full order obtained by replaying all pending
additions for each existing enum and an exact full-order check after all
precommits; reject incompatible ordering rather than certifying changed pending
SQL against an earlier failed attempt. Reject duplicate pending additions to the
same existing type and label before mutation unless the repeated addition
explicitly uses IF NOT EXISTS. Later pending additions to the same type
are excluded from append validation so an unchanged multi-label retry succeeds.
This is a compatibility repair within ADR-0002's
existing infrastructure, without a new ledger, framework or public API.

## Alternatives considered

### Rewrite historical SQL or migration hashes

This would invalidate already installed databases and conceal the transition
history. An appended correction cannot run before failing 0057.

### Replace Drizzle with a custom ledger or split every statement into commits

Neither is necessary. Broad transaction splitting would expose partially applied
ordinary schema changes and require substantially more recovery machinery.

## Consequences

### Positive

- Existing databases and fresh installs apply the same immutable history.
- Advisory locking, checksum validation and retry behavior remain enforced.
- Fake-data upgrade tests cover preserved users, dictionaries and credit ledgers.

### Negative

- Enum expansion is an explicit exception to the ordinary DDL transaction.
- A failed migration can leave additional unused enum labels before retry.

### Risks / limitations

- Authors must keep enum expansion additive; enum removals/renames need separate review.
- Test upgrades from an existing schema, not only installation into an empty database.
- Apply through the reviewed singleton runner; bypassing it can reproduce 55P04.

## Related

- [ADR-0002](0002-drizzle-schema-and-migration-strategy.md).
- [Feature 042](../../.agent/features/042-shared-pronunciation-playback/FEATURE.md).
- [Database development](../development.md#postgresql-schema-and-migrations).
