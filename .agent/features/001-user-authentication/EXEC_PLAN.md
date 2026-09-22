# ExecPlan: User Authentication

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-12

## Goal

Implement and verify the first stable Languon user identity and authentication
boundary. A web user can sign up with email/password, verify email, recover or
change a password, maintain a revocable browser session, and enroll/use/manage
passkeys. Backend modules receive a validated principal; future OAuth providers
can attach identities without replacing users or existing credentials. Drizzle
schema and migration commands establish reproducible PostgreSQL lifecycle for
this and later features.

The user approved `FEATURE.md` and ADR-0001/0002 on 2026-08-13. Implementation
is active on `feature/user-authentication`.

## Specification

- In scope: backend and web behavior, shared contracts, stable user identity,
  verified email/password, recovery/change, access JWTs, opaque refresh sessions,
  passkeys, Redis limits/challenges, Drizzle schema/migrations, developer and
  operational documentation, disposable database/cache verification, E2E/browser
  evidence, and independent correctness/security review.
- Out of scope: production email provider, OAuth/OIDC implementations, passkey-
  only signup, SMS/TOTP/recovery codes/MFA policy, roles/admin authorization,
  native/admin UI, email change/account merge/deletion/export, CAPTCHA/risk
  scoring, and acting as an authorization server.
- Strategic decisions: accepted [ADR-0001](../../../docs/adr/0001-user-authentication-and-session-strategy.md)
  and [ADR-0002](../../../docs/adr/0002-drizzle-schema-and-migration-strategy.md)
  govern authentication/session and Drizzle/migration implementation.

## Existing architecture

- `apps/backend` is a Hono API with only health/OpenAPI behavior. It follows
  `interface/infrastructure -> application -> domain`; no auth or user module,
  middleware, transactions, repositories, or error envelope exists.
- `apps/web` is a minimal Next.js 16 application organized pages-first under
  `src/fsd`; it has TanStack Query and Zustand but no API client, auth provider,
  forms, component-test environment, or E2E framework.
- `@languon/contracts` contains Zod transport schemas and must remain the shared
  request/response source of truth.
- `@languon/database` exposes raw `postgres` and lazy Redis clients. It may own
  low-level Drizzle/PostgreSQL factories and migration invocation, but backend
  module infrastructure owns business schema and repositories.
- PostgreSQL 17 and Redis 8 run through Compose with persistent development
  volumes. Tests need isolated Compose project names/ports/databases and Redis
  namespaces; they must never clear shared developer state.
- Environment parsing currently defaults `NODE_ENV=development` and cannot
  represent staging. Authentication needs a required, fail-closed `APP_ENV`
  deployment classification and separate secrets/configuration.
- Backend Vitest covers two in-process Hono health/OpenAPI assertions. Web and
  database workspaces pass with no tests. There is no Playwright, DOM testing,
  migration, or disposable-infrastructure harness yet.
- ADR-0001 and ADR-0002 are accepted and govern authentication/session and
  ORM/migration implementation.

## Planned architecture and ownership

```text
packages/contracts/src/auth/               Zod HTTP contracts and derived types
packages/database/src/postgres/             low-level postgres/Drizzle factories
packages/database/src/redis/                bounded Redis factory/low-level types
packages/database/src/migrations/           programmatic Drizzle migrator helper

apps/backend/drizzle.config.ts              canonical Drizzle Kit configuration
apps/backend/drizzle/                        committed generated SQL + metadata
apps/backend/src/infrastructure/database/   schema aggregate, DB composition

apps/backend/src/modules/users/
  domain/                                   User, EmailAddress, status, repo port
  application/                              current-user/status use cases
  infrastructure/persistence/               Drizzle user/email schema + repository

apps/backend/src/modules/authentication/
  domain/                                   credential/session/challenge policies
  application/                              auth use cases and infrastructure ports
  infrastructure/crypto/                    Argon2id, JOSE, entropy/digest adapters
  infrastructure/email/                     dev/test sender; production-disabled adapter
  infrastructure/passkeys/                  SimpleWebAuthn adapter
  infrastructure/persistence/               Drizzle auth schema/repositories/UoW
  infrastructure/rate-limit/                Redis limiter/challenge storage
  interface/http/                           Hono routes, cookie/CORS/origin mapping

apps/backend/src/interface/http/auth/       bearer principal middleware/composition

apps/web/src/fsd/entities/session/           memory-only access/session bootstrap
apps/web/src/fsd/features/auth/              forms, API actions, refresh coordination
apps/web/src/fsd/pages/*                     login/signup/verify/reset/security pages
apps/web/tests/e2e/                          critical Playwright journeys
```

