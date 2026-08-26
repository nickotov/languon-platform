# Verification evidence: Dictionary Platform

Updated: 2026-08-26

Milestone 0 architecture and visual-contract work, Milestone 1 core dictionary
authoring, Milestone 2 persistent single-card AI review, M2.6 shared-kit UI
actualization, Milestone 3 pasted-term generation, and Milestone 4 fail-closed
single-review document ingestion are complete. M2 adds
durable proposals, a separately deployed fenced worker, bounded provider
execution, review/conflict UI, rollout compatibility, and a third executable
browser journey. M3 adds bounded batch proposals and atomic selected-card
acceptance. M4 adds private transient upload, scanning, bounded extraction/OCR
orchestration, cleanup-gated publication, and one final editable review.
Import/export is complete through M5. M6 full-feature integration, verification,
operational evidence, and independent review are complete.

The 2026-08-23 planning checkpoint inserted an M2.5 design approval gate. On
2026-08-25 the user explicitly removed that gate and authorized runtime UI
composition from the shared UI kit. ADR-0016 records the repository-wide
authority change; the completed M2.5 boards remain optional historical input.

## Planning and repository inspection

- `git merge main` — merged local `main` into `feature/dictionary-platform`.
  The ADR index conflict preserved accepted ADR-0011 through ADR-0014. The
  `.pen` conflict retained the consolidated current design-system canvas;
  pre-merge dictionary boards remain available in feature history as M2.5 input
  because their legacy component identities cannot be safely combined with the
  rebuilt canvas.
- `$ui-ux-composition` and its complete rendered review checklist were read and
  translated into the M2.5 screen contract, comprehensive state/viewport
  inventory, Pencil-only editing rule, and explicit user-acceptance gate.
- Pencil `get_app_state` confirmed the merged `design/main.pen` is the current
  consolidated canvas with the design-system and reviewed web-dev-panel boards;
  dictionary boards are intentionally pending recomposition in M2.5 rather than
  retained with broken legacy component references.
- Post-merge planning checks passed: `pnpm format:check`,
  `pnpm agent-skills:check` (9/9 validator tests; 16 skills),
  `pnpm docs:user-flows:check` (16/16 tests; eight mappings),
  `pnpm user-flow:e2e -- check dictionary-platform`, `git diff --check`, and
  `git diff --cached --check`.

- `pnpm feature:new -- dictionary-platform "Dictionary Platform"` — passed;
  created the four required feature artifacts.
- `pnpm user-flow:e2e -- inspect web-ui-kit` — passed; mapping synchronized.
- `pnpm user-flow:e2e -- inspect mastra-agent-development-harness` — passed;
  mapping synchronized.
- `pnpm user-flow:e2e -- inspect release-deployment-platform` — passed; mapping
  synchronized.
- `pnpm exec prettier --check '.agent/features/dictionary-platform/*.md'` —
  passed after formatting the generated planning artifacts.
- `pnpm docs:user-flows:check` — passed; 16 validator tests and all six current
  guide/E2E mappings remain valid.
- Governing root/backend/web/package instructions, `.agent/PLANS.md`, relevant
  accepted ADRs, architecture, design contract, current persistence/Mastra/
  deployment seams, and related user-flow guides were inspected before writing
  `FEATURE.md` and `EXEC_PLAN.md`.

## M0 architecture and design contract

- Added and indexed Accepted ADR-0011 for typed dictionary/card persistence,
  independent forks, explicit future references, inheritance, revisions,
  capability access, caching/rendering, and idempotency.
- Added and indexed Accepted ADR-0012 for fenced PostgreSQL work, full-stack
  job/proposal version rollout, review-payload retention, admission budgets,
  exact-version uploads, scanning, worker-local parser confinement, OCR, and
  cleanup.
- Synchronized `docs/architecture.md` and the new
  `docs/operations/dictionary-jobs-and-documents.md` while labeling the worker/
  upload topology as approved target state rather than deployed reality.
- Extended `design/DESIGN_SYSTEM.md` to version 0.3 and added `Dictionary
authoring` plus `Dictionary generation and review` boards with reusable
  library, settings, card, compact, public/fork, proposal, batch, and document
  patterns in `design/main.pen`.
- Recorded contract/ownership, settings-resolution, data-flow, and threat/failure
  diagrams in `EXEC_PLAN.md`.

### Exact M0 checks

- `pnpm format:check` — passed; every Prettier-supported repository file is
  formatted. `.pen` has no Prettier parser and is verified structurally below.
- `pnpm docs:user-flows:check` — passed; 16/16 validator tests and six current
  guide/E2E mappings are valid.
- `pnpm user-flow:e2e -- check web-ui-kit` — passed; one current mapping valid.
- `pnpm user-flow:e2e -- check release-deployment-platform` — passed; one current
  mapping valid.
- `git diff --check` — passed.
- ADR sequence/index command — passed:

```sh
node --input-type=module -e 'import { readdir, readFile } from "node:fs/promises"; const names = (await readdir("docs/adr")).filter((name) => /^\d{4}-.*\.md$/.test(name)).sort(); if (names.at(-1) !== "0012-dictionary-worker-and-document-ingestion.md") throw new Error(`Unexpected latest ADR: ${names.at(-1)}`); const index = await readFile("docs/adr/README.md", "utf8"); for (const id of ["ADR-0011", "ADR-0012"]) if (!new RegExp(`${id}.*Accepted`).test(index)) throw new Error(`${id} is not indexed as Accepted`); console.log("ADR sequence and index valid");'
```

- Design JSON, unique-ID, board-parent, and reusable-symbol command — passed:

```sh
jq -e '([.. | objects | .id? // empty] | group_by(.) | map(select(length > 1)) | length) == 0 and (.children | map(.id) == ["dsRoot","adminOperations","dictionaryAuthoring","dictionaryGenerationReview"]) and (.children[2].children | map(.id) | index("dictionaryPublicSharingPattern") != null) and ([.. | objects | select(.reusable? == true) | .id] | (["dictionaryLibraryPattern","dictionarySettingsPattern","dictionaryCardEditorPattern","dictionaryCompactEditor","dictionaryCardListPattern","dictionaryStateMatrix","dictionaryPublicSharingPattern","dictionaryGenerationProgress","dictionaryOriginalCard","dictionaryProposalCard","dictionaryProposalCompact","dictionaryBatchReview","dictionaryDocumentIngestion"] - . | length) == 0)' design/main.pen
```

