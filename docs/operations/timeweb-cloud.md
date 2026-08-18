# Timeweb Cloud provisioning appendix

This appendix maps the provider-neutral topology to the Timeweb Cloud control
panel as of 2026-08-18. Recheck linked official documentation before purchase or
network changes; provider product names and panel layout can change. Timeweb is
the infrastructure adapter, not a runtime dependency.

Do not purchase solely from these provisional sizes. Run the local resource
profile and review [capacity guidance](./monitoring-capacity.md) first.

## Prepare the account

1. Enable MFA and add accountable operators. Store recovery methods outside the
   application servers.
2. Add SSH public keys in the control panel before creating servers. Do not put
   private keys or reusable Tailscale auth keys in cloud-init.
3. Select one Timeweb region that supports the required BGP private networking.
   Keep tightly coupled app/data hosts in that region unless measured latency
   and a tested routing design justify otherwise.
4. Create separate staging and production projects/networks, firewalls, object
   prefixes/credentials, monitors, and DNS names. Never connect staging to the
   production private data network.

## First staging VPS

1. In **Networks**, create the staging private network. New Timeweb private
   networks use BGP; choose the target region/address range and record it in the
   environment inventory, not in repository files. See
   [creating BGP networks](https://timeweb.cloud/docs/vpc/managing-bgp-networks/creating-bgp-networks).
2. Create an Ubuntu LTS x86_64 cloud server in that network from the start. This
   avoids later attachment/reboot work described in
   [adding services to BGP](https://timeweb.cloud/docs/vpc/managing-bgp-networks/adding-services-to-bgp).
   Start from the measured capacity; the current hypothesis is 4 vCPU, 8 GB RAM,
   and 100 GB NVMe.
3. Attach a stable public IP to the staging application host. Review the
   provider's [server network management](https://timeweb.cloud/docs/cloud-servers/manage-servers/network)
   instructions before adding/removing IPs. Record both public and private
   addresses in the restricted environment inventory.
4. Supply reviewed, idempotent bootstrap through Timeweb
   [cloud-init](https://timeweb.cloud/docs/cloud-servers/manage-servers/cloud-init):
   create the deploy account, update packages, enable automatic security updates
   and NTP, and install prerequisites. Do not embed GitHub, registry, database,
   Tailscale, S3, or monitoring secrets in user-data.
5. Install Node.js 24 for the host-local deployment CLI, plus Docker Engine and
   the Compose plugin from their official Ubuntu package sources. Pin/record
   versions and enable Docker at boot. Verify `node --version`, Compose, cgroup
   resource reporting, log rotation, and restart after a controlled reboot.
   NGINX runs as the stable checked-in Docker edge; there is no separate Timeweb
   NGINX product to configure.
6. If the private address is not configured inside the guest, follow Timeweb's
   [private IP configuration](https://timeweb.cloud/docs/vpc/managing-bgp-networks/configuring-private-ip)
   for the selected Ubuntu/network renderer. Verify address, route, DNS, and
   persistence after reboot before deployment.
7. Join Tailscale with the staging server tag, then disable public password/root
   SSH. Retain only the reviewed emergency ingress path.

PostgreSQL and Redis live on the same staging VPS but expose no host/public
ports. Their volumes are independent from blue/green application slots and must
not be removed by deploy cleanup.

### Docker Engine on Ubuntu

After reviewing the current
[Docker Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/),
run the repository-supported package path as an accountable sudo operator:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
node --version # must report the supported Node.js 24 major
```

Compare the repository URL, fingerprint/instructions, and Ubuntu codename with
Docker's current official page before execution. Do not pipe a remote script
into a root shell. Grant Docker access only to the dedicated deploy operator;
Docker group membership is root-equivalent. Configure the Docker `json-file`
logging driver with bounded rotation, validate the daemon JSON, restart during a
maintenance window, then repeat the version and local-container smoke checks.

The application NGINX is `infra/deploy/compose/edge.compose.yaml` plus
`infra/nginx/nginx.conf`; do not install a second host NGINX that silently owns
ports `80`/`443`. The deployment runner uploads that checked-in bundle, validates
`nginx -t`, and reloads the stable container. TLS certificate/account state must
use persistent host storage outside blue/green slots and survive application
cleanup.

## Timeweb firewall and DHCP

Create and attach a staging firewall group before publishing DNS:

- public TCP `80` and `443` to the application host;
- SSH only from approved emergency sources when Tailscale alone is insufficient;
- no public PostgreSQL `5432`, Redis `6379`, admin, metrics, or Docker API; and
- required established/related and provider network/DHCP behavior.

Timeweb documents a material DHCP caveat for allow-list firewalls on private
networks: required DHCP traffic must be permitted or the server can lose its
private address. Follow the current rule details in
[Timeweb firewall management](https://timeweb.cloud/docs/firewall/upravlenie-fajrvolom),
then verify lease renewal and connectivity after attachment/reboot. Do not guess
wide UDP rules or copy an obsolete CIDR from this appendix.

Provider firewall is one layer. Also verify the guest firewall and Docker's
effective published ports from an external host. A green panel state is not
evidence that a Compose port is private.

## DNS and TLS

1. Create the environment hostname in the authoritative DNS service and point an
   `A` record at the stable public application IP. Do not add `AAAA` until IPv6
   works end to end.
2. Use a low TTL during the first launch, then raise it after the address is
   stable. DNS is not used for blue/green switching.
3. Configure NGINX certificate issuance/renewal with persistent certificate
   storage. Keep ACME account data outside application slots.
4. Validate NGINX and HTTPS before opening user traffic. Add external certificate
   expiry alerts and rehearse graceful reload after renewal.

## Private backup storage

1. Create a private bucket through Timeweb's
   [S3 bucket flow](https://timeweb.cloud/docs/s3-storage/manage-storage/create-bucket).
   Never enable public listing/read.
2. Enable supported versioning/retention and server-side encryption. Choose a
   lifecycle that preserves at least seven daily and four weekly backups.
3. Create separate least-privilege backup-writer and restore-reader credentials,
   scoped to the environment prefix. Store them only in root-owned host files or
   the protected recovery system.
4. Upload a synthetic object, validate checksum/download with the restore
   identity, delete the synthetic object, then perform the database restore
   drill. A successful upload alone is not backup evidence.
5. Keep production and staging prefixes/credentials isolated. Prefer a bucket or
   project failure domain that is not deleted with the VPS.

## Timeweb monitoring panel

Create an external HTTPS monitor using Timeweb's
[monitor creation guide](https://timeweb.cloud/docs/monitoring/create):

- probe a public edge health URL over HTTPS with expected success status;
- configure more than one notification recipient/channel;
- alert on failure and TLS expiry where supported; and
- test failure notification during the launch window.

The public provider monitor cannot validate private admin/data services. Send
host/container/database/cache metrics and logs to the selected Grafana
Cloud-compatible destination and errors to Sentry. Include environment and
release identity, never credentials or user content.

## Later production split

1. Create a distinct production BGP private network before either server.
2. Create the application VPS in that network with a stable public IP; apply the
   public-edge firewall rules above.
3. Create the data VPS in the same private network. Do not assign a public IP
   unless bootstrap requires a temporary, explicitly firewalled path; remove or
   close that path after Tailscale/private access works.
4. Bind PostgreSQL/Redis to the data host's private address. Allow `5432` and
   `6379` only from the explicit application private source and required
   operator/recovery sources. PostgreSQL `pg_hba.conf` and Redis ACLs remain
   mandatory even with provider firewall isolation.
   Configure service certificates for the private DNS name, disable plaintext
   Redis, require PostgreSQL `hostssl`, and copy only the issuing CA certificate
   to the application host. Use the checked-in sanitized production-data, HBA,
   and Redis ACL examples as the provisioning contract.
5. Verify DHCP/private-IP persistence, app-to-data routing, MTU, DNS, PostgreSQL
   TLS/credentials, Redis ACL/credentials, and denial from an external host.
6. Configure the app's database pool with overlap budget for both backend slots
   plus migration/operator headroom. Alert on saturation.
7. Configure off-host backup and complete a timed restore drill before the first
   production migration or user data.

Attaching an existing Timeweb service to BGP can reboot or interrupt it. Treat
network attachment, IP changes, and data-host maintenance as scheduled
infrastructure work, not part of the ordinary graceful application deployment.

## Launch acceptance record

Record without secrets:

- region, plan/storage, server IDs, public/private IP inventory location;
- BGP network and firewall IDs/rule review date;
- OS, Docker, Compose, NGINX, PostgreSQL, and Redis versions;
- DNS/TLS validation and external closed-port evidence;
- Tailscale ACL/tag review;
- S3 bucket policy/retention review and restore-drill result;
- monitor/alert delivery test; and
- first resource profile plus selected headroom rationale.
