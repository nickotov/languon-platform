# Verification evidence: Texts

Updated: 2026-10-16. Current UI preflight is recorded below; the original backend
checkpoint evidence remains valid for unchanged files. Final independent completion and security reviews are approved.

## Acceptance coverage

| Acceptance | Implementation                                                              | Evidence   | Status                |
| ---------- | --------------------------------------------------------------------------- | ---------- | --------------------- |
| AC-01/03   | Typed contracts, content service/store, optimistic save and pair provenance | E1, E2, E6 | Passed                |
| AC-02      | Source segmentation, provider output validation, durable proposals          | E1, E3, E6 | Passed                |
| AC-04/05   | Context selection and atomic dictionary publication                         | E1, E4, E6 | Passed                |
| AC-06      | Capability shares, active-source checks, independent copies                 | E2, E4, E6 | Passed                |
| AC-07      | Worker/admission/credits/purge/SQL guards and restricted roles              | E3–E5      | Passed                |
| AC-08      | Migration, regression, API and static verification                          | E1–E7      | Passed; review closed |
| AC-09      | Prompt and versioned handoff                                                | E8         | Saved; v003 selected  |
| AC-10      | Web design implementation                                                   | E9         | Passed; review closed |

## Tested state and environment

Base: `664198fee9eb1a0492134c43de9a9d04835568af`, branch `feature/texts`.
Uncommitted source identity is captured in `backend-preflight.sha256` (paths include
new/untracked files). Subsequent remediation records must identify changed files
and affected reruns. No evidence relies on HEAD alone.

Dedicated Docker PostgreSQL17 (`languon-texts-postgres-test`, loopback55443) and
Redis8 (`languon-texts-redis-test`, loopback56443) only. Each suite has an exclusive
`languon_auth_texts_<area>_test` database; journey uses `languon_auth_texts_test`.
Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, `AUTH_TEST_DATABASE_URL` to that
local disposable URL, `AUTH_TEST_DATABASE_CONFIRM` to the exact database name.
Redis journeys also set `ALLOW_DISPOSABLE_REDIS_TESTS=true`,
`AUTH_TEST_REDIS_URL=redis://127.0.0.1:56443/1` and matching
`AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56443/1`. All data synthetic. Deterministic
providers, no paid AI. Fixtures close clients/reset only guarded dedicated targets.

## Check records

### E1 — Contracts, domain, workers and affected static checks

- `pnpm --filter @languon/contracts test`: 97 tests passed.
- `pnpm --filter @languon/backend exec vitest run tests/unit`: 114 files,
  946 tests passed (34.42s). Includes new domain9, AI17, selection7 and shared
  runtime/admission regression coverage; no integration skips presented as proof.
- Contracts build/typecheck/scoped lint and prompts build passed.
- Backend `typecheck` and `build` passed (ESM plus declarations).
- Backend lint initially found one prefer-const in new runtime test; fixed and
  affected lint rerun. Final root records below supersede intermediate checks.

### E2 — Content persistence and migration

Run `pnpm --filter @languon/backend exec vitest run` with each indicated path:

- `tests/integration/modules/texts/infrastructure/text-content-store.test.ts`:
  11 passed after SEC-TEXTS-01 remediation; active ownership, draft/save/edit provenance, optimistic versions,
  live sharing, independent copies, lifecycle and idempotency. Database area content.
- `tests/integration/modules/texts/texts-migrations.test.ts`: 2 passed;
  upgrades pre-Texts schema0062 with existing user data, reruns safely and installs
  fresh through0067. Database area upgrade. Final SQL rerun recorded below.
- Migrations are additive. Runtime rollback disables new admissions; do not drop
  new user content as a rollback. No destructive down migration executed/promised.

### E3 — Durable AI lifecycle and settlement

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts`:
8 passed on area jobs (46s). Initial account policy, exact JSONB source alignment,
measured credit settlement, concurrent admission winner, lease recovery/fencing,
immutable snapshots, estimated-to-reported usage, cancellation, deletion before/after
dispatch, stale document and105-row expiry cleanup. Units validate full-input
preflight, malformed output, safe HTTP errors and advisory detection.

### E4 — Selection publication and restricted worker

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/text-selection.test.ts`:
10 passed on area selection. Actual dictionary-worker role publishes a card/new
dictionary from a foreign shared text; attempts to mutate share secret/version,
account/pricing fail. Covers revocation during dispatch, concurrent dictionary
version publication (one winner), deletion quiescence, cancellation, rate-limit
retry with per-attempt capacity and unknown-dispatch fencing. Selection units7 pass.

### E5 — Shared accounting and account erasure

- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/text-ai/text-ai-capacity.test.ts`:
  11 passed on area shared, all three new kinds counted, archives included,
  old-worker capacity guard, concurrent admission and drain.
- Existing AI-credit integration suites: 24 passed on area shared after new guards.
- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-account-purge.test.ts tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts`:
  11 passed on area purge. Owned/foreign cancellation, credit blocking, numeric-only
  archives, restricted role denying raw context access, preserve independent foreign
  copies/cards, detach receipts and complete user tombstone.

### E6 — Registered real API journeys

`node scripts/run-texts-e2e.mjs`: 5 passed against real authentication/Hono,
PostgreSQL/Redis, actual configuration/credits and deterministic providers.

- `texts/owner-translates-edits-and-collects`: create draft, generate proposal,
  explicit save, edit provenance, concurrent identical collection admission,
  one durable job and one dictionary/card.
- `texts/shared-reading-copy-and-revocation`: anonymous capability read, independent
  copy, revocation and public security headers.
- Expiry cleanup of205 jobs in three batches retains safe receipts and scrubs raw data.
- `node --test scripts/run-texts-e2e.test.mjs`: 2 passed; rejects unsafe environment.
- Guide: [texts](../../../docs/user-flows/texts.md); mapped test
  `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts`.
  Final revision synchronization and refreshed run recorded below.

### E7 — Author preflight/final checks

- Final additive migration upgrade/fresh/rerun suite2/2 passed against current0064–0067.
- Full backend lint and final typecheck passed. Final backend build passed ESM/DTS.
- After remediation, focused backend worker/Text domain/AI HTTP units35/35 passed.
- Prompts5/5 tests and prompts/contracts typechecks passed; web/admin consumer
  typechecks passed. No frontend source changed.
- After middleware remediation, real composed-app runner5/5 passed09:58:10UTC:
  existing profile/dictionary PATCH preflight, new PUT/DELETE/shared headers,
  disallowed origins,17k ASCII and20k Unicode texts, no selection-rate leakage.
- `pnpm user-flow:e2e -- check texts` passed for revision
  `sha256:c8f5974b7526256f`; `pnpm docs:user-flows:check` passed16 checker tests
  and22 guides. Journey marker-only synchronization followed semantic review.
- Initial and bounded remediation reviews approved; all findings closed in
  [REVIEW.md](REVIEW.md), with independent report hashes/locations.
- Backend verified manifest [backend-verified.sha256](backend-verified.sha256),
  SHA-256 `afa35be15d878b4bd4c617159ef9b45807ff1fee6a7522fb55189da54faa2e0c`.
  This supersedes preflight for repaired routes/resolver/tests. No backend source
  changes followed this manifest.

### E8 — Design handoff

[Canonical prompt](../../../docs/design-prompt/texts.md) saved after backend
approval; [DESIGN.md](DESIGN.md) records complete immutable v001/v002 snapshots/hashes,
source manifest, references and no selected implementation target. TXT-01–TXT-28
map all required desktop/mobile flows, semantics and recovery states. Current
app shell, dictionary surfaces, UI primitives and runtime tokens were inspected.
No generated design exists yet. Final formatting/diff/snapshot checks recorded in
ExecPlan before the local checkpoint commit.

## Limits and remaining work

No UI exists yet and no browser/device/design fidelity is claimed. No production
migration, activation, deployment or paid provider was exercised. AI admissions
remain default-off until existing release/configuration/worker compatibility gates
are deliberately activated. 20,000-code-point input cap does not imply every model
can translate that size; complete-input/output preflight may require a shorter text
or larger-capacity model. Independent review is approved and the design prompt is saved. Frontend waits for
retrievable Magic Patterns source and UI integration; the overall feature is not complete.

Final handoff: all changed-file formatting and `git diff --check` pass. Contracts/
prompts lint pass. Canonical prompt equals frozen v002 byte-for-byte, SHA-256
`093fe7e224bde2764dd26f786a297c465b9259e746343677524f96f121325c64`.
All95 verified backend hashes still match. The two dedicated labelled test
containers were removed after checks; development containers were untouched.

## Frontend API checkpoint — 2026-10-15

The user returned and selected the Texts/related-components Magic Patterns OS URL;
source/provenance and access attempts are recorded in DESIGN.md. Neither the
connector nor the available GUI permissions currently expose its source. A direct
component/preview link has been requested. No Texts visual implementation exists.

Independent safe progress: `apps/web/src/fsd/entities/texts/` provides the typed
API boundary for all implemented content, lifecycle, capability-sharing/copy,
AI and contextual-collection endpoints. No nonexistent folder-get route added.
Request/response validation uses shared contracts; share keys remain headers,
requests use no-store, operation/version IDs survive, and errors remain compatible
with the existing authenticated session refresh mechanism.

