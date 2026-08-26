# Independent review: Dictionary Platform

Reviewed: 2026-08-26 (M0 through M6)
Reviewers: Independent architect, product-owner, reviewer, tester, and
security-reviewer
Verdict: M0 through M6 approved with no waived critical, high, or material
medium finding. The enabled deterministic/runtime release is complete. Live AI
and document production activation remain intentionally unavailable behind the
recorded provider, storage, scanner, sandbox-resource, and OCR gates.

## Scope reviewed

- [x] `FEATURE.md` M0 contract
- [x] `EXEC_PLAN.md` M0 contract and future verification requirements
- [x] M1 implementation diff
- [x] M2 implementation, migration, worker, AI, web, and deployment diff
- [x] M2.6 shared-kit runtime UI, tests, browser evidence, and documentation
- [x] M3 pasted-term contracts, persistence, worker/provider, web, rollout,
      browser/database evidence, and remediation
- [x] M4 private upload, exact-version scanning, bounded extraction/OCR,
      cleanup-gated one-review publication, web flow, database/storage/browser,
      deployment retirement, and independent security remediation
- [x] M5 deterministic and optional-AI interchange, lossless export, browser/
      database evidence, and independent correctness/security remediation
- [x] M6 full-repository verification, migration/deployment classification,
      lifecycle/drain safety, operational snapshot, durable synchronization,
      integration readiness, and final correctness/testing/security review
- [x] M0 documentation/design validation evidence
- [x] Canonical dictionary user-flow guide/E2E mapping
- [x] Related current guide mappings (behavior unchanged)
- [x] New ADRs and architecture/design/operations synchronization

## Findings

### M0 findings and resolutions