`users` owns the stable identity and primary email; `authentication` owns proof
and session mechanisms. Authentication application code depends on a narrow user
lookup/status port, not user persistence rows. Other product modules consume a
validated principal/user ID and define their own ownership policies; `sub` is
identity, never blanket authorization.

Initial persistence is expected to include:

- `users`: UUID ID, pending/active/disabled status, timestamps and version.
- `user_emails`: user FK, display/canonical email, primary flag, verification
  timestamp, global canonical uniqueness.
- `password_credentials`: one per user, versioned Argon2id hash/parameters and
  credential timestamps.
- `auth_verification_challenges`: public flow ID, user/email binding, purpose,
  keyed code digest, expiry, attempts, send state, consumed/invalidated timestamps.
- `auth_sessions`: user/session/family IDs, opaque refresh digest, absolute
  expiry, rotation predecessor/successor, revocation/replay metadata and minimal
  device/security metadata.
- `auth_passkeys`: global credential ID, user FK, public key, user handle,
  counter, transports, device/backup state, display name, usage/revocation data.
- `auth_security_events`: coarse structured outcome identifiers with bounded,
  non-secret metadata and an explicit retention policy.

Redis owns only disposable throttling windows and WebAuthn ceremony challenges.
PostgreSQL remains authoritative for identities, credentials, sessions, replay,
and durable state.

## Planned HTTP surface

