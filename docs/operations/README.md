# Release and deployment operations

This directory is the human operations handbook for Languon. The core contract
is provider-neutral: OCI images in GHCR, Docker Compose, a stable NGINX edge,
SSH over Tailscale, and S3-compatible off-host backups. Provider-specific
provisioning belongs in an appendix and must not change the deployment state
machine.

Read these documents in order before provisioning or operating a shared
environment:

1. [Deployment runbook](./deployment.md) — topology, host preparation, staging
   and production promotion, migration order, blue/green drain, and rollback.
2. [Database recovery](./database-recovery.md) — backup, restore, recovery
   objectives, and destructive-operation safeguards.
3. [Monitoring and capacity](./monitoring-capacity.md) — alerts, dashboards,
   profiler history, scaling thresholds, and provisional VPS sizes.
4. [Security operations](./security.md) — network boundaries, secrets, access,
   rotation, and incident response.
5. [Dictionary jobs and documents](./dictionary-jobs-and-documents.md) — planned
   worker, product-upload, scanner/OCR, cleanup, and capability boundaries.
6. [Timeweb Cloud appendix](./timeweb-cloud.md) — current control-panel and guest
   OS preparation for the first staging VPS and later split production.

The operator-facing local rehearsal is documented in the
[release/deployment user-flow guide](../user-flows/release-deployment-platform.md).
Repository commands remain authoritative if prose and code diverge.

## Environment contract

| Property           | Staging                                        | Production                                   |
| ------------------ | ---------------------------------------------- | -------------------------------------------- |
| Source             | Current commit of `stage`                      | Published strict SemVer release from `main`  |
| Qualification      | Manual workflow runs verify, build, and deploy | Release publication verifies and builds only |
| Promotion          | Same authorized staging run after checks pass  | Separate protected manual workflow           |
| Hosts              | One VPS for edge, apps, PostgreSQL, and Redis  | Application VPS plus private data VPS        |
| Data exposure      | Compose-internal only                          | Private provider network only                |
| Admin              | Private operator network                       | Private operator network                     |
| Artifact           | Exact manifest image digests                   | Exact build-ready release manifest digests   |
| Drain limit        | Five minutes                                   | Five minutes                                 |
| Recovery objective | Restore-tested, environment-local              | 24-hour RPO and four-hour RTO                |

Neither path deploys mutable tags. Ordinary pushes and pull requests do not run
release CI; contributors must run `pnpm check` locally.

## Change checklist

Before any shared-environment deployment:

- Confirm the actor, environment, source/release, and immutable manifest.
- Confirm the environment lock is free and the current audit/state files are
  readable.
- Review every migration for old/new binary compatibility. Contract/drop
  changes require a later release after the old version is no longer a rollback
  target.
- Confirm the latest off-host backup and last restore drill satisfy the target.
- Confirm application and data hosts have at least 30% steady-state headroom;
  the application host must also fit the inactive generation.
- Confirm dashboards and alerts are healthy before changing traffic.
- Keep the previous manifest available until verification and the observation
  window complete.

After deployment, retain the sanitized audit artifact and review readiness,
error rate, latency, saturation, database connections, Redis evictions, and
backup freshness. Never copy environment files, access tokens, cookies, prompts,
or user data into issue trackers or deployment evidence.

## Incident priority

Protect data integrity first, then restore a known-good service path:

1. Stop further promotion and preserve logs/audit records.
2. If traffic just switched and schema remains compatible, switch back to the
   previous immutable manifest. Do not automatically reverse migrations.
3. If the data tier is suspect, stop writes before attempting recovery and use
   [the restore procedure](./database-recovery.md).
4. Rotate any credential that may have been exposed and revoke the old value.
5. Record the timeline, impact, recovery actions, and follow-up checks without
   including secrets or personal data.
