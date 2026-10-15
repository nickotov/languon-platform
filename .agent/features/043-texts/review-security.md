# Texts backend initial security review

Reviewed: 2026-10-15
Mode: Initial
Reviewer: Independent GPT-6.1 Sol security reviewer
Verdict: SEC-TEXTS-01 fixed after focused remediation review; no open independent security finding. Overall backend completion still depends on the separate correctness review and final checks.

## Reviewed state and boundary

- Base/HEAD: `664198fee9eb1a0492134c43de9a9d04835568af` on `feature/texts`; staged/unstaged and untracked backend implementation captured in `backend-preflight.sha256`.
- Manifest SHA-256: `5ccef582fc5694726002a547e386b048737afe3dd355f596ab49eb7eb6480b37`.
- Read FEATURE, EXEC_PLAN, EVIDENCE, repository/app/package instructions, review/search skills, ADR-0034 and related shared execution/credit ADRs. Scope includes typed Texts content and AI, contextual dictionary publication, contracts/prompts, migrations 0063–0067, execution/admission/capacity/accounting, worker composition, purge and SQL grants. Frontend excluded per backend checkpoint scope.
- Static independent audit; previously recorded PostgreSQL/Redis/API/role integration evidence assessed, not independently rerun. No paid model calls or destructive operations performed.
- Concurrent remediation has begun after the initial capture. This report does not approve subsequent changes; follow-up review must identify its own captured state. Manifest verification already shows the expected concurrent ADR rename/reference changes.

## SEC-TEXTS-01 — Medium — Foreign text existence/version oracle before authority validation

- Location: `apps/backend/src/modules/texts/infrastructure/persistence/drizzle/text-source-resolver.ts:61` (initial snapshot).
- Scenario: A signed-in caller supplies a known foreign text UUID as an `owned-text` selection source, without any owner/share authority. If `expectedTextVersion` differs from the current stored version, `resolveTextSource` throws `version_conflict` before checking `text.ownerId` or validating the share capability. The selection HTTP handler exposes this as 409. Supplying the matching version reaches the missing-authority check and produces 404 instead. Invalid/revoked share capabilities have the same ordering issue.
- Impact: A former share recipient or other caller possessing a text UUID can distinguish an active private resource from an absent/archived one and determine version changes after access is revoked. This violates the non-enumerating unavailable projection across the tenant/share boundary. It does not disclose text content.
- Suggested fix: Validate owner/share authority before comparing the supplied version. Preserve 409 for an authorized stale source and return indistinguishable 404 for unauthorized sources regardless of their supplied/current version. Cover foreign owned-text requests, bad/revoked share keys and authorized stale requests with regressions.
- Evidence: `resolveTextSource` initial lines 60–65 compare the version; lines 71–90 perform owner/share authorization. `text-selection.routes.ts` maps `TextDomainError('version_conflict')` to 409 and unavailable to 404.
- Disposition: Fixed after focused remediation review (below).

## Other security checks

- Owner/session checks and capability verification gate direct content reads/copies; source authority is rechecked transactionally before dispatch/publication, including revocation/version/lifecycle changes.
- Share secrets use domain-separated HMACs and opaque locators. Raw keys are not stored or included in public projections. Shared reads exclude drafts and enforce active source owner/folder/text.
- Model calls have no tools, use validated structured output, bounded token/attempt budgets, abort/lease fencing and hidden tracing input/output. Selection publication fixes source/target fields and admits only validated generated fields. Complete occurrence context is transient job payload and is cleared on terminal/purge paths; durable semantic context remains distinct.
- Credit reservation/settlement, capacity release and publication/terminal state occur in transactions with shared owner/capacity serialization. Migration 0064 enforces typed execution/credit binding, immutable execution fields and attempt fences; worker role grants omit provider secrets, model pricing writes and user status writes.
- Purge preparation fences active work and includes foreign-source selection jobs; post-dispatch failure settles conservatively and terminal payloads are redacted. Runtime role integration evidence exercises foreign sharing, publication and denied privilege probes.
- Global wildcard route middleware leakage was independently noticed and sent to the root; correctness review confirmed it as CR02/CR03 and owns its remediation. It is not duplicated here.

## Completion boundary

No additional material security finding confirmed in the initial backend checkpoint. A remediation review must verify SEC-TEXTS-01 and the full-composition middleware changes, plus their focused regressions, against a fresh manifest. This backend security checkpoint does not represent whole-feature completion or frontend acceptance.

## Focused remediation review — SEC-TEXTS-01

- Reviewed the final resolver and database regression additions independently after the content owner repair. Both initial resolution and retained-authority revalidation now finish ownership/share checks before comparing text version. Owner/folder/text/share lock order and capability binding checks remain intact.
- New integration cases cover both text and folder shares: foreign owned-text stale/current versions, wrong keys, forged retained authority, authorized stale owner/share access, valid retained authority after edits, and revoked stale/current/retained access. The root reports the focused real PostgreSQL suite passed 11/11; test bodies were independently inspected, execution was not duplicated.
- Reviewed resolver SHA-256: `616a85e25469472740c041c8322be2c022c4e2994a69055e6a1fa59833b6a208`.
- Reviewed `tests/integration/modules/texts/infrastructure/text-content-store.test.ts` SHA-256: `947a0076eecb00bb0be3b2e18442f9c288135fc43b78cd9f5945d44bee58ea81`.
- SEC-TEXTS-01 is closed. No new security issue found within this focused repair. CR02/CR03 middleware remediation remains assigned to the separate correctness reviewer; this security follow-up does not approve an unseen final whole-backend snapshot.
