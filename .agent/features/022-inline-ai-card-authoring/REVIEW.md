# Independent review: Inline AI Card Authoring

Reviewed: 2026-09-10

Reviewer: Independent reviewer and security reviewer

Verdict: Approved

## Scope reviewed

- `FEATURE.md`, `EXEC_PLAN.md`, implementation diff, tests, and evidence
- Cardless authoring contracts, provider boundary, worker lifecycle, SQL
  acceptance, inline web state, rollout, migration, and user-flow mapping

## Findings and resolutions

- High — Regeneration could return missing or duplicate values and append no new
  choice. Fixed with bounded predecessor exclusions and exact one-distinct-value
  validation for every requested field.
- High — Discard IDs and values could be lost across repeated, alternating, or
  disabled/re-enabled successor fields. Fixed with idempotent IDs and bounded
  cumulative all-field history while provider projection remains requested-only.
- High — Migration 0018 initially made the legacy single-card acceptance shape
  invalid. Fixed by preserving its card identity on the job, strengthening the
  mutually exclusive accepted shapes, regenerating migration 0018, and adding a
  real-PostgreSQL legacy acceptance regression.
- Medium — Stale predecessor snapshots and post-provider completion conflicts
  could merge wrong-language content, retry paid work, or poison the provider
  circuit. Fixed with pre-admission snapshot/capacity checks and typed,
  nonretryable, non-provider conflict settlement.
- Medium — The provider received inactive and unrelated draft fields. Fixed with
  a minimal requested-field DTO; captured-message tests exclude identifiers,
  inactive values, and unrelated content.
- Medium — AI-assisted saves omitted duplicate warnings and manual saves could
  leave proposal content until expiry. Fixed with transactionally persisted
  duplicate results and zero-selection atomic human authoring acceptance that
  redacts proposal/input in the card-creation transaction.

## Acceptance and architecture audit

- [x] Every acceptance criterion is implemented and evidenced.
- [x] DDD, FSD, provider, persistence, and rollout boundaries are preserved.
- [x] Unit, contract, HTTP, worker, real PostgreSQL, mapped E2E, browser, and
      repository-wide checks cover the material regression surface.
- [x] The dictionary user-flow guide and mapped scenario match current behavior.
- [x] No debugging/generated artifacts, secrets, or accidental scope remain.

## Security verdict

Approved. Owner authorization, atomic SQL/fencing, HMAC replay fingerprints,
tool-free structured model execution, requested-field data minimization,
sanitized failures/logging, terminal redaction, and default-off rollout controls
were verified. Live provider activation remains gated by the documented privacy,
credential, budget, readiness, expand, and activate checks.

## Final verdict

Approved. No Critical, High, or material Medium finding remains.
