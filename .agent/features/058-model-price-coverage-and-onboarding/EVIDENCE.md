# Evidence: Complete provider pricing and model onboarding

Status: Complete.
Base: `main` at `4c41c51`.

## Tested boundary and safety

Final reviewed scope: 158 changed/new files, excluding these four mutable delivery
records. Sorted relative path + NUL + file bytes + NUL SHA256:
`849cab6b5b7b9b303d677b06b1af4abefaef1a75286f79e8bddd7cb663f27d1d`.
Manifest: `/private/tmp/languon-native058-final-manifest.json`.

All generation uses real production SDK/composition against fake external HTTP and
owned disposable PostgreSQL. No paid generation, live activation, real price
publication, production data reset, credential change or customer tariff change
was performed. Official price research used read-only public primary sources.
Provider-reported usage is trusted adapter evidence, not invoice attestation.

## Acceptance evidence

| Criterion                       | Evidence                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1: all-provider coverage     | Four source adapters; all eight active catalog entries resolve in public metadata smoke. The retired Kie identity reports model-not-found without copying replacement rates. Source parsers: 36 tests. Research snapshots: `/private/tmp/languon-pricing058-research/research-summary.json`.                                                                      |
| AC-2: verify and actualize      | Real MCP SDK/HTTP/database journeys: 5 scenarios, including pagination beyond 50 entries, native publication/replay, immutable legacy pins and read-only verification without previews or price writes. Discovery/service/legacy HTTP authority focused run: 23 tests.                                                                                            |
| AC-3: issuance authority        | Old MCP actions cannot preview/apply native writes. A schema-valid native payload is rejected by the old HTTP flat writer before authorization/publish; flat publication still works. The HTTP body is capped at 64 KiB. Native source publication requires its exact issued action and fresh apply checks.                                                       |
| AC-4: faithful native bounds    | Native engine: 29 tests. Financial focused group: 18 tests (10 TS/SQL parity, 4 admission units, 4 production DB financial guards). Covers exact rational rounding, native currencies/minimums/tiers/schedules, incompatible meter rejection even when TS is bypassed, complete exclusive dispatch horizon, unknown overflow recovery and aggregate shape limits. |
| AC-5: real execution/accounting | Native text: 15 SDK/DB cases, including OpenRouter and DeepSeek/Evo Free/Paid success/failure. Native probes: 5 cases. Native speech: 9 cases plus 2 deployed-role cases. Dictionary production SDK/DB: 5 native/legacy cases. All are registered in the final critical backend stage.                                                                            |
| AC-6: onboarding                | Both onboarding and speech skills pass skill-creator quick validation; repository validator: 10 tests/27 skills. A fresh independent read-only onboarding behavior probe passes. Development and skill catalogs explain invocation, real-model research, defaults, consequential questions, exact native pricing and separate activation authority.               |
| AC-7: verified delivery         | All 13 critical groups / 607 cases validated, including 45 backend suites / 584 cases with zero failures, skips or retries. Independent completion and security reviews approve the final boundary.                                                                                                                                                               |

## Production-composition observations

- Actual SDK authorization issues a DB receipt; the transport awaits its immutable
  checkpoint before yielding completion. Missing aggregate SDK counters retain
  known monetary expense while customer token measurement stays unknown.
- Two near-full-envelope SDK calls reuse the observed remainder. Foreign/missing/
  duplicate receipts and altered checkpoints are rejected. A 200000-micro overrun
  remains fully recorded and denies the next dispatch before HTTP.
- DeepSeek/Evo matrix exercises distinct production adapters, native USD/UC rules,
  exact/unknown expense, persisted usable result, customer charge/refund and Free
  zero customer charge. It does not claim paid/live provider execution.
- Native probes retain the full actual overrun while failing. Forged above-cap
  amounts and foreign USD/credits are rejected; valid tariff-only evidence works.
- Speech role reprovision removes old direct observation grants. Forged session
  flags, direct UPDATE, null/wrong/expired leases and foreign USD fail. Valid Kie
  credits, identical replay, recovery/refunds and future spending denial pass.
- Native dictionary completion preserves 3000000000 micros of primary expense,
  leaves its obsolete flat secondary cost null, retains tokens 100/30 and produces
  a valid reviewable proposal. Four legacy SDK cases still pass.
- Reporting materializes a valid native snapshot with null legacy rates, 24-place
  rate precision and a 5000000000-micro expense. The existing cold-report 503 protocol
  is unchanged; browser fixture warmup polls only documented pending responses and
  requires 200 before visiting Accounting. Browser error assertions remain strict.

Focused execution logs:

- `/private/tmp/languon-native058-hook-final.log` — final native 15/15.
- `/private/tmp/languon-native058-family-execution.log` — provider matrix15/15.
- `/private/tmp/languon-native-dictionary-sdk-db-full.log` — dictionary 5/5.
- `/tmp/languon-native058-http-authority-final.log` — HTTP 4/4.
- `/tmp/languon-native058-postreview-mcp.log` — MCP/HTTP 23/23.

## Critical workflow proof

