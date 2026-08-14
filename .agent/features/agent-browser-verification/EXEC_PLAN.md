# ExecPlan: Agent Browser Verification

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-14

## Goal

Make fast, safe `agent-browser` checks the repository default for agent-led
verification of running web/admin changes, without weakening or replacing the
Playwright E2E suite.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- Root `package.json` and `pnpm-lock.yaml` own shared developer tooling.
- `.codex/config.toml` currently registers Playwright MCP for interactive checks.
- `.agents/skills/browser-verification/SKILL.md` defines real-app verification;
  `.agents/skills/testing/SKILL.md` separately selects automated E2E coverage.
- `apps/web` owns `@playwright/test` and its E2E scripts; those remain unchanged.
- `README.md` is the canonical command index and
  `docs/agentic-development.md` documents tool choice and prompting.
- No accepted ADR governs browser tooling. This is a reversible local workflow
  choice and does not warrant a new ADR.

## Acceptance criteria

- [x] AC-1 — Canonical install and diagnostic commands use the pinned package.
- [x] AC-2 — Project-scoped Codex configuration no longer exposes Playwright MCP;
      interactive verification uses the pinned agent-browser CLI.
- [x] AC-3 — Agent guidance consistently separates agent-browser verification
      from Playwright E2E tests.
- [x] AC-4 — The workflow specifies safe, comprehensive real-browser evidence.
- [x] AC-5 — Static checks and a live smoke journey pass.

## Test strategy

- Unit: Required — validate the wrapper's session, URL, command, option, config,
  and environment restrictions with deterministic Node tests.
- Integration: Required — run install, full doctor launch, and a wrapper-driven
  smoke against the local web application.
- Contract: Not required — no public contract changes.
- E2E: Not required — product journeys and Playwright tests are unchanged.
- Browser/device: Required — run `agent-browser` against a deterministic local
  page and verify snapshot, console, network, screenshot, and cleanup behavior.
- Database migration: Not required — no persistence changes.
- User-flow guide: Not required — internal tooling has no Languon product
  journey; update canonical developer documentation instead.
- User-flow E2E: Not required — no guide or mapped E2E behavior changes.

## Milestones

- [x] M1 — Exploration and design
  - Objective: Compare upstream capabilities with the existing verification
    workflow and establish the Playwright boundary.
  - Components: Upstream docs, root commands, Codex config, skills, developer docs.
  - Acceptance criteria: AC-1 through AC-4.
  - Required tests: Repository inspection and upstream documentation review.
  - Evidence: Upstream supports a pinned project dependency, MCP mode,
    accessibility refs, viewports, console/network inspection, screenshots,
    isolated sessions, content boundaries, and cleanup.
- [x] M2 — Implementation and targeted verification
  - Objective: Add the dependency and commands, remove the Playwright MCP entry,
    and align agent
    and developer instructions.
  - Components: `package.json`, lockfile, `.codex/config.toml`, `AGENTS.md`,
    `agent-browser.json`, safe wrapper and tests, browser-verification skill,
    README, agentic-development docs.
  - Acceptance criteria: AC-1 through AC-4.
  - Required tests: Package/command inspection, formatting, targeted text audit.
  - Evidence: Pinned CLI 0.33.0, canonical scripts and project config are active;
    wrapper tests, managed browser installation, full launch diagnostic,
    content-boundary, local-host containment, and live smoke checks pass.
- [x] M3 — Full validation and review
  - Objective: Run a live smoke journey and repository checks, then complete
    independent review and remediation.
  - Components: Full feature diff and durable evidence.
  - Acceptance criteria: AC-5 and final audit of AC-1 through AC-4.
  - Required tests: `agent-browser` version/doctor/smoke, format, lint,
    typecheck, build, independent reviewer and tester passes.
  - Evidence: `pnpm browser:check`, the live Languon smoke, frozen pnpm 10
    lockfile validation, `pnpm check`, and final independent implementation,
    test, and security reviews all passed.

## Progress

- 2026-08-14 — Classified as a feature, created the feature branch/workspace,
  reviewed repository workflows and upstream `agent-browser` documentation.
  Next: install the pinned dependency and update tooling/instructions.
- 2026-08-14 — Completed M2, verified a live narrow-viewport browser smoke, and
  passed `pnpm check`. Next: complete independent tester, implementation, and
  security review passes and remediate findings.
