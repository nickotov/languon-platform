# ExecPlan: Frontend Development Standards

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-14

## Goal

Make Languon's frontend implementation conventions discoverable to agents and
automatically enforce the import relationships that static analysis can prove.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `apps/web` and `apps/admin` already follow pages-first FSD under `src/fsd` with
  `app -> pages -> widgets -> features -> entities -> shared` documented in their
  closest `AGENTS.md` files and `docs/architecture.md`.
- Next.js route files use the `@/*` TypeScript alias. Valid app composition may
  import lower layers directly; internal relative imports stay inside a slice.
- Root flat ESLint configuration uses ESLint 10 and TypeScript ESLint but had no
  architectural import plugin.
- Prettier, full repository validation, skill metadata conventions, and feature
  review workflows already exist.
- No accepted ADR previously governed frontend component anatomy or state
  communication. ADR-0005 records this durable cross-feature rule.

## Acceptance criteria

- [x] AC-1 — Skill covers component and slice anatomy.
- [x] AC-2 — Skill covers state, context, stores, and typed events.
- [x] AC-3 — ESLint enforces web/admin FSD direction and aliases.
- [x] AC-4 — Focused boundary regression tests pass.
- [x] AC-5 — Durable docs, full validation, skill validation, and review pass.

## Test strategy

- Unit: Required — ESLint API tests exercise allowed and rejected import graphs.
- Integration: Required — run ESLint against the real repository/configuration.
- Contract: Not required — no public runtime contract changes.
- E2E: Not required unless user-flow guide content changes; no product behavior.
- Browser/device: Not required — no rendered code changes.
- Database migration: Not required — no persistence changes.
- User-flow guide: Not required; inspect the mapped authentication guide because
  its source paths include root package and web files.
- User-flow E2E: Inspect/check `user-authentication`; behavioral execution is not
  required when its guide revision and test-relevant content remain unchanged.
- Skill: Run the skill-creator validator and a clean-context forward test.

## Milestones

- [x] M1 — Exploration and design
    - Objective: Reconcile the requested conventions with existing FSD and select
      compatible enforcement tooling.
    - Components: AGENTS, architecture, ADR index, ESLint, imports, skill patterns.
    - Acceptance criteria: AC-1 through AC-4 design established.
    - Required tests: Source/tooling inspection and compatibility metadata.
    - Evidence: Current boundaries 7.2.0 supports ESLint 10; the TypeScript
      resolver supports repository aliases; existing import directions were
      inventoried.
- [x] M2 — Skill, architecture, and lint implementation
    - Objective: Implement the standards and automatic boundary enforcement.
    - Components: Skill, ADR/docs/AGENTS, ESLint, dependencies, focused tests.
    - Acceptance criteria: AC-1 through AC-4.
    - Required tests: Skill validation, focused boundary tests, real repository lint.
    - Evidence: Skill validator, clean-context forward test, 9 focused probes,
      real repository lint, lock validation, guide/docs validation, and mapping
      checks pass.
- [x] M3 — Full validation and independent review
    - Objective: Prove the toolchain and documentation integrate cleanly.
    - Components: Complete diff and feature artifacts.
    - Acceptance criteria: AC-5.
    - Required tests: Format, docs, lint, typecheck, tests, build, guide mapping,
      forward test, independent review.
    - Evidence: Final `pnpm check`, 9/9 focused probes, skill validation,
      clean-context forward testing, user-flow mapping checks, and independent
      re-review passed.

## Progress

- 2026-08-14 — Classified as a feature, created the feature branch/artifacts,
  read applicable skills and architecture, and selected stable
  `eslint-plugin-boundaries` with the TypeScript alias resolver.
- 2026-08-14 — Added FSD dependency rules and nine passing ESLint API probes for
  downward, upward, sibling, app-composition, Next framework files,
  cross-application imports, unsupported layers, and unclassified sources.
- 2026-08-14 — Drafted the project skill, ADR-0005, architecture updates, and
  frontend agent routing.
