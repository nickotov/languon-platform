# ExecPlan: Admin user management

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-20

## Goal

Deliver a working, privately exposed administration application in which a
database-authorized owner can authenticate, inspect users, disable or restore
accounts safely, and review durable audit history, with local/remote bootstrap
commands and production packaging integrated into the existing release system.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `apps/backend` is a Hono application whose authentication composition owns
  PostgreSQL and Redis dependencies. The administration module will use explicit
  application/domain/infrastructure seams and share composed dependencies
  without importing application source across apps.
- Authentication already supports password, passkey, rotating refresh tokens,
  active sessions, recent-authentication checks, and disabled-user session
  revocation semantics. Browser protocol code currently lives in `apps/web`.
- `apps/admin` is a minimal Next.js placeholder. ADR-0005 currently describes
  both browser apps as Next.js/FSD; ADR-0010 will supersede only its admin
  framework decision.
- Drizzle/PostgreSQL migrations are append-only and deployment-classified under
  ADR-0002 and ADR-0009. The latest migration is `0004`.
- Release manifests and blue/green deployment require backend, web, admin, and
  migrator images. Admin readiness currently expects `/healthz` to return the
  release source SHA on port 3001.
- NGINX has public and loopback-bound private-admin TLS listeners. Admin static
  content and `/api/admin/*` routing need explicit separation and Basic Auth.
- `design/DESIGN_SYSTEM.md` and `design/main.pen` are the visual source of truth;
  their current contract excludes a dense admin variant and must be extended.

## Acceptance criteria

The authoritative AC-1 through AC-14 are copied from and maintained in
`FEATURE.md`; milestone evidence will reference those stable IDs.

## Test strategy

- Unit: Required — domain state transitions, reason validation, access control,
  providers, shared browser auth, CLI parsing, and frontend state.
- Integration: Required — disposable PostgreSQL and Redis verify repositories,
  transactions, session revocation, authorization, audit/pruning, and
  concurrency invariants.
- Contract: Required — Zod HTTP boundaries, cookie separation, pagination,
  conflict/recent-auth failure semantics, CLI/deployment interfaces.
- E2E: Required — critical owner and denied browser journeys plus static
  packaging/private-edge deployment behavior.
- Browser/device: Required — desktop/narrow layout, theme, keyboard/focus,
  loading/error states, console errors, and failed network requests.
- Database migration: Required — forward migration against disposable
  PostgreSQL plus schema/invariant checks; production rollback is forward-fix
  per ADR-0002.
- User-flow guide: Required — `docs/user-flows/admin-user-management.md` and
  affected release-deployment guide.
- User-flow E2E: Required — stable scenarios in `FEATURE.md`, mapped to
  `apps/admin/tests/e2e/admin-user-management.journeys.spec.ts` and focused
  deployment tests.

## Milestones

- [x] M1 — Durable architecture, contracts, and schema
    - Objective: Fix framework/security/persistence boundaries before runtime UI.
    - Components: ADR-0010, Zod contracts, Drizzle tables/migration, domain
      language and initial documentation.
    - Acceptance criteria: AC-4, AC-6, AC-8, AC-14 foundations.
    - Required tests: schema/contract unit and disposable PostgreSQL migration.
    - Evidence: ADR-0010, Zod contracts, migrations 0005–0007, 23 contract
      package tests, and 16 disposable PostgreSQL migration/store tests pass.
- [x] M2 — Administration backend and operator commands
    - Objective: Deliver authorized read/mutation/audit APIs and membership tools.
    - Components: administration module, dependency composition, routes,
      dedicated cookies, local/remote membership and prune commands.
    - Acceptance criteria: AC-3 through AC-9.
    - Required tests: domain, HTTP contract, PostgreSQL/Redis integration,
      concurrency and CLI contract tests.
    - Evidence: Backend suite passes 242 tests (47 opt-in integration skips);
      focused deploy/operator tests pass; guarded local and SSH interfaces are
      documented and contract-tested.
- [x] M3 — Shared browser auth and working Refine admin SPA
    - Objective: Replace the placeholder with the complete administrator journey.
    - Components: `@languon/browser-auth`, web migration, Refine providers,
      routes/screens/states/theme/i18n, password/passkey UI.
    - Acceptance criteria: AC-1 through AC-7.
    - Required tests: shared auth unit, web regressions, admin unit/component and
      Playwright journeys.
    - Evidence: Browser-auth 6/6, admin 9/9, public web 62/62, and five real
      Playwright journeys pass. Managed-browser acceptance covered wide/narrow,
      themes, keyboard focus, navigation, console, and network state.
- [x] M4 — Design source and production deployment
    - Objective: Align design contract and ship the SPA through existing release.
    - Components: DESIGN_SYSTEM/main.pen symbols, static NGINX image, health,
      private Basic Auth, public API denial, origins/RP validation, deploy and
      resource-profile integration.
    - Acceptance criteria: AC-2, AC-10, AC-11, AC-14.
    - Required tests: image/static/deep-link/headers/health, NGINX Basic Auth and
      public rejection, blue/green/rollback/resource checks.
    - Evidence: Design board/contract updated; final admin OCI image builds and
      runs healthy as unprivileged NGINX with SHA health, SPA fallback, security
      headers, immutable assets, and no sourcemaps. The real private-edge NGINX
      journey and deployment/security contracts pass.
