# Capacity follow-up independent correctness review

Date: 2026-10-16
Mode: initial bounded completion review of AC-11/M7 follow-up; existing AC-01–AC-10 implementation is reused, not re-reviewed.
Baseline: `15eaeb990b90e03e78a880d3060d70b038265fcc`; branch `feature/texts-capacity`, uncommitted tracked and untracked patch.

Verdict: **Approved: no material correctness findings in the reviewed implementation.** Final verification and bounded timeout delta are closed below. This review does not attest to a live paid provider call.

## Scope and assessment

Read root/backend/package instructions, code-review/testing/efficient-code-search skills, active feature/plan/evidence, ADR-0026/0035/0036, current Texts guide revision `bdc681a38302df8b`, complete scoped implementation/test/config diffs and surrounding admission, worker, resolver, accounting and UI failure paths. Scoped textual search was adequate for explicit interfaces/string registrations; no semantic tooling was required to establish these paths.

- Admission pins exact Flash translation v2 limits (128000/32768) into the persisted execution snapshot. Dictionary/base and legacy route limits remain 64000/8192. Trusted resolution rejects altered/unreviewed limit combinations and forwards the pinned caps into the actual adapter.
- Same-operation replay precedes current model selection/preflight and retains old job identities. Format v2 is translation-only; migration expands the CHECK without rewriting stored snapshots. Claims/recovery filter supported formats, preventing a v1-only worker from processing v2. Compatible workers retain v1 support.
- The existing 262144/40960 aggregate accounting ceilings and max-cost policies are unchanged; larger per-call caps do not bypass reservation, usage validation, settlement, retry or lease fencing. Historical rates remain snapshot-resolved rather than compared with mutable current rates.
- Preflight uses the actual serialized output skeleton rather than the previous fixed per-pair charge, retains conservative UTF-8 request/output estimates and rejects genuine overflow before reservation/provider dispatch at admission. This remains an estimate and does not guarantee tokenizer fit or translation size. The typed HTTP 400 capacity failure reaches the existing capacity recovery UI.
- Production SDK serialization is exercised by the added synthetic HTTP test (actual adapter/agent, no paid endpoint): `deepseek-flash`, `max_tokens:32768`, `reasoning_effort:none`, no tools. Length termination rejects output; worker domain validation still requires full ordered stable-ID coverage before exposing a proposal.
- Tests cover realistic French-to-Russian article admission, larger profile, overlarge framing, truncation, resolver tampering, rollout/readiness, v1 replay/claim compatibility and fresh/upgrade database migration. The browser regression exercises real auth/API/admission/credits/jobs/proposal save/reload with deterministic AI; it does not establish live translation quality. Existing browser UI journeys remain present.

## Evidence and remaining boundaries

Reviewed test bodies and root-reported successful focused provider (9), shared/profile/readiness, real PostgreSQL migration/store (12), contracts (100), API (5) and browser (3) runs. Did not duplicate those valid executions. Independently ran `git diff --check` successfully. Root owns final full-backend rerun after stale catalog-count expectations, affected static/build checks and durable evidence capture.

No production source edits or external calls performed. Only this review artifact is written. Current default/preference changes, credentials, running worker restart and any operator transaction are outside this review and must be separately verified against their final concrete action. Production activation still requires migration and compatible workers before admission. Source limit remains 20000 Unicode code points and is not a model-fit guarantee.

## Reviewed source identity

Manifest SHA-256: `fd87850e309f19ea49cfe7cab6a93d312ec044f4c6ca94385d858d7c71e36560`.
Includes all changed backend production/test/migration files, contracts, SDK-wire/profile tests, fixture/browser regression, config, capacity ADR and guide present at capture. Excludes concurrently maintained delivery records and generated web `next-env.d.ts` (root final hygiene responsibility).

