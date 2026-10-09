# Improvement: Efficient agent code search

Status: Complete
Created: 2026-10-09
Updated: 2026-10-09

## Routing decision

Developer-tooling improvement: a pinned development-only AST search CLI and a
repository skill, with concise root routing. No product journey, runtime dependency,
API, persistence, infrastructure or architectural commitment changes. Current
branch; no commit authority for this request.

## Scope and decisions

Use text search for literal/path discovery, LSP for symbol identity/references and
AST search for syntax patterns. Select by question; do not run all three every time.
Serena TypeScript tools are available in this session and actual definition/reference
queries succeeded. Do not install another LSP server or assume every agent has Serena.
Ripgrep is absent in this shell: document scoped grep/find fallback rather than
introducing another dependency. LSP indexes and AST patterns cannot prove complete
runtime reachability. Mandatory source-of-truth and verification rules stay intact.

Use improvement-development, writing-for-agents, skill-creator and testing guidance.
No relevant accepted ADR establishes a search tool contract. No user-flow guide
behavior changes, backlog task, browser or database surface applies.

Rollback: remove the skill/root routing, README entries and CLI scripts; remove
@ast-grep/cli using pnpm to update the lockfile.

## Acceptance criteria

- AC-1: Workspace-pinned AST CLI supports read-only TS/TSX structural search.
- AC-2: Discoverable skill/root instructions route literal, symbol and structural
  questions, scope output, explain fallback/limitations and keep writes authorized.
- AC-3: Executed examples and regression checks prove syntax matching excludes
  comments/strings and handles multiline syntax, JSX and missing matches.

## Plan

- [x] Install and pin CLI; add commands and targeted regression checks.
- [x] Add efficient-code-search skill and concise root routing/documentation.
- [x] Validate packaging, commands and actual semantic search.
- [x] Review scoped instruction decisions and final diff; record evidence.

## Verification and outcome

Final patch based on d0f9e6340262496ddeef5e71bb5c199ef13042c7; Node 24.8.0,
pnpm 10.13.1, macOS. Installed @ast-grep/cli 0.45.3 with pnpm (lockfile generated,
not hand-edited). Reviewed its postinstall: only links/copies already installed
platform binaries locally. Added it to onlyBuiltDependencies and ran
`pnpm rebuild @ast-grep/cli`; no global install or new MCP config. Ignored local
.pnpm-store cache output to keep dependency binaries out of Git.

- AC-1/AC-3: `pnpm test:code-search` — 4/4 pass: multiline calls, comment/string
  exclusion, source unchanged, JSX attributes/children, named imports, no-match
  vs unsupported-language failure. Added this command to root `pnpm test`.
- AC-2: `pnpm agent-skills:check` — 10 validator tests and all 19 skills pass.
- Skill creator validation: `/private/tmp/languon-code-search-validation/bin/python
/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py
.agents/skills/efficient-code-search` — valid. Used a disposable PyYAML virtualenv
  because system Python lacked yaml; no repository Python dependency added.
- All three final skill CLI examples executed against actual source successfully.
  Initial quoted import metavariable did not match; corrected to `from $MODULE`
  and verified with a multiline fixture and real contracts source.
- `pnpm exec eslint scripts/code-search.test.mjs` and affected Prettier checks pass;
  `git diff --check` passes. No application source changes, so app build/browser,
  database and product E2E are not applicable. No user-flow behavior changed.
- Independent fresh-context reviewer code_search_review applied the skill to a
  realistic search and reviewed all scoped instructions/tooling. No material
  findings. Definition: learning-api.ts:36; direct callers: dictionary-training.tsx:153
  and training-launcher.tsx:82; export index.ts:7; neighboring flashcard API tests.
  Reviewer verified the corrected import example and semantic references.

Documentation: root AGENTS routing, README command index and agent-skills reference.
Restart Codex to load the new skill automatically; it can be explicitly invoked as
$efficient-code-search. No measured token/time improvement claimed: executed command
and decision probes establish functionality, not comparative efficiency.

## Tested source identity

- `AGENTS.md`: `6e0d24612cc7402e124b76f960bafc1a6667d7394a024a2b636d28f43b50ea5e`
- `package.json`: `b6db596c04ed5dfab8691a48caab1b635e2221ca875b508ee056e90937fb12ab`
- `pnpm-workspace.yaml`: `6378ae34026d95bcffb6223726db6d6e15e089d91595d165b83970bcba6674bc`
- `pnpm-lock.yaml`: `fac661d6d4c6700fe1a812dbc1ae5fbae904d3c5a7fc3e16a2760f09ac28bb79`
- `scripts/code-search.test.mjs`: `2c1f039385d026d80c1d6fc66674b34afacec31f5906afbedbbdb0e55e51a0b5`
- `.agents/skills/efficient-code-search/SKILL.md`: `f01bf5a6fcbbba03bdd33b976de90b949385dca627a928b5e6c1041694cd6c6e`
- `.agents/skills/efficient-code-search/agents/openai.yaml`: `3dc17b194c2d0f600dffa9ad2f17d4641d308b3e98b1c4a5012c697b334e56a0`

## Remaining risks

LSP availability depends on agent environment. No semantic results must fall back
to scoped text/AST search, not be interpreted as absence of callers.
