# Improvement: Critical workflow verification and repeatable local setup

Status: Complete
Created: 2026-10-24
Updated: 2026-10-24

## Routing decision

Approved developer-experience/testing improvement. The user approved the preceding
plan, requested extensibility for future important features, a commit of existing
work, implementation and actual execution/remediation. Existing work committed as
`0c378d8`. No new product capability, schema, production dependency, billing or
security policy is introduced. Local configuration uses existing admin contracts;
CI adds verification, not deployment topology. Escalate only for newly discovered
product changes outside this authorized tooling scope.

## Scope and constraints

Provide a read-only local doctor, reviewed setup profiles, a supported-admin-API
configuration command, an extensible critical Playwright registry/runner and CI
gate, plus setup and browser-verification skills/documentation. Preserve local
accounts/data/settings unless explicitly applying a selected profile. Never call
paid providers in tests; use synthetic identities and disposable infrastructure.
Do not restart the user's development services; task-owned test services only.

Reuse existing user-flow guides/tests and the safe browser wrapper. No production
endpoint or new authentication bypass. Provider credentials/tokens are never
printed. No blanket database resets or credit-grant duplication. Future critical
features register journeys, prerequisites and ownership; they use the same gate.

## Acceptance criteria

- AC1: Read-only doctor identifies enabled capability/worker format mismatches,
  missing effective provider/customer prices, budgets and model readiness, with
  actionable fixes; optional learner checks distinguish credit constraints.
- AC2: Validated deterministic-demo and DeepSeek local-testing profiles provide
  preview/apply through existing admin contracts, preserve unrelated data and are
  repeatable without duplicate revisions/grants. No generation is performed.
- AC3: Critical registry/runner covers auth/password/passkey/refresh, admin setup,
  dictionary and folderless text generation/persistence, chat reconnect/Stop/
  failure, free portrait, and insufficient-credit behavior. Real internal services,
  deterministic external adapters, isolated infrastructure, no skipped pass.
- AC4: An empty-database admin-setup-to-learner-generation journey proves required
  configuration can be published and used through real app surfaces.
- AC5: CI runs critical journeys; delivery rules require affected journeys and
  readiness/setup documentation, with clear registration steps for future features.
- AC6: Skills support repeatable setup and bounded Luna browser verification,
  distinguish exploratory evidence from Playwright regression coverage, and pass
  metadata and realistic independent decision evaluation.
- AC7: Run implemented tools and critical journeys, remediate failures, complete
  independent completion/security review and independent harness verification.

## Plan

- [x] Commit prior verified work and inspect existing testing/setup seams.
- [x] Implement doctor and profiles with focused safety/idempotence tests.
- [x] Implement critical runner, setup-to-generation journey and CI gate.
- [x] Update instructions, documentation and skills without duplicating policy.
- [x] Run disposable real-stack flows and remediate.
- [x] Independent review and final checks; record limitations accurately.

## Ownership

Root: integration, startup hook, commands, documentation/skills, records and final
verification. Workers: readiness_tools (doctor), setup_profiles (configuration),
critical_runner (registry/runner/CI), setup_journey (admin-to-learner browser test).
Independent tester required because this adds cross-application test orchestration;
security review required for local authenticated configuration/secrets handling.

## Verification

All eight registered flows passed (13 unique browser cases across the per-flow
reports below), with fresh owned PostgreSQL/Redis, actual apps/workers and
deterministic external providers. Earlier failed attempts remain recorded.
The setup dependency was also rerun with the final text selector. Final independent
review and all three affected application typechecks passed.

## Rollback

Remove the new tooling/CI gate and instruction links; no data migration or product
rollback is needed. Configuration publication follows existing immutable revisions;
undo via supported admin publication, never deleting financial history.

## Implementation and verification checkpoint

- Added `dev:doctor`, `dev:configure`, `test:e2e:critical`,
  `critical-flows:check`, `check:setup-docs`, and `test:critical-tooling` commands.
  `dev:all` runs nonblocking configuration and bounded runtime checks. Standalone
  doctor uses an authoritative env file; startup explicitly uses the actual child
  environment. Shared production catalog/readiness predicates avoid stale copies.
- Profiles are validated against public schemas. Apply binds the direct backend
  origin to an explicit local env/database, active administrator, release and
  current revisions before/after every mutation. Preview does not write. Optional
  synthetic learner grants are once-only and use management versions.
- Registry8 entries declare minimum test counts, runtime prerequisites and
  dependencies; targeted text verification includes independent empty-start
  setup/folderless coverage. Only approved scenario flags can enter a clean test
  environment. Each flow gets new owned Docker resources and artifact directory.
- CI requires registry/profile checks and critical browser execution before images.
  New skills and docs explain extension for future critical features. Luna decision
  probe correctly refused staging-forwarded localhost mutations and did not treat
  skipped login as passing evidence; this was a read-only probe, not a browser run.