| ID / severity | Location and finding / impact                                                                                                    | Resolution                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 High      | ADR-0012/ExecPlan/operations: leases lacked fencing and job-version activation, risking stale writes and rollback-stranded jobs. | Added application-owned monotonic fencing CAS plus full worker/API/web two-release expand/activate metadata, rollback-floor preflight, retirement gates, and exact M2/M6 fixtures.                      |
| A-2 High      | ADR-0012/operations: scan and parse were not bound to immutable bytes, allowing overwrite after a clean scan.                    | Required signed atomic create-only upload, exact storage version/checksum reads, physical-version accounting, tombstone-through-expiry replay defense, all-version cleanup, and overwrite/replay tests. |
| A-3 High      | ADR-0011/ExecPlan: settings snapshots had no persisted settings version, allowing stale proposal acceptance.                     | Added dedicated settings version, `expectedSettingsVersion`, atomic compare, and conflict tests.                                                                                                        |
| A-4 Medium    | ExecPlan/ADR-0011: non-job create/fork/bulk idempotency had no durable seam.                                                     | Added dictionary-owned owner/operation/key records with keyed request fingerprint, result identity, transactionality, and expiry.                                                                       |
| A-5 Medium    | ExecPlan ownership map conflated public HTTP contracts with job/provider schemas.                                                | Made languages a framework-neutral leaf, contracts HTTP-only, prompts backend-infrastructure-only, and durable/provider Zod schemas module-private.                                                     |
| A-6 Medium    | Architecture put lease transitions in root worker infrastructure.                                                                | Root owns only timers/signals/concurrency/readiness; a dictionary application worker service owns every fenced lifecycle transition.                                                                    |
| P-1 High      | ADR-0011/ExecPlan omitted typed role/notation/custom-label card overrides, risking M1 schema rework.                             | Added typed nullable overrides and revision snapshots for enablement, roles, notation, and custom label.                                                                                                |
| P-2 High      | FEATURE/ADR/ExecPlan lacked deterministic example/translation dependency resolution.                                             | Added raw-versus-effective precedence table, dormant preservation, rejection rule, server read model, and round-trip tests.                                                                             |
| P-3 Medium    | FEATURE authorship transitions were incomplete.                                                                                  | Added prior-authorship × mutation matrix, new-card rules, proposal-edited behavior, preservation cases, and semantic no-op acceptance.                                                                  |
| P-4 Medium    | FEATURE did not define “explicit terms,” enabling arbitrary document interpretation.                                             | Defined source-only Markdown/DOCX/list/paragraph/table and plain/PDF/OCR line grammar, limits, pair handoff, row failures, `no_terms_found`, and parser table cases.                                    |
| P-5 Medium    | Design source lacked public read/fork/rotated/revoked states.                                                                    | Added reusable public/fork/absence symbol and design rules for sign-in return, independent copy, no owner data, and non-enumerating presentation.                                                       |
| T-1 High      | ExecPlan lacked executable old/new worker and rollback proof.                                                                    | Named disposable PostgreSQL two-capability fixture and deployment overlap journey with fencing, version, rollback, and exactly-once assertions.                                                         |
| T-2 Medium    | M0/schema/cleanup acceptance was not independently checkable.                                                                    | Added M0 checklist/exact checks, schema-catalog invariants, fake-clock retention/cleanup, quarantine denial, overwrite, sandbox, and quota-release cases.                                               |
| S-1 High      | Parser code inherited worker credentials/network, so parser RCE could escape the document boundary.                              | Kept the approved worker topology but required an OS-confined credentialless child process with no egress/environment, narrow IPC, resource limits, fail-closed capability gating, and isolation tests. |
| S-2 Medium    | Capability content could be cached by locator and survive rotation/archive.                                                      | Required fragment key/header, `private, no-store`, no static/ISR/shared caching, no-referrer, and proxy cache regression cases.                                                                         |
| S-3 Medium    | Queue/storage/provider/scanner work lacked cumulative admission and scanner-freshness bounds.                                    | Added transactional owner/global queue/upload/spend budgets, fair leasing/circuit breakers, fresh signatures, scan limits, physical-byte accounting, and failure tests.                                 |
| S-4 Medium    | Proposal expiry was not erasure; discarded/accepted content could persist indefinitely.                                          | Added immediate terminal redaction, seven-day maximum review window, fake-clock expiry cleanup, and content-free outcome retention.                                                                     |
| S-5 Medium    | Untrusted owner/model content had no stored-XSS rendering contract.                                                              | Made v1 fields/reasons/alternatives inert plain text, forbade raw HTML/Markdown, and required malicious-content component/browser cases.                                                                |
| S-6 Medium    | Future FKs implied integrity but no link/dereference authorization.                                                              | Required link-time and dereference authorization, lifecycle revocation, same-owner composite keys where applicable, and forbade persisting share keys as authority.                                     |
| F-1 High      | Batch/document jobs lacked dictionary/pair concurrency state for an empty dictionary.                                            | Added `expectedDictionaryVersion`, trusted source/target tags, aggregate-version comparison, and pair-change conflict cases in M3/M4.                                                                   |
| F-2 Medium    | Enqueue/accept idempotency could not distinguish same-key/different-content after redaction.                                     | Added unique owner/kind/key jobs with keyed canonical fingerprints; locked proposal acceptance stores candidate fingerprint/result and rejects changed terminal retries.                                |

No finding was waived. The low formatting/stale-state and Markdown/DOCX paragraph
clarifications were also fixed before M0 completion. Runtime controls remain
unverified until their owning milestones implement them.

### M1 findings and resolutions

