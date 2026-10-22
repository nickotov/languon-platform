# ACC-COMP-004: Redis admission remediation

Base: `d441863`, uncommitted feature patch. Date: 2026-10-22.

Text detection/translation and speech prepare/confirm now require a shared
application admission port before source resolution, store access, queueing or
financial admission. The infrastructure adapter uses the existing bounded Redis
rate limiter: ten requests per account, capability and sliding 60-second window.
This matches the existing dictionary generation burst ceiling. Subjects remain
HMAC-protected by the shared adapter; caller operation IDs cannot partition limits.
The four capability scopes are independent. Authentication and validated request
boundaries remain before admission. Ordinary status, playback, availability and
cancel methods do not consume these generation limits.

Redis outage fails closed (503), exhausted burst returns 429. Accepted request
replays consume the same limit and can receive 429/503; retrying later preserves
the original operation ID and existing durable store idempotency. No pre-limit
DB replay lookup was introduced. Existing real store coverage remains in
`texts.journeys.test.ts` (`translated`, identical operation returns identical job)
and `shared-speech-store.test.ts` (simultaneous identical confirmations reserve
once). Those full DB suites require the parent-coordinated final migration slot;
they were not rerun by this remediation worker.

API composition must inject `RedisGenerationBurstLimiter` built from the shared
product rate limiter (root owns `src/index.ts` wiring). Worker-only speech
composition injects `UnavailableGenerationBurstLimiter`: accidentally exposing
that unused service fails closed. Direct deterministic test fixtures explicitly
supply their test admission doubles; the web text fixture uses real Redis.
Speech routes forward the request abort signal (coordinated route owner).

## Executed checks

- `pnpm --filter @languon/backend exec vitest run tests/unit/modules/speech/speech-admission.test.ts tests/unit/modules/texts/texts-job-routes.test.ts` — 11/11 passed. Both speech operations authenticate before limiting; all four capabilities reject denial/outage before their resolver/store. Existing HTTP origin/authentication and credit error tests remain intact.
- `ALLOW_DISPOSABLE_REDIS_TESTS=true AUTH_TEST_REDIS_URL=redis://127.0.0.1:56381/4 AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56381/4 pnpm --filter @languon/backend exec vitest run tests/integration/modules/text-ai/redis-generation-admission.test.ts` — 5/5 passed in 548ms (tests 115ms). Real Redis; each of three 100-concurrent-POST bursts admitted exactly ten and rejected 90 with 429. Only ten enqueue/prepare/confirm calls, and only ten speech source resolutions for prepare. Separate accounts and all four scopes remain independent. Actual unavailable endpoint yields 503 before any store/resolver. No paid calls, no PG use, no Redis FLUSH; only unique namespaces cleaned.
- Scoped ESLint on six new/modified application/infrastructure files and three focused test files — passed.
- Formatter applied to owned files and constructor dependency fixture updates.
- Earlier full backend `tsc --noEmit --pretty false` ran amid concurrent changes and failed: missing root factory wiring (root owns), now-fixed worker/fixture dependencies, and unrelated in-flight quote/performance diagnostics. Not recorded as passing; parent final static check remains required.

An initial integration invocation sourced the PG-only environment and skipped all
five Redis tests. It is not evidence; the explicit Redis invocation above executed
all five. No database resets, migrations or shared Redis cleanup performed.

## Tested source hashes

- `apps/backend/src/modules/text-ai/application/generation-burst-limiter.ts` — `68c9a1424acee4480c6961ab67222edd70277fa1a148760584b1951010dc1536`
- `apps/backend/src/modules/text-ai/infrastructure/generation-burst-limiter.ts` — `7e0c6add185e92a4843f5546f59b669d71f056512eba27e3e65cecb3e61615ce`
- `apps/backend/src/modules/texts/application/texts-job-service.ts` — `162a70e1edb7d40680a07c00df353f1ba1173200911beed8f3e0509b06f5b33b`
- `apps/backend/src/modules/texts/infrastructure/texts-ai-composition.ts` — `db448f54fae59c7ad1732b80ef731bf22503c450e0cfe9d2b2bdd6c509dfb9d9`
- `apps/backend/src/modules/speech/application/speech-service.ts` — `3078f81fc0a4c71b519a8ae1e08694b406588657f4b0cc9809fb471b5de37664`
- `apps/backend/src/modules/speech/infrastructure/composition.ts` — `39722f664a94a79ce8488c6fda36ac6b997111a6acf3ec6fa6d07f40803ae60f`
- `apps/backend/tests/unit/modules/texts/texts-job-routes.test.ts` — `f81d71fbc2b6197b35cc0914458ab1cc353e6e2069b13e4a17d73aedcc53528f`
- `apps/backend/tests/unit/modules/speech/speech-admission.test.ts` — `bea6b7995c7447d1ca81a0119c381d670928ee381c69dbaa37a270e343c0c2d7`
- `apps/backend/tests/integration/modules/text-ai/redis-generation-admission.test.ts` — `70b9b58f853672a684c419afdc3ba80a16637078ff2409000f86a007d47f1e17`
