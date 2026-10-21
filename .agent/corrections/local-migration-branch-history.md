# Correction: Local startup migration branch mismatch

Status: Complete — local configuration repaired and full startup verified
Created: 2026-10-21

## Routing decision

Restore existing local startup without losing data. Read-only diagnosis and local configuration repair are bounded maintenance. Integrating the previously authorized sidebar feature changes persistence and product surfaces; if selected, resume its existing feature lifecycle instead of treating that work as a correction. No migration guard bypass or ledger rewrite is authorized.

## Evidence

- Current main is a574884 with a clean working tree before this record.
- Local loopback PostgreSQL5432, database languon, has migration timestamp1792516496063/hash956c00ccba30b80ba94689d9f8f9a821adbeab302886cead5cee1023874938b4 applied. Its navigation_resources table exists; learner_portraits does not. Only migration metadata and table identities were queried.
- The hash exactly matches feature/sidebar-navigation migration0076_sidebar_navigation.sql. Main instead starts portrait migrations at0076, timestamp1792527026256. The strict ordered-prefix check correctly rejects this divergence before applying new SQL.
- Read-only merge preview found11conflicting paths, including journal/snapshot, backend composition/schema, profile/shell/contracts and mapped documentation/tests. No working tree merge or database change was made.
- The earlier sidebar feature050 is authorized but remains in progress, with its branch/stash preserved.

## Scope correction and pending data choice

The user explicitly requires portrait UI and logic only; the supplied design's sidebar must not replace the existing sidebar. Do not merge the separate sidebar feature as a startup repair. The earlier integration proposal is withdrawn.

Verified with `git diff 5efaafe a574884 -- apps/web/src/fsd/widgets/app-shell/ui/sidebar`: no changes. Feature051 FEATURE.md already excludes the prototype shell. Its only application-chrome change bypasses the shell for the dedicated interview route.

Asked whether to preserve current data in the running app through migration compatibility repair only, or use a separate fresh development database while retaining the existing database untouched. Both exclude sidebar UI/runtime integration. No data choice is inferred from the sidebar scope clarification. Never silently reset the database or patch its migration hashes. A migration compatibility implementation must reopen the authorized feature scope and undergo persistence verification; it is not a bounded correction.

## Repair and verification

The repeated request to fix startup was handled through a reversible local configuration repair, preserving application data without changing canonical migrations, SQL, the migration runner, or sidebar code. No persistence implementation or feature integration was necessary.

- Original loopback database `languon` remains intact, including its historical migration ledger and two sidebar-only navigation metadata rows. No reset, ledger modification, or migration-guard bypass occurred.
- Created separate `languon_portrait_repair_20261021`, applied the unchanged main migrations (80 ledger entries), and copied the original public application data. Source had no folderless texts/jobs or incompatible job formats. Only sidebar-specific navigation metadata was excluded; it remains in the original database and full backup.
- Data-only restore used a single transaction and disabled foreign-key triggers for circular references. Subsequently all152 foreign keys were recreated with their exact definitions in one transaction, validating all restored rows. Ordinary CHECK/NOT NULL constraints remained enforced during restore.
- Compared counts and exact content digests for all80 original application tables:3313rows preserved. Both public sequence positions and is_called flags match. Source has only public and migration-ledger schemas; no other application schema was omitted. Digest values and data were not logged.
- Re-running the ordinary application migration invocation on the repaired database passes with no pending migrations.
- Updated only ignored `.env.local`: POSTGRES_DB, DATABASE_URL and DICTIONARY_WORKER_DATABASE_URL point at the repaired database. Undefined migration/purge overrides remain absent; isolated Mastra URLs are unchanged. Original configuration is retained as ignored `.env.local.before-portrait-db-repair-20261021` with mode0600.
- Full original database backup is retained on the host at `/private/tmp/languon-before-portrait-repair-20261021.dump`, mode0600. An initial container temporary backup was replaced by this host backup after Compose recreated the container; the original volume/database was preserved throughout.
- Actual `pnpm dev:all` now passes infrastructure, dependency builds and migrations, then launches backend, web, admin and dictionary worker. Web3333 and admin3001 return HTTP200. Backend livez/readyz return HTTP200, with PostgreSQL and Redis both ready.
- Independent read-only assessment by migration_repair_advice supports this local-only approach; its sequence, schema, URL consistency and startup checks are satisfied. No source code changed, so build/lint/UI fidelity/E2E changes are not applicable. Existing guides and commands remain accurate.

## Rollback and remaining limitations

Subsequent clarification: preserve the previously implemented feature050 sidebar alongside portraits; exclude only the portrait prototype's sidebar. Earlier sidebar exclusion was an interpretation error. Integration resumes under feature050 EXEC_PLAN.md on feature/sidebar-portrait-restoration. Its generated forward0080 follows the repaired database's portrait history; both retained navigation metadata rows were copied and digest-verified. Original database and backups remain untouched.

Restore the ignored environment backup to select the original database again; that restores the old branch-specific startup mismatch too. Do not delete either database during this correction. After using the repaired app, new activity belongs to the repaired database; the old database is a retained snapshot, not a synchronized replica. No commits, branch merges, or sidebar changes were made. Development processes started for verification remain running for the user.
