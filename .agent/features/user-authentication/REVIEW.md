# Independent review: User Authentication

Reviewed: 2026-08-13
Reviewers: independent correctness, security, testing, architecture, and product agents
Verdict: Approved after remediation; no open critical, high, or medium finding

## Scope reviewed

- Complete feature diff against `FEATURE.md`, `EXEC_PLAN.md`, ADR-0001, and
  ADR-0002.
- Shared contracts, user/auth domain and application boundaries, PostgreSQL and
  Redis adapters, migrations, runtime composition, Hono/OpenAPI surface, web
  state/UI, and automated/manual browser evidence.
- Authentication threat surface: password/code storage, enumeration, session
  rotation/replay/logout, JWT/cookies/origin/CORS, trusted proxies, rate limits,
  body bounds, WebAuthn, persistence ownership, security events, and secrets/PII.

## Material findings and resolution

### High

- Enumeration through identity-dependent signup/resend/forgot cooldown results.
    - Resolution: true Redis rolling windows use HMAC-derived opaque subjects;
      signup seeds flow aliases to the same address counters, and forgot applies
      the same pre-lookup cooldown for existing and nonexistent identities.
- Logout of a rotated predecessor left its refresh successor active.
    - Resolution: logout now locks the supplied digest and revokes its complete
      family in the same transactional serialization path as rotation. Sequential
      and concurrent real-PostgreSQL regressions pass.

### Medium

- Repeated signup and fixed-window counters violated the 60-second/five-per-
  rolling-hour issuance policy.
    - Resolution: initial issue, signup replacement, and resend share rolling
      address/flow counters; database checks remain a transactional backstop.
- Duplicate passkey persistence conflicts fell through to HTTP 500.
    - Resolution: persistence conflicts map to a stable non-secret `409 conflict`.
- Authentication bodies were unbounded before parsing.
    - Resolution: early Hono body middleware enforces a 384 KiB cap, large enough
      for the bounded WebAuthn registration contract; valid 200k attestations reach
      validation and >384 KiB requests return stable 413 errors.
- Concurrent logins could falsely fail during password-parameter rehash.
    - Resolution: the loser reloads and verifies the current credential before
      retrying session issuance without a second replacement.
- Protected OpenAPI operations lacked bearer-security metadata.
    - Resolution: the bearer scheme and per-operation declarations are registered
      and asserted.
- `db:studio` lacked credentials.
    - Resolution: Drizzle config reads explicit `DATABASE_URL` with a sanitized
      local default; the Studio workflow starts successfully.
- Refresh replay/passkey lifecycle events were incomplete.
    - Resolution: sequential/concurrent replay and passkey register/auth/rename/
      revoke outcomes record bounded coarse IDs without secrets or payloads.
- Trusted-proxy mode accepted attacker-controlled forwarding chains.
    - Resolution: configuration requires validated peer CIDRs, the direct socket
      peer must be trusted, and the chain is validated and walked right-to-left.
- Retryable refresh/logout failures cleared the browser credential.
    - Resolution: only terminal 401 responses clear it; 403/429/5xx preserve it.
- Passkey completion endpoints lacked limits.
    - Resolution: both completion paths use bounded fail-closed client/user limits.
- Required E2E journeys were absent.
    - Resolution: three Playwright journeys exercise cookie bootstrap, reset and
      session revocation, plus virtual WebAuthn failure/success/management.
- Active passkeys were unbounded despite response/options collection limits.
    - Resolution: registration serializes on the user row and permits at most 50
      active passkeys. Sequential and 51-way concurrent real-PostgreSQL tests pass.

### Low hardening

- Change-password password-manager metadata and framing protection were weak.
    - Resolution: the form includes the account email with `autocomplete=username`;
      global CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY` are asserted.

## Re-review verdict

- Focused post-remediation correctness review found no remaining critical, high,
  or medium issue after the body-bound/passkey-cap fixes.
- Focused post-remediation security review found no remaining critical, high, or
  medium vulnerability.
- Full backend disposable-infrastructure suite passes 187/187; focused HTTP
  boundary suite passes 18/18; the repository `pnpm check` and three Chromium
  E2E journeys pass.

## Residual risks and deferred scope

- Production email delivery remains intentionally unavailable until a separate
  provider integration is selected and reviewed.
- Production database/Redis TLS is an operator/provider transport-boundary
  requirement; deployed topology must not expose plaintext service connections.
- Correct `APP_ENV` classification and protection of private staging are required
  operational controls. Production rejects placeholders and fixed codes.
- The cookie strategy assumes same-site web/API deployment. Cross-site topology
  requires a superseding security decision.
- Access JWTs are not globally denylisted; already-issued tokens remain valid only
  until their configured short expiry, while sensitive operations resolve fresh
  session/user state.
- Automated E2E uses Chromium virtual WebAuthn. Real hardware/platform authenticators
  and native/admin clients remain outside this feature's scope.
