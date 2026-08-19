# Deployment runbook

This runbook describes the provider-neutral deployment contract. It deliberately
separates machine provisioning from application delivery. Read
[security operations](./security.md) and [database recovery](./database-recovery.md)
before the first shared-environment deployment.

## Topologies

Staging begins on one VPS:

```text
Internet -> :443 NGINX edge -> active blue/green app slot
                    |             web / backend / private admin
                    +-----------> Docker-only PostgreSQL / Redis
                                   persistent volumes
```

Production uses at least two VPSs:

```text
Internet -> app VPS :443 NGINX -> active blue/green app slot
                          |
                  private provider network
                          |
                    data VPS -> PostgreSQL / Redis
                                persistent volumes
```

Only NGINX publishes public application ports. PostgreSQL `5432`, Redis `6379`,
admin, Docker, and host-management endpoints must not be internet-accessible.
Production additionally requires authenticated TLS on both data services:
PostgreSQL URLs use `sslmode=verify-full`, Redis uses `rediss://` with a named
least-privilege ACL user, and the app/migrator mount only the private CA.

## Provision a generic host

1. Select a current supported Ubuntu LTS x86_64 image and attach SSH keys at
   creation. Disable password SSH after proving key and Tailscale access.
2. Allocate persistent storage with at least 30% free-space headroom. Keep
   application state outside checkout and image directories.
3. Patch the OS, enable unattended security updates, NTP, and a host firewall.
4. Install Node.js 24 for the host-local deploy CLI, then Docker Engine, the
   Compose plugin, and util-linux `flock` from official package sources. Verify
   `node --version` and `flock --version`; do not
   depend on undocumented global runtimes or Compose binaries.
5. Install Tailscale and approve the host with environment-specific ACL tags.
6. Create a least-privilege deploy user. It needs only the exact deployment
   directories and Docker operations required by the runner; interactive
   operators use separately attributable accounts.
7. Create root-owned environment/registry files (`0700` directory, `0600`
   files). Keep them outside the repository and deployment audit directory.
8. Configure log rotation, disk alerts, external uptime monitoring, and
   off-host backup access before the first deploy.
9. Point DNS to the stable application IP only after the edge readiness check
   passes. Add an IPv6 record only when the complete IPv6 firewall/routing path
   is configured and tested.

Create protected GitHub environments named `staging` and `production`. Each
owns its environment-specific `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY`,
`TAILSCALE_OAUTH_CLIENT_ID`, and `TAILSCALE_OAUTH_SECRET`. The SSH host-key value
is a reviewed `known_hosts` record, never the output of an unauthenticated scan
inside the deployment job. Require reviewers for `production`; staging's manual
dispatch is its authorization boundary.

Use the [Timeweb appendix](./timeweb-cloud.md) for the initial provider panel and
private-network steps.

## Runtime contract

Production images are built from the repository root with:

- `infra/docker/prod.backend.Dockerfile` (`backend`);
- `infra/docker/prod.web.Dockerfile` (`web`);
- `infra/docker/prod.admin.Dockerfile` (`admin`); and
- `infra/docker/prod.migrator.Dockerfile` (`migrator`).

Every deployed manifest pins all four images by digest and records
`RELEASE_SHA`. Backend liveness is `/livez`; backend readiness is `/readyz` and
requires PostgreSQL and Redis. The compatibility `/health` endpoint remains
available but is not a deployment gate. Web and admin readiness is `/healthz`.
NGINX routes same-origin `/api/*` to backend with the `/api` prefix removed.

Set backend `DATABASE_MAX_CONNECTIONS` deliberately. Budget both blue and green
backend pools plus the one-connection migrator and operator headroom. For
example, two pools of 10 require a PostgreSQL limit comfortably above 21;
monitor actual saturation instead of treating that minimum as a target.
`SHUTDOWN_TIMEOUT_MS` defaults to 295 seconds and must remain below the Compose
300-second stop grace so the process can close clients before forced kill.

