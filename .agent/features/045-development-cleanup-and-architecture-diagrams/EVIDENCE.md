# Evidence: Development cleanup and architecture diagrams

Base: 007b9eb. Feature branch: feature/development-cleanup-and-architecture-diagrams.
All data/providers synthetic unless a narrowly identified local cleanup is recorded.
No paid generation, remote deployment or push.

## Acceptance mapping

| Acceptance | Implementation and evidence                                                                                | State                                |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| AC-1       | [SKILLS.md](SKILLS.md), development-cleanup skill and independent decision probes                          | Verified                             |
| AC-2       | [CLEANUP.md](CLEANUP.md), [broader audit](COMPATIBILITY-AUDIT.md); model/shim retirement and focused tests | Verified                             |
| AC-3       | architecture-diagrams skill and isolated code/ADR discrepancy probe in SKILLS.md                           | Verified                             |
| AC-4       | nine docs/diagrams views and [DIAGRAMS.md](DIAGRAMS.md)                                                    | Verified                             |
| AC-5       | scripts/architecture-viewer, HTTP/unit and real browser evidence V1/V2                                     | Verified for current viewer          |
| AC-6       | V1–V4 and cleanup evidence; independent completion/security/test review                                    | Verified; final reports linked below |

## Viewer and documentation checks

V1 — `pnpm test:diagrams`:4/4 tests pass. Native server on an ephemeral loopback
port with an isolated temporary repository. Proves changed source detection,
explicit stamp, invalid metadata/directive/resource rejection, canonical symlink
confinement, fixed assets and JSON catalog, Host/Origin/cross-site rejection,
write/path denial and no HTTP content mutation. The initial restricted sandbox
could not bind a local port; actual successful run used approved loopback execution.
A test-helper URL bug was fixed before using results.

V2 — `DIAGRAM_EVIDENCE=true pnpm test:e2e:diagrams`:1 maintained Chromium journey
passes in4.0s against the real server on127.0.0.1:4412 and all nine real diagrams.
Covers each actual Mermaid SVG, current-input statuses, title/navigation, source
notes and Mermaid, search/empty, zoom/Fit, refresh/hash selection, keyboard and
1440×1000/390×844 layouts. No page/console errors, unexpected failed responses or
requests, or external network requests. Main visually inspected durable
[evidence/viewer-desktop.png](evidence/viewer-desktop.png) and
[evidence/viewer-mobile.png](evidence/viewer-mobile.png). Diagrams fit and expose
zoom/scroll for detailed reading; mobile overview text needs zoom by design.
This maintained real-browser journey satisfies ADR0016 under browser-verification;
no duplicate exploratory browser session was needed. It proves presentation,
not exhaustive live product conformance of every represented flow.