| ID / severity | Location and finding / impact                                                                                                          | Resolution                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1-R1 High    | Public reads and synchronous forks materialized up to 10,000 large cards, risking backend/browser exhaustion.                          | Added 25-card public cursor pages, response bounds, global read/fork permits, per-IP/locator and fork rate limits, streaming fork chunks, owner retained budgets, and 10,000-card PostgreSQL coverage.                               |
| M1-R2 Medium  | Reorder used quadratic ID lookup and its valid 10,000-ID body exceeded the global HTTP limit.                                          | Replaced lookup with a map, bounded the route at 512 KiB while retaining the 10,000 schema cap, and exercised the maximum order through repository and HTTP tests.                                                                   |
| M1-R3 Medium  | Owner/public page reads could mix committed versions or continue from stale cursors.                                                   | Added transactional aggregate snapshots, version-bound opaque card cursors, stable 409 continuation conflicts, and UI reset-from-first-page recovery.                                                                                |
| M1-R4 Medium  | Fork retries after source rotation/archive revalidated a dead capability before replaying the completed result.                        | Added owner/key/fingerprint replay before current capability validation; composed HTTP tests prove the same private result after rotation and archive and conflict on changed payload.                                               |
| M1-R5 Medium  | Idempotency expiry was inert and stale rows accumulated indefinitely.                                                                  | Reclaimed exact expired keys transactionally, added bounded opportunistic cleanup, retained content-safe fingerprints/results, and verified reuse at the 24-hour boundary.                                                           |
| M1-R6 Medium  | Duplicate warnings only inspected loaded cards and initially sent vocabulary in a GET query.                                           | Save responses now compute normalized duplicates across all retained cards, including archived cards, without placing vocabulary in URLs; the UI warns without rejecting.                                                            |
| M1-R7 Medium  | Request cancellation and owner read consistency were not enforced after blocking locks.                                                | Added abort checks after permits/locks and before writes plus controlled lock-wait cancellation and version-conflict/no-partial-write PostgreSQL tests.                                                                              |
| M1-R8 Medium  | Owner quotas lacked exact/no-op/concurrent semantics, and no-op edits could fail at revision capacity.                                 | Extracted exact-boundary domain rules, injected low limits for repository tests, serialized admission on the owner row, counted archived dictionaries, and allowed no-op saves while rejecting semantic edits at the revision limit. |
| M1-R9 Medium  | Public capability caching, missing/wrong/rotated/archived responses, and share-key client caching had gaps.                            | Added private/no-store, no-referrer/noindex headers, one non-enumerating 404 shape, fragment revision query identity, rotation/archive E2E, and composed HTTP tests with no owner fields.                                            |
| M1-R10 Medium | Web failures could erase loaded pages, retain stale mutation conflicts, emit rejected handler promises, or bypass FSD public entries.  | Preserved loaded pages for transient failures, added reload/reset conflict paths, caught expected event rejections, exposed session/auth/dictionary public entries, and expanded component coverage.                                 |
| M1-R11 Medium | Responsive/a11y/public metadata and normal navigation evidence was incomplete.                                                         | Added localized home navigation, correct learning-content `lang`/`dir`, keyless/unavailable states, 320 px/200% text/focus assertions, secure public/fork journey checks, and reusable stories.                                      |
| M1-R12 Medium | Reorder selected every large card field for a 10,000-card operation, allowing concurrent requests to consume excessive backend memory. | Projected only card IDs and sort keys under the existing bounded global permit; the verified 10,000-card path retains full-window behavior without materializing content.                                                            |
| M1-R13 High   | Repeated mapped E2E runs reused Redis IP rate-limit state and could fail signup before reaching dictionary behavior.                   | Added a validated Redis namespace setting and a fresh hashed namespace per Playwright invocation for both rate limits and WebAuthn state; the exact mapped journey passed twice against the same Redis logical database.             |
| M1-R14 Medium | Fork admission locked owner/idempotency state before its global permit, allowing queued large forks to occupy the PostgreSQL pool.     | Moved fail-fast permit admission to the first transaction step, added cancellation checks after admission and the owner lock, and verified a fifth fork rejects while its owner row is independently blocked.                        |

The revision contract was clarified rather than widened: immutable revisions
cover content, card overrides, resolved settings, and provenance. Archive,
restore, and reorder remain typed optimistic-versioned current state and do not
append content revisions; lifecycle audit history is outside M1.

### M2 findings and resolutions