- Real setup run `test-results/critical-flows/5d267e61-0e1c-45e3-a347-55b0f3b8b095`
  passed1/1: empty database/admin UI calibration, learner paid folderless detection
  and translation, save/reload, measured exact settlement/provider expenses,
  doctor blocked→ready and two actual CLI applications without duplicate revisions
  or grants. No real provider call. Final dependency-expanded setup also passed at `test-results/critical-flows/8e5e5073-d42e-45fd-a976-a2709121ca3e`, followed by both text scenarios.
- Prior critical run `test-results/critical-flows/4b98b72b` passed auth3/3,
  admin expiry3/3 and dictionary1/1. Text tests failed and were retained; fixes
  restore missing real model-preference routes/accounting fixture and update a
  source-evidenced stale button-label expectation. Final text/browser run passed2/2 at `test-results/critical-flows/8e5e5073-d42e-45fd-a976-a2709121ca3e`. Chat lifecycle now passes1/1 at `test-results/critical-flows/8da37fc9-d4b8-4134-ae98-90c3c8a49fc0`: reconnect without duplicate generation, Stop retaining partial text, failed hold released with unknown measurement and zero charge, successful retry measured and charged.
- Focused `pnpm test:critical-tooling` passed44/44 with host loopback/process access.
  Sandbox-only first port-binding test failed EPERM; host rerun passed without
  changing the assertion. Startup12, readiness11, CLI2, setup10, runner9 all passed.
- Admin/web/backend typechecks passed; scoped tooling ESLint, profile doc drift,
  registry validation and skill-validator checks passed. `quick_validate.py`
  needed PyYAML in a temporary uv environment; no project dependency was added.
  Repository skill checks validate26 packages; user-flow checks validate28 guides.

## Discovered defects and review

- Real zero-credit paid interview returned500 before reservation because allowance
  calculation's insufficient-credit exception bypassed the existing mapping.
  Minimal adapter fix maps it to existing400 `credits_exhausted`; four actual HTTP
  integration cases (absent wallet, zero and two insufficient amounts) failed500
  before, passed400 after and persisted no action/operation/reservation. Isolated
  PostgreSQL55489/Redis56489 resources cleaned. Browser confirmation passed: paid zero-credit work returns400 with a visible error and preserved answer.
- New setup harness defects fixed: modal initialization race, same-origin learner
  API proxy, CLI direct-backend origin vs `/api` proxy mismatch, and conflicting
  Playwright/tsx loaders (doctor proof now executes actual CLI subprocess).
- SEC-SETUP-1 medium wrong-target mutation risk resolved with local/API binding;
  independent security remediation approved. Residual same-user malicious process
  or exact cloned database cannot be distinguished without a server identity
  contract; outside this local tooling scope.
- Independent tester's medium environment-override and targeted-folderless-coverage
  findings resolved by allowlisted flags/locked infrastructure and registry
  dependencies; remediation review passed.
- CRIT-RUNNER-1 medium interruption cleanup defect resolved: cleanup allowed after
  interrupted flag, lost Docker ID recovered only for exact requested full-UUID
  names with matching ownership label. Actual cleanup-path regression passes;
  independent remediation review approved. Completion review closed with no unresolved material findings.

## Final verification additions

- Paid zero-credit and free zero-credit portrait browser journeys passed1/1 each
  at `test-results/critical-flows/d61bed5e-c367-499b-88ec-6ce130f0d1bd`.
- Documented pnpm argument forwarding exposed an extra leading `--` that direct
  Node tests missed; all three CLIs now normalize it, with regression coverage.
  `pnpm test:e2e:critical -- --list` and both setup/doctor help commands passed.
- Tooling command now builds its contracts dependency through cached Turbo, so
  the standalone test command also works before a full workspace build.
- Chat fixture normal happy path explicitly funds its long source prompt; tests
  retain dedicated insufficient-credit coverage. Stale layout assertion now checks
  viewport containment and usable composer; failed usage assertions match the
  current released-hold/unknown-measurement semantics. Completion reviewer approved.
- Scope limits: deterministic tests do not prove live provider availability or
  model quality. Doctor checks prerequisites, not provider connectivity, consumed
  quotas or circuit state. CI configuration was verified locally, not executed on
  GitHub. The Luna skill probe was read-only reasoning, not browser execution.
  No user development database/settings were modified or normal services restarted.

## Completion

All AC1–AC7 are satisfied. Independent completion, security and harness reviews
closed with no unresolved material findings. Final backend/web/admin typechecks,
scoped ESLint/Prettier, diff checks, 44 tooling tests, registry/profile validation
and affected guide mappings pass. Runtime evidence is aggregated across focused
runs, not one final combined invocation. Chat Stop covers cancellation and retained
partial output with unknown usage; measured partial-token charging is not established
by that fixture. No owned test containers remain; Next generated declarations were
automatically restored. No source changes followed the final successful flows
except guide prose/revision markers, formatting and this completion record.

The final implementation commit contains this record and the verified patch;
browser reports remain under the ignored `test-results/critical-flows/` paths above.
