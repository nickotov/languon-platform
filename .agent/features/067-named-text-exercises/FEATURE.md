# Named text exercises

Status: Complete
Completed: 2026-11-14
Created: 2026-11-13
Owner: Engineering

## Goal and authorization

User approved moving past the playground checkpoint and starting Feature 2 from
E1, step by step, on 2026-11-13. Implement the 19 priority activities in the
[roadmap](../../../docs/named-exercises-implementation-plan.md), using the
[survey](../../../docs/surveys/language-learning-exercise-catalog.md) as pedagogy.
Feature065 is complete. Feature3, answer-aware chat UI and audio remain separate.
This record owns the full outcome. The user subsequently authorized all remaining
stages, separate stage commits and notification after final completion.

## Acceptance criteria

- AC-1 — Exactly the 19 priority activity IDs have stable versioned SDK-independent display metadata: localized name/description/example, supported pedagogical sources, format and fixed checking policy. Clients receive no authoring prompts.
- AC-2 — Named exercise contracts require objective, valid catalog identity/version, format-compatible key or rubric and bounded provenance. Preserve genuine Custom authoring. Named identity cannot silently disappear through editing, copying, publication or projection. Server semantic revisions include meaningful source/objective/key/rubric changes.
- AC-3 — Backend definitions specify inputs, constraints, explanations and rejection cases for all activities. Dedicated Studio tools fix activity identity; the tutor keeps its compact high-level capability. Only selected definitions enter authoring; measure context and calls.
- AC-4 — Explicit allocations/count/order, automatic eligibility and default five questions work. Contradictions require clarification; missing sources are reported without substitution. Exact sources and server-owned task-output dependencies are preserved and validated.
- AC-5 — Existing five-provider-call/two-memory-call/output/deadline/proposal limits and bounded repair remain. Reserve dependent capacity and publish one complete proposal atomically. Review, Insert and Save remain explicit.
- AC-6 — Prepared matching is model-free; constrained misses are incorrect, hybrid misses unchecked, rubric responses await explicit Check with AI. Support correct/partially-correct/incorrect/unchecked/unable-to-assess independently of job state; partial/unassessed outcomes are not correct progress. NFC/whitespace normalization preserves case, accents, punctuation and script.
- AC-7 — Source contexts/chat expose a localized picker with source, automatic/named choice, count/language/difficulty, examples and checking labels. Existing three renderers show names/feedback. Preserve manual edits, Custom conversion, copies, anonymous prepared practice and private signed-in attempts.
- AC-8 — Relevant deterministic contract/generation/checking/production-composition/persistence/E2E proof, desktop/narrow browser, current guides and independent completion/security reviews pass. Preserve historical answered snapshots, revocation/deletion and reader privacy. Distinguish local readiness and live proof.

## Domain and staged integration

Activity is the pedagogical task; format is its answer interaction; an exercise
is independently answerable content; a set groups exercises without replacing
identity; checking policy determines prepared versus explicit AI checking.

The active LearningBlockSchema accepts optional named semantics. All current
writers, manual editing, AI revisions, proposal insertion and copy paths preserve
stable activity identity and valid answer/source references. Absence of semantics
is deliberate Custom content; changing substantive named content requires explicit
conversion. Historical proposal/selection provenance remains frozen; local source
references remain authorized and remap on independent copies. ADR-0058 records
the durable provenance and contract decisions.

## Constraints and user flows

Follow ADR-0050/0052/0055/0058: published content is separate from private attempts,
source IDs grant no authority, shared readers cannot author originals, model
output is untrusted, and publication stays explicit. Source snapshots cannot embed
private attempts or feedback. Production still uses four high-level actor tools;
19 fixed-activity Studio tools use the same canonical generation/publication path.
No runtime dependency, provider/model, pricing, deployment or paid verification
change is included. The existing production contract-migration blocker remains.

Updated executable guides: interactive-workbooks, knowledge-workspace and
mastra-agent-development-harness; admin-ai-catalog retains its current journey and
asserts the additional read-only definitions. The picker extends approved desktop
side-panel/mobile-sheet patterns; isolated stories cover its presentation and
feedback. UI direction follows ADR-0054.

## Open decisions and limits

No unresolved product or architectural choices. All selected runtime/build gates
and independent completion/security reviews pass. EVIDENCE and REVIEW retain the
exact outcomes and operational limits. Pedagogical correctness beyond strict
artifact/source constraints needs live-model evaluation; deterministic adapters
do not establish production-provider language quality. Local doctor/live proof
are recorded separately from implementation verification.
