# Database backup and recovery

PostgreSQL is the durable source of truth. Redis stores disposable coordination,
cache, and short-lived state; it must never be the only copy of business data.
The launch target is a maximum 24 hours of durable-data loss (RPO) and service
restoration within four hours (RTO). These objectives are credible only while
off-host backups and restore drills succeed.

## Backup policy

- Create a PostgreSQL-native backup at least daily and before every production
  schema change. A deployment backup gate must verify freshness; it must not
  silently manufacture or claim restore evidence.
- Copy encrypted backups to a private S3-compatible bucket in a failure domain
  separate from the data VPS. Enable provider-side encryption and object
  versioning/retention where available.
- Use a dedicated least-privilege backup database role and a dedicated bucket
  credential that can write only the environment's backup prefix. A restore
  operator uses a separate read credential.
- Retain at least seven daily and four weekly PostgreSQL backups at launch.
  Confirm commercial retention/cost before enabling longer retention.
- PostgreSQL backup metadata must record environment, database identifier,
  source host identity, UTC start/end, format/tool version, size, checksum,
  migration ledger state, object key, and outcome. It must not include the URL,
  password, rows, prompts, tokens, or personal data.
- Provider disk snapshots are supplementary. A live host snapshot is not proof
  of a database-consistent or restorable backup.
- Redis persistence may improve warm recovery, but losing Redis must remain a
  supported cold-start event. Never allow a Redis snapshot to block PostgreSQL
  restoration.

Alert before a backup is older than 24 hours, on any failed upload/checksum, and
when no successful restore drill exists within the agreed quarter.

## Backup command

Install PostgreSQL client tools matching the server major version, AWS CLI, and
`age` on the data/backup host. Copy `infra/backup/backup.env.example` to a
root-owned `0600` file such as `/etc/languon/backup.env` and replace every
placeholder. Keep the `age` identity offline from the routine writer where
practical.

For production, both the backup source and disposable restore target must use
`PGSSLMODE=verify-full` with their corresponding `PGSSLROOTCERT` CA path. The
backup command rejects weaker TLS modes so credentials and dump traffic cannot
be sent to an unverified PostgreSQL endpoint.

Create and upload an encrypted backup, then atomically write the local evidence
manifest used by the production deployment gate:

```sh
infra/backup/backup.sh create \
  --environment production \
  --config /etc/languon/backup.env \
  --output-manifest /var/lib/languon/backup/production/latest.json

infra/backup/backup.sh check-fresh \
  --environment production \
  --manifest /var/lib/languon/backup/production/latest.json \
  --max-age-hours 24 \
  --max-restore-age-days 92
```

`create` runs a custom-format `pg_dump`, verifies its catalog, encrypts it with
`age`, uploads it with server-side encryption, verifies remote size/checksum
metadata, uploads sanitized metadata, and deletes its temporary plaintext. Its
manifest records tool major, migration-ledger checksum, source identity, object
URI, encrypted bytes/checksum, and times. Configure
`BACKUP_MANIFEST_PATH=/var/lib/languon/backup/production/latest.json` in the
production deployment environment. The runner executes `check-fresh` before
migration and refuses stale backup or restore-drill evidence.

Schedule `create` at least daily outside peak hours and alert on any non-zero
exit. Keep the evidence directory `0700` and files `0600`. The local manifest is
not the backup; the encrypted S3 object and its verified metadata are.

Retention is a dry run unless both apply and the exact environment confirmation
are supplied:

```sh
infra/backup/backup.sh prune \
  --environment production \
  --config /etc/languon/backup-prune.env \
  --daily 7 \
  --weekly 4
```

Review every returned object key. Applying deletion is destructive and requires
an accountable operator plus `--apply true --confirm "DELETE BACKUPS production"`.
Never automate the confirmation or prune from a truncated inventory.

## Before a migration

1. Classify the migration as expand, migrate/backfill, or contract. The release
   may contain only changes compatible with both the active and inactive
   application versions.
2. Confirm the latest backup object exists, its checksum matches, and its age is
   within policy.
3. Confirm a recent restore drill used the same backup format/tool major version.
4. Confirm storage has room for migration/index working space and backup
   staging. Do not consume the reserved 30% free-space headroom.
5. Record the backup object identity and migration ledger checksum in the
   deployment audit. Do not log credentials.

If any check fails, stop before migration or inactive-slot startup.

## Restore drill

Always restore into a disposable, isolated PostgreSQL instance first. Never use
the active staging or production database as a drill target.

1. Choose a backup and verify its object checksum before opening it.
2. Create a fresh database/container with no network path from public clients.
   Use a unique explicit name and a new disposable volume.
