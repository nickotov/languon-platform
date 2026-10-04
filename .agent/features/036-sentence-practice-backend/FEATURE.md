# Feature: Sentence translation practice backend

## Metadata

- Feature ID: 036-sentence-practice-backend
- Feature slug: sentence-practice-backend
- Status: Complete
- Owner: Engineering
- Created: 2026-10-04
- Updated: 2026-10-04

## Summary

Provide authenticated sentence translation practice for owned and live-authorized
shared dictionaries. Keep every successful generation available additively, offer
saved-first/new-only/review-only behavior, offer free reference review and default
AI checking with strict target
vocabulary feedback, and preserve personal attempts and versioned entry coverage.
This scope delivers backend contracts, persistence, AI/worker execution and safe
credit/capacity/deletion integration. Frontend implementation waits for the returned
Magic Patterns designs.

## Source and authority

User explicitly authorized implementation of the approved backend-first feature.
[Canonical detailed plan](../../../docs/sentence-practice-implementation-plan.md)
and its frozen implementation refinements are authoritative. BL-004, BL-005 and the
sentence slice of BL-003 are linked there. Model preference backend035 was verified
and squash-merged into local main as `bcfda16`; this feature branches from it.

## Acceptance criteria

- [ ] AC-1: Strict public sentence contracts and isolated capabilities preserve
      existing flashcard clients; authenticated owner/shared operations prepare, Next,
      job read/cancel, check, attempts and progress enforce live authority.
- [ ] AC-2: Saved-first uses current unchecked saved exercises before generating;
      new-only always admits fresh generation; review-only never generates. Successful
      generations are additive. Creator-owner exercises are shared; reader exercises
      and every learner's attempts/coverage are private. Every Next/check operation is
      replay-safe and conflicting payloads fail without new jobs or charges.
- [ ] AC-3: Generation creates simple complete source sentences with1–3 admitted
      targets, correct direction, normalized lexical hints and exact source highlight
      segments. Helpers have no hint; phrases and repeated occurrences remain coherent.
      Public exercises never expose reference answers, private provenance or snapshots.
- [ ] AC-4: Check preserves the exact submitted answer, explanation language and
      revealed hints. Semantic/grammar/target feedback and grapheme-safe UTF16 issue
      spans validate before publication. Missing required targets cap79; substantive
      issues cap99; ratings follow approved ranges. Hints do not reduce score. Any
      successful check completes an exercise for that learner regardless of grade.
- [ ] AC-4a: Generate a valid reference translation together with sentence/hints.
      Explicit Show reference answer uses stored content, requires live access/current
      versions, works with zero credits and unavailable AI, and never resolves a model,
      calls a provider or reserves credits. Idempotently record a private manual review;
      Saved first treats it as completed. Reference is one valid translation, with no
      exact-match pass/fail, percentage or quality rating. Never auto-reveal on AI failure.
- [ ] AC-4b: Keep AI scores/ratings separate from manual-review totals/history.
      Reveal preserves the user's draft and has no extra exposure/coverage increment.
      A subsequent AI check can identify reference assistance separately from hints,
      with no extra score penalty. Live access, retirement, deletion and purge cover
      reference translations and personal manual-review records.
- [ ] AC-5: First successful generation/save or first saved exposure increments
      persistent current entry/version/direction coverage once. Reuse never double
      counts; entry changes retire practice while authorized history remains. Unchanged
      A coverage survives retirement/deletion of an A+B exercise due to B.
- [ ] AC-6: Typed sentence jobs pin model/budget/rates at admission, share existing
      credits and combined global/provider capacity with dictionary work, and execute
      in existing bounded worker slots. Exact learning formats/selection/settlement
      capabilities and database guards fail closed for older workers. All worker writes
      are fenced; dispatch/publication recheck live access and entry versions.
- [ ] AC-7: Permanent entry/dictionary/account deletion erases complete derived
      exercises/answers and all copied candidate job input, including foreign learner
      work. Unsettled work is quiesced/cancelled first. Settled content-free credit and
      usage accounting remains valid after content erasure; account purge erases the
      account's accounting under the established policy. Share rotation/archive
      immediately denies access; unchanged restoration can reuse valid content.
- [ ] AC-8: Relevant unit/contract/disposable database/API+worker/legacy regression,
      static/build/migration/guide checks pass, independent tester and completion/
      security reviews pass, and evidence/backlog documentation reflect reality.
- [ ] AC-9: After BOTH backend scopes are verified, create TWO versioned detailed
      Magic Patterns prompts in docs and design handoff records, covering all states
      and modes without concrete API paths in copyable prompt blocks. Stop frontend
      delivery and wait for the user's returned designs.

## Scope exclusions

No frontend, native mobile UI, profile picker, billing/grant/provider replacement,
new unbounded worker fleet, generic universal AI job registry, hint scoring penalty,
mastery algorithm, or regeneration deletion/reset. No paid nondeterministic test
calls. Fullscreen/dialog is a future frontend acceptance requirement and must be
fully represented in the final design prompt rather than simulated by backend.

## Architectural constraints and verification

Read accepted ADR0011/0012/0019/0021/0022/0023/0024/0026 and related architecture.
Learning owns sentence business work; shared text-AI owns selection/infrastructure;
credits own typed settlement; root composition connects infrastructure participants.
New persistence/credit/capacity/deletion rules require real disposable database
proof, separate tester and independent correctness/security reviews. Existing
legacy flashcard/provider/credit journeys remain regression constraints.

## User-flow guide

Create a backend-only sentence API/worker guide with stable mapped scenario IDs and
safe explicit disposable-target runner; update related learning/credit guides only
when their observed commands or behavior changes. Feature035 guides remain valid.

## Evidence and review

See EXEC_PLAN.md, EVIDENCE.md and REVIEW.md. This feature is not complete until the
backend evidence and the design-prompt checkpoint are fulfilled.

## Approved adjustment (2026-10-04)

The user confirmed that explicit reference reveal is free and counts as manually
reviewed for Saved first, separately from AI scores. AI checking stays the default.
Future Jev investigation is a separate possible assessment direction; no Jev
integration, pricing or probability-to-quality-score mapping is authorized here.

## Verified backend completion

Backend acceptance, real infrastructure evidence and independent completion/security
reviews are complete. Two versioned design prompts are saved and linked from the
canonical plan/backlogs. See [DESIGN.md](./DESIGN.md) and prerequisite
[035 handoff](../035-user-ai-model-preferences-backend/DESIGN.md). Frontend integration
is deliberately outside this backend feature and awaits a returned selected design.
Production enablement/deployment was not performed.
