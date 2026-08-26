# Authentication E2E

These Playwright journeys use real backend, PostgreSQL, Redis, cookie, and
WebAuthn boundaries. They create synthetic users and therefore refuse to start
unless `AUTH_E2E_DATABASE_URL` names a loopback database containing `test` or
`e2e`. `AUTH_E2E_REDIS_URL` must also point to a loopback Redis service.

From the repository root, run this complete block. It binds only to loopback,
uses fixed names so it cannot silently reuse unknown containers, and removes the
containers even when Playwright fails:

```sh
(
  set -eu
  LANGUON_E2E_POSTGRES_CONTAINER=languon-auth-e2e-postgres
  LANGUON_E2E_REDIS_CONTAINER=languon-auth-e2e-redis
  LANGUON_E2E_POSTGRES_STARTED=false
  LANGUON_E2E_REDIS_STARTED=false
  cleanup_e2e() {
    if [ "$LANGUON_E2E_REDIS_STARTED" = true ]; then
      docker stop "$LANGUON_E2E_REDIS_CONTAINER" >/dev/null 2>&1 || true
    fi
    if [ "$LANGUON_E2E_POSTGRES_STARTED" = true ]; then
      docker stop "$LANGUON_E2E_POSTGRES_CONTAINER" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_e2e EXIT HUP INT TERM

  docker run --detach --rm \
    --name "$LANGUON_E2E_POSTGRES_CONTAINER" \
    --publish 127.0.0.1:55432:5432 \
    --env POSTGRES_DB=languon_auth_e2e \
    --env POSTGRES_USER=languon_e2e \
    --env POSTGRES_PASSWORD=languon_e2e \
    postgres:17-alpine
  LANGUON_E2E_POSTGRES_STARTED=true
  docker run --detach --rm \
    --name "$LANGUON_E2E_REDIS_CONTAINER" \
    --publish 127.0.0.1:56379:6379 \
    redis:8-alpine
  LANGUON_E2E_REDIS_STARTED=true

  LANGUON_WAIT_ATTEMPTS=0
  until docker exec "$LANGUON_E2E_POSTGRES_CONTAINER" \
    pg_isready --username languon_e2e --dbname languon_auth_e2e >/dev/null 2>&1
  do
    LANGUON_WAIT_ATTEMPTS=$((LANGUON_WAIT_ATTEMPTS + 1))
    [ "$LANGUON_WAIT_ATTEMPTS" -lt 30 ] || exit 1
    sleep 1
  done
  LANGUON_WAIT_ATTEMPTS=0
  until docker exec "$LANGUON_E2E_REDIS_CONTAINER" \
    redis-cli ping >/dev/null 2>&1
  do
    LANGUON_WAIT_ATTEMPTS=$((LANGUON_WAIT_ATTEMPTS + 1))
    [ "$LANGUON_WAIT_ATTEMPTS" -lt 30 ] || exit 1
    sleep 1
  done

  AUTH_E2E_DATABASE_URL=postgres://languon_e2e:languon_e2e@127.0.0.1:55432/languon_auth_e2e \
  AUTH_E2E_REDIS_URL=redis://127.0.0.1:56379/15 \
  AUTH_E2E_WEB_ORIGIN=http://localhost:3100 \
  AUTH_E2E_BACKEND_ORIGIN=http://localhost:4100 \
  pnpm --filter @languon/web test:e2e
)
```

The harness migrates the disposable database and starts dedicated backend and
web processes. Set `AUTH_E2E_REUSE_SERVERS=true` only when both existing local
processes are already configured to use those same disposable services. If a
shell is interrupted before its trap runs, inspect
`docker ps --filter name=languon-auth-e2e-` and stop only containers you confirm
came from your run.

Each Playwright invocation derives a fresh opaque authentication Redis namespace
from `AUTH_E2E_RUN_ID` (or a generated run ID). This keeps rate-limit and passkey
state isolated across reruns without flushing the selected Redis database. When
reusing servers, keep one stable `AUTH_E2E_RUN_ID` for the server and test
processes.

The dedicated ports are PostgreSQL `55432`, Redis `56379`, web `3100`, and
backend `4100`. If one is occupied, identify the owner and stop it deliberately;
the guide does not reuse or terminate unknown processes.
