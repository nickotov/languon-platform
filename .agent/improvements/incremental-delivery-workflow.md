# Improvement: Incremental delivery and bounded live AI verification

Status: Complete
Created: 2026-10-31
Updated: 2026-10-31

## Scope and authorization

User approved implementing the discussed delivery redesign and a standing bounded
live-test allowance using already-approved models and a dedicated synthetic learner.
This is developer tooling/workflow maintenance with existing account/admin APIs;
no production contracts, routing, billing semantics or provider changes. Current
branch is retained; no commit authorized for this turn.

## Acceptance

- AC-1: Select affected critical AI seams without running the entire aggregate;
  retain comprehensive regression and report setup/execution timing separately.
- AC-2: Delivery rules choose risk-based checks, reuse valid evidence and decide
  substantive UI direction before implementation; acceptance triggers a short
  actionable retrospective in the existing record.
- AC-3: Dedicated synthetic account is configured through existing contracts;
  standing paid smoke limits, approved-route scope and revocation are explicit.
  Distinguish deterministic verification, local readiness and live success.

## Verification plan

Focused script selection/reporting tests, dry-run plans and documentation/skill
validation. Independent bounded review of selection completeness and paid-check
safety. No product source/schema changes: product-wide tests/builds and disposable
DB reset are unnecessary. A real learner request will verify configured account
and current production composition, within the standing allowance; no paid calls
from deterministic tests. Runtime UI is unchanged, so no browser design check.

## Ownership and progress

- Root: integration, synthetic account/admin setup, paid-smoke policy, evidence.
- verification_selection: critical registry/runner/tests and operations guide.
- workflow_policy: root/delivery/design rules and existing skills/docs.
- Rollback: revert scoped tooling/instructions; disable standing allowance and
  revoke unused test credits through admin. Preserve paid accounting history.

## Evidence / remaining work

Implementation and scoped verification complete. Baseline Git clean at4071217.
Existing MCP supports bounded credits/limits/checks; account lookup initially absent.
No model/route changes authorized or planned. No measured speedup claimed until
accepted tasks supply comparative timing. User acceptance/retrospective pending.

## Implemented and verified so far

- Critical registry retains all 68 prior backend suites and 27 mandatory incident
  scenario sets. Seven disjoint selections plus the compatibility aggregate;
  unfiltered execution remains comprehensive. Dry-run plans start no services.
  Runner reports build/setup/test-process/cleanup durations, including failures.
- Delivery/testing/UI instructions now require risk-selected checks and a visual
  direction decision for substantive UI; ADR-0054 partially supersedes ADR-0016.
  Existing runtime/browser requirements remain. Retrospective waits for acceptance.
- Account created and verified through normal local auth. User approved generating
  a policy-compatible password because the supplied password was too short.
  Credential stored ignored, mode0600. MCP granted200credits once and set50/action;
  global limits/routing/models/tariffs unchanged. No automatic refill.
- Doctor `pnpm dev:doctor -- --capability conversation --learner-email
ai-tester@testmail.test`:12 prerequisites pass. Initial invocation used an invalid
  plural capability and was corrected; no mutation/paid request from either.

### Focused evidence

- Critical registry/runner22 tests passed (~0.3s); reviewer WR-1 found a partial
  selection mislabeled comprehensive. Fixed with exact complete-ID comparison;
  3 affected tests passed including new regression. All original suites/scenarios
  compared equal against base4071217.
- Independent workflow/source coverage review approved after WR-1 remediation.
  Full product suites unnecessary: no product runtime changes.
- Scoped lint/format passed. Skill checks10/10 plus27 packages and official
  validators for testing/ui-ux-composition passed. Setup-doc drift check passed;
  user-flow validators16/16 and33 guide/mappings passed (~1s).
- Fresh read-only case09 decision probe correctly waited for substantive visual
  direction, allowed independent tooltip maintenance, selected focused browser
  checks and preserved backend evidence, with retrospective after user acceptance.
  Shared-checkout instruction isolation only; no measured efficiency claim.
- Live-smoke safety review identified missing activation-check expenditure in the
  daily total and cap100 vs policy50. Both findings were resolved and independently approved. Local preflight also
  exposed operator-funded conversation policy: preserve it and verify free learner
  billing plus settled provider expense rather than changing global funding.
  Final live evidence below supersedes the earlier preflight-only state.

## Final evidence and outcome

- Offline smoke-tool checks10/10 passed (~0.4s); dependencies built through cached
  scoped contracts/languages build. Included in normal `pnpm test`; paid smoke is
  never invoked by tests/CI. Final focused ESLint/Prettier passed.
- Real PostgreSQL read-only exposure fixture: today158000micros, prior-day1800000,
  empty0; covers settled costs, held activation checks and native active overruns.
  No product tables mutated by that check. Source/security review closed R1/R2.
- First live command failed at login due to tool Origin mismatch, before quota or
  provider dispatch. Fixed Origin to configured localhost3333 and added preflight
  allowlist verification. Next command reached owner turn admission but omitted
  mandatory editor context; zero saved turns confirmed read-only. Fixed synthetic
  snapshot/hash and focused regression. Its USD0.10 reservation is retained.
- Final read-only conversation doctor passed12/12 after the live request, matching
  baseline12/12. Its limited readiness scope is complemented by actual live proof.
- Final bounded learner request succeeded, using the second/final task reservation:
  conversation `24b64f33-f56b-4a11-a474-40ae1da278ed`, turn
  `bb45da2f-f4c0-408b-bb90-6245309ec13f`; approved route
  `openrouter/openai/gpt-6-luna`; saved complete nonempty assistant output;
  expected operator-funded free learner billing; settled provider expense249micros
  (**USD0.000249**). Synthetic note/chat and billing evidence are retained.
- No further paid dispatches for this task. USD0.20 conservative journal allocation
  remains consumed despite only one actual provider call. Local password and journal
  files confirmed ignored; no credentials in tracked files.
- Independent security remediation reviews approved the origin/context fixes.
  Final readiness passed, satisfying both reviewers’ final evidence condition.
  No unresolved material source findings. Workflow source/coverage review approved;
  fresh case09 confirms instruction decisions only, not runtime savings.

AC-1/2/3 satisfied. Implementation verified and local conversation live execution
verified; this does not claim every AI capability has been live tested or that
future providers cannot fail. Local guard cannot serialize unrelated admin activity
or configuration changes; existing production limits still apply. User-flow
observable product behavior unchanged; existing guide/mapping check passed.
No full product suite was run because product runtime source was unchanged.

## Acceptance and learning

Awaiting user acceptance. Do not mark the retrospective complete from passing
checks. Two discovered smoke integration assumptions (Origin and owner context)
are recorded above with prevention checks. After acceptance, add the short
retrospective here. No production fingerprint/admission changes made; broader
fingerprint research is separate from this scoped tooling improvement.
