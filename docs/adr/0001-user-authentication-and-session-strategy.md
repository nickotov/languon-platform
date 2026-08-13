# ADR-0001: User authentication and session strategy

Status: Accepted
Date: 2026-08-12
Supersedes: None

## Context

Languon needs a stable user identity before product data can enforce ownership.
The first authentication methods are verified email/password and passkeys. OAuth
providers may be added later. Web is the first complete client, while backend
contracts must remain suitable for native clients.

The decision crosses feature and component boundaries: it defines how future
modules identify users, how credentials attach to identities, which tokens APIs
accept, how sessions are revoked, and how later authentication providers link to
an existing account. Authentication strategy is also explicitly strategic under
the repository ADR policy.

## Decision

- A stable user is independent of authentication methods. Primary email,
  password credential, passkey credentials, refresh sessions, and future OAuth
  identities use separate persistence records linked to the user ID.
- Email/password signup creates a pending user. Verified email ownership is
  required before normal login or passkey enrollment.
- Passwords use Argon2id through an application port. Passkeys use WebAuthn with
  exact configured relying-party IDs and allowed origins.
- The backend issues short-lived HS256 access JWTs containing only required
  issuer, audience, subject, session, token, issued-at, and expiry claims. The
  signing implementation is behind an application port, the verification
  algorithm is pinned, and only the backend verifies these tokens initially.
- Refresh credentials are opaque random values rather than JWTs. Only their
  hashes and session-family metadata are stored. Each refresh rotates the
  credential atomically; reuse revokes the family. Refresh expiry is absolute.
- Browser refresh credentials use a host-only, HTTP-only, secure production
  cookie. Access tokens are returned in JSON and held in web memory rather than
  browser persistence. Cookie-authenticated routes enforce exact origins and
  credentialed CORS. The `__Host-`, `SameSite=Lax`, `Path=/` cookie strategy
  requires the production web and API to remain same-site; a future cross-site
  topology requires a new transport and CSRF decision rather than weakening
  these defaults silently.
- Email delivery, password hashing, access-token signing, entropy/clock,
  WebAuthn, rate limiting, and persistence are infrastructure adapters behind
  domain/application ports. Hono and SDK types remain outside domain/application.
- Provider-reported email equality never silently merges a future OAuth identity
  into an existing account. Linking requires an authenticated or explicit
  independently verified account-linking flow.
- Passport.js or an all-in-one authentication framework is not the composition
  root. Application use cases own state transitions and invariants; focused
  cryptographic/protocol libraries implement infrastructure concerns.

## Alternatives considered

### Server-side cookie session for all requests

This simplifies browser authentication and revocation, but does not meet the
requested JWT API boundary and is less direct for future native clients. The
chosen design keeps durable refresh sessions while using short-lived JWT access.

### JWT access and JWT refresh tokens

This reduces token lookup structure but makes rotation, replay detection,
family revocation, and secret exposure harder to reason about. Opaque random
refresh credentials allow hashed storage and explicit session lifecycle.

### Stateless access verification everywhere

This avoids a state lookup, but a disabled user or revoked session would retain
access until JWT expiry. The chosen design permits stateless verification for
ordinary low-risk reads while requiring fresh state for security-sensitive
operations; each use case documents its requirement.

### Passport.js or a framework-owned user/session model

Passport provides transport middleware and strategies but not Languon's full
credential, verification, refresh rotation, and DDD transaction lifecycle. A
framework-owned model would also make later provider changes cross application
boundaries. Focused libraries behind ports keep the business lifecycle explicit.

### Automatic OAuth linking by matching email

This is convenient but unsafe when provider email assurance or account control
differs. Explicit linking avoids account takeover and ambiguous identity merges.

## Consequences

### Positive

- Product modules receive one stable, transport-independent principal.
- Password, passkey, and future OAuth identities can evolve independently.
- Refresh sessions are revocable, inspectable, and protected by replay detection.
- Browser code never reads or persists the long-lived refresh credential.
- Provider and framework SDKs remain replaceable infrastructure details.

### Negative

- Login and refresh require PostgreSQL, and throttling/challenges require Redis.
- Correct rotation requires transaction locking and explicit concurrency tests.
- Web bootstrap needs a refresh request after reload because access JWTs are
  memory-only.
- Strict refresh replay response requires in-tab and cross-tab refresh
  coordination while server rotation remains atomic.
- HS256 key rotation initially invalidates outstanding access tokens and requires
  high-entropy shared-secret operations.

### Risks / limitations

- Production email signup/recovery remains unavailable until a real email-sender
  adapter is selected and configured.
- JWT revocation is not instantaneous on operations that intentionally rely only
  on short expiry; sensitive paths must request fresh session/user state.
- Fixed verification code behavior must be impossible in production and guarded
  in private staging.
- Native-client refresh transport is a follow-up even though contracts and
  session semantics must not preclude secure mobile storage.

## Related

- [Architecture](../architecture.md)
- [User Authentication feature](../../.agent/features/user-authentication/FEATURE.md)
- [User Authentication ExecPlan](../../.agent/features/user-authentication/EXEC_PLAN.md)
- [JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html)
- [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
