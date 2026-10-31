# Improvement: Resolve historical formatting and reviewed catalog drift

Status: Complete
Created: 2026-11-01
Updated: 2026-11-01

## Scope and authority

User explicitly requested fixing the historical formatting and dev-panel failures
reported after BL-018. Improvement: existing formatter scope and reviewed command
metadata maintenance, following the repository web-dev-panel skill and ADR-0014/
inherited ADR-0013 constraints. No new execution API, argument input, security
policy, product capability or runtime dependency. Do not commit automatically.

Starting tree contains the complete uncommitted BL-018 patch; preserve it. Root
owns catalog/review evidence; worker `historical_format_scope` owns historical
formatting and `.prettierignore`. No candidate command was executed in discovery.
Command sources are root `package.json` only; no documentation commands added.
Panel README/user-flow/ADRs were read as governing context, not command sources.

## Acceptance and verification plan

- AC-1: Root formatting passes without modifying frozen provider exports, raw
  capture/probe inputs or evidence/source-hash manifests. Editable Markdown may
  change layout only, retaining words, metadata and fenced content.
- AC-2: Catalog accounts for all 86 root scripts exactly once with current
  revisions and meaningful descriptions. Changed scripts transition disabled
  before trust refresh; only reviewed safe fixed local checks/tests become runnable.
- AC-3: Live/paid, privileged, environment-writing, parameterized or infrastructure-
  owning commands stay disabled with concrete reasons. No executable/argv/cwd or
  browser request contract changes; retain symmetric conflicts and existing entries.
- AC-4: Passing catalog/formatter checks, panel unit/native integration tests,
  existing synthetic Playwright journeys and a bounded actual-catalog rendered
  observation. Use browser-verification's pinned wrapper; never start actual
  catalog commands merely to verify their cards. Independent security/source and
  evidence review covers newly runnable catalog metadata.

Selected checks before catalog changes: `pnpm format:check` (~35s),
`pnpm web-dev-panel:check` (<2s), `pnpm --filter @languon/web-dev-panel test` (~15s),
`pnpm --filter @languon/web-dev-panel test:e2e` (~30s), root lint (~25s),
user-flow inspect/check and affected docs validation. Runtime source/types/builds/
the 15-flow regression from BL-018 remain valid if their inputs are unchanged;
this task changes only formatter exclusions, Markdown layout and catalog data.
No additional full application suite is justified for those unchanged consumers.

## Historical formatter evidence

Worker classified the 272 remaining warnings: 236 frozen source/evidence/capture
files are now narrowly excluded; 36 editable Markdown files are formatted.
All 881 protected file hashes remain unchanged. Markdown structure, fenced content
and parsed YAML metadata are equivalent. No broad `.agent/**` exclusion; active
records remain checked. Initial full `pnpm format:check` passes.

Reports: `/tmp/languon-historical-format-report.json`,
`/tmp/languon-historical-markdown-ast-report.json`,
`/tmp/languon-historical-frozen-before.json` (manifest SHA-256
`f6da89f4289c9a1ddd3881ac4761988e82b389cc4a7f8b8c7448fc77761e314e`).

## Catalog review decisions

Root package values for all 15 drift issues were read verbatim before revision
refresh. Existing decisions are retained except the reviewed deployment-test
tightening and reciprocal build-output conflicts. Final reviewed decisions:

- Enable reviewed fixed local validation/tests: check:setup-docs,
  critical-flows:check, dev:doctor, test:ai-smoke-tooling, test:critical-tooling,
  test:persistence-readability, test:readability. Aggregates/building test groups
  run individually; short read-only checks may remain batch eligible.
- Keep ai:smoke disabled: live execution needs explicit journey/budget authorization.
- Keep dev:admin-mcp disabled: privileged delegated administration/terminal transport.
- Keep dev:configure disabled: parameterized local configuration writes.
- Keep test:e2e:critical disabled: owns Docker infrastructure and cleanup.
- Keep test:e2e:learner-portrait and changed test:e2e:ai-provider-management disabled:
  operator-managed disposable infrastructure and environment confirmations.
- Keep check, test and direct test:release-deployment disabled: inherited deployment
  opt-in flags can activate Docker journeys and cleanup. Use a reviewed terminal.

These classifications authorize metadata reconciliation, not running candidate
commands during discovery. `dev:doctor` was inspected: bounded read-only local
transaction, no generation/configuration/charges; errors are sanitized. The safe
AI smoke tooling suite is distinct from the live smoke command.

