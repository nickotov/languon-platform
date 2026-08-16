# ExecPlan: Local agent skills

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-16

## Goal

Provide six discoverable, Languon-owned agent skills that add focused reasoning
workflows without competing with the repository's established delivery policy,
and document their reviewed upstream provenance.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `.agents/skills/*/SKILL.md` contains repository-scoped workflows; every
  existing skill also has `agents/openai.yaml` UI metadata.
- Root `AGENTS.md` owns correction/feature classification, durable state,
  verification, ADR lifecycle, Git policy, and Definition of Done.
- Existing `$testing`, `$browser-verification`, `$db-verification`,
  `$code-review`, and `$user-flow-e2e` skills already own their respective
  verification surfaces.
- `docs/agentic-development.md` is the developer-facing guide to agent workflow.
- No accepted ADR governs skill packaging. This change does not establish a
  product or application architecture decision, so no ADR is needed.
- The conceptual source is `mattpocock/skills`, reviewed at commit
  `068b6e0c62393147daf03530149cdce209c93da8` under the MIT License.

## Acceptance criteria

- [x] AC-1 — Six valid local skill packages and matching UI metadata exist.
- [x] AC-2 — All skills preserve Languon's authority and verification routing.
- [x] AC-3 — Exploratory skills are explicitly invoked and avoid unmanaged Git
      or external-state changes.
- [x] AC-4 — Documentation records upstream links, revision, license, and local
      adaptation decisions.
- [x] AC-5 — Validation, affected checks, and independent review pass.

## Test strategy

- Unit: Not required — no executable application logic is added.
- Integration: Not required — skills have no runtime integration.
- Contract: Required through the skill creator validator for frontmatter and a
  repository validator for directory/name agreement, UI metadata, default
  prompts, size bounds, and invocation policy.
- E2E: Not required — no application journey changes.
- Browser/device: Not required — no rendered application surface changes.
- Database migration: Not required — no persistence changes.
- Static documentation: run Prettier check, repository lint, and targeted link
  and content inspection.
- Forward test: run isolated, read-only skill exercises where safe to confirm
  authority routing and output shape without modifying production systems.
- User-flow guide: Not required — agent instructions are not an executable
  product/system journey and no existing guide behavior changes.
- User-flow E2E: Not required — no affected guide or mapped scenario.

## Milestones

- [x] M1 — Exploration and design
    - Objective: compare the proposed upstream skills with Languon's existing
      instructions and define non-conflicting local responsibilities.
    - Components: upstream skill sources, root `AGENTS.md`, existing local
      skills, ADR index, agentic development guide.
    - Acceptance criteria: AC-2, AC-3, AC-4.
    - Required tests: source and policy inspection.
    - Evidence: six skills selected; conflicts and required adaptations recorded
      in `FEATURE.md` and Decisions below.
- [x] M2 — Implement local skills and documentation
    - Objective: create six concise skill packages and provenance documentation.
    - Components: `.agents/skills/**`, `docs/agent-skills.md`,
      `docs/agentic-development.md`, `README.md`.
    - Acceptance criteria: AC-1 through AC-4.
    - Required tests: skill validation and focused content inspection.
    - Evidence: six `quick_validate.py` passes, the repository package validator
      and its nine tests, six isolated forward tests, full Prettier and lint
      passes, and provenance/license documentation recorded in `EVIDENCE.md`.
- [x] M3 — Full validation and review
    - Objective: run affected static checks, forward-test representative skills,
      perform independent review, remediate findings, and finalize evidence.
    - Components: final diff and feature artifacts.
    - Acceptance criteria: AC-5.
    - Required tests: validator, formatting, lint, independent reviewer.
    - Evidence: final Prettier, lint, guide, agent-skill, and diff checks passed;
      independent remediation review approved with no remaining findings.

## Progress

- 2026-08-16 — Classified as feature-sized because it adds six reusable agent
  capabilities. Created `feature/local-agent-skills` and the feature workspace.
- 2026-08-16 — Inspected existing Languon skills, agent documentation, ADR
  policy, and the upstream repository at commit `068b6e0`. Next: initialize and
  implement the six local skill packages.
- 2026-08-16 — Added six local skill packages, Codex UI metadata, and
  `docs/agent-skills.md`; linked the guide from developer documentation.
- 2026-08-16 — All skill validators and isolated forward tests passed. Remediated
  ambiguities found in forward tests, then reran validation, formatting, lint,
  and user-flow documentation checks. Next: independent review.
- 2026-08-16 — Independent review found one lifecycle conflict and one metadata
  evidence gap. Aligned `codebase-design` with root correction/feature routing
  and added `pnpm agent-skills:check` with nine validator regression tests. Next:
  review the remediation and rerun final gates.
- 2026-08-16 — Final gates passed and independent remediation review approved
  both fixes with no remaining material findings. Feature implementation is
  complete; next action is the required local squash merge into `main`.
- 2026-08-16 — Squash merge into `main` completed after post-merge formatting,
  skill-package, lint, user-flow documentation, and diff checks passed.

## Decisions

- D1 — Local adaptations instead of package installation
    - Context: the upstream collection contains valuable techniques alongside
      workflows that duplicate or conflict with Languon policy.
    - Choice and rationale: create reviewed, repository-owned skills containing
      only the applicable techniques, and document their provenance.
    - Alternatives rejected: installing the complete collection or depending on
      mutable upstream files at runtime.
    - ADR impact: not ADR-worthy; this is repository agent tooling.
- D2 — Preserve Languon authority
    - Context: upstream skills include their own ADR, Git, issue, branch, commit,
      testing, and documentation conventions.
    - Choice and rationale: every adapted skill defers lifecycle and verification
      decisions to root/closest instructions and established local skills.
    - Alternatives rejected: creating a parallel delivery workflow.
    - ADR impact: not ADR-worthy; it follows existing repository policy.
- D3 — Explicit exploratory invocation
    - Context: prototypes and architecture surveys can create artifacts or explore
      alternatives outside an active implementation.
    - Choice and rationale: make both skills explicit-invocation only and keep
      their outputs temporary or inside active feature state.
    - Alternatives rejected: implicit invocation during routine changes.
    - ADR impact: not ADR-worthy.

## Discoveries

- The upstream stable catalog contains 25 engineering/productivity skills, but
  only six fill Languon-specific gaps. Installing all would duplicate the local
  correction, feature, testing, review, and durable-state workflows.
- The upstream MIT license requires preservation of its copyright and license
  notice when substantial portions are adapted.

## Validation

| Check              | Status         | Evidence                                  |
| ------------------ | -------------- | ----------------------------------------- |
| Unit               | Not applicable | No executable application logic           |
| Integration        | Not applicable | No runtime integration                    |
| Contract           | Passed         | Official and repository validators pass   |
| E2E                | Not applicable | No executable application journey         |
| Browser/device     | Not applicable | No rendered application surface           |
| Typecheck          | Not applicable | Markdown/YAML only                        |
| Lint               | Passed         | `pnpm lint`                               |
| Build              | Not applicable | No build inputs changed                   |
| Database migration | Not applicable |                                           |
| User-flow guide    | Not applicable | No changed guide; repository check passed |
| User-flow E2E      | Not applicable | No affected guide or scenario             |
| Independent review | Passed         | Final remediation review approved         |
| Security review    | Not applicable | No material security surface change       |

## Remaining work

- None.
