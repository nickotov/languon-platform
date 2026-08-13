# Verification evidence: User Flow Testing Guides

Updated: 2026-08-13
Status: Complete

## Source and contract audit

- Read root/workspace instructions, `.agent/PLANS.md`, feature templates,
  repository commands, accepted ADR index, and current development/setup docs.
- Audited the authentication guide against password/session/passkey Hono routes,
  OpenAPI registration, shared Zod schemas, environment/migration/Compose entry
  points, web UI/session behavior, and the three guarded Playwright journeys.
- No runtime authentication behavior, public contract, persistence, or accepted
  ADR was changed by this feature.

## User-flow guide verification

- Created `docs/user-flows/README.md` with filename, YAML frontmatter, required
  section, lifecycle, safe-data, and agent update rules.
- Created `docs/user-flows/user-authentication.md` with local setup, browser/API
  journeys, expected results, negative cases, automation, troubleshooting, and
  cleanup. Linked it from the completed authentication feature specification.
- `pnpm docs:user-flows:check`
  - Result: passed.
  - Seven `node:test` cases pass for complete guide/parsing plus filename,
    surface-section, empty-list/section, unsafe-path, missing-index, and
    fenced-index false-positive failures. The checked-in collection reports
    `Validated 1 user-flow guide(s).`
- `node --check` for the validator and its test file passed.

## Real local guide smoke

- Created a temporary ignored `.env.local` using sanitized development-only
  values from `.env.example`.
- `pnpm dev:infra` started PostgreSQL/Redis and created isolated local volumes for
  this verification.
- `pnpm db:migrate`
  - The first sandboxed attempt failed because tsx could not open its temporary
    IPC socket (`EPERM`). Re-running with local execution permission passed.
- `pnpm dev:backend` started the backend on `http://localhost:4000`.
- Fresh local API journey passed with these exact results: health `200`, auth
  capabilities `200`, signup `202 verification_pending`, verification with
  `0000` `200 authenticated`, `/users/me` `200`, refresh `200 authenticated`,
  logout `200 signed_out`, and post-logout refresh
  `401 authentication_required`.
- `pnpm dev:web` reached Next.js startup but could not bind port 3000 because an
  unrelated Next.js 15 process already owned it. That process was identified and
  deliberately left untouched. Browser behavior is unchanged and remains proven
  by the authentication feature's three Playwright journeys/manual evidence.
- Cleanup stopped the backend and containers, removed only the two volumes this
  run explicitly created, preserved pre-existing Languon volumes, and removed
  the temporary `.env.local`, cookie jar, and response files.

## Exact automated browser recipe

- Ran the complete command now documented in both the authentication guide and
  `apps/web/tests/e2e/README.md`: fixed `--rm` PostgreSQL 17/Redis 8 containers,
  database `languon_auth_e2e`, Redis DB 15, loopback data ports `55432`/`56379`,
  and dedicated app ports `3100`/`4100`.
- The first run correctly failed all three journeys because app origins used
  `127.0.0.1`, which Next.js blocked for development resources. No product code
  was changed; the recipe was corrected to use `localhost` for app origins.
- The final ownership-aware recipe passed all three Playwright Desktop Chrome
  journeys in 17.8 seconds: signup/`0000` verification/refresh/logout; password
  reset with old-session and old-password rejection; and virtual-authenticator
  passkey enrollment/bad-signature rejection/discoverable
  login/rename/removal.
- The journeys assert no unexpected browser console/page errors or HTTP error
  responses. The successful run reported none.
- The shell trap removed both exact disposable containers after the failed run
  and each successful run. `docker ps --all` confirmed neither remained. Cleanup
  flags ensure the trap stops a container only after this shell started it.

## Repository validation

- Initial `pnpm check`: formatting and guide checks passed; ESLint reported
  `no-regex-spaces` in the validator. The expression was rewritten with an
  explicit `{2}` quantifier.
- Final `pnpm check`: passed — format, guide validator, lint, typecheck 10/10,
  tests 10/10, and builds 7/7.
- Post-remediation `pnpm check`: passed with the same complete stages.
- `git diff --check`: passed during implementation and after remediation.

## Review

- Independent reviewer found four Medium issues and no Critical/High issues:
  predictable `/tmp` token/cookie paths; validator acceptance of empty content
  and fenced index examples; missing auth-guide impact paths; and E2E steps that
  assumed unprovisioned disposable services.
- Remediation uses a `umask 077` unique `mktemp` directory, strengthens the
  validator with regressions, expands `source_paths`, and supplies a complete
  fail-clean Docker/Playwright recipe with ownership-aware cleanup.
- Focused re-review: passed with no remaining Critical, High, or Medium findings.
- Focused security review found one Medium issue in the initial setup command:
  an unconditional copy could overwrite an ignored `.env.local`. Remediation
  now copies only when neither a file nor symlink exists, preserving local
  credentials/configuration. Final security verdict: zero Critical, High, or
  Medium findings.
- The security review's Low empty-fence completeness bypass and independent
  review's Low HTML-comment/inline-code index bypass were fixed in the validator
  with regression assertions. API cleanup now restores and unsets the caller's
  previous umask.

## Remaining risks

- The validator proves structure and metadata, not semantic prose accuracy;
  current-source audit, real proportional verification, and independent review
  remain required by `AGENTS.md`.
- Manual hardware-passkey and responsive visual checks remain historical auth
  feature evidence; this documentation-only feature reran the automated Desktop
  Chrome virtual-authenticator journeys and did not change application UI.
- Docker image tags are mutable and rely on trusted upstream official images;
  this is consistent with the repository's existing development Compose model.
- A narrow local race remains if a started `--rm` container exits and another
  Docker actor claims its exact name before the shell trap runs. Per-container
  started flags and fixed local names make this unlikely and prevent the normal
  collision path from stopping an unknown container.