| ID / severity | Location and finding / impact                                                                                                                | Resolution                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2-R1 High    | Queued cancellation and expired review actions could leave raw input/proposal payloads retained or roll expiry redaction back.               | Queued cancellation is atomic; reads/actions opportunistically commit expiry and redact; worker cleanup provides the backstop. Fake-clock PostgreSQL cases cover cancel, discard, accept, and expiry.         |
| M2-R2 High    | Job/provider formats could be removed or activated without full API/web/worker rollback-floor support and database drain.                    | Added schema-v2 lifecycle declarations, expand/activate direction rules, API/web proposal lifetime support, preflight compatibility in both directions, and queued/running/reviewable retirement counts.      |
| M2-R3 High    | Cancellation, retry, timeout, and stale leases could release paid provider work at zero and bypass owner/global spend limits.                | Added per-dispatched-attempt conservative reservations, owner/global active plus rolling token/cost budgets, actual or worst-case settlement, claim cancellation exclusion, and provider/spend circuits.      |
| M2-R4 Medium  | Model output and adapter error classes could persist invalid setting transitions or collapse safe failure categories.                        | Provider output is module-private Zod-validated and rechecked through domain settings invariants before persistence; adapter errors share the application taxonomy and never expose raw provider content.     |
| M2-R5 Medium  | Old/new API and workers could price, cap, or settle the same queued job using different process-local provider policies.                     | Every job persists an immutable five-field token/rate/cost envelope used for claim, model call, retry, and settlement. Manifest preflight proves candidate/rollback claimability and binds API/worker config. |
| M2-R6 Medium  | The advertised 16,384 input minimum was below mandatory framing plus prompt/schema/card bytes, so a valid live config could fail every job.  | Raised one shared minimum to 32,768 across backend, worker, manifest, deployment, docs, Drizzle schema, and generated migration; exact-min dispatch and below-min rejection tests pass.                       |
| M2-R7 Medium  | Worker database privilege checks accepted partial grants and ran after worker startup, while unexpected sensitive writes could go unnoticed. | Moved the exact probe before slot startup; required grants are checked individually and every unexpected table/schema privilege is denied. Disposable PostgreSQL role variants passed.                        |
| M2-R8 Medium  | The local rehearsal reused immutable images but claimed another source SHA, causing static admin readiness rejection.                        | A reused-image release changes identity/workflow metadata while retaining the baked source SHA. The full two-release/rollback rehearsal now passes.                                                           |
| M2-R9 Medium  | Worker shutdown left losing 295-second race timers referenced, consuming the entire Docker stop grace period after an idle drain.            | Replaced shutdown races with cleared cancellable timeouts, added a zero-pending-timer regression, and verified sub-second worker cleanup in the full deployment rehearsal.                                    |
| M2-T1 Medium  | Persistent authorship/provenance and independent simultaneous lease claims were not initially asserted at PostgreSQL level.                  | Added separate-client claim racing plus human→mixed, untouched AI, edited candidate, accepted-job revision, redaction, and semantic no-op persistence cases.                                                  |
| M2-W1 Medium  | Rollback capability UI disabled entry to retained proposals when enqueue was off.                                                            | “Open AI review” remains available for discovery; retained proposals can still accept/discard, while new/retry/regenerate actions follow enqueue capability. Component/story coverage passes.                 |

No M2 finding was waived. The final full deployment rehearsal additionally found
and closed the release-SHA and worker timer defects above before approval.

### Final M0 re-review

- Architecture: approved; no high or material-medium contract issue remains.
- Product: all five original findings resolved; the remaining low document-
  paragraph ambiguity was clarified and added to the M4 parser cases.
- Testing: executable M1–M6 invariant contracts and M0 checks approved; stale
  durable-state evidence was synchronized before completion.
- Security: approved; no high or material-medium security issue remains.

### Final M1 re-review

- Correctness/architecture: approved; no critical, high, or material-medium
  finding remains after pagination, quota, idempotency, consistency, FSD, and
  lifecycle-scope remediation.
- Testing: approved after the mapped E2E command passed twice against the same
  PostgreSQL and Redis logical databases with per-invocation Redis isolation.
- Security: approved after the resource-projection, Redis-isolation, and
  fail-fast fork-admission re-review; no critical, high, or material-medium M1
  finding remains. Later AI/upload/import boundaries still require their
  milestone-specific security reviews.

### Final M2 re-review

- Correctness/architecture: approved after immutable provider-envelope,
  bidirectional rollout, usable-minimum, and database-invariant remediation; no
  material finding remains.
- Testing: approved after disposable PostgreSQL claims/authorship/budget cases,
  the task-owned 3/3 Chromium journey, real browser acceptance, Docker privilege
  proof, and the complete local deploy/failure/rollback rehearsal passed.
- Security: approved with no critical, high, or material-medium finding after
  spend/cancellation, least privilege, readiness, retention, trace privacy,
  output validation, and rollback compatibility re-review.

### M2.5 design review

This historical design review remains valid evidence for the optional boards.
The separate approval gate and M2.6 blocker were retired by explicit user
direction on 2026-08-25 under ADR-0016.

- Mode: `$ui-ux-composition` Implement mode followed by rendered review; this is
  a design milestone, not a runtime-code review.
- Blockers: none after rendering. Primary create/edit/review/fork/import actions
  are reachable, focused tasks have clear exits, errors preserve the draft, and
  archive remains an explicit destructive confirmation.
- Major findings resolved: desktop editor and compact metadata clipping, open
  select menus in the create-dialog default state, narrow table checkbox
  clipping, and collapsed state headings caused by circular fill sizing.
