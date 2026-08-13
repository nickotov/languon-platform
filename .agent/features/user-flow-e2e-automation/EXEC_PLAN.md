# ExecPlan: User Flow E2E Automation

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-13

## Goal

Make user-flow documentation and critical E2E coverage evolve together: agents
can inspect a guide's required scenarios, author/update the real tests, detect
stale mappings automatically, run the journeys, and leave durable evidence.

## Specification

- In scope: guide E2E metadata, stable scenario/revision markers, validator and
  CLI, repository skill/instructions/templates, authentication migration, ADR,
  and proportional verification.
- Out of scope: blind prose-to-code generation, exhaustive E2E coverage, new
  authentication behavior, or provider-specific CI diff logic.
- Architecture:
  [ADR-0004](../../../docs/adr/0004-user-flow-e2e-traceability-hardening.md)
  supersedes ADR-0003 and records the active project-wide traceability rule.

## Existing architecture

- `docs/user-flows/*.md` has validated feature/title/status/date/surface/source
  metadata and required manual verification sections, but no executable-test
  relationship.
- `scripts/check-user-flow-guides.mjs` is dependency-free, runs in `pnpm check`,
  and is the appropriate source for guide parsing and validation.
- Authentication already has three guarded Playwright journeys in one spec and
  a safe disposable PostgreSQL/Redis recipe; these should be traced rather than
  rewritten.
- Root `AGENTS.md`, `.agents/skills/feature-development`, `.agent/PLANS.md`, and
  feature templates define agent completion behavior.
- Accepted ADR-0001/0002 govern auth/session and migrations but do not constrain
  documentation-to-E2E traceability.

## Acceptance criteria

- [x] AC-1 — Required E2E guide metadata/section are documented and validated.
- [x] AC-2 — Paths, scenarios, markers, and revisions fail closed on drift.
- [x] AC-3 — Revisions cover test-relevant guide content and ignore date-only
      changes.
- [x] AC-4 — Inspect/check CLI gives agents deterministic synchronization input.
- [x] AC-5 — Repository skill owns semantic E2E authoring/update/execution.
- [x] AC-6 — Global feature workflow/templates require synchronization.
- [x] AC-7 — Authentication guide and 3 Playwright journeys are traced/passing.
- [x] AC-8 — Focused/full/E2E validation and independent review pass.

## Test strategy

- Unit: Required — expand dependency-free Node tests for metadata, path,
  scenario, marker, orphan, revision, and date-only behavior; test CLI argument
  and inspection behavior without executing an E2E command.
- Integration: Required as repository-file validation — run the checker and CLI
  against the checked-in authentication guide/spec.
- Contract: Required — guide frontmatter, test-marker grammar, and revision
  canonicalization form the traceability contract.
- E2E: Required — run all three mapped authentication Playwright journeys using
  the documented disposable PostgreSQL/Redis recipe.
- Browser/device: Satisfied by Playwright Desktop Chrome/virtual authenticator;
  no new UI behavior requires additional visual/manual coverage.
- Database migration: Not applicable — no persistence change; disposable DB is
  used only by existing E2E.
- User-flow guide: Update `docs/user-flows/README.md` convention and
  `docs/user-flows/user-authentication.md`; validate and run mapped coverage.
- Security: Focused review required because command/docs changes touch test
  execution, Docker, credentials, and authentication recipes, despite no runtime
  product security change.

## Milestones

- [x] M1 — Exploration and design
  - Objective: define reliable agent-owned synchronization without unsafe code
    generation or shell execution.
  - Components: current guide validator, root workflows/templates, auth guide,
    Playwright config/spec, ADR index.
  - Acceptance criteria: AC-1–AC-8 mapped to implementation and tests.
  - Required tests: source audit and explicit layer/risk analysis.
  - Evidence: repository source establishes one current guide, three existing
    critical auth journeys, and a dependency-free validation path.
- [x] M2 — Traceability contract and tooling
  - Objective: implement metadata, revisions, marker validation, CLI, docs, and
    unit/contract regressions.
  - Components: guide checker/tests, new inspection CLI, package scripts,
    guide convention.
  - Acceptance criteria: AC-1–AC-4.
  - Required tests: focused Node test suite and invalid fixture probes.
  - Evidence: 15 focused Node tests pass for structure, metadata, paths,
    revisions, scenario/file markers, orphan detection, CLI inspect/check, and
    repository mapping, including repository-wide discovery, substantive
    coverage, symlink/path bounds, diagnostics, and inspect/check parity.
    Inspection reports synchronized revision `sha256:49fadbe3ce6c2534`.
- [x] M3 — Agent workflow and authentication migration
  - Objective: make synchronization part of ordinary feature delivery and trace
    the existing auth journeys end-to-end.
  - Components: root instructions, skills, plans/templates, auth guide/spec,
    ADR/current docs.
  - Acceptance criteria: AC-5–AC-7.
  - Required tests: guide/CLI checks and real auth Playwright run.
  - Evidence: the repository skill passes scaffold validation and an independent
    read-only forward test; root workflows/templates/docs and active ADR-0004
    are updated; all 3 mapped auth Playwright scenarios passed in 15.7s against
    owned disposable PostgreSQL/Redis and cleanup was verified.