Host application configuration lives at `/etc/languon/stage.env` or
`/etc/languon/production.env`; use the sanitized examples in `infra/deploy/` as
the key contract. Runtime upstream/state live below `/opt/languon/runtime/` and
`/var/lib/languon/` respectively. GitHub copies each immutable deployment bundle
to `/opt/languon/releases/<source-sha>` and runs the host-local CLI over pinned
SSH. Give the deploy user access only to those paths, the required config read,
and Docker operations. Periodically prune old release bundles only after their
manifest is outside the rollback/retention window.

The production data host uses `infra/deploy/production-data.env.example` plus
the reviewed PostgreSQL HBA and Redis ACL examples. Issue distinct server
certificates whose SAN contains the private DNS name used in the application
URLs. Install separate `0600` private keys readable by each container service,
keep the CA public certificate on the application host, disable Redis's
plaintext port, and use only `hostssl` PostgreSQL network rules. Validate both a
successful verified connection and rejection with a wrong CA/hostname before
loading user data.

## Disposable local rehearsal

Use the local rehearsal before the first staging launch and after changes to
images, Compose, NGINX, migration, readiness, or the deploy state machine:

```sh
pnpm deploy:local
pnpm deploy:local:verify
pnpm deploy:local:rollback
pnpm deploy:local:down
```

`deploy:local` requires Docker Compose and OpenSSL, builds/uses local production
images, generates a one-day localhost certificate, and exercises the one-host
staging topology with an isolated Compose project, network, ports, state
directory, PostgreSQL volume, and Redis volume. `verify` checks the persisted
active slot through its real readiness/edge path. `rollback` promotes the
previous local digest set through the same gates. `down` removes only the
rehearsal resources after identifying their fixed project scope; it must never
read shared staging/production config or connect to a remote Docker daemon.

The rehearsal is intentionally loopback-only and uses synthetic local secrets
and data. Before running it, verify `docker context show` is the intended local
engine and that `DOCKER_HOST` does not point to a shared host. Do not copy a
staging/production environment file into the rehearsal.

| The local rehearsal proves                            | It cannot prove                                            |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Production images start and report release identity   | GitHub Release event/approval behavior                     |
| Built migration ordering and failure containment      | GHCR permissions, attestations, and remote transfer        |
| NGINX blue/green switch and loopback routing          | Timeweb BGP, provider firewall, DHCP, or public IP routing |
| Readiness/smoke failure preserves the active slot     | Public DNS propagation and real ACME/TLS renewal           |
| Existing connection/stream drain and old-slot cleanup | Actual VPS network/disk performance and packet loss        |
| Previous immutable local manifest rollback            | External Sentry/Grafana/Timeweb alert delivery             |
| PostgreSQL/Redis volumes survive app replacement      | Off-host S3 retention and disaster restore timing          |

Treat local success as a prerequisite, not a substitute, for the first real
staging rehearsal, external closed-port test, alert test, and restore drill.

## Remote deploy from your laptop

You can run exactly the same remote deploy bundle from your local machine when you
already have a build-ready manifest and remote VPS access:

```sh
pnpm deploy:remote deploy \
  --environment stage \
  --target root@<remote-host-or-ip> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env \
  --ssh-key ~/.ssh/languon-deploy-key \
  --known-hosts ~/.ssh/known_hosts

pnpm deploy:remote verify \
  --environment stage \
  --target root@<remote-host-or-ip> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env

pnpm deploy:remote rollback \
  --environment stage \
  --target root@<remote-host-or-ip> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env
```

The command uploads a temporary release directory under
`/opt/languon/releases/<source-sha>` on the target host, copies the same deploy
bundle used by GitHub Actions (`infra/deploy/**`, `infra/nginx/nginx.conf`,
`infra/backup/**`, production scripts), then executes
`scripts/deploy-release.mjs` remotely. The runner stays unchanged:

### What each argument means

- `--environment <stage|production>`
  - Required. Selects the deployment mode and validates environment-specific rules.
    This affects runtime/state defaults and the migration + backup guardrails.
