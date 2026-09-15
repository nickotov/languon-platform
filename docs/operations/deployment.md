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

The backend digest also starts one private dictionary-worker service in each
application slot; this is a process role, not a fifth image. Compose gates it
with a bounded PostgreSQL/application-store healthcheck and, in live mode, a
bounded provider connectivity/authentication probe that never generates paid
content. HTTP readiness remains independent of model/provider availability,
and the worker has no edge network, listener, Redis URL, or authentication
secrets. The API receives `DATABASE_URL`; the worker receives only
`DICTIONARY_WORKER_DATABASE_URL`. Production validation requires distinct API,
worker, and migrator database users so grants can remain least privilege.
Provision the worker login separately, then have the migration owner apply
`infra/deploy/sql/dictionary-worker-role.sql` with
`--set=dictionary_worker_role=<worker-user>` after schema expansion. Before
starting the candidate worker, production deployment runs a one-off privilege
probe and verifies the worker has every required generation/settings privilege
and no extra privilege on those tables, no CREATE on the public schema, no table
privilege on unrelated dictionary data, and none of SELECT, INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES, or TRIGGER on user, authentication, or
administration tables.

Set backend `DATABASE_MAX_CONNECTIONS` deliberately. Budget both blue and green
backend pools plus the one-connection migrator and operator headroom. For
example, two pools of 10 require a PostgreSQL limit comfortably above 21;
monitor actual saturation instead of treating that minimum as a target.
Add both blue and green `DICTIONARY_WORKER_DATABASE_MAX_CONNECTIONS` pools to
that budget during deployment overlap. Worker concurrency, polling, readiness,
and drain limits use the matching `DICTIONARY_WORKER_*` keys in the sanitized
environment examples.
`SHUTDOWN_TIMEOUT_MS` defaults to 295 seconds and must remain below the Compose
300-second stop grace so the process can close clients before forced kill.

The API and worker receive the same explicit generation policy:
`DICTIONARY_GENERATION_MAX_INPUT_TOKENS` (32,768–262,144),
`DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS` (128–1,024), both input/output
`*_COST_MICROS_PER_MILLION_TOKENS` rates (1–1,000,000,000), and
`DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT` (1–10,000,000). Live mode
requires all five. The attempt ceiling must cover the sum of the separately
rounded input and output ceiling costs. Inactive unavailable deployments may
omit all five host values; the schema-v2 manifest policy is still injected as
the no-call runtime policy. Any partial or live host configuration must match
it, and the sanitized examples pin an explicit policy for later activation.
The 32,768-token input minimum reserves 16,384 tokens for provider framing and
still leaves room for the prompt, structured-output schema, and smallest valid
card request.
Schema-v2 manifests bind that same five-field policy into immutable
`dictionaryJobs.generationBudget` metadata. Deployment requires the host values
to match the manifest before migration and passes the manifest values to both
API and worker. For every enqueued format, an envelope's token maxima must fit
both candidate and rollback-floor workers, while its input/output rates and
maximum cost must cover both workers' requirements. Once both releases enqueue
the format, those inequalities already force an identical tuple. Deployment
conservatively keeps it identical whenever the same worker format overlaps, so
a stop-enqueue release cannot hide queued work; change the tuple only after the
old format has drained and retired, then use a new expand/activate sequence.

Release-manifest schema v2 adds dictionary-job format capabilities while still
pinning exactly four images. Deployment preflight runs before migration and
requires the candidate to resolve every format the rollback floor can enqueue,
and the rollback floor to resolve every format the candidate can enqueue,
across worker processability, API read/cancel/discard/accept, and web reads. A
new format is therefore shipped in an `expand` manifest without activation,
then activated only after the previous release is a compatible rollback floor.
Relative to that floor, `expand` may add no API-enqueued formats and `activate`
must add at least one; enqueue removal is a separate expand/drain step.
Removing lifecycle support requires an exact `retireFormats` declaration. Before
migration or candidate startup, deployment queries the active slot with its
worker credential and refuses retirement until the named formats have zero
queued/running jobs and zero reviewable proposals. Schema-v1 manifests are
treated as supporting no dictionary job formats. Rollback still runs symmetric
lifecycle and database-drain checks, but does not require an older manifest to
anticipate a later release's phase transition or retirement declaration.

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

## Manual manifest and release-commit path (for local machine deploy)

This section is for cases where you want to deploy from your laptop or need an
offline/explicitly controlled package you can audit before remote execution.

### Why a manifest must exist first

The deploy runner refuses free-form tags and unverified references because the
deploy contract is **identity + content + policy**, not just "some image tag":

- It enforces the same four immutable image refs (`backend`, `web`, `admin`,
  `migrator`) as a digest map, so both environments always receive identical
  bits.
- It pins the exact `RELEASE_SHA` and migration compatibility for that source,
  allowing rollback/audit/smoke parity and blocking mixed commits.
- It guarantees the source commit and migration policy that were tested are exactly
  what runs remotely.
- It enables the same file to be used by local rehearsal, stage deploy, and
  production deploy checks.
