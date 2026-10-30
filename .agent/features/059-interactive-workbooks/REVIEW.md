# Review: Interactive knowledge workbooks

Status: Initial source review complete; security remediation and final evidence pending

## Boundary and mode

Initial independent source review covered the complete scoped feature diff,
affected callers, AC coverage and planned final gates after focused author
preflight. Subsequent review is focused remediation and final-evidence review. Independent security review covers malicious content, media/uploads,
private learner data, sharing/copy authority and AI tool boundaries. A separate
tester assesses cross-application lifecycle/concurrency coverage.

## Findings

Early financial/security source review identified the following material findings.
This bounded review is not the full feature completion review.

- SEC-1 — **High**, `infra/deploy/sql/dictionary-worker-role.sql:155` and
  `apps/backend/drizzle/0125_knowledge_transcription_authority.sql:1116`:
  restricted workers can directly forge terminal transcription output without
  atomic financial settlement. The feature table also lacks the deferred
  feature/action consistency constraint. This can publish forged text and strand
  holds. Replace raw terminal writes with a fenced security-definer operation
  that observes, publishes and settles atomically; restrict grants and prove
  denial under the actual worker role. **Closed for the bounded transcription surface: E33 actual-role proof and independent remediation review.**
- SEC-2 — **Medium**, migration 0125's
  `languon_observe_transcription_call`: duration observation is not bound to the
  executing worker/fence. A holder of two valid job/receipt pairs can poison
  immutable usage observations. Bind observation to the dispatch witness and
  fenced terminal path, with two real issued jobs in restricted-role regression
  tests. **Closed for the bounded transcription surface: E33 actual-role proof and independent remediation review.**
- SEC-3 — **High**, `knowledge-transcription-admin.ts`,
  `transcription-admin-readiness.ts`, migration 0125 dispatch and
  `transcription-openai.ts`: native billing approval and credentials can currently
  permit private-audio processing without a distinct code-owned processing
  controls approval. Pin a reviewed retention/training/residency/processor
  controls revision across configuration, job and dispatch; default to blocked.
  Pricing, probes and billing attestations must not satisfy processing approval.
  **Closed for the bounded transcription source and E38 actual-role evidence,
  independently verified. Combined final gates and operational attestations remain.**

The early review found no material defect in the examined narration/account/MCP
purge definers. Physical asynchronous object deletion and provider retention were
not proven; this observation is not a full security verdict.

- SEC-4 — **High**, `infra/deploy/sql/dictionary-worker-role.sql:158`:
  table-wide transcription-job SELECT exposed completed private transcripts to
  every holder of worker credentials. The bounded remediation reviewer found
  this while inspecting SEC-1/2 repairs. Replace table-wide SELECT with queue/
  lease column grants and explicit projections; retain private source/result
  retrieval behind job capability authority. **Closed: E33 passed17/17 through migration0136, and the independent
  remediation reviewer verified the current grant/test/execution hashes.** The
  earlier E30 run predates this repair and does not close the finding.

The bounded reviewer found no remaining SEC-1/2 integrity defect in the repaired
source: unpredictable lease capabilities bind the executor, worker/fence and
dispatch receipt, terminal observation/publication/settlement is atomic, and a
deferred feature/action constraint rejects unsettled terminal writes. The bounded reviewer also verified E33 against the current source. Broader feature
security review and all final gates remain pending; later privacy changes require
their affected checks.

## Remediation

Pending source review. Record stable finding IDs, severity, location, problem,
impact, fix and disposition. Remediation reviews focus on fixes and affected
invariants unless scope changes warrant broader review.

## Final evidence approval

Pending all required gates. No completion approval or implementation verdict is
issued. Final verdict must reference EVIDENCE.md and identify any missing proof.

## Independent completion source review (initial)

Boundary: main5735593 through foundationbb9b40b and all tracked/untracked feature
worktree files. The independent reviewer inspected implementation, callers and
acceptance coverage; moving patch hashes will be recaptured after remediation.
All findings below are Medium. Final approval remains pending.

- REV-01 — Timed video hints lacked replay (`exercise-source.ts`,
  `exercise-block.tsx`, `media-block.tsx`), preventing the prepared timestamp
  interaction. Fixed reusable validated video replay; source remediation reviewed.
