# Evidence: Model price actualization

Status: Complete
Date: 2026-10-28
Base: main 625d5a6.
Final implementation/test/registry hash:
`d55c8317377f2a5837ac61115a824a021bb44cdcccc3a3560dfcb17e426c1acf`.

Hash covers 16 changed/new backend and registry/script files, sorted by path,
concatenating path + NUL + file bytes + NUL. Documentation/artifacts are excluded.
Pre-pagination tested hash was
`fe332483e9c4a093ea005faa3841b2197e199c184b2e8807aa9969d12c3addd6`.

## Verification

- E1 — `pnpm --filter @languon/backend exec vitest run src/modules/admin-mcp/application src/modules/ai-credits/infrastructure/pricing tests/unit/modules/admin-mcp tests/unit/infrastructure/admin-mcp-price-targets.test.ts`:11 files / 96 tests passed. Includes exact decimals, upstream validation/network bounds, auth snapshots, failures, cancellation, scheduled versions, catalog discovery and 101-model continuation.
- E2 — `pnpm --filter @languon/backend typecheck`: passed after both review repairs.
- E3 — Affected backend source/test and registry-script ESLint/Prettier passed. Final changed coordinator, its unit test, MCP server and HTTP journey were linted after pagination; the unchanged source adapter passed after SEC-057-1. Final artifact/new-guide/new-ADR formatting and clean diff checked.
- E4 — `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check model-price-actualization`, `pnpm user-flow:e2e -- check admin-mcp`, `pnpm critical-flows:check`: passed. 16 validator tests / 31 guides and 13 registry entries. New guide revision `sha256:c0b6266ee2dfaeb1`; existing admin MCP marker unchanged.
- E5 — Public read-only metadata smoke through actual `createProviderPriceSources()` via `node --import tsx --input-type=module`: Qwen 0.065/0.26 USD/M tokens and ElevenLabs 0.04 USD/1k characters returned available. Repeated successfully after SEC-057-1. No authentication, generation, publication or financial mutation. A first CJS `tsx -e` attempt failed package export resolution; ESM invocation corrected it. This proves only point-in-time metadata compatibility.
- E6 — `pnpm test:e2e:critical`: original complete gate passed 13/13 groups,445 tests, no skips/retries/failures at the pre-pagination hash. Report: `test-results/critical-flows/81925787-c137-4043-996c-8833410138f7/summary.json`. Source/financial/parser security repairs were included. Retain valid evidence for the 11 unchanged groups after pagination.
- E7 — `pnpm --filter @languon/backend build`: passed after both review repairs, including the standalone MCP entry. Log: `/tmp/languon-price-actualization-build-final.log`.
- E8 — `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://price057:price057_test_only@127.0.0.1:55458/languon_auth_price057_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_price057_test pnpm --filter @languon/backend exec vitest run tests/integration/database/model-price-actualization.journeys.test.ts`: final 4/4 real HTTP/disposable PostgreSQL cases passed. Fake only external metadata. Covers publication/replay, immutable pinned history, stale/expired previews, authority/revocation, scheduled rates and 51-model continuation.
- E9 — `pnpm test:e2e:critical -- --flow ai-execution-contracts --flow admin-mcp`: final affected rerun passed backend 424 tests and MCP 2 browser journeys, no skips/retries/failures. Report: `test-results/critical-flows/165133df-c1f8-4bc5-a9e3-bfee8b7fea84/summary.json`. Includes the final 4-case pricing journey and production admission/claim/settlement composition. Log: `/tmp/languon-price-actualization-critical-remediation.log`.

## Acceptance mapping

| Criterion | Implementation                                               | Proof                     |
| --------- | ------------------------------------------------------------ | ------------------------- |
| AC-1      | Catalog target discovery and bounded continuation            | E1,E8,E9; CR-057-1 review |
| AC-2      | Source port/registry and strict OpenRouter adapter           | E1,E5; SEC-057-1 review   |
| AC-3      | New MCP action snapshots and existing preview/apply          | E1,E8,E9                  |
| AC-4      | Failure isolation, scheduling preservation and safe unknowns | E1,E8,E9                  |
| AC-5      | Exact units, decimal comparison and immutable publications   | E1,E8,E9                  |
| AC-6      | Guide, required checks and independent/security reviews      | E2–E4,E6–E9; REVIEW.md    |

## Evidence validity and corrections

Pagination changed only the new coordinator/schema, MCP descriptor, tests and
guide. Source adapters, existing authentication/accounting/publication semantics
and other 11 UI journeys did not change. Retain E6 for those unchanged groups;
E9 re-executes both affected groups at the final hash. Static/build checks and
review remediation also bind the final patch. All 13 groups therefore have valid
passing evidence; E9 is a scoped rerun rather than a second full-gate claim.

The first focused HTTP attempt failed 3 tests because the test client called
response.json on an SSE envelope. Reused existing SSE/JSON parsing; focused3/3
then final pagination4/4 passed. No runtime change was needed for that correction.
Security SEC-057-1 added 18 regressions; CR-057-1 added101/51-model proof. Independent
reviews accepted both fixes. Separate tester not needed: existing infrastructure
and harness reused; reviewer assessed coverage and no unresolved concurrency exists.

## Official source findings

- [OpenRouter schema](https://openrouter.ai/docs/api/api-reference/models/get-models.md) and [all-modality catalog](https://openrouter.ai/api/v1/models?output_modalities=all): exact IDs and decimal prices; verify endpoint uniformity and reject conditional/additive incompatible charges.
- [OpenRouter TTS docs](https://openrouter.ai/docs/guides/overview/multimodal/tts.md): documented ElevenLabs character meter; speech modality alone does not establish billing units.
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) and [models API](https://api-docs.deepseek.com/api/list-models): no documented machine pricing verified; HTML peak/off-peak rules. No initial adapter.
- [Kie speech](https://kie.ai/gemini-3.8-flash-lite-tts) and [API docs](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts.md): token/audio-token billing incompatible with character records; no compatible public machine source verified.
- [EvoLink Luna rules](https://api.evolink.ai/v1/catalog/models/gpt-6-luna/pricing-rules?view=full): conditional tiers/component minima incompatible with flat records.

## Preflight, cleanup and limits

No secrets, conflicts, generated output or unrelated work remain. Gate-owned
containers were cleaned and generated Next declarations restored automatically.
Focused containers 63b156aa… and 7f57f31a… were verified against feature labels/full
IDs before removal with anonymous volumes. Existing app services/data were not
changed. No migration or application UI change; retained real MCP browser proof
covers issuance, discovery and revocation. No matching backlog task was selected.

No paid generation, dev price publication, production activation, customer-tariff
change, scheduler or automatic credential replacement occurred. Compatible new
models reuse provider sources; new providers require reviewed adapters. Tiered or
unknown rates stay unchanged. Existing listeners need restart and a new pricing-write
token to discover the new action. Keep catalog configuration stable across pages.

Rollback removes tool/source composition and issuance action; preserve published
history and correct rates through explicit new revisions. All required verification
and independent/security review is complete; no undocumented material risk remains.
