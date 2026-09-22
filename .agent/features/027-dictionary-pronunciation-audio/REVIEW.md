# Review: Dictionary pronunciation audio

Updated: 2026-09-21
Status: Complete — independent completion, security and tester sign-off
Base: `3df809282b31dc0e0261e7311c088e1484ccca01` plus all tracked/untracked feature files

## Scope and reviewers

- Architect `audio_architecture`: independent planning review; recommendations
  incorporated before implementation authorization. It does not substitute for
  completion/security review.
- Completion reviewer `audio_completion`: initial complete feature diff,
  surrounding paths, ACs and evidence. Excluded unrelated architect configuration.
  Snapshot at18:58:57Z had tracked-patch SHA256
  `8f4381e35fc69825c7e861bbf2140e50b465726071dbca18470283a0492e40f9`;
  untracked feature files included separately in inspection. No critical/high
  correctness defect reported. Focused remediation requested for R-1/R-2.
- Security reviewer `audio_security`: auth/current content, paid-service secrets,
  SSRF/download, costs, storage routing, physical erasure, lifecycle/role gates.
- Independent tester `audio_test_audit`: bounded ambiguity/deadline/purge/late-write
  and persistence test adequacy. Final assigned-surface verdict: adequate after
  real PostgreSQL stale-upload remediation and retained-provider proof; reran
  eight focused files/41 tests. No repeated whole-suite test mandate.

## Findings and dispositions

| ID / severity   | Location / problem / impact                                                                             | Fix and evidence                                                                                                                                                      | Disposition                                              |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| PLAN-1 / High   | Proposal executor/release metadata cannot represent speech lifecycle/cost                               | Separate audio queue, budgets, capability metadata and coordinator                                                                                                    | Incorporated and implemented                             |
| PLAN-2 / High   | Provider-only cache key would discard cached audio on switch                                            | Logical field binding resolved before current profile                                                                                                                 | Implemented; service/DB tests                            |
| PLAN-3 / High   | Accepted upstream request may lose task ID before local commit, duplicating paid retry                  | Durable submit intent and no-resubmit unknown tombstone; retained task configs                                                                                        | Implemented; worker/provider/DB tests                    |
| PLAN-4 / High   | Purge originally enumerated only documents/proposal work                                                | Typed audio inventory, advisory owner lock, bounded writer barrier, version deletion before SQL finalization                                                          | Implemented; real purge/role tests                       |
| PLAN-5 / Medium | Bearer headers cannot be attached by an audio-element URL                                               | Authorized bounded fetch/Blob, CSP, object URL revocation                                                                                                             | Implemented; browser/media tests                         |
| PLAN-6 / Medium | Static native app/shared-reader scope could imply unimplemented journeys or anonymous spend             | Owner web v1 explicitly approved; native/shared audio deferred                                                                                                        | Accepted scope                                           |
| PLAN-7 / Medium | UI timeout differs from upstream task termination                                                       | Separate visible deadline and bounded reconciliation; retain task identity/charge and no surprise playback                                                            | Implemented; late-result/repeated-Play tests             |
| TEST-1 / High   | `storing` after successful put and lost completion fence was not cleanup eligible; physical byte leak   | Expired writer+lease terminalizes unpublished upload, unbinds and exposes orphan to cleanup; real put→complete(false)→expiry→delete proof                             | Fixed; tester independently confirmed                    |
| SEC-1 / Medium  | Service lacked request/status/content throttles; repeated5MiB reads can exhaust DB/S3/backend resources | Shared per-owner limits, global byte-request limit, four concurrent object reads; fail before dictionary/provider/storage                                             | Fixed; service/HTTP tests; security confirmed            |
| SEC-2 / Medium  | Single current namespace adapter strands old bucket inventory on switch                                 | Retained backend/namespace dispatcher, original-intent putForReference, old bucket read/delete tests                                                                  | Fixed; security confirmed                                |
| SEC-2a / Medium | Shared retained storage credential JSON violates API/worker/purge privilege separation                  | Separate deployed retained config variables per role; mapping/tests/examples                                                                                          | Fixed; security confirmed                                |
| SEC-3 / Medium  | Unknown upstream outcomes lack supported settle/retry operator command                                  | Preserve no-resubmit tombstone, bounded24h capacity,30d unbound ledger retention, unknown counts in content-free telemetry; no reset UI/SQL recipe                    | Explicit production activation limitation accepted below |
| SEC-4 / Medium  | Public API unnecessarily held paid Kie credentials despite only selecting profiles                      | Role-aware metadata-only API/purge factory; keys and executable provider registry only in worker; deployment regression                                               | Fixed; security confirmed                                |
| R-1 / Medium    | Asset-less job ledgers retained forever; global cost query scans history under global lock              | Prune settled ledgers afterUTCday, unbound unknown after30d, retain bound unknown; generated global createdAt index; current-day budget preservation integration test | Fixed; completion confirmed                              |
| R-2 / Medium    | Broad binding reconciliation ran on every50ms worker turn under global lock                             | Bounded expensive reconciliation once/minute independently of object cleanup; cadence unit test                                                                       | Fixed; completion confirmed                              |