- Structure/responsiveness: library, detail, focused form, dialog, public page,
  compare flow, desktop review table, compact review cards, upload/progress, and
  transfer patterns match the task rather than forcing one container model. The
  320/360/390/768/1280/1440 coverage preserves order and capability.
- Accessibility/state treatment: labels remain visible, statuses and errors use
  text plus iconography, light/dark and RTL examples are present, destructive
  actions are distinguishable, and missing public links use a non-enumerating
  state. Runtime keyboard, focus restoration, live-region, and 200% text evidence
  remains required in M2.6.
- Initial structural verdict: 15 dictionary screens, zero Pencil layout problems, and no
  unresolved placeholders. This was the pre-ADR-0016 design-gate verdict.
- User-review remediation: mobile editor padding/overflow, exposed card actions,
  ambiguous “More,” edit/cancel icon semantics, desktop/mobile editor container,
  combined batch fields, secondary-button contrast, mixed document states, and
  doubled field/settings rhythm were all corrected. Document input, durable
  processing, extracted-term review, and terminal outcomes now have separate
  screens and explicit design comments. Re-audit: 19 dictionary screens, zero
  layout problems, no unresolved placeholders. The boards remain optional references.

### M2.6 runtime UI review

| ID / severity  | Location and finding / impact                                                                                       | Resolution                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2.6-R1 Medium | Card editor/dialog lifecycle: a pending save could be dismissed and its late success could close a different draft. | Pending saves now prevent dialog, Escape, and footer cancellation; Add-card and card actions are disabled; success identity-checks the initiating draft. Deferred-save E2E and component coverage pass. |
| M2.6-R2 Medium | Manual card conflicts exposed the only reload action behind the modal, making recovery inaccessible.                | The editor renders `Reload current version` inside the modal. A two-page stale manual-edit journey proves reload closes the stale editor and shows current content.                                     |
| M2.6-R3 Medium | Card authoring fields set `lang` without catalog-derived `dir`, leaving Arabic/Hebrew content LTR.                  | Active inputs/textareas and dormant values now derive direction from the effective field language; an Arabic/English overlay story and component assertions cover RTL/LTR composition.                  |
| M2.6-R4 Low    | A menu with no enabled actions could remain open without a keyboard dismissal target.                               | The trigger is disabled when every action is unavailable and an open menu closes if that state changes; shared UI coverage passes.                                                                      |
| M2.6-R5 Low    | Action labels interpolated source content into UI-locale prose and duplicated names for duplicate terms.            | Labels now use localized card ordinals while visible source content retains its own `lang`/`dir`.                                                                                                       |
| M2.6-D1 Medium | Early ExecPlan/design-system prose still reinstated superseded ADR-0008 design authority.                           | The plan and design-system implementation guidance now point to ADR-0016 and state that design artifacts are optional input with no approval gate.                                                      |

Independent tester and reviewer checks passed after remediation: focused 29/29,
full web 17 files / 91 tests, web typecheck, guide/mapping checks,
`git diff --check`, and the final three-scenario Chromium journey. No finding was
waived; no security review was triggered because M2.6 changes inert rendering,
interaction composition, and agent/design documentation without changing a
security boundary.

### M3 findings and resolutions

