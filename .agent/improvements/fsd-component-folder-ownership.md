# Improvement: FSD component folder and stylesheet ownership

Status: Complete
Created: 2026-11-12

## Routing, scope and invariants

User requests enforcing the existing one-component/folder rule across all web
FSD UI, starting with contextual-assistant's33modules in one directory. This is
one cohesive internal structural improvement: preserve product behavior, public
slice export names, API/persistence/auth/accounting/AI protocols, runtime deps,
client/server directives, state/context singleton identities and component body
semantics. No new feature/journey or architecture decision. ADR0005/0029/0054,
apps/web AGENTS and frontend-development remain authoritative. No visual redesign.

Baseline10e30632, clean worktree on improvement/assistant-chat-surface. No commit,
merge, push or branch deletion requested. Main stays80d330bd. Preserve accepted
UI changes. Rollback is file moves/import/public-entry rewrites plus the bounded
structure check, with no data or environment reset.

## Discovery and accepted anatomy

Initial deterministic inventory:490production TSX modules,485under UI;56mixed
component directories containing274modules.18additional modules sit directly in
ui/ rather than a component folder.236ordinary component moves proposed,85CSS
moves plus matching stories;323total initial moves with no destination conflicts.
Five non-UI TSX modules are legitimate auth/i18n/theme/navigation context/providers
and a playback hook; their model/hook ownership remains unchanged. Full source
baseline from Git HEAD is retained under /private/tmp/languon-fsd-baseline/;
initial AST/import/CSS inventory at /private/tmp/languon-fsd-layout-inventory.json.
These are analysis artifacts, not generated product output.

- One independently exported reusable React component per component module/folder.
  Small unexported private helpers may stay in that component's file, as existing
  frontend-development allows. Compound exported Card/Dialog/etc parts get their
  own folders and preserve public names through canonical family/slice entries.
- Complex owner's private components each get their own folder under its ui/;
  direct ui/ components gain a named folder. No arbitrary promotion across slices.
- Single-owner CSS and stories stay with that component. Shared CSS moves intact
  to independently named *-common.module.css under the slice UI styles directory;
  consumers import it explicitly. No CSS copying/selector redesign/global style.
- Maintain relative and aliased imports, dynamic imports, mocks, public exports,
  CSS asset references and maintained exact source paths. No old-path shims;
  historical/frozen .agent evidence remains history, not rewritten.
- Existing large authored component bodies are not comprehensively refactored:
  this task changes ownership, not arbitrary logic, callback/memo or hook design.
  Necessary exported-view extraction preserves statements and dependencies.

## Ownership and plan

Root owns full inventory, ordinary relocation/import rewriting, docs, integration,
compilation and test infrastructure. Bounded workers own only independently
exported component extraction + sorted inspection dispositions: contextual widget;
entities/Knowledge/conversation/portrait features; remaining features; pages/shared/
other widgets. Separate guard worker owns only the existing styling-check
integration and focused structural-rule fixtures. No overlapping edit ownership.
Workers preserve others' edits; ordinary moves wait until extraction finishes.

- [x] Finish deterministic TSX/CSS audit and exported-view decomposition.
- [x] Apply ordinary moves and import/source-reference rewrites centrally.
- [x] Prove original import targets/declarations/styles remain accounted for.
- [x] Integrate small mechanical guard into existing styles:check, no dependency.
- [x] Focused structural fixtures, static/app integration checks, documentation.
- [x] Independent source/evidence review and actual browser/build observations.

## Exact verification strategy before substantial edits

Shared import/CSS ownership changes affect every web FSD layer, so scope expands
beyond one screen; backend/admin/mobile behavior and DB/schema are unchanged.

- Inventory all production UI modules/stories/CSS in deterministic path order;
  retain per-file inspected disposition and final relocation map in this record's
  evidence directory. Resolve ambiguity from real imports, not filename count.
- Record original import edges before moves; after rewrite prove they resolve to
  the same corresponding files. Compare style bodies byte-for-byte except asset
  path rewrites; compare extracted component declarations ignoring import/export
  syntax and document necessary shared declaration moves. This is refactor proof,
  not a mirrored product test (~5–15s).
- New structural guard fixture tests: negative mixed/root/multiple exported views,
  private CSS cross-owner; positive private helpers/providers/stories/shared CSS,
  forwardRef/memo/default patterns (~2–5s). Existing styles contract tests included.
- Web typecheck and all affected-source ESLint/formatting/styles (~20–90s); preserve
  valid unchanged code-body lint state. No formatter sweep outside moved paths.
- Full WEB unit selection once, because all layers/shared UI imports shift
  (~1–3min with bounded workers); no full monorepo/backend/paid model/DB suites.
  Root owns invocation and retains exact no-skip results. Fix real path/mock errors.
- Web production build and Storybook build selected for route/bundle/CSS/entry
  resolution across the whole app/catalog (~1–4min). No runtime dep/config changes.
  If a baseline build limitation recurs, prove baseline and report actual gap;
  compilation/mocks do not substitute real browser where required.