- Local Markdown link command — passed; every relative link target in the M0
  feature, ADR, architecture, operations, and design documents exists:

```sh
node --input-type=module -e 'import { access, readFile } from "node:fs/promises"; import { dirname, resolve } from "node:path"; const files = process.argv.slice(1); const missing = []; for (const file of files) { const text = await readFile(file, "utf8"); for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) { const href = match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0]; if (!href || /^(?:[a-z]+:|#)/i.test(href)) continue; const target = resolve(dirname(file), decodeURIComponent(href)); try { await access(target); } catch { missing.push(`${file}: ${href}`); } } } if (missing.length) { console.error(missing.join("\n")); process.exit(1); } console.log(`Checked ${files.length} Markdown files`);' .agent/features/dictionary-platform/FEATURE.md .agent/features/dictionary-platform/EXEC_PLAN.md .agent/features/dictionary-platform/EVIDENCE.md .agent/features/dictionary-platform/REVIEW.md docs/adr/README.md docs/adr/0011-dictionary-persistence-and-composition.md docs/adr/0012-dictionary-worker-and-document-ingestion.md docs/architecture.md docs/operations/README.md docs/operations/dictionary-jobs-and-documents.md design/DESIGN_SYSTEM.md
```

## Automated tests

### Unit

- `pnpm --filter @languon/languages test` — passed, 1 file / 3 tests.
- `pnpm --filter @languon/contracts test` — passed, 4 files / 32 tests.
- `pnpm --filter @languon/backend test` — passed, 43 files / 291 tests; 9 files /
  63 tests correctly skipped behind disposable-infrastructure guards.
- `pnpm --filter @languon/web test` — passed, 16 files / 81 tests.
- Behavior includes catalog/canonical tags, bounded domain values, raw/effective
  settings and dormant dependencies, pair locking, authorship transitions,
  ordering/lifecycle, HMAC domain separation, rate limiting/error mapping,
  capability-only frontend transport, asynchronous language defaults, inert
  malicious strings, duplicate warnings, cursor accumulation, and auth-fragment
  return.

### Integration and contract

- Shared contracts passed lint, typecheck, tests, and build for both
  `@languon/languages` and `@languon/contracts`.
- Disposable PostgreSQL command:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
AUTH_TEST_DATABASE_URL=postgres://languon_dictionary:languon_dictionary@127.0.0.1:55433/languon_auth_dictionary_test \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_dictionary_test \
pnpm --filter @languon/backend exec vitest run --fileParallelism=false \
  tests/integration/database/migrations.test.ts \
  tests/integration/modules/dictionaries/dictionary-composed-routes.test.ts \
  tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts
