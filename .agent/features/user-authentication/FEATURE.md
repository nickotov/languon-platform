# User Authentication

Status: Complete
Owner: Engineering
Created: 2026-08-12

## Problem

Languon has no durable user identity, authentication boundary, credential model,
session lifecycle, or database migration convention. Product features therefore
cannot persist ownership, authorize access to learner data, or safely identify a
caller in HTTP or Mastra execution paths.

The initial product needs email/password signup and login, verified email
ownership, recoverable credentials, passkeys, short-lived access tokens, and
revocable long-lived sessions. The design must also leave a clear extension path
for future Google, Apple, Discord, and other OAuth identities without coupling a
user record to one login mechanism.

Authentication is security-sensitive and spans backend boundaries, PostgreSQL,
Redis, web token handling, email delivery, WebAuthn origin validation, secrets,
and deployment. It also establishes the repository's first business schema and
migration lifecycle, which must be explicit and reproducible before later
user-owned features depend on it.

## Desired behavior

### User and credential model

A user is a stable product identity independent of authentication method. A user
owns a primary email address and may have a password credential, multiple
passkeys, multiple revocable sessions, and, in later features, linked OAuth
identities. Password hashes, passkey public-key material, refresh-token hashes,
verification challenges, and future OAuth identities remain separate records;
they are never embedded in access tokens or exposed through public user models.

Initial signup collects only email and password. Email comparison is
case-insensitive after conservative normalization (trim surrounding whitespace
and lowercase the domain/address for lookup; do not apply provider-specific
alias rules). The system persists a pending user and password credential, sends
a verification challenge, and does not permit login until the primary email is
verified. Successful verification activates the user and creates a session.
When a throttled-safe signup repeats for an existing pending email, it replaces
the pending password and active verification challenge atomically so a stale,
attacker-selected password cannot become active after later verification. It
does not mutate an already verified account. Pending registrations that are
never verified are eligible for documented cleanup after 24 hours.

### Email verification and recovery

Email verification uses a four-digit code with a ten-minute lifetime, at most
five verification attempts, a 60-second resend cooldown, and at most five sends
per address per rolling hour, including the initial issue. A correct code on the
fifth attempt succeeds; a fifth incorrect attempt exhausts it. Resending or
re-registering a pending account invalidates every older challenge for that
account and purpose. Only a purpose-, user-, and flow-bound keyed digest of a
code is stored. Public signup/resend responses do not reveal whether an email
already belongs to an active or pending user.

Development and test use the deterministic code `0000`. Staging disables the
mock email flow unless an explicit insecure fixed-code switch is enabled for a
private environment; that switch also uses `0000` and emits a warning without
logging addresses or codes. Production rejects mock/fixed-code configuration.
This feature defines an email-sender application port and a development adapter,
but does not choose a production provider. Until a later adapter is configured,
production email-dependent operations return a clear capability-unavailable
response before mutating accounts or challenges rather than pretending that a
message was delivered. A public capability response lets the web hide those
flows without probing account existence.

Forgot-password uses a purpose-separated code with the same non-enumerating
challenge protections. Reset submits the flow ID, code, and new password in one
atomic operation; success consumes the code, changes the password, revokes every
existing session, and returns the user to login without issuing a new session.
An authenticated password change requires the current password, rejects the
same password, applies the same password policy, revokes all existing sessions,
and issues a replacement session for the current client.

### Password policy

Passwords are hashed with Argon2id using versioned deployment-calibrated
parameters no weaker than 19 MiB memory, two iterations, and parallelism one.
Passwords contain 15 through 128 Unicode code points, may contain spaces, are not
silently trimmed or case-folded, and have no character-class composition rules.
Common compromised passwords from a deterministic checked-in versioned blocklist
are rejected. Passwords, hashes, email codes, and token values are never logged.
Existing valid hashes are rehashed opportunistically after login when parameters
are outdated; a later password-policy change does not invalidate an existing
credential at login.

### Tokens and sessions

Successful email verification, password login, passkey login, or the replacement
session after password change returns a signed access JWT in JSON and sets an
opaque refresh credential in an HTTP-only cookie. The web keeps the access token
in memory only and uses the refresh cookie to restore a session after reload.

