# Independent review: Web Development Port 3333

Reviewed: 2026-08-14
Reviewer: Independent reviewer, tester, and security reviewer
Verdict: Pass

## Scope reviewed

- `FEATURE.md`
- `EXEC_PLAN.md`
- Implementation diff
- Tests and validation evidence

## Findings

### Development services exposed to the LAN

- Severity: Medium
- Location: `apps/backend/src/index.ts`, `apps/web/package.json`,
  `apps/admin/package.json`, and `compose.yaml`
- Problem: Host processes and every Compose publication listened on all
  interfaces while development authentication uses public placeholder secrets
  and fixed code `0000`; direct clients can forge browser `Origin` headers.
- Impact: A LAN peer could access development PostgreSQL/Redis/backend, alter
  local data or sessions, and reset a known development account with code `0000`.
- Suggested fix: bind host processes and Compose publications to loopback by
  default, with container-only internal listeners and a warned explicit app LAN
  opt-in.
- Resolution: Fixed. Runtime listener checks, default/opt-in Compose renders, E2E,
  and final security re-review confirm the boundary.

### Infrastructure exposure override contradicted the safety guarantee

- Severity: Medium
- Location: `compose.yaml` PostgreSQL and Redis port publications
- Problem: an undocumented infrastructure bind-host override could still expose
  PostgreSQL with public local credentials and unauthenticated Redis.
- Impact: An operator could bypass the documented loopback-only data guarantee.
- Suggested fix: hardcode database/cache host publication to `127.0.0.1` while
  keeping the explicit application-only LAN opt-in.
- Resolution: Fixed. Both default and app-LAN renders retain PostgreSQL/Redis on
  loopback; tester and security re-reviews passed.

No Critical or High findings were identified. The independent correctness
reviewer found no additional material issues after remediation.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] Required user-flow guides match current behavior, commands, and expected
      outcomes, or `FEATURE.md` records a valid not-applicable reason.
- [x] Current guides map proportional critical scenarios to real E2E tests;
      scenario/revision markers, execution evidence, and assertions agree.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Pass. Final independent correctness, tester, and focused security re-reviews
found no remaining material findings. The only operational migration note is
that existing ignored `.env.local` files and already-running Compose services
must be updated/recreated to adopt the new origin and binding defaults.
