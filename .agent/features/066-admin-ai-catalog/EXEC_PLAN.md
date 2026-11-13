# ExecPlan: Read-only admin AI catalog

## Goal and current architecture

Implement FEATURE.md on feature/admin-ai-catalog from main208f3847. Current prompts package owns17local templates; production factories contain static instructions and operation-bound tools across tutor, dictionaries, texts, Knowledge, sentences, portrait, admin probe and development harness. Admin uses Ant Design/Refine and existing active-owner guard.

## Decisions and interfaces

- GET /api/admin/ai-catalog returns {entries:summary[]}; GET /api/admin/ai-catalog/:kind/:id returns {entry:detail}. kind agent/tool/prompt; exact schemas in @languon/contracts. No mutation route or execution endpoint.
- Canonical descriptors are shared by runtime factories and catalog composition; catalog imports descriptors, never instantiates operation-bound SDK objects. AST registration guard prevents new Agent/createTool omissions; generic frontend renders new metadata.
- Summaries contain id/kind/name/description/module/scope/references. Details provide exact static instruction fragments, prompt source/content or JSON Schemas, plus limitations. Scope distinguishes app/development/template-only. JSON Schema cannot fully represent runtime refinements; limitations remain explicit.
- Catalog server returns detached validated metadata, not mutable shared objects or request context. Existing admin auth/error policy remains authoritative.
- Approved-pattern UI extension; source design brief complete, real rendered critique required. Admin no-Storybook exception uses isolated presentational fixtures/tests.

## Verification plan (before final integration)

Risk: canonical extraction can affect many agent/tool factories despite metadata-only intent. Reuse canonical descriptors, preserve execute bodies and test focused parity, prompts and factory behavior. Root owns shared compilers; workers own narrow suites. Selected unit/contracts/frontend tests seconds–1minute; contracts/prompts builds10–20s; backend/admin typecheck+build roughly3–6minutes with declarations. Auth/read-only routes need denial/not-found/invalid cases. Browser/E2E uses isolated existing admin fixture/auth and no paid calls. Register/map new admin journey and guide, run selected case only; no justification for unrelated financial/provider execution or full regressions. Browser desktop+narrow plus empty/error/relationships. Security review covers metadata exposure, auth and safe schema/text rendering. Baseline knowledge-actions configuration doctor passed; final read-only doctor records readiness separately, no provider call required.

## Ownership and milestones

- [x] Discovery: authorized feature, branch, source design direction and contract.
- [x] Canonical definitions and backend registry (ai_catalog_backend owns packages/prompts/contracts and backend definition files).
- [x] Protected HTTP routes/composition + route tests (ai_catalog_http).
- [x] Admin generic screen/API/tests (ai_catalog_frontend).
- [x] Guide/E2E/extension docs, browser/static/build and preflight (root, delegated bounded verification).
- [x] Independent review/remediation/final evidence and local squash integration.

Root owns durable records and integration; no overlapping edits. No paid model/tool/workflow call is authorized by catalog inspection. Preserve unrelated edits; no branch push/deletion requested.

## Evidence and next step

See EVIDENCE.md and REVIEW.md. Baseline/final doctor, current graph checks, real admin journey, rendered critique and independent completion/security approvals passed. All selected gates are complete.

Resume checkpoint2026-11-13: git remains feature/admin-ai-catalog; interrupted process handles no longer existed, so checks were rerun on current sources. Contracts/prompts full builds, backendtypecheck, admin typecheck+productionbuild pass. Admin exactOptionalPropertyTypes class props and hook fixture discriminant narrowing corrected; initial shareddeclaration race avoided by rebuilding packages before rerun. Current root catalog+HTTP38tests andfrontend6tests pass. Existing factory59/prompt6 preflight retained; independentreviews and realadminjourney progressing. Dedicated DockerPG55449/Redis56399 contain only disposable admin catalog fixtures; ordinary5432/6379 remain untouched. Updated browser skill allows maintained Playwright evidence with screenshots/accessibility/console/network coverage; use that and rendereddesignercritique rather than duplicate browserexecution.

## Completion — 2026-11-13

Canonical registry, protected HTTP and generic admin screen complete. Contracts/prompts/backend/admin typecheck/build gates pass;104 focused tests pass (38 catalog/HTTP,52 existing factory/tool,6 prompt,8 admin). Registered authenticated Playwright journey passes1/1 in16.5s on final content-first UI, with actual isolated PostgreSQL/Redis, exact prompt bytes, schema disclosure, scope/search/empty/reset/relations, keyboard/no-overflow and no unexpected console/network/mutation/model calls. Independent completion/security and rendered designer reviews approve. Final source and evidence links in EVIDENCE/REVIEW.

Test failures were diagnosed rather than bypassed: AntD readonly selection overlay/virtual accessibility nodes required real keyboard opening plus visible option selection; screenshots now wait for settled Drawer geometry using the actual ancestor wrapper. Prior overlapping runners were stopped before controlled retries. Unresponsive orphaned Next and reused authentication rate namespaces were retired by restarting only owned test servers; no rate limit or auth invariant weakened. Final harness owns/cleans its processes. Only blank-line lint fixes follow final runtime proof. Generated Next environment churn restored; labeled disposable containers removed, ordinary local services/data untouched.

AI regression selection: canonical descriptor extraction changes no prompts, model/provider configuration, execute callbacks, budgets, leases, deadlines, cancellation or settlement. Prompt equality, factory/source tool regressions and metadata/auth tests cover those seams; no reason to replay unrelated financial/provider suites or spend on live models. The new readonly catalog is not a new learning/accounting critical path; its registered focused admin journey supplies repeatable traceability without expanding unrelated critical release suites.

User-flow guide/index, generic extension reference and developer link current. No new dependencies, migrations or strategic ADR required: canonical metadata remains with established owning modules and normal REST/admin authorization. Final diff is scoped. Feature workflow authorizes local squash integration; no push or branch deletion requested. User acceptance retrospective follows acceptance, not technical handoff.