3. Restore using the matching PostgreSQL tool major version. Capture timings and
   sanitized diagnostics to the drill record.
4. Run migration-ledger validation and application-level read-only integrity
   checks: required schemas/tables/indexes, representative counts/ranges, foreign
   key/uniqueness invariants. Do not start a backend yet.
5. If testing recovery to current code, apply pending forward migrations with
   the built one-shot migrator, then rerun integrity checks.
6. With the target still isolated and all application traffic stopped, run the
   immutable release's deletion-journal recovery gate using its independent
   version-list/read-only credential. Verify retained object versions and
   object-lock/IAM policy separately. Rehearse a known synthetic deletion marker
   only in a separately provisioned disposable journal namespace/bucket and
   synthetic database snapshot; never write fake events to the production journal.
   Treat any indeterminate intent or
   hidden/delete-marked event as a failed drill. Only then test backend readiness
   and synthetic read/write behavior against the reconciled disposable target.
7. Record recovery point, total elapsed time, data/integrity checks, tool/image
   digests, and result. A successful drill must complete inside four hours.
8. Explicitly identify the disposable target, disconnect it, then remove its
   container and volume. Do not use broad names, wildcards, or repository-root
   deletion commands.

A downloaded backup contains production-sensitive data. Keep it encrypted,
limit access, do not copy it to developer laptops unless explicitly authorized,
and securely expire the drill artifacts according to policy.

The checked-in restore command enforces a fresh empty target named
`<name>_restore_<8+ random characters>`, an explicit
`RESTORE_TARGET_DISPOSABLE=true` config, environment match, downloaded checksum,
`age` decryption, dump validation, and exact typed database confirmation. After
creating the isolated empty target and reviewing `/etc/languon/restore.env`, run
with the actual configured database name:

```sh
infra/backup/backup.sh restore \
  --environment production \
  --manifest /var/lib/languon/backup/production/latest.json \
  --config /etc/languon/restore.env \
  --confirm "RESTORE languon_restore_a1b2c3d4"
```

Replace `languon_restore_a1b2c3d4` with the exact reviewed
`RESTORE_PGDATABASE`; do not use shell expansion to manufacture the confirmation.
The command refuses a non-empty or differently named target, checks emptiness
again immediately before restore, and writes sibling
`restore-drill.latest.json` evidence. It proves archive restoration; complete
the migration-ledger, application integrity/readiness, cleanup, and timing checks
above before calling the drill successful.

## Disaster recovery

Use this path only after confirming the data VPS or active PostgreSQL data is
unusable. Recovery mutates shared state and requires an accountable operator.

1. Declare the incident, stop deployment, and prevent application writes. Save
   current monitoring and deployment audit evidence.
2. Determine the newest verified off-host backup before the failure. State the
   expected recovery point/data-loss window to stakeholders.
3. Provision or isolate a clean replacement data host. Recreate only reviewed
   runtime configuration and least-privilege roles; do not copy an entire
   compromised host image.
4. Restore PostgreSQL, validate its ledger/checksum and integrity, then apply
   only reviewed forward migrations required by the application manifest.
5. While all backend, admin, and worker processes remain stopped, run the
   account-deletion recovery gate against the restored database with the
   independent, retained deletion journal and its reader-only credential.
   It must reconcile historical removals before any authentication or smoke
   traffic. An indeterminate intent, missing object/version, or delete marker
   is a fail-stop incident requiring operator reconciliation; never bypass the
   gate or infer a purge from an uncommitted intent. Use the immutable release's
   `recovery-gate.compose.yaml` one-shot service with the reviewed environment.
6. Start Redis empty unless a specific disposable-state restoration has been
   justified. Expect sessions, throttles, and caches to reset.
7. Point one isolated backend instance at the restored services and require
   `/readyz` plus read/write smoke checks with synthetic data.
8. Update the private data endpoint/secret, start the inactive application slot,
   and use the ordinary validated traffic switch. Do not expose database ports
   temporarily to make recovery easier.
9. Monitor errors, consistency, connections, replication status if later added,
   and business invariants. Resume writes only after the incident lead accepts
   the checks.
10. Rotate affected credentials, preserve forensic evidence, and schedule a new
   backup immediately after stabilization.

If the newest backup fails checksum or integrity validation, move backward one
verified object and record the larger RPO breach. Never patch migration history
or mark a partial restore successful to meet the target.

## Credential and format changes

Rotate backup database and S3 credentials one at a time: create new, perform a
backup and disposable restore with new credentials, update the root-owned host
secret, then revoke the old credential. Tool/image upgrades require a restore
drill before old-format readers or retention objects are removed.