- REV-02 — Workbook copy silently omitted draft members (`workbook-store.ts`,
  workbook detail). Owner copying now rejects atomically with a localized save
  notice; shared copies remain saved-only. Source and focused DB/UI proof reviewed.
- REV-03 — Library and private-translation text concatenated passages without
  boundaries (`library-copy-text.ts`, `private-translation-store.ts`). This changes
  readable wording and billed translation input. Canonical paragraph separators
  must preserve alignment offsets and normalize exactly once between original
  blocks, job segments, overlays and Text copies. Library projection/unit and private publication/SDK multi-passage proof are
  complete (E39); combined final gates remain pending.
- REV-04 — Unsupported video provider/page URLs had no ordinary link after
  playback failed (`media-block.tsx`). Fixed revalidated HTTPS fallback with safe
  target/rel; source remediation reviewed.
- REV-05 — Editing a non-first prepared translation deleted the first and
  mislabeled displayed rows (`learning-block-form.ts`, form dialog). Fix preserves
  all other targets and adds an explicit prepared-language picker/add action.
  Root focused editor suite13/13 passed; independent remediation review closed
  the source/order/picker finding.
- REV-06 — Private translation could charge for a target already prepared by the
  author (private translation UI/service/store). UI excludes those targets and
  the server rejects before burst/admission. Source and focused proof reviewed.
- REV-07 — Bilingual text could be authored as a hint source but produced no
  learner Hint or AI-feedback passage (`exercise-source.ts`). Fixed selected
  original-order untimed transcript projection and feedback; source reviewed.

## Completion remediation review

Independent reviewer closed REV-01/02/04/06/07 for source and reported focused
proof. Their changed browser assertions still require execution on final source.
REV-03 and REV-05 are closed for source and focused proof (E39 and root's
13-test editor selection); the independent reviewer confirmed both repairs. Separate SEC findings and required final gates prevent
completion approval.

## Full feature security review — open remediation batch

The independent full-surface reviewer identified four additional High findings.
This repeated raw-grant pattern requires a systematic least-privilege audit of all
new worker capabilities; isolated positive worker tests were insufficient.

- SEC-5 — `dictionary-worker-role.sql:137` and migration0136 publication: a
  mutable terminal Text job plus a historical settled witness allowed replayed
  private overlay publication, changed targets and forged timestamps/results.
  Impact: cross-learner private translation corruption. `transcription_security`
  owns immutable requested target, hidden current-lease capability, one-shot
  publication receipt/authoritative time and terminal fact protection (140/141),
  with real restricted-role negative tests. **Closed for bounded source and E39
  evidence, independently verified; final combined gates remain pending.**
- SEC-6 — `dictionary-worker-role.sql:74` granted raw read/insert on private
  knowledge sentence exercises, attempts and exposures. Impact: disclosure and
  forged private history across learners. `sentence_practice` owns fenced
  job/source/input/actor publication and revoked raw grants (139), deferred
  financial consistency and actual-role denial/schema-boundary tests. **Closed for bounded source and E37/E42 actual-role, SDK, retention and
  legacy-compatibility evidence, independently verified. Final gates remain.**
- SEC-7 — `dictionary-worker-role.sql:153` granted every private working branch
  body to workers. Impact: cross-author disclosure of unpublished content. Root
  replaced this with version/identity-only grants; proposals use a live-turn/
  lease/owner/target/media definer (142) with no private branch/proposal reads.
  The security reviewer found the source exploit closed; E41 proves actual-role
  success and denied private reads on the final146 chain. **Closed bounded
  source/evidence; final gates remain.**
- SEC-8 — `dictionary-worker-role.sql:155` granted raw narration marker insert.
  A forged note-to-recording association could cause unrelated speech deletion
  during note/account cleanup. Root revoked both marker SELECT and INSERT; only
  authenticated admission creates provenance. Source exploit closed per reviewer; E41 proves restricted marker denials,
  while E38/E42 retain source/account cleanup and independent-copy proof.
  **Closed bounded source/evidence; final gates remain.**

The reviewer confirmed turn authority/source snapshots are trigger-immutable, so
142's lease/target fence cannot be retargeted by raw chat updates. Nested proposal
validation remains canonical at authenticated owner list/apply boundaries; malformed
worker suggestions fail closed without editing saved material. This is not full
security or final-evidence approval.