- `--target <user@host-or-ip>`
  - Required unless both `--host` + `--user` are provided.
  - Can be an IP (`root@192.0.2.10`) or DNS name (`root@stage.example.com`).
- `--manifest <path>`
  - Required. Path to a verified release manifest JSON on the local machine.
- `--config <remote path>`
  - Optional override to point to the remote environment file used by deploy
    runtime (for example `/etc/languon/stage.env` or `/etc/languon/production.env`).
  - Keep this file root-owned (`chown root:root`) and `0600`.
- `--ssh-key <path>`
  - Optional. SSH private key used for authentication. Defaults to
    `~/.ssh/id_ed25519`.
- `--known-hosts <path>`
  - Optional. File used for SSH host-key checking. Defaults to
    `~/.ssh/known_hosts`.
- `--host <host>` and `--user <user>`
  - Optional alternative to `--target` when host and user are managed separately.
- `--remote-root <dir>`
  - Optional. Remote base directory where release payload is copied. Default:
    `/opt/languon/releases`.
- `--runtime-directory <dir>`
  - Optional. Directory where runtime compose and app files live.
    Default: `/opt/languon/runtime/<environment>`.
- `--state-directory <dir>`
  - Optional. Deploy state file location. Default: `/var/lib/languon/<environment>`.
- `--drain-seconds <number>`
  - Optional. Grace period for active-connection drain before stop/kill. Default: `300`.
- `--ssh-port <number>`
  - Optional. SSH port for the transport. Default: `22`.
- `--allow-local-registry true|false`
  - Optional. Enables manifests with localhost/docker registry image refs.
- `--local-config <path>`
  - Optional. Uploads local config to remote temporary path and uses it as
    `--config` for this run.
- `--audit-path <path>`
  - Optional. Writes remote JSON command output locally for audit retention.

`DEPLOY_HOST` and `DEPLOY_USER` environment variables are also supported as
`--target` fallbacks, but explicit CLI flags are preferred for auditable local
runs.

### Timeweb-friendly examples

From your laptop, deploy, verify, and rollback with the same artifact:

```sh
# Stage deploy
pnpm deploy:remote deploy \
  --environment stage \
  --target root@<timeweb-stage-vps-ip> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts

# Stage verify (same manifest)
pnpm deploy:remote verify \
  --environment stage \
  --target deploy@<timeweb-stage-vps-ip> \
  --manifest .release/languon-stage-manifest.json \
  --config /etc/languon/stage.env \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts \
  --audit-path ./logs/stage-verify-audit.json

# Stage rollback with local operator config file (if /etc file does not exist)
pnpm deploy:remote rollback \
  --environment stage \
  --host <timeweb-stage-vps-ip> \
  --user deploy \
  --manifest .release/languon-stage-manifest.json \
  --local-config ./config/stage.env \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts \
  --drain-seconds 240
```

Production is identical, with `--environment production` and a production manifest:

```sh
pnpm deploy:remote deploy \
  --environment production \
  --target root@<timeweb-prod-vps-ip> \
  --manifest /path/to/languon-release-manifest-vX.Y.Z.json \
  --config /etc/languon/production.env \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts \
  --drain-seconds 360
```

## Staging delivery

1. Push the intended commit to `stage` only after local `pnpm check` succeeds.
2. In GitHub Actions, manually dispatch **Stage verify, build, and deploy**
   (`.github/workflows/stage.yml`). The workflow
   always resolves the current remote `stage` commit; an arbitrary commit input
   is intentionally unavailable.
3. Confirm the workflow reports that frozen install, format, lint, typecheck,
   tests, migration checks, production builds, image publication, and manifest
   validation passed for the same commit.
4. The same authorized run acquires the staging concurrency lock, connects over
   the private deployment path, runs the migration/backup gate, and deploys the
   exact produced digests. There is no second staging approval.
5. Confirm the workflow's readiness, edge smoke, connection-drain, and audit
   steps pass. Check the public web route and private admin route manually.