| ID / severity | Location and finding / impact                                                                                                                                                       | Resolution                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-S1 High    | Batch completion read retained card sources, but the deployed worker role denied all card access; paid jobs could fail after provider work while preflight approved the role.       | Granted only `SELECT(id, dictionary_id, source, sort_key)`, required those exact columns in deployment preflight, rejected wider card access, and passed the disposable PostgreSQL privilege journey.                                     |
| M3-R1 High    | Build manifest bounds and API activation could advertise pasted jobs with the legacy 1,024-output envelope while the worker required 40,960, creating permanently unclaimable work. | Manifest/workflow now advertise both formats with 262,144/40,960; one shared format-aware validator is called by API and worker; migration/schema/deployment docs and tests agree.                                                        |
| M3-S2 Medium  | The web generated a new idempotency key for every enqueue attempt, so a lost committed response could purchase a duplicate batch.                                                   | One payload-fingerprinted key is retained across ambiguous failures and cleared only after success; changed payloads rotate it.                                                                                                           |
| M3-R2 Medium  | A job UUID from dictionary A could be restored inside dictionary B and accepted back into A.                                                                                        | Restored pasted jobs must match the route dictionary ID; mismatches are cleared from URL/UI, with a two-dictionary binding regression.                                                                                                    |
| M3-R3 Medium  | Duplicate warnings reflected provider output only; editing a candidate source to a retained or intra-batch duplicate saved without the required warning.                            | Acceptance recomputes warnings transactionally from final selected sources, persists them in the accepted outcome, and displays them after commit. PostgreSQL coverage edits a selected row into a duplicate.                             |
| M3-R4 Medium  | Retry reconstructed failure text in the browser, discarded shared context, and recorded no trusted predecessor relation.                                                            | Added an owner-scoped job retry contract. The store locks the prior review, selects only persisted retryable row indexes, preserves context, records predecessor job/rows, snapshots current versions/settings, and enqueues a successor. |
| M3-T1 Medium  | Tests did not isolate a settings-only stale accept or bare CR/C1 parsing.                                                                                                           | Added zero-write PostgreSQL settings conflict plus bare-CR split and U+0085 rejection cases.                                                                                                                                              |
| M3-W1 Medium  | Real E2E revealed settings form handlers reading React `currentTarget` after deferred state work, and an accepted batch appeared stale after its own version bump.                  | Values are captured synchronously; derived conflicts apply only to review jobs. Component and mapped journey checks pass.                                                                                                                 |

No M3 finding was waived. Independent post-remediation reviewer, tester, and
security-reviewer passes found no residual material defect. Security re-review
confirmed owner-locked retry lineage, terminal context/input redaction, bounded
accepted metadata, HMAC replay conflicts, inert rendering, no tools/traces, and
exact worker column privileges. The residual global-worker credential blast
radius and provider DNS/retention assumptions remain documented operational
defense-in-depth concerns, not new application-level authority.

### Final M3 re-review

- Correctness/architecture: approved after dictionary binding, final-selection
  duplicate warnings, and server-owned context-preserving retry successors.
- Testing: approved after 39 contract tests, focused backend/web passes, seven
  guarded PostgreSQL batch cases, exact deployment privilege proof, four mapped
  Chromium journeys, responsive real-browser evidence, and final repository
  validation.
- Security: approved with no critical, high, or material-medium finding after
  role, spend/idempotency, owner scope, redaction, provider-output validation,
  and rollout-budget re-review.

### M4 findings and resolutions

| ID / severity         | Location and finding / impact                                                                                                                          | Resolution                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M4-S1 High            | Expired authorizations were never swept and cleanup stopped after 100 attempts, indefinitely retaining objects and quota.                              | Every cleanup pass first performs a bounded expiry sweep. Cleanup stays claimable forever while the diagnostic counter saturates at 100; fake-clock and PostgreSQL cases cover expiry and 100+ attempts.                                                                 |
| M4-S2 High            | Upload completion bypassed shared provider admission serialization, so concurrent documents could over-reserve spend.                                  | Completion now takes the shared generation advisory lock, owner lock order, and rolling token/cost predicates in the same transaction. Four-way PostgreSQL concurrency admits exactly the configured three.                                                              |
| M4-S3 High            | Completion repeatedly buffered the full 20 MiB object, and sandbox output paths could follow child-created symlinks or allocate unbounded page output. | Replay/expired requests short-circuit before storage; inspection uses a concurrency-gated exact 8 KiB range. Parser outputs are basename-only regular files opened `O_NOFOLLOW`, inode/size checked, read sequentially, and cumulatively bounded.                        |
| M4-R1 High            | Markdown multi-cell tables terminated the whole document instead of reaching the required row-level final-review failures.                             | Headers/delimiters are ignored; bounded body rows emit `table-row` blocks regardless of cell count, so mixed documents preserve valid rows and pair-only tables reach failure-only review.                                                                               |
| M4-R2 High            | Document proposal failures had no server-owned retry path and browser reconstruction would lose trusted lineage/context semantics.                     | Added a job-scoped retry endpoint that selects only persisted retryable failures and creates a pasted successor with current snapshots and predecessor lineage. The raw terminal instruction remains redacted; the original review is immutable.                         |
| M4-R3 Medium          | Lost/unexposed direct-PUT responses could not complete, S3 errors collapsed to 500, and Content-Type was not signed.                                   | Version ID is now an optional hint; the server reconciles exactly one current checksum/type/size match. Typed conflicts map to 409, transient storage to 503, and immutable create/checksum/content-type headers are signed.                                             |
| M4-R4 Medium          | PDF active-file rejection missed document open actions, page JavaScript/actions, and active annotations.                                               | A bounded preflight runs before text/render work, checks document and page APIs, rejects malformed/active containers and dangerous annotation fields/types, while allowing inert internal destinations.                                                                  |
| M4-R5 Medium          | Public retryability mislabeled terminal malware/invalid/no-term states, and edited/retried review behavior was not exercised end to end.               | Retryability is explicit and narrow; mapped Chromium covers one server-owned failure successor, return to the immutable predecessor, edit/remove, responsive review, and atomic commit.                                                                                  |
| M4-G1 Activation gate | Production ClamAV wiring intentionally lacks trusted limit attestation; local declarations alone cannot prove daemon configuration.                    | Readiness now requires fresh signatures and exact declared limits, so production remains unavailable. The disposable fixture pins 25 MiB/10/2,048 and its guarded test is synchronized; immutable production configuration and conformance remain an M6 activation gate. |
| M4-G2 Activation gate | `RLIMIT_AS` is not RSS, inner tmpfs enforcement and narrow-seccomp escape resistance are not yet production-proven.                                    | D-19 now states the enforceable virtual-address/output bounds honestly. Production activation remains unavailable until a reviewed cgroup/RSS/tmpfs and narrow-seccomp escape/resource rehearsal passes.                                                                 |

