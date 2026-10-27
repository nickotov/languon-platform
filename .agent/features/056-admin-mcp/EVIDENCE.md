# Evidence: Delegated local admin MCP

Status: Complete; final execution and independent reviews passed.
Base: main7667925; branch feature/admin-mcp. Results below identify the working
patch and final affected-state checks, not HEAD alone. No paid provider calls.

## Acceptance-to-proof mapping

| Acceptance | Implementation and evidence                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1       | Local HTTP command/config, Host/Origin/query/body/rate controls, real SDK tests EV-1; actual clients EV-5; full gate EV-6                   |
| AC-2       | Token service/browser authorization and hash-only lifecycle; real owner/revocation DB tests EV-2; browser EV-4                              |
| AC-3       | Frozen action snapshots, finite limits and no credential tools; EV-1/2/3                                                                    |
| AC-4       | Preview/receipt transactions, fresh expiry/version checks and exact replay; EV-2/3/4                                                        |
| AC-5       | Application check service, atomic token/operator budget adapter, dispatch fence; EV-1/3, real probe expense reference                       |
| AC-6       | Pure inspection, indexed bounded financial reads and snapshots, current-day coverage; EV-3                                                  |
| AC-7       | Existing publication/ledger participants behind application port; no bootstrap on read/preview, stale/prerequisite failures; EV-3/4/6       |
| AC-8       | Success/rejection/read/preview/expense audit, safe context, purge and prune; EV-1/2/3/4                                                     |
| AC-9       | In-admin guides, default/custom ports and all three actual clients; EV-4/5                                                                  |
| AC-10      | Unit/PG/SDK/browser/client checks, shared-file lock tests and independent tester/security/completion review; final gate/static checks below |

## Executed checks

### EV-1 — Unit, SDK and application policy

`pnpm --filter @languon/backend exec vitest run tests/unit/modules/admin-mcp src/modules/admin-mcp/application/admin-mcp-credential-service.test.ts tests/unit/modules/text-ai/text-ai-probe-service.test.ts`

56 passed after the application seam. Covers protocol/authentication boundaries,
production gating, frozen permissions, input validation, exact limits/status,
replay/no extra dispatch, dispatch callbacks, settlement/expense links and safe
read/write/check audits. The test-only facade fixture correction passed its final real PostgreSQL run
and backend typecheck; unit behavior is unchanged. Check-service lower-cap tests
propagate USD0.005 as5000micros to the actual probe reserve/executor port.

### EV-2 — Credential/preview/purge PostgreSQL

`pnpm --filter @languon/backend exec vitest run src/modules/admin-mcp/application/admin-mcp-credential-service.test.ts src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-store.integration.test.ts`

18 passed (7unit/11realPG) after migration0112, including owner/revoke, hash-only
secrets, frozen action expansion, atomic quotas, conservative unknown expense,
UTC reset, safe owner audit, purge, exact replay, stale/expired previews, lock-wait
expiry and callback-crosses-expiry rollback. Real SDK/Hono user lookup proves
stable-UID access audit without email/secret. Final facade fixture rerun passed all 18 tests at 19:59:50.

Target: explicitly disposable languon_auth_mcp_test, loopback55439. Clean forward
migrations0110–0112; no destructive rollback supplied. Existing migration history
preserved. No normal development DB touched.

### EV-3 — Administrative and operator transactions

`pnpm --filter @languon/backend exec vitest run tests/integration/database/admin-mcp-operations.test.ts`

12 passed through AdminMcpAdministrationService and its infrastructure adapter
(17.76s). Proves exact grant replay/non-revenue accounting, failed revoke rollback,
stale mutations, finite user budgets preserving preferences, flow-tariff-only
publication, pure inspection/preview/initial Apply, required explicit checks,
shared operator exhaustion, one dispatch/revocation/purge settlement, and two
concurrent previews completing with a two-connection pool. Additional focused
conflict/report/application units20passed. Existing probe integration also proves
the audit expense lookup matches the authoritative ai_provider_expense_records ID.

### EV-4 — Real browser/MCP journeys

`node scripts/run-admin-mcp-e2e.mjs` with guarded disposable PostgreSQL55439,
Redis56389, app ports3101/4100/3433 and MCP3102.

Final wrapper run:2/2passed26.9s. Token creation/one-time secret, scoped discovery,
all three guides at custom3999 then reset3002,375px wrapping/no page overflow,
revocation/HTTP denial, audit and bounded credit preview/apply/replay. No unexpected
browser errors. All owned app services stopped afterward.