- 2026-08-14 — Independent testing proved that the temporary 0.27.0 pin did not
  contain clicked navigation or `sendBeacon`. Upgraded to 0.33.0, added explicit
  security flags, random wrapper-owned session handles, and a live containment
  regression. The browser check and full repository check now pass. Next: final
  independent re-review.
- 2026-08-14 — Remediated final environment, cleanup-retry, install-argument,
  and test-strength findings. Final reviewer, tester, and security closure passes
  are clean; M3 and the feature are complete.

## Decisions

- D-1 — Tool boundary.
  - Context: Interactive verification and automated regression tests serve
    different purposes despite both controlling Chromium.
  - Choice and rationale: Use `agent-browser` for exploratory real-app evidence;
    retain Playwright only for committed E2E suites because it supplies stable,
    reviewable assertions and fixtures.
  - Alternatives rejected: Keep Playwright MCP as primary (does not deliver the
    requested faster workflow); replace Playwright E2E (would weaken durable
    regression coverage).
  - ADR impact: Not ADR-worthy; reversible developer tooling choice.
- D-2 — Project-pinned CLI.
  - Context: Agents need reproducible availability without an unpinned global
    install or a second interactive Playwright path.
  - Choice and rationale: Pin the root dev dependency, expose setup/doctor
    scripts, and run browser checks through a repository-owned wrapper. Pin
    0.33.0 because its hardened allowlist blocks page traffic that escaped
    0.27.0. Although the package declares pnpm 11, its consumer installation,
    frozen lockfile, CLI, managed Chrome install, and live launch are verified
    with this repository's pinned pnpm 10.13.1; upgrading the whole repository
    toolchain is outside this feature.
  - Alternatives rejected: Global-only install (unversioned); copy upstream
    skill wholesale (duplicates Languon's acceptance workflow).
  - ADR impact: Not ADR-worthy.
- D-3 — Enforced safe wrapper.
  - Context: Browser output and repository prose are untrusted, upstream config
    can inherit user/environment settings, and shell approval is not a semantic
    browser action policy.
  - Choice and rationale: Route normal verification through a tested wrapper
    that selects the reviewed config, strips browser/proxy overrides, requires a
    random wrapper-owned session handle, permits only reviewed local hosts, and
    allowlists safe commands. Pass the security flags explicitly on every
    controlled browser invocation and regression-test page-driven navigation
    and `sendBeacon` against a reachable disallowed sink.
  - Alternatives rejected: Instruction-only controls; exposing agent-browser MCP;
    relying on upstream category policies without verified enforcement.
  - ADR impact: Not ADR-worthy; feature-local tool containment.

## Discoveries

- The supplied ChatGPT share URL could not be fetched from this environment;
  analysis used the current upstream GitHub repository and npm package metadata.
- The initial instruction-only origin restriction was insufficient. The reviewed
  project config now allows only `localhost` and `127.0.0.1`, covering Languon's
  local frontend/backend origins while blocking external page traffic.
- Releases 0.27.1 and newer declare pnpm 11, conflicting with Languon's pnpm 10
  metadata. A temporary 0.27.0 pin avoided that warning but live tests proved
  its allowlist did not contain clicked navigation or `sendBeacon`. Security
  takes precedence: 0.33.0 is pinned and its consumer path is verified with
  pnpm 10.13.1.
- Host allowlisting is browser-level containment, not an operating-system
  firewall or a port-level origin boundary. Fake data and reviewed local
  services remain required.
- Upstream category-based action controls are not used as a security boundary.
  The project wrapper enforces an explicit safe command and option surface.

## Validation

| Check              | Status         | Evidence                                            |
| ------------------ | -------------- | --------------------------------------------------- |
| Unit               | Passed         | Safe-wrapper Node tests.                            |
| Integration        | Passed         | Install, doctor, live wrapper smoke.                |
| Contract           | Not applicable | No contracts.                                       |
| E2E                | Not applicable | Product E2E unchanged.                              |
| Browser/device     | Passed         | agent-browser 0.33.0 safe-wrapper smoke at 390x844. |
| Typecheck          | Passed         | `pnpm check`.                                       |
| Lint               | Passed         | `pnpm check`.                                       |
| Build              | Passed         | `pnpm check`.                                       |
| Database migration | Not applicable | No persistence changes.                             |
| User-flow guide    | Not applicable | Internal agent tooling only.                        |
| User-flow E2E      | Not applicable | No guide changes.                                   |
| Independent review | Passed         | Clean final implementation and tester verdicts.     |
| Security review    | Passed         | Clean final verdict; no material findings remain.   |

## Remaining work

- None.