- 2026-08-14 — Skill validation, clean-context forward testing, lock validation,
  boundary probes, real lint, documentation validation, and authentication
  mapping inspect/check pass. Next: run the full gate and review independently.
- 2026-08-14 — `pnpm check` passed format, docs, lint, typecheck, tests, and all
  seven workspace builds. Restored the user's generated `next-env.d.ts` changes
  after Next rewrote them. Next: independent review and delivery.
- 2026-08-14 — Remediated review findings by adopting the current v7 policy API,
  capturing application identity, rejecting unclassified source locations, and
  covering root and `src` Next framework files. Final re-review was clean.

## Decisions

- D-1 — Use current `eslint-plugin-boundaries` 7.2.
    - Context: FSD needs enforceable element relationships under ESLint 10 flat
      config and `@/*` TypeScript aliases.
    - Choice and rationale: Use the stable plugin plus
      `eslint-import-resolver-typescript`; it models folder elements and resolves
      aliases without a custom checker.
    - Alternatives rejected: Documentation-only enforcement and a custom plugin.
    - ADR impact: Accepted ADR-0005.
- D-2 — Enforce layer and slice direction, not mandatory barrels everywhere.
    - Context: Existing guidance requires public entry points once a slice gains
      multiple modules, while one-file page slices currently use direct imports.
    - Choice and rationale: Treat each slice folder as an element. Internal imports
      remain valid; same-layer sibling imports and upward imports fail. Skill/review
      enforce conditional public APIs.
    - Alternatives rejected: Mandatory indexes for every one-file slice and no
      sibling-slice enforcement.
    - ADR impact: Accepted ADR-0005.
- D-3 — Do not pre-create optional frontend abstractions.
    - Context: The user requires typed event infrastructure and stories when those
      capabilities are used, but the current feature adds no events or shared UI.
    - Choice and rationale: Encode the required placement/shape in the skill and
      create the bus/Storybook only with the first real consumer.
    - Alternatives rejected: Committing unused runtime code and tooling.
    - ADR impact: Accepted ADR-0005.

## Discoveries

- `eslint-plugin-boundaries` resolves TypeScript path mappings only when the
  TypeScript import resolver is installed and configured.
- An initial 5.4 compatibility choice was replaced with current 7.2 after a
  freshness check. The final configuration uses the canonical
  `boundaries/dependencies` policy API rather than deprecated legacy rules.
- Enabling `boundaries/no-unknown` classifies local workspace packages such as
  `@languon/contracts` as unknown local elements. The rule is intentionally
  omitted; `dependencies` and `no-unknown-files` enforce FSD source structure
  without interfering with workspace package boundaries. Internal segment names
  remain a skill/review concern because the plugin classifies slices and layers,
  not every allowed folder inside a slice.
- The skill initializer's first sandboxed write was denied for the protected
  `.agents` directory and succeeded with approved repository-scoped access. Its
  generated prompt lost `$frontend` to shell expansion and was corrected.

## Validation

| Check              | Status         | Evidence                      |
| ------------------ | -------------- | ----------------------------- |
| Unit               | Passed         | 9 FSD boundary probes         |
| Integration        | Passed         | Real repository lint          |
| Contract           | Not applicable | No runtime contract           |
| E2E                | Not applicable | No product behavior           |
| Browser/device     | Not applicable | No rendered changes           |
| Typecheck          | Passed         | `pnpm check`                  |
| Lint               | Passed         | `pnpm lint`                   |
| Build              | Passed         | 7/7 workspace builds          |
| Database migration | Not applicable | No persistence changes        |
| User-flow guide    | Passed         | Docs check; no content change |
| User-flow E2E      | Passed         | Mapping synchronized          |
| Skill validation   | Passed         | Validator and forward test    |
| Independent review | Passed         | Clean after remediation       |
| Security review    | Not applicable | No material security surface  |

## Remaining work

- None. Squash-deliver without the unrelated generated declarations.
