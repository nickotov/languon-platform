# Verification evidence: Release and deployment platform

Updated: 2026-08-18

## Outcome

Implementation and local acceptance are complete. The provider-neutral release,
deployment, migration, backup, resource-profiling, and operations contracts have
been exercised locally. GitHub environment approvals, GHCR publication, Timeweb
networking, public DNS/certificates, external monitoring, and a real off-host S3
restore remain first-stage launch checks because they require the owner's cloud
accounts and credentials.

## Automated verification

- `pnpm check` — passed after final remediation: format, agent instructions,
  user-flow docs, lint, typecheck, tests, and all workspace builds.
- `pnpm typecheck` — passed, 10/10 Turborepo tasks.
- `pnpm test` — passed. This includes 62 release/deployment tests (59 passed,
  three opt-in Docker journeys skipped by the aggregate), 224 backend tests,
  62 web tests, the admin health test, and all package tests.
- `pnpm build` — passed, 7/7 workspaces including web/admin standalone-capable
  production builds and the built backend migrator.
- `pnpm db:check` — passed; checked-in Drizzle history is valid.
- `ALLOW_DISPOSABLE_DATABASE_TESTS=true ... vitest run
tests/integration/database/migrations.test.ts` against a dedicated loopback
  PostgreSQL 17 container on port 55439 — passed 5/5: clean application,
  constraints/indexes, repeat application, concurrent advisory locking, and
  migration-history tamper rejection. The disposable container was removed.
- `pnpm format:check`, `pnpm agent-skills:check`,
  `pnpm docs:user-flows:check`, and `git diff --check` — passed.
- `pnpm user-flow:e2e -- check release-deployment-platform` and the corresponding
  `user-authentication` inspection/check — synchronized and passed.

## Production packaging and runtime

- All four Dockerfiles built successfully from the frozen workspace lockfile on
  Node.js 24. Docker inspection confirmed `node` as the runtime user, immutable
  source-revision OCI labels, and health checks on backend/web/admin. Observed
  local sizes: backend/migrator 374 MB, web 308 MB, admin 303 MB.
- Real container/browser verification used the built web and admin images on
  loopback ports. Agent Browser 0.33.0 / Chrome 152 verified the web home at
  wide and 390x844 viewports, web `/healthz`, admin home, and admin `/healthz`.
  Release identity matched the image revision; no page or console errors were
  observed. The isolated browser session and containers were closed.
- `pnpm browser:check` passed 9/9 wrapper and real-launch checks.

## Deployment and connection draining

- `LANGUON_DEPLOY_E2E=true node --test
infra/deploy/tests/local-rehearsal.journeys.test.mjs` — passed in 143 s. It
  built/pushed exact local digests, applied migrations before app start,
  deployed blue, proved a real unreachable-database migration failure left blue
  active, promoted a distinct second release identity to green, rolled back
  without rerunning the older migrator, verified again, and asserted removal of
  every scoped container/network/volume.
- `LANGUON_DEPLOY_E2E=true node --test
infra/deploy/tests/stream-drain.journey.test.mjs` — passed. A real TLS NGINX
  reload moved new requests to green while an already-open blue backend stream
  completed on the shutting-down old worker.
- `LANGUON_DEPLOY_E2E=true node --test
infra/deploy/tests/production-redis-tls.journey.test.mjs` — passed 1/1 against
  disposable Redis 8. The real backend rate limiter succeeded over verified TLS
  with its restricted named ACL, denied the next limited request, and confirmed
  `FLUSHALL` remained forbidden. The isolated container was removed.
- Manual TLS smoke checks against the deployed rehearsal returned the web and
  backend dependency-aware release identities, admin identity, HTTPS edge
  health, and an HTTP-to-HTTPS 308. This found and fixed a missing HTTPS
  `/edge-healthz` location.
- Deterministic contracts cover migration/readiness failure containment, lock
  serialization and stale-owner recovery, NGINX validation, atomic upstream
  replacement, post-commit cleanup/audit failure, rollback without an older
  migrator, source-content-bound migration classification, manifest immutability,
  trigger/ref restrictions, action pinning, remote SSH allowlisting, and
  sanitized audit output.
- The first mapped E2E exposed cleanup interpolation errors that left disposable
  resources behind. Cleanup was fixed and the E2E now asserts absence of all
  scoped Docker resources; the strengthened rerun passed.

## Resource profile