- Existing app browser selections cover source chat, attached Knowledge and mobile
  settings (shared primitive popovers, editor blocks, theme/responsive). Use guarded
  real local Next/backend/PG/Redis fixture and synthetic accounts/model boundary,
  zero paid calls. Existing runFlow utility, one root-owned lock, generated
  next-env.d.ts preserved. Estimate1–3min depending cache. Reuse unchanged baseline
  product evidence only when import/declaration/style equivalence supports it.
- Actual isolated Storybook snippet/dialog/card light/dark renders validate moved
  story/CSS consumers; no new whole-chat story or preview-wide refactor. Close only
  task browser, preserve original developer services. No new visual design required.
- Discover current docs/user-flows by exact moved source paths. Update maintained
  references/metadata and revision markers only when mappings change; execute mapped
  selections proportionally. Historical source identities stay unchanged.
- Bounded independent review after source/import preflight for missing symbols,
  cycles, client boundaries, CSS sharing and verification gaps; no security review
  unless a real policy/data/trust change appears (not authorized here).

## Evidence and progress

Implementation and selected verification complete. Final audit, move map, source identities and evidence are retained below; initial raw analysis remains in private temp.

## Final implementation and evidence

All current UI component modules now have individual folders. Root/owner audits
covered490original production TSX modules and235component stylesheets. The final
UI tree has532modules in532folders,0mixed folders and no module directly in ui/.
29multi-component modules were separated into independent component folders with
canonical group entries preserving existing public names.315ordinary relocations
comprise219component modules,94shared/local stylesheets and2matching stories.
All4764authored import/reference edges resolve to their expected corresponding
files. The initial broad scanner also read219unchanged generated edges; none
were rewritten, and they are excluded from authored proof. All235CSSmodule
contents are byte-identical to baseline. All909original top-level component,
helper/type/context declarations match token-for-token after ignoring only
import/export/module placement/trivia. No original declaration is missing.

Single-owner CSS is colocated; shared CSS is independently named in ui/styles/.
Old multi-view files are removed or contain only their retained main view; public
family indexes aggregate actual component modules and do not shim obsolete paths.
Four ownership reviews confirm unchanged public names, client directives and
context/store singletons. The independent completion reviewer confirms the same
and finds no material source or evidence issues. No backward-compatibility module,
new runtime dependency, shared across-app import or product behavior was added.

The new component-structure.ts check is integrated into existing styles:check.
It detects mixed component modules, direct-ui placement, multiple exported views,
missing CSS and cross-owner private styles. Intentional common styles, stories,
small private helpers and existing non-UI context/providers are allowed. Its
focused fixtures plus existing style tests pass33cases across3files. This is
included in the full web result below, not counted twice. The initial red scan
reported169violations; final style/structure scan passes. README's existing
command description now identifies the guard. No new command/framework/plugin.

Selected gate results:

- Current web TypeScript check: pass.
- Changed authored-code ESLint:514files pass. Formatter repaired19files (18code,
  1README; mostly longer import paths), and exact18code-file lint recheck passes.
  This is formatting only; final909-declaration/import/CSS proofs account for the
  final source, so no repeated full product suite was warranted.
- Final scoped formatter, style/structure contract and git diff check pass.
- Full web unit selection:194files/1355cases,1352pass and3fail in2files.
  Both failing files were executed from an archived10e30632 tree with its original
  source/config and identical unchanged dependencies: the same3failures,12pass.
  Failures are existing context-budget copy and succeeded/failed acknowledgement
  insertion expectations. No tests were weakened, skipped or changed beyond
  mechanical import/source references. They remain explicitly recorded baseline
  debt, not task-introduced regressions or a claim that the full suite is green.
- Production web build: pass,23routes. The build-generated next-env.d.ts change
  was restored from clean HEAD; later runtime checks use the existing preservation
  helper. No generated code/dependencies/lockfile were manually edited.
- Full Storybook production build: pass. The first misspelled script invocation
  was a no-op and is not counted as a build; storybook:build is the valid command.
- Existing actual-app browser cases:3pass,0skips, run
  7937b467-8d6c-4f0c-8865-b90ce5054435,47.046s total (2.180s setup,
  43.645s execution,1.220s cleanup). Text/source chat with sidebar transitions,
  attached Knowledge/settings/draft behavior, and mobile/tablet chat/drawer/overlay
  paths use real Next/backend/disposable PG/Redis, synthetic accounts/model
  boundary,0paid calls. Command selection uses unchanged files
  (contextual-assistant|knowledge-workspace)\.journeys\.spec\.ts and existing
  title patterns editor and real tutor collapse the sidebar|an empty workspace
  recovers edits|the workspace switches between mobile document and tutor tabs,
  minimumTests3 via existing runFlow/withPreservedFile/lock/ownership helpers.
  No new test harness or broad backend/accounting/provider gates.
- Built-catalog browser on task-only6008: actual light compact snippet expands to
  selection/insertion controls; real dark Dialog family renders and dismisses via
  Escape. Root viewed captures and confirmed preserved grouping/layout. No page
  errors or console warnings;143requests have only expected favicon404, other
  assets200/304. Task browser closed and temporary6008server stopped. App-run
  fixture resources cleaned. Original task-owned6007preview was restarted to
  discard stale move-time story-index/acorn errors; its fresh index is checked
  before final handoff. No user app service stopped or deployment performed.

