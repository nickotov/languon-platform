# Correction: Exclude Mobile From Default Development

Status: Complete
Created: 2026-08-14
Updated: 2026-08-14

## Routing decision

- Intended outcome: Default aggregate development commands launch backend, web,
  and admin without starting the deferred mobile/Expo application.
- Why this is a correction: This is a reversible local command/configuration
  adjustment. It adds no capability, dependency, contract, persistence,
  deployment model, or product behavior.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing if the work
  expands into mobile implementation, production topology, or a new workflow.

## Context and scope

- Current behavior: `pnpm dev` and `pnpm dev:apps:docker` include the mobile Expo
  process even though mobile development is deferred.
- Expected behavior: Aggregate host and Docker development start backend, web,
  and admin only. Explicit mobile commands remain available for later use.
- In scope: Root scripts and their canonical developer documentation.
- Out of scope: Mobile code/config removal, package deletion, production
  infrastructure, or changes to explicit mobile commands.
- Likely files/surfaces: `package.json`, `README.md`, `docs/development.md`, and
  `docs/agentic-development.md`.
- Relevant ADRs or constraints: None; this is a reversible local workflow choice.
- Related user-flow guides: None. Product journeys and their dedicated startup
  commands are unchanged.

## Plan

- [x] Exclude mobile from host and Docker aggregate development scripts.
- [x] Update canonical command documentation.
- [x] Verify Turbo and Compose resolve only the intended aggregate services.
- [x] Run formatting/package validation and inspect the final diff.

## Verification

| Check                    | Result                                              |
| ------------------------ | --------------------------------------------------- |
| Tests                    | Turbo and Compose dry runs passed                   |
| Lint/typecheck/build     | Not required; scripts/docs only                     |
| Runtime/browser/database | No services launched; dry-run validation passed     |
| Documentation/user-flow  | Canonical developer docs updated; guides unaffected |

## Outcome and evidence

- Changes made: Added a negative Turbo filter to `pnpm dev` and explicit
  backend/web/admin Docker targets to `pnpm dev:apps:docker`. Explicit
  `dev:mobile` and `dev:mobile:docker` commands remain unchanged.
- Commands and results: `pnpm exec turbo run dev --parallel
'--filter=!@languon/mobile' --dry` listed admin, backend, web, and their shared
  dependencies with no mobile package. `docker compose --dry-run --profile apps
up backend web admin` planned backend, web, admin, migration, PostgreSQL, and
  Redis with no mobile service.
- Documentation: Updated README, development documentation, and agentic
  development guidance to describe the temporary aggregate exclusion and
  explicit opt-in mobile command.
- Review: The change is limited to development launch selection and matching
  documentation. Mobile source/configuration and explicit commands are
  preserved. Existing generated `next-env.d.ts` user changes are untouched.
- Runtime note: An Expo process from the already-running aggregate is still
  listening on port 8081. It was not terminated because doing so could stop the
  sibling applications owned by the same Turbo run. Restart `pnpm dev` once to
  apply the new aggregate selection.

## Remaining risks

- The `--parallel` Turbo option already emits a deprecation warning; replacing
  that established orchestration is separate work and is not required for this
  temporary exclusion.
