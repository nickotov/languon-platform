# Web Development Port 3333

Status: Complete
Owner: Engineering
Created: 2026-08-14

## Problem

The user-facing Next.js application is hard-coded to local port `3000`, which
collides with another development application on the same workstation. The web
script, authentication origin defaults, Docker mapping, E2E fallback, and
developer documentation must agree on one replacement port or normal startup
will fail or authentication mutations will be rejected by exact-origin checks.

The copied `.env.example` also defines optional Langfuse keys as empty strings,
while backend validation rejects empty values. That prevents the documented
`pnpm dev` quick start from succeeding even after the port collision is removed.

## Desired behavior

Normal host and Docker development expose the Languon web application at
`http://localhost:3333`. Backend development defaults and the checked-in local
environment example allow exactly that origin. Authentication browser/API
instructions consistently use `3333`, while the isolated disposable E2E recipe
continues to use its explicit port `3100`.

Empty optional Langfuse credentials in a local environment are treated as
unconfigured, so a fresh `.env.example` copy can start with local prompt
fallbacks and without paid observability credentials.

Host backend/Next processes and Compose-published application/data ports are
loopback-only by default because local authentication uses public placeholder
secrets and fixed code `0000`.

## Acceptance criteria

- [x] AC-1 — `pnpm dev:web` and the web production start script bind port 3333;
      the app profile exposes host/container port 3333.
- [x] AC-2 — Backend development origin defaults, `.env.example`, Compose, and
      current developer documentation use `http://localhost:3333`.
- [x] AC-3 — Empty optional Langfuse public/secret variables are normalized to
      absent with a unit regression; non-empty values remain supported.
- [x] AC-4 — Authentication's current user-flow guide and all three mapped
      Playwright scenarios are semantically reviewed, use the new normal local
      port, carry the current revision marker, and pass real E2E verification.
- [x] AC-5 — The web app is verified in a real browser at port 3333 without a
      bind conflict, unexpected console errors, or unexpected network failures.
- [x] AC-6 — Affected tests, lint, typecheck, builds, Compose rendering,
      `pnpm check`, independent review, and required remediation pass.
- [x] AC-7 — Normal host backend/Next listeners and Compose-published app/data
      ports default to loopback; any LAN publication is an explicit warned opt-in.

## Scope

### In scope

- Host web `dev`/`start` commands and Docker app-profile web exposure.
- Local authentication allowed-origin defaults and tests.
- Empty optional Langfuse credential normalization for the documented startup.
- Loopback-safe host listeners and Compose publications required by security
  review of the development authentication stack.
- Current endpoint documentation and authentication user-flow synchronization.
- Proportional automated, E2E, and browser verification.

### Out of scope

- Changing the admin (`3001`), backend (`4000`), mobile (`8081`), PostgreSQL,
  or Redis port numbers.
- Deployed web topology or production origin decisions.
- The explicitly isolated auth E2E ports (`3100`/`4100`).
- Rewriting historical feature evidence that correctly records earlier port
  `3000` observations.

## Constraints and risks

- Exact-origin/CORS/WebAuthn behavior requires the web URL and backend allowed
  origin to change atomically.
- The ignored user-owned `.env.local` is not overwritten; existing developers
  must update `AUTH_ALLOWED_ORIGINS` themselves or recopy deliberately.
- The port change is a reversible local-development configuration decision and
  does not require an ADR.
- Empty Langfuse normalization applies only to optional credentials; deployed
  authentication and database safety validation remains unchanged.

## User-flow documentation

- Required: No new guide. This is a development endpoint change, not a separate
  product journey.
- Related guide: `docs/user-flows/user-authentication.md` must change because its
  startup, browser URLs, API Origin, and troubleshooting depend on the web port.
- E2E synchronization: preserve
  `signup-verification-refresh-logout`,
  `password-reset-session-revocation`, and `passkey-lifecycle` in
  `apps/web/tests/e2e/auth.journeys.spec.ts`; update the derived revision after
  semantic review and run the registered `web-playwright` command against safe
  disposable infrastructure.

## Open decisions

- None.
