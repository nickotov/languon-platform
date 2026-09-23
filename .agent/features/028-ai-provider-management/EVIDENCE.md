# Verification evidence: AI Provider and Model Management

Updated: 2026-09-23

## Acceptance coverage

| Acceptance ID | Evidence                                                                      | Result / limitation                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1          | Curated catalog/router and real wire-contract fixtures                        | DeepSeek `deepseek-chat` and Kie `gemini-2.5-pro` use bounded Mastra OpenAI-compatible adapters with JSON Schema output. No paid live request was made.                                                  |
| AC-2          | Administration service, HTTP, contract, store, component, and browser tests   | Owner authorization, recent authentication, bounded reason, optimistic conflict, transactional success/rejection audit, and sanitized responses pass.                                                    |
| AC-3          | Generated migrations and disposable PostgreSQL integration                    | A singleton current configuration points to immutable revisions; admission pins revision and budget atomically. Concurrent writers produce one winner and one recoverable conflict.                      |
| AC-4          | Store/router integration plus mapped system E2E                               | Jobs admitted around a default switch retained distinct DeepSeek/Kie revisions; the real worker routed both pinned snapshots. Idempotent replay and missing/invalid revision paths fail safely.          |
| AC-5          | Worker adapters and service/document tests                                    | Saved-card, inline authoring, pasted terms, import pairs, and document terms share the routing boundary. OCR, parsing, TTS, and Studio remain separate.                                                  |
| AC-6          | Catalog, provider wire, budget, worker, and release tests                     | Per-call caps, aggregate budgets, provider usage, retries, leases, fencing, cancellation, and sanitized errors remain enforced. Mixed provider usage is accounted within each immutable policy envelope. |
| AC-7          | Strict admin schemas, curated catalog, deployment separation, security review | Admins cannot submit URLs, headers, keys, credential names, or unknown model IDs. Only the worker receives provider keys; API/UI receive sanitized capability state.                                     |
| AC-8          | Admin component tests, mapped Playwright, and project browser verification    | Selection, loading, credential/readiness, unavailable, success, conflict, authorization, keyboard, narrow layout, and dark theme behavior are covered. Save performs no billable request.                |
| AC-9          | Old-worker trigger, grants, config/deployment tests, and operations guide     | Pinned jobs require the managed-routing transaction capability. Expand/activate/rollback lifecycle declarations remain explicit, and paid routing stays disabled until operators activate it.            |
| AC-10         | Checks below and independent reviews in `REVIEW.md`                           | Deterministic feature evidence is complete. Live provider/account readiness remains a separately authorized activation check.                                                                            |

## Final check records

### Static, unit, and build

- `pnpm lint`: passed.
- `pnpm build`: passed, 9/9 build tasks.
- Backend unit suite: 85 files passed, 579 tests passed, 20 files/146 tests skipped because guarded external/database suites were not enabled in that command.
- Admin: 3 files/15 tests passed; typecheck and production build passed.
- Contracts: 6 files/53 tests passed; typecheck and build passed.
- `pnpm db:check`: passed.
- `pnpm test:release-deployment`: 105 passed, 5 guarded tests skipped.
- `pnpm docs:user-flows:check`: 12 guides and mappings validated.
- `pnpm user-flow:e2e -- check ai-provider-management`: passed with revision `sha256:ebace910d71591e6`.
- `git diff --check`: passed.
- Repository-wide `pnpm typecheck` remains red only at unchanged `packages/browser-auth/tests/refresh-coordinator.test.ts:18`, where a pre-existing fixture lacks the already-required `handle` property. Backend, admin, contracts, and all other reached workspace typechecks passed.

### Disposable database

- Fresh PostgreSQL migrations applied through `0028_real_tenebrous.sql`.
- Focused integration command covering administration persistence, card-authoring managed routing, document completion, and worker version/budget behavior: 4 files/46 tests passed.
- Coverage includes concurrent configuration writers, atomic audit, revision pinning, old-worker rejection/current-worker claim, real router dispatch, immutable snapshots, provider usage, and mixed-policy claim/document-completion regressions.
- Worker privilege and deployment validation passed in the release/deployment suite.

### Mapped browser and system journey

- Registered command: `pnpm test:e2e:ai-provider-management`.
- Chromium result: 1 passed in 23.3 seconds against fresh disposable PostgreSQL, isolated Redis, and local backend/admin/web processes.
- The journey saves DeepSeek version 1, admits a DeepSeek job, switches the default to Kie while work is queued, admits a Kie job, verifies distinct immutable revisions directly in PostgreSQL, starts the real dictionary worker with an `APP_ENV=test`-only deterministic provider transport, waits for both review proposals, accepts the DeepSeek proposal, reloads the admin page, and confirms Kie version 2.
- The broader pre-existing admin command ran the first six scenarios, including this feature, then its unrelated public-passkey scenario hit the known 60-second WebAuthn timeout. The feature now has a dedicated mapped command so its evidence does not depend on that unrelated journey.
- Earlier project-pinned browser verification covered desktop, 320×800, keyboard labels, dark mode, and browser error/network inspection. Screenshot: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1790181342169.png`.

### Provider wire and live limitation

- Deterministic wire tests execute the actual Mastra/OpenAI-compatible fetch mapping for both catalog models and assert `/chat/completions`, bearer authorization, JSON Schema response format, parsed structured output, and usage propagation.
- DeepSeek readiness uses authenticated `GET /models`. Kie's documented model-specific route has no proven `/models`; its non-billable `HEAD` observation remains `unverified` rather than claiming credential/model health.
- No DeepSeek or Kie paid request was sent. Production activation must keep the managed-routing gate closed until compatible workers are deployed, worker credentials are provisioned, and a separately authorized bounded smoke check confirms the current vendor account/model behavior.

## Review evidence

Independent planning, completion, security, and verification records are maintained in [REVIEW.md](./REVIEW.md). All material implementation findings were remediated and rechecked; no critical, high, or material security finding remains.

## Remaining operational work

No implementation work remains. Operators must perform the documented compatible rollout and live provider smoke check before enabling paid production routing.