### Later completion remediation findings and verdict

- REV-08 — **Medium**, `KnowledgePrivateTranslation`/`BilingualBlock`: switching
  existing private overlay targets retained the previous child's language state
  and hid the new translation. A target/revision presentation key resets only
  that private view; the real widget/query two-overlay regression passed1/1.
  Independent reviewer source-closed this finding.
- REV-09 — **Medium**, `texts-job-support.loadTextTranslationProposal`: a guard
  rejected completed private jobs whose public result was intentionally redacted
  before hidden-receipt hydration. The guard now permits only the marked private
  source case, retaining live source authorization. E39 proves positive hidden
  loading/Apply to a real Text and revoked-source rejection. Independent reviewer
  verified current test/publisher/role hashes and closed this finding.

The independent functional reviewer now source-closed REV-01 through REV-09.
REV-03's actual multi-passage SDK→overlay→Text proof is included in E39. REV-05
final editor selection passed13 tests and preserves prepared-language order.
This closes the functional source phase, not feature completion. SEC3 is
bounded-source/evidence closed by E38; SEC6 by E37/E42 and SEC7/8 by E41.
All final gates/evidence approval remain pending. SEC5 is bounded
source/evidence closed by E39; later role/SQL changes need combined verification.

### Inherited security residual (outside feature-regression boundary)

The full reviewer also identified an inherited raw SELECT grant on
`knowledge_notes`/`knowledge_note_revisions` in the unchanged main worker-role
baseline. A compromised worker database credential can read private saved notes
and revision history across owners; feature059 does not eliminate this risk.
The reviewer confirmed this grant predates059 and agreed it is a separately
documented least-privilege residual, rather than a new059 regression/blocker.
A broader source-access hardening task should replace inherited raw source reads
with live operation-bound access consistently across existing conversations,
dictionaries and Texts. No new raw source privilege is authorized by this note.

### UI remediation review (2026-10-29)

Independent reviewer completion_review reviewed bounded editor/menu/authoring/
copy/library/media-disclosure files, upload retry and private translation label.
UI-REV10 Medium: failed upload retained native selected file, preventing retry
with same file; fixed by clearing before validation/await and verified rejected
then identical-file successful retry. Source closed. UI-REV11 unsupported Menu
placement was reverted; shared UI contracts unchanged. No other material source
finding. Reviewed UI source/test manifest SHA256
`2c427ac5825968fc9e3bab2cd034330a45fa213a40e42af5b22c6dd9917a90b3`.
Final browser evidence/fixture remediation review pending; this bounded review
does not approve unfinished F059 delivery.

### Bounded UI approval — 2026-10-29

Independent completion_review approves the editor redesign/readiness/media
lifecycle slice only. Current source/test manifest SHA256
`894d1169eb6eca1b9dd675a278a86061b6ba99af326107ed89760bcd9af97061`.
UI-REV10/11/12 closed; readiness30/30, lifecycle12/12, frozen registered browser
48091/run c15aa822-b532-496f-99a1-879fd66faaa9 passed2/2/no skips.
Type81963, styles31690, affected ESLint64539, docs8544, mapping, formatting and
diff checks pass. Reviewer independently inspected four design states; root
rechecked final desktop/mobile captures. No open material scoped UI finding.
No live paid provider call was performed. Full F059 approval remains withheld:
approved transcription provider/model selection, broader build/full-critical and
final-delivery gates are still pending. Artifact statuses remain In progress.

### Owner-chat incident source review — 2026-10-29

Independent functional reviewer approves bounded admission budget binding,
production composition regression, generation_failed UI mapping and guide/critical
registration. Source/test manifest SHA256
`c479b6dc05f71e0625751aff1d310c439a409709d97daa0250a95b525fed7c0c`.
INC-REV13 Medium evidence gap closed: exact admitted aggregate equality, reviewed
price rates and positive Paid success charge added; final18698 passes4/4 with
immutable admission and correct failure/free settlement. Independent security/
financial reviewer approves same accounting/test hashes: final budget merely
mirrors existing reserved/capacity-checked clamps; no new policy/ADR needed.
No open material source finding. Final backend type/full critical/mapped browser
evidence approval remains pending and does not imply full F059 completion.

