# Verification evidence: Dictionary Permanent Deletion

Updated: 2026-09-26

The tested implementation state is `main` at `ff3d1b0` plus the Feature 030
working tree. Final documentation-only evidence/review updates do not change the
tested runtime paths. Any review remediation that changes runtime code requires
the affected check to be rerun and this statement to be updated.

## Acceptance coverage

| Acceptance ID | Implementation and proof                                                                                                                                           | Result                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1–AC-3     | Archived-only row actions, selection toolbars, single/selected/all dialogs, real API journeys                                                                      | E-4, E-5, E-6 pass                                                                                                                             |
| AC-4–AC-6     | Strict selection contracts, transactional target/version checks, preview snapshots, deletion receipts and replay conflicts                                         | E-1, E-2, E-3 pass                                                                                                                             |
| AC-7–AC-10    | Busy guards, generation lock ordering, document/audio fencing, readable payload scrubbing, idempotency tombstones, provider-usage archive, unchanged credit ledger | E-2, E-3 pass                                                                                                                                  |
| AC-11–AC-13   | Typed/acknowledged confirmation, pending/error states, selection helpers, localization, desktop and 320 CSS-pixel browser behavior                                 | E-4, E-5, E-6 pass; browser-level zoom was represented by the required effective CSS width because the safe wrapper has no stable zoom command |
| AC-14         | Migration, contracts, application, repository, web, E2E, browser, docs and independent review gates                                                                | E-1–E-7 pass; independent review recorded in `REVIEW.md`                                                                                       |

## Check records

### E-1 — Contracts

- Commands: `pnpm --filter @languon/contracts build`; `pnpm --filter @languon/contracts typecheck`; `pnpm --filter @languon/contracts test`.
- Result: build and typecheck passed; 6 files and 54 tests passed.
- Proves strict request/preview/receipt/error schemas and public package exports.

### E-2 — Backend application and static checks

- Commands: `pnpm --filter @languon/backend typecheck`; `pnpm --filter @languon/backend lint`; `pnpm --filter @languon/backend test`; `pnpm --filter @languon/backend build`.
- Result: all passed; 86 test files passed, 21 environment-gated files skipped; 600 tests passed and 163 skipped. Build emitted all backend and worker entry points.
- Focused service/route run after review remediation: 2 files and 22 tests passed.
- Proves application/auth routing, error mapping, store delegation and broad backend regression safety. Environment-gated persistence behavior is covered separately by E-3.

### E-3 — Migration and disposable PostgreSQL invariants

- Migration command against fresh `postgres:18-alpine` on loopback port 55434: `DATABASE_URL=<disposable-loopback-url> pnpm db:migrate`.
- Repository command with guarded disposable variables: `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=<disposable-loopback-url> AUTH_TEST_DATABASE_CONFIRM=languon_auth_feature030_migration_test pnpm --filter @languon/backend exec vitest run tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts`.
- Results: the complete migration history applied in one canonical runner transaction; final deletion/account-purge run passed 2 files and 35 tests. `pnpm db:check` also passed.
- Proves selected/all atomicity, active/foreign/missing rollback, generation-busy rollback, admission-before-owner/dictionary-row lock ordering, lack of global audio-lock contention, active-child dictionary deletion, readable null-scrubbed linked jobs, content-free idempotency tombstones and replay rejection, linked batch provenance, direct settled provider-usage transfer and effective budget retention, incomplete/terminal document cleanup behavior, active audio/writer lease rollback followed by safe cleanup handoff, fork preservation/share revocation, unchanged AI-credit account/grant/history rows, and account purge handling. Disposable containers were stopped and auto-removed.
- A first generated enum migration failed with PostgreSQL `55P04` under the real one-transaction runner. It was removed before final evidence; the final additive migration uses the existing completed state with null result fields and passed from an empty database.
- Additional disposable invariant command selected `dictionary-document-store.test.ts` and `dictionary-audio-store.test.ts`; 2 files and 16 tests passed.

### E-4 — Web unit, static and production checks

- Commands: `pnpm --filter @languon/web typecheck`; `pnpm --filter @languon/web lint`; `pnpm --filter @languon/web test`; `pnpm --filter @languon/web build`.
- Result: all passed; 29 files and 221 tests passed; the Next.js production build generated all routes.
- Proves API serialization, bounded selection state, row/toolbar visibility including empty archives, confirmation validation, mutation success/conflict behavior, recent-auth error copy, deleted detail/job cache eviction, localization wiring and query refresh.

### E-5 — Mapped end-to-end journeys

- Command: isolated Playwright harness from `apps/web/tests/e2e/README.md`, with disposable PostgreSQL/Redis, dedicated backend `4101` and web `3101`, selecting `tests/e2e/dictionary-permanent-deletion.journeys.spec.ts`.
- Result: 3 Chromium journeys passed in 20.5 seconds.
- Scenarios: selected/all archived dictionaries with cancelled single confirmation; selected/all archived cards with single-card identity and active-card preservation; real two-tab stale-preview conflict followed by fresh server reads proving the restored and still-archived cards both persisted.
- No paid or nondeterministic provider was used. Containers and application processes were removed by the harness trap.

### E-6 — Real browser verification

- Tool: project-pinned `agent-browser` 0.33.0 through `pnpm browser`; session `languon-dictionary-deletion-final-25080052f0f3e639540fe6538702fee9` against the running local app.
- Data: one synthetic `example.test` owner, one dictionary and one card.
- Result: created and archived the card, selected it, observed the alert dialog and disabled destructive action, acknowledged and deleted it through the real `POST /card-deletions` 200 response. Then archived, selected and permanently deleted the dictionary through `POST /dictionary-deletions` 200. Lists refreshed to their empty archived states.
- Viewports: desktop default, 390×844, and exact 320×800 CSS pixels. At 320 pixels the alert dialog box was fully contained at x=16, width=288, with confirmation field and both actions available. No browser errors were reported; console contained only React development/HMR messages; relevant requests completed successfully. Task sessions were closed.
- Limitation: the safe wrapper has no stable browser-zoom command, so 200% browser chrome zoom was represented by the guide's equivalent 320 CSS-pixel content width rather than measured independently.

### E-7 — Documentation, mapping and runtime startup

- Commands: `pnpm docs:user-flows:check`; `pnpm user-flow:e2e -- check dictionary-permanent-deletion`; `pnpm user-flow:e2e -- check dictionary-platform`; focused Prettier check of every changed source/document; `git diff --check`.
- Result: all passed after synchronizing the related dictionary-platform revision marker.
- Runtime: final `pnpm dev:all` applied migrations, started backend `4000`, web `3333`, admin `3001`, and a ready dictionary worker. The worker reported no queued/running deletion-dependent work.

## User-flow evidence

- New guide: `docs/user-flows/dictionary-permanent-deletion.md`.
- Related guide: `docs/user-flows/dictionary-platform.md`.
- Mapped file: `apps/web/tests/e2e/dictionary-permanent-deletion.journeys.spec.ts`.
- Both guide checks and all three mapped journeys pass in E-5/E-7.

## Review link

Findings, resolutions, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining gaps and risks

- Physical audio-object deletion remains asynchronous by design and uses the existing retrying cleanup inventory; the transaction tests prove the handoff and guards, not an external provider deletion.
- Database backups and copies already delivered to clients remain outside synchronous product deletion, as recorded by ADR-0023.
- Browser-level 200% chrome zoom is not directly observable through the safe wrapper; the exact 320 CSS-pixel effective layout and responsive component tests passed.