- `pnpm --filter @languon/web exec vitest run tests/texts-api.test.ts`:12/12 passed
  with mocked fetch; verifies serialization/validation, correct methods/envelopes,
  full Unicode input, capability isolation, error projection and cancellation
  before/after HTTP response headers. This is adapter proof, not browser/E2E proof.
- `pnpm --filter @languon/web typecheck`: passed.
- Scoped ESLint on the entity and test: passed; `git diff --check`: passed.
- Independent bounded correctness/security audit: [review-web-api.md](review-web-api.md).
  Initial WEB-API01 body-consumption cancellation finding remediated; independent
  focused review approved and12/12 tests independently rerun. Existing backend reviews/evidence preserved.
- No frontend route/component is wired yet. Browser, responsive, fidelity and
  complete real-app journeys are pending source access and actual UI integration.
  Existing API journey guide unchanged because no executable user behavior changed.

## Final UI author preflight — 2026-10-16

- Selected design/editor `3bkwp6aroumx9kbdrfpju5`, pinned artifact
  `1d26e57d-ae12-4537-8e01-45e75e40456b`. Exact64 nonempty sources +18 explicit
  inherited primitive placeholders and hashes saved in v003. Parent screen/source
  inventory UI-01–UI-40 and truthful platform adaptations D5–D8 are in FEATURE.md.
- Real responsive library/folder/fullscreen workspace/paired reader/collection/
  public share/copy/revoke are implemented, with all4 existing locale catalogs.
  Existing primitives, CSS Modules and geometry/semantic tokens retained; shared
  Dialog uses Lucide X and dark-safe semantic text; popover host respects native
  modal top layer. No production dependency or database migration added for UI.
- `pnpm --filter @languon/web test`:76 files,629 tests passed16.03s, after native
  popover fix; focused reader15/15, library7/7, workspace8/8, public4/4 and shared
  management/auth/style guard20 checks included/independently verified as applicable.
- `pnpm --filter @languon/contracts test`:12 files,100 passed. Includes updated
  optional metadata, XOR copy destination and optional draft operation ID.
- Owner content PostgreSQL suite14/14 passed on exclusive `ui_metadata_test`:
  real active/draft/archive counters and share state; public omission, atomic
  new-folder copy rollback/replay/conflict and concurrent idempotent draft creation.
- Web/backend typechecks, full web lint, web styling contract, web production build
  and backend ESM/DTS build passed. Scoped backend content/contract ESLint passed.
- `pnpm test:e2e:texts` on the exact exclusive `ui_web_test` +Redis56443/1 passed:
  5 backend API tests (4.04s), then3 real browser journeys (26.8s). Real auth/session,
  HTTP, PostgreSQL, Redis, credit/job/provider boundaries; only external AI/email
  are deterministic. No API interception or force-click substitutes. Stronger
  multi-paragraph/context regression coverage is being added before handoff.
- Browser journeys explicitly save/reload/edit/reload, collect a full card and
  navigate dictionary; actual unlisted share/create/copy/revoke protects an
  independent copy; phone tabs/counterpart/collection and390/320 overflow pass.
  Console/page-error/failed-request/5xx assertions are clean. Original fullscreen
  portal bug reproduced through real pointer interaction and resolved/covered.
- Guarded combined runner refuses wrong exact database, ports/RedisDB and reused
  debug servers before any reset.6 runner safety tests pass. Source guide mapping
  `sha256:acf772fc455606f8`; all22 guides +16 checker tests pass.
- Additional safe-wrapper browser session
  `languon-texts-ui-31048ddb059785469f3ce28194a5dc3c`, project-pinned CLI via
  `scripts/agent-browser.mjs`, local3335 real fixture, desktop1440x900 and phone
  320x850: inspected New folder Name/Description/counter/actions, focus/Escape,
  sidebar/mobile layout and dark dialog contrast. No page errors; only expected
  development HMR/Insights console diagnostics. Session closed after capture.
- No provider-network/paid-AI, production migration/activation/deployment or
  external screenshot pixel-match claim. Reference source-based comparison is
  explicit; source OG image was generic branding and was not used as evidence.
- Independent completion correctness/security reviews are next; source identity
  frozen in `ui-preflight.sha256`. No overall completion claim until findings,
  remaining focused checks and final durable records close.

### Multi-paragraph editing regression — 2026-10-16

