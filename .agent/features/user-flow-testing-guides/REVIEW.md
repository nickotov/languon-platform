# Independent review: User Flow Testing Guides

Reviewed: 2026-08-13
Reviewer: Huygens (`user_flow_docs_review`)
Verdict: Pass — no remaining Critical, High, or Medium findings

## Scope reviewed

- Root agent/feature-development instructions, feature templates, and plan
  conventions.
- Guide schema/index, dependency-free validator and tests, root command/docs
  integration, and the complete authentication guide.
- Authentication source/routes/contracts/UI/E2E alignment and recorded
  validation evidence.

## Findings

### Predictable sensitive temporary files

- Severity: Medium
- Location: `docs/user-flows/user-authentication.md`, API examples and cleanup.
- Problem: access-token JSON and the refresh-cookie jar used predictable `/tmp`
  paths that ordinary `curl` creation could expose under a permissive umask or
  collide with a symlink/another run.
- Impact: another local user could read credentials or redirect output.
- Suggested fix: create a unique directory with `mktemp`, set `umask 077`, and
  remove only exact created files.
- Resolution: Fixed. Every response/cookie path is inside an exported unique
  `LANGUON_TEMP_DIR`; the guide sets `umask 077` and performs exact cleanup.

### Validator structural false positives

- Severity: Medium
- Location: `scripts/check-user-flow-guides.mjs` and its tests.
- Problem: empty list entries/required sections and an index link appearing only
  in a fenced example could pass validation.
- Impact: `pnpm check` could accept incomplete or effectively unindexed guides.
- Suggested fix: require trimmed list/section content, parse real headings and
  index links outside fenced blocks, and add regressions.
- Resolution: Fixed. Seven focused tests now include all three regressions;
  heading/index parsing ignores fenced Markdown where appropriate.

### Incomplete authentication impact metadata

- Severity: Medium
- Location: `docs/user-flows/user-authentication.md` frontmatter.
- Problem: root/web package commands, Playwright/E2E configuration, API client,
  and backend app composition were omitted from `source_paths`.
- Impact: later changes to those files could fail guide discovery and leave its
  commands or behavior stale.
- Suggested fix: add the concrete governing files and E2E directory.
- Resolution: Fixed. Frontmatter now includes root/backend/web package files,
  backend app composition, Playwright configuration/E2E files, and auth API
  client.

### E2E recipe did not provision dependencies

- Severity: Medium
- Location: authentication guide and `apps/web/tests/e2e/README.md`.
- Problem: the command assumed PostgreSQL/Redis already existed on nonstandard
  ports, while Playwright starts only migrations and app processes.
- Impact: a developer following the documented flow from startup could not run
  it without reconstructing credentials and service provisioning.
- Suggested fix: provide safe disposable service startup/cleanup or a dedicated
  provisioning script.
- Resolution: Fixed. Both documents contain the same bounded, loopback-only
  `--rm` Docker recipe with readiness waits, dedicated app ports, and an exit
  trap. The exact corrected block passed all 3 Playwright journeys and cleanup
  was verified.

## Acceptance-criteria audit

- [x] Every criterion is implemented and evidenced.

## Architecture and test audit

- [x] Applicable architecture boundaries are preserved.
- [x] Tests cover the material regression surface.
- [x] No debugging artifacts or accidental scope changes remain.

## Final verdict

Pass. Four Medium findings were remediated, and focused re-review found no
remaining Critical, High, or Medium issues. The exact final E2E recipe and full
repository check pass.

The original re-review's two Low observations—a guide link inside an HTML
comment/inline-code span and a persistent `umask 077`—were subsequently fixed
with validator regressions and explicit umask restoration.

## Security review

- Reviewer: `user_flow_docs_security`
- Initial finding: Medium — unconditional `cp .env.example .env.local` could
  overwrite ignored local credentials/configuration before the prose warning.
- Resolution: Fixed with a create-only guard that treats existing files and
  symlinks as owned configuration; users compare/edit existing files
  deliberately.
- Defense in depth: empty fenced/comment-only required sections and index links
  in HTML comments/inline code are now rejected; regressions pass.
- Final verdict: zero Critical, High, or Medium findings. Residual low local
  Docker image-tag trust and container-name reuse races are documented in
  `EVIDENCE.md`.
