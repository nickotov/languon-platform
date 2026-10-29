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