Documentation/mapping proof:

- Both affected guides gained exact independently shared style inputs when those
  files moved outside their previous component-folder globs. The final move-to-
  guide comparison has0lost mappings. User-flow validation34guides/16cases and
  contextual-language-assistant-and-knowledge/global-app-shell mapping checks pass;
  executable scenario revisions stay unchanged because behavior is unchanged.
- Updated the one exact moved source path in conversations-and-knowledge diagram,
  reviewed its unchanged frontend/data-flow relationships and refreshed only that
  view's source fingerprint/date. Baseline catalog had7stale diagrams; current
  has6other already-stale diagrams,0newstale and0catalog issues. Those unrelated
  stale views were not blindly stamped or expanded into this UI ownership task.

### Independent review and limitations

fsd_independent_review gives no material findings and approves completion after
this bookkeeping update. It independently inspected compound public-entry seams,
context/client identity, guard/fixtures, source/CSS proof, builds, real-browser
captures/results, baseline-unit comparison, docs/mappings and diagram delta.
No remediation/source re-review requested absent substantive changes.

The guard intentionally operates on TSX/JSX under ui/ and usual PascalCase
function/arrow/memo/forwardRef/default-export conventions. Arbitrary class/lazy/
custom-HOC aliases or a component misplaced outside ui could evade it. The full
current inventory has no such unhandled UI module; the five unchanged outside-ui
TSX modules are legitimate auth/i18n/theme/router contexts and playback hook.
This is a useful mechanical floor alongside existing agent rules, not a complete
TypeScript semantic proof for arbitrary future code.

Historical .agent feature/evidence paths were preserved as history. Current files,
public canonical entries, maintained docs and tests are updated together. Changes
remain uncommitted on improvement/assistant-chat-surface; main remains80d330bd.
Only intent-to-add metadata was used for rename-aware diff review; no content is
staged, no commit/merge/push/branch deletion. Rollback is this scoped refactor and
guard/docs patch, without data/environment reset. User acceptance retrospective
will follow their review and does not delay this technical handoff.

### Retained evidence

- [File-by-file audit and move map](evidence/fsd-component-folder-ownership/layout-audit.json)
- [Import/declaration/style equivalence and baseline debt](evidence/fsd-component-folder-ownership/equivalence.json)
- [Final source/report identities](evidence/fsd-component-folder-ownership/verification.json)

Raw reports: /private/tmp/languon-fsd-{web-tests,baseline-test-comparison-final,
typecheck,web-build,storybook-build-final,eslint,eslint-final-formatting,
structure-final,guides-final,assistant-mapping,shell-mapping,app-browser}.log.
Derived final proofs: /private/tmp/languon-fsd-{integration-proof,declaration-proof,
guide-coverage-final,diagram-comparison}.json. Original snapshots/inventories and
owner read-only proof records are retained in private temp; compact dispositions
are in the audit above. Curated catalog screenshots: test-results/fsd-component-
folder-review/{snippet-light,dialog-dark}.png; full actual app/browser artifacts
remain under test-results/critical-flows/7937b467-8d6c-4f0c-8865-b90ce5054435/.

## User acceptance, development restart and integration — 2026-11-12

User accepted the cleanup and explicitly requested committing and merging to main.
This supersedes the initial no-commit/no-merge scope statements above; no push,
deployment or branch deletion was requested. Verification/source identities remain
unchanged; reuse the passing affected evidence and retain baseline unit/diagram
debt as recorded. Commit the accepted refactor, then squash the improvement branch
into local main as one commit, preserving the two preceding accepted UI commits
in the combined main tree. Git history records final IDs; the integration script
must assert main's tree equals the accepted branch tree and the checkout is clean.

Before integration the user suspected accidental deletion and supplied dev:all
output showing a successful page200 followed by web exit143. We paused delivery,
rechecked all612verified source files and expected Git deletions:0missing,
0changed,0unexpected removed/authored files. The user restarted development and
confirmed it works. No code restoration or dev-script change was necessary.
Exit143 is consistent with SIGTERM; the exact termination source is not established.
A stale live dev-server/module graph after many moves is a hypothesis, not a
proven root cause. Expected removal of old paths is part of the verified moves.

Acceptance retrospective: the broad existing UI ownership drift required a full
inventory and29compound-module separations, not merely moving chat files. Central
relocation/import rewriting plus AST/import/CSS identity proof reduced manual
errors. Full WEB tests/builds were justified by shared UI impact; no backend/DB/
provider or whole-monorepo regressions were added. Three pre-existing unit failures
were isolated with two baseline files instead of rerunning an entire baseline
suite or altering behavior. Browser fixture execution47.046s and focused structural
fixtures33cases provided proportional runtime/guard proof. Independent review
found no material repairs. New structural enforcement prevents the current class
of drift; future custom wrappers/classes still require review. Total elapsed work
was not instrumented. Large file moves can require restarting an already-running
preview/development watcher; fresh production/catalog builds remain separate proof.
