# Improvement: Actionable AI readiness diagnostics

Status: Complete
Created: 2026-10-31
Updated: 2026-10-31

## Routing decision

Focused developer/admin diagnostics improvement using existing read-only doctor
and routing/probe responses. User requested implementation of the prevention
recommendations after a changed conversation contract invalidated activation
evidence. No new public contract, persistence, admission rule, permission,
provider/model, production dependency or paid automation. Current branch and
unrelated uncommitted workbook work are preserved; no automatic commit.

## Context and scope

The doctor already detects mismatched fingerprints, but reports a generic
flow-check instruction. Admin shows any historical successful flow check as
evidence and the probe controls select the latest result for a route regardless
of the selected flow/type. The history API does not expose current fingerprint
validity; the UI must not claim to know current admission from historical passes.

Improve those existing displays and the delivery checklist. Authoritative live
validity remains in the doctor/server. No learner-facing operational/model
details, background paid calls, automatic probe reruns, routing changes or new
readiness endpoint. Refresh at user request; do not introduce polling/watching.

## Acceptance criteria

- AC-1: Read-only doctor distinguishes missing flow evidence, changed execution
  identity and blocked current evidence, naming the affected route/flow and
  explicit recovery. Aged unchanged evidence remains a pass.
- AC-2: Admin distinguishes historical checks from current readiness, gives a
  concrete read-only local diagnosis/recheck path and shows the selected route,
  kind and flow's result (including missing/failed states). No historical pass
  overrides a newer failure in the table.
- AC-3: Delivery instructions require applicable runtime readiness verification
  after AI contract changes and record blocked live activation honestly. Paid
  checks still need scoped authorization; deterministic tests are not live proof.

## Verification strategy and risk

Doctor selection/dispatch predicate remain unchanged; only internal diagnostic
reason strings are added. Existing database predicate remains authoritative.
No AI execution regression-matrix runtime seam changes: no admission, prompt,
schema, routing, worker, deadline or settlement change. Target diagnostic unit
tests and admin component tests, admin typecheck/lint/build, mapped routing
Playwright journey with synthetic probes, guide checks and real local doctor.
No database or security-policy change; dedicated database/security suites and
full critical gate are not required. Independent scoped review is appropriate
for avoiding false readiness/unsafe paid-check guidance.

Review expanded to explicit security assessment of established expense approval
and refresh/mutation serialization after the new reload action exposed those
risks. Server authorization, budgets and dispatch contracts remain unchanged.

Relevant constraints: ADR-0046 and existing MCP explicit operator limits.
Guide: docs/user-flows/admin-text-ai-routing.md. Follow frontend-development,
testing, browser-verification, user-flow-e2e and writing-for-agents for affected
surfaces. Rollback: revert this scoped UI/tooling/documentation patch; no data
rollback or configuration mutation.

## Plan

- [x] Implement diagnostics and selected-check history UI.
- [x] Add focused tests and delivery/guide instructions.
- [x] Run focused author checks and independent source/remediation review.
- [x] Run mapped browser/static gates, synchronize guide and record evidence.

## Evidence and review

Base HEAD: `7212a96e414d9fa1a4e62344a98b7f1b82980d4e`. Frozen scoped
source hashes: `/tmp/languon-readiness-diagnostics-source.json` (16 files,
including untracked notice and hook-race tests; does not include this mutable
record). No unrelated workbook changes were reverted. Final browser gate passed;
independent final evidence approved.

- `pnpm --filter @languon/admin exec vitest run --reporter=json
--outputFile=/tmp/languon-readiness-admin-unit.json`: 106/106 passed, zero
  failed/pending across 20 files. Includes cap-change consent and both deferred refresh/mutation
  race directions. jsdom emits its existing pseudo-element warning; no failures.
- `node --test scripts/dev-readiness/*.test.mjs`: 35/35 passed, zero skipped.
  Report: `/tmp/languon-readiness-doctor-tests.log`. Includes missing, old-identity,
  blocked, transient and recovered evidence; unchanged aged evidence stays ready.
- Admin typecheck, full admin ESLint, scoped readiness-script ESLint and scoped
  Prettier/diff checks passed. Admin production build passed; report
  `/tmp/languon-readiness-admin-build-final.log` retains existing bundle-size warning.
- `pnpm docs:user-flows:check` and `pnpm user-flow:e2e -- check
admin-text-ai-routing` passed (33 guides, one affected mapping).
- Actual `pnpm dev:doctor -- --capability conversation` passed against the
  existing loopback development environment. Read-only; existing prior MCP
  activation evidence was reused. No additional paid generation or env changes.
- Fresh isolated read-only workflow decision probe using existing case 08 passed
  its rubric: SDK/database seam proof, measured setup, focused iteration,
  source review before broad gates, complete shared-accounting gate, no paid
  call without authorization, honest live readiness. This checks instruction
  decisions only; no comparative efficiency or provider execution claim.

Independent reviewer `/root/readiness_diagnostics_review` found three medium
issues during initial review, all resolved and source/security approved:

- RD-001: blocked transient evidence must direct wait/review/doctor before paid
  recovery. Guidance fixed in CLI, admin and guide without duplicating SQL
  route/provider-wide authority; regression covers transient and hard wording.
