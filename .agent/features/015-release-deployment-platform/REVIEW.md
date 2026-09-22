# Independent review: Release and deployment platform

Reviewed: 2026-08-18
Reviewers: independent correctness/test reviewer and security reviewer
Verdict: Approved

## Scope reviewed

- [FEATURE.md](./FEATURE.md) and [EXEC_PLAN.md](./EXEC_PLAN.md)
- Accepted [ADR-0009](../../../docs/adr/0009-release-and-deployment-platform.md)
- Complete implementation diff, production topology, workflows, deployment
  state machine, backup/restore, profiler, runbooks, and user-flow coverage
- Automated, real-Docker, browser, database, and resource evidence recorded in
  [EVIDENCE.md](./EVIDENCE.md)

## Findings and remediation

The reviews found and verified fixes for material issues before approval:

- Deployment rollback no longer invokes an older migrator. Post-commit cleanup
  or audit failures cannot switch traffic away from or stop the committed slot,
  and rollback tests prove restoration of the previous distinct image digests.
- Deployment serialization uses crash-safe OS file locks (`lockf` on macOS,
  `flock` on Linux), token-checked ownership, and release ordering that prevents
  stale recovery and handoff races. Cross-process contention tests admit exactly
  one owner.
- Migration compatibility is bound to the exact checked-in migration content;
  contract migrations cannot be mislabeled as deploy-safe expand changes.
- Production promotion compares the release asset with the canonical artifact
  from the claimed successful run, verifies attestation, and enforces the
  repository GHCR image prefix.
- Production PostgreSQL, Redis, and backup/restore paths fail closed on verified
  TLS. Redis uses a named restricted ACL that permits the real rate-limiter Lua
  command set without broad administrative commands; a real Redis 8 TLS journey
  passed.
- Deployment configuration, admin binding, data-network isolation, readiness
  exposure, Tailscale tags, local-Docker guards, and secret-file permissions were
  hardened and regression-tested.
- Resource profiling now measures builds, full runtime topology, dependency-aware
  load, and blue/green overlap in isolated projects while refusing remote Docker
  contexts.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] ADR-0009 is accepted and architecture documentation matches it.
- [x] Application/package and frontend boundaries are preserved.
- [x] Unit, integration, contract, E2E, browser, database, and real-Docker tests
      cover the material regression surface.
- [x] User-flow guide and mapped system E2E markers match implemented behavior.
- [x] Secrets, private networking, proxy trust, data exposure, artifact trust,
      backups, and audit redaction passed security review.
- [x] No material debugging artifacts, generated output, accidental scope, or
      unresolved critical/high/medium finding remains.

## Residual launch checks

External-account behavior cannot be proven locally. Before launch, verify GitHub
environment/branch protections, real GHCR attestations, Tailscale ACL ownership,
SSH host identity, Timeweb firewall/private routing, DNS/ACME renewal, monitoring
delivery, image vulnerability scanning, real PostgreSQL certificate SAN/CA
installation, and an off-host S3 restore drill. Record the first clean comparable
resource profile; the current warm dirty-worktree profile is sizing evidence, not
production telemetry. Linux `flock` is contract-tested but was not executed on
this macOS host.

## Final verdict

Approved. No remaining material implementation, correctness, accessibility,
architecture, security, or test finding blocks completion. The external items
above are explicit provisioning/launch gates, not unfinished repository work.
