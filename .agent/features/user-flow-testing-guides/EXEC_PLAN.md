# ExecPlan: User Flow Testing Guides

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-13

## Goal

Make every executable feature easy to verify later without reconstructing its
behavior from source or historical agent output. Agents maintain discoverable,
validated `docs/user-flows/<feature-slug>.md` guides alongside related behavior,
and User Authentication has the first complete browser/API guide.

## Specification

- In scope: root agent instructions, guide convention and metadata, validation
  command, feature templates, root documentation links, and the authentication
  guide.
- Out of scope: runtime authentication changes, production-provider setup, and
  automatic semantic impact analysis.
- No ADR is required: this is a reversible engineering/documentation workflow
  convention and does not alter product, data, security, public API,
  infrastructure, deployment, or architectural boundaries.

## Existing architecture

- Root `AGENTS.md` owns the repository Definition of Done and autonomous feature
  flow, but it does not mention durable user-flow guides.
- `.agent/templates/` creates feature specifications, ExecPlans, evidence, and
  reviews, but has no prompt for user-flow documentation applicability.
- `docs/` contains setup, development, architecture, and ADR documentation; no
  `docs/user-flows/` directory or guide metadata convention exists.
- `pnpm check` runs format, lint, typecheck, tests, and builds. Root scripts are
  suitable for a dependency-free documentation validator.
- User Authentication is complete and exposes browser and Hono HTTP surfaces.
  Its exact commands, contracts, expected states, E2E cases, and security
  constraints are recorded in its source and feature evidence.
- Accepted ADR-0001/0002 remain authoritative for authentication/session and
  migration behavior; this feature only documents how to exercise them.

## Acceptance criteria

- [x] AC-1 — Relevant-guide discovery and maintenance are mandatory in root
      agent instructions and Definition of Done.
- [x] AC-2 — The guide convention and frontmatter schema are documented.
- [x] AC-3 — `pnpm docs:user-flows:check` validates guides and is included in
      `pnpm check`.
- [x] AC-4 — Feature templates record applicability, validation, evidence, and
      review of user-flow guides.
- [x] AC-5 — The User Authentication guide covers complete local browser and API
      verification with expected outcomes.
- [x] AC-6 — Security, rate-limit, passkey, and cleanup boundaries are explicit.
- [x] AC-7 — Root documentation indexes the convention and command.
- [x] AC-8 — Focused/full validation and independent review pass.

## Test strategy

- Unit: Not required — no domain/runtime behavior changes; the validator is
  exercised directly against the checked-in guides.
- Integration: Not required — application integration behavior is unchanged.
- Contract: Required as documentation audit — compare every documented endpoint,
  request, result, and route against shared schemas/Hono routes and run the guide
  validator.
- E2E: Required as recipe verification — provision the exact documented
  disposable PostgreSQL/Redis targets and run all three authentication
  Playwright journeys on dedicated app ports.
- Browser/device: Required through Playwright's Desktop Chrome project to prove
  the documented start-to-result recipe; no additional responsive/manual pass
  is needed because application UI behavior is unchanged.
- Database migration: Not applicable — no schema or migration changes.
- User-flow guide: Required — create the authentication guide and validate its
  metadata, index entry, structure, and exact source references.
- Repository: Run `pnpm docs:user-flows:check`, Prettier, `git diff --check`, and
  `pnpm check`.

## Milestones

- [x] M1 — Exploration and design
  - Objective: establish the guide lifecycle, metadata, enforcement boundary,
    and exact authentication verification surface.
  - Components: root instructions/templates, docs layout, package scripts,
    authentication routes/contracts/UI/E2E evidence.
  - Acceptance criteria: AC-1–AC-8 mapped to implementation and checks.
  - Required tests: source/contract audit and baseline Git-state inspection.
  - Evidence: current commands, endpoint paths, UI labels, test journeys, and
    absence of existing user-flow guides were verified from repository source.
