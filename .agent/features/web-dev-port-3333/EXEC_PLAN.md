# ExecPlan: Web Development Port 3333

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-14

## Goal

Make `http://localhost:3333` the coherent normal-development web endpoint so
Languon can run alongside the existing port-3000 application, while preserving
authentication exact-origin behavior and making a fresh local environment
start successfully without optional Langfuse credentials.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.
- Related current guide: `docs/user-flows/user-authentication.md`.
- Architecture: ADR-0001 exact-origin/session constraints and ADR-0004
  guide-to-E2E traceability remain active; no new durable decision is required.

## Existing architecture

- `apps/web/package.json` hard-codes the normal Next dev/start port at 3000.
- `compose.yaml` exposes the same container port and configures backend exact
  allowed origins; `infra/docker/dev.Dockerfile` declares exposed app ports.
- Backend development defaults in `environment.ts` supply the allowed web origin
  when `.env.local` omits it. Unit and HTTP tests encode that boundary.
- Playwright derives its launched Next port from `AUTH_E2E_WEB_ORIGIN`; its
  fallback is currently 3000, while the documented safe auth suite explicitly
  uses isolated web/backend ports 3100/4100.
- The current auth guide covers normal startup/browser/API URLs and hashes those
  test-relevant sections into the E2E revision.
- Root/agentic docs publish the canonical local endpoint. Historical feature
  artifacts recording an earlier port conflict remain unchanged.
- `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are optional but reject the
  empty strings copied from `.env.example`, reproducing the reported backend
  startup failure.

## Acceptance criteria

- [x] AC-1 — Web host/Docker commands expose port 3333.
- [x] AC-2 — Auth origin defaults/config/docs consistently use port 3333.
- [x] AC-3 — Empty optional Langfuse credentials behave as absent.
- [x] AC-4 — Auth guide and mapped E2E tests are synchronized and pass.
- [x] AC-5 — Real browser verification succeeds at port 3333.
- [x] AC-6 — Full validation and independent review pass.
- [x] AC-7 — Default development listeners/publications are loopback-only.

## Test strategy

- Unit: Required — backend environment default/blank optional credential
  behavior and existing auth policy tests.
- Integration: Required — render Compose configuration and exercise real
  frontend/backend boundaries through mapped Playwright.
- Contract: Not required — no public request/response schema changes.
- E2E: Required — run all three auth scenarios with
  `AUTH_E2E_WEB_ORIGIN=http://localhost:3333` against disposable PostgreSQL and
  Redis, proving the formerly occupied port is no longer needed.
- Browser/device: Required — verify the real web app at port 3333 in Chromium,
  including console/network state; narrow visual re-audit is unnecessary because
  no rendering code changes.
- Database migration: Not required — no schema/query/migration change.
- User-flow guide: Update `docs/user-flows/user-authentication.md` startup,
  browser/API Origin, troubleshooting, metadata, and verification date.
- User-flow E2E: Required — preserve the three existing scenario IDs and exact
  `apps/web/tests/e2e/auth.journeys.spec.ts`; update its revision and execute the
  registered `web-playwright` command.
- Security: Focused security review required because exact auth origins and
  environment validation change, even though no deployed origin changes.

## Milestones

- [x] M1 — Exploration and design
  - Objective: enumerate every active normal-development port/origin and
    distinguish isolated E2E/historical references.
  - Components: web scripts, backend environment/tests, Compose/Docker,
    `.env.example`, auth guide/Playwright, developer docs, ADRs.
  - Acceptance criteria: AC-1–AC-6 mapped to implementation and verification.
  - Required tests: source scan, current guide inspection, reported startup
    failure analysis.
  - Evidence: port 3000 is bound by another project; all active Languon 3000
    references and the empty-Langfuse validation mismatch are identified.
- [x] M2 — Implementation and targeted verification
  - Objective: update configuration/origins/docs atomically, normalize blank
    optional Langfuse keys, and synchronize the guide revision.
  - Components: files discovered in M1 plus targeted tests.
  - Acceptance criteria: AC-1–AC-4.
  - Required tests: backend environment unit suite, web/backend lint/typecheck,
    Compose config, guide inspect/check.
  - Evidence: environment regression 20/20 and auth policy 7/7 passed; web unit
    35/35 passed; affected lint/typecheck/build passed; rendered Compose exposes
    web 3333 and backend allows the matching origin; guide checks and revision
    `sha256:855d3e63671c4a38` are synchronized.
- [x] M3 — Full validation and review
  - Objective: prove real startup/browser/E2E behavior, run the repository gate,
    independently review, remediate, and integrate.
  - Components: complete diff and feature artifacts.
  - Acceptance criteria: AC-1–AC-7.
  - Required tests: mapped E2E, browser verification, `pnpm check`, diff hygiene,
    independent code/security/test review.
  - Evidence: final mapped Chromium E2E 3/3 at loopback web 3333/backend 4100;
    canonical dev/start listeners returned HTTP 200 and `lsof` confirmed
    `127.0.0.1:3333`; full `pnpm check` passed; default and LAN-opt-in Compose
    renders preserve loopback-only data services; independent tester,
    correctness, and security re-reviews passed after both Medium findings were
    remediated.

## Progress