```text
7904715f273cfb1951eeba06c73707c84295322ab3478fc4d88bc086ddf33144  .env.example
48e89ed45abac107cf009550048f7352bfb0367bd496848633e143901f08ef2a  apps/backend/drizzle/0068_bent_mentallo.sql
e271b1370d8312a3f5f1ad9a9aaa4fac4422629b0500f1572d2dd328d2cf0226  apps/backend/drizzle/meta/0068_snapshot.json
19531fe177cb88238f9dda5c5ea2de492844df93d67d8ad1096762aa6a8b4da1  apps/backend/drizzle/meta/_journal.json
4c1c6d4d7e881354eed0268a702a11c05f288d4ded3a7aab3fc6d70e31d6cb2c  apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
7eb0830f9664b2a00517b583fbcd40b90353770d4daaea116f73594f7e136f7f  apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
370a9548d7ca8968d8da722bd00485af0636be8e600cb602d86afa482e5beb57  apps/backend/src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog.ts
0d880d031b3b4546590d6b4cfe4585282bcb24b0ff891e10de40975f1f709ff5  apps/backend/src/modules/text-ai/infrastructure/ai/text-ai-provider-resolver.ts
813fa807f007f14b204c9ba99b2e9fb9cf77d4d8f1d2aec3bf4309ba1f20e911  apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts
93bad7af85a487eb2a79eaf719e73351000b49b309c2665a6dcde3b7c4899d1a  apps/backend/src/modules/text-ai/infrastructure/text-ai-composition.ts
a4f9c32315b1075dc77e34ba05f24afe8699fe730ec830af2214bedaa6f20ee7  apps/backend/src/modules/texts/application/ports/texts-job-store.ts
155720eae291b4851b5631bfee47a7290a4e9d8f99289ff73222aabacef1d07b  apps/backend/src/modules/texts/application/texts-worker-service.ts
74d2f9bdef7bfd3cd4c692233b10e0f3e72a2fd7c37f69c0307791428c77640b  apps/backend/src/modules/texts/infrastructure/ai/texts-ai-provider.ts
6770c8c300a1353bc3a320d842368606b9fea833ea250cc784843abc194ce020  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/drizzle-texts-job-store.ts
434e4e6970e4b11a9868662c5cf17159b8494864c994668f89718a90c79c1ebc  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema.ts
6e9227c4e7f6f4c57dfe1a8f245dcac44334a87d3964074014c3ed3f1e4b8839  apps/backend/src/modules/texts/interface/http/texts-job.routes.ts
36ea8917d397ffd01391756a8c25a78ef4efd7acb955b92ec34d31784a63f01a  apps/backend/tests/integration/modules/texts/texts-job-store.test.ts
c819428f30b2be311650ad549af74d6a621e1c138cdbff24213a56a6d4416733  apps/backend/tests/integration/modules/texts/texts-migrations.test.ts
4eec6ea6bfe4339b63ff9fb4afbec165e5b8ab1c7140cf747ee4aa4e9be86137  apps/backend/tests/integration/modules/texts/texts.journeys.test.ts
85737922d07f17af8f991eccd0404d7d56c314df6c683c0bc20b19e012c6962b  apps/backend/tests/support/texts-web-server.ts
2ec8770ee2d951ce83c51d5f3cac688b9f2b471f52d769c7c96f5a177908b2d9  apps/backend/tests/unit/modules/text-ai/infrastructure/text-ai-execution-profile.test.ts
bcf62c311f464b5d42185f3c1e2d82c93b5be7faf22a1a95c9d5428233654ff7  apps/backend/tests/unit/modules/text-ai/infrastructure/text-ai-worker-observations.test.ts
63b025cdb68ef1dfacb0cb467658f16840b0bdd31741fa492017560de0d86025  apps/backend/tests/unit/modules/text-ai/infrastructure/texts-admission-gate.test.ts
05a198a106ab547a1a03f1c82d624fd9ba727342ce99962457c0fcae04a9f9de  apps/backend/tests/unit/modules/texts/texts-provider-wire.test.ts
f47768f8c1284fde21781e47d5bb29a52ea7e1c5e2e37703f724944ee97e951a  apps/backend/tests/unit/modules/texts/texts-provider.test.ts
1251f9a5f73c1e71d4d869986c312bee48989b2f4e9c3d473ac0694611fb37ce  apps/web/tests/e2e/texts.journeys.spec.ts
5be3c002bdb713b6a86d6a64f2d5792b77cb877735f0880881cbb0cbb4b04f34  docs/adr/0036-task-specific-text-translation-capacity.md
974275516f1e57c00f6fea4330ec0899f82c97995c55b25a0051b2dbcb0cc780  docs/user-flows/texts.md
4aaef1bc2e73d55f588655c684e40a121d9904ef6a8987216de05dd1ff1463a1  packages/contracts/src/texts/index.ts
```

## Final bounded closure — 2026-10-16

Reviewed the sole production delta after the initial manifest: Texts worker timeout increases from20000ms to180000ms at the CLI composition. Dictionary/sentence timeouts remain unchanged. The deadline still uses AbortSignal.timeout;30000ms leases renew every10000ms, heartbeat cancellation/lost ownership aborts processing, bounded concurrency/retries and late-result fencing remain intact. No material finding. Updated worker SHA256: `01224748cd445598fffbd9a2124b49e57af8cbaa3db0bd5809f15b1cc27237b1`. Other changes since the initial capture were checked against the manifest and require no expanded implementation review.

Root reports final backend116files/956tests, contracts100, scoped lint, backend/web types, backendESM/DTS and production web builds, guide22/validator16 and current revision mapping passing; current API5/browser3 including long French-to-Russian100-pair proposal/save/reload passing. Separate security review approved the concrete local operator transaction preserving custom rates, queued snapshots, historical revisions and other users' preferences. Root reports migration0068 applied and Flash v2 worker/API readiness observed. Operator actions remain covered by that separate review, rather than being inferred from this source review.

Independently executed `pnpm --filter @languon/backend test tests/unit/modules/texts/texts-worker.test.ts`:1file/9tests passed,909ms, including bounded timeout for abort-ignoring provider and heartbeat cancellation. No open correctness defect or verification condition remains in this bounded review; root owns final formatter/Git handoff hygiene.

## Documentation and final evidence acknowledgement

Reviewed final README Flash example and guide/ADR rollout clarification: all shared AI workers must recognize Flash before shared-default activation, and pre-Flash rollback drains all Flash jobs including dictionary/learning work. This correctly documents the curated-model compatibility floor; no production implementation delta or full-review restart is required. Guide markers now use `3bd497f7f68d42fa`; comment-only marker edits do not invalidate runtime journey evidence. Root additionally reports focused worker2files/13tests passing in2.78s and final types/lint/build green. Approval stands with no open finding.