- `pnpm resources:profile -- --reuse-build-cache` and
  `pnpm resources:dashboard` — passed after a real integration fix added the
  profiler's explicit trusted edge subnet. Raw evidence is ignored under
  `.artifacts/resource-profile/`; the dashboard is self-contained.
- Reference host: Apple M3 Pro arm64, 11 logical CPUs, 18 GiB host RAM, Docker
  29.6.2 with a roughly 3 GiB Docker VM allocation. The run is intentionally
  labeled dirty/incomparable until the first clean `--record` baseline.
- Build-scoped BuildKit peaks were available: backend 185% CPU / 1.50 GB RSS,
  web 181% / 1.44 GB, admin 184% / 1.49 GB, migrator 52% / 503 MB. Build
  durations were 143 s, 26 s, 20 s, and 4 s respectively on the warm path.
- Full-topology peaks including edge/PostgreSQL/Redis were 610 MB idle, 788 MB
  under representative web plus dependency-ready load, and 1.17 GB during
  blue/green overlap. Load handled 14,874 requests at 664 rps and overlap handled
  15,602 at 780 rps, both with zero errors and 12–13 ms p95.
- The only threshold flag was `host.disk` (91% used). Validation exposed that
  ignored profiler output was entering Docker's build context (2.35 GB); adding
  `.artifacts` to `.dockerignore` reduced the context to about 36 MB. Minimal
  cache export replaced the initial multi-gigabyte intermediate-layer export.
  These measurements support the documented
  provisional 4 vCPU / 8 GB plans but do not replace production trend data.

## User journeys and database compatibility

- The current deployment guide maps only the behavior a local system can prove:
  `local-deploy-verify-rollback`. GitHub approvals/events and Timeweb controls
  remain workflow contracts and launch checks rather than misleading local E2E
  claims.
- The affected authentication flow was rerun with dedicated disposable
  PostgreSQL/Redis: `pnpm --filter @languon/web test:e2e` passed all 6 Chromium
  journeys, including signup, password reset, passkeys, i18n, and theme state.
  Both disposable data containers were removed by the guarded harness.

## Backup and restore

- `infra/backup/backup.test.mjs` passed 9/9. Coverage includes recent-backup and
  compatible-restore gates, future/stale evidence rejection, encrypted private
  upload verification, retention, checksum/tool-major validation, and a twice-
  confirmed empty disposable restore target. Production create/restore also
  reject weaker PostgreSQL TLS than `verify-full` and forward the configured CA
  root to libpq.
- No real S3 bucket or shared database was touched. A timed encrypted off-host
  restore drill is a mandatory production launch check in the runbook.

## Security and supply-chain evidence

- Runtime images and third-party Compose images are digest-pinned; GitHub
  actions are pinned to full commit SHAs. Workflow permissions are scoped and
  deployment copies an allowlisted bundle over Tailscale/SSH with pinned host
  identity. Secrets remain in GitHub environments or root-owned host files.
- Production data transport now fails closed: PostgreSQL requires
  `sslmode=verify-full`, Redis is TLS-only with a named restricted ACL user,
  application/migrator containers mount only the CA, and web/admin do not join
  the data network. Deployment config rejects symlinks, non-private modes,
  untrusted ownership, and non-loopback admin binding. Dockerfile frontend
  syntax is digest-pinned and stage/production use distinct Tailscale tags.
- Production promotion byte-compares the release asset with the canonical
  successful-workflow artifact, re-verifies its attestation, and restricts every
  image digest to this repository's GHCR namespace.
- Docker Scout is installed, but an automated scan was not executed because it
  may transmit private-image SBOM metadata to Docker's external service without
  separate owner authorization. The launch checklist retains a local/offline or
  explicitly authorized image scan requirement.
- Independent correctness, test, and security reviews are recorded in
  `REVIEW.md` after final remediation.

## External boundaries and residual launch checks

- Execute the first manual stage workflow in GitHub with real GHCR,
  attestation, protected environment, Tailscale, SSH, and host secrets.
- Validate public DNS/ACME renewal, external HTTPS monitoring, closed database,
  Redis and admin ports, private app-to-data routing, alert delivery, and a
  timed encrypted off-host restore on the selected Timeweb plans.
- Record the first clean comparable resource observation after this feature is
  committed; ongoing purchase decisions must use that history and production
  telemetry, not this dirty-worktree development measurement alone.