E45 expanded source review: independent completion/security reviewers approve
Texts find() identity projection and exact authorized-fallback retry fixture.
Owner/folder/live Knowledge grant checks remain; full Text version checks remain
at mutation stages. Texts17/17 evidence accepted. INC-REV14 Medium identified a
stale required sentence-test title after v1/v2 parameterization. Closed on source:
both exact titles now mandatory, independent-removal regression passes16/16
registry tests, preserved3962 report validates748 current scenarios. Its command
still recorded failed. Manifest13files
ed5b544c74a94061518662e92be08b2a663696b57b6d345e1955315b559acd4b.
Final suffix and bounded incident evidence approval pending; F059 remains open.

### Bounded E45 incident approval — 2026-10-29

Independent completion_review grants final bounded evidence approval: all14 union
reports revalidated,774 tests and hashes/counts match; terminal0549232b backend
67/748 + speech4 + adminMCP3 passed/no skips/exit0. Admin2 and other ten browser
flows remain valid preserved evidence; earlier failed commands stay failed.
Browser artifact hash and frozen13-file manifest ed5b544c… match. INC-REV13/14
and secondary Texts regression are closed; no open material scoped finding.
Independent security/financial review approved budget binding and Texts live
source authorization. No live/paid provider call was made, so external provider
availability/model behavior is not established. Production composition and
read-only current-config factory readiness are established. Approval applies
only to owner-chat incident/remediation; parent F059 remains In progress.

### E46 requested UI and continuation repairs — source review

Boundary: checkpoint ef53108 plus the scoped source manifests; parent Feature059
is not under completion approval. Independent e46_completion_review and
financial/security review examined the requested changes.

- E46-REV1 Medium: shared block menus disabled dependency-bearing Copy. Resolved
  by the existing authorized destination preview flow for audio/source exercises;
  Duplicate retains its same-note destination. Raw clipboard restrictions remain.
- E46-REV2 High: unconditional full-route input reservation rejected affordable
  customer actions. Resolved by a pre-hold bounded search that preserves initial
  output allowance and per-call/aggregate/operator/customer/wallet limits. Paid60
  credits admits55000 input units and completes both calls; operator64000 and
  ordinary/reduced/minimum allowance cases retain their original behavior.
- E46-REV3 High: native block drag failed in Chromium. Resolved by an explicitly
  draggable grip, non-hit-testable decorative SVG and a faithful source-first
  native mouse test before distant-target scrolling. Browser proves exact moved
  identity set, no duplicates and exact saved/reloaded order. Temporary probes
  removed. Modifier-copy rejection and HTML non-authority remain intact.
- Controlled-content replacement no longer flushes React node views inside an
  effect: a cancellable microtask preserves no-update behavior and discards stale/
  destroyed work. Prose heading margins are excluded from custom blocks. A
  successful typed-block reply no longer suggests its acknowledgement as a
  separate prose document edit; failed/no-tool replies preserve existing behavior.

Focused source evidence: backend35, web62, scoped type/lint/style/format checks,
registered workbook browser2/2 and chat/credit/interview reports. Source approval
has no open material finding; final evidence approval remains withheld until a
complete valid execution gate and required remaining flows pass.

#### Test-harness stability finding

Terminal c586 report has747/749 passes. The restricted-role SDK/private-translation
case hit Vitest's implicit5s body deadline; abandoned SQL overlapped the following
quote fixture, causing its deadlock. Isolated unchanged cases pass, and no orphan
critical worker or competing database writer was found. No production failure or
runtime-deadline relaxation is inferred from that harness interruption.

Both completion reviewer and independent tester approve only a testcase-local
30000ms budget for this parameterized real-SDK/role/grant/copy/revocation journey.
The worker timeout10000ms, all privilege/privacy/financial assertions, global
Vitest defaults, retries and other testcase budgets remain unchanged. This case
asserts functional security behavior, not a5s product SLO. Retain c586 as failed;
full affected file and fresh complete67/749 gate are required after the repair.

#### E46 terminal evidence checkpoint

