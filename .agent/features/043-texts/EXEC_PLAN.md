# ExecPlan: Texts

## Goal and specification

Implement AC-01–AC-09 in [FEATURE.md](FEATURE.md), then await the user’s Magic Patterns
design before AC-10. User explicitly authorized this backend-first checkpoint.
Use feature/texts; no merge to main until the entire feature is verified.

## Existing architecture

DDD typed backend modules, shared Zod contracts, Drizzle PostgreSQL durable jobs,
shared text-ai model selection/capacity, ai-credits transaction participants,
dictionary card settings/revisions and capability shares. ADR-0011/0012/0022/0026/
0027/0032/0033 constrain persistence, trust, rollout and accounting. Source selection
context is not the existing 1,000-character persistent semantic hint.

## Milestones

- [x] M1: Contracts, text domain/content/persistence and generated migrations (AC-01–03/06).
- [x] M2: Durable detection/translation and vocabulary work with shared AI/credits (AC-02–07).
- [x] M3: Composition, worker/permissions/purge/rollout, API journeys and author checks (AC-07–08).
- [x] M4: Independent correctness/security review and concurrency verification; remediation (AC-08).
- [x] M5: Verified backend prompt/checklist/versioned handoff; await returned design (AC-09).
- [x] M6: Selected-design frontend, browser fidelity/E2E and final review/integration (AC-10).

## Test strategy

Contract/domain units, real disposable PostgreSQL/Redis repositories, HTTP journeys,
worker fencing/recovery/idempotency/credit settlement, sharing and lifecycle races,
migration fresh+existing upgrade, affected lint/typecheck/build and traceability.
No paid providers. No new user-visible UI in backend phase, so browser proof follows
returned-design implementation. Separate tester warranted for new concurrency and
multi-module atomic creation/accounting; security review for sharing, SQL and AI.

## User-flow documentation

Create docs/user-flows/texts.md with stable API/system scenarios and exact registered
command/test mapping. Implementation API path and scenario identities will be recorded
once contracts settle. Future browser scenarios added with returned design.

## Progress

2026-10-15: Clean main inspected; feature workspace and branch created. Authoritative
specification recorded. Beginning parallel nonoverlapping backend implementation.

## Decisions

D1: Backend completion is an explicit checkpoint, not whole-feature completion.
D2: New typed texts module owns text content/work; dictionaries own collected cards.
D3: New selection context is temporary job data; no persistent excerpt on card.
D4: New dictionaries are committed with their first generated card atomically.

## Validation and remaining work

[EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md) own proof and findings.
M1–M5 complete: backend implemented, deterministic/full-app/database checks passed,
independent correctness/security findings remediated and closed. Versioned
[design prompt/handoff](DESIGN.md) saved after backend approval. User has returned the selected
Magic Patterns OS design; M6 API work is complete, and visual integration awaits
retrievable source as recorded in the resumed progress entries below.
Overall feature is not complete and must not be merged yet.

2026-10-15: Workers switched to GPT-6.1 Sol at user request. Disposable role,
concurrency, lifecycle and API journey evidence collected; see EVIDENCE.md.

2026-10-15 checkpoint: CR-01 ADR numbering, CR-02/03 cross-route middleware and
SEC-TEXTS-01 unauthorized version projection fixed and independently closed.
Final suites: backend946 units; remediation35; content11; AI8; selection10;
shared capacity11; credits24; purge11; migrations2; composed real API journeys5.
Static/build/guide evidence in EVIDENCE.md. Backend manifest frozen. No frontend
files, production migration, deployment or paid AI call. Local checkpoint commit
preserves the branch for M6; no merge/push/branch deletion at this phase.

Final handoff checks: affected backend/contracts/prompts lint, backend and shared/
web/admin typechecks, backend ESM/DTS build, changed-file Prettier check,
`git diff --check`, flow mapping and exact v002 canonical/snapshot comparison all
passed. All95 backend-manifest files still match their verified hashes. Removed
only the two labelled disposable Texts test containers after verification; existing
development infrastructure unchanged. Latest design candidate v002 explicitly
filters dictionaries by selection language direction; v001 history preserved.

2026-10-15 resumed M6: user returned and selected Texts/related components at the
Magic Patterns OS URL recorded in DESIGN.md. Connector cannot resolve/read this
new URL type and visible GUI source access lacks macOS Accessibility permission.
Requested a direct component/preview link; continue design-independent frontend API
integration while awaiting source. No visual implementation/fidelity inventory yet.
Worker `texts_web_api` (GPT-6.1 Sol) owns only entities/texts adapter and tests;
root retains product integration and design provenance. Preserve backend evidence.

