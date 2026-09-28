# Review: Dictionary Translation Context

Reviewed: 2026-09-29
Reviewer: Independent completion reviewer, tester, and security reviewer
Verdict: Approved after remediation

## Review boundary

- Initial mode covered the complete working-tree change against base
  `afa3f9eaccdff42f6d474a2548b847f0436f494f`, including untracked feature,
  migration, backend, test, documentation, and web files.
- Remediation mode covered R-032-01–R-032-04 and affected callers/invariants.
  The reviewer identified the final tracked patch as
  `d6adb3965e803d8cf04f6dbafb7d00856c20e0e7a4478b824fb775907c2caffc`
  plus relevant untracked files.
- Inputs: AC-1–AC-9, ADR-0011/0012/0016 constraints, dictionary-platform guide,
  complete diff, and E-1–E-7.
- Separate tester reviewed cross-application, migration, current/legacy format,
  privacy, and evidence adequacy. A separate security reviewer covered owner
  scoping, SQL/persistence, public omission, model input, prompt injection,
  redaction, validation, stale acceptance, and idempotency.

## Findings

### R-032-01 — Production import/document provider context omission

- Severity: High.
- Location: import-pairs proposal generator and document generation processor.
- Problem: v2 persistent context was dropped immediately before the production
  model call for import enrichment and document generation.
- Disposition: Fixed. Import messages include context; document v2 maps to a v2
  pasted-term provider request with context while v1 keeps its exact legacy
  shape. Focused provider/processor and DB snapshot tests passed (E-2, E-3).

### R-032-02 — Retained v2 update target lost on regeneration

- Severity: High.
- Location: dictionary generation service authoring regeneration.
- Problem: only v3 preserved `prior.target`; a v2 update successor could default
  to create and duplicate a card.
- Disposition: Fixed. Every non-v1 authoring format preserves its target; a
  focused service regression passed (E-2).

### R-032-03 — Retained v1 job mapping/redaction regression

- Severity: High.
- Location: Drizzle generation-store job mapping and completion.
- Problem: active v1 single-card jobs lost required snapshots and instructions
  were not redacted; retained batch jobs were reported as current formats.
- Disposition: Fixed. Mapping preserves persisted formats, all single-card
  formats retain active snapshots, and review completion redacts instructions.
  Disposable PostgreSQL v1 lifecycle/format tests passed (E-3).

### R-032-04 — Whitespace caused false stale context

- Severity: Medium.
- Location: web card-authoring staleness comparison.
- Problem: normalized server context was compared with untrimmed local text, so
  valid suggestions could disappear.
- Disposition: Fixed. Effective local context is trim/null-normalized before
  comparison; focused web regression and full web suite passed (E-4).

### T-032-01 — Positive durable context evidence gap

- Severity: High (verification).
- Problem: original DB/E2E evidence mostly exercised current formats with null
  context and did not prove v3 binding or import/document propagation.
- Disposition: Fixed. Added positive v3 inherited/override lifecycle,
  acceptance/revision/redaction/conflict, pasted/import/document separation,
  provider-boundary, retained v1, and inherited-context E2E coverage. Tester
  independently confirmed the gap closed (E-2–E-5).

### S-032-01 — Security review

- Severity: No remaining material finding.
- Disposition: Approved. Context remains owner-scoped, omitted from public
  reads/forks/exports, bounded and control-safe, bound to versions/fingerprints,
  hidden from traces/logs, and removed from terminal payloads. Model-provider
  retention and possible paraphrase into owner-accepted generated fields remain
  deployment/product residual risks rather than defects in this change.

## Completion audit

- AC-1–AC-9 are mapped to final evidence and independently reviewed.
- Current and retained formats, prompt/provider boundaries, database invariants,
  public privacy, terminal redaction, localization, accessibility, and
  responsive behavior were assessed.
- Guide mapping and exact mapped Playwright file are current and executed.
- No critical/high or material security findings remain.
- No secrets or temporary browser/database resources remain.

## Remediation and final verdict

All four correctness findings and the tester evidence gap were repaired in one
batched remediation. Focused checks invalidated by those repairs were rerun, then
the affected backend/web suites, builds, database suites, migration suite, guide
checks, and mapped E2E passed.

Final verdict: approved. Residual limitations are the guarded MinIO document
browser journey and absence of a populated pre-0035 upgrade fixture; processor,
provider, clean migration, retained-format, and disposable database coverage
make both non-blocking.
