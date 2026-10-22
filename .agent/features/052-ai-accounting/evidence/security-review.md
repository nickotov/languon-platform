# Independent security review — initial

Initial threat-focused read-only review by accounting_security_review of base
d441863 and review-manifest.json SHA d5074324d542e88e57b0386689be37910bc9b6ffe4c407cb717126d32332968d.
Root transcribed the reviewer's findings; reviewer did not edit files or run tests.
Verdict: NOT READY. All findings below require remediation and actual-role proof.

## SEC-052-01 — High — spoofable purge authority

Raw DELETE grants in infra/deploy/sql/account-purge-worker-role.sql (~154–167
and earlier financial grants) let the purge role bypass the checked anonymizer.
Wallet guards in0084:156–183,0089:130–140/320–349 and0032:1–17 trust the caller-set
languon.ai_credit_purge_owner GUC. drizzle-ai-credit-participant purgeOwner
(~767–798) sets it then deletes. A compromised credential can set it for a victim
and erase ledger/actions without a deletion_pending user or due claimed lease.

Fix: revoke raw financial DELETE; checked SECURITY DEFINER purge seam with fixed
search_path, PUBLIC revoked, role-only execution; verify locked user/request,
due running live lease and expected worker/fence, reject active work, then
archive/anonymize/delete atomically. GUC is never authority by itself.
Proof: actualrole spoofedGUC/directDELETE/no lease/wrongworker/stalefence denied;
validlease succeeds, stale concurrent worker denied, anonymity/retention preserved.

## SEC-052-02 — High — worker admission and financial authority

Dictionary worker role grants INSERT sentence_ai_jobs (~108), policy/actions/
allocations/attempts/expenses/operator authorizations (~172–200).0048:4–64 only
requires spoofable capability markers and snapshot shape.0089 and0096 typed
feature binding does not establish an authenticated preexisting user request if
the same worker can forge that feature.0093:651–680 operator INSERT trusts
caller-provided owner/global limits. Direct report change_version UPDATE can
also overflow or suppress reports.

Fix: API owns authenticated parent/job/action/policy/customer holds. Worker can
claim/execute already authorized work with bounded dispatch/settlement helpers.
Any sentence-preparation child creation must derive from an active pinned
preauthorized parent and verified batch lease/fence, never raw arbitrary job
INSERT. Operator admission must derive reviewed settings internally; caller
limits cannot raise actual configured limits. Revoke direct report version UPDATE;
use fixed-path SECURITY DEFINER dirty helper, PUBLIC revoked.
Speech API already creates operator authorization before job insertion; worker
attempts must bind that existing prepared pinned job. Generic attempts must bind
existing API-owned actions and valid worker lease/fence; no caller financial rates.
Provider observations remain worker inputs, settlement uses stored authoritative
outcome/usage and pinned tariffs.
Proof: actualrole raw admission/policy/action/allocation/operator/expense/report
mutation denied; wrongowner/orphanchild/unpinned/overlimit/replay/stalelease rejected;
positive existing speech/conversation/interview/legacy/preparation/retry paths pass.

## SEC-052-03 — Medium — forgeable provider expense provenance

accounting-provider-expense-guards.sql:2–17 (0093:43–60), accounting-schema.ts:74–108,
worker rawINSERT (~172–174), accounting store (~612–647), speech-accounting.ts
(~112–149). A nullattempt fact bypasses provenance checks; linked attempt only
needs settled/sameaction. Provider/model/amount/time/reference are unchecked.
Worker can preempt speech:<livejob> with arbitrary expense; speech existingref
branch skips both expense and operator.recordAttempt, corrupting reports.

Fix: revoke raw INSERT; checked generic helper derives canonical ref/provider/
model/cost/measurement from immutable execution and settled measured attempt.
Speech-specific helper binds dispatched prepared job, derives canonicalref and
allowed authoritative outcome. Identical replay is idempotent; conflicts reject.
Orphan/null generic/wrongaction/provider/model/cost/ref and speechpreemption must
fail under actualrole. Preserve allowed anonymous unlink during purge.

## Other surfaces and limitations

No other material source-evidenced finding was identified in admin auth, learner
USD transport, external URLs or logging within this review boundary. Runtime
role configuration and exploit/remediation behavior need actual-role PostgreSQL
proof; source review alone is insufficient. AC9 performance remains failed.


## Expanded remediation review — scope checkpoint

The reviewer inspected the newly introduced checked helpers and final role
boundaries. Final source/runtime verdict is pending after0105 and restricted-role
proof. These are reviewer findings transcribed by the root agent.

### SEC-052-04 — High baseline residual — nonfinancial purge permissions