V3 — `pnpm diagrams:check -- --stamp`, then `pnpm diagrams:check`:9/9 valid Mermaid
and fresh source fingerprints before broader audio cleanup. Final-state source
reconciliation/check is required after audio or recorded input changes. Node-only
syntax validation uses jsdom's disabled-script/non-resource-loading DOM for
Mermaid12 label sanitization; browser rendering remains strict. Mermaid's
[official usage/security documentation](https://mermaid.js.org/config/usage)
was checked; all installed browser modules are local development dependencies.

V4 — Full ESLint passed at viewer/model/preproduction-ADR checkpoint. Guide and
skill/catalog checks run; final checks recorded below after all owners settle.
Affected package builds/typechecks and shared-UI checks recorded with final results.
Root catalog reconciliation also accounted for preexisting root-script drift:
new/changed entries stay disabled until explicit panel execution review. No
command-panel controls or trust boundary changed.

## Shared UI cleanup

Removed unused LegacyPopoverProps/wrapper (only two test consumers) and the unused
badge-local Divider duplicate (only badge story). All runtime callers already use
the compound Popover/standalone Divider. Tests were migrated to current composition
with the same focus/portal/dismissal assertions. No product UI behavior changed.
Canonical Popover implementation and standalone Divider remain intact.
Focused test/typecheck/style results to be recorded after completion.

## Evidence validity and limitations

Final content-hash manifest will identify executable/config/test/doc inputs for
review. Cleanup checks C1–C12 and subsequent audio results are in CLEANUP.md; its
sanitized exact targets/counts establish data-operation scope. SKILLS.md records
packaging and isolated judgment probes separately from runtime evidence.
No assertion that every repository path is free of stale code or that diagram
hashes discover omitted/new modules. Read-only discovery uses bounded rg/caller
tracing; no healthy semantic index was available or required for those scoped paths.

## Final verification

Pending audio integration, final hashes, required independent reviews and closure.

## Final author preflight (2026-10-19)

V5 — Final viewer primary: `DIAGRAM_EVIDENCE=true pnpm test:e2e:diagrams --grep
'browse every real diagram'` passed1/3.4s after all nine views were reconciled.
The independently requested failure-state scenario `pnpm test:e2e:diagrams --grep
'show source drift'` passed1/3.6s, then independent tester passed the same1/2.0s.
The two cases together execute the complete mapped guide (revision6633b46af7d06664).
TEST-REVIEW.md resolves both tester gaps. No viewer implementation changed after
these successful runs. Source-only formatting and later manifest-v1 retirement
were reviewed, then fingerprints refreshed; graph text/renderer/interaction proof
remains valid for those metadata-only freshness updates.

V6 — Final native checks4/4 and command-panel regression checks66/66 passed.
Deployment/manifest checks `node --test infra/deploy/tests/*.test.mjs
scripts/release-manifest.test.mjs` passed82 with6 guarded unrelated infrastructure
cases skipped in this aggregate command. Affected real speech/worker/purge role
SQL checks ran separately against owned disposable PostgreSQL and passed, as
AUDIO-PERSISTENCE.md records. No production blue/green rehearsal or remote mutation
was needed for removing an undeployed protocol; current rollout guard units pass.
Shared speech now owns its budget metadata; invalid/missing ceilings, overlap
changes and retired metadata/CLI are checked. Current CLI produces sharedSpeech
and modelPricing metadata. Schema-v1 release manifests are rejected.

V7 — Full ESLint,24 skill packages (10 validator tests), command catalog74 entries,
24 guides (16 validator tests) and selected viewer mapping pass. Backend build and
backend/contracts/admin/web typechecks pass. Production web build passes with
AUTH_E2E_DIST_DIR=.next-cleanup-build, preserving ordinary dev build output. Styling
contract passes. Generated next-env.d.ts was restored to exact base bytes afterward.
Later narrow manifest edits passed their scoped ESLint/tests; backend build inputs
are unchanged by those standalone tooling changes.

V8 — Shared UI focused38 tests/4 files pass. New menu focus regression failed
before correction (action observed departing menu item) and passes after restoring
persistent-trigger focus synchronously before invoking the selected action. The
unchanged sentence browser assertion proves native dialog return focus now works.
An independent stale test bearer capture was corrected to follow exact local
same-origin API-proxy requests; the full sentence journey then passed.
Other current menu behavior, including closeOnSelect:false, retains regression proof.

V9 — Project-pinned agent-browser0.33.0 scoped Storybook session
languon-cleanup-popover-efb76d943ebf97036084ee0d77ec60ce, local6007, rendered the
canonical UI/Popover Default story and verified open state/content then Escape
and collapsed trigger. No browser exceptions; console only normal Vite/devtools
messages; requests local and successful apart from Storybook's missing favicon404.
Session and owned Storybook server closed. Stories use current compound API; no
new story behavior beyond retiring old source interface.

V10 — Additional cleanup proof is C13–C18 in CLEANUP.md and AUDIO-PERSISTENCE.md:
current shared speech129 units/33 database cases,58 persistence/purge/migration
cases, real SQL role grants, all14 mapped speech browser cases, initial model
retirement209 units/36 database and API journeys, provider catalog browser and
health startup browser proof. No old-only test was removed while its behavior
remained supported. No paid requests. All task-owned infrastructure was removed.

Guarded migration0074 is included and verified forward/idempotent/blocked-inventory
on disposable infrastructure. Ordinary developer DB schema was not reset/applied
during this source delivery; standard explicit migration/startup applies it. The
empty legacy-inventory guard prevents silently losing old objects/tasks. Exact local
maintenance performed instead:6 stale readiness rows removed and2 positively
identified shared recording keys plus2 dependent job keys rekeyed after disposable
proof;11 recordings and all storage/credit identities preserved, guards restored.
No data/secret dumps or persistent guard bypass tooling added.

Initial completion and security review follow this preflight; findings and final
verdict belong to REVIEW.md. Content hashes capture final scoped text inputs.

Final review state: [tested-file manifest](evidence/tested-files.sha256),222
implementation/test/config/document file states, SHA256
`24b81cf9c7db55b35198d10d290b31198e22757d8cea56d107f80af115f8478e`.
Deleted paths are explicit entries. Active evidence/review documents and images
are excluded to avoid self-referential evidence hashes. Both independent reviews
received this state; final comparison is required before merge.

V11 — Security remediation SEC-045-1 removes unused account-purge audio
credentials and retained S3 mappings from Compose/config/examples. Current
document version-delete credentials remain isolated and required. Deployment
regression suite:82 passed,6 unrelated guarded infrastructure skips,0 failures.
Scoped deployment ESLint and diff whitespace checks pass. Reviewed atlas flow
semantics remain accurate; source fingerprints refreshed and9/9 current.
Viewer renderer/tests are byte-identical to browser-tested inputs; this
deployment-only change does not invalidate browser evidence. Security rereview
and completion verdict are recorded separately.

V12 — Completion remediation removes four retired audio lifecycle settings from
`.env.example`, the unused speech adapter/environment purge role, and the obsolete
release guide CLI instruction. Guide now documents `--shared-speech`,
`--model-pricing` and `sharedSpeech.speechBudget`. Reviewed the complete mapped
local-rehearsal test: its existing deploy/failure/rollback assertions remain
applicable; revision synchronized to `sha256:dc9ae5c3247210aa`. Prior rehearsal
verification date remains explicit; no new full image/deployment rehearsal is
claimed. Changed metadata is covered by82 deployment tests and real SQL role
checks already recorded. Final focused speech adapter/storage47tests, backend
typecheck, scoped ESLint,24guide/16validator checks and release mapping pass.
An initial pnpm test forwarding command unexpectedly selected the broader
backend suite and was terminated; it provides no validation evidence. The exact
scoped `pnpm --filter @languon/backend exec vitest run` invocation above passed.
Speech diagram was reviewed against the narrowed role implementation and remains
semantically accurate; all9 diagrams current after fingerprint update. Browser
renderer and journey assertions remain unchanged; prior browser proof is valid.

## Final closure

Independent [completion review](REVIEW.md), [security review](SECURITY-REVIEW.md)
and [viewer tester review](TEST-REVIEW.md) cover the final implementation.
R-1 and SEC-045-1 were fixed, verified and independently rechecked. No material
findings remain. Final manifest222paths SHA256
`24b81cf9c7db55b35198d10d290b31198e22757d8cea56d107f80af115f8478e`
matches the final source state. Reviews/evidence records themselves are excluded.

Full repository suites and a new four-image deployment rehearsal were not run;
affected checks and actual browser/database/SQL-role evidence establish the scoped
change. Migration0074 is included and disposable-tested; ordinary local schema
application remains the normal explicit developer migration step. No push or
remote deployment. The loopback viewer remains running on127.0.0.1:4401.