- RD-002: boolean approval could survive a changed cap. Approval now binds exact
  route, type, flow and maximum; cap rerender regression verifies renewed consent.
- RD-003: slow history refresh could overwrite a paid result. Hook refs serialize
  both overlap directions, and UI busy covers refresh. Deferred regressions pass.

No new permission, price, admission or provider-execution behavior. Server-side
recent-owner/origin/schema/exact-cap and financial controls stay authoritative.
Source approval preceded the final browser gates; completion approval is recorded
below after the clean run and final evidence inspection.

Initial mapped browser run `19b3855b-705f-4772-a4c7-a5ea3ed4cf12` failed
the new exact refresh-button locator: Ant's retained loading icon changed its
accessible name even though both GET requests completed successfully. The second
case then cascaded on fresh-worker bootstrap after the first failure. Failed raw
reports are retained; they do not count as passing evidence. Added explicit
button aria-label, contained the route table's grid width using the existing
shared-page pattern, and added desktop/narrow document-overflow assertions.
Focused 16/16 tests passed again; typecheck/lint/style checks passed. Reviewer
approved those scoped accessibility/layout fixes before the mapped rerun. Prior
106-test evidence remains valid for unchanged modules those tests load; the new
button label and grid containment are verified through final real browser evidence
and rebuilt admin output, rather than claiming those tests render the panel.

Second mapped run `25bac501-2b59-4cc3-8886-35d69846bbcf` passed the new
refresh/no-paid-call, exact selected-flow and desktop/narrow overflow assertions,
plus existing publication/disable behavior, then exposed an old test assumption
in recovery: its fixture reserves flow `sentence-check`, but the test reloaded
the form and selected only a route (default check kind is quick). That relied on
the cross-flow result bug being corrected here. Updated the test to assert no
recovery under quick selection, explicitly select the reserved flow, and retain
all unknown-maximum, upstream-stop, reason and recovery assertions. Runtime source
is unchanged. The second owner-bootstrap failure again cascaded after the first
case restarted its Playwright worker. The entire journey was inspected for other
implicit selection assumptions before another bounded two-case run; no product
deadline, timeout, recovery or cost assertion was weakened.

### Final mapped evidence

Command: `pnpm test:e2e:critical -- --flow admin-text-ai-routing`.
Clean run: `422f13ca-2147-4eac-b20c-56e3ae178f63`, 2/2 passed in 50.9s,
zero skipped/unexpected/flaky/errors. Each run uses fresh runner-owned disposable
PostgreSQL/Redis and synthetic external provider composition; no real provider
spending. Runner exited zero, cleaned owned resources, and released its lock.
Failed earlier reports are retained separately, never aggregated as passes.

Raw evidence: `test-results/critical-flows/422f13ca-2147-4eac-b20c-56e3ae178f63/`.
Summary SHA256: `c3cb510780d74cc1bae38e04641461c4e1494e6184bef26d89ac2e52576c4363`.
Browser JSON SHA256: `fdc74ddbf4c6017b593a0838d853703fb0b7daabeb9f272ed99ef2358b8b5d0e`.
Log: `/tmp/languon-readiness-critical-clean.log`.

Chromium desktop 1280×900 and narrow 390×844 screenshots were visually inspected;
readiness notice and refresh remain visible/readable with table-local scrolling
and zero document overflow. The journey checks no probe POST on initial read or
history refresh, selection-specific results, explicit expense approval, audited
flow-specific unknown-cost recovery, and absence of unexpected console/network
errors. The second case verifies disabled transcription configuration without
provider execution. This valid mapped browser evidence satisfies ADR-0016;
no redundant exploratory session was required.

Final manifest SHA256: `11368bccdb26b6e18839414247977ab169a63fb8682c836c9e844076552dd679`.
Runtime/test source hashes match the clean run. Only guide `last_verified` changed
afterwards to 2026-10-31; guide content/marker remain unchanged and traceability
checks passed again. Status stays draft for its existing broader scope.
Final local doctor log `/tmp/languon-readiness-live-doctor-final.log` exits zero:
11 prerequisite checks pass, including matching flow evidence and fresh worker.
As the doctor says, this does not prove live provider connectivity or daily quota.
No environment keys, routing, prices, user credits, production activation policy,
normal development data or unrelated feature completion status were changed.

Final static evidence: full admin typecheck/lint, scoped script lint, style
contract, admin production build, Prettier/diff, 33 user-flow guides and affected
mapping all passed. The last test-only exact recovery selection has its own
typecheck/ESLint/mapping pass; runtime build evidence remains valid.

Final independent approval: `/root/readiness_diagnostics_review` validated all
16 hashes, both raw browser reports, 106 admin tests, 35 readiness tests, the
11-check live doctor, build and screenshot evidence. No material source,
security, acceptance or verification gaps remain. Completion approved 2026-10-31.
User authorized a focused local commit after verification. No merge, push,
branch deletion or deployment was performed.

## Remaining risks

The existing admin history DTO cannot certify current fingerprint validity;
the UI explicitly discloses that limit and directs local operators to the
read-only doctor. Remote deployment readiness automation is outside this scope.