Final75c427d8 is terminalEXIT0: backend67/749, speech4, adminMCP3 all pass/no skips.
Independent completion reviewer revalidated all14/775 current-validator reports
in the truthful union, the unchanged31-file manifest9712b627…, and absence of
temporary drag probes. No material scoped finding remains. Failed prior runs
remain failed. Final record approval requested; F059 stays In progress.

### Final bounded E46 approval — 2026-10-29

Independent e46_completion_review approves the four requested repairs and their
remediation/evidence, with no open material findings. Exact31-file manifest
9712b62705363f0b10f696e30dbe5a794f9f55740c2e64a7afc32bfab6dae42d
and all14/775 union reports/hashes revalidated. Terminal backend67/749, speech4,
adminMCP3 pass/no skips. REV1/2/3 closed; scoped harness watchdog approved with
worker10s and all security/financial assertions unchanged. No DnD probes remain.
External paid/live provider availability/model behavior was not exercised; real
production composition uses deterministic external transport. Parent F059 remains
In progress; this approval is E46-only.

## v16 early independent assessments — implementation still active

These assessments are not completion approval and do not replace the final
stabilized-source review or required execution/browser gates.

### Independent testing assessment

`v16_test_assessment` reviewed the moving source and identified required evidence:
exercise-evaluation HTTP/app composition; source changes/revocation between dispatch
and publication; bilingual field worker proof; proposal lifecycle UI; paid speech
source behavior; v16 browser journeys and reference/runtime comparison. Evaluator
worker subsequently added the HTTP9 cases and production-dispatch bilingual,
normal/reduced and in-flight denial cases. Final-source reruns remain required.

### Early security review

`v16_action_security` reported two material Medium findings (no Critical/High in
that snapshot), both accepted and assigned to the speech worker:

- **SEC-V16-01 — Open remediation:** knowledge speech must revalidate the exact
  original payer/source binding before provider dispatch and under the current
  worker fence before publication/settlement. Revoked sources cannot create new
  provider work or usable paid results. Preserve actual provider expense when
  already dispatched; release learner reservation, and do not borrow a joiner's
  still-live binding to justify the original payer's charge.
- **SEC-V16-02 — Open remediation:** remove bounded expired unconfirmed draft
  quotes and atomically purge branch-discard source quotes/bindings. Missing payer
  binding must deny the worker; scrub private recording text once no authorized
  binding remains, preserving financial receipts and deletion inventory.

The reviewed source was dirty-tree HEAD `22333ec8de75cb1d5baebc9539fa8813d322d4f0`
at `2026-10-29T20:28:23Z`. Reviewer aggregate hashes: field/evaluation
`b115b013f3e17d7cce961ab1045a0bfb084d7d4006a92b7249aa72201bab65cd`,
proposal `e2d9ccdae4a02fbcfe5f277cd9a7b4921d26d1bb1f88483060963385f24da6cd`,
speech `8a72a28154f10f6645d61ab9b0256bfd0a7504b3ea2e97a2f08d1fd658748b72`,
rendering/contracts `02441db53b54a0d3a8da5ba23d248bfde79e1c608856c9a159f5311352cee5fd`.
The reviewer found no additional material issue in scoped field/evaluation,
proposal authority, structured output, React escaping/safe URLs or whole-source
cleanup. No runtime security claim was made. Fresh remediation and final evidence
review are mandatory after the source stabilizes.

### v16 source completion/remediation review — 2026-10-30

Independent `v16_completion_review` reviewed the full tracked/untracked migration
against `22333ec8de75cb1d5baebc9539fa8813d322d4f0`, including contracts, migrations,
worker/source authority, rendering and coverage. Source approval is scoped to the
v16 milestone; completion/evidence approval remains pending final runtime gates.

- **V16-REV-01 Medium, closed:** duplicate video description input could silently
  ignore edits. One control and exact-one round-trip regression now pass.
- **V16-REV-02 Low, closed:** author exercise indices started at zero. One-based
  numbering and grouped-summary coverage now pass.
- **V16-REV-03 Medium, source closed:** contextual uploaded-audio transcription
  was unreachable after removing legacy tools. The audio side editor now mounts
  a reusable focused widget with explicit local apply and stale-source fences.
  Unavailable-state browser proof is being added; successful live STT is unproven.