M6 partial checkpoint: typed frontend API adapter complete;12 focused tests,
webtypecheck, scopedlint and diff hygiene pass. Independent API review identified
body-consumption AbortError swallowing; remediated with success/error HTTP-response
regressions and reviewed separately in review-web-api.md. No visual implementation
or route wired while design source is inaccessible. Overall feature still active,
unmerged. Resume M6 once direct preview/source export becomes available; inspect
source, capture version/hash/reference inventory, integrate UI, execute browser/
E2E checks, then perform full feature completion review and local squash merge.

2026-10-15 source retry: user supplied replacement OS component hEpH1MriKEKQaMUFkvRxLA
and explicitly requested MCP extraction/integration. Fresh resolver/artifact/status/
version/history and design-system discovery still expose no Texts source. GUI
permission status reports granted but actual component-window inspection is denied
on initial call and one setup-assisted retry. Details in DESIGN.md. No application
code changes or visual fidelity claim. M6 continues to require retrievable source.

After user reported increasing access, retried MCP and safe Chrome source-reading
fallbacks. The connector still cannot resolve OS component source, and Chrome HTML
save yields only the workspace loader. No further application work can establish
design fidelity without a usable code export. No UI code changed in these retries.

2026-10-16 author preflight: readable v003 source integrated. Current tree passes
web629/contracts100 tests, owner DB14, final combined5 API+3 real-browser journeys,
web/backend typechecks/builds and web lint/styles. Guide now maps5 scenarios to one
guarded combined runner; revision acf772fc455606f8. Added source controls inventory
UI-01–UI-40 and local decisions D5–D8. Completion reviews pending; stronger real
multi-paragraph/contextual sense case being added. No final merge/complete yet.

2026-10-16 strengthened browser regression caught paragraph-boundary whitespace
loss during explicit sentence editing. Remediated lexical editors with per-ID
separator restoration on both sides;14 focused tests/typecheck/lint pass. Strict
three-journey browser rerun and independent completion/security reviews running.

2026-10-16 final contextual browser gate found whitespace-only Intl sentence
units masking previous-paragraph context. Minimal domain filtering fixed with
three red-first regressions;390 affected tests pass. Independent bounded review
found no issue; strict three-browser-journey rerun is in progress.

2026-10-16 final: selected v003 integration and all acceptance controls verified.
Independent completion/security reviews approved after bounded remediations.
Final current-source proof: web650, affected backend390, contracts100, real
content DB14, API5, full browser3 plus compact CSS phone1; production builds,
typechecks, lint/styles, formatting and guide traceability pass. Runtime evidence
and precise remaining operational boundary are recorded in EVIDENCE.md. Required
local feature integration follows; no push/deploy/branch deletion is authorized.

## Active capacity follow-up

- [x] M7: AC-11 — reviewed per-task limits, immutable versioned dispatch,
      preflight fix, provider boundary tests, real DB/E2E and independent reviews.

The user authorized this existing-feature repair. Currentbranchfeature/texts-capacity
startsfrom15eaeb9; preservepriorcompletedv003evidence. Rootownsproviderpreflight,
fixtures/docs/integration; GPT-6.1Solworkers own sharedprofile/resolver/admission
and internalv2format/schema/migration respectively. Original providerselection
andlocalconfigmutations waitforuser'spendingexplicitmodelchoice. No paid AI
call is authorized as verification; externalmodel/ emailservicesremain synthetic.

Verification: red-first provider tests for realisticmultilingualarticle, larger
profile andgenuineoverflow; sharedsnapshot/legacy/providerpayload tests; realPG
v1/v2claimisolation +fresh/upgrademigration +creditenvelopes; mappedAPI/browser
translationjourneys; affectedcontracts/backend/webtypes/lint/build. Independent
completion+security reviewafterauthorpreflight; reportprofile/selectionlimits honestly.

M7 complete, 2026-10-16: profile/admission/resolver and actual SDK payload
verified; generated migration0068 preserves v1 and isolates v2 claims. Final
evidence: backend956 tests, contracts100, real PG12, API5, browser3 including
11,700-byte French/Russian 100-pair proposal/save/reload, plus focused worker13
after the 180-second deadline adjustment. Typechecks, lint, builds, formatting
and guide traceability pass. Correctness/security and concrete local activation
reviews approve with no open finding. Local Flash default, worker and migration
are active; services remain healthy. Only final local squash integration and
cleanup of capacity-test infrastructure follow. No paid AI test or deployment.