- [x] M2 — Convention and enforcement
  - Objective: implement instructions, frontmatter schema, validator, templates,
    and repository links.
  - Components: `AGENTS.md`, `.agent/templates/`, `docs/user-flows/README.md`,
    `scripts/check-user-flow-guides.mjs`, root `package.json`, README/development.
  - Acceptance criteria: AC-1–AC-4 and AC-7.
  - Required tests: focused validator, intentional invalid-fixture check, format,
    lint/syntax, and diff hygiene.
  - Evidence: root instructions/skill/plan/templates, guide index/schema,
    dependency-free validator with seven focused tests, `pnpm check` integration,
    and root documentation links are implemented and validated.
- [x] M3 — Authentication guide
  - Objective: provide a reproducible start-to-result manual/browser/API guide.
  - Components: `docs/user-flows/user-authentication.md` and index.
  - Acceptance criteria: AC-5–AC-7.
  - Required tests: validator and audit against routes, contracts, UI, and E2E.
  - Evidence: the current guide covers browser/API success and failure paths,
    automated suites, troubleshooting, and cleanup. Real local startup/migration
    and signup/verify/me/refresh/logout API smoke passed against PostgreSQL/Redis.
- [x] M4 — Full validation, review, and integration
  - Objective: prove the convention, resolve independent findings, finalize
    artifacts, and squash-integrate the feature into `main`.
  - Components: full diff, feature artifacts, Git history.
  - Acceptance criteria: AC-1–AC-8 and repository Definition of Done.
  - Required tests: `pnpm check`, guide validator, formatting/diff checks, and
    independent review.
  - Evidence: `pnpm check`, the exact disposable-infrastructure Playwright
    recipe, independent review, security review, remediation, and Git hygiene
    all passed. The completed branch is ready for squash integration to `main`.

## Progress

- 2026-08-13 — Created `feature/user-flow-testing-guides` from clean `main` and
  generated the durable feature workspace.
- 2026-08-13 — Read repository instructions, feature-development/testing skills,
  plans, docs, scripts, accepted ADR index, and authentication routes/contracts/
  UI/E2E evidence. No architecture or product blocker was found.
- 2026-08-13 — Defined path-aware frontmatter, validator, template integration,
  and complete authentication browser/API guide as the implementation boundary.
- 2026-08-13 — Implemented the convention across root instructions, the
  feature-development skill, ExecPlan/templates, root docs, and `pnpm check`.
  Added five validator regressions for valid and invalid guide collections.
- 2026-08-13 — Added the indexed authentication guide and linked it from the
  completed authentication feature. Audited commands/endpoints/results against
  current routes, contracts, UI components, and Playwright journeys.
- 2026-08-13 — Verified real local infrastructure startup and migrations plus a
  fresh HTTP signup -> `0000` verification -> current user -> refresh -> logout
  -> rejected refresh journey. Temporary secrets/responses and the two Docker
  volumes created for this smoke were removed; unrelated pre-existing volumes
  and the unrelated process on port 3000 were preserved.
- 2026-08-13 — `pnpm check` passed after fixing one ESLint regex-style failure
  in the new validator. Independent review is active.
- 2026-08-13 — Independent review found four medium gaps: predictable token-file
  paths, validator false positives, incomplete auth impact metadata, and an E2E
  command that did not provision its disposable services. All four were fixed.
- 2026-08-13 — The first exact E2E recipe run exposed Next.js blocking app
  origins on `127.0.0.1`; the recipe was corrected to use dedicated localhost
  ports `3100`/`4100`. The second exact run migrated a fresh disposable database
  and passed all three Chromium journeys in 12.4 seconds. Its trap removed both
  `--rm` containers, which was verified afterward.
- 2026-08-13 — Hardened E2E cleanup with per-container ownership flags so a name
  collision cannot stop an unknown container. The final exact recipe again
  passed 3/3 journeys in 17.8 seconds and removed both owned containers.
- 2026-08-13 — Focused independent re-review passed with no remaining Critical,
  High, or Medium findings. Final `pnpm check` also passed.
- 2026-08-13 — Focused security review found one Medium setup risk: an
  unconditional example copy could overwrite an ignored `.env.local`. The guide
  now performs a create-only, symlink-aware copy. Security re-review found no
  remaining Critical/High/Medium issues. Its Low empty-fence validator finding
  and the independent review's Low HTML-comment/inline-code index observation
  were also fixed with regressions; the API recipe restores its prior umask.