- `POST /auth/sign-up`
- `POST /auth/email-verification/resend`
- `POST /auth/email-verification/verify`
- `POST /auth/login/password`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/password/change`
- `GET /auth/capabilities`
- `POST /auth/passkeys/registration/options`
- `POST /auth/passkeys/registration/verify`
- `POST /auth/passkeys/authentication/options`
- `POST /auth/passkeys/authentication/verify`
- `GET /auth/passkeys`
- `PATCH /auth/passkeys/:passkeyId`
- `DELETE /auth/passkeys/:passkeyId`
- `GET /users/me`

Every route uses contracts from `@languon/contracts`, has explicit OpenAPI
success/error/security metadata, bounded bodies/strings/collections, cancellation,
`Cache-Control: no-store`, and stable non-secret errors. Cookie-authenticated
routes require an exact allowed Origin; bearer-protected routes validate access
tokens and resolve fresh state when performing credential/session changes.

## Acceptance criteria

- [x] AC-1 — Stable user/credential/session data separation.
- [x] AC-2 — Atomic, normalized, non-enumerating pending signup.
- [x] AC-3 — Correct email verification/resend state machine and activation.
- [x] AC-4 — Correct password login and unverified/disabled/unknown behavior.
- [x] AC-5 — Fail-closed environment/mock-email/fixed-code matrix.
- [x] AC-6 — Argon2id/password policy/change/rehash/log safety.
- [x] AC-7 — Non-enumerating password reset and session revocation.
- [x] AC-8 — Minimal, strictly validated access JWT.
- [x] AC-9 — Validated environment-specific access/refresh lifetimes.
- [x] AC-10 — Secure browser token/cookie/origin/CORS transport.
- [x] AC-11 — Atomic absolute-expiry refresh rotation and family replay response.
- [x] AC-12 — Explicit logout/revocation/disable/password effects.
- [x] AC-13 — Secure multi-passkey registration.
- [x] AC-14 — Secure discoverable passkey authentication.
- [x] AC-15 — Safe passkey list/rename/revoke management.
- [x] AC-16 — Atomic Redis abuse limits with bounded fail-closed behavior.
- [x] AC-17 — Shared contracts, OpenAPI, cancellation, and bounded work.
- [x] AC-18 — Transport-independent principal and authorization boundary.
- [x] AC-19 — Complete accessible real-browser authentication journeys.
- [x] AC-20 — Stable memory-only web bootstrap/refresh coordination.
- [x] AC-21 — Drizzle schema constraints/indexes and package ownership.
- [x] AC-22 — Documented canonical migration commands; no shared `push`/implicit startup migration.
- [x] AC-23 — Disposable PostgreSQL migration/repository/concurrency evidence.
- [x] AC-24 — Future OAuth identity extension without automatic email linking.
- [x] AC-25 — Security event usefulness, redaction, and privacy evidence.
- [x] AC-26 — Existing and canonical repository workflows remain healthy.

The full observable wording is authoritative in `FEATURE.md`; this list keeps
milestone mapping concise.

## Test strategy

- Unit: Required. Test email normalization, password policy, user/credential/
  challenge/session state machines, expiry boundaries, error mapping, environment
  discriminators, JWT claim construction/verification with real crypto and fake
  time, code/refresh digests, rate-limit key derivation, WebAuthn option policy,
  and web refresh coordination. Use deterministic entropy/clock ports.
- Integration: Required. Use disposable PostgreSQL for Drizzle repositories,
  transactions, uniqueness, rollback, concurrent signup, challenge consumption,
  refresh rotation/replay, password reset, and passkey counter changes. Use a
  disposable Redis instance for atomic limits, TTL, namespacing, challenge
  single-use, bounded outage/reconnect behavior, and spoofed proxy inputs.
- Contract: Required. Exercise Hono in process with real contracts and composed
  application adapters for signup/login/verify/reset/refresh/logout/passkeys,
  cookies, CORS/origin/CSRF, bearer middleware, error envelopes, cancellation,
  and generated OpenAPI. Keep health public and unchanged.
- Component: Required. Add Vitest DOM, Testing Library, and user-event coverage
  for form labels/autocomplete, password paste/show behavior, validation,
  loading/double-submit protection, error focus/live announcements, retry, and
  stable auth bootstrap states.
- E2E: Required only for three critical cross-boundary journeys: (1) signup ->
  `0000` verification -> authenticated page -> reload refresh -> logout; (2)
  forgot/reset -> old credential/session rejected -> new login; (3) enroll
  passkey -> logout -> discoverable passkey login using a Chromium virtual
  authenticator, plus a representative cancellation/failure.
- Browser: Required. Verify keyboard/focus/labels/autocomplete, narrow and wide
  layouts, passkey supported/unsupported behavior, refresh/revisit/back behavior,
  no token in URL/history/localStorage/sessionStorage/console, and no unexpected
  console/network failures. Use only deterministic synthetic data.
- Database migration: Required via `$db-verification`. On unique disposable
  PostgreSQL, run clean forward, inspect tables/columns/checks/FKs/indexes/
  migration ledger, rerun idempotently, test concurrent migration invocation,
  exercise representative repository invariants, and test a down direction only
  when a safe explicit inverse exists. Reapply forward after any safe down test.
- Redis: Required. Use a unique disposable instance or prefix and never `FLUSHDB`
  on the default development service. Verify atomicity and TTL under concurrency.
- Security: Required. Independent threat review covers auth, personal data, SQL,
  secrets, HTML/forms, cookies/CORS/origin, email, model-independent passkeys,
  rate limiting, and logging. Critical/high findings must be fixed; relevant
  medium findings are fixed or explicitly justified and retested.
- Live external services: Not required and prohibited in the default suite.
  Production email is out of scope; no external email, password breach, OAuth,
  or other paid/nondeterministic API is called.

### Regression matrix highlights

| Risk                             | Primary proof                                                     |
| -------------------------------- | ----------------------------------------------------------------- |
| Duplicate/case-variant signup    | PostgreSQL uniqueness + concurrent integration                    |
| Partial signup/challenge/session | Transaction rollback fault injection                              |
| Enumeration                      | HTTP response-path assertions + dummy-hash collaborator assertion |
| Code/reset replay                | Concurrent single-consumer PostgreSQL integration                 |
| Refresh double use               | `SELECT ... FOR UPDATE`-equivalent concurrency integration        |
| Refresh family theft             | predecessor replay revokes family + security event assertion      |
| JWT substitution                 | real JOSE wrong alg/key/iss/aud/type/time tests                   |
| Cookie/CSRF/CORS                 | exact HTTP header/cookie contract + hostile-origin tests          |
| Redis bypass/outage              | real Redis atomic threshold/TTL/fail-closed tests                 |
| Passkey cross-account/replay     | real verifier integration + virtual authenticator E2E             |
| Secret/PII leakage               | captured logs, DB rows, Redis keys, browser storage/network audit |
| Migration drift                  | `drizzle-kit check`, clean/repeat/concurrent migration evidence   |

## Milestones

- [x] M1 — Specification, architecture, and threat/test design
    - Objective: convert approved defaults into complete observable behavior,
      identify boundaries and strategic ADRs, and make verification proportional.
    - Components: `FEATURE.md`, `EXEC_PLAN.md`, ADR-0001, ADR-0002, repository
      exploration, official security/protocol/migration references.
    - Acceptance criteria: planning support for AC-1–AC-26.
    - Required tests: read-only source/architecture review; independent product,
      architecture, security, and testing audits.
    - Evidence: planning artifacts and audit conclusions dated 2026-08-12.
- [x] M2 — Database foundation and user identity
    - Objective: introduce Drizzle factories/config/commands/migration harness,
      user domain/application boundary, module-owned schema, and initial migrations.
    - Components: `@languon/database`, backend DB composition, `users` module,
      Drizzle config/migrations, disposable PostgreSQL harness, docs/env.
    - Acceptance criteria: AC-1, AC-21–AC-24, database portion of AC-26.
    - Required tests: schema/value-object unit tests, clean/repeat/concurrent
      migrations, constraint/index inspection, repository commit/rollback/races.
    - Evidence: unit domain suite plus ten real-PostgreSQL migration/repository
      checks passed on the explicitly confirmed disposable target. Source/built
      migration invocation, Drizzle check, typecheck, lint, and build passed.
- [x] M3 — Password, email verification, and recovery domain/application
    - Objective: implement deterministic state machines and ports before transport.
    - Components: authentication domain/application, password/code/clock/entropy/
      email/rate-limit ports, Argon2id and development-email adapters.
    - Acceptance criteria: AC-2–AC-7, configuration portions of AC-9/AC-16/AC-25.
    - Required tests: test-first unit/state-machine cases, real Argon2id adapter,
      environment matrix, fake email, redaction, expiry/attempt/cooldown boundaries.
    - Evidence: password/code policies, Argon2id, fixed/disabled email adapters,
      transactional challenge flows, rolling Redis limits, recovery/change, and
      redacted events are implemented. Backend unit and real-infrastructure suites
      cover their success, failure, concurrency, and environment boundaries.
- [x] M4 — JWT, refresh sessions, authorization boundary, and HTTP contracts
    - Objective: implement session issuance/rotation/revocation and expose the
      password/email flows through validated Hono/OpenAPI boundaries.
    - Components: contracts, JOSE/session persistence, Redis limiter, middleware,
      Hono routes, cookie/origin/CORS policies, application composition.
    - Acceptance criteria: AC-2–AC-12, AC-16–AC-18, AC-25–AC-26.
    - Required tests: real-crypto unit, PostgreSQL/Redis concurrency integration,
      Hono contract/OpenAPI, cookie/hostile-origin/cancellation/error/log tests.
    - Evidence: JOSE access tokens, opaque rotating refresh families, fresh
      principal/session checks, secure cookies/origin/CORS, bounded bodies, trusted
      proxy CIDRs, shared error envelopes, OpenAPI bearer metadata, and runtime
      composition are implemented and covered by HTTP/unit/real-PostgreSQL tests.
- [x] M5 — Passkey enrollment, authentication, and management
    - Objective: add WebAuthn without weakening identity, recovery, origin, or
      challenge boundaries.
    - Components: contracts/use cases, SimpleWebAuthn adapter, passkey repository,
      Redis challenge store, HTTP routes.
    - Acceptance criteria: AC-13–AC-18, relevant AC-25–AC-26.
    - Required tests: option-policy unit, PostgreSQL/Redis verifier integration,
      origin/RP/user/UV/signature/counter/duplicate/replay/race negatives.
    - Evidence: SimpleWebAuthn registration/authentication adapters, one-time Redis
      challenges, passkey persistence/management, recent-auth checks, counter CAS,
      completion rate limits, and audit events are implemented. Unit, disposable
      PostgreSQL/Redis, composed HTTP, and virtual-authenticator E2E checks pass.
- [x] M6 — Web authentication experience
    - Objective: implement accessible forms, memory-only auth state, cross-request/
      tab refresh coordination, routing, passkey UX, and security settings.
    - Components: FSD session entity/auth features/pages, API client/provider,
      Vitest DOM/component setup, Playwright E2E setup.
    - Acceptance criteria: AC-10, AC-13–AC-15, AC-17, AC-19–AC-20, AC-25–AC-26.
    - Required tests: component tests, three critical E2E journeys, browser checks
      at narrow/wide viewports, storage/console/network audit.
    - Evidence: accessible auth/security pages, memory-only access state, cookie
      bootstrap, safe returns, cross-tab refresh coordination, password and passkey
      UX, component tests, and three Playwright journeys are complete. Manual wide
      and 375px browser checks also found no horizontal overflow or token storage.
- [x] M7 — Full validation, review, remediation, and integration
    - Objective: prove the complete behavior, resolve material independent
      findings, finalize artifacts, and squash-integrate the feature to `main`.
    - Components: whole feature diff, docs/ADRs, `EVIDENCE.md`, `REVIEW.md`.
    - Acceptance criteria: AC-1–AC-26 and repository Definition of Done.
    - Required tests: affected targeted suites, disposable PostgreSQL/Redis,
      workspace/repository format/lint/typecheck/test/build/check, real browser,
      independent reviewer and security-reviewer reruns after remediation.
    - Evidence: repository and disposable-infrastructure checks, three browser
      journeys, manual responsive verification, and independent correctness and
      security re-reviews passed. All critical, high, and medium findings were
      remediated; the completed feature was squash-integrated into `main`.

## Progress

- 2026-08-12 — Created `feature/user-authentication` from `main` after committing
  paused Mastra planning to its own branch.
- 2026-08-12 — User approved the recommended product/security defaults for
  scope, verification, password, passkey, token/session, future OAuth, and Drizzle.
- 2026-08-12 — Inspected repository architecture, tests, packages, environment,
  Compose services, and empty ADR index; no existing auth/migration behavior or
  conflicting accepted ADR was found.
- 2026-08-12 — Drafted complete feature specification, this plan, and Proposed
  ADR-0001/0002. Independent product, architecture, security, and test audits
  found no remaining blocker after their recommendations were incorporated.
- 2026-08-12 — Planning format/diff checks and the 10-task repository test
  baseline passed; implementation remained gated on user validation at that time.
- 2026-08-13 — User approved the feature plan and both Proposed ADRs. Marked
  ADR-0001/0002 Accepted and began M2 database/user-identity implementation.
- 2026-08-13 — Completed M2 with module-owned users/email schema, generic Drizzle
  factories, authoritative generated migration history, explicit migration
  commands, advisory-lock/checksum/prefix verification, transaction-only identity
  writes, and disposable PostgreSQL tests. Two security review rounds found and
  drove remediation of history-drift, test-target, transaction-authority, and
  canonicalization risks.
- 2026-08-13 — Completed M3/M4 with password, verification, recovery, JWT,
  rotating refresh families, authenticated principals, bounded Hono/OpenAPI
  routes, explicit origin/cookie policy, Redis limits, and production-disabled
  email capability behavior.
- 2026-08-13 — Completed M5 with SimpleWebAuthn registration and discoverable
  authentication, one-time Redis ceremonies, PostgreSQL credential ownership and
  counter updates, recent-authenticated management, and coarse security events.
- 2026-08-13 — Completed M6 with responsive accessible web flows, memory-only
  access tokens, coordinated refresh/bootstrap, passkey UX, 35 component/API
  tests, and three passing real-browser Playwright journeys.
- 2026-08-13 — Independent correctness and security reviews reported two high
  and twelve medium findings across their initial and focused passes.
  Remediation added enumeration-safe rolling issuance, full-family logout
  locking, trusted proxy CIDRs, a contract-compatible 384 KiB request-body cap,
  a transactionally serialized 50-active-passkey cap, stable conflict/cookie
  errors, OpenAPI bearer metadata, passkey completion limits, richer redacted
  events, E2E coverage, Drizzle Studio credentials, and framing denial. Final
  correctness and security re-reviews found no remaining critical, high, or
  medium issue.

## Decisions

- D-001 — Separate stable user from credentials
    - Context: later product ownership and OAuth providers need one durable subject.
    - Choice and rationale: `users` owns identity/status; primary email, password,
      passkeys, sessions, and future OAuth identities are separate records.
    - Alternatives rejected: password fields on user; provider-specific users;
      automatic email-based OAuth merging.
    - ADR impact: Accepted ADR-0001.
- D-002 — JWT access plus opaque refresh sessions
    - Context: clients need token API auth while sessions need rotation/revocation.
    - Choice and rationale: minimal HS256 access JWT; 256-bit opaque refresh secret,
      hash-only PostgreSQL storage, atomic rotation, strict family replay revocation,
      absolute 14-day expiry, no grace interval. Web uses in-tab single-flight,
      Web Locks where available, BroadcastChannel propagation, and a tested
      fallback to coordinate refresh across tabs while the server remains atomic.
    - Alternatives rejected: JWT refresh, refresh plaintext, sliding expiry,
      silent replay grace, browser-readable refresh tokens.
    - ADR impact: Accepted ADR-0001.
- D-003 — Browser token transport and immediate state
    - Context: avoid XSS-readable long-lived credentials while restoring reloads.
    - Choice and rationale: access token JSON/in memory; production host-only
      `__Host-` Secure/HttpOnly/SameSite=Lax/Path=/ refresh cookie; exact Origin and
      credentialed CORS; fresh user/session lookup on auth/security mutations.
      Production web and API must remain same-site for this transport; cross-site
      deployment requires revisiting the cookie/CSRF decision.
    - Alternatives rejected: local/session storage, tokens in URLs, wildcard CORS,
      trusting JWT roles/resource ownership.
    - ADR impact: Accepted ADR-0001.
- D-004 — Required deployment classification and verification mode
    - Context: default `NODE_ENV=development` could accidentally enable `0000`.
    - Choice and rationale: required `APP_ENV`; dev/test fixed `0000`; staging
      disabled unless an exact insecure opt-in; production refuses mock/fixed mode.
      JWT and code-HMAC secrets are separate, high-entropy, environment-specific.
    - Alternatives rejected: request-selected mode, `NODE_ENV` inference, code
      response/logging, production mock fallback.
    - ADR impact: Feature-local security configuration under Accepted ADR-0001.
- D-005 — Email adapter boundary and production availability
    - Context: email delivery is mocked now but signup/reset must not claim delivery.
    - Choice and rationale: define sender port and deterministic dev/test adapter;
      production email-dependent operations return stable unavailable behavior until
      a separately configured real adapter exists. Backend health can remain up.
    - Alternatives rejected: console/log delivery, silent no-op, choosing a provider
      without product/operational scope.
    - ADR impact: Not ADR-worthy; provider integration is a follow-up.
- D-006 — Password and code protection
    - Context: passwords face offline attack; four-digit codes are brute-forceable.
    - Choice and rationale: Argon2id, 15–128 Unicode/no composition, deterministic
      common-password blocklist; keyed purpose/user/flow-bound code digest, strict
      attempts/expiry/resend limits. Unknown login runs dummy Argon2 verification.
    - Alternatives rejected: Passport.js, reversible encryption, SHA/bcrypt for a
      new system, unkeyed code hash, permanent lockout.
    - ADR impact: Feature-local implementation of Accepted ADR-0001.
- D-007 — Passkey posture
    - Context: secure passwordless login must avoid enumeration/cross-account attach.
    - Choice and rationale: verified recently authenticated enrollment; multiple
      named credentials; discoverable login; exact configured RP/origins; required
      user verification; five-minute one-time Redis challenge; zero counters
      tolerated per authenticator behavior, nonzero rollback emits a security
      failure; revoke requires recent auth. Every initial account retains its
      password recovery method, so revoking the last passkey does not strand it.
    - Alternatives rejected: passkey-only signup, email-first allow list, request-
      derived RP/origin, lockout solely on a zero counter.
    - ADR impact: Accepted ADR-0001.
- D-008 — Redis is disposable and authentication issuance fails closed
    - Context: limits/challenges cannot become bypasses or hang indefinitely.
    - Choice and rationale: HMAC-derived keys, bounded retries/timeouts, atomic TTL
      operations, explicit trusted proxies; public authentication/refresh/ceremony
      issuance fails closed when required Redis control is unavailable. Existing
      bearer authorization remains governed by its own session freshness policy.
    - Alternatives rejected: `maxRetriesPerRequest: null`, raw email/IP keys,
      Redis as durable session truth, unconditional fail-open.
    - ADR impact: Feature-local.
- D-009 — Drizzle and migration lifecycle
    - Context: this is the first business schema and all later modules need parity.
    - Choice and rationale: module-owned Drizzle schemas, backend aggregate/config,
      declarative current TypeScript mapping, authoritative ordered SQL transition
      history, explicit generate/check/migrate/studio commands, no shared push or
      implicit HTTP startup migration, singleton deploy migration plus database
      advisory lock, and forward corrections unless safe explicit down exists.
      Programmatic migration requires a trusted explicit disposable capability.
    - Alternatives rejected: custom raw-SQL ledger, business schema in database
      package, automatic startup mutation, shared `push`.
    - ADR impact: Accepted ADR-0002.
- D-010 — Web-first, mobile-compatible boundary
    - Context: web needs a complete journey now; native refresh storage differs.
    - Choice and rationale: implement web cookie flow and shared contracts now;
      defer mobile/admin UI and native refresh-token transport.
    - Alternatives rejected: browser-readable refresh token for client parity;
      unverified placeholder mobile implementation.
    - ADR impact: Feature-local scope.

## Discoveries

- Current `NODE_ENV` cannot safely represent staging and defaults to development;
  auth cannot derive unsafe behavior from it.
- Current Redis client has unbounded request retries; auth needs a bounded client
  profile or per-operation timeout rather than reusing that behavior unchanged.
- Web has no DOM/component/E2E test setup. Those dependencies and scripts are
  part of the web milestone, not optional evidence.
- Compose development volumes are persistent. Auth integration tests need unique
  disposable project/port/database/Redis identities and explicit scoped teardown.
- Four-digit code digest must be keyed; a normal fast hash is offline-brute-
  forceable from a database dump.
- Strict refresh replay revocation conflicts with uncontrolled parallel tabs.
  In-tab single-flight plus cross-tab Web Locks/BroadcastChannel coordination is
  required, but server-side atomic rotation remains the authority and concurrency
  tests must prove only one successor.
- SameSite=Lax and a host-only `__Host-` refresh cookie require a same-site
  production web/API topology. Cross-site deployment is not compatible with this
  ADR without revisiting token transport and CSRF controls.
- WebAuthn public keys are not confidential but credential IDs, user handles,
  counters, challenges, and device metadata remain security-sensitive and must
  not be exposed wholesale.
- The Mastra harness blocker can be resolved after this feature because canonical
  user migrations/repositories will then exist; its development seeder must use
  these product-owned tables rather than introduce a harness-only user schema.

## Validation

| Check                  | Status                 | Evidence                                                                       |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Plan/product audit     | Completed for planning | No unresolved product blocker; state/edge recommendations incorporated.        |
| Architecture/ADR audit | Completed for planning | Two-ADR split approved; all five boundary clarifications incorporated.         |
| Security threat audit  | Completed for planning | Findings incorporated into ACs, decisions, and test strategy.                  |
| Test-strategy audit    | Completed for planning | Unit/integration/contract/component/E2E/browser/DB/Redis matrix incorporated.  |
| Unit                   | Passed                 | Backend 153, contracts 20, database 3, web 35 in default suites.               |
| Integration            | Passed                 | Backend 187/187 with disposable PostgreSQL and Redis enabled.                  |
| Contract               | Passed                 | Composed HTTP journeys, headers, errors, OpenAPI, cookies, and CORS covered.   |
| Component              | Passed                 | Web 5 files/35 tests without React synchronization warnings.                   |
| E2E                    | Passed                 | Three Chromium journeys, including virtual WebAuthn failure/success.           |
| Browser/device         | Passed for web scope   | Wide and 375px manual checks plus Chromium E2E; hardware passkey out of scope. |
| Typecheck              | Passed                 | Repository 10/10 Turborepo tasks.                                              |
| Lint                   | Passed                 | Repository ESLint.                                                             |
| Build                  | Passed                 | Repository 7/7 Turborepo tasks.                                                |
| Database migration     | Passed                 | Clean/repeat/concurrent/checksum/prefix/schema/repository verification.        |
| Redis                  | Passed                 | Real Redis rolling limits, TTL, aliasing, challenge single-use, outage.        |
| Independent review     | Passed                 | Final re-review found no open critical, high, or medium finding.               |
| Security review        | Passed                 | Final re-review found no open critical, high, or medium vulnerability.         |

## Remaining work

- None for this feature. Deferred product scope and operational dependencies are
  recorded in `FEATURE.md`, `EVIDENCE.md`, and `REVIEW.md`.