6. Retain the previous manifest until the observation checks in
   [monitoring and capacity](./monitoring-capacity.md) pass.

A second staging dispatch waits for or cancels according to the workflow's
serialized concurrency policy; never bypass that lock from a shell.

## Production release and promotion

1. Confirm the intended commit is reachable from `main`, the tree is clean, the
   migration is backward compatible, and local checks pass.
2. Publish a stable, non-prerelease GitHub release using exactly
   `vMAJOR.MINOR.PATCH`. `.github/workflows/release.yml` publication
   triggers qualification and image build only. It must never deploy.
3. Wait for the release workflow to attach
   `languon-release-manifest-vMAJOR.MINOR.PATCH.json` containing exact GHCR
   digests and verification metadata. A failed/incomplete release is not
   promotable; do not move or reuse its tag.
4. In GitHub Actions, manually dispatch **Deploy production release**
   (`.github/workflows/deploy-production.yml`) and enter that exact version.
   Review the protected `production`
   environment approval and resolved manifest before approving.
5. Confirm the workflow acquires the production lock, checks backup freshness,
   applies migration once, starts the inactive slot, gates readiness/smoke,
   switches NGINX, drains, and writes its audit artifact.
6. Observe production signals and complete the post-deploy checklist. Do not
   rebuild during promotion or replace a digest with a tag.

## Migration and traffic-switch order

The deployment runner owns this exact order:

1. Validate environment, immutable manifest, current state, and lock.
2. Verify the required recent backup/restore evidence.
3. Run the one-shot migrator exactly once using its separate one-connection
   credential. The advisory lock and migration ledger are backstops, not reasons
   to run multiple jobs.
4. Start the inactive blue/green slot without changing traffic.
5. Probe app readiness from the Docker edge network and run smoke checks.
6. Render the inactive upstream include, validate the complete NGINX config,
   then reload NGINX.
7. Verify new connections reach the new slot while old NGINX workers and old
   containers remain available to existing clients.
8. Wait up to five minutes for old workers/connections to drain. Record any
   forced deadline termination.
9. Atomically persist the new active state before old-slot cleanup; from this
   point cleanup/audit failure must never switch away from the serving slot.
10. Stop/remove only the old application slot; never remove data volumes, then
    append the sanitized audit record.

Before generating a release manifest, CI validates
`apps/backend/drizzle/deployment.json`. Any migration content change requires a
human review of its blue/green compatibility, an updated exact content hash and
latest journal marker. `contract` classifications fail release qualification
and must ship only after the old binary is no longer a rollback candidate.

Failure before the validated reload leaves the active slot serving. Migration
failure never starts the inactive slot. Readiness/smoke failure removes only the
inactive application generation.

## Rollback

Rollback is application promotion of the previous digest manifest; it is not a
database down migration.

1. Pause new deployments and identify the last known-good manifest from the
   deployment state/audit record.
2. Confirm its binaries remain compatible with the current schema. If not,
   preserve service and prepare a forward correction instead of forcing an old
   binary or reversing data.
3. Use the deployment runner's rollback operation so it receives the same lock,
   validation, readiness, NGINX reload, drain, and audit protections as a normal
   promotion.
4. Confirm the release identity from health endpoints and smoke critical routes.
5. Keep evidence from both failed deployment and rollback. Open a forward fix
   for any migration or data issue.

If failure occurs after traffic switched but before state was persisted, inspect
the live NGINX upstream and running slot identities before retrying. Never infer
the active slot from a directory name alone.

## Host maintenance

- Drain application traffic before rebooting or upgrading the app host. A
  single-host environment cannot provide service during a host reboot.
- Back up and verify the data tier before PostgreSQL/Redis upgrades. Upgrade one
  major PostgreSQL version only through an explicitly tested procedure.
- Treat Docker/network/storage changes as infrastructure maintenance, not an
  ordinary zero-downtime application deployment.
- Rehearse deploy, rollback, and restore after material Docker, NGINX, firewall,
  private-network, or backup-tool changes.
