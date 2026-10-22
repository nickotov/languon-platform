# Review: AI accounting

Status: In progress. No independent completion verdict yet.

## Review scope

Early bounded invariant/security assessment by accounting_invariant_review
covered ledger unit cutover, action/policy/feature authority, financial expense
retention and restricted worker roles. This was discovery during integration,
not a completion review. Final review must assess the author-preflight patch,
acceptance criteria, all capability adapters, valid test evidence and performance
harness. Financial, personal-data and SQL changes require security review;
new concurrency/load verification also requires a separate tester assessment.

## Findings

### R-1 — High: unsafe in-place credit unit conversion

- Location: initial cutover SQL and legacy amount readers.
- Problem: old processes could write whole-credit amounts while new processes
  interpreted the same integer as milli-credits.
- Impact: incorrect balances, grants and historical charges.
- Fix: fresh development database with empty-ledger/drained-job migration guard;
  preserve old database. No production data conversion is authorized.
- Disposition: implementation repaired; real cutover rejection tests authored,
  operational switch and final remediation review pending.

### R-2 — High: generic actions lacked authoritative feature/policy binding

- Location: action admission and terminal settlement SQL.
- Problem: numerical rows alone could claim a free entitlement or successful
  outcome without the typed feature/pinned policy establishing it.
- Impact: inconsistent or unauthorized charges.
- Fix: admission entitlement/policy guards, deferred typed-feature checks and
  trigger-owned terminal proof, including settle-and-delete transactions.
- Disposition: implemented; authority10 real PostgreSQL cases passed before final
  minor zero-tariff/NULL refinements. Final review pending.

### R-3 — High: restricted generation role lacked accounting privileges

- Location: infra/deploy/sql/dictionary-worker-role.sql.
- Problem: newly required projections, attempts, operator reservations and dirty
  reporting function were inaccessible under the deployment worker role.
- Impact: production-shaped worker execution would fail despite owner-role tests.
- Fix: exact numerical read/write grants, retaining denial of grant/policy edits
  and direct counter mutation.
- Disposition: repaired script; actual-role3 tests authored, awaiting execution.

### R-4 — High: purge privileges and private financial data

- Location: account purge adapter and role SQL.
- Problem: new records were absent from erasure, while broad financial JSON reads
  would disclose payment references/reasons to the restricted purge worker.
- Impact: privacy retention or broken purge.
- Fix: checked SECURITY DEFINER financial-anonymization seam verifies due running
  deletion lease, captures anonymous purchase attribution, redacts identifiers,
  preserves expenses/global spending and removes private operator-day identity.
- Disposition: repaired; actual-role financial/privacy test executing. No broad
  payment/report JSON SELECT grant added.

### R-5 — Medium: incomplete or mutable provider expense settlement

- Location: action/attempt/expense constraints and report completeness.
- Problem: an action could settle with a dispatched attempt or missing expense;
  deletable/unattributed expense facts could falsely report complete zero cost.
- Impact: inaccurate operator reporting and weakened settlement audit.
- Fix: every settled attempt has one immutable attributed expense, all attempts
  settle before action, missing measurement remains unknown, FK unlink preserves
  anonymous financial facts through private-action erasure.
- Disposition: implemented; final records/adapter tests and review pending.

### R-6 — Medium: unit scaling overflow

- Location: original historical amount multiplication.
- Problem: scaling previously valid large values could exceed database/domain
  bounds.
- Impact: failed or inconsistent migration.
- Fix: remove live conversion; reject populated old ledger without altering values.
- Disposition: implementation repaired; genuine forward migration rejection test
  authored, awaiting run.

## Integration discoveries

Root also identified missing interview operator authorization/expense FK,
missing speech provider-dollar accounting, possible duplicate provider capacity
attribution, Stop markers, nullable CHECK loopholes, and cached-input tariff
propagation. These are under implementation and focused tests; they must be
included in final preflight and independent assessment rather than treated as
accepted risks.

