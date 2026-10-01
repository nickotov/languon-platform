# Improvement: Inline AI auto-accept and regeneration controls

Status: Complete
Created: 2026-10-01
Updated: 2026-10-01

## Routing decision

- Focused existing-contract UX improvement implementing the approved
  [plan](../../docs/inline-ai-auto-accept-plan.md), original backlog task 1.
- No new public contract, schema, permission, dependency, model tool, worker,
  deployment, or persistent concept. Existing acceptance/update/read contracts
  retain validation, optimistic versions, ownership, provenance, and credits.
- User requested implementation, not the full feature lifecycle. Escalate before
  any root feature boundary; no such expansion is authorized.

## Context and scope

- Inline Add/Edit only: automatic result application, existing-entry full-form
  automatic persistence, new-entry explicit Create, session-local form versions.
- Excludes responsive columns, advanced rewrite, batch/document/import reviews.
- Related guide: `docs/user-flows/dictionary-platform.md`; two inline scenarios.
- Runtime Field/Button, existing tokens/icons/locales are the composition source.
- Local design: feature owns atomic application/version state; widget owns
  acceptance/readback/session coordination. Worker auto-accept would lose client
  manual edits and change contracts; form-owned HTTP would violate locality/FSD.
- Rollback: revert client behaviour and matching guide/tests; no data migration.

## Acceptance criteria

- AC-1 — Auto-apply Source-first compatible results; remove inline review/option
  controls; accessible Generate/Regenerate and one bulk action in four locales.
- AC-2 — Existing entries save the complete visible form and stay open; new
  drafts still require explicit Create. Editing/navigation pause during work.
- AC-3 — Preserve existing pre-generation version; preserve new pre-generation
  version only for non-Source content; append subsequent successful requests;
  history previews locally and explicit submission uses the displayed version.
- AC-4 — Preserve provenance, current optimistic versions, bounded proposal
  cleanup, retry-safe immutable acceptance, readback recovery, conflicts,
  cancellation, invalid candidates, and editor-session isolation.
- AC-5 — Focused/unit, mapped E2E, real-browser, affected lint/typecheck/build,
  guide traceability, and independent completion review establish final evidence.

## Plan

- [x] Commit approved documentation (`9377bbb`) and recheck scope/instructions.
- [x] Implement atomic draft application/history and widget automatic persistence.
- [x] Update inline controls/locales and regression coverage.
- [x] Synchronize guide/scenarios and run scoped checks and real browser evidence.
- [x] Author preflight, independent review, remediation, and final verification.

## Verification strategy

- Pure application/version rules: units; UI behaviour: authoring component tests.
- Persistence/retry/session rules: bounded coordinator tests and two existing
  deterministic full-stack Playwright journeys against disposable infrastructure.
- Desktop/320px, keyboard/text scaling and feedback: safe browser wrapper.
- Affected web tests/lint/typecheck/build; guide validation/revision checks.
- No backend or schema changes planned; full backend/database suite not required
  unless integration reveals changed persistence invariants. Tests never call models.
- Independent review required for auto-save/history concurrency uncertainty;
  separate tester only if new harness/infrastructure specialist triggers appear.

## Outcome and evidence

- Documentation committed as `9377bbb`; implementation completed with evidence below.
- Bounded worker owns dictionary-editor persistence and coordinator tests; main
  owns authoring feature/UI/locales and integration. No overlapping edits.
- Author preflight: web unit suite 276 tests/34 files, lint, typecheck and webpack
  production build pass. Two selected deterministic inline E2E journeys pass.
- Integration discovered the existing latest advanced rewrite query returned
  newer inline jobs, violating its single-card response contract. Added only a
  job-kind filter preserving owner/dictionary/card constraints; isolated store
  suite passes seven tests, including older rewrite and inline-only cases.
  This is existing-contract remediation, not a new schema/API/security policy.
- Guide validation (14 guides/16 tooling tests) and dictionary mapping pass.
- Final real-browser evidence and independent completion review pass below.

## Remaining risks and next action

- No unresolved material implementation or verification gaps. History intentionally
  remains editor-session-local; responsive columns remain separate backlog task 2.
- User explicitly requested the implementation commit after verified handoff.
  Commit the scoped delivery locally; no merge or push requested.

## Independent review and remediation

- Initial independent review covered HEAD `9377bbb` plus all scoped tracked and
  untracked changes; generated Next/runtime artifacts excluded.
- CR-01 (Medium, `use-card-draft.ts`): a subsequent fresh Source-only result after
  manual Source/context changes could replace version 1. Fixed by preserving a
  previously generated snapshot independently of successor status; regression passes.
- CR-02 (Medium, `editor-card-sheet.tsx`): corrected latest failed/invalid AI results
  could use ordinary Save and lose provenance. Latest live snapshots now accept
  their own job; historical saved snapshots omit selections/metadata and restore
  ordinarily. Frontend path assertions and real-database rejected/corrected human
  card acceptance prove Mixed authorship and AI-linked revision.
- CR-03 (Medium, `card-auto-save.ts`): accepted/readback recovery could silently
  rebase onto a concurrent edit. Store the accepted revision and verify canonical
  version/content; mismatch preserves the frozen candidate with conflict/Reload.
  Ambiguous accepted-job and later identical-revision cases are covered.