- It preserves a forensically useful audit trail when something goes wrong after
  rollout.

`deploy` and `verify` both fail if the manifest is invalid, stale, or policy-violating,
so the manifest is the control point for safety.

### 1) Create a manifest for local/staging deployment (manual mode)

Use this when you explicitly need local control or an ad-hoc deployment rehearsal.

1. Build/publish the exact images and capture **digest references**.
    1. For GHCR, tag/tag and push your digest-bearing image tags.
    2. For local-only rehearsal, use `localhost:<port>/<name>@sha256:...` digests
       and enable local registry mode on deploy.

Example (conceptual):

```sh
TAG_PREFIX=ghcr.io/<owner>/<repo>
RELEASE_SHA=<40-char-commit-sha>

docker buildx build --platform linux/amd64 \
  --build-arg RELEASE_SHA="$RELEASE_SHA" \
  --file infra/docker/prod.backend.Dockerfile \
  --tag "$TAG_PREFIX/backend:$RELEASE_SHA" \
  --push .
BACKEND_DIGEST="$(docker inspect --format '{{index .RepoDigests 0}}' "$TAG_PREFIX/backend:$RELEASE_SHA")"
```

Repeat for `web`, `admin`, `migrator`, then use the resulting values in
`--image` arguments. 2. Resolve metadata:

```sh
COMMIT_SHA=<40-char-commit-sha>                  # e.g. 79f1d8...
WORKFLOW_RUN=1                                  # local placeholder for manual flow
MIGRATION_COMPATIBILITY=$(node scripts/migration-classification.mjs)   # none | expand | migrate
MIGRATION_LEDGER="$(git rev-parse "${COMMIT_SHA}:apps/backend/drizzle")"
```

`migration-classification` must not be `contract` for blue/green traffic switching.

3. Build the manifest JSON:

```sh
node scripts/release-manifest.mjs create \
  --output .release/manual-languon-manifest.json \
  --source-sha "$COMMIT_SHA" \
  --identity "local-$(git rev-parse --short "$COMMIT_SHA")" \
  --version "" \
  --workflow-run "$WORKFLOW_RUN" \
  --migration-compatibility "$MIGRATION_COMPATIBILITY" \
  --migration-ledger "$MIGRATION_LEDGER" \
  --dictionary-job-phase "expand" \
  --dictionary-job-worker-processable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-api-readable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-api-cancellable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-api-discardable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-api-acceptable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-web-readable "single-card:v1,pasted-terms:v1,import-pairs:v1" \
  --dictionary-job-max-input-tokens-per-attempt "262144" \
  --dictionary-job-max-output-tokens-per-attempt "40960" \
  --dictionary-job-input-cost-micros-per-million-tokens "1000000" \
  --dictionary-job-output-cost-micros-per-million-tokens "4000000" \
  --dictionary-job-max-cost-micros-per-attempt "500000" \
  --image "backend=ghcr.io/<owner>/<repo>/backend@sha256:<digest>" \
  --image "web=ghcr.io/<owner>/<repo>/web@sha256:<digest>" \
  --image "admin=ghcr.io/<owner>/<repo>/admin@sha256:<digest>" \
  --image "migrator=ghcr.io/<owner>/<repo>/migrator@sha256:<digest>"
```

The first expand release omits API enqueue and retirement arguments. A later
activation adds
`--dictionary-job-api-enqueued "single-card:v1,pasted-terms:v1,import-pairs:v1"`.
Deterministic import/export does not depend on this model-job activation. A retirement
release first stops enqueue while keeping lifecycle capabilities; only after the
database drains may a following manifest remove those capabilities and declare
`--dictionary-job-retire-formats "single-card:v1"`.

4. Validate it before using it:

```sh
node scripts/release-manifest.mjs validate \
  --input .release/manual-languon-manifest.json \
  --expected-source-sha "$COMMIT_SHA"
```

For local-rehearsal-like deployments where image refs are from localhost/registry,
pass local mode in the deploy command:

```sh
pnpm deploy:remote deploy \
  --environment stage \
  --target root@<vps-ip> \
  --manifest .release/manual-languon-manifest.json \
  --config /etc/languon/stage.env \
  --allow-local-registry true
```

If you plan to use it remotely for anything beyond rehearsal, prefer CI-generated
manifests from `.github/workflows/stage.yml`; they carry full workflow provenance.

### 2) Create a production release commit/tag (release manifest source)

Production deployment does **not** use an arbitrary stage manifest. It expects a
GitHub release-bound manifest identity and a stable SemVer release tag:

- Tag must be stable `vMAJOR.MINOR.PATCH` (no `-rc`, `-beta`, `-alpha`).
- The tag must point to a commit reachable from `main`.
- The release event triggers validation/build and immutable manifest attachment.

Flow:

```sh
# On clean main at the desired commit
git checkout main
git pull --ff-only
git status --short         # must be clean

git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0
```

Then create/publish the GitHub Release for that tag. The safest option is:

```sh
gh release create v1.4.0 --generate-notes
```

After release publish, the `.github/workflows/release.yml` pipeline runs and then
attaches:

`languon-release-manifest-v1.4.0.json`

as a release asset. This is your deployment artifact for production remote run:

```sh
pnpm deploy:remote deploy \
  --environment production \
  --target root@<prod-vps-ip> \
  --manifest /path/to/languon-release-manifest-v1.4.0.json \
  --config /etc/languon/production.env
```

Production deployment flow (`.github/workflows/deploy-production.yml`) expects that
asset identity/versioning and performs manifest-source validation before applying
rollout.

### What this allows and what it does not replace

- **Allows** reproducible blue/green deploys, deterministic rollback, and
  explicit auditability of exactly what ran.
- **Allows** local dry runs against a real remote host with a locally prepared
  manifest (including verification before a production promotion).
- **Does not replace** the standard release pipeline for production trust: it
  does not grant bypass of attestations, release validation, branch ancestry checks,
  or environment approvals.

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

## Administration access and owner membership

The admin image is part of every immutable release, but the admin listener is
not public. The edge binds `ADMIN_PORT` only to `ADMIN_BIND_ADDRESS`, which must
be loopback, and requires an htpasswd credential before the React application
can load. Application password/passkey login and an active PostgreSQL owner
membership are a second, independent control.

Create the host credential interactively so the plaintext password never enters
shell history or deployment configuration:

```sh
sudo install -d -m 0700 /etc/languon
sudo htpasswd -c /etc/languon/admin.htpasswd named-operator
sudo chown root:root /etc/languon/admin.htpasswd
sudo chmod 0600 /etc/languon/admin.htpasswd
```

Set `ADMIN_HTPASSWD_PATH=/etc/languon/admin.htpasswd` in the root-owned deploy
environment. Use a named Basic Auth identity per human operator, rotate it after
staff changes, and do not reuse the Languon account password.

The edge does not expose this mode-`0600` host file directly to request workers.
Its root startup step copies the file into container-only tmpfs, assigns it to
the unprivileged `nginx` worker as mode `0400`, and then starts NGINX. Keep the
host file private; do not weaken it to make container UID mappings work. The
private listener consumes browser Basic credentials at the edge. Production
admin code sends the application JWT in the scoped
`X-Languon-Admin-Authorization` header; NGINX strips that header and replaces
the upstream `Authorization` value only after Basic authentication succeeds.
Basic credentials are never forwarded to the backend or static admin server.
The private access-log format omits query strings so user-search emails do not
enter edge logs.

Reach the loopback listener through the operator SSH/Tailscale path. For
example, with `ADMIN_PORT=8444`:

```sh
ssh -N -L 127.0.0.1:8444:127.0.0.1:8444 deploy@stage-vps
```

The browser URL must retain the exact configured `ADMIN_BASE_URL` hostname for
TLS and WebAuthn. Resolve that hostname to `127.0.0.1` in a temporary operator
DNS/hosts override while the tunnel is active, then open
`https://admin.stage.example.com:8444`. Remove the override when the session
ends. Do not weaken certificate verification or change the WebAuthn RP ID to
`localhost` in staging/production.

The first database owner is granted only after that user has completed normal
email verification. From a laptop, use the guarded remote wrapper:

```sh
pnpm admin:membership:remote -- grant \
  --environment stage \
  --target deploy@stage-vps \
  --manifest .release/stage-manifest.json \
  --email owner@example.com \
  --reason 'Bootstrap the initial accountable stage owner' \
  --confirm admin-membership-change \
  --ssh-key ~/.ssh/id_ed25519 \
  --known-hosts ~/.ssh/known_hosts
```

Only the zero-owner bootstrap omits `--actor-email`. Every later grant, revoke,
or prune names an existing active owner with `--actor-email`. The wrapper uses
strict host-key checking, verifies the exact manifest against active deployment
state, and executes the built CLI inside the active backend image. It does not
copy database credentials to the laptop. It also does not overwrite deploy code
on the VPS: the active release must already contain
`infra/deploy/admin-cli.mjs`, and only a short-lived mode-`0600` JSON request is
uploaded. The backend command receives the validated request on standard input,
so email addresses and audit reasons do not appear in Docker or process
arguments. If an older release lacks the immutable operator bundle, deploy a
release containing it before using the remote membership command. See the full
behavior and list/prune examples in the
[admin user-management guide](../user-flows/admin-user-management.md#cli-verification).

## Migration and traffic-switch order

The deployment runner owns this exact order:

1. Validate environment, immutable manifest, current state, and lock.
2. Verify the required recent backup/restore evidence.
3. Run the one-shot migrator exactly once using its separate one-connection
   credential. The advisory lock and migration ledger are backstops, not reasons
   to run multiple jobs.
   On initial startup without an active slot, run the account-deletion journal
   recovery gate before starting application traffic. Ordinary blue/green
   deployments with an active slot do not replay it against live admin or purge
   traffic. After a PostgreSQL restore, stop all application/worker traffic and
   run the gate separately before isolated smoke or traffic activation; see
   [database recovery](database-recovery.md#disaster-recovery).
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
