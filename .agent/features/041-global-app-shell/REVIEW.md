# Review: Global app sidebar and WIP home page

Reviewed: 2026-10-12
Reviewer: Independent global_shell_completion agent
Verdict: PASS after remediation

Root recorded the read-only reviewer's supplied findings and final verdict.

## Review boundary

- Initial mode: complete tracked and untracked feature patch from base
  `6d56636c07d2a1f972c9413ef9310ba4b17247e1`. Captured combined patch SHA-256:
  `6df76b0e99666d242d6898c7361925ed24d0b94bb371a61d426c51b30e482355`.
  The original 38-file manifest, retained as evidence/initial-review-source.sha256,
  validated at initial review. Includes root routing, guest/authenticated sidebar,
  query isolation, preference popup, responsive page fit, tests and documentation.
- Inputs: FEATURE AC-1–AC-5, EXEC_PLAN, EVIDENCE E-1–E-4, ADR-0005/0007/0016/0029/0030,
  scoped source/callers and existing affected journey guides.
- Remediation mode: F041-R1 repairs only, affected route-classification callers,
  component/E2E regressions and guide revision; EVIDENCE E-5 and current 41-file
  evidence/runtime-source.sha256. Manifest validated independently.
  Captured remediation patch SHA-256:
  `fcbe8bac8fd1e1c6081738519d1555a62e198919ddfdb22f4dfa13f76882a50f`.
- Bounded security review PASS in evidence/security-review.md. No new test harness
  or complex unresolved infrastructure behavior requiring a separate tester.

## Findings

### F041-R1 — Medium, fixed

- Locations: app-shell/ui/app-shell/app-shell.tsx resolvePageTitle,
  app-shell/hooks/use-app-shell-state.ts dictionaryRoute,
  app-shell/ui/sidebar/dictionaries-navigation.tsx sectionActive.
- Problem: raw startsWith route predicates classified `/dictionaries-other`,
  `/profile-other`, `/shared/dictionaries-other` as real sections. A not-found
  page received a misleading mobile title and, when authenticated, dictionary
  auto-expansion/highlight or rail aria-current. Violated AC-1/AC-4.
- Suggested repair: exact route or slash-delimited descendant matching shared
  consistently, plus signed-in title/navigation and real-browser missing-route
  regression checks.
- Resolution: lib/is-route-within.ts implements exact-or-prefix-slash matching;
  all three consumers use it. Three signed-in component cases assert generic
  title, closed disclosure and no rail aria-current. Canonical mobile browser
  journey checks all four known missing routes/title. Focused24/full539 unit
  tests and canonical2/2 real-browser cases pass; details in EVIDENCE E-5.
- Disposition: Fixed; independently confirmed by remediation review.

## Completion audit and evidence reuse

All AC-1–AC-5 are reconciled with implementation and valid evidence. No supplied
external design is in scope. Tests, runtime checks and guide mappings are credible
for their recorded states, including browser failure diagnostics and subsequent
passing renewals. No accidental scope, secrets or temporary/generated output found.
The sizing compatibility repairs retain existing controls and stricter bounds checks.

Remediation changes only route classification and its tests/guide. It preserves valid
route families and does not alter authentication, query/principal/cache, permission
or capability invariants. Prior security, catalog and unaffected browser evidence
is valid for reuse. Focused changes do not require a second full completion review.

## Final verdict and limits

PASS after remediation; no open material findings. Representative browser evidence
is not an exhaustive page/locale/theme matrix. Delayed old-principal query/mutation
completion has no deterministic deferred-promise regression test; security and
completion reviewers inspected the identity guards and scoped cache keys, and
existing mounted identity-switch and real two-account journeys pass. This is a
defense-in-depth coverage limitation, not an observed correctness/security defect.