Access tokens contain only the minimum authorization identity: issuer,
audience, user subject, session identifier, token identifier, issued-at, and
expiry. The backend pins the configured algorithm and validates every required
claim. Initial signing uses HS256 with a high-entropy environment secret behind
an application port so a later asymmetric signer can replace it without changing
use cases. Only the backend verifies these tokens in this feature.

Production access tokens live for 15 minutes. Development and staging access
tokens live for two days. Refresh sessions have an absolute 14-day lifetime in
all environments. `AUTH_ACCESS_TOKEN_TTL` and `AUTH_REFRESH_TOKEN_TTL` expose
validated duration overrides; `AUTH_JWT_SECRET` and `AUTH_CODE_HMAC_SECRET` are
separate high-entropy secrets. Rotation never extends the original absolute
expiry.

Refresh credentials are random opaque secrets. PostgreSQL stores only a secure
hash and session/family metadata. Every refresh consumes the current credential
atomically, returns a new access JWT, and rotates the refresh credential. Reuse
of an already consumed credential revokes the entire token family. Users can log
out the current session or all sessions. Disabled users and revoked/expired
sessions cannot refresh, and access-token authorization resolves the current
user/session state for protected operations that require immediate revocation.
Already issued JWTs are not globally denylisted: ordinary stateless operations
may accept them until expiry, while credential/session/security mutations always
perform a fresh state check and fail after revocation.

The production refresh cookie is `Secure`, `HttpOnly`, host-only, and
`SameSite=Lax`, uses the `__Host-` prefix and `Path=/`, and has no `Domain`.
This requires production web and API deployment to remain same-site; a future
cross-site topology requires a new cookie/CSRF transport decision. Cookie-
authenticated endpoints use POST, require an allowed Origin, and use exact
credentialed CORS configuration. Local HTTP development uses a clearly
development-only cookie configuration. Refresh credentials are not returned in
browser-readable JSON. Auth responses use `Cache-Control: no-store`, and auth
pages use `Referrer-Policy: no-referrer`.

### Passkeys

A verified, recently authenticated user can register multiple named passkeys;
the user can list them, rename them, and revoke them, with revocation also
requiring recent authentication. “Recent” means a password/passkey proof or
initial login in the preceding five minutes; access-token refresh alone does not
extend it. Names are trimmed, contain 1–80 characters, and are case-insensitively
unique per user. Registration uses a five-minute, one-time server challenge and
cannot attach a credential to another user. Duplicate credential IDs are
rejected.

Passkeys provide discoverable passwordless login after enrollment; passkey-only
account signup is out of scope. Authentication requires user verification,
validates the exact configured RP ID and allowed origin, consumes its challenge
once, validates the signature and credential counter/backup state, and updates
credential usage metadata atomically. Losing one passkey does not remove a
password credential or other passkeys.

WebAuthn RP name, RP ID, and exact allowed origins are environment settings.
Only localhost defaults are permitted in development. Staging and production
require explicit HTTPS origins. Passkey ceremonies fail closed when Redis, the
credential repository, or required configuration is unavailable.

### Abuse prevention and privacy

Redis-backed limits protect signup, verification, resend, login, password reset,
refresh, and passkey ceremony endpoints using both account/flow and trusted
client-address dimensions. Limit responses are generic and include safe retry
metadata. Authentication performs a calibrated dummy password verification for
unknown accounts so externally visible behavior does not trivially disclose
account existence. The feature does not add permanent lockout or CAPTCHA.

Structured security events identify event type, outcome, user/session identifiers
when known, coarse error category, and correlation ID. They never include raw
credentials, JWTs, refresh values, codes, challenges, WebAuthn responses, or
unnecessary personal data. Proxy-derived client addresses are trusted only when
explicit proxy configuration permits them.

### Web experience

The web application provides accessible pages for signup, email verification,
login, forgot/reset password, session bootstrap, passkey login, and authenticated
security settings, including current/all-session logout. It consumes public auth
capability status and does not offer email flows when no sender is configured.
Forms expose pending, validation, throttled, service-unavailable, expired, and
retry states without leaking account existence. Password-manager autocomplete,
paste, show/hide controls, focus management, keyboard operation, and passkey
capability/failure fallbacks are explicit. After authentication, only a validated
same-origin relative return path is honored; otherwise navigation falls back to
`/`.

