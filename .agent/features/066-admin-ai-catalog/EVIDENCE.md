# Evidence: Read-only admin AI catalog

## Source and acceptance

Base208f3847; branch feature/admin-ai-catalog. All AC1–8 completed within the limits below. No paid provider, agent or tool execution. Final combined source/test manifest below; documentation-only final status edits do not invalidate runtime results.

## Automated gates

- E1: baseline and final `pnpm dev:doctor -- --capability knowledge-actions --phase configuration` PASS2026-11-13. Read-only ordinary local configuration check, not connectivity/model-output proof. Catalog itself needs no model setup.
- E2: `pnpm --filter @languon/contracts build` and `pnpm --filter @languon/prompts build` PASS ESM/DTS. Backend `typecheck` PASS. Full backend production ESM/DTS build PASS (session90515, declaration205.6s). Final admin typecheck/build PASS (session91218); catalog lazy route9.27KB/3.22KB gzip. Existing shared500KB chunk advisory is unchanged and nonblocking.
- E3: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/administration/ai-catalog.test.ts tests/unit/modules/administration/interface/http/admin-ai-catalog.routes.test.ts tests/unit/modules/administration/interface/http/administration.routes.test.ts tests/unit/modules/administration/interface/http/admin-text-ai-probe.routes.test.ts` PASS38tests/4files. Covers canonical inventory/parity, relationships, detached results, extensibility, auth/session/membership denial, invalidkind/unknownID, response validation, no mutation methods and OpenAPI generation. Documentation-only JSON schema adapter resolves recursive z.json OpenAPI overflow; runtime parsing remains exact.
- E4: focused existing runtime factory/tool regression PASS52tests/7files: dictionary-card-generation-agent, development-harness-primitives, contextual-tutor-tools, dictionary-snippet-tools, tutor-history-tool, tutor-request-execution and tutor-playground-registration. No execute/model/budget code changed. Earlier worker59-test broader preflight is not counted as an additional final run.
- E5: prompt package tests PASS6/1file. Admin catalog tests PASS8/3files: safe literal/JSON rendering, absent versus empty schema, reading-order priority, distinct namespaced references, generic future entries and filters, lazy detail loading, cancellation/late results and explicit failed-read retry. Type inference/exact optional CSS props fixed without casts hiding runtime contracts.
- E6: final `ADMIN_E2E_DATABASE_URL=postgres://admin_e2e:local-only-admin-e2e@127.0.0.1:55449/languon_admin_ai_catalog_e2e_test ADMIN_E2E_REDIS_URL=redis://127.0.0.1:56399 pnpm --filter @languon/admin exec playwright test tests/e2e/admin-ai-catalog.journeys.spec.ts --reporter=line` PASS1/1 in16.5s, session73194. Real Hono/AntD/Next authentication prerequisites, PostgreSQL/Redis and reviewed membership CLI; no mocked backend/result. Verified non-member403, active owner, dynamic inventory counts, exact API/rendered prompt bytes, input/output JSON, notes, scope/search/empty/reset/related navigation, keyboard focus, no narrow HTML overflow. Page observer asserts no unexpected errors/failed requests, mutation or AI execution requests during catalog browsing. Baseline full journey also passed17s before final hierarchy refinement; final16.5s result supersedes its images.
- E7: all changed backend/admin/contracts/prompts TypeScript scoped ESLint PASS. Prettier/diff/link and mapped guide checks PASS; `pnpm docs:user-flows:check` covers16 validator tests and35 guide mappings. Subsequent lint fixes add blank lines only; no semantic change after E6.

## Rendered evidence

Maintained Playwright supplies ADR0016 real-browser proof, using final Chromium desktop1280×720 and narrow390×844. No redundant ad-hoc browser script/session. Viewport-only screenshot artifacts:

- [Initial prompt inspector](evidence/catalog-wide.png)
- [Expanded tool schemas](evidence/catalog-schemas.png)
- [Narrow prompt inspection](evidence/catalog-narrow.png)

Designer inspected final images and approved changed states: primary prompt/schema precedes secondary relationships, actual initial prompt text/Copy action visible, code wraps/scrolls within regions, development references distinct. Dark/transient loading/error visuals were not separately captured; existing theme tokens/shared error component and tested state wiring remain reviewed. Narrow screenshot is a focused/scrolled prompt state, not a claim of every narrow scroll position.

## Failures, cleanup and validity

Initial interrupted/overlapping runs are invalidated. Corrected real AntD option interaction and ancestor Drawer geometry waits; removed fixed inventory counts. Owned orphaned Next health and authentication-rate namespaces were replaced with a clean harness; no production guard or test expectation relaxed. Earlier screenshots caught animation/fullPage underlay and are replaced. Actual post-inspection console/network observer passes. Ordinary5432/6379 application data untouched. Task-only Docker containers labeled066 (PG55449/Redis56399) removed after proof. Tracked generated apps/web/next-env.d.ts restored exactly to base; no generated/runtime artifacts in feature diff beyond selected review screenshots.

## Acceptance mapping and limits

AC1 E3/E6; AC2 E3–6; AC3 E3/E5/E6; AC4 E3/E6 and security review; AC5 E3/E5 and extension guide; AC6 E2–4; AC7 E5/E6 and rendered critique; AC8 E1–7, mapped guide and independent final reviews. All critical/high/material security findings resolved.

Only checked-in app-authored definitions are shown. Request-resolved context/private prompts, credentials, remote prompt versions, execution/readiness and SDK-owned memory instructions are not materialized. Runtime Zod refinements may not translate to JSON Schema; unavailable/approximate boundaries are disclosed. Owner access intentionally permits copying static catalog content. No real model invocation/connectivity claim.

## Frozen implementation/test manifest

Combined path/content SHA-256: `7ed84f520f4fc2427cc8ab95bcf649694b0056bf768df41b48f89ff4ea860267` across 53 affected implementation/test/script files. Only evidence/document formatting and local integration follow.