## Final verdict

**READY for local feature integration (2026-10-23).** The independent completion
review and final security review are READY. All introduced critical/high and
material findings are closed, AC9 passes on the accepted 100 ms target, focused
database/Redis/unit coverage passes, browser journeys pass, and the preserved-old
fresh-development-DB cutover is verified. The local squash merge is the final
repository operation.

## Initial completion and security review — final feature boundary

Captured base d441863 +364file manifest SHA
d5074324d542e88e57b0386689be37910bc9b6ffe4c407cb717126d32332968d.
Both independent reviews returned NOT READY; no completion claim is authorized.
See [completion findings](evidence/completion-review.md) ACC-COMP-001–005 and
[security findings](evidence/security-review.md) SEC-052-01–03.

Root accepts all findings for remediation: performance target, paid allowance
consent across capabilities, first-admission budget copy, missing Redis guards,
missing learner billing projections, purge authority, worker admission authority
and expense provenance. Existing early R1–6 author fixes did not establish final
security boundaries; the new review demonstrates why completion requires actual
adversarial restricted-role checks. Root owns operator/role/defaultcopy and
performance integration; records owns checked purge/expense seams; legacyworker
owns backend quotes/metadata/Redis; frontend owns corresponding UI.

No fixed review-cycle quota or passing unrelated tests close these findings.
Remediation review must assess changed paths and final exact-source evidence.


## Expanded remediation scope checkpoint

The security reviewer distinguished pre-existing SEC-052-04 (broad nonfinancial
purge-role permissions at base d441863) from new SEC-052-05 (unscoped monetary
helper execution) and SEC-052-06 (new speech counter mutation). SEC-052-04 is a
High baseline residual assigned separate follow-up; this feature does not expand
those permissions and must not claim to have fixed them. No general RLS or domain
erasure redesign is included. Luna independently reviewed the scope at the user's
request and recommended these same boundaries. The final security reviewer closed
SEC-052-05/06 with actual restricted-role evidence.


Final expanded security remediation verdict: **READY** for the frozen financial
and restricted-role boundary captured by remediation manifest SHA
6000b1719759db4d486dfcb7a49574ab3a4eb20ef21d3a3da65b88d119abecfc.
See the final section of [security review](evidence/security-review.md) for closure
of SEC-052-01/02/03/05/06 and explicit baseline residual SEC-052-04. The
independent completion review is also READY. Final AC9, browser and development
cutover evidence is recorded in EVIDENCE.md; only local feature integration
remains.

## Final independent completion review — READY

The independent reviewer returned **READY** for the completed Feature052 scope.
ACC-COMP-001 is closed by safe claim/Stop/operator lock ordering, deterministic
PostgreSQL race regressions, 55/55 focused PostgreSQL cases, and AC9 run
`ae53ad48-d711-47ab-905e-accc509111bf` (300/300 loaded admissions, p95
94.457 ms, no failures, 722/722 runtime hashes matched). ACC-COMP-002–006 are
closed by the reviewed billing, consent, Redis, metadata and preparation-budget
remediations. The corrected legacy/current accounting suite passes 15/15.

The security review is **READY**. No material feature-introduced security finding
remains. Residuals: pre-existing SEC-052-04 broad nonfinancial purge permissions;
deployment must reapply reviewed role SQL; provider usage observations remain
trusted inputs within pinned bounds; and dictionary revision witnesses depend on
privileged writers advancing revisions. The supplemental low-history diagnostic
measured p95 361.230 ms under transient advisory-lock waits; the required
million-history loaded phase passes AC9. Continue monitoring cold/transient
behavior.

Final learner/admin browser journeys pass 8/8 on dedicated disposable
environments. The prior portrait-repair DB remains preserved; the application
starts on a fresh migrated local development DB. See EVIDENCE.md for the exact
test results and cutover verification.