No M4 enabled-runtime finding was waived. Final security re-review found all five
previous High code findings resolved and no new critical, high, or material
medium application defect. The scanner, sandbox/resource, real product-S3, and
live-OCR items remain explicit fail-closed activation gates; they are not
represented as production readiness.

## M5 independent review and remediation

| ID / severity | Finding                                                                                                                                             | Resolution                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5-R1 High    | Exact existing-target import replay was blocked after the successful version bump or later archive.                                                 | Commit preflight is owner/existence-only; first execution still locks and checks active lifecycle/versions transactionally. Unit and real-PostgreSQL lost-response/archive replay pass. |
| M5-R2 High    | The 2 MiB idempotency payload check rolled back a legal 10,000-row duplicate-heavy import.                                                          | Raised the generated schema/migration ceiling to a derived 4 MiB. Real PostgreSQL commits/replays 10,000 cards and 9,999 warnings above the old cap.                                    |
| M5-R3 Medium  | Blank rows consumed the data-row limit and blank-looking malformed rows disappeared.                                                                | Lexer drops only failure-free structural blanks before the retained-row bound; header/no-header 10k, 10,001, interspersed blanks, and malformed blank-valued cases pass.                |
| M5-R4 Medium  | Full CSV could not distinguish inherited custom label from literal `inherit`.                                                                       | Added a versioned inheritance tag orthogonal to formula escaping, with lossless and malformed-tag regressions.                                                                          |
| M5-R5 Medium  | Imports above 100 valid rows disabled AI even though the contract allows choosing up to 100 previewed pairs.                                        | AI selection remains available for the bounded 100-row preview while deterministic import still commits every valid row; transition coverage proves the distinction.                    |
| M5-R6 Medium  | Preview/export/import rejections and picker cancellation escaped as unhandled browser errors; oversize fallback did not cancel its response stream. | Panels consume parent-owned mutation rejection, native cancellation is a no-op before fetch, and oversize fallback cancels the reader.                                                  |
| M5-R7 Medium  | Native save picker began after HTTP export, and a 60-second deadline could not support the 320 MiB envelope.                                        | Picker/writable are acquired before fetch; deadline is 15 minutes, calibrated above 320 MiB at 512 KiB/s, with cancellation and owner/global permits retained.                          |
| M5-R8 Medium  | Cross-origin export headers were unreadable and the picker received a parameterized MIME type.                                                      | CORS exposes every strict client header; picker uses bare `text/csv` while HTTP retains UTF-8 charset. Route/client/component and mapped Chromium coverage pass.                        |
| M5-R9 Medium  | Sample disclosure, long-token mobile wrapping, and optional-AI E2E wiring were incomplete.                                                          | Added prominent all-valid-row disclosure, wrapping constraints, and a mapped 320 px/200% new-target AI review/reload/mixed-accept/export journey.                                       |
| M5-R10 Medium | Live import-pairs provider sent dictionary/version/fingerprint/lineage metadata.                                                                    | Outbound DTO contains only languages, effective settings, bounded instruction, and selected core pairs; captured-message tests keep identifiers server-side.                            |
| M5-R11 Medium | Import preview amplification and edge request envelopes were underbounded.                                                                          | Added exact 2250k edge body cap, per-IP request/connection throttles, owner/global preview rates, and a four-operation active cap.                                                      |
| M5-R12 Medium | Import-pairs operations/composition/OpenAPI response documentation was incomplete.                                                                  | Registered the canonical Mastra agent, documented format/budget/privacy lifecycle, declared streamed text bodies, and added discovery/OpenAPI/release tests.                            |