- [x] M5 — Traceability, full verification, and remediation
    - Objective: Prove the complete journey and close independent findings.
    - Components: user-flow guides/mappings, DB/browser/E2E checks, full static
      checks, independent tester, security reviewer, code reviewer, durable state.
    - Acceptance criteria: AC-1 through AC-14.
    - Required tests: all affected commands plus real-app verification.
    - Evidence: `pnpm check` passes; composite E2E passes Playwright 5/5 plus
      real NGINX 1/1; disposable PostgreSQL passes 16/16; final managed-browser,
      image/runtime, reviewer, tester, and security-review evidence is recorded
      in `EVIDENCE.md` and `REVIEW.md`.

## Progress

- 2026-08-20 — Feature branch and durable artifacts created from the approved
  product/architecture plan.
- 2026-08-20 — M1–M4 implemented. Disposable PostgreSQL, unit/contract,
  Playwright, managed-browser, production build/image, and deployment contract
  checks pass. Real browser runs found and drove fixes for refresh rotation,
  email/UUID search, WebAuthn origin consistency, and inaccessible mobile
  navigation.
- 2026-08-20 — M5 completed after independent review remediation. The final
  implementation closes Basic/Bearer transport collision, private htpasswd
  delivery, refresh retry, authorization races, complete rejection auditing,
  log privacy, retry accessibility, and E2E traceability findings.

## Decisions

- D-1 — Use a Refine React SPA on Vite with React Router and Ant Design.
  Context: the current admin app is a placeholder and the product needs a
  scalable administration framework. Choice: replace only `apps/admin`; keep the
  public web app on Next.js. Alternatives: extend placeholder Next.js manually;
  React-admin. ADR impact: Accepted ADR-0010.
- D-2 — Load authorization from persistence on every request. Context: owner
  membership must be revocable without waiting for access-token expiry. Choice:
  minimal tokens and server-side active user/session/membership checks.
  Alternatives: role claim in JWT. ADR impact: Accepted ADR-0010.
- D-3 — Disable/restore rather than delete. Context: user deletion is irreversible
  and affects authentication/audit/data ownership. Choice: safe status transition,
  session revocation, version conflict, and reason. Alternatives: hard delete or
  anonymization. ADR impact: feature-local product decision.
- D-4 — Defense in depth for exposure. Context: the service is operational and
  sensitive. Choice: private/loopback admin listener with Basic Auth plus owner
  application authentication; public edge blocks admin APIs. Alternatives:
  application authentication alone. ADR impact: Accepted ADR-0010.
- D-5 — Owner membership is CLI-only in V1. Context: a membership UI creates a
  larger privilege-escalation surface. Choice: guarded local and remote commands.
  Alternatives: membership management screens. ADR impact: feature-local.

## Discoveries

- Public web and admin may share a parent domain; existing refresh cookie and
  BroadcastChannel identifiers therefore cannot be reused by admin.
- Existing session revocation already includes a `disabled_user` reason.
- Admin readiness is release-identity aware, so static image health content must
  include the build SHA rather than a generic 200 response.
- Repeated admin/public refresh attempts can race token rotation across tabs;
  framework-neutral coordination therefore uses a dedicated admin namespace and
  Web Locks/BroadcastChannel where available.
- WebAuthn browser origins must consistently use `localhost` in disposable E2E;
  mixing `127.0.0.1` with the relying-party ID fails the ceremony.
- Ant Design's zero-width responsive sider trigger was unlabeled and nearly
  invisible at 320px; the accepted implementation uses a labeled overlay drawer.

## Validation

| Check              | Status | Evidence                                           |
| ------------------ | ------ | -------------------------------------------------- |
| Unit               | Passed | Admin 9, browser-auth 6, contracts 23, backend 242 |
| Integration        | Passed | Disposable PostgreSQL store/migration 16/16        |
| Contract           | Passed | HTTP, CLI/SSH, deploy/config/NGINX contracts       |
| E2E                | Passed | Playwright 5/5 plus real private-edge NGINX 1/1    |
| Browser/device     | Passed | agent-browser 0.33.0, Chrome 152, 1440/320 px      |
| Typecheck          | Passed | Full `pnpm check`                                  |
| Lint               | Passed | Full `pnpm check`                                  |
| Build              | Passed | Web/backend/admin/packages and final admin image   |
| Database migration | Passed | Forward 0001–0007 on disposable PostgreSQL         |
| User-flow guide    | Passed | Guide validator covers all six guides              |
| User-flow E2E      | Passed | Admin and release-deployment mappings current      |
| Independent review | Passed | Tester and code reviewer approve final tree        |
| Security review    | Passed | No open critical/high/material-medium findings     |

## Remaining work

None for feature completion. Timeweb networking, DNS/TLS, SSH, htpasswd
rotation, and first production telemetry remain documented launch operations.
