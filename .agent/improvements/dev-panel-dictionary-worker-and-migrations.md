# Improvement: Dev panel dictionary worker and migrations

Status: Complete
Created: 2026-09-14
Updated: 2026-09-14

## Routing decision

- Intended outcome: expose the existing local dictionary worker in the reviewed
  web dev panel catalog and allow the existing migration command to be run there.
- Why this is an improvement rather than a correction: it expands the local
  developer-tooling catalog but adds no product or production capability.
- Explicit-feature check: the user did not request a feature or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public contract,
  persistence, security/auth policy, production dependency, deployment, migration,
  or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature
  authorization before crossing any feature boundary.

## Context and scope

- Current behavior: the panel can start the backend and web applications but has
  no reviewed entry for the separately required dictionary worker; `db:migrate`
  is visible but disabled.
- Expected behavior: the panel exposes an enabled, stoppable dictionary-worker
  service and an enabled, individual-only migration task.
- In scope: a root worker alias, reviewed catalog metadata, focused catalog-policy
  coverage, and the existing web-dev-panel user-flow guide.
- Out of scope: changing worker behavior, migration behavior, database schemas,
  arbitrary command arguments, production deployment, or automatic migration.
- Likely files/surfaces: `package.json`, `web-dev-panel/commands.json`, catalog
  reconciliation metadata/tests, and `docs/user-flows/web-dev-panel.md`.
- Relevant ADRs or constraints: ADR-0014 and inherited ADR-0013 command review,
  fixed argv, source-revision, process ownership, and no-shell boundaries.
- Related user-flow guides: `web-dev-panel`.
- Rollback/removal path: remove the root worker alias and its catalog entry, and
  return `db:migrate` to disabled catalog metadata.

## Plan

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Tests                    | 39 Node tests and 3 Playwright journeys passed                                                           |
| Lint/typecheck/build     | Panel lint and scoped formatting passed; typecheck/build not applicable to metadata-only runtime changes |
| Runtime/browser/database | Chromium synthetic panel journeys passed; real migration deliberately not executed                       |
| Documentation/user-flow  | Guide, revision marker, docs validation, and mapped traceability passed                                  |

## Outcome and evidence

- Changes made: added the root `dev:dictionary-worker` alias and reviewed it as
  an enabled, batch-compatible panel service; enabled `db:migrate` as an
  individual-only task with an explicit configured-database warning.
- Commands and results: `pnpm web-dev-panel:check` passed with 56 reviewed
  commands; `pnpm test:web-dev-panel` passed 39/39 with loopback permission;
  `pnpm test:e2e:web-dev-panel` passed 3/3 in Chromium; panel lint and scoped
  Prettier checks passed. The first sandboxed Node-suite attempt reached 38/39
  and failed only because loopback bind was denied with `EPERM`; the permitted
  rerun passed completely.
- Documentation: updated `docs/user-flows/web-dev-panel.md`, its verified date,
  and the mapped E2E revision. `pnpm docs:user-flows:check` and
  `pnpm user-flow:e2e -- check web-dev-panel` passed.
- Review: final metadata diff confirms no unrelated command enablement,
  eligibility, conflict, executable, or revision changes. Existing fixed-argv,
  source-revision, loopback-session, no-shell, and process-ownership boundaries
  remain unchanged. A separate exploratory browser session was not needed
  because no rendering or interaction implementation changed; the mapped
  Chromium suite exercises the generic catalog rendering and controls.

## Remaining risks

- The migration task mutates whichever PostgreSQL database is selected by the
  local environment; the panel labels it clearly and excludes it from batches.