- **V16-REV-04 Medium, closed:** explicit cancellation during admission could
  cancel financially but leave the mounted editor busy. Closed/explicit-cancel
  reasons are distinct; confirmed cancellation restores retry only on the same
  mounted request.22 tests, lint/typecheck pass. Hook SHA
  `ed98d62908261c89dd4785bc928580372ac5887a4194994949a5a1ba47de0cb0`;
  test SHA `a356fa3b306bb5300810fc13a2c740376b0085c7647317fd28c49ae589b94319`.
- **V16-ACC-01 High, parent feature remains open:** uploaded-audio transcription
  only has the explicitly unapproved provider/model path. Do not activate it or
  mark F059 complete. This does not prevent a v16 milestone with honest
  unavailable behavior; provider research/approval remains separate outstanding work.

Independent security reviewer accepted SEC01/02 source remediation and the later
SEC03 proposal-deletion erasure trigger (migration0159). A focused real-DB
proposal erasure test passes; whole post0159 speech14 is required in final critical
evidence before runtime security approval. No additional material issue was found
in working-branch library copying or the trusted retrieval-byte-bound admission fix.

Late narrow review accepts explicit bilingual-picker ARIA labeling, actual
disclosure/fold/no-op test interactions, exact4096/4095 reserve boundary coverage,
retired-provider zero-fetch rejection tests and test-only SpeechSource narrowing.
Prior aggregate hashes are superseded by these deltas. Speech byte transport and
current browser/critical gates remain unresolved; no final approval is claimed.

### v16 terminal remediation/evidence review — 2026-10-30

The independent reviewer subsequently closed every scoped runtime finding:

- REV01 duplicate video description, REV02 numbering and REV03 reachable
  transcription controls have focused regressions and real application evidence.
- REV04 cancellation recovers the open editor and never applies after close.
- The browser-discovered initial-progress hydration race now preserves expanded
  unsent answers; later material revisions still reset. The reviewer verified
  actor/note/share identity fences in every executable host.
- **REV05 Medium, closed:** mobile review publication text was squeezed beside
  three buttons. It now owns a full row. Post-fix a468 compact/expanded captures
  and the >=300px width assertion pass; reviewer viewed both images directly.
- SEC01/02/03 source remediation now has the whole post0159 real speech14-case
  pass, alongside field/evaluation17 and the full785-case execution gate.

The full gate a468 passes14 flows /812 tests, no skips/retries, terminalexit0.
Original reports/hashes are retained in `evidence/v16-migration/final-critical/`.
The reviewer accepts per-consumed-source validity: only unused mobile proposal
CSS changed during unrelated desktop flows; the affected workbook flow starts a
fresh server after the fix. No pre-fix affected flow or repaired report is reused.

Final source/evidence manifests and documentation checks are being finalized for
the reviewer's exact-state sign-off. **No open scoped material finding remains.**
V16-ACC-01 remains the whole-F059 completion blocker: no unapproved transcription
provider/model can be activated. The existing local worker needs restart after
the format-only environment update; fixture-based real execution does not claim
live provider readiness or authorize stopping user-owned processes.

### Final independent v16 verdict — Approved

`v16_completion_review` approves the complete scoped migration and final evidence
on2026-10-30. No material scoped finding remains. It independently revalidated
all339 source file hashes/modes: tracked patch
`943d79ce8148e7bca8ed3cbee7d4dbfe11919be1f839570954f899297f87ba4f`, content
`1c675f16a851e87e5c69b22b65932b6a87065a1a5e9a46f9d3719ae51062070f`.

Accepted evidence:14/14 critical flows,812/812 tests,785/785 backend execution
cases, field/evaluation17/17, speech14/14, workbook browser3/3, web180/1256,
typecheck14 tasks, lint, production builds, migration/schema and guide/mapping
checks. No required scoped gate is pending, skipped or waived.

The per-consumed-source boundary and final post-REV05 captures are accepted.
**v16 milestone Complete; parent F059 In progress.** V16-ACC-01 remains open for
the parent feature. Existing local API/worker processes require restart for v4;
no new provider/model or live/paid transcription activation is approved.

