# Independent review: Admin user management

Reviewed: 2026-08-20
Reviewers: independent code reviewer, security reviewer, and tester
Verdict: Approved

## Scope reviewed

- Feature, ExecPlan, evidence, ADR-0010, design contract/board, architecture,
  operator, deployment, Timeweb, and user-flow documentation.
- Admin SPA, shared browser authentication, backend administration module,
  PostgreSQL schema/migrations, local/remote commands, static image, private
  edge, workflow/release integration, and focused/full tests.
- Real browser, Playwright, disposable PostgreSQL/Redis, real NGINX, and final
  OCI runtime evidence.

## Findings and resolutions

### High — Basic and application authorization header collision

- Location: private NGINX admin API proxy and admin browser HTTP client.
- Problem: NGINX Basic Authentication and the application Bearer token both
  occupied `Authorization`, so protected application requests could not satisfy
  both layers.
- Impact: production admin API requests would be rejected before backend auth.
- Resolution: Fixed. Production admin uses the scoped
  `X-Languon-Admin-Authorization` transport; NGINX consumes Basic, strips the
  scoped header, and sets upstream `Authorization`. A real-edge journey proves
  both controls compose.

### High — host-private htpasswd was unreadable by NGINX workers

- Location: edge Compose secret mount and NGINX runtime.
- Problem: the required host mode-0600 file was not readable by unprivileged
  worker processes.
- Impact: valid private-edge credentials could fail in production.
- Resolution: Fixed. A root-started entrypoint copies only the hash file into a
  bounded tmpfs, chowns the directory/file to nginx, applies 0500/0400 modes,
  and then starts NGINX. Real NGINX verifies invalid/valid credentials and the
  resulting ownership/mode.

### Medium — access-token refresh and retry behavior

- Location: admin auth provider/API client.
- Problem: an expired 15-minute in-memory token caused sign-out rather than one
  coordinated refresh/retry, and concurrent 401s could rotate twice.
- Resolution: Fixed. Protected requests refresh on missing token, coordinate a
  single refresh after 401, and retry once. Network failures remain actionable
  rather than being collapsed into authentication failure; unit coverage proves
  concurrent behavior.

### Medium — authorization time-of-check races

- Location: administration service/store mutation transaction.
- Problem: membership/session/recent-authentication checks occurred before the
  shared owner lock or reused request time after waiting on it.
- Impact: a queued request could mutate after membership revocation or after a
  session/recent-auth boundary.
- Resolution: Fixed. Actor, active membership, exact session, absolute expiry,
  and recent authentication are revalidated under the advisory transaction
  lock using fresh `clock_timestamp()`. Held-lock integration tests prove both
  revocation and expiry boundaries.

### Medium — incomplete rejection audit context

- Location: self-disable, mutation conflicts, and membership operator commands.
- Problem: authorized rejections omitted state/version/rejection context or
  were rolled back without an audit event.
- Resolution: Fixed. Rejected events are committed after the rejected mutation
  transaction and include actor, target when known, status/version,
  expected-version or membership context, rejection code, correlation, reason,
  occurrence, and expiry. Unit and disposable PostgreSQL tests cover
  self-disable, recent-auth, duplicate/absent membership, and last-owner cases.

### Medium — audit correlation uniqueness

- Location: migration 0006 schema/index.
- Problem: treating correlation as unique incorrectly turned tracing into an
  idempotency key.
- Resolution: Fixed by generated migration 0007, which replaces the unique
  constraint with a normal lookup index; repeated correlation is integration
  tested and deployment classification/hash updated.

### Medium — retry/offline accessibility and coverage

- Location: dashboard, users, and audit load-error states.
- Problem: two retry actions were non-focusable anchors, audit had no retry,
  and network failure had no explicit offline guidance.
- Resolution: Fixed through a shared Ant Button-based alert on all three pages,
  with preserved filters, offline/service distinction, and component tests.

### Medium — personal data in operational transports/logs

- Location: remote membership command and private NGINX logging.
- Problem: email/reason could appear in process arguments; upstream error logs
  could include search query emails even though access logs were sanitized.
- Resolution: Fixed. Operator JSON travels through strict bounded stdin and a
  mode-0600 short-lived remote request. The admin access format omits arguments,
  server-scoped error logging retains only critical process failures, and a
  failed-upstream real-edge assertion proves the synthetic email is absent.

### Medium — source maps and mapped E2E completeness

- Location: admin Vite production build and user-flow command registry.
- Problem: production source maps were exposed, and the registered command ran
  Playwright but not its declared real-NGINX scenario.
- Resolution: Fixed. Production sourcemaps are disabled and absent from the
  image. `pnpm test:e2e:admin-user-management` now executes Playwright 5/5 then
  the guarded real-NGINX journey 1/1; guide markers are synchronized.

## Acceptance-criteria audit

- [x] Every AC-1 through AC-14 criterion is implemented and evidenced.

## Architecture and test audit

- [x] DDD, application/package, and frontend boundaries are preserved.
- [x] ADR-0010 and the accepted migration/deployment ADRs match the result.
- [x] Tests cover the material auth, persistence, transaction, browser,
      deployment, concurrency, privacy, and failure regression surfaces.
- [x] User-flow guides match current commands/behavior and all six scenarios
      map to the composite command's real E2E files.
- [x] Real browser, disposable database/cache, NGINX, and final image evidence
      supplements—not replaces—the automated suites.
- [x] Generated E2E caches and disposable containers/data were removed; no
      secrets, conflict markers, or debugging artifacts remain.

## Final verdict

Approved. No Critical, High, or material Medium functional, security,
architecture, or test findings remain. External Timeweb/network/TLS/SSH and
credential-rotation checks remain documented launch operations rather than
feature defects.
