# Review: Sentence library management

Status: Complete — backend and returned-design frontend approved after remediation.

## Initial independent backend completion review

Reviewer: `/root/sentence_management_completion`, current working tree against
main `cb9f3ed9d96a95ac606d1089b10e81ab0f1c2384`, including untracked new files.

- F039-R1 High: the live worker omitted the preparation-publication opt-in, so
  admission could not find a capable worker. Fix both publication paths and prove
  the actual command publication settings.
- F039-R2 Medium: permanent deletion acquired capacity after admin user locks,
  inverting admission/worker order. Move capacity first and prove with two sessions.
- F039-R3 Medium: completed manifests did not report stale readiness after entry
  changes. Revalidate read projections and reject stale prepared practice.
- F039-R4 Medium: later preparation partitions had no discovery API. Add bounded
  batch pagination and exercise a second partition without new generation.
- F039-R5 Medium: confirmation versions did not pin linked card currentness.
  Include content/currentness identity in opaque versions and reject stale scopes.

- F039-R6 Medium: saved-first scans could hold one worker transaction over the
  entire library. Persist a scan cursor and bound each coordinator step before
  yielding; do not generate prematurely while eligible saved examples remain.
- F039-R7 High: independently confirms SEC-01 retained-copy exhaustion.

## Initial independent security review

Reviewer: `/root/sentence_management_security`, same baseline and backend scope.

- F039-SEC-01 High: free requests could retain unbounded full-dictionary copies
  and confirmation arrays. Bound actor snapshots, selection size and per-learner
  content-bearing preparations; serialize quota checks, expire inactive content,
  preserve safe idempotent tombstones and fence unsettled work.
- F039-SEC-02 Medium: the destructive lock inversion, tracked jointly with R2.
- F039-SEC-03 Medium: missing live preparation capability, tracked jointly with R1.
- F039-SEC-04 Medium: public generator IDs enabled unnecessary identity correlation.
  Creator IDs and filters now belong only to administrative projections/contracts.
- F039-SEC-05 Low, defense in depth: the trusted worker has direct job/reservation
  INSERT rights for preparation admission. A compromised worker database session
  could abuse those rights. No reviewed HTTP path bypasses admission; current
  transaction/lifecycle/capability guards and restricted-role tests remain required.
  A narrow DB admission function or deferred preparation-child guard is a follow-up
  hardening option. Record and reassess this residual risk in the final verdict;
  do not silently mark it remediated.

The security reviewer found no additional material tenant/authentication defect:
public operations reauthorize share/dictionary access; prepared manifests are
learner/dictionary bound; admin operations revalidate membership/session/recent
authentication and atomically audit success; purge requires creator archive,
version confirmation and settled work while retaining permitted accounting.

## Remediation and final verdict — 2026-10-06

Completion reviewer `/root/sentence_management_completion`: no material unresolved
R1–R7 findings in the narrow reassessment of stores, worker publication, contracts,
HTTP routes, schemas/migrations, deletion/role boundaries and focused tests.

Security reviewer `/root/sentence_management_security`: approved backend scope;
SEC1–4 closed. The final follow-up also removed the global capacity lock from
preparation snapshot creation and made bounded inactive expiry run under a busy
queue. The final 56/56 PostgreSQL bundle proves these conditions, including
shared tombstone replay and restricted-role expiry cleanup.

Both reviewers accepted the retained SEC05 low residual: the worker is an already
trusted provider-execution boundary with provider credentials, and reviewed HTTP
and model-output paths cannot execute arbitrary SQL. Direct insertion still
increases compromised-role impact. A database-owned admission function/deferred
preparation guard remains future hardening; this is documented, not claimed fixed.

Backend static/build checks, contracts, focused unit/database/role tests and the
maintained composed API journey passed. Source/proof hashes are in the evidence
manifest. The final review assessed the stable uncommitted candidate against main
`cb9f3ed9d96a95ac606d1089b10e81ab0f1c2384`; the checkpoint commit records that candidate.