The access token is never stored in local storage. On reload, the web performs a
single refresh bootstrap before deciding whether to render authenticated or
unauthenticated content. Concurrent requests share one in-flight refresh and a
failed refresh clears local auth state without an infinite retry loop. Tabs
coordinate refresh through Web Locks when available plus BroadcastChannel state
propagation, with a tested fallback, so strict server replay detection does not
turn normal simultaneous reloads into avoidable family revocation.

### Database and migrations

Drizzle ORM becomes the canonical PostgreSQL mapping layer and Drizzle Kit the
code-first migration generator. TypeScript schema definitions declaratively map
the current schema; committed ordered SQL and migration metadata are the
authoritative database transition history. They are versioned and reviewed
together. Root/backend commands generate, validate, apply, and inspect
migrations. Shared environments never use schema `push`.

Migrations run explicitly in development and deployment before application
startup through one deployment job rather than implicitly on every HTTP process
start; a PostgreSQL advisory lock remains the concurrency backstop. Application
code may invoke the same programmatic migrator only when passed an explicit
disposable-purpose capability by trusted composition, such as the Mastra
playground—not after guessing safety from a host or database name. Forward
migration, idempotency, concurrent application, and schema invariants are
verified against disposable PostgreSQL. Destructive rollback is not inferred;
reversible down behavior is provided and tested only when a migration has a
safe, explicit inverse.

## Acceptance criteria

- [x] AC-1 — The canonical user model persists a stable user independently from
      password, passkey, session, verification, and future OAuth identity records;
      credential secrets never appear in public contracts.
- [x] AC-2 — Signup validates and normalizes email/password input, atomically
      creates one pending user/primary email/password credential, safely replaces a
      repeated pending password/challenge, leaves verified accounts unchanged, and
      returns a non-enumerating response under duplicate and concurrent requests.
- [x] AC-3 — Verification and resend enforce the approved expiry, attempts,
      cooldown, hourly limit, single-active-code rule, keyed code storage, and
      single-use behavior; successful verification activates the user and issues one
      session exactly once.
- [x] AC-4 — Unverified, disabled, or missing users cannot password-login; valid
      active credentials can login; invalid and nonexistent credentials expose a
      consistent public error shape and materially similar verification path. A
      correct password for a pending user may return verification-required without
      tokens because the caller has proved knowledge of that credential.
- [x] AC-5 — Development/test verification deterministically accepts only `0000`;
      staging requires the explicit unsafe opt-in; production refuses mock or fixed
      codes, exposes email capability status, and rejects unavailable email-dependent
      operations before persistence without a production sender.
- [x] AC-6 — Argon2id password storage, the 15–128 Unicode policy, common-password
      rejection, current-password change, parameter rehash-on-login, and secret-safe
      error/log behavior are covered by deterministic tests.
- [x] AC-7 — Forgot/reset password is non-enumerating, rate-limited, expiring,
      attempt-limited, purpose-separated, and single-use; one atomic code-plus-new-
      password submission changes the credential, revokes all prior sessions, and
      returns the user to login.
- [x] AC-8 — Access JWTs use the pinned configured algorithm and required minimal
      claims, validate signature/issuer/audience/type/time, reject malformed or
      substituted tokens, and contain no email, password, passkey, or refresh data.
- [x] AC-9 — Access and refresh lifetime configuration defaults to 15 minutes/
      14 days in production and two days/14 days in development and staging, rejects
      unsafe or malformed values, and is independently testable through a clock port.
- [x] AC-10 — Browser login sets only the opaque refresh credential in an
      HTTP-only cookie and returns the access token in JSON; production cookie,
      allowed-origin, credentialed-CORS, and local-development policies are verified.
- [x] AC-11 — Refresh rotation is atomic under concurrency, does not extend the
      absolute 14-day expiry, invalidates the predecessor, detects replay, and
      revokes the complete family without storing or logging raw refresh values.
- [x] AC-12 — Current-session logout, all-session logout, password reset/change,
      user disablement, expiry, and replay revocation have explicit, verified effects
      on refresh and protected operations.
- [x] AC-13 — Authenticated users can register multiple passkeys through a
      one-time challenge; exact RP/origin, challenge, user verification, credential
      uniqueness, public key, transports, device/backup state, and counter data are
      validated and persisted.