## Decisions

- D-001 — One canonical guide per primary feature slug
  - Context: stable naming and discovery are needed without a separate registry
    service.
  - Choice and rationale: use `docs/user-flows/<feature-slug>.md`, require the
    frontmatter `feature` to match the filename, and allow related guides to list
    overlapping `source_paths`.
  - Alternatives rejected: guide names unrelated to feature workspaces; a guide
    embedded only in historical `EVIDENCE.md`.
  - ADR impact: Not ADR-worthy; engineering documentation convention.
- D-002 — Path-aware YAML frontmatter
  - Context: agents need to find guides affected by cross-feature code changes.
  - Choice and rationale: require feature/title/status/date/surfaces/source paths;
    agents scan feature and source-path metadata, then use judgment for semantic
    overlap.
  - Alternatives rejected: filename-only discovery; exhaustive manually
    maintained reverse dependency graph.
  - ADR impact: Not ADR-worthy.
- D-003 — Dependency-free structural validation
  - Context: a convention that is never checked will drift, but full semantic
    matching is not reliable from static paths.
  - Choice and rationale: validate metadata, naming, index membership, and core
    sections in `pnpm check`; keep semantic accuracy under feature review.
  - Alternatives rejected: no enforcement; adding a YAML dependency; brittle Git
    diff heuristics.
  - ADR impact: Not ADR-worthy.
- D-004 — Manual guide complements automated evidence
  - Context: the user wants both reproducible manual testing and durable expected
    results.
  - Choice and rationale: include browser/API steps and link exact automated
    suites for races, limits, and virtual WebAuthn that are costly or unsafe to
    reproduce manually.
  - Alternatives rejected: replacing automation with prose; copying full E2E
    implementation into docs.
  - ADR impact: Not ADR-worthy.

## Discoveries

- Backend and migration entry points both load root `.env.local`, while Next.js
  uses its normal root/workspace environment behavior; the existing quick-start
  command is valid for the documented host workflow.
- All cookie-authenticated mutation endpoints require the exact allowed `Origin`
  and explicit JSON `{}` bodies where the schema is empty; curl recipes must
  include both.
- Verification/recovery issue flows have a 60-second resend cooldown and rolling
  hourly limits, so guides should use a fresh unique local email and tell readers
  to honor returned retry times rather than repeatedly clicking.
- WebAuthn completion payloads cannot be authored manually. Browser hardware or
  the Playwright virtual authenticator is the correct verification layer.
- Next.js development resources reject a `127.0.0.1` browser origin under the
  current configuration. Auth E2E app origins must use `localhost`; dedicated
  ports avoid disturbing ordinary development servers.

## Validation

| Check                 | Status         | Evidence                                                                          |
| --------------------- | -------------- | --------------------------------------------------------------------------------- |
| Guide validator       | Passed         | Seven node:test cases plus one checked-in guide.                                  |
| Contract/source audit | Passed         | Routes, contracts, UI, E2E, environment, and migration entry read.                |
| Unit                  | Not applicable | No runtime/domain behavior change.                                                |
| Integration           | Not applicable | Runtime integration unchanged.                                                    |
| E2E                   | Passed         | Final disposable-infra recipe; 3/3 Playwright journeys in 17.8s.                  |
| Browser/device        | Passed         | Desktop Chrome project; virtual WebAuthn and unexpected browser-error assertions. |
| Typecheck             | Passed         | Repository 10/10 tasks through `pnpm check`.                                      |
| Lint                  | Passed         | Repository ESLint through `pnpm check`.                                           |
| Build                 | Passed         | Repository 7/7 tasks through `pnpm check`.                                        |
| Database migration    | Not applicable | No persistence change.                                                            |
| User-flow guide       | Passed         | Authentication metadata/structure, real API smoke, and exact E2E recipe verified. |
| Independent review    | Passed         | Four Medium findings fixed; focused re-review found no remaining Medium+.         |
| Security review       | Passed         | `.env.local` overwrite Medium fixed; final verdict 0 Critical/High/Medium.        |

## Remaining work

- None. Commit the completed branch and squash-integrate it into `main`.