New UI, returned design selection, browser fidelity and whole-feature completion
were outside this checkpoint. They remain required before the feature is Complete.

## Returned-design frontend review — 2026-10-07

Reviewer `/root/sentence_frontend_e2e` independently inspected production web/admin
changes since backend checkpoint d74fbbd, excluding the browser harness they
authored. Separate harness verification was performed by `/root/admin_sentence_ui`,
who did not author the harness. New agent creation/resumption hit the thread limit;
these bounded independent assignments use available isolated agent contexts.

- FUI-R1, Medium, sentence preparation model recover: periodic first-page polling
  discarded previously loaded rounds beyond page 25, impairing full-dictionary
  practice. Author retained loaded depth during guarded refresh; reviewer accepted
  the remediation pending the dedicated load-more/poll regression result.
- Harness verification: deterministic provider injection, explicit test opt-in,
  loopback test-database/run-ID guards, real migrations and preparation ticking
  were independently checked; no material harness issue found.
- Initial frontend security assessment: no high/material security issue found in
  scoped API validation, actor/dictionary/capability cache isolation, share headers,
  read-only previews, reasoned admin mutations, recent authentication or deletion
  guards. Final verdict awaits real-browser evidence and integration reassessment.

## Frontend remediation dispositions — 2026-10-07

- FUI-R1 Medium, preparation recovery model: retain previously loaded batch-page
  depth during polling. Dedicated regression passes; independent review accepts.
- FUI-R2 Medium, library preview composition: Tailwind sibling spacing applied a
  20px margin to the native full-viewport dialog. Dialog siblings now sit outside
  the spaced content wrapper; no shared viewport-CSS override. Browser asserts
  narrow x=0/y=0/390×844 and desktop 480px right alignment. Closed.
- FUI-R3 Medium, library routing: separate detail leaf remounted list state and
  lost selection/pages. Persistent owner/shared route layouts retain the scoped
  observer and local selection while changing preview params; capability revisions
  still reset state. Browser checkbox roundtrip and independent security
  reassessment pass. Closed.
- FUI-R4 Medium, library preparation-sheet caller: model recovery omitted the
  source's AI-settings action. Callback now opens existing account preferences;
  all eight rendered preparation-state checks pass. Closed.
- FUI-R5 Medium, admin user-detail integration: eager discovery requested an
  unavailable library for deletion-pending/purged targets. Render only for existing
  backend-supported pending/active/disabled states and load on explicit Manage.
  Lazy-discovery unit regression passes; existing deletion/cancellation workflow
  no longer emits the unexpected discovery 404. Final admin 9/9 browser run passed. Closed.

Neither routing nor discovery remediation introduces new persisted data, public
contracts, cache sharing or authorization changes. No new material frontend
security finding has been identified; SEC05 remains the documented backend
low residual, not a claimed fix.

## Final independent frontend verdict — 2026-10-07

Reviewer `/root/sentence_frontend_e2e` approves completion/security of production
changes since backend checkpoint d74fbbd, including untracked frontend modules,
shared UI contracts and remediation. Harness review remains the separately
performed `/root/admin_sentence_ui` assignment; the reviewer did not author
production frontend changes. No unresolved material correctness, acceptance,
architecture or security finding remains. Source inventory/runtime captures,
web 9/9, admin 9/9, flashcards 1/1, static/unit/build and guide evidence support
the verdict. FUI-R1–R5 are closed. SEC05 remains accepted low defense-in-depth
worker hardening from the backend verdict, explicitly not remediated.

Review scope is main cb9f3ed baseline, backend checkpoint d74fbbd and the final
frontend candidate identified by the frontend evidence manifest. No new backend
trust boundary, contract, migration or production dependency was introduced by
the returned-design stage. Source-based fidelity is verified with retained code
and local captures; provider reference screenshots were unavailable.