- [x] AC-14 — Discoverable passkey login works without first submitting an email,
      consumes one challenge, updates credential metadata atomically, issues the same
      session shape as password login, and rejects replay, wrong origin/RP/user,
      revoked credentials, and invalid counters.
- [x] AC-15 — Authenticated users can list safe passkey metadata, rename a passkey,
      and revoke it without exposing public keys or affecting other credentials;
      enrollment/revocation require recent authentication and ownership is enforced.
- [x] AC-16 — Redis-backed throttles cover all specified public auth and ceremony
      endpoints, fail safely when unavailable, respect trusted-proxy configuration,
      and return non-enumerating retry behavior without permanent account lockout.
- [x] AC-17 — Shared Zod contracts define every auth request, success, and error
      boundary; Hono publishes the operations in OpenAPI and preserves cancellation
      across hashing, Redis, database, email, and WebAuthn work.
- [x] AC-18 — Backend authorization middleware validates bearer syntax/JWT
      claims, resolves active user/session state where required, passes a transport-
      independent principal to application code, and returns consistent 401/403
      errors without SDK types crossing domain/application boundaries.
- [x] AC-19 — Web signup, verification, password login, reload bootstrap,
      logout, forgot/reset, passkey enrollment/login/management, and failure/retry
      journeys are accessible, responsive, and verified in a real browser with no
      access token in browser persistence.
- [x] AC-20 — Concurrent web requests share refresh work, refresh failure reaches
      a stable signed-out state, and UI/API behavior does not loop, duplicate session
      rotation, or expose raw backend errors; cross-tab coordination is verified
      against simultaneous bootstrap/refresh.
- [x] AC-21 — Drizzle schema and committed generated SQL create all required
      constraints, foreign keys, unique indexes, expiry/query indexes, and migration
      ledger state; no auth business repository is implemented in `@languon/database`.
- [x] AC-22 — `db:generate`, `db:check`, `db:migrate`, and local `db:studio`
      commands are documented and work from the repository workflow; shared
      environments do not use `drizzle-kit push` and backend startup does not mutate
      schema implicitly.
- [x] AC-23 — Disposable PostgreSQL verification proves clean forward migration,
      repeated/concurrent migration safety, repository transactions, uniqueness and
      race invariants, seed-free production behavior, and the documented safe
      rollback position.
- [x] AC-24 — The schema permits later OAuth identities linked to an existing
      user without changing user IDs or moving password/passkey data; this feature
      neither implements OAuth nor auto-links accounts by matching provider email.
- [x] AC-25 — Security events and application logs contain useful coarse outcomes
      and correlation identifiers while automated redaction checks prove that
      credentials, tokens, codes, challenges, WebAuthn payloads, and unnecessary
      personal data are absent.
- [x] AC-26 — Existing health/OpenAPI behavior and canonical format, lint,
      typecheck, test, build, infrastructure, and development commands continue to
      work after authentication and migrations are added.

## Scope

### In scope

- Backend DDD modules for user identity and authentication, including contracts,
  use cases, repositories, transactions, HTTP routes, authorization middleware,
  security events, and environment validation.
- Email/password signup, primary email verification, login, forgot/reset,
  authenticated password change, current/all-session logout, and `/me`-style
  current-user/session behavior.
- HS256 access JWTs and opaque rotating refresh sessions with replay detection.
- Multiple passkeys per verified user, discoverable passkey login, and passkey
  list/rename/revoke management.
- Development/test mock email delivery and guarded private-staging opt-in.
- Redis-backed throttling and one-time challenge lifecycle.
- Web pages and client state for all included authentication journeys.
- Drizzle ORM, Drizzle Kit, canonical schema/migration conventions, initial auth
  migrations, documented commands, and disposable database verification.
- Shared Zod contracts, OpenAPI, relevant ADRs, documentation, automated tests,
  real browser evidence, database verification, and security review.

### Out of scope

- Production email-provider selection or integration; production email flows
  remain unavailable until a follow-up supplies the sender adapter.
- OAuth/OIDC login or account linking for Google, Apple, Discord, or any other
  provider; only the extension boundary is established.
