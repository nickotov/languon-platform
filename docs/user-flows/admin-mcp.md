---
feature: admin-mcp
title: Delegated local admin MCP
status: current
last_verified: 2026-10-27
surfaces:
    - admin
    - browser
    - api
source_paths:
    - apps/admin/src/pages/admin-mcp/**
    - apps/admin/src/shared/api/admin-mcp-api.ts
    - apps/backend/src/modules/admin-mcp/**
    - apps/backend/src/infrastructure/admin-mcp/**
    - packages/contracts/src/admin-mcp.ts
e2e_command: admin-mcp
e2e_tests:
    - apps/admin/tests/e2e/admin-mcp.journeys.spec.ts
e2e_scenarios:
    - owner-token-lifecycle-and-client-guides
    - bounded-credit-preview-and-idempotent-apply
related_features:
    - admin-user-management
    - ai-accounting
    - admin-text-ai-routing
---

# Delegated local admin MCP

## What this verifies

An active owner creates an expiring, read-only automation credential through the
real admin application, connects to the separate HTTP MCP listener, inspects the
client guides and revokes access. The journey uses real PostgreSQL, Redis,
authentication and HTTP transport, with synthetic identities only. Normal tests
never send requests to paid providers.

## Start the development environment

Use disposable loopback PostgreSQL and Redis. The existing admin Playwright
configuration rejects a default PostgreSQL port, a non-loopback host or a database
name that does not identify an admin E2E test database. Do not reuse the ordinary
application database or a signed-in real admin session.

Set `ADMIN_E2E_DATABASE_URL` to the disposable database and
`ADMIN_E2E_REDIS_URL` to its disposable Redis. Set `ADMIN_E2E_MCP=true` for the MCP
listener. Optional origin variables are `ADMIN_E2E_ADMIN_ORIGIN`,
`ADMIN_E2E_BACKEND_ORIGIN`, `ADMIN_E2E_WEB_ORIGIN` and `ADMIN_E2E_MCP_ORIGIN`.
Defaults use localhost ports 3001, 4000, 3333 and 3002 respectively. Select unused
ports when ordinary development services are running. Keep server reuse disabled.

Run the registered command:

```sh
node scripts/run-admin-mcp-e2e.mjs
```

The wrapper preserves the tracked Next type declaration across success/failure.
Playwright migrates only the selected disposable database and starts/stops its own
backend, admin, web and MCP processes. The synthetic owner is created through
signup/email verification and the reviewed membership CLI. Explicit fixture
credentials are not production secrets.

## Browser verification

1. Sign in as the synthetic active owner and open **Agent access (MCP)**.
2. Confirm read permissions are selected and paid checks/credit writes are not.
3. Enter a client name and audited reason, then create the token. Save the secret
   securely; dismissing the panel or reloading must not reveal it again.
4. Inspect the Codex, Claude Code and OpenCode tabs. Configurations reference
   `LANGUON_ADMIN_MCP_TOKEN`; they never embed the issued secret. Change **MCP
   listener port** to 3999 and confirm every client snippet updates its URL, then
   reset it to 3002. This changes instructions only, not the running listener.
5. At narrow browser width, confirm the page and revoke controls remain usable.
6. Revoke the token with a reason, reload and confirm its revoked status persists.

Expected result: no unexpected console errors or failed browser requests. Token
metadata persists; the plaintext secret cannot be recovered from metadata.

## Admin verification

Creation requires a sign-in within five minutes. Listing and revoking one's own
tokens require a valid active owner session. Read-only permissions are the default.
Selected write permissions require finite bounds where applicable. Issued authority
cannot expand automatically when future tools are introduced. Replacement creates
a new credential and revokes the previous one.

## API verification

The admin API exposes `/admin/mcp/tokens` and
`/admin/mcp/tokens/<id>/revoke` behind existing admin authentication. The separate
localhost MCP endpoint is `/mcp`; `/healthz` exposes no database details. Use the
issued Bearer credential in a header, never a URL. Initialize and discover tools;
a read-only connection check incurs no provider expense. After UI revocation the
same credential must receive 401 on its next MCP request.

Defined write tools require a five-minute token-bound preview and an operation
key. Server-side versions, active authority and ceilings remain authoritative.
A repeated operation returns its receipt, never a duplicate grant. A preview is
not proof of human approval. No unrestricted SQL, provider secrets or MCP token
management is available.

## E2E coverage

- `owner-token-lifecycle-and-client-guides` proves real owner creation through the
  admin form, default read permissions, secret dismissal/reload, rendered client
  guides, HTTP MCP initialization/discovery and a read-only connection check,
  narrow-width revocation, persistent status and rejection on the next request.

- `bounded-credit-preview-and-idempotent-apply` proves exact-email lookup, current
  credit inspection, non-mutating bounded preview and one ledger grant despite
  retrying the same apply operation through the real HTTP MCP transport.

Database tests own exhaustive preview expiry/staleness, bounded grants, retry,
concurrent reservations and financial invariants. Client CLI smoke evidence is
recorded separately in feature EVIDENCE.md; rendered configurations alone do not
prove that each external client connects.

## Expected failure and edge cases

- Missing, expired or revoked token: deny without dispatching a tool.
- Inactive owner or removed membership: deny on the next request.
- Missing permission or exhausted ceiling: bounded denial, no automatic escalation.
- Stale/expired preview: create a fresh preview; never overwrite newer data.
- Uncertain provider outcome: retain the reservation; do not blindly retry.
- Missing listener: follow the in-admin startup instructions; do not expose its
  loopback port to a public network.

## Automated regression checks

```sh
pnpm user-flow:e2e -- check admin-mcp
pnpm docs:user-flows:check
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
```

Run the mapped command above with disposable services for browser/API evidence.
Changes to shared authentication, accounting or AI configuration also require the
full critical-workflow gate described in the operations guide.

## Troubleshooting

Connection refused means the opt-in listener is absent or its port differs from
client configuration. Unauthorized requires checking environment inheritance,
expiry/revocation and active owner membership. Permission denial requires a newly
issued appropriately scoped credential. MCP cannot change its own authority.
Use correlation references for diagnosis; never paste secrets into logs or chat.

## Cleanup

Playwright stops only its own app processes. Stop/remove only specifically named
disposable containers after verifying their identity. Do not reset the development
database, remove shared volumes or revoke real owner memberships.
