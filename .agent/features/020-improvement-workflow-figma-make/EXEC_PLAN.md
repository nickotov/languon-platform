# ExecPlan: Lightweight improvements and Figma Make design workflow

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-23

## Goal

Route modest engineering improvements through a proportional one-record flow and
make Figma Make the preferred MCP-backed visual source without blocking existing
Pencil-based implementation.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- Root `AGENTS.md` currently distinguishes only corrections and features.
- `$correction-development` owns small established-behavior fixes; the new skill
  must not duplicate its low-risk scope.
- `$feature-development` governs four artifacts, branch creation, evidence, and
  independent review once a user explicitly requests feature delivery.
- ADR-0008 makes `design/` authoritative; `DESIGN_SYSTEM.md` and `main.pen`
  currently describe the visual contract.
- `.codex/config.toml` now configures the official remote Figma MCP. The
  connector is authenticated and supports MCP resources, but `design/ai generated
languon design.make` is a local ZIP-based snapshot and provides no Make project
  link to the MCP.

## Acceptance criteria

- [x] AC-1 — Add a repository-local improvement skill, template, and root
      routing rules that cover modest developer, tooling, and existing-contract UX
      improvements without starting feature delivery.
- [x] AC-2 — Enter `$feature-development` only on explicit user request; pause
      implicit high-risk work for authorization rather than silently escalating.
- [x] AC-3 — Document and configure the staged Figma Make MCP design workflow.
- [x] AC-4 — Complete static validation and independent review.

## Test strategy

- Unit: Not required — no runtime code changes.
- Integration: Not required — configuration and documentation only.
- Contract: Not required — no application contracts change.
- E2E: Not required — no executable application journey changes.
- Browser/device: Not required — no runtime UI changes.
- Database migration: Not required.
- User-flow guide: Not required — no documented command or journey changed.
- User-flow E2E: Not required — no mapped guide is affected.

## Milestones

- [x] M1 — Define focused-improvement routing
    - Objective: Establish a one-record improvement workflow that remains
      distinct from corrections and explicitly requested features.
    - Components: Root instructions, template, improvement/correction/feature
      skills, and developer documentation.
    - Acceptance criteria: AC-1 and AC-2.
    - Required tests: Routing examples and local skill validation.
    - Evidence: Skill and template added; routing guards document the explicit
      feature authorization boundary.
- [x] M2 — Establish Figma Make source transition
    - Objective: Configure Figma MCP and document safe source precedence.
    - Components: `.codex/config.toml`, Figma Make archive, design/architecture
      docs, UI/UX, frontend, and web-dev-panel skills, ADR-0015.
    - Acceptance criteria: AC-3.
    - Required tests: Configuration parse and authenticated connector check.
    - Evidence: Connector authentication verified; archive format and absent cloud
      reference recorded.
- [x] M3 — Validate and independently review
    - Objective: Verify metadata, formatting, authority consistency, and the
      expected routing behavior; remediate review findings.
    - Components: Complete diff and feature artifacts.
    - Acceptance criteria: AC-4.
    - Required tests: Skill validator, Prettier, docs/user-flow checks if needed,
      diff check, and independent review.
    - Evidence: Record exact commands and results in `EVIDENCE.md` and findings
      in `REVIEW.md`.

## Progress

- 2026-08-23 — Created the feature workspace, added the improvement-flow skill
  and template, updated routing rules, configured Figma MCP, preserved the
  provided Make archive, and recorded ADR-0015.
- 2026-08-23 — Validated the skill package, agent-skill policy, user-flow guides,
  formatting, diff, Make archive, and authenticated MCP resource capability.
  Independent implementation and security reviews found no material issue.

## Decisions

- D-001 — Keep correction, improvement, and feature delivery distinct.
    - Context: The correction flow is intentionally too narrow for a modest
      tooling dependency or small developer/UX enhancement, while the feature
      flow is excessive for those outcomes.
    - Choice and rationale: Route focused non-capability enhancements through
      one improvement record. Enter feature delivery only on explicit request;
      high-risk implicit requests pause for authorization.
    - Alternatives rejected: Automatically escalating all out-of-correction work
      to feature delivery; allowing the improvement flow to bypass high-risk
      boundaries.
    - ADR impact: Not ADR-worthy; workflow policy remains in root instructions.
- D-002 — Trial Figma Make without an immediate Pencil replacement.
    - Context: Figma Make MCP context needs a shared Make project link and MCP
      resources; the committed local archive is not directly MCP-addressable.
    - Choice and rationale: Prefer accessible Figma Make composition, retain
      Pencil for unmigrated screens, and prohibit hand-editing the archive.
    - Alternatives rejected: Immediate replacement, Pencil-only continuation,
      or archive manipulation.
    - ADR impact: Accepted ADR-0015.

## Discoveries

- The official Figma MCP connector is available, authenticated, and exposes MCP
  resources in this session. Figma Make context uses those resources after the
  user provides a valid Make project link; Figma Design file/node context is a
  separate workflow.
- The local `.make` file is a ZIP archive containing `canvas.fig`; no Make
  project link was supplied, so Make project resources cannot be queried for this
  artifact yet.

## Validation

| Check              | Status         | Evidence                                                  |
| ------------------ | -------------- | --------------------------------------------------------- |
| Unit               | Not applicable | No runtime code                                           |
| Integration        | Not applicable | No integration boundary changed                           |
| Contract           | Not applicable | No public contract changed                                |
| E2E                | Not applicable | No executable journey changed                             |
| Browser/device     | Not applicable | No runtime UI changed                                     |
| Typecheck          | Not applicable | Documentation/configuration only                          |
| Lint               | Passed         | `pnpm agent-skills:check`                                 |
| Build              | Not applicable | No build inputs changed                                   |
| Database migration | Not applicable | No persistence change                                     |
| User-flow guide    | Not applicable | No guide behavior/commands changed                        |
| User-flow E2E      | Not applicable | No guide mapping changed                                  |
| Independent review | Passed         | No material findings after remediation                    |
| Security review    | Passed         | No material finding; one Low hardening follow-up accepted |

## Remaining work

- A future Figma-derived task must provide the shared Make project link before
  MCP can list and fetch its project resources.
- Confirm supported Codex MCP tool allowlisting syntax before restricting the
  Figma write-capable tool surface; current explicit-authorization safeguards
  remain mandatory.
