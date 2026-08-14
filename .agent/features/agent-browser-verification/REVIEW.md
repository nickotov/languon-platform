# Independent review: Agent Browser Verification

Reviewed: 2026-08-14
Reviewers: Independent implementation reviewer, tester, and security reviewer
Verdict: Approved

## Scope reviewed

- Feature specification, ExecPlan, evidence, full implementation diff, wrapper
  unit/integration tests, managed browser behavior, documentation, dependency
  metadata, and the Playwright E2E boundary.

## Material findings and resolutions

- Severity: High
  - Location: temporary `agent-browser` 0.27.0 pin and network configuration.
  - Problem: live probes showed clicked navigation and `sendBeacon` escaping the
    purported local allowlist.
  - Impact: page-controlled traffic could reach non-allowlisted hosts.
  - Suggested fix: use a hardened release and executable containment regression.
  - Resolution: Fixed. Pinned 0.33.0, passed security flags explicitly, and
    added a live reachable-sink regression for navigation and `sendBeacon`.
- Severity: High
  - Location: initial caller-selected session handling.
  - Problem: predictable names could attach to pre-existing unsafe sessions.
  - Impact: state/config adoption and cross-agent evidence contamination.
  - Suggested fix: wrapper-owned high-entropy handles and ownership tracking.
  - Resolution: Fixed with random 128-bit handles, exclusive markers, cleanup,
    and collision/ownership tests.
- Severity: Medium
  - Location: initial direct CLI/config workflow.
  - Problem: inherited config/environment and broad CLI access could expose
    profiles, plugins, providers, unsafe actions, or weakened safeguards.
  - Impact: real state exposure or execution outside the intended local check.
  - Suggested fix: project-owned safe wrapper with explicit config, cleaned
    environment, security flags, and a command/option allowlist.
  - Resolution: Fixed and regression-tested, including mixed-case environment
    keys on case-insensitive platforms.
- Severity: Medium
  - Location: doctor/install/cleanup command handling.
  - Problem: quick doctor skipped live launch, pnpm's install delimiter was not
    accepted, and a failed close initially revoked cleanup ownership.
  - Impact: false diagnostics, broken documented setup, and orphan sessions.
  - Suggested fix: full offline doctor, normalize the documented argument shape,
    and retain ownership until successful close.
  - Resolution: Fixed with focused tests and live doctor evidence.
- Severity: Medium, accepted with rationale
  - Location: `agent-browser` 0.33.0 package metadata.
  - Problem: upstream declares pnpm 11 while Languon pins pnpm 10.13.1.
  - Impact: strict engine-policy consumers may warn despite working installation.
  - Suggested fix: use a metadata-compatible release or upgrade the repository.
  - Resolution: Accepted. The compatible older release failed containment;
    frozen lockfile, dependency install, managed Chrome install, CLI, doctor,
    wrapper, and live browser paths all pass with pinned pnpm 10.13.1.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Existing package/application boundaries are unchanged.
- [x] Wrapper unit tests and live browser regressions cover the material safety
      and command surface.
- [x] User-flow guides are correctly not applicable to internal tooling.
- [x] Playwright remains installed and reserved for committed E2E tests.
- [x] No debugging artifacts or accidental product changes remain.

## Final verdict

Approved. Final implementation, tester, and security closure passes found no
Critical, High, Medium, or other material open issue. Residual host-level
containment, same-user process, crash-artifact, native supply-chain, and package
metadata risks are accurately documented.
