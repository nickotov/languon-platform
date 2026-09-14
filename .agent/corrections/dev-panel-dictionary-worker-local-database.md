# Correction: Dev panel dictionary worker local database fallback

Status: Complete
Created: 2026-09-14
Updated: 2026-09-14

## Routing decision

- Intended outcome: make the newly cataloged local dictionary worker start with
  the same PostgreSQL configuration as the already-running development backend.
- Why this is a correction: it fixes one reproducible local configuration gap
  without adding a product capability, contract, persistence change, dependency,
  deployment change, or new journey.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing whenever any
  root correction condition becomes false.

## Context and scope

- Current behavior: the backend starts using `DATABASE_URL`, but the dictionary
  worker exits with a generic failure when the local environment omits the
  separately named `DICTIONARY_WORKER_DATABASE_URL`.
- Expected behavior: development/test workers fall back to `DATABASE_URL` when
  the worker-specific URL is absent; staging/production continue to require the
  explicit least-privilege worker credential.
- In scope: worker environment parsing, safe startup diagnostics, focused
  regression coverage, sanitized environment guidance, and affected
  web-dev-panel troubleshooting text.
- Out of scope: changing deployed credential isolation, migrations, database
  grants, worker processing, providers, or panel process behavior.
- Likely files/surfaces: worker environment parser/tests, `.env.example`, and
  the existing `web-dev-panel` user-flow guide/revision marker.
- Relevant ADRs or constraints: ADR-0014/0013 panel command boundary and the
  dictionary operations contract requiring distinct deployed credentials.
- Related user-flow guides: `web-dev-panel`.

## Plan

- [x] Implement the bounded change.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Tests                    | Backend 470 passed / 109 skipped; panel Chromium 3/3 passed                                   |
| Lint/typecheck/build     | Backend lint and typecheck passed; scoped formatting passed                                   |
| Runtime/browser/database | Exact worker command reached ready state against local PostgreSQL and was stopped with SIGINT |
| Documentation/user-flow  | Guide, revision, docs validation, and mapped traceability passed                              |

## Outcome and evidence

- Changes made: the worker environment accepts `DATABASE_URL` as a fallback only
  in development/test when `DICTIONARY_WORKER_DATABASE_URL` is absent. Deployed
  environments still fail closed unless the dedicated worker URL is explicit.
  Environment-validation failures now retain their safe actionable message;
  non-configuration startup/runtime failures remain generically redacted.
- Commands and results: the focused test reproduced the original Zod failure;
  after the correction the backend suite passed 470 tests with 109 intentionally
  skipped. Backend lint/typecheck, panel catalog validation, panel lint, scoped
  formatting, docs validation, and user-flow traceability passed. The exact
  `pnpm dev:dictionary-worker` command reported ready with concurrency 2 and
  `card-authoring:v1`, then released on the verification SIGINT. An intentional
  empty-URL probe reported the safe actionable configuration requirement and
  exposed no environment value.
- Documentation: `.env.example` now explains the local fallback and deployed
  requirement; `docs/user-flows/web-dev-panel.md` and its mapped E2E revision
  describe the same behavior. The mapped Chromium suite passed 3/3.
- Review: the fallback is selected only after parsing `APP_ENV`; staging and
  production cannot consume `DATABASE_URL`. No credentials, environment values,
  provider behavior, database access policy, or production deployment contract
  changed.

## Remaining risks

- None known.