Final bookkeeping audit preserves this approval. The reviewer verified exactly142
blank-at-EOF diagnostics:141 immutable provider-source files and applied
migration0159, with no other whitespace issue. The bounded whitespace check
passes; migration0159 retains its tested hash. Canonical staged patch
`cce2b58262d085164d40bd57d8985209d5f6a3fa50981a68bfa533da52957d18`
is independently reproduced for the339-file runtime/test/configuration manifest
scope, excluding delivery/design/docs. This tracking-state clarification changes
no verified source byte and requires no repeated execution gate.

## Block reference follow-up initial source review — 2026-10-30

Independent `block_references_completion_review` and
`block_references_security_review` reviewed base f0e299c/current follow-up source.

- REV-REF-01 Medium, closed: references originally removed surrounding editor
  prose, contrary to ADR-0042. Full editor snapshot now stays exactly once even
  with references, selected passage remains focus, structured reads are bounded,
  and overbudget input rejects without silent stripping.19 focused regressions.
- REV-REF-02 / security Medium, closed: referenced turns could propose a different
  unmentioned target. Conditional selected-target fences now apply in application
  and SECURITY DEFINER SQL; legacy no-reference/append behavior remains. Preview
  displays original target identity from actual integration plus safe fallback.
  Repository/direct-definer/idempotence tests retained for disposable execution.

Initial correctness and security source phases approved; no material source
finding remains. Final approval is pending the full critical/disposable database,
production AI/financial envelope, serial web/static/build and real-browser gates.
Transcription activation remains separately unapproved; do not complete parent
F059 or merge to main merely when this scoped follow-up is verified.

Sequential-turn diagnosis resolved without production permission changes:
real pinned-SDK regression with two target proposals, subsequent retrieval/update,
and forced pre-answer observation passes. It confirms observer tool lists are
empty by design while actor retains read_source_context and accounting purposes
are observation+3 answers. The browser fake actor script had been dispatched into
that observer. This is fixture execution-purpose isolation, not a production
registration defect. New exact regression is required by critical registry;
focused1-pass/25-filtered run is not represented as whole-suite evidence. Final
full gate must execute all26 runner cases. Tester owns purpose-aware fixture fix.

## Block reference follow-up final evidence review — 2026-10-30

Boundary: base f0e299c plus all86 runtime/test/configuration files in
`evidence/block-references/source-final.json`, fingerprint
`1b0ed22f3d20136f50eb46c11d64ecf17e2d509b90ee6ffce8b877289ce970b2`.
Initial source reviews and closed REV-REF-01/02 are reused; bounded remediation
review additionally approves the single/parallel synthetic tool-ID helper repair.
The strict existing callback assertion remains unchanged; full26 SDK plus5
fixture cases pass. No production permission/budget change arose from that fix.

Security reviewer final evidence verdict: **Approved**, no remaining material
security finding. Independently verified all86 source hashes, base-equivalent
Next declaration, clean diff whitespace, all14 raw report hashes and canonical
run44f4f1fb's14/14 flows/816 tests. Actual AI/DB789/789 includes all26 SDK cases,
restricted SQL and selected-target fences, stale/frozen source authority,
revocation, actor isolation and purge. Hostile Markdown unit coverage verifies
literal HTML, rejected executable/data URLs, absent remote images/event attrs
and hardened safe links; browser3/3 renders chat/sheet Markdown under runtime
page/console/server guards. No skips/flakes or failed-run aggregation accepted.

General independent final evidence audit confirms all14 raw report identities,
816/816 cases, all26 SDK cases, zero retry/skip/flake/failure metadata, complete
86-file source inventory and restored Next declaration. REV-REF-03 Low identified
two checkpoint paragraphs whose present tense implied the completed gate was
still running. Both now explicitly describe historical checkpoints; source and
reports are unchanged. Independent final correctness evidence verdict:
**Approved** after confirming this bounded documentation correction.
REV-REF-01/02/03 are closed; no material finding or required scoped evidence gap
remains. All27 browser cases have a single retry-0 passing result; all86 frozen
file hashes and all14 raw-report identities were independently verified again.
REF-1–REF-5 are Complete.

Scope remains REF-1–REF-5 only. No live paid-provider generation was exercised;
no new provider/model/key/configuration or transcription activation is approved.
Parent F059 stays In progress; no merge/push or user-service restart performed.
