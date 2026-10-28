# Review: Model price actualization

Status: Complete
Verdict: Passed after remediation
Boundary: base main 625d5a6 plus complete scoped Feature 057 patch.
Final code/test/registry hash:
`d55c8317377f2a5837ac61115a824a021bb44cdcccc3a3560dfcb17e426c1acf`.

## Independent reviews

The initial completion reviewer inspected the full tracked/untracked patch after
author preflight, including acceptance criteria, DDD boundaries, price semantics,
failures, cancellation, auth/action snapshots, stale/replay behavior, catalog growth,
guide traceability and test adequacy. One material finding was remediated and
independently reviewed in focused scope. Separate security review and focused
remediation reviews covered external metadata, financial integrity and pagination.

| ID        | Severity and location                                                                                   | Problem and impact                                                                                                                | Fix and verification                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-057-1 | Medium; `openrouter-price-source.ts` normalizedRates                                                    | Recognized web_search/image/audio/input_audio_cache charges were ignored when nonzero, potentially understating provider expense. | Require absent/null/exact zero. Forty adapter tests include 18 new regressions across catalog/endpoint and text/speech. Independent reproduction now returns unsupported.                  |
| CR-057-1  | Medium; `admin-mcp-price-actualization-service.ts` initial discovery107–114, tool description and guide | Default discovery rejected catalogs above 50, contradicting refresh-all and future-growth requirements.                           | Add offset/nextOffset/totalModels continuation with per-call bound50. Unit 101-model3-page and real HTTP 51-model2-page tests prove complete unique coverage and no automatic publication. |

Both findings are resolved. No other material correctness, architecture, security
or acceptance issues were found. Focused pagination review confirms every page
retains permission/action checks, reauthentication, transaction checks, deadlines,
rate/concurrency limits, audit, expiry and no automatic publication. Offset cannot
expand a request beyond 50 targets or select outside the configured catalog.

## Evidence acceptance and final closure

Reviewers accepted the recorded hash-bound unit, HTTP/DB, static/build, docs and
original 13-group critical evidence rather than duplicating it. Their only final
verification caveat was the in-progress affected rerun; it subsequently passed:
backend 424 tests and MCP 2 browser journeys. The runner restored generated
`apps/web/next-env.d.ts`; final diff excludes it. No required evidence remains missing.

A separate tester was unnecessary: existing infrastructure is reused, no new
harness or unresolved concurrency/cross-application behavior was introduced, and
the independent reviewer assessed the substantial source/HTTP proof directly.

## Residual limitations

Official schema/TLS/DNS integrity remains external. Pricing is not invoice
reconciliation. Initial support covers compatible OpenRouter rates; unknown
providers need reviewed adapters and incompatible rates remain manual. Catalog
or credential changes between offset pages can shift ordering; the guide requires
stable configuration and restarting at 0 after changes. Such changes cannot bypass
authority or publish automatically. No unresolved material finding remains.
