# Independent review: Mastra Agent Development Harness

Reviewed: 2026-08-16
Reviewer: Independent correctness, tester, and security passes
Verdict: Pass

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

All material findings were fixed and re-reviewed:

- Severity: High
    - Location: built migration-folder discovery and the generated workflow
      mutation policy.
    - Problem: the built playground command could resolve migrations relative to a
      shared chunk, and the first exact mutation allowlist omitted Studio's actual
      workflow `/stream` action.
    - Impact: built provisioning could fail before migration, and Studio workflow
      execution returned `403`.
    - Resolution: Fixed — built entry points now supply their own module URL to a
      tested resolver; exact `/stream` is allowed and passed actual generated-server
      create/stream/finish verification.
- Severity: Medium
    - Location: playground lifecycle locking, generated-server execution policy,
      internal Mastra refresh/restart routes, and request-context defaults.
    - Problem: provisioning released its advisory lock before target migration/
      seed, the generated agent API accepted caller policy overrides, non-API
      generated mutations escaped Host/Origin checks, and omitted variants did not
      reliably apply the schema default at execution.
    - Impact: concurrent lifecycle races, unintended model/provider/prompt/tool use
      and paid work, DNS-rebinding mutation access, or inconsistent variant output.
    - Resolution: Fixed — lock scope covers the complete lifecycle; the server now
      enforces global loopback authority plus exact API mutation and agent policy,
      bounded body/time/steps/concurrency, and local defaults at the primitive seam.
- Severity: Low
    - Location: telemetry, modern model defaults, and ordinary/playground database
      identity aliases.
    - Problem: usage telemetry could remain enabled, modern generation inherited a
      five-step framework default, and equivalent database names could use authority
      aliases.
    - Impact: unintended metadata egress, two excess model steps, or local
      development data reset risk.
    - Resolution: Fixed — telemetry is forced both before and after CLI env loading,
      all model modes share a three-step cap, and any decoded same-name application
      database is refused.
- Severity: Medium (test gap)
    - Location: mutation allowlist tests.
    - Problem: prefix authorization lacked arbitrary-suffix and method-negative
      coverage.
    - Impact: a future generated mutable endpoint below a trusted prefix could be
      unintentionally exposed.
    - Resolution: Fixed — method/action matching is exact and regression tests cover
      arbitrary agent/tool/workflow/scorer suffixes plus PUT/DELETE attempts.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Pass. Independent correctness, tester, and security reviewers found no remaining
material issue or test gap after remediation. The generated-server assembly and
Studio workflow route were also exercised against the real running server.

Residual verification notes: no credentialed live-model smoke ran because no
development key was supplied; generated-server assembly remains live acceptance
evidence rather than a committed integration test. Both are intentional and do
not weaken deterministic default-path coverage.