- Passkey-only signup, magic-link login, SMS/phone identity, TOTP, recovery codes,
  or mandatory multi-factor authentication.
- Roles, permissions, admin authorization, tenant membership, parental/student
  relationships, or resource-specific authorization policies.
- Native mobile or admin authentication UI. Shared contracts must remain usable
  by those clients later.
- Email-address change, multiple verified emails, account merge, account deletion,
  data export, or legal retention workflows.
- CAPTCHA, third-party breached-password APIs, device fingerprinting, anomaly
  scoring, geo-risk, or dedicated SIEM integration.
- Acting as an OAuth authorization server, accepting external JWT issuers, or
  allowing other services to validate Languon access tokens.

## Constraints and risks

- Authentication strategy and adopting Drizzle/migrations are strategic choices;
  Accepted ADR-0001 and ADR-0002 govern their implementation.
- Keep JWT, Argon2, WebAuthn, Redis, Drizzle, Hono, and environment types in
  interface/infrastructure. Domain/application depend on explicit ports.
- `@languon/contracts` owns transport schemas only. `@languon/database` owns
  low-level Drizzle/PostgreSQL factories and migration primitives only; auth
  schemas and repositories remain backend module infrastructure.
- Four-digit codes have only 10,000 possibilities. Attempt limits, keyed storage,
  expiry, resend invalidation, and account/network throttling are mandatory.
- Fixed `0000` in any reachable staging environment is an account-takeover risk.
  It must be disabled by default, explicitly acknowledged, and impossible in
  production.
- `APP_ENV` is required rather than inferred from `NODE_ENV`. Production fails
  startup on missing, placeholder, short, or insecure JWT/HMAC, origin, RP,
  database, or Redis configuration; staging unsafe-code mode is an exact opt-in.
- HS256 requires at least 256 bits of secret entropy and strict algorithm/claim
  validation. A secret change invalidates outstanding access tokens; refresh
  sessions can issue new tokens after deployment.
- Refresh rotation must use transaction/locking semantics that are correct under
  simultaneous browser requests. UI-side single-flight refresh improves UX but
  cannot replace server-side replay protection.
- Immediate access-token revocation trades stateless verification for a database
  or cache state lookup on sensitive protected operations. The implementation
  plan must identify where fresh session state is required versus where the short
  token lifetime is sufficient.
- WebAuthn is scoped to exact RP IDs/origins and requires HTTPS outside localhost.
  Misconfiguration must fail closed at startup or ceremony execution.
- Authentication endpoints must not trust arbitrary forwarding headers. Deployment
  proxy configuration is an explicit environment boundary.
- Migrations and auth repositories require disposable PostgreSQL verification;
  Redis behavior requires namespace/TTL/atomicity verification.
- Tests use deterministic clocks, entropy, email capture, and cryptographic test
  keys. They must never use production secrets, remote email, paid services, or
  nondeterministic external calls.

## Approved product decisions

- Backend and web journeys are included; mobile-ready contracts are included,
  while native mobile/admin UI is deferred.
- Signup collects email/password only and persists a pending account before
  verification.
- Verification, password, passkey, token/session, abuse, future OAuth, and
  Drizzle defaults described above were accepted on 2026-08-12.
- Authentication does not introduce roles or authorization policy beyond active
  user/session identity.

## User-flow documentation

- Required: Yes; authentication exposes browser and API journeys.
- Guide: [User Authentication](../../../docs/user-flows/user-authentication.md).
- Maintenance: Update the guide whenever authentication contracts, routes,
  environment/startup behavior, browser flows, expected outcomes, edge cases,
  regression commands, or cleanup requirements change.

## Open decisions

- None. The user approved this feature plan and ADR-0001/0002 on 2026-08-13.

## References

- [Repository architecture](../../../docs/architecture.md)
- [Backend engineering constraints](../../../apps/backend/AGENTS.md)
- [Web engineering constraints](../../../apps/web/AGENTS.md)
- [Shared-package constraints](../../../packages/AGENTS.md)
- [JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html)
- [OAuth security: refresh token rotation](https://www.rfc-editor.org/rfc/rfc9700.html)
- [NIST authentication guidance](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
- [SimpleWebAuthn server guidance](https://simplewebauthn.dev/docs/packages/server)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