Test SHA256 cf10fc339a923a9a4aaf4e9e628162e977ee059f752ff94a4ab61bc90e6871df.
Guide revision20fac70f70af7e5e. Safe inspected screenshots:
/tmp/languon-admin-mcp-e2e-evidence/mcp-desktop.png and mcp-narrow.png.
No token secrets in traces/video/automatic screenshots. Canonical next-env pre/post
SHA256 identical:0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc.

Shared preservation helper subsequently gained atomic locking. Combined command
`node --test scripts/run-contextual-assistant-e2e.test.mjs scripts/critical-flows/registry.test.mjs`
passed19/19, including contention and success/failure cleanup. Final gate exercises
that lock with the same production wrapper helper.

### EV-5 — Actual supported clients

See [CLIENT_VERIFICATION.md](CLIENT_VERIFICATION.md): actual Codex0.163.0,
Claude Code2.1.310 and OpenCode1.18.35 connected to isolated3103 with synthetic
credential/blank provider keys. Codex direct admin_connection_test also passed.
Final rerun after allowedActions/0112 recorded source hashes. Subsequent application
facade does not change authentication/initialization/connection-test wire contracts;
real SDK/PG and browser checks establish the new composition. No model turns.

### EV-6 — Full critical gate

`pnpm test:e2e:critical` passed all13registered journeys on the first complete run:
419 backend execution cases +22browser tests, no skips. Evidence directory
`test-results/critical-flows/848af9e9-1e2b-4491-a801-1cdcf3986f66`.

Final full rerun after all remediations/shared locking passed all 13 journeys:
420 backend checks and 22 browser tests (442 total), no skips. Log:
/tmp/languon-admin-mcp-critical-delivery.log, evidence directory
`test-results/critical-flows/7dfaa19b-fefd-4066-a08a-0a00fff39df8`.
Exit status 0. Canonical Next declaration restored to the EV-4 SHA256; no
preservation lock remains. The post-gate helper/registry rerun passed 19/19.

### EV-7 — Static, builds and documentation

Admin: final typecheck passed;13focused UI/capability tests passed; production build
passed with only existing chunk-size warning. MCP navigation/routes are excluded
from production. Backend build passed after application extraction. Final backend typecheck passed after updating the SDK fixture to the application
facade. Affected ESLint passed for all 86 changed source files. The final audit
unit rerun passed three tests after a type-import lint correction.
Docs validators passed 16 tests/30 guides; final admin-mcp mapping and the
13-flow registry passed after the canonical-runner update.

## Retained failures and remedies

- First browser run caught actor.userId instead of AdminActor.id; fixed with route
  regression. Narrow375px check caught14px tag overflow; wrapped without hiding content.
- Concurrent tests/contracts builds produced stale metadata/type failures; final
  checks serialized after contract build. Old service-fixture test types are being
  updated for the new application seam.
- First full gate collided with a still-running isolated Next test output directory.
  Retried only after those services stopped. Shared preservation now atomically
  locks before snapshot and rejects concurrent wrappers; no existing user service
  was stopped. Automatic review rejected stopping insufficiently identified duplicate
  typechecks, so no termination occurred.
- Review found legacy lazy tariff initialization on inspection/preview. Replaced
  with pure reads and explicit Apply; real PG regression retains this discovery.

## Final patch verification

Final affected formatting passed for 106 files, ESLint passed for 86 source files,
and backend/admin typechecks and builds passed. Final fixture PG rerun passed
18/18; final audit unit rerun passed 3/3. The helper/registry test rerun required
loopback permission and ran only after the critical gate released its lock.
An earlier parallel helper attempt was correctly rejected by that lock; its
port test was also sandbox-denied. Neither failure was treated as a passing test.

The sorted SHA256 manifest of the 86 changed TypeScript/TSX/MJS files (excluding
the unchanged generated Next declaration) hashes to:
`6411ca16eb90ffe588ceea74db39a791fd147d0260691a91f6a24229a36589a5`.
Manifest retained locally at `/tmp/languon-admin-mcp-source-manifest.sha256`.
Independent reviews report no material findings; see REVIEW.md.

Residual limits: local development only; provider cancellation is best-effort
once dispatched and uncertain expense remains conservatively reserved. Remote
access and paid provider smoke checks are not part of this delivery.
