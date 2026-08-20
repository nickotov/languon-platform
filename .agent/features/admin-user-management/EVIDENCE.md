# Verification evidence: Admin user management

Updated: 2026-08-20

Status: Complete.

## Automated tests

### Unit and contract

- Full command: `pnpm check`.
- Result: passed formatting, agent-skill validation, user-flow validation,
  repository lint, all workspace typechecks, all ordinary tests, and all
  workspace builds.
- Relevant counts within the full run:
    - admin: 9/9;
    - browser-auth: 6/6;
    - contracts: 23/23;
    - public web regression suite: 62/62;
    - backend: 242/242 with 47 explicitly opt-in infrastructure tests skipped;
    - deterministic release/deployment suite: 67 passed with four explicitly
      opt-in Docker journeys skipped.
- Focused administration service result: 5/5.
- Coverage includes contracts and bounded errors, persistence-backed
  authorization, dedicated cookie/refresh coordination, one-refresh retry after
  access-token expiry, status transitions, rejection audit context, CLI parsing,
  SSH argument validation, accessible retry/offline presentation, and the
  admin/web frontend boundary.

### Disposable PostgreSQL

- Command:

    ```sh
    ALLOW_DISPOSABLE_DATABASE_TESTS=true \
    AUTH_TEST_DATABASE_URL='postgres://admin_e2e:***@127.0.0.1:55439/languon_auth_admin_e2e_test' \
    AUTH_TEST_DATABASE_CONFIRM='languon_auth_admin_e2e_test' \
    pnpm --filter @languon/backend exec vitest run \
      tests/integration/database/administration-store.test.ts \
      tests/integration/database/migrations.test.ts
    ```

- Result: 16/16 passed against dedicated PostgreSQL.
- Forward migrations: 0001 through 0007 passed. Migration 0007 replaces an
  accidental unique correlation index with a normal lookup index; the reviewed
  deployment classification is `expand` and content-hash bound.
- Invariants proven: user status/session/audit atomicity, verified/pending
  restore, stale version, last-owner protection, serialized concurrent changes,
  post-lock actor membership/session revalidation, a held-lock
  recent-authentication expiry boundary using fresh PostgreSQL wall time,
  repeated trace correlation, authorized operator rejection audits, one-year
  expiry, and pruning.
- Rollback policy: database rollback remains forward-fix under ADR-0002;
  application rollback compatibility is covered by deployment tests.

## End-to-end and real-edge verification

- Canonical mapped command:

    ```sh
    ADMIN_E2E_DATABASE_URL='postgres://admin_e2e:***@127.0.0.1:55439/languon_auth_admin_e2e_test' \
    ADMIN_E2E_REDIS_URL='redis://127.0.0.1:56389' \
    pnpm test:e2e:admin-user-management
    ```

- Result: passed Playwright 5/5 and real private-edge NGINX 1/1.
- Browser journeys:
    - owner password login, dedicated refresh, search, and safe detail;
    - audited disable and restore with actor/target/reason/correlation evidence;
    - recent-authentication rejection with retained reason and explicit sign-in;
    - verified non-member denial;
    - public passkey enrollment and admin passkey authentication.
- Real-edge journey: a uniquely named disposable network runs the production
  NGINX configuration with a root/host-owned mode-0600 htpasswd source copied to
  an nginx-readable tmpfs file. It proves invalid Basic credentials return 401,
  valid Basic reaches the SPA, the scoped admin token becomes upstream Bearer
  authorization without colliding with Basic, and a failed backend request with
  an email search returns 502 without placing that email in combined NGINX logs.
- Cleanup: the edge fixture removed its containers/network. The two dedicated
  PostgreSQL/Redis E2E containers were explicitly removed after all verification;
  their synthetic data is not recoverable and no named volumes remained.

## Managed-browser acceptance

- Tool/environment: project-pinned `agent-browser` 0.33.0 with Chrome for
  Testing 152, local Vite/backend, and synthetic disposable identities.
- Final scenario: password login; overview; users; administrative audit with
  actor, target, reason, and copyable correlation reference; Dark selection and
  reload persistence; 1440x900 and 320x800 layouts; labeled narrow navigation;
  accessibility snapshots; console, page-error, and network inspection.
- Result: passed. No page errors or unexpected console messages occurred. The
  only failed request was the intentional unauthenticated refresh probe before
  login; all protected requests after login returned 200. Theme persisted after
  reload and narrow navigation remained reachable.
- Screenshots:
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1787223989167.png`
      — wide overview;
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1787224017846.png`
      — wide dark users;
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1787224047401.png`
      — dark audit with correlation references;
    - `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1787224075241.png`
      — 320px audit/navigation state.
- The task-scoped browser session was closed. Playwright evidence above remains
  separate from this exploratory acceptance evidence.

## Production image and deployment checks

- Final image command: `docker build --file infra/docker/prod.admin.Dockerfile
--build-arg RELEASE_SHA=f966e2522845ede4ffec821e5cccd5c535a629e7
--tag languon-admin-feature:final .`.
- Result: image digest
  `sha256:057b8aaeb121f218e3ac8b74b7799d81e5c10c13900c9bdcd075d550ec001fcb`.
  Runtime used `nginx`, became healthy, exposed the exact 40-character release
  SHA, returned SPA HTML plus CSP/nosniff/referrer/frame/no-store headers for a
  deep link, and contained no `.map` files. The verification container was
  stopped and auto-removed.
- Deployment contracts cover the unprivileged static image, SHA health,
  blue/green participation, public admin denial, private loopback binding,
  Basic/Bearer separation, private secret validation and tmpfs delivery,
  immutable remote operator bundle, active-manifest binding, and resource
  profiler inclusion.
- Admin build remains route-lazy. The shared Refine/Ant entry is approximately
  560 kB minified / 172 kB gzip and produces Vite's 500 kB advisory warning.

## User-flow traceability

- Current guide: `docs/user-flows/admin-user-management.md`.
- Revision: `sha256:7906dbb455be4f3b` in both mapped test files.
- `pnpm user-flow:e2e -- check admin-user-management`: passed.
- `pnpm docs:user-flows:check`: 16/16 validator tests passed; all six repository
  guides and mappings validated.
- Unlike the earlier Playwright-only mapping, the registered command now runs
  both mapped files and all six declared scenarios.

## Independent review

- Tester: passed admin 9/9, browser-auth 6/6, backend and deployment focus,
  traceability, and browser journeys; no blocking test defect remained.
- Code reviewer: approved the final implementation. All original medium
  findings were remediated; only durable-state synchronization remained when
  the reviewer issued the verdict, and this document plus `EXEC_PLAN.md`,
  `FEATURE.md`, and `REVIEW.md` completes it.
- Security reviewer: approved with no remaining Critical, High, or material
  Medium security findings.

## Remaining risks and launch work

- Timeweb firewall/private routing, Tailscale policy, DNS/TLS, SSH host identity,
  htpasswd creation/rotation, log-sink permissions, and first remote deployment
  require the documented launch verification on the real account/VPS.
- The remote SSH deployment identity is intentionally a trusted privileged
  operator; protect and rotate it accordingly.
- The Refine/Ant shared chunk warning is accepted for this operator-only V1 and
  should be revisited using measured admin load performance as resources grow.