Additional focused remediation: R-2's cadence reservation now occurs before its
first await; a four-concurrent-slot test proves exactly one expensive sweep.
R-3 (Medium, worker storage exception path) identified that a lost upload or
publication acknowledgement could overwrite durable `storing` with a state derived
from the old job snapshot. The worker now preserves storage intent, recovers its
existing bytes without provider calls or extending writer deadlines, and re-polls
the original known task when bytes are missing. Sync and known-task fault tests
cover both successful put/lost complete acknowledgement and missing bytes.

SEC-5 (Medium, interruption transitions): indiscriminate cancellation could make
known/ambiguous paid work retryable after account restoration or cancelled removal.
Only definitely unsubmitted queued work cancels retryably; submitted/unknown work
retains task/profile/binding and redacted no-resubmit state. Shared state-policy
tests and real disable/restore + deletion-cancel DB cases verify this invariant.

After repeated transition findings, the main agent diagnosed the common cause:
error and interruption paths reasoned from pre-transition snapshots and conflated
user-visible cancellation with certainty about upstream submission. The remediation
audited every transition by whether submission/output is known, preserves durable
intent, and tests restoration, expiry and exception interleavings. This is a
state-machine correction, not repeated unrelated patching or a test waiver.

Security review final verdict: no remaining Critical/High/Medium exploitable
defect in the default-disabled implementation. SEC-1/2/2a/4/5 closed after source
and focused evidence inspection. SEC-3 remains the explicit activation gate below.

## Deliberate limitation / SEC-3 justification

Unknown provider acceptance cannot be automatically retried safely without provider
idempotency or reliable upstream evidence. V1 chooses unavailable same-field audio
over possible duplicate charges. Its unresolved binding persists until content
changes/account deletion; there is no implemented operator settle command and no
claim of one. Cleanup/capacity and raw-text retention are bounded; queued cost is
reserved conservatively. Generation is disabled by default. Live activation is
explicitly blocked pending authorized real-provider evidence and an operational
resolution policy; this residual is documented in the guide/runbook/evidence.
It is not waived as a passing live-provider test or silently retried via another
provider. Future operator tooling requires deliberate design/authorization.

## Verification and remediation scope

See EVIDENCE.md for exact commands/results, disposable infrastructure and final
fingerprint. Remediation reviews cover fixes and affected callers/invariants;
source changes invalidating proof trigger focused reruns. Real browser and DB
proof complement unit suites. Live Kie/Selectel and optional remote rehearsal
remain production activation gaps, not fabricated local successes.

## Final verdict

Independent completion review found no unresolved material findings after final
R-1/R-2/R-3 remediation; security closed SEC-1/2/2a/4/5. All affected reruns passed.
SEC-3 is the explicitly justified production activation gate above.

Completion review snapshot: 2026-09-21T19:19:00Z, base `3df8092`, tracked diff
SHA-256 `1b4c92306586b4ac69eab8b4e67f9edc94ceb99c66db8b9b93db647c670e9208`,
untracked content manifest SHA-256
`397e81314648216cedfa1b74615e8c8b6d7b02c84c668bb8cb12d7481f22a528`.
The user's existing architect configuration commit is preserved. All implementation
agents have finished. No deployment, paid request, push or branch deletion occurred.