All 13 registered groups require actual execution with no failed, skipped, todo or
retried assertions. Unchanged passing browser groups are retained; native-only SQL
remediation and setup watchdog changes do not alter their legacy deterministic
pins or UI contracts. The final backend stage reruns every registered file and
required native scenario on the reviewed0116 migration chain.

| Groups                    | Evidence run                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First 10 browser journeys | `3fc0168f-2846-4c1a-a079-4c5ec9ed19ce` — every selected browser group passes. Its earlier failed backend result is not reused.                                                    |
| Speech playback           | `1db725ae-0208-4568-9263-aa8c28ca8a2f` — 3 browser cases pass.                                                                                                                    |
| Admin MCP                 | `82fb4d3a-2d35-46ba-9653-e0d2c0469865` — 3 browser cases pass, including native desktop/narrow dialog, readable row, read-only actions and zero browser console/network failures. |
| Complete backend          | `232935b2-194d-45a9-9e2a-58eab1283e5a` — 45 suites / 584 tests pass with no failures, skips or retries.                                                                           |

Reports/artifacts live under `test-results/critical-flows/<run>/`. Root inspected
both final native-pricing desktop/narrow screenshots. All retained raw reports
were validated again through the current exported registry assertions by
`/private/tmp/languon-native058-verify-critical-evidence.mjs`; report paths/hashes
are recorded in `/private/tmp/languon-native058-critical-proof.json`.
Proof manifest SHA256:
`e40b8ca40744ab88eb1f373f1c259abaaec79c31365678410033caf6010f6202`.
Final raw backend report SHA256:
`12eabce5d20c4d201864add0796c5e9b0d4e2250fe5361975729520b0d7cd9df`.
The final command exited 0; current registry assertions independently revalidated
all 13 untouched reports and 607 successful cases.

Earlier raw failures remain retained. Corrected assertion issues involved USD
six-decimal formatting, bigint return values and explicitly free native output
components. Host IO exposed default 10s migration-hook limits and one default 5s
functional test that runs six durable lifecycles. The runner now has a bounded 30s
setup hook; only that multi-cycle functional test has a 30s case watchdog. No
assertion, provider deadline, cancellation fence, global test-body timeout or
zero-retry requirement was relaxed. Independent reviewer approved both narrow
harness fixes; registry 15 and full critical-tooling 79 checks pass.

## Static, build and documentation checks

- Full repository lint passes after production remediation; final changed test/
  runner scoped lint and formatting pass. Final diff is checked for whitespace.
- Workspace typecheck:14 successful tasks; backend final source typecheck passes.
- Backend and admin builds pass after relevant runtime changes. Native row tests:
  4 pass, with native speech-token and legacy character/token rendering covered.
- Canonical copies of all7 financial SQL sources match migration0114. Drizzle
  consistency and migration classification through 0116 pass. Metadata SHA256:
  `0bc107bafb7c7beb4c04643635767ebf727fff1ffa0c04a08c844432d435b0a7`.
- User-flow validator:16 tests/32 guides. All three affected guide mappings pass;
  verification status is current and stable scenario/revision markers remain valid.
- Both skills quick-validate; repository skill validator passes10 tests/27 skills.

## Remaining execution prerequisites and baseline limitation

Kie Gemini native token pricing and consumed-credit accounting are supported.
Production dispatch remains blocked until a reviewed finite broker task bound is
available; upstream model limits alone do not prove it. Retired models never
inherit replacement prices. Evo public tariff calculation is not an invoice
attestation. New provider/model activation remains a separate authorized action.

Deploy matching API/workers after migrations through 0116 and issue fresh scoped
MCP pricing credentials. Old workers/credentials fail closed on native execution
and publication; no live deployment was performed here.

Supplementary `pnpm test:release-deployment` has one pre-existing account-purge
role grant regex failure. The failing test and SQL are byte-identical to base:
`infra/deploy/tests/production-security.test.mjs` SHA256
`ad111cc68243f72f74351765634c9537761b0d43294948c29b7202ac845f00ef`;
`infra/deploy/sql/account-purge-worker-role.sql` SHA256
`1935c6b2de8246612d9cb8bf871ad20864f2a6158f3e3cb714adceb3a20bdcdd`.
That unrelated assertion/authority was preserved and the suite is not reported green.

Owned focused PostgreSQL container was removed by exact ID after verifying its
feature label/name. Critical runners clean their own containers. Raw logs/reports
remain available; unrelated local services and user work were preserved.

## Final staged hygiene

The staged whitespace check found one extra EOF blank line in derived migration 0114. Its canonical copy generator was corrected and the migration regenerated;
all SQL statement bytes are identical after trimming terminal whitespace. Only
that newline and the migration-classification hash changed after the full gate.
Classification was revalidated and the independent reviewer checked this bounded
nonsemantic delta. The final source digest above includes the regenerated file;
the executed source digest before hygiene was
`62747c697031b91730eac28d2198ebb09ac4c6386ee292506f9a0aac92c0fc5d`.
No test result or generated execution report was modified.
