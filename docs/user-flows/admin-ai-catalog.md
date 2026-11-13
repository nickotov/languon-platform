---
feature: admin-ai-catalog
title: Admin AI catalog
status: current
last_verified: 2026-11-13
surfaces:
    - admin
    - browser
    - api
source_paths:
    - .agent/features/066-admin-ai-catalog/**
    - apps/admin/src/app/admin-app.tsx
    - apps/admin/src/pages/ai-catalog/**
    - apps/admin/src/shared/api/ai-catalog-api.ts
    - apps/admin/src/shared/i18n/ai-catalog-messages.ts
    - apps/admin/src/widgets/admin-layout/admin-layout.tsx
    - apps/backend/src/modules/administration/infrastructure/ai-catalog.ts
    - apps/backend/src/modules/administration/infrastructure/ai-catalog/**
    - apps/backend/src/modules/administration/interface/http/admin-ai-catalog.routes.ts
    - packages/contracts/src/ai-catalog.ts
    - packages/prompts/src/**
    - apps/admin/tests/e2e/admin-ai-catalog.journeys.spec.ts
e2e_command: admin-ai-catalog
e2e_tests:
    - apps/admin/tests/e2e/admin-ai-catalog.journeys.spec.ts
e2e_scenarios:
    - admin-ai-catalog-readonly
related_features:
    - admin-user-management
    - tutor-learning-tool-playground
---

# Admin AI catalog

## What this verifies

An active administration owner can inspect the checked-in definitions the application
registers for agents, tools, and prompt templates. The catalog is a read-only
description of static metadata: it never runs an agent, tool, model, workflow, or
learner request. Operation-specific instructions, credentials, user context, and
request-resolved prompt additions are deliberately absent.

## Start the development environment

Use the disposable loopback PostgreSQL and Redis environment enforced by the admin
Playwright configuration. Set `ADMIN_E2E_DATABASE_URL` to a dedicated admin E2E
test database on a non-default local port and `ADMIN_E2E_REDIS_URL` to a dedicated
local Redis instance. Do not point this journey at ordinary local, shared, staging,
or production data.

Run the registered command:

```sh
pnpm --filter @languon/admin exec playwright test tests/e2e/admin-ai-catalog.journeys.spec.ts
```

The harness migrates only that selected database and starts/stops its backend,
admin, and web processes. It creates verified synthetic identities and grants one
synthetic owner through the reviewed local membership command. No paid provider is
configured or contacted.

## Browser verification

1. Sign in as an active owner and select **AI catalog**. Confirm its read-only
   notice and the Agents, Tools, and Prompts counts.
2. Search for a prompt or definition identifier, open it, and inspect its static
   text as literal text. Long text remains contained in its own scrollable region;
   it is not rendered as HTML or Markdown.
3. Filter by kind and scope, then clear the filters. A query with no match shows
   the empty result without changing definitions.
4. Open a tool. Inspect input, output, and request-context schemas where published,
   and read the runtime/availability limitations. Follow a related prompt or tool
   link; the detail drawer updates to that definition.
5. At narrow width, the drawer remains usable and the static text region is
   keyboard-focusable without page-level horizontal overflow.

Expected result: the page issues only catalog reads after login, with no unexpected
browser console errors or failed requests.

## Admin verification

The navigation item and API require existing active-owner authorization. A verified
user without admin membership cannot obtain an admin session and receives the
existing administration-access denial. Catalog viewing adds no separate role and no
edit, run, save, apply, publish, or model-selection action.

## API verification

`GET /admin/ai-catalog` returns summary metadata and `GET
/admin/ai-catalog/:kind/:id` returns one validated static definition. Both endpoints
use the existing bearer authorization path and reject missing or non-owner access.
Prompt content is the exact checked-in local template; tool schemas describe only
published structural boundaries. Limitations explain dynamic request context,
conditional availability, and JSON Schema representation gaps.

## E2E coverage

- `admin-ai-catalog-readonly` creates a real owner and non-member against
  disposable PostgreSQL/Redis, proves the non-member administrative denial, then
  uses the owner session to inspect prompt/template content, tool schemas and
  dynamic notes through the rendered responsive admin catalog. It checks search,
  kind/scope filtering, no-match/reset states, related-definition navigation,
  keyboard focus, screenshots, and that browsing sends no mutation or model call.

Route/authorization tests own exhaustive malformed, missing-token, not-found and
response-schema cases. Registry and prompt tests own complete definition inventory,
all exact templates, dangling-reference checks, and factory parity; the E2E proves
one representative template through the real admin boundary.

## Expected failure and edge cases

- A missing, expired, or non-owner admin session is denied before catalog metadata
  is returned.
- An unknown kind/identifier receives the canonical not-found response; no partial
  entry is fabricated.
- Definitions with no publishable schema show the explicit unavailable message.
- Dynamic SDK/request additions and unavailable conditional tools are described as
  limitations rather than guessed static content.
- A stale deep link reports a retryable detail error while the list remains
  read-only and usable.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check admin-ai-catalog
pnpm docs:user-flows:check
pnpm --filter @languon/admin exec playwright test tests/e2e/admin-ai-catalog.journeys.spec.ts
```

Run the last command only with the disposable services described above. Focused
backend registry/route and admin rendering tests cover lower-cost combinations;
they do not substitute for this authenticated browser/API journey.

## Troubleshooting

If Playwright rejects the setup, check that the database hostname is loopback, its
name identifies an admin E2E test database, and its port is not PostgreSQL's
default. A login denial for the synthetic owner usually means the membership CLI
did not inherit the same disposable database URL. A catalog load error after login
means to inspect the backend's local health endpoint and route logs; do not replace
the backend with a mocked response.

## Cleanup

Playwright stops only processes it started. Stop or remove only the specifically
named disposable local test containers after confirming their database/port identity.
Do not reset an ordinary development database, remove shared volumes, or revoke a
real owner membership.
