# Backend compatibility liveness retirement

Date: 2026-10-19. Owner: skills worker. Feature 045, base 007b9eb plus current patch.

## Scope and decisions

Removed backend `/health`, its OpenAPI operation and the now-unused public
`HealthResponseSchema`/`HealthResponse` contract/export. `/livez` is the canonical
process liveness endpoint; `/readyz` retains dependency and draining semantics.
Updated web/admin Playwright startup gates and contextual-assistant/texts fixture
server gates to `/livez`. The architecture viewer's own `/health`, command panel
and frontend `/healthz` endpoints are separate current capabilities and unchanged.

Current documentation now points to `/livez`: agentic development, deployment
operations, and the seven guides below. Main owns the root README replacement.
No production deployment/configuration or application database schema was changed
by this subtask. Existing feature authorization covers the protocol retirement.

## Verification strategy and evidence

Only liveness routing, startup gates and setup documentation changed. Focused HTTP
tests plus actual backend/worker/browser startup establish this boundary. No health
change requires database implementation tests; the maintained browser startup uses
task-owned real PostgreSQL/Redis because its normal app startup requires them.
Do not infer that the full mapped authentication/admin/dictionary journeys were
rerun from a setup-URL edit or marker synchronization.

- H-1: `pnpm --filter @languon/backend exec vitest run tests/health.test.ts`.
  Before implementation: the new removed-route/OpenAPI assertions failed, proving
  the existing alias still served and was documented. After removal: **5/5 pass**.
  Covers default/current release liveness, removed alias404, OpenAPI, unavailable
  dependencies and draining readiness.
- H-2: `pnpm --filter @languon/backend exec eslint src/modules/health/interface/http/health.route.ts tests/health.test.ts`:
  passed. `pnpm --filter @languon/contracts typecheck`: passed. Scoped Prettier over
  changed health route/test/export, all four configs and changed docs: passed.
- H-3: Actual `src/index.ts` startup at localhost4100, observed over real HTTP while
  the maintained Playwright run owned it: `/livez`200 with
  `{release:development,service:backend,status:ok}`; retired `/health`404;
  `/openapi.json` has `/livez` and no `/health`. The worker started after the updated
  `/livez` shell gate; Next served localhost3100. This used the real application
  composition, not a temporary/mock Hono server.
- H-4: maintained Chromium browser test:

    ```sh
    pnpm --filter @languon/web exec playwright test tests/e2e/i18n.journeys.spec.ts --grep 'switches language by cookie'
    ```

    **1/1 passed, 18.9s**. Existing assertions exercise login-page validation, language
    selection, URL/cookie persistence and reload, and reject unexpected console
    errors and failing responses. No product UI changed for health retirement, so
    another exploratory browser session adds no needed observation.

    Explicit fixture environment: AUTH_E2E web/backend origins localhost3100/4100;
    task-owned PostgreSQL127.0.0.1:55464 database `languon_auth_health045_test` and
    Redis127.0.0.1:56464/15; run ID `health045`. Root config supplies deterministic
    fixture speech and dictionary providers. Inherited local voice/retained config
    variables were explicitly emptied to avoid loading unrelated live profiles:
    `DICTIONARY_AUDIO_VOICE_MAP`, `DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS`,
    `DICTIONARY_AUDIO_RETAINED_S3_CONFIGURATIONS`, and
    `DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS`. No paid generation occurred.

    Initial attempts failed during setup: inherited local voice mapping did not
    match a curated model; then concurrent migration editing changed the just-applied
    history hash. After fixture isolation and the persistence worker's stable-history
    confirmation, recreated only the owned empty PostgreSQL container and passed.
    These failures did not exercise or disprove the health change.

    Containers `languon-health045-postgres` and `languon-health045-redis` were started
    with `--rm`, then stopped after verification. The existing shared5432/6379 stack
    was not modified. Playwright stopped owned backend/worker/Next processes. Its
    generated `.next-e2e` route imports in `next-env.d.ts` require main's final
    generated-file hygiene; a generated diff existed before this subtask, so this
    worker did not overwrite another worker's state.

## Guide traceability dispositions

Reviewed mapped scenarios and their HTTP/startup usage; no mapped test asserts the
old backend health envelope or route. The guide changes are exclusively startup
URL substitutions. Kept every stable scenario and runtime assertion; synchronized
only each guide's revision marker in its existing declared tests. Historical
verification dates remain unchanged; this is not a claim of rerunning every flow.

| Guide                      | Current revision        | Disposition                                                                                     |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| global-app-shell           | sha256:bda4f902cf35d0cf | Setup URL only; mapped checks pass; browser scenario semantics unchanged.                       |
| user-authentication        | sha256:98448206f9eab407 | Setup URL/curl only; checks pass; credential/session/passkey assertions retained.               |
| dictionary-platform        | sha256:bcb8fc99a5ebf90d | Setup URL only; checks pass; dictionary scenario assertions retained.                           |
| flashcard-training-backend | sha256:fbfa0ab1619194dd | Setup URL only; composed-routes marker updated; checks pass.                                    |
| web-i18n-support           | sha256:52b7f07a4eba4dcf | Setup URL only; checks pass; H-4 executes language-switch scenario.                             |
| admin-user-management      | sha256:4329a23dfacbe067 | Setup URL only; both declared test-file markers updated; checks pass; edge `/healthz` retained. |
| magic-profile-page         | sha256:19162749cd4b4b44 | Setup URL only; profile test marker updated; checks pass.                                       |

H-5: `checkUserFlowGuides({ feature })` via the exported checker succeeded for all
seven guides (same function used by `pnpm user-flow:e2e -- check <slug>`).
`pnpm docs:user-flows:check` passed all16 validator tests but initially found the
shared-pronunciation guide's unrelated in-progress revision mismatch; the audio
worker owns that synchronization. Main must rerun the global gate after integration.

## Remaining integration work

Main owns final broad/static verification, independent review, README health URL,
diagram source re-review/stamping after route changes and generated-file cleanup.
No unresolved defect remains in the bounded health retirement. Evidence content
hashes below identify the final health-specific tested implementation/config patch;
later health/config changes invalidate affected checks rather than HEAD alone.

```text
57330e8289c3a160e7bef9711db59cf724c9fb22673f4f433a97520155cca476  apps/backend/src/modules/health/interface/http/health.route.ts
12c3d244f6d936747c5535108be89e7fda38c934d63e6995825d3d31913d30f9  apps/backend/tests/health.test.ts
362610f42af86ae1adf0333f235817eefc4bbe868d87a85e3013388820d68090  packages/contracts/src/index.ts
ab27db10c7cb4036a5752618dd40900c15b60183e9bf8e5c57e9971f12169354  apps/web/playwright.config.ts
0e8152b328cbbacc07c0e3307b7f940da8876d4a7cf054fb72b39593cc6297d1  apps/admin/playwright.config.ts
3b8a8bc9b11398a12f1c2d4426b518b25458c1132288393cbb720977b479b57c  apps/web/tests/e2e/i18n.journeys.spec.ts
c2e1eb83e1f594d8590df1ba693c9db5bc8c0303b1e4f57f02798c53d46e1c5a  apps/web/tests/e2e/support/contextual-assistant-playwright.config.ts
899e76c6087de1562fa5af2913f20b9943ece943a187be6f917f64983a3c1714  apps/web/tests/e2e/support/texts-playwright.config.ts
deleted  packages/contracts/src/health.ts
```