The heavy aggregates/building suites (check, test, AI-smoke tooling,
critical tooling) are non-batch commands and declare symmetric conflicts with
each other and existing build/typecheck/coverage/dev:all commands. Only reciprocal
conflict fields change on those four otherwise unchanged entries; this prevents
the shared package-output races observed during BL-018, without a new scheduler.

Catalog updater reports 86 package scripts, zero missing sources and zero
documentation command entries. `pnpm web-dev-panel:check` passes. No updater or
execution implementation changed; manual metadata follows generated revisions.

Security review found SEC-CAT-01 (Medium): the initial check/test enablement did
not account for inherited LANGUON_DEPLOY_E2E/LANGUON_DEPLOY_DB_E2E flags activating
deployment suites before Turbo isolation. Remediated by keeping both aggregates
and the directly exposed deployment-test command disabled. Descriptions explain
this behavior. Terminal verification confirmed those opt-ins inactive without
printing environment values. No environment filtering or new safe aggregate was
introduced. Reviewer approved the remediation with no material findings.

Existing test:coverage remains eligible under independently verified Turbo strict
environment mode: selected task nodes have no configured/inferred/passthrough
allowlists, so DB/Redis/playground/performance opt-ins do not reach Vitest. Changing
Turbo to loose mode or adding passthrough variables requires a new catalog safety
review; root script hashes alone do not capture that transitive policy assumption.

## Progress and remaining work

Historical scope, catalog reconciliation and source/security remediation complete.
Independent final evidence review approved. Rollback restores this task's exclusions/Markdown/catalog delta only,
preserving the preceding BL-018 source patch and its recorded evidence.

## Verification results

- `pnpm format:check`: passes after the worker slice; final aggregate also passes.
- `pnpm web-dev-panel:check`: 86 reviewed entries, passes after reconciliation and
  again after security remediation. All root IDs unique/current, conflicts symmetric.
- Panel unit/native HTTP/process tests: 80/80, no skips, 5.47s.
- Existing synthetic Playwright journeys: 4/4, 10.7s. They execute only fixture
  commands; real services/formatting/AI/admin/deployment commands were not launched.
- Full `pnpm check`: exit 0, log `/tmp/languon-maintenance-check.log`. Includes
  formatting, docs/skills/styles/catalog, lint, types, tooling/workspace tests and
  all nine production build tasks. Generated Next declaration preserved/restored.
- Pinned safe-browser session
  `languon-catalog-review-f50e8aba2c4b6c2a9d46c88007b3b7a0`: real panel server and
  actual final catalog on isolated localhost:4412, empty child environment, synthetic
  launch credential. Inspected safe readability card (Idle), live AI smoke and
  aggregate check (Disabled with linked Why unavailable text). No Start was clicked.
  Network shows only GET assets/events, no execution POST; errors/console empty.
  Viewports 1440x1000 and 390x844; long warning wraps within the mobile card.
  Screenshots inspected:
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1793486460116.png`
  and `screenshot-1793486539384.png` in the same directory. Session and owned
  inspection server closed cleanly; unrelated panel/processes untouched.
  Tool/browser identity: agent-browser 0.33.0 and Google Chrome for Testing
  151.0.7922.34 (Playwright revision 1234).
- Existing web-dev-panel guide behavior, scenario IDs and revision remain
  unchanged: dynamic reviewed-card presentation and fixed command guards already
  describe this metadata change. No documentation command sources were added.

## Final review and outcome

Reviewer `catalog_safety_review` approves source, SEC-CAT-01 remediation and final
evidence with no material findings. All 881 frozen hashes remain unchanged; the
36-doc AST report has zero mismatches, unchanged fences and equivalent YAML.
Relative to the BL-018 source freeze, only `.prettierignore` and catalog data differ;
no application/test/runtime source drift. Existing BL-018 evidence is retained.

Final catalog SHA-256:
`211c979ca78e13df5fc2b1189239473fa0c4bbf8f3eb1140bde09853214b3559`.
Both formerly failing gates and aggregate `pnpm check` now pass. No pending scoped
implementation or verification remains. Future Turbo environment-mode/passthrough
changes still require reviewing the conditional coverage-command decision above.
Final checks also pass: full `pnpm format:check`, catalog validation, 89 local
documentation links and diff hygiene. All 881 protected hashes remain unchanged.
No commits, command starts through the panel, deployment or live AI calls occurred.