- CR-04 (Low, auto-save feedback): no-write responses misleadingly reported Saved.
  Internal unchanged outcome now renders localized no-change feedback; no wire
  contract change. Component/coordinator tests and live browser observation pass.
- CR-03-R1 (Medium): the footer still classified accepted conflicts as refresh
  failures. Added transport-independent reload-required metadata and conflict
  status without retry; body Reload stays available. Integrated regression passes.
- CR-04-R1 (Low): no-change feedback could survive later edits. Suppress both
  terminal success statuses when the displayed form is dirty; regression passes.
- Independent remediation verdict: CR-01–04 and both residual findings closed;
  no remaining material findings. Reviewer checked affected invariants/callers/tests
  rather than repeating the full review. Four-locale rendered evidence is complete.
- No separate tester: existing deterministic harnesses cover these seams, with no
  substantial new harness or unresolved infrastructure/concurrency gap.
- Security review not triggered: no material auth/ownership/trust/personal-data/
  SQL semantics change. The query only narrows job kind, preserving existing
  owner/dictionary/card predicates; independent review confirmed the boundary.

## Final verification and environment

- `pnpm --filter @languon/web test`: pass, 287 tests in 34 files, including 75
  authoring component/hook cases and 24 persistence/coordination cases.
- Web typecheck, lint, and webpack production build: pass after remediation.
  Backend typecheck and affected store/test ESLint: pass.
- Guarded real PostgreSQL store suite: pass, eight tests, using only separate
  disposable `languon_auth_inline_ai_lookup_test` at loopback port 55481 with
  `ALLOW_DISPOSABLE_DATABASE_TESTS=true` and matching confirmation. Verifies the
  single-card lookup/owner isolation and rejected-then-corrected mixed/AI revision
  provenance. No migration or schema changes.
- Final selected Playwright command, from repository root:

    ```sh
    AUTH_E2E_REUSE_SERVERS=true \
    AUTH_E2E_DATABASE_URL=postgresql://languon_test:local_test_only@127.0.0.1:55481/languon_inline_ai_e2e \
    AUTH_E2E_REDIS_URL=redis://127.0.0.1:56381 \
    AUTH_E2E_WEB_ORIGIN=http://localhost:3333 \
    AUTH_E2E_BACKEND_ORIGIN=http://localhost:4000 \
    pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts \
      --grep 'creates the displayed local version|automatically saves full inline forms'
    ```

    Pass: two Chromium journeys, 17.8s, deterministic worker, disabled credit/managed
    routing, compatible job formats, dedicated loopback DB/Redis, and fresh auth
    namespace. Proves both stable inline scenarios, historical Create/restore,
    reload, advanced rewrite access, 320px and 200% root text scaling. The other six
    guide scenarios were not rerun; supporting helper changes only update new
    Create/Close labels. An earlier final rerun hit reused signup quotas before
    reaching authoring; a fresh namespaced run passed without changing limits.

- `pnpm browser:check`: pass, nine safe-wrapper checks and real headless launch.
  Project-pinned agent-browser 0.33.0, Chrome, wrapper-owned session
  `languon-inline-ai-autoaccept-6e4bc8a2b963806d2360fcbdc64580f7`, synthetic local
  account/dictionary, same disposable services.
- Safe-wrapper observations at desktop 1280×800 and narrow 320×800: Generate versus
  Regenerate, normal automatically filled inputs, active progress/cancellation and
  disabled controls, explicit new Create, full existing form saving prior manual
  Example edits while remaining open, versions 1/2/3 and preview-only disabled
  generation, saved and no-change feedback, keyboard Tab focus.
- Rendered English, French, Spanish, and Russian editor actions/help/Close/Save
  checked; localized populated forms also inspected at 320px. No browser exceptions;
  console showed ordinary Next development/HMR notices. Network contained reviewed
  loopback traffic plus expected initial unauthenticated 401 and an intentional
  mistaken locale-path 404, not product failures. Real 200% text-scaling evidence
  is mapped Playwright, not a wrapper zoom claim. Failure/retry/conflict matrices
  are covered by deterministic automated tests.
- Ephemeral local screenshots under
  `/Users/nickkotov/.agent-browser/tmp/screenshots/`: `screenshot-1790873047166.png`
  (320px new generated draft), `screenshot-1790873357252.png` (desktop saved editor),
  and `screenshot-1790874213032.png` (Russian). Browser session closed.
- `pnpm docs:user-flows:check` and dictionary E2E mapping check: pass;
  revision `sha256:9ef55194a69ad754`, verification date 2026-10-01.
- Final formatting, local-link/diff hygiene, and task-owned process/container
  teardown are recorded in handoff checks. No paid model calls or temporary
  instrumentation; generated Next declarations restored by the standard dev builder.
- Handoff: scoped Prettier/local links/diff checks pass; browser and task-owned
  application processes closed. Exact task-created PostgreSQL/Redis containers
  `languon-inline-ai-autoaccept-postgres` and `languon-inline-ai-autoaccept-redis`
  stopped and auto-removed, deleting only disposable synthetic test data. No
  shared services or repository data removed. All AC-1–5 satisfied.
