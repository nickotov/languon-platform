# Correction: Streamline root agent instructions

Status: Complete
Created: 2026-08-14
Updated: 2026-08-14

## Routing decision

- Intended outcome: reduce root `AGENTS.md` from 487 lines to a concise policy
  and routing document while preserving every material engineering safeguard.
- Why this is a correction: this reorganizes existing repository workflow
  guidance without changing application behavior, architecture, public
  contracts, data, security policy, dependencies, deployment, or product intent.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true; the detailed procedures already live in existing repository
  skills and documentation.
- Escalation rule: switch to feature development before continuing if the work
  begins changing CI/Git automation, security policy, or any other root
  correction condition.

## Context and scope

- Current behavior: root `AGENTS.md` is 487 lines and repeats detailed feature,
  correction, testing, user-flow, review, and verification procedures already
  maintained in skills or dedicated documentation.
- Expected behavior: root instructions retain authoritative constraints,
  correction-versus-feature routing, escalation, ADR/Git policy, and concise
  completion rules; detailed procedures are linked to their owning skill or doc.
- In scope: `AGENTS.md` and this correction record. Update a delegated skill or
  documentation file only if inspection proves a removed rule has no durable
  owner.
- Out of scope: weakening required validation, changing workflow semantics,
  application changes, CI enforcement, or adding a documentation generator.
- Likely files/surfaces: `AGENTS.md`, `.agents/skills/*`, `.agent/PLANS.md`, and
  `docs/{agentic-development,user-flows,adr}` as referenced owners.
- Relevant ADRs or constraints: no ADR is required; this is an editorial
  consolidation of existing agent workflow policy.
- Related user-flow guides: none; no application command or executable journey
  changes.

## Plan

- [x] Inventory root sections and their existing skill/document owners.
- [x] Rewrite root instructions around policy, routing, and mandatory safeguards.
- [x] Verify removed procedural detail remains discoverable from explicit links.
- [x] Confirm key safety/classification/Git rules remain and line count is
      materially reduced.
- [x] Run formatting and diff checks, perform a focused semantic review, and
      record results below.

## Verification

| Check                    | Result                                            |
| ------------------------ | ------------------------------------------------- |
| Tests                    | Policy assertions and five skill validators pass  |
| Lint/typecheck/build     | Formatting passes; application gates not required |
| Runtime/browser/database | Not required; workflow-document-only correction   |
| Documentation/user-flow  | No user-flow guide required; no journey changed   |

## Outcome and evidence

- Changes made: reduced root `AGENTS.md` from 487 to 276 lines (43%) by retaining
  authoritative policy/routing and delegating detailed procedures to their
  owning skills and docs. Updated testing, code-review, browser-verification,
  db-verification, and user-flow-e2e skills so they write evidence to the active
  correction document or feature artifacts instead of assuming every task is a
  feature.
- Commands and results:
  - `wc -l AGENTS.md` — 276 lines; target of at most 300 passed.
  - Official `quick_validate.py` via `uv run --with pyyaml` — all five modified
    skills passed; user-flow-e2e passed again after remediation.
  - focused critical-policy assertions and delegated-owner existence checks —
    passed. One bundled probe initially used a line-spanning regex and exited 1;
    nine isolated fixed-string assertions then passed, confirming it was a probe
    error rather than a missing policy.
  - `pnpm format:check` — passed before final review remediation and rerun for
    final handoff.
  - `git diff --check` — passed throughout and rerun for final handoff.
  - Application tests, lint, typecheck, build, browser, and database checks were
    not run because only Markdown/YAML agent workflow instructions changed.
- Documentation: root instructions link to `README.md`,
  `docs/agentic-development.md`, ADR/user-flow docs, `.agent/PLANS.md`, and the
  relevant repository skills. No application behavior, command, or user journey
  changed, so no `docs/user-flows` guide or E2E revision applies.
- Review: one read-only semantic comparison against `HEAD` found a strict-DoD
  ambiguity and several compressed handoff/threshold gaps. All were remediated.
  Final re-review returned `PASS` with no remaining material findings and
  confirmed ADR, classification, guide safety, verification/security, DoD, and
  Git policies remain materially preserved.

## Remaining risks

- Natural-language policy can still drift from delegated skills. The root keeps
  mandatory gates, explicit skill/doc owners, and a source-of-truth order; future
  changes should update both sides when artifact semantics change.
- Start a new Codex session before relying on the revised `AGENTS.md` and skill
  instructions being freshly loaded.