No M5 material finding was waived. Independent mapped E2E, repository/database
testing, correctness review, and security re-review pass after remediation. Live
provider activation remains a deliberate fail-closed operational gate.

## Acceptance-criteria audit

- [x] AC-1 through AC-9 and AC-14 are implemented and evidenced.
- [x] AC-10 pasted-term generation is implemented and evidenced.
- [x] AC-11 transient document generation is implemented and evidenced behind
      fail-closed production activation gates.
- [x] AC-12–AC-13 import/export behavior is implemented and evidenced.
- [x] AC-15–AC-17 contracts, architecture, localization/accessibility,
      rollout/observability, and complete verification are implemented and
      evidenced.

## Architecture and test audit

- [x] M1 backend DDD, web FSD, package ownership, and accepted ADR boundaries are
      preserved.
- [x] Current dictionary data remains typed/relational and future composition
      uses stable explicit references rather than a generic asset payload.
- [x] Tests cover the material domain, contract, SQL, worker, AI, upload/parser/
      OCR, public authorization, CSV, deployment, and UI regression surface.
- [x] `docs/user-flows/dictionary-platform.md` matches M1 behavior and maps the
      proportional critical scenarios to real E2E tests.
- [x] Related current guides, scenario/revision markers, commands, assertions,
      and evidence remain synchronized.
- [x] Required M1–M6 security reviews are complete and all enabled-runtime
      critical/high and material security findings are resolved; production M4
      and live-provider activation gates remain fail-closed.
- [x] No secrets, raw prompts/documents, debugging artifacts, generated output,
      accidental scope, or unresolved conflicts remain.

## M6 independent review and remediation

| ID / severity | Finding                                                                                                                           | Resolution                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6-R1 High    | Stop-enqueue releases could advertise worker-processable formats without retaining live provider readiness, stranding drain work. | Worker and deployment readiness now key off processable formats; the inert default manifest advertises no AI lifecycle, and activate-to-stop-enqueue coverage passes.                                                   |
| M6-R2 High    | Document completion and cleanup could disappear or stop when enqueue/provider dependencies were unavailable.                      | Document lifecycle composition retains completion/storage independently of authorization, while runtime baseline readiness keeps cleanup/expiry loops running and strict healthcheck remains fail-closed.               |
| M6-R3 Medium  | Dictionary capability and idempotency HMACs reused the authentication-code secret.                                                | Added required, distinct `DICTIONARY_HMAC_SECRET` validation, wiring, sanitized configuration, and rotation-isolation coverage.                                                                                         |
| M6-R4 High    | Migration classification and deployment token bounds were stale, preventing a valid release.                                      | Classification is reviewed through generated migration 0017 as expand; deployment accepts the canonical 40,960 output-token ceiling and parses both sanitized environments in tests.                                    |
| M6-R5 Medium  | Initial operational metrics were semantically misleading and used unbounded historical scans.                                     | Signals now distinguish conservative reservation-budget settlement, use fixed numeric fields, bounded query windows, six observation indexes, exact PostgreSQL assertions, and documented external telemetry ownership. |
| M6-R6 Medium  | Durable design, guide, locale, and generated-artifact state contradicted the implemented final flow.                              | Synchronized the one-final-review contract, current guide/revision mappings, four-locale picker copy, feature artifacts, and final generated-file hygiene.                                                              |

No M6 material finding was waived. Independent tests, full repository checks,
database/storage/browser journeys, correctness re-review, and security re-review
pass after remediation.

## Final verdict

M0 through M6 and AC-1 through AC-17 are approved. The deterministic/runtime
feature is complete and ready for repository-required local squash integration.
External live-provider and document-production prerequisites remain fail-closed
rollout gates and are not represented as enabled production capability.