- 2026-08-14 — Created `feature/web-dev-port-3333` from clean `main` and created
  the durable feature workspace.
- 2026-08-14 — Read applicable instructions/skills, current auth guide and mapped
  E2E, ADR-0001/0004, port/origin configuration, tests, Docker, and developer
  docs.
- 2026-08-14 — Completed M2. Proved the Langfuse regression red, normalized blank
  optional values, changed active normal web/origin/config/documentation
  references to 3333, preserved isolated E2E 3100/4100, and synchronized the
  auth guide/test revision.
- 2026-08-14 — Ran all three mapped Playwright auth journeys in Desktop Chromium
  with the web at 3333 and backend at 4100 against disposable loopback-only
  PostgreSQL/Redis; 3/3 passed with console/network assertions and cleanup.
- 2026-08-14 — Verified the canonical `pnpm dev:web` command reports ready at
  `http://localhost:3333`, served `/signup` with HTTP 200, and stopped cleanly.
- 2026-08-14 — Full `pnpm check` passed. Independent tester, correctness review,
  and focused security review are in progress.
- 2026-08-14 — Focused security review found the pre-existing development stack
  exposed public local credentials/code on LAN listeners. Added a failing
  backend-host default regression and began loopback-only host/Compose
  remediation; affected validation and security re-review remain.
- 2026-08-14 — Completed the loopback remediation. Hono and host Next processes
  now default to `127.0.0.1`; Docker-only processes retain internal reachability,
  and rendered Compose publishes every application/data port on loopback. Added
  a warned explicit LAN app-publication opt-in while keeping infrastructure local.
- 2026-08-14 — Reran auth Playwright after remediation: 3/3 passed with backend
  and web reporting `127.0.0.1` at ports 4100/3333. Full `pnpm check` passed
  again; canonical dev and production web commands both served HTTP 200 from a
  listener confirmed by `lsof` as `127.0.0.1:3333`.
- 2026-08-14 — Tester found the infrastructure bind-host override contradicted
  the loopback-only data guarantee. Removed it and proved even the explicit app
  LAN render leaves PostgreSQL/Redis fixed to `127.0.0.1`.
- 2026-08-14 — Final tester, independent correctness reviewer, and focused
  security reviewer all passed the remediated tree with no material findings.

## Decisions

- D-001 — Preserve isolated E2E ports
  - Context: the auth guide's disposable recipe intentionally uses 3100/4100 to
    avoid ordinary dev services and enforce safe ownership.
  - Choice and rationale: change the Playwright fallback and normal endpoint to
    3333, but leave the explicit safe recipe at 3100/4100.
  - Alternatives rejected: globally replacing every numeric 3000/3100 reference.
  - ADR impact: Not ADR-worthy; reversible local tooling configuration.
- D-002 — Empty optional credentials mean unconfigured
  - Context: `.env.example` represents absent optional Langfuse credentials as
    blank, but the backend rejects blank strings.
  - Choice and rationale: normalize exact empty strings to `undefined` at the
    environment boundary; retain validation for non-string/invalid values.
  - Alternatives rejected: require fake observability credentials or force each
    developer to delete example keys manually.
  - ADR impact: Not ADR-worthy; aligns optional configuration semantics.
- D-003 — Local authentication surfaces default to loopback
  - Context: host Next/backend listeners and Compose publications were reachable
    on the LAN while development deliberately uses public placeholders and code
    `0000`.
  - Choice and rationale: host backend/web/admin bind `127.0.0.1`; containers
    bind internally but Compose publishes app/data ports on loopback. LAN app
    publication requires an explicit environment opt-in and documented warning.
  - Alternatives rejected: relying on browser Origin checks, which direct
    network clients can forge, or exposing PostgreSQL/Redis for device testing.
  - ADR impact: Not ADR-worthy; local-development hardening within existing auth
    security constraints.

## Discoveries

- The reported port-3000 listener belongs to a different local project, so it
  must be preserved; Languon moves instead of terminating unrelated work.
- Historical feature evidence contains truthful references to earlier port 3000
  conflicts and must not be rewritten.

## Validation

| Check              | Status         | Evidence                                                |
| ------------------ | -------------- | ------------------------------------------------------- |
| Unit               | Passed         | Backend environment/policy 27/27; web 35/35             |
| Integration        | Passed         | Compose uses origin/port 3333 and loopback publications |
| Contract           | Not applicable | No public request/response schema change                |
| E2E                | Passed         | Auth Playwright 3/3 at web 3333/backend 4100            |
| Browser/device     | Passed         | Desktop Chromium; no unexpected console/network errors  |
| Typecheck          | Passed         | Affected workspaces and full `pnpm check`               |
| Lint               | Passed         | Affected workspaces and full `pnpm check`               |
| Build              | Passed         | Affected workspaces and full `pnpm check`               |
| Database migration | Not applicable |                                                         |
| User-flow guide    | Passed         | Validator 15/15; one current guide validated            |
| User-flow E2E      | Passed         | Inspect/check synchronized at `sha256:855d3e63671c4a38` |
| Independent review | Passed         | Final re-review found no material findings              |
| Security review    | Passed         | Both Medium findings fixed; final review clean          |

## Remaining work

- None. The feature is complete and ready for the required feature-branch commit
  and squash integration into `main`.
