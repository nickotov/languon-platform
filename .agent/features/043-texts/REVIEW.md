# Review: Texts

Status: Approved — backend, frontend completion and security reviews closed.
Updated: 2026-10-16.

## Author preflight

Base `664198fee9eb1a0492134c43de9a9d04835568af`; original reviewed working-tree
snapshot [backend-preflight.sha256](backend-preflight.sha256). Final verified
backend snapshot [backend-verified.sha256](backend-verified.sha256).
[EVIDENCE.md](EVIDENCE.md) records tests, builds, real PostgreSQL/Redis and role proof.
No browser evidence claimed because the user explicitly deferred all UI work.

## Independent review

Both independent reviewers used GPT-6.1 Sol as requested. Initial full backend
scope included new/untracked files and changes to existing domains, contracts,
prompts, migrations, shared worker/capacity/credits, purge, HTTP composition,
restricted SQL roles, E2E runner and guide. They did not implement initial code.

- Correctness/architecture: [full report](review-correctness.md), independent
  reviewer `review_sol`; initial changes requested, then bounded remediation review
  approved after reproducing original defects and inspecting repaired paths/tests.
- Security: [full report](review-security.md), independent reviewer `security_sol`;
  initial full security audit plus targeted fix review. No remaining findings.
- Separate tester: `integration_sol` was required for the new guarded real-app
  runner, shared concurrency/retention and cross-domain journey assertions.
  It inspected guide semantics, tested real auth/Hono/PostgreSQL/Redis with only
  external AI replaced, and strengthened actual HTTP polling/security/CORS tests.
  Its assessment found no assertion gaps for the two mapped journey scenarios.
  Broader credit/lease/deletion races remain covered by focused real DB suites.

## Findings and remediation

| ID           | Severity | Problem and impact                                                                                                                                  | Remediation and closure                                                                                                                                                                                                   |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-01        | Medium   | New ADR reused existing0034, making architectural references ambiguous.                                                                             | New Texts ADR renumbered0035; index/references/relationship metadata fixed. Independent closure verified.                                                                                                                 |
| CR-02        | High     | Selection wildcard OPTIONS intercepted later routes, breaking browser PATCH/PUT/DELETE and shared header requests.                                  | All three new route modules limit middleware/preflight to owned paths; real composed-app tests exercise existing profile/dictionary and new methods/headers. Independent closure approved.                                |
| CR-03        | High     | Selection body/rate middleware applied to later modules; valid larger Texts input failed16KB limit and unrelated requests consumed selection quota. | Middleware scoped; regression accepts17k ASCII and20k Unicode codepoints and proves unrelated/preflight routes do not invoke selection limiter. Independent closure approved.                                             |
| SEC-TEXTS-01 | Medium   | Selection source version check preceded authority, leaking inaccessible foreign text existence/version through409 versus404.                        | Initial and retained-source resolution authorize first; stale/current unauthorized/wrong-key/revoked cases404 and authorized stale409. Text/folder capability DB regressions11/11; independent security closure approved. |

Reports contain original locations, reproduction scenarios, suggested fixes and
reviewed source hashes. No accepted open material findings or security exceptions.

## Final checkpoint decision

Backend AC-01–AC-08 verified. Source-grounded prompt/handoff AC-09 saved only after
backend approval. The overall feature remains active: AC-10 requires the returned
design, implementation and browser/E2E evidence. No merge, push, production rollout,
provider-network proof or visual-fidelity claim is included in this checkpoint.

## Subsequent API-only checkpoint — 2026-10-15

After user selected the returned OS design, safe design-independent web API
integration proceeded while actual component source remains inaccessible. Separate
[API audit](review-web-api.md) approved the entity adapter after WEB-API01 repair;
12 focused tests independently rerun. No UI, route, source-fidelity or browser
acceptance added by this checkpoint. Full completion review remains required after
source retrieval and visual implementation.

## Feature completion review request — 2026-10-16

Current author preflight: web629/contracts100, content DB14, real combined5 API+3
browser journeys, typed production builds/lint/styles/guide checks pass. Review
source is frozen in ui-preflight.sha256; selected reference v003 and source-based
inventory UI-01–UI-40 are authoritative. Root is adding stronger multi-paragraph/
contextual-sense regression proof before final handoff, with any production fix
subject to targeted independent remediation review. Existing backend/API audits
are reused only where exact prior hashes remain unchanged.

### Initial UI completion findings

The independent completion and security reviews identified account-isolation
defects in owner workspace query/local state and public collection local state,
a missing public-copy cache refresh, pending-save edit loss, and missing
source-design error recovery controls. Remediation is in progress with focused
regressions. See [completion review](review-ui-completion.md) and
[security review](review-ui-security.md) for exact locations, severity and scope.
No completion approval is claimed before bounded fix review.

| UI finding           | Severity | Impact                                                                            | Assigned remediation                                                                                                                 |
| -------------------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| UI-CR-01 / SEC-UI-01 | High     | A prior account's private workspace could be adopted from shared client cache.    | Actor-scoped queries/writes, workspace remount and late-result fencing; account-switch regression.                                   |
| UI-CR-02             | Medium   | A copied text/new folder could remain missing from fresh destination lists.       | Await actor-scoped cache invalidation before completion.                                                                             |
| UI-CR-03             | Medium   | Typing during Save could be overwritten by the saved snapshot.                    | Disable editable content/languages during Save; delayed-save regression.                                                             |
| UI-CR-04             | Medium   | Source-design failed-job dismissal and capacity shortening controls were missing. | Restore explicit dismissal and edit recovery controls.                                                                               |
| SEC-UI-02            | Medium   | Public collection retained private dictionary choices across account changes.     | Reset/remount by actor/session; abort and fence stale list/job continuations. Public-copy continuations receive the same protection. |

## Final completion decision — 2026-10-16

All UI-CR-01–04 and SEC-UI-01–02 findings are closed. Independent completion
review approved the account/cache, save protection, recovery controls, exact
paragraph/context selection and compact header remediations. Security review
approved actor isolation and final context filtering; no material finding remains.
The final browser3/API5 runs and phone-only CSS1 rerun pass; all affected static,
unit, build, database and traceability evidence is recorded in EVIDENCE.md.

Final author source identity is227 files in ui-preflight.sha256, manifest SHA-256
`3894b0517afc36d9d4e47d748ab2fed4b9adbd264ffe12402dbb850df5f76fea`.
The reports preserve initial findings and bounded closure history; the source
reference is the pinned v003 export, with source-based fidelity limits explicit.

## Active capacity follow-up

Prior v003 completion/security approvals remain historical. New task-specific
capacity, internalformatmigration, estimates and providerprofile changes require
authorpreflight and bounded independentcompletion/security reviews beforeclosure.

## Capacity follow-up final decision — 2026-10-16

Approved: [correctness](review-capacity-correctness.md) and
[security](review-capacity-security.md) report no material finding. The concrete
local activation transaction was separately approved before application. Final
worker deadline and all-Flash-job rollback clarification were bounded reviewed.
Evidence E10 records current unit, real DB/API/browser, SDK wire, build and
traceability results. Capacity manifest identifies the exact final source; original
v003 review/source history remains preserved. No unresolved acceptance gap.
