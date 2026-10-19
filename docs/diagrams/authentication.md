---
type: diagram
title: Authentication and session refresh
summary: Password/passkey login creates a durable session and browser refresh rotates an opaque credential.
source_paths:
    - apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts
    - apps/backend/src/modules/authentication/application/session-issuer.ts
    - apps/backend/src/modules/authentication/application/authentication-service.ts
    - apps/backend/src/modules/authentication/interface/http/auth-http-policy.ts
    - apps/web/src/fsd/entities/session/model/session-store.ts
    - packages/browser-auth/src/refresh-coordinator.ts
    - docs/adr/0001-user-authentication-and-session-strategy.md
source_fingerprint: sha256:f4b71748222606e68f29eda716500cbb8972c2768168eca7397e5c1986305ede
reviewed: 2026-10-19
---

# Authentication and session refresh

Password/passkey login creates a durable session and browser refresh rotates an opaque credential.

```mermaid
sequenceDiagram
    actor User
    participant Browser as Web browser + memory session store
    participant Coordinate as Browser refresh coordinator
    participant API as Hono auth policy/controller
    participant Auth as Authentication service
    participant PG as PostgreSQL
    participant Redis as Redis
    User->>Browser: Password login or WebAuthn assertion
    Browser->>API: Credentials / passkey response
    API->>Auth: Validated login request
    Auth->>Redis: Rate limit / one-time WebAuthn challenge
    Auth->>PG: Verify active user and credentials and create refresh session
    Auth-->>API: Short-lived JWT + opaque refresh credential
    API-->>Browser: JSON access token + HTTP-only refresh cookie
    Note over Browser: Access JWT lives only in memory
    Browser->>Coordinate: Reload or expiring access token
    Coordinate->>API: Coordinated cookie-authenticated refresh
    API->>API: Exact Origin + cookie/CORS policy
    API->>Auth: Refresh opaque credential
    Auth->>PG: Lock and atomically rotate stored credential hash
    alt Valid rotation
        API-->>Browser: New JWT + rotated cookie
    else Reuse / revoked / expired
        Auth->>PG: Revoke family when replay detected
        API-->>Browser: Authentication failure
    end
    Browser->>API: Product request with Bearer JWT
    API->>Auth: Verify JWT and live session at product boundary
    Auth->>PG: Current session/user authority
    API-->>Browser: Authorized result or rejection
```

Signup creates a pending identity; email ownership must be verified before normal
password login or passkey enrollment. Composition selects a development or disabled
email adapter, not a configured production mail service. JWT signing, Argon2id,
WebAuthn, persistence and Redis remain infrastructure adapters.

The shared coordinator prevents ordinary concurrent browser refresh races; server
rotation is still atomic and replay-revoking. Admin uses its dedicated cookie and
owner membership checks, with a separate UI auth provider; see ADR-0010 through the
[module view](module-boundaries.md). This sequence shows the common web protocol,
not the future native secure-storage transport.

## Sources

- [apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts](../../apps/backend/src/modules/authentication/infrastructure/authentication-composition.ts)
- [apps/backend/src/modules/authentication/application/session-issuer.ts](../../apps/backend/src/modules/authentication/application/session-issuer.ts)
- [apps/backend/src/modules/authentication/application/authentication-service.ts](../../apps/backend/src/modules/authentication/application/authentication-service.ts)
- [apps/backend/src/modules/authentication/interface/http/auth-http-policy.ts](../../apps/backend/src/modules/authentication/interface/http/auth-http-policy.ts)
- [apps/web/src/fsd/entities/session/model/session-store.ts](../../apps/web/src/fsd/entities/session/model/session-store.ts)
- [packages/browser-auth/src/refresh-coordinator.ts](../../packages/browser-auth/src/refresh-coordinator.ts)
- [docs/adr/0001-user-authentication-and-session-strategy.md](../../docs/adr/0001-user-authentication-and-session-strategy.md)