```

- Result: passed, 3 files / 21 tests.
- Verified clean/idempotent/concurrent migration execution and ledger behavior;
  typed/check/FK/index catalog shape; current typed reads independent of revision
  JSON; owner isolation; immutable revisions; raw/effective settings; all-card
  pair lock; active ordering/search/cursor behavior; capacity; keyed idempotency;
  secure rotate/read/revoke; replay-first fork idempotency after rotation/archive;
  snapshot-bound owner/public cursors; 10,000-card indexed search/reorder/fork;
  cancellation after lock waits; exact/serialized owner quotas; and independent
  fork behavior. Fork admission is acquired before any owner/source lock; the
  concurrency case holds all four permits plus the target owner row and proves
  an excess request fails without waiting on that row or occupying a queued
  pool connection.
- A real-stack browser failure exposed wildcard admin/auth CORS handlers consuming
  later product routes. They are now scoped to `/admin/*` and `/auth/*`, with 29
  focused authentication/administration/dictionary HTTP regression tests passing.

### E2E

- Environment: task-owned loopback PostgreSQL on `127.0.0.1:55433` and Redis on
  `127.0.0.1:56379`; Playwright started the real backend and Next.js app.
- Command:

```sh
AUTH_E2E_DATABASE_URL=postgres://languon_dictionary:languon_dictionary@127.0.0.1:55433/languon_auth_dictionary_test \
AUTH_E2E_REDIS_URL=redis://127.0.0.1:56379/7 \
AUTH_E2E_WEB_ORIGIN=http://localhost:3333 \
AUTH_E2E_BACKEND_ORIGIN=http://localhost:4000 \
pnpm --filter @languon/web exec playwright test \
  tests/e2e/dictionary-platform.journeys.spec.ts
```

- Result: passed, 2/2 journeys in Chromium twice consecutively against the same
  PostgreSQL database and Redis logical database (14.9 s, then 13.0 s); the
  final settled fork-admission implementation also passed 2/2 in 15.6 s.
- Playwright derives a fresh opaque authentication Redis namespace per
  invocation and passes it to both the rate limiter and WebAuthn challenge
  store. The repeated run proves stale rate-limit state cannot poison a later
  invocation; the harness neither flushes Redis nor weakens production limits.
- `owner-creates-edits-and-restores-dictionary`: signup/verify, create, inherited
  optional settings, card create/edit, card archive/restore, dictionary archive/
  restore, language-pair lock, home navigation, 320 px/200% text reflow, focus
  visibility, and no horizontal overflow.
- `anonymous-reader-forks-unlisted-dictionary`: explicit share rotation,
  anonymous content/no-owner read, no-store/no-referrer headers, key only in the
  API header, fragment preserved through signup/verification, private independent
  fork, rotation/archive revocation, and no key in request URLs or browser storage.

## Real application verification

- Tool: project-pinned `agent-browser` 0.33.0 through the safe wrapper; wrapper
  tests and headless doctor passed 9/9 with Chrome for Testing 152.0.7977.42.
- Environment: real local backend/Next.js, disposable PostgreSQL/Redis, isolated
  session `languon-dictionary-m1-40184fc77aeb7a01665c1fa9801a0997` (closed).
- Scenario: fresh fake signup/verification, empty dictionary library, creation,
  settings/card editor inspection at 320×900 and 1440×1000, responsive labels,
  correct English→Spanish defaults, optional-field language labels, and native
  accessible controls.
- Result: passed after fixing the async-catalog native-select default defect.
  Browser `errors` was empty. Console contained development HMR/React DevTools
  messages only. Network requests stayed on `localhost`; all product requests
  succeeded, with the expected initial unauthenticated `/auth/refresh` 401.
- No screenshots were retained because the semantic snapshots and automated E2E
  evidence were sufficient. The fake local dictionary remains only in the
  disposable database and has no production identity.

## User-flow guide verification

- Guides created or updated: added draft
  `docs/user-flows/dictionary-platform.md` and indexed it. It documents only the
  executable M1 browser/API surface and names later milestone limits.
- `pnpm docs:user-flows:check` — passed, 16/16 validator tests and seven guide
  mappings.
- `pnpm user-flow:e2e -- check dictionary-platform` — passed, one guide/test and
  two synchronized scenario markers.
- Exact E2E file: `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- The guide intentionally remains `draft` until M2–M5 add the other canonical
  generation/document/import journeys.
- The `web-ui-kit` and `release-deployment-platform` guides were not changed:
  M0 adds product-specific future design and target operations contracts but
  changes no observable current theme or deployment-rehearsal behavior. Their
  mappings were checked; executing unchanged journeys would not validate M0.

## Static checks

- Focused Prettier checks and `git diff --check` passed after formatting the M1
  source and evidence artifacts.
- Languages, contracts, backend, and web lint passed.
- Languages, contracts, backend, and web typecheck passed.
- Languages, contracts, backend, and web production builds passed.
- Web Next.js production build passed with owner/public dictionary routes dynamic;
  Storybook production build passed with dictionary settings/card/list stories.

## Database verification

- Migration `0008_dazzling_lenny_balinger.sql` and matching Drizzle snapshot/
  journal were generated from the module-owned schema and applied successfully to
  a clean disposable PostgreSQL database.
- Forward, rerun-idempotency, concurrent-locking, and repository invariant checks
  passed in the 21-test command above.
- No destructive down migration was invented. M1 is an additive forward
  migration; rollback is application-version compatibility plus retained schema.

## Review

- M0 architect: approved after the initial six findings and follow-up issues were
  remediated; no high or material-medium architecture issue remains.
- M0 product-owner: original five findings resolved; low Markdown/DOCX paragraph
  ambiguity also clarified with matching M4 parser cases.
- M0 tester: architecture/test contracts and focused checks passed; stale durable
  state finding is resolved by this evidence and the matching ExecPlan update.
- M0 security reviewer: approved after the original eight findings plus
  full-stack rollback compatibility and presigned replay/physical-byte findings
  were remediated; no high or material-medium security issue remains.
- Independent M1 reviewer, tester, and security reviewer approved the settled
  milestone after remediation. No critical, high, or material-medium M1 finding
  remains; exact resolutions are recorded in `REVIEW.md`.

## M2 persistent worker and single-card AI proposal

### Delivered behavior

- Added schema-validated generation contracts, capabilities, deterministic local
  prompt fallback, provider-neutral Mastra composition with no tools, hidden
  input/output traces, sanitized failure categories, and no paid calls in tests.
- Added PostgreSQL jobs/proposals with idempotent enqueue, immutable input/version/
  language snapshots, monotonic lease fences, cancellation, heartbeat/retry,
  review expiry, terminal redaction, discovery, editable candidate acceptance,
  accepted-job revision provenance, and server-owned authorship transitions.
- Added transactional owner/global queue/provider admission, fair bounded claims,
  provider/spend/queue-age circuits, conservative per-dispatched-attempt
  reservation and settlement, and an immutable five-field provider budget tuple
  used by every claim, retry, model call, and terminal path.
- Added the dictionary worker command using the backend image, DB-only expand
  readiness, activation-only bounded provider readiness, least-privilege worker
  database policy, sanitized process logs, bounded concurrency and graceful
  shutdown, plus schema-v2 release capabilities and format retirement gates.
- Added the localized web proposal journey with persisted reload/deep link,
  original/proposed comparison, alternatives and warnings, cancel/discard/
  regenerate/accept actions, conflict recovery, and rollback-readable retained
  review when new enqueue is disabled.

### Final automated evidence

- `pnpm --filter @languon/contracts test` — passed, 4 files / 35 tests.
- `pnpm --filter @languon/prompts test` — passed, 1 file / 2 tests.
- `pnpm --filter @languon/backend test` — passed, 48 files / 326 tests;
  10 files / 83 tests remained correctly infrastructure-gated.
- `pnpm --filter @languon/web test` — passed, 17 files / 88 tests.
- Contracts, prompts, backend, and web lint/typecheck passed. Drizzle
  `db:check` passed. Contracts, prompts, backend, and Next.js production builds
  passed; Storybook built the generation review/rollback states successfully.
- Fresh disposable PostgreSQL command:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
AUTH_TEST_DATABASE_URL=postgres://languon_dictionary:languon_dictionary@127.0.0.1:55436/languon_auth_dictionary_m2_final_integration_test \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_dictionary_m2_final_integration_test \
pnpm --filter @languon/backend exec vitest run --fileParallelism=false \
  tests/integration/database/migrations.test.ts \
  tests/integration/modules/dictionaries/dictionary-composed-routes.test.ts \
  tests/integration/modules/dictionaries/infrastructure/dictionary-worker-version-overlap.test.ts
```

- Result: passed, 3 files / 27 tests. Coverage includes migrations 0009–0012,
  independent concurrent claims, fencing/recovery, old/new format overlap,
  authorship/no-op/provenance, expiry and cancellation redaction, provider
  reservations/circuits, more-than-25 legacy cancellation sweep, immutable
  job-policy compatibility, and retry/cancel/stale cost settlement.
- `pnpm test:release-deployment` — passed, 89/94 tests with five documented
  infrastructure-gated cases. The separately enabled Docker/PostgreSQL worker
  role and overlap journey passed 11/11, including partial/excess privilege
  denial and bidirectional budget/format rollback compatibility.
- `LANGUON_DEPLOY_E2E=true node --test
infra/deploy/tests/local-rehearsal.journeys.test.mjs` — passed, 1/1 in
  215.4 seconds after all four immutable images built. It verified migration,
  readiness, traffic switch, injected migration failure with active-slot
  preservation, a second release, rollback without an older migration, worker
  drain, and complete container/volume cleanup.

### E2E and real application

- Final mapped Chromium command used task-owned PostgreSQL on port 55436 and an
  isolated Redis logical database on port 56382; it passed all 3/3 dictionary
  journeys in 23.3 seconds. The M2 scenario creates a card, enqueues the
  deterministic worker, reloads the persisted proposal, exercises a stale review
  conflict/compare path, regenerates, and accepts without backend mocks.
- `pnpm docs:user-flows:check` passed 16/16 and all seven mappings. Dictionary,
  Mastra development harness, and release deployment mapping/revision checks all
  passed.
- The project-pinned browser wrapper exercised real backend, Next.js, PostgreSQL,
  Redis, and deterministic worker with fake local signup data. The proposal
  remained available after reload and fresh login, accepted successfully, and
  remained usable at 320×800. Browser errors were empty; console output was only
  development tooling/HMR; traffic stayed on localhost apart from the expected
  pre-auth refresh 401. The isolated browser session was closed and no screenshot
  was retained.

### Rehearsal discoveries and remediation

- The first full rehearsal found that a second manifest changed `sourceSha` while
  reusing images whose static admin health file contained the original SHA.
  The rehearsal now changes only release identity/workflow metadata for reused
  images, so readiness continues to verify the real immutable revision.
- The same run proved an idle worker retained the losing 295-second timeout from
  `Promise.race`, consuming Docker's full grace period after leases and database
  connections were gone. Shutdown now cancels losing timers; a fake-timer unit
  regression leaves zero timers, and the final deployment drain completed in
  under one second.
- Docker twice exhausted only unused BuildKit cache during iterative full-image
  verification. After inspecting `docker system df`, 13.16 GB of unused build
  cache was removed with `docker builder prune --force`; images, containers,
  volumes, shared services, and application data were not removed.

### M2 review outcome

- Independent tester approved PostgreSQL claim/authorship/provenance/redaction/
  budget coverage after the final task-owned E2E and browser runs.
- Independent correctness reviewer approved after cancellation/expiry,
  compatibility, budget, privilege, minimum-envelope, and database-constraint
  remediation. No material finding remains.
- Independent security reviewer approved the settled AI/worker/deployment
  boundary with no critical, high, or material-medium finding. Exact resolutions
  are recorded in `REVIEW.md`.

## M2.5 comprehensive dictionary design

### Screen contract and reused system

- Primary task: let a learner or tutor create, maintain, review, share, fork,
  import, and export a bilingual dictionary while remaining in control of every
  manual or AI-assisted change.
- Inspected sources: `design/DESIGN_SYSTEM.md`, the current Pencil variables and
  reusable symbols, implemented M1/M2 dictionary web composition and styles,
  feature/plan requirements, and the complete UI/UX review checklist.
- Reused Pencil primitives: Button, IconButton, Field, Textarea, Checkbox, Select,
  Badge, Card, Inline alert, Progress, Skeleton, Empty state, Error state, Dialog,
  and the shared semantic color, type, spacing, radius, control, focus, and motion
  variables. No competing visual tokens or runtime component contract was added.
- Structure: collection-first library; separate owned detail/settings and card
  collection; focused card editor; dedicated public/fork, AI, batch, document,
  and transfer review surfaces; compact table-to-card transformations; persistent
  conflict/recovery content rather than toast-only explanations.

### Pencil boards and coverage

The authoritative `design/main.pen` now contains these user-visible roots:

- `Gziu0` — Dictionary / Library · Desktop
- `j27wbH` — Dictionary / Create dictionary dialog
- `PXLYK` — Dictionary / Library · 360 mobile
- `w0XB0m` — Dictionary / Workspace · Desktop
- `J8KMd` — Dictionary / Card editor · Desktop
- `WzimQ` — Dictionary / Workspace · 768 tablet
- `YsrKS` — Dictionary / Card editor · 320 dark RTL
- `csG7o` — Dictionary / Public unlisted & fork · Desktop
- `y9hQU` — Dictionary / AI single-card review · Desktop dark
- `YQuri` — Dictionary / AI review · 390 mobile
- `y9KURH` — Dictionary / Batch generation review · Desktop
- `NxEjg` — Dictionary / Document source · Upload file
- `b1afw` — Dictionary / Document source · Paste text
- `A6ZoF` — Dictionary / Document processing · Desktop
- `E388yH` — Dictionary / Extracted terms review · Desktop
- `Z6ngr` — Dictionary / Document processing outcomes
- `ODEFH` — Dictionary / Quizlet import & export · Desktop
- `ACX05` — Dictionary / Batch review · 390 mobile
- `TKD9D` — Dictionary / Required states & confirmations

Rendered coverage includes 320, 360, 390, 768, 1280, and 1440 pixel widths;
light/dark themes; bilingual and RTL learning content; collection, focused form,
dialog, detail, public, compare, review-table, compact-card, upload/progress, and
transfer structures; loading, empty, offline, disabled, capacity, permission,
revoked/unavailable, archived, duplicate, validation, partial OCR, stale AI,
optimistic conflict, generation failure, and destructive confirmation states.
The boards design later M3–M5 behavior without making it executable.

### Rendered UI/UX review

- Blockers found: none after rendering; every represented primary task has a
  reachable next action and destructive archive remains confirmed.
- Major findings fixed: the desktop card form was clipped; mobile library card
  metadata/actions did not fit; select option menus obscured the create-dialog
  default state; table checkboxes clipped in narrow cells; and state-matrix
  heading rows used circular fill sizing. Each was corrected and re-rendered.
- Responsive review: the required source-before-translation order remains stable;
  desktop AI compare becomes a labelled current/proposed stack on mobile; batch
  table becomes candidate cards; actions stay in document order with no sticky
  keyboard obstruction; long bilingual values wrap.
- Accessibility review: purpose and primary action are named, headings follow the
  task order, controls keep visible labels, errors and statuses include text and
  icons rather than color alone, destructive actions are distinct, and public
  absence uses one non-enumerating explanation. Runtime focus/live-region/200%
  behavior remains an M2.6 implementation-verification obligation.
- User review revisions: `YsrKS` is a compact bottom sheet with zero outer page
  padding and wrapped narrow fields; `h95hgK` hides card-level actions in an open
  three-dot popover beside `fvod9`; `USW09` is the desktop dialog body; `St60V`
  has separate editable Definition and Context example controls; `vHNMf` uses
  correct secondary-button contrast; `F112Z` is now only the completed extracted-
  term review; `YGPlE` uses a labelled cancel-processing action; and field/settings
  containers no longer accumulate doubled padding and gaps.
- Document flow review: upload file (`NxEjg`) or paste text (`b1afw`) → durable
  processing (`A6ZoF`) → completed extracted-term review (`E388yH`) → generated-
  card proposal review (`y9KURH`/`ACX05`) → atomic save and return to workspace.
  Cancelled, failed, and no-terms terminal outcomes are represented by `Z6ngr`.
  `amONd` records design-only comments for manual authoring, document generation,
  and single-card AI journeys; relevant screens also carry Pencil `context`
  comments.
- Final Pencil structural audit printed `Dictionary screens: 19`,
  `Layout problems: 0`, and `placeholder=false` for every root. Representative boards
  were captured individually after fixes because multi-board Pencil captures can
  omit the first rendered board.
- Historical review conclusion: no product decision was introduced. At that
  checkpoint, visual acceptance was the only M2.5 gate; ADR-0016 later retired it.

## M2.6 shared UI-kit actualization

### Delivered

- Removed the separate design-source approval gate by explicit user direction.
  Accepted ADR-0016 makes runtime tokens, shared component contracts, stories,
  tests, and rendered behavior authoritative; Figma/Pencil artifacts remain
  optional references.
- Card create/edit now opens the shared native-dialog `BottomSheet`: a centered
  large dialog on desktop and bottom-aligned, safe-area-aware sheet below 640px.
  One form preserves validation, dormant optional values, duplicate warnings,
  cancellation, and save behavior across both presentations.
- Card reorder remains directly available through labelled icon buttons. Edit,
  single-card AI review/start, archive, and restore moved into a labelled,
  keyboard-operable menu. Destructive menu items use the shared danger tone.
- Pending card saves cannot be dismissed through Escape, the sheet close button,
  or the form Cancel action; Add-card and card actions remain disabled until the
  mutation settles, and completion only closes the draft that initiated it.
- Manual version conflicts expose `Reload current version` inside the modal
  instead of leaving the only recovery control in inert background content.
- Learning-content controls and dormant values derive `dir` from the language
  catalog. Card action labels use localized ordinals, avoiding duplicate labels
  and untaggable source-language text inside UI-locale accessible names.
- The shared menu now uses the existing Floating UI dependency to flip and shift
  within the viewport. Browser review found and verified this remediation after
  the first narrow render clipped a downward-opening menu at the viewport edge.
- Added the focused editor overlay story, four-locale card-action copy, updated
  the canonical browser journey, and synchronized the dictionary/web-UI guides.

### Verification

- `pnpm --filter @languon/web exec vitest run tests/dictionary-card-authoring.test.tsx tests/ui-kit.test.tsx tests/i18n.test.ts` — final post-review run passed 29/29, covering mixed-direction fields, pending cancellation, non-dismissible dialogs, danger tone, keyboard focus, and all-disabled menus.
- Independent post-remediation `pnpm --filter @languon/web test` — passed, 17
  files / 91 tests.
- `pnpm --filter @languon/web typecheck` — passed after rebuilding task-local
  `@languon/languages`, `@languon/contracts`, and `@languon/prompts` outputs.
- `pnpm --filter @languon/web lint` — passed.
- `pnpm --filter @languon/web storybook:build` — passed; focused overlay story
  is present in the generated catalog. The existing Vite large-chunk advisory
  remains non-blocking and unrelated to this slice.
- `pnpm agent-skills:check` — 17 repository skills validated. The external
  `quick_validate.py` could not start because host Python lacks `PyYAML`; the
  pinned repository validator passed instead.
- `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check dictionary-platform`,
  `pnpm user-flow:e2e -- check web-ui-kit`, and `pnpm format:check` — passed.
- Fresh disposable PostgreSQL 17 and Redis 8, deterministic dictionary worker,
  Chromium: `pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts` — final post-review run passed all 3 mapped scenarios in 30.0s. The owner journey opens and closes the Add-card sheet at 320px with 200% text, proves no horizontal overflow, and delays a save to verify modal/background controls remain unavailable. The AI journey now also proves a two-page stale manual-card save exposes and completes modal reload recovery. A first broad invocation exposed an existing hard-coded backend-port assertion; the test now derives the configured E2E backend port.
- Project-pinned browser wrapper, task-owned local stack and synthetic account:
  desktop 1280×800 and mobile 320×900 actual application plus 390×900 and
  768×900 focused Storybook renders passed. Verified light and system-dark
  themes, mixed-script card content, dialog/sheet close and save paths, labelled
  actions, flipped menu placement, visible destructive action, no horizontal
  clipping, and no runtime errors. The actual-application console contained only
  expected development/HMR messages; network inspection showed only the expected
  unauthenticated refresh 401 and successful local application requests. E2E
  separately retained the existing 320px/200%-text assertion.
- Browser screenshots (wrapper-managed temporary artifacts):
  `screenshot-1787686626304.png` desktop dialog,
  `screenshot-1787686654104.png` system-dark 320px sheet,
  `screenshot-1787686782115.png` remediated 320px menu,
  `screenshot-1787686828828.png` light 320px sheet,
  `screenshot-1787686947539.png` 390px story, and
  `screenshot-1787686959806.png` 768px story.

### Environment discoveries

- Dependency restoration initially failed offline because `@eslint/js` was not
  cached; the approved frozen-lockfile reinstall restored workspace links without
  changing the lockfile. Generated `.next-browser-ui` output and its transient
  `next-env.d.ts` rewrite were removed after verification.
- Passing a test path after `--` to the package E2E script ran the full suite;
  the final evidence uses `pnpm ... exec playwright test <file>` to run exactly
  the three mapped dictionary scenarios with a fresh Redis namespace.

## M3 pasted-term batch generation

### Delivered

- Added the discriminated `pasted-terms:v1` lifecycle across contracts, API,
  durable input/proposal/outcome persistence, worker claim/fencing, provider
  circuits, rollback metadata, and web restoration. Input is server-split into
  at most 100 trimmed 200-code-point rows and worker calls are deterministic
  chunks of at most 20 rows with stable per-chunk keys and aggregate usage.
- Added deterministic and Mastra structured adapters with row-exact validation,
  partial retryable failures, hidden traces, no tools, bounded 120-second batch
  execution, heartbeat/lease cancellation, and one immutable 262,144-input /
  40,960-output provider envelope. API, worker, manifest, workflow, migration,
  and deployment preflight enforce the same activation bounds.
- Added atomic selected-card acceptance with owner/dictionary/settings/pair and
  capacity checks, stable row order, one dictionary version bump, immutable
  revisions, semantic `ai-generated`/`mixed` authorship, exact replay, changed-
  selection conflict, terminal redaction, and durable warnings recomputed from
  final edited sources including retained and intra-selection duplicates.
- Retrying selected persisted failures now calls a job-scoped server action. It
  preserves the trusted shared context, records predecessor job/row lineage,
  reindexes only the selected failures, snapshots current versions/settings,
  and retains one payload-fingerprinted idempotency key across ambiguous client
  failures. Restored job IDs are accepted by the UI only for their owning
  dictionary.
- Added the responsive shared-`BottomSheet` input/progress/review flow with
  selection, editing, removal, retry, discard, cancel, conflict recovery,
  terminal outcomes, learning-content `lang`/`dir`, four locales, and URL-backed
  reload restoration. No external design artifact or new UI dependency was
  required.
- Migration `0013_true_payback.sql` adds the batch outcome and generalized job/
  proposal/provider constraints. The production worker role grants only
  `SELECT(id, dictionary_id, source, sort_key)` on cards for duplicate lookup;
  deployment preflight requires exactly those columns and rejects wider table or
  column privileges.

### Automated and database verification

- Contracts: 4 files / 39 tests passed; contracts typecheck and production build
  passed. Prompt fallback: 3/3 passed; prompt typecheck passed.
- Focused post-review backend checks passed 38/38 across environment, service,
  parser, and routes. Independent testing additionally passed 34/34 across the
  batch domain/service/worker/routes/provider and deployment environment.
- Guarded disposable PostgreSQL 17 batch persistence suite passed 7/7. It proves
  ordered atomic commit, authorship, exact replay/change conflict, legal pair and
  settings-only zero-write conflicts, final edited duplicate warnings, retained
  duplicate lookup, per-format circuit isolation, capacity rollback, and a
  context-preserving successor containing only selected failed rows.
- The final complete backend suite against the same disposable database passed
  60 files with 429 tests, 3 files / 10 environment-specific cases skipped. Drizzle
  `db:check`, migration catalog/schema checks, and affected legacy database suites
  passed. The exact column-grant deployment journey passed against a separate
  disposable PostgreSQL container and proved allowed duplicate lookup plus denial
  of an ungranted card column.
- Web component/API tests passed 12/12 post-remediation; the final full web suite
  passed 18 files / 100 tests, including direct accepted-warning rendering.
  Web typecheck and lint passed.
- `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check
dictionary-platform`, release-workflow/deployment tests, formatting, and
  `git diff --check` passed. The canonical `pnpm check` passed outside the
  filesystem sandbox, including formatting, agent/guide validation, lint, every
  workspace typecheck and test, and all production builds. The first sandboxed
  attempt had failed only because the web-dev-panel integration test could not
  bind localhost (`EPERM`). The final Storybook production build also passed;
  its existing large-chunk advisory remains non-blocking.

### Browser and mapped journey evidence

- The final exact mapped dictionary Playwright file passed all four Chromium
  scenarios in 29.4 seconds against task-owned PostgreSQL/Redis and isolated backend/web
  ports. The batch scenario proves durable reload, 320px/200% reflow, keyboard
  operation, duplicates, retry successor, row edit/removal/selection, mixed and
  AI authorship, atomic commit, and legal empty-dictionary pair-change conflict
  with zero cards.
- The project-pinned browser wrapper exercised a real synthetic account and
  deterministic batch at 320, 390, 768, and 1440 widths in light and dark themes.
  Desktop dialog/mobile sheet geometry, stacked fields, sticky actions, focus,
  wrapping, RTL/mixed content, console, and failed-network inspection passed.
  Console output was limited to expected React/HMR development messages; the
  only expected failed request was the initial unauthenticated refresh 401.
  The wrapper could not reliably retain browser zoom after its platform shortcut;
  exact 320px/200% behavior is covered by the passing mapped Playwright journey.

### Review discoveries and remediation

- Real E2E exposed a React `currentTarget` lifetime defect in dictionary settings;
  the handler now captures values before deferred state work and has component
  coverage. Accepted batch jobs no longer show a derived stale conflict after
  their own version increment.
- Real database migration caught the stale 1,024 output-token check before
  handoff; schema, generated migration, manifest, workflow, API, worker, and docs
  now agree on 40,960 for pasted activation.
- Independent testing added bare-CR/C1 parser cases and a settings-version-only
  PostgreSQL conflict. Independent correctness/security review then closed the
  narrow worker-role mismatch, ambiguous paid-enqueue retry, cross-dictionary
  restoration, post-edit duplicate warning, and context-free retry successor.
  No finding was waived.
- The first post-review mapped rerun still waited for the superseded generic
  enqueue URL after retry moved to its job-scoped endpoint. The journey assertion
  now follows `/retry-pasted-terms`; its focused rerun and the final four-scenario
  run passed. Documenting preserved retry context advanced the synchronized
  user-flow revision to `sha256:ca0d9d4184f2d5b1`.

## M4 discovery checkpoint

- Read-only product, persistence, worker/provider, test, and security discovery
  found no existing product-storage, scanner, sandboxed parser, OCR adapter, or
  disposable service topology. Backup S3 code/credentials remain explicitly out
  of scope for product uploads.
- The converged backend boundary is a separate transient upload aggregate plus a
  `document-terms:v1` fenced generation job, with physical-version accounting,
  cleanup leases/tombstones, and existing M3 enrichment/atomic batch acceptance.
  A proposal cannot become reviewable until original-byte cleanup succeeds.
- A disposable `node:24-bookworm-slim` Bubblewrap probe under the production-like
  non-root, read-only, `no-new-privileges` container policy failed under Docker's
  default seccomp because it could not create namespaces. With seccomp removed,
  full namespace isolation succeeded only when `/proc` was left absent rather
  than mounted. This establishes a plausible seam but not an activation proof:
  unconfined seccomp is unacceptable, and a narrow profile plus the planned
  production-like escape/resource suite remains required.
- Independent product review identified a behavior-affecting contradiction: the
  feature specifies automatic extraction into one final card review, while the
  historical design section describes a separate extracted-term review before
  AI. The unresolved choice is recorded as D-18 and pauses dependent M4
  implementation. No document capability has been advertised or enabled.

## M4 implementation and verification

- Implemented `document-terms:v1` as a separate transient upload aggregate plus
  fenced generation job. Upload authorization is owner/idempotency scoped,
  signs an exact create-only content type/length/checksum capability, reconciles
  an ambiguous browser response against one exact current version, and keeps
  every observed physical version quota-accounted until verified deletion.
- The worker verifies exact immutable bytes, fails closed through ClamAV, runs
  bounded native extraction in a credentialless Bubblewrap child, uses OCR only
  for pages without native text, enriches through the existing batch generator,
  stages the proposal privately, deletes all original data versions behind a
  tombstone barrier, and only then publishes one editable final card review.
- Terminal/expired uploads enter an independent fenced cleanup loop. Cleanup is
  never abandoned: the attempt counter saturates at 100 for observability while
  claims continue indefinitely. Authorization expiry is swept in bounded batches
  before cleanup claims, and proposal publication/quota release is atomic with
  verified physical deletion.
- Document enrichment failures retry through a server-owned pasted successor
  containing only selected persisted retryable rows and predecessor lineage.
  The original review stays immutable; the transient document instruction is
  redacted and is not replayed.
- Post-remediation verification passed: contracts 4 files/41 tests; backend 62
  files/411 tests with 97 guarded environment skips; web 20 files/111 tests;
  focused M4 backend 9 files/42 tests; focused M4 web 3 files/16 tests; backend,
  web, and contract typecheck/build; affected lint; `db:check`; deployment 90/95
  with five guarded skips; `git diff --check`; guide/mapping validation; and the
  disposable document-service static harness.
- Real disposable PostgreSQL document persistence passed 5/5 and MinIO storage
  conformance passed 1/1. The final mapped Chromium dictionary journey passed
  5/5 on a fresh database; the document scenario proves direct upload,
  cleanup-gated review, reload, server-owned failure successor, return to the
  immutable predecessor, mobile/desktop reflow, edit/remove, and atomic commit.
  Independent testing repeated contracts 18/18, backend 35/35, web 16/16,
  PostgreSQL+migrations 10/10, guide mappings, and the document Playwright case
  1/1.
- Scanner readiness now requires signatures no older than 24 hours and exact
  declared stream/recursion/file limits. The disposable Compose fixture pins
  25 MiB/10/2,048. A post-hardening live readiness run correctly failed closed
  because the upstream daily signature available on 2026-08-26 was already more
  than 24 hours old; no unsafe scan or production activation was substituted.
  Deterministic scanner/parser tests remain green, and production document
  readiness intentionally lacks the attestation until immutable configuration
  and conformance are proven.

## M5 Quizlet/import/export implementation evidence

- Delivered server-authoritative bounded CSV/TSV parsing, target-aware sampled
  preview, atomic deterministic new/existing import, exact idempotent replay,
  and distinct `import-pairs:v1` optional-AI generation with trusted core pairs,
  final editable review, lineage, and mixed authorship.
- Delivered ordered Quizlet text/CSV and lossless `languon-csv:v1` streaming
  export. Formula-neutralization, RFC 4180 quoting, Unicode/newline round trips,
  inherited-versus-literal custom labels, fixed security headers, strict CORS
  exposure, native picker-before-fetch streaming, cancellation, and bounded
  32 MiB fallback are covered.
- Persistence migration `0016_sad_morph.sql` stores exact import replay outcomes
  under a 4 MiB derived cap. Fresh disposable PostgreSQL passed the full
  repository suite 20/20, including a 10,000-card/9,999-warning commit whose
  payload exceeds the former 2 MiB bound, exact replay, archive-after-response
  replay, capacity rollback, concurrency, and 10,000 deterministic revisions.
  Fresh migration verification passed 5/5 and `db:check` passed.
- Final automated verification: contracts 5 files/47 tests; backend 64 passed
  and 14 environment-gated files, 448 passed/108 skipped tests; web 21 files/122
  tests; backend/web/contracts typecheck and lint; prompts tests; Storybook build;
  deployment production-security 4/4; release workflow contract 13/13;
  user-flow guide 16/16 and dictionary mapping checks; `git diff --check`.
- Independent mapped Chromium journey passed 1/1 in 29.4 seconds against fresh
  PostgreSQL 17 and Redis 8. It covers fatal-authoritative preview, duplicate and
  malformed-row feedback, keyboard AI selection, 320 px at 200% with a 200-code-
  point unbroken value, atomic new dictionary plus `import-pairs:v1`, URL/reload
  restoration, final review, mixed acceptance, formula-safe ordered CSV, and the
  browser download fallback. Task-owned services were removed.
- Project-pinned browser verification covered 320x900 import input/preview and
  1280x900 export stories, RTL/LTR content, keyboard semantics, no horizontal
  clipping, empty browser errors, and local-only successful network requests.
  Storybook production build passed with only its existing chunk-size advisory.
- Independent security re-review approved M5 with no remaining Critical, High,
  or material Medium code defect. Import edges now have exact body, per-IP,
  authenticated owner/global rate, and active-operation bounds. Live
  `import-pairs:v1` remains fail-closed until provider policy, credentials,
  readiness, budget, and rollback-floor approval.

## M6 provider-drain rollout remediation

- Dictionary share-key and request-fingerprint HMAC now uses the required,
  dedicated `DICTIONARY_HMAC_SECRET`; auth-code and JWT secrets remain separate
  and unchanged. Backend and deployment validation reject missing, short,
  shared, or production-placeholder dictionary secrets.
- Worker environment and deployment preflight now require live provider mode
  and readiness for every worker-processable AI format, including stop-enqueue
  drain releases where API enqueue is empty. Provider configuration can be
  removed only after the processable format is drained and retired.
- The reusable deterministic build manifest publishes empty worker, API, and
  web AI lifecycle capability sets. Its static workflow contract rejects any
  accidental non-empty default; provider-approved expand and later activation
  remain explicit release operations.
- Focused verification passed: backend worker environment 11/11 and typecheck;
  release workflow, deployment overlap, and manifest contracts 32/32 with one
  guarded database case skipped; affected lint and `git diff --check`.
- Final configuration drift remediation raised the deployment validator's
  output-token ceiling to the same 40,960 bound enforced by backend policy and
  release metadata. A regression parses both sanitized stage and production
  examples through deployment validation; the combined config, deployment,
  manifest, overlap, and release workflow run passed 54/55 with one guarded
  database case skipped.
- Worker run startup now uses baseline database/cleanup readiness while its
  healthcheck retains provider, storage, scanner, extractor, and OCR probes. A
  focused provider-down regression proves cleanup polling starts while health
  remains failed. Document lifecycle-only rollback retains storage and the
  mounted completion route while rejecting new authorization. The composed HTTP
  and PostgreSQL regression passes activate → authorize → simulated PUT →
  stop-enqueue recomposition → unavailable authorize → successful completion.

## M6 final integration and verification

- Added a sanitized, fixed-field operational snapshot for queue depth/age across
  all four formats, expired leases, outcomes, review latency, retry/failure
  categories, upload/scan/parser/OCR state, cleanup lag, active reservations,
  circuit pressure, and conservative provider-budget settlement. The budget
  fields are explicitly not presented as actual provider calls, tokens, or
  spend. Numeric allowlisting prevents identifiers or user content from entering
  logs.
- Split current, terminal, provider-settlement, and upload observation queries
  into bounded windows. Generated migration `0017_redundant_wolfpack.sql` adds
  the six supporting partial timestamp/state indexes. Disposable PostgreSQL
  verifies the populated snapshot and index plans; migration classification is
  reviewed through 0017 as `expand`, and `node scripts/migration-classification.mjs`
  passes.
- Lifecycle rollback and cleanup remain available independently of live model,
  scanner, extractor, and OCR readiness. Strict healthcheck and deployment
  preflight still fail closed for every advertised processable format. The
  composed HTTP/PostgreSQL regression proves an upload authorized before
  stop-enqueue can still complete afterward while new authorization is rejected.
- Runtime/design/documentation synchronization now reflects one automatic
  scan/extraction/enrichment pipeline followed by one editable final card review.
  The canonical guide is current, all scenario/revision mappings pass, the native
  save-picker type description is localized in en/es/fr/ru, and generated E2E
  `next-env.d.ts` drift is absent from the final diff.
- Final repository `pnpm check` passed outside the filesystem sandbox because
  the reviewed web-dev-panel integration test needs a loopback listener. It
  includes formatting; 17 agent skills; the 55-command panel catalog; 16 guide
  tests across eight guides; lint; all ten workspace typechecks; contracts 47,
  prompts 4, web 122, backend 448 passed/108 environment-gated skipped tests;
  release/deployment 93 passed/5 guarded skipped tests; and every production
  build. The only build advisory is the existing admin chunk-size notice.
- Independent verification passed disposable PostgreSQL migrations 5/5, batch
  11/11, repository/document 25/25, MinIO storage 1/1, the document-services
  harness 2/2, and all six mapped Chromium journeys in 1.6 minutes against fresh
  task-owned PostgreSQL, Redis, and MinIO. Task-owned infrastructure was removed.
- Independent correctness re-review found no remaining material implementation,
  architecture, migration, performance, or test defect. Final security re-review
  approved the enabled deterministic/runtime release with no remaining Critical,
  High, or material Medium finding. No paid or nondeterministic provider ran.

## Remaining risks

- The reusable deterministic M6 manifest keeps every dictionary AI lifecycle
  capability set empty. A later provider-approved expand release must add the
  worker/API/web lifecycle sets only with live Mastra readiness and compatible
  budget support; a subsequent compatible activation may enable enqueue. A
  stop-enqueue release must retain provider readiness until queued and retryable
  work drains and the worker-processable format is retired.
- Live provider privacy, retention/residency, credentials, and exact pricing still
  require operational approval. Physical proposal expiry depends on worker health
  or opportunistic owner access, so cleanup lag and worker readiness alerts remain
  required operational controls. No paid provider was called in this milestone.
- Production document activation remains unavailable pending real product-S3
  conformance/IAM/versioning evidence, immutable ClamAV configuration and fresh
  conformance, narrow Bubblewrap/seccomp plus cgroup/RSS/tmpfs escape/resource
  proof, and an approved live OCR retention/residency/cost policy. These are
  fail-closed M6 rollout gates, not claims satisfied by local constructor values.