The strengthened real-browser owner journey translated three sentences across two
paragraphs and collected “bank” with its preceding edited river sentence as context.
It exposed lost structural whitespace when replacing an entire sentence textarea.
The workspace now displays lexical content separately and restores each saved
pair's original leading/trailing separators independently on both sides.
A red-first regression reproduced three failures; all14 focused workspace tests
now pass, including exact paragraph joins, CRLF/NBSP/internal whitespace, stable
IDs and whitespace-only rejection. Web typecheck and scoped lint pass. The strict
real-browser rerun is pending; its assertions were preserved.

### Paragraph-neighbor contextual extraction regression — 2026-10-16

The strict native-pointer browser selection reached the real contextual job but
its deterministic provider rejected missing river context. Node24's sentence
segmenter returned a whitespace-only final unit for the preceding paragraph.
Both containing-pair and neighbor extraction now discard blank units while
retaining original nonblank text and offsets. Three red-first domain regressions
failed before the fix (source side, translation side, and edited multi-sentence
pair). The affected Texts/dictionaries suites now pass52 files/390 tests.
The browser context gate remains strict; the final rerun is in progress.

### Final reviewed UI verification — 2026-10-16

- Full web suite:80 files/650 tests pass after account isolation, save locking,
  compact recovery and paragraph/offset remediations.
- Focused reader22, workspace19, public-copy5 regressions pass; full web lint,
  styling contract and typecheck pass.
- Context extraction remediation:52 backend Texts/dictionaries suites/390 tests
  pass; backend typecheck, scoped context lint and ESM/DTS build pass.
- Contracts100, real content DB14, migration fresh/upgrade2 and unchanged
  backend worker/credit/retention evidence above remain applicable to their
  unchanged surfaces. No new schema or provider integration was introduced.
- Independent completion findings UI-CR-01–04 and security findings SEC-UI-01–02
  are remediated. Security independently reran22 targeted checks and approved;
  the final context filter delta was separately approved. Completion approval
  awaits the final current-source browser/API execution results below.
- Current227-file code identity: ui-preflight.sha256, manifest SHA-256
  `87a05c34e3896e054af59994b073760d720ce773134673e8532f7e3f1e70837a`.

Final browser/API result, production web build and local Git integration pending.

### E9 — Verified final source, runtime and review closure

Final selected-design implementation is complete. The full browser run
`texts-mva1i37n` passed3/3 in28.1s: native-pointer contextual bank→orilla/full card
persistence, both-column paragraph-preserving edits, public copy/revocation and
phone reading/collection. The current-source backend journey refresh passed5/5
in3.11s. After the CSS-only header fidelity correction, phone-only
`texts-mva1mqxc` passed1/1 (14.7s overall), including inspected390px and320px
headers with no clipping/overflow. Its four phone captures were refreshed.
No behavior/test assertions changed after those runs; the spec's final change
was formatting only. All fixture/server processes cleaned up normally.

Final production web build, backend ESM/DTS build, web/backend typechecks, full
web lint, scoped backend lint, styles contract, frontend architecture9 checks,
runner safety6 checks and guide validator16 tests/22 guides pass. Texts maps all
five stable scenarios at revision `sha256:acf772fc455606f8`. The final full web
suite passed80 files/650 tests; the affected backend suites passed52 files/390.
Prior contracts100/DB14/migrations2 and unchanged subsystem evidence remain
valid at the documented boundaries. No paid AI or production migration ran.

Independent completion review approved every finding and the final whitespace
context/rendering/CSS deltas. Security approved both findings and the final
context delta. The separate tester verified real auth, HTTP, PostgreSQL, Redis,
jobs/credits, save/reload and dictionary persistence with deterministic external
AI/email only. Reviews and exact reviewed identities are linked in REVIEW.md.

Final227-file source manifest: [ui-preflight.sha256](ui-preflight.sha256), SHA-256
`3894b0517afc36d9d4e47d748ab2fed4b9adbd264ffe12402dbb850df5f76fea`.
Exact82-entry provider source snapshot hashes remain unchanged. Nine inspected
runtime screenshots are retained in the selected v003 captures directory.
Source-based fidelity is established; no provider screenshot pixel-match claim
is made because the provider supplied source and18 empty primitive placeholders.

Production activation/deployment and nondeterministic provider-network testing
remain outside this delivery. TEXTS_AI_ENABLED defaults off per the rollout
guide. The UI is available at /texts. No unresolved implementation blocker remains.

Cleanup verified: only the two labelled `texts-ui-disposable-test` PostgreSQL/Redis
containers and their test volumes were removed. Existing development services
were untouched. Final formatter/diff checks pass; all82 provider entries and227
code-manifest entries match their retained hashes.

Verified implementation source commit: `c6aa380a62260242a454d775dc782dd78cd82b13`. Final delivery records
contain no source change after that revision; source identity remains the final
227-file manifest. Local integration uses one squash commit on main and retains
the feature branch without pushing or deploying.
