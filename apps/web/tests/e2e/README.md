# Authentication E2E

These Playwright journeys use real backend, PostgreSQL, Redis, cookie, and
WebAuthn boundaries. They create synthetic users and therefore refuse to start
unless `AUTH_E2E_DATABASE_URL` names a loopback database containing `test` or
`e2e`. `AUTH_E2E_REDIS_URL` must also point to a loopback Redis service.

From the repository root, with disposable services running:

```sh
AUTH_E2E_DATABASE_URL=postgres://user:password@127.0.0.1:55432/languon_auth_e2e \
AUTH_E2E_REDIS_URL=redis://127.0.0.1:56379/15 \
pnpm --filter @languon/web test:e2e
```

The harness migrates the disposable database and starts dedicated backend and
web processes. Set `AUTH_E2E_REUSE_SERVERS=true` only when both existing local
processes are already configured to use those same disposable services.
