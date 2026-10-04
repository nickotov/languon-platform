# Review: Sentence translation practice backend

Updated: 2026-10-04

Verdict: Approved after remediation. Author preflight, independent completion/
security reviews, separate tester evidence and all material finding fixes are
complete. The historical sections below preserve initial findings and the final
remediation boundaries.

## Independent security review — preliminary

Reviewer: `/root/sentence_security_review` (read-only, independent context).

- **Medium, security / availability** — Sentence worker circuit classification
  initially included `invalid_model_output` as a provider-global failure. Because
  dictionary text and learner answers are untrusted model inputs, one learner
  could cause invalid outputs and open the shared model/format circuit for others.
  Established dictionary policy counts only actual provider operational failures.
  Remove invalid output from circuit accounting, retain per-job error and known
  usage settlement, and prove invalid output cannot trip the global breaker.
  Remediation assigned to persistence owner; final verification pending.

No completion review has run yet; author preflight follows circuit proof and
stable-source regression evidence. The dedicated independent tester supplied the
composed auth/API/worker journey and documented its coverage boundaries.

- **Medium, privacy / external provider minimization** — The initial provider
  adapter serialized internal generation/check DTOs containing persistent dictionary,
  exercise and entry identifiers. Providers need bounded intentional language
  content and request-local target labels, not stable resource identity. Remove
  resource IDs, alias entries locally, validate aliases and map back before domain
  validation. Add captured-message assertions for both tasks. Remediation assigned
  to the application/provider owner; final verification pending.

## Security final verdict

Approved after remediation, `/root/sentence_security_review`. SEC-036-01 and
SEC-036-02 above are resolved and verified by realPG/captured-message coverage.
Reviewer traced auth/share/session authority, private projections, replay/credits,
SQL guards/roles, candidate/account erasure, tool-free fixed-provider execution,
prompts and redacted tracing. Independent backend suite100 files/723 pass;
32files/259 integration tests intentionally skipped outside disposable opt-ins.
No critical/high/unresolved material medium findings remain. Residual boundaries:
intentional language content reaches selected providers; paid live wire/retention
was not tested, worker credentials are trusted, generic SDK operational error
classification should be observed at live enablement; deferred frontend rendering
is outside this backend review.

## Author preflight — complete

Scope: feature036 diff and untracked source against prerequisite`bcfda16`; excludes
frontend generation artifacts and docs/state from executable source fingerprint.
Manifest89 paths, digest
`e89e94dc10c4b05c04ec48aa32bf4f343176d7ded8534b43fd09e3c14e942b08`.

Acceptance/source comparison covers both directions/modes, additive saved reuse,
live owner/share authority, personal completion/exposure/history, free explicit
manual review without grades or model/wallet calls, strict hint/span/score rules,
immutable capability/pricing snapshots, shared limits/slots/circuits, terminal
settlement, candidate erasure and actor/owned-dictionary purge. Public references
are limited to explicit review/history; private provider DTOs are minimized.
No frontend implementation was introduced. Runtime token/primitives and analogous
profile/flashcard surfaces were inspected for later design prompt fidelity.

Focused units/contracts, final backend suite, composed realauth PG/Redis journey,
realPG credit/capacity/store/role/lifecycle regressions, backend lint/typecheck/build,
contracts/prompts checks, admin scoped lint/typecheck and existing provider/credit
Chromium regressions pass. Migration generation/classification and source diff
checks pass. Independent security findings are remediated. Test skips are explicitly
separate from real disposable DB evidence. Final design prompts and local delivery
bookkeeping are pending completion review, not executable acceptance gaps.

No secrets, model tools, arbitrary external URLs, accidental frontend/generated
output or unexplained material scope remain in the reviewed source. Deployment
and rollback constraints are recorded; no production enablement/deployment occurred.

## Initial independent completion review

Reviewer `/root/sentence_completion_review`, full feature036 diff/untracked source
against`bcfda16` and author manifest`e89e94dc…`. Three material medium findings:

- REV-036-01 — Admission capacity pressure used missing-content error, resulting
  in404 instead of retryable503. Add distinct capacity error/public contract and
  HTTP regression; retain404 for actually inaccessible content.
- REV-036-02 — Sentence queue admission omitted running jobs, allowing combined
  dictionary/sentence totals to exceed established queue limits across budget
  cohorts. Count queued+running globally/per learner and prove mixed boundary with
  no extra job/credit reservation.
- REV-036-03 — Implemented singular exercise`/check` path differed from approved
  plural`/checks` contract. Align route and tests to the canonical plan before
  frontend handoff; no compatibility alias needed for this unreleased endpoint.

Remediation assigned to application/provider and persistence owners. Reviewer
accepts evidence validity/proportionality and documented residual boundaries;
approval remains pending fixes and focused re-review.

## Author remediation preflight — complete

REV-036-01/02/03 are implemented: capacity uses a distinct retryable503 error,
queue admission counts all queued+running work, and the check route is plural.
Seventeen realPG store/boundary tests pass, including actual pinned Kie dictionary
and DeepSeek sentence budget cohorts globally/per actor, provider reservation and
aged queue pressure, with unchanged jobs/credits/receipts/wallets on rejection.
Fifteen service/HTTP cases pass for both paid admissions,503 Retry-After and the
canonical plural route. Contracts73 pass; real composed journey, backend
lint/typecheck/build and diff checks pass. Guide accurately documents capacity
failures; final marker was synchronized to`sha256:e8f1292e67d5caea`.

Updated89-file source manifest is`author-remediation-source-manifest.json`;
initial full-review manifest is preserved separately. Focused remediation review
is requested for the changed conditions/contracts/routes and affected call paths,
not a second full-feature initial review.

## Remediation verdict — approved

`/root/sentence_completion_review` approved seven changed executable files and
transitive admission/replay/credit/capacity paths against89-file manifest
`280dfbd2ad30a03d368342f73db483ef02183fc4cd510dc7dc847759f27f3e56`.
All REV-036-01/02/03 findings are resolved; no material findings remain. Security
approval remains current; no new security-sensitive external boundary changed.

Nonblocking precision observation: capacity_unavailable is also accepted by the
terminal-job failure enum although admission rejects before job creation and no
worker emits it. It has no runtime, billing or persistence impact; retaining this
unused allowed value is accepted for this handoff. Designs represent capacity
pressure as admission failure, not a fabricated failed job.

Paid live-provider wire/retention, production activation and deferred frontend
browser/device fidelity remain explicit boundaries, not unverified backend claims.