- [x] M4 — Full validation and review
  - Objective: complete repository checks, independent/security review,
    remediation, and artifacts before squash integration.
  - Components: complete diff and feature artifacts.
  - Acceptance criteria: AC-1–AC-8.
  - Required tests: `pnpm check`, E2E, diff hygiene, independent/test/security
    review as applicable.
  - Evidence: `pnpm check` passed on the remediated tree; independent tester,
    code, architecture, and security re-reviews report no remaining
    Critical/High/Medium findings; diff and skill validation pass.

## Progress

- 2026-08-13 — Created `feature/user-flow-e2e-automation` from clean `main` and
  generated the durable feature workspace.
- 2026-08-13 — Read root/web instructions, feature-development/testing skills,
  plans/templates, ADR index, guide convention/validator, auth guide,
  Playwright config, and all three auth E2E journeys.
- 2026-08-13 — Chose agent-authored tests plus machine-checked scenario and
  revision traceability; recorded accepted ADR-0003 because future features must
  follow the convention.
- 2026-08-13 — Implemented current-guide E2E metadata, coverage revision,
  per-scenario/per-file markers, repository-wide orphan scanning, and the
  non-executing inspect/check CLI. Focused suite passes 15 tests.
- 2026-08-13 — Added and validated the repository `user-flow-e2e` skill, wired
  it into root feature/testing instructions and templates, and forward-tested it
  through an independent agent with no intended-answer context. It reconstructed
  and semantically confirmed all three auth scenarios without changes.
- 2026-08-13 — Ran mapped authentication Playwright on Desktop Chrome using
  PostgreSQL `languon_auth_e2e`/Redis DB 15 in exact loopback `--rm` containers.
  All 3 scenarios passed in 15.7s; the ownership-aware trap removed both
  containers and no unexpected browser error was reported.
- 2026-08-13 — Independent review found revision, inspection parity,
  repository-scan, coverage-substance, command trust, path/symlink, and
  diagnostic hardening gaps. Superseded ADR-0003 with ADR-0004, remediated every
  Critical/High/Medium finding, and received clean tester/code/architecture/
  security re-review verdicts.
- 2026-08-13 — Final `pnpm check`, skill validation, guide inspect/check, lint,
  and diff hygiene passed on the remediated tree.

## Decisions

- D-001 — Agent-authored, tool-verified E2E synchronization
  - Context: working cross-boundary tests require architecture, selector, data,
    infrastructure, and assertion judgment that prose templates cannot supply.
  - Choice and rationale: the skill guides an agent to write tests; validators
    prove traceability/freshness; actual execution proves behavior.
  - Alternatives rejected: blind test generation; documentation-only reminders.
  - ADR impact: ADR-0003, superseded by accepted ADR-0004 after review
    hardening.
- D-002 — Stable scenario IDs plus per-test-file coverage revision
  - Context: file paths alone do not detect missing scenarios or guide changes.
  - Choice and rationale: each scenario has one marker; each declared file
    carries a revision derived from test-relevant guide content.
  - Alternatives rejected: mtimes; CI-provider-only Git diff rules; hashing the
    entire guide including verification dates.
  - ADR impact: ADR-0003, superseded by accepted ADR-0004 after review
    hardening.
- D-003 — Inspection/check command never executes frontmatter
  - Context: a guide is editable content and must not become an arbitrary shell
    execution boundary.
  - Choice and rationale: CLI reports/validates; the agent follows the reviewed
    documented environment command when running E2E.
  - Alternatives rejected: `shell: true` execution of `e2e_command`.
  - ADR impact: security boundary hardened in accepted ADR-0004.

## Discoveries

- Authentication's three existing Playwright tests already match appropriate
  critical scenarios, so migration requires traceability markers rather than new
  product assertions.
- Guide verification dates must not affect the E2E revision or every successful
  rerun would create meaningless test churn.
- Setup and expected-failure content can change E2E behavior even when test
  names do not, so both belong in revision canonicalization.

## Validation

| Check              | Status         | Evidence                            |
| ------------------ | -------------- | ----------------------------------- |
| Unit               | Passed         | 15 Node traceability/CLI tests.     |
| Integration        | Passed         | Checked-in guide/test mapping.      |
| Contract           | Passed         | Metadata/revision/marker contract.  |
| E2E                | Passed         | 3/3 mapped auth journeys, 15.7s.    |
| Browser/device     | Passed         | Desktop Chrome + virtual WebAuthn.  |
| Typecheck          | Passed         | `pnpm check`, 10/10 Turbo tasks.    |
| Lint               | Passed         | `pnpm check`, repository ESLint.    |
| Build              | Passed         | `pnpm check`, 7/7 Turbo tasks.      |
| Database migration | Not applicable | No persistence changes.             |
| User-flow guide    | Passed         | Auth mapping/revision synchronized. |
| Independent review | Passed         | Tester/code/architecture approved.  |
| Security review    | Passed         | No remaining Critical/High/Medium.  |

## Remaining work

- None in implementation. Commit the feature branch and squash-integrate it
  into `main` according to the repository workflow.
