# Deployment security operations

The deployment platform crosses registry, CI, SSH, proxy, database, cache,
backup, DNS, and monitoring trust boundaries. Apply least privilege per
environment and assume deployment logs/artifacts are broadly visible to
repository operators.

## Network boundaries

- Public application hosts accept only HTTPS (`443`) and optional HTTP (`80`)
  for redirect/certificate challenges. Restrict SSH to the private operator
  network or a narrow emergency source.
- Admin is private. Bind its edge listener to loopback, reach it through the
  accountable SSH/Tailscale operator path, and require a named NGINX Basic Auth
  identity before application owner authentication. Do not publish or
  load-balancer-route its container port publicly.
- Production PostgreSQL and Redis bind only to the private provider interface
  and accept only explicit application-host sources. Staging database/cache
  ports stay on Docker networks and are not published by Compose.
- Private networking does not replace transport authentication. Production
  PostgreSQL requires `sslmode=verify-full`; Redis disables plaintext and uses
  `rediss://` with a named application ACL restricted to the authentication key
  namespace and commands. Web/admin do not join the data network.
- Docker-published ports can bypass simple UFW expectations. Verify effective
  provider firewall, host nftables/`DOCKER-USER`, and external reachability
  after every Compose or Docker upgrade.
- GitHub-hosted deployment uses an ephemeral Tailscale identity with an
  environment-specific ACL. Do not run a general privileged self-hosted runner
  on an application or data host.
- NGINX trusts forwarded client/proxy headers only from known proxy hops. Never
  accept arbitrary internet `X-Forwarded-*` headers as authentication or
  authorization evidence.

## Secret ownership

Keep deployment secrets in protected GitHub environments and root-owned host
files outside the repository. Use separate values for staging and production.
At minimum separate:

- GHCR publisher identity from host read-only registry identity;
- Tailscale ephemeral deploy credential from human operator identities;
- application database role, one-connection migrator role, and backup role;
- application Redis ACL from Redis administration;
- backup writer from restore reader/admin;
- Sentry/telemetry ingestion from administrative API credentials; and
- staging from production credentials, buckets, networks, and domains.

Never place secrets in Dockerfiles, Compose YAML, image labels, release
manifests, resource history/dashboard, deployment audit, command arguments that
are process-visible, or repository examples. Prefer file/stdin-based secret
delivery supported by the implementation. An `.env` file on a host is still a
secret: directory `0700`, file `0600`, owned by the deploy/runtime account, and
excluded from backup logs.

The private-admin edge keeps the host htpasswd file at mode `0600`, copies it to
container tmpfs as worker-owned mode `0400`, and never forwards Basic
credentials upstream. Browser application JWTs use a dedicated edge-only
header that is stripped and translated to backend `Authorization`. Private
access logs use `$uri` without `$args`; administrator operations pass their
structured request through a mode-`0600` transfer file and container stdin, not
Docker process arguments.

## Access setup and review

1. Enforce MFA for GitHub, Timeweb, domain registrar, Tailscale, S3, Sentry, and
   Grafana accounts. Prefer organization-owned accounts and recovery methods.
2. Protect GitHub `production` with required reviewers. Only the manual
   production workflow receives production secrets.
3. Tag Tailscale nodes by role/environment and allow only necessary ports.
   Ephemeral CI identities expire after the job and cannot reach the data tier
   directly unless the deployment step requires it.
4. Disable SSH password/root login after proving two independent operator keys.
   Keep attribution through named accounts and review authorized keys quarterly.
5. Review Timeweb/provider firewall and private-network membership after any
   server attachment, IP, DHCP, or topology change.
6. Test from an external network that `5432`, `6379`, Docker API, admin, metrics,
   and SSH are closed as designed. Do not use production credentials in the
   test.

## Rotation

Rotate one dependency at a time with overlap:

1. Create the new least-privilege credential.
2. Store it in the protected environment/host file without logging its value.
3. Deploy or reload the consumer and prove readiness plus its focused operation.
4. Revoke the old credential and verify it fails.
5. Record actor, scope, time, and result—not the value—in the audit trail.

Use this sequence for database, Redis, registry, backup, telemetry, and
Tailscale credentials. TLS private-key rotation additionally requires a config
validation and graceful NGINX reload. Restore credentials require a disposable
restore drill before revocation.

## Compromise response

1. Revoke the suspected identity/token first and stop active workflow runs.
2. Preserve provider, GitHub, host, NGINX, Docker, database, and audit logs with
   access controls; do not paste raw logs into public issues.
3. Determine whether an image, manifest, host config, backup, or data was
   modified. Pin known-good digests and isolate affected hosts.
4. Rebuild a compromised host from a clean image instead of trusting in-place
   cleanup. Restore durable data through the reviewed recovery path.
5. Rotate downstream credentials reachable by the compromised principal and
   review use during the exposure interval.
6. Validate external exposure, readiness, integrity, backups, and monitoring
   before returning traffic.

Production enrollment/email remains unavailable until its separate capability
is implemented. Deployment must not enable development fixed verification codes
or expose local authentication defaults to create users.