`infra/deploy/sql/account-purge-worker-role.sql` already grants raw auth/domain
DELETE/UPDATE and deletion-request UPDATE at base d441863. Those privileges can
be abused outside a claimed deletion. Feature052 does not introduce or broaden
these permissions; it narrows user lifecycle, request columns and financial
access. The reviewer explicitly reclassified this as non-blocking baseline
security follow-up, rather than requiring a domain-wide RLS/purge redesign here.

Follow-up scope (not implemented or claimed fixed): independently harden the
existing nonfinancial purge role so active/unrelated owners cannot be erased and
request lifecycle transitions require appropriate claim/fence. Preserve valid
cross-owned cleanup and test actual restricted credentials. Source:
[existing purge role](../../../../infra/deploy/sql/account-purge-worker-role.sql).
This remains a known High residual outside Feature052.

### SEC-052-05 — High blocker — unscoped financial recovery execution

The feature-added purge-role EXECUTE grants on generic attempt observation,
expense creation, action settlement and speech customer settlement can mutate
another owner without a purge claim. Remove these grants. Recovery must validate
owner/current worker/fence and derive eligible expired/terminal work itself,
without caller-supplied usage, rate or charging outcome. Actual purge-role proof
must deny generic helper execution and reject wrong-owner/stale-claim recovery
while allowing valid claimed recovery. Records owns the bounded0105 remediation.

### SEC-052-06 — Medium blocker — mutable speech admission counters

Feature-added worker INSERT/UPDATE/DELETE on `speech_daily_admission_counters`
can reset daily allowances or deny subsequent admissions. Remove raw worker DML;
maintenance should call a fixed-path checked helper with a fixed retention
cutoff and hard batch bound. Actual-role tests must deny current-day mutation,
preserve current rows and remove only expired rows through the helper. API
admission writes remain unchanged. Authority owns the0105 remediation.

Direct report-dirty helper execution is a separate Low defense-in-depth concern;
its worker grants are removed because checked SECURITY DEFINER paths can invoke
it themselves. Generic dictionary-role8/8 passed through0104, including denied
raw mutation and denied direct report invalidation. Final speech/purge/newcall
proof and full remediation verdict remain pending.


## Final independent security verdict — READY

Reviewer: accounting_security_review, read-only expanded remediation review.
Boundary: base d441863 and remediation-review-manifest.json SHA256
6000b1719759db4d486dfcb7a49574ab3a4eb20ef21d3a3da65b88d119abecfc
(494 changed implementation/configuration/documentation files; mutable evidence
read separately). No files modified or tests rerun by the reviewer during the
quiet-run constraint. Root transcribes the reviewer's verdict below.

No material feature-introduced security finding remains:

- SEC-052-01: checked financial purge validates the due inactive owner, current
  live worker and fence under database locks; caller GUC alone is insufficient.
  Raw ledger DELETE is revoked. Financial9 and actual coordinator1 prove denial,
  valid reclaim and anonymous cash/expense retention.
- SEC-052-02: checked dispatch derives pricing/budget from API-pinned action and
  live typed job lease/fence. Unfenced speech dispatch is retired. No raw worker
  hold/action/operator/expense/counter mutation. Actual worker11, speech49,
  preparation21+role1+journeys2, authority10, portrait32 and capacity14 support it.
- SEC-052-03: immutable expense provenance derives provider/model/rate/amount/time
  and reference from a settled text attempt or dispatched speech job. Actual-role
  tests reject arbitrary/null generic facts, backdating and speech preemption;
  canonical replay succeeds and conflicting replay fails.
- SEC-052-05: purge role has no generic settlement/observation/expense/report EXEC.
  Its recovery wrapper accepts only claim identity and owned operation, derives
  terminal outcome and unknown interrupted usage, and rejects wrong claims/kinds.
- SEC-052-06: worker speech counters are read only. Checked cleanup deletes only
  rows older than seven days, with a hard batch bound; current-day raw mutation
  is denied. API admission writes remain unchanged.

The0106 scheduled-speech API helper is fixed-path SECURITY DEFINER,
PUBLIC-revoked, absent from worker/purge grants, and validates the scheduled
inactive owner under locks. It cancels only undispatched queued jobs; dispatched
work retains metering. Seven targeted cases cover denied access, queued cleanup,
known expense and inactive-payer zero charge. Published cached pricing is pinned;
provider/customer admission use their respective maximum possible input/cache
rates, while settlement uses exact measured categories.

Residuals: SEC-052-04 remains the separately tracked pre-existing High baseline
permission weakness; no general domain-purge redesign is part of this feature.
Deployment must reapply both reviewed role scripts after migrations. Provider
usage observations are trusted worker inputs bounded by pinned authorization;
invoice reconciliation remains the internal correction/detection boundary.
AC9 performance is outside this security verdict. Its separate final acceptance
artifact is recorded in [feature evidence](../EVIDENCE.md) and passes the
user-confirmed 100 ms p95 threshold.
