# Improvement: Dictionary card authoring articles and gender

Status: Complete
Created: 2026-09-30
Updated: 2026-09-30

## Routing decision

- Intended outcome: inline AI card authoring returns natural articles or compact
  grammatical-gender markers whenever required to expose noun gender, and repairs
  missing determiners inside phrases instead of treating every input as an
  isolated lemma.
- Why this is an improvement rather than a correction: it deliberately improves
  generation quality within the established card-authoring flow rather than
  restoring one previously specified output.
- Explicit-feature check: the user requested an improvement, not a feature or
  the full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public
  contract, persistence, security/auth policy, production dependency,
  deployment, migration, or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit
  feature authorization before crossing a feature boundary.

## Context and scope

- Current behavior at discovery: the local card-authoring prompt asked for an
  article only when the model decided it helped and also allowed a conventional
  bare lemma, so French `parasol` could remain `parasol`. It did not make gender
  signaling mandatory for isolated count nouns.
- Expected behavior: isolated count nouns and noun phrases in languages such as
  French and Spanish must expose gender through their natural article; a concise
  `(m)` or `(f)` marker is required when the article is absent or ambiguous.
  Phrases and sentences retain their intended inflection and receive required
  determiners, such as `femme a mangé` becoming `la femme a mangé`.
- In scope: the checked-in `dictionary-card-authoring-agent` fallback prompt,
  its deterministic contract test, and a localized conditional card-form notice
  explaining the required Source-first review order.
- Out of scope: schema changes, UI fields, automatic gender metadata, changing
  persisted card structure, batch/import/document prompts, or asserting exact
  nondeterministic model wording.
- Likely files/surfaces: prompt source/tests and the web card-authoring hook,
  assistance component, localized messages, and focused component tests.
- Relevant ADRs or constraints: model output remains untrusted, structured,
  bounded, and review-only; no model tools or authority are added.
- Related user-flow guides: `docs/user-flows/dictionary-platform.md`; its inline
  authoring review guidance and mapped E2E scenario are updated.
- Rollback/removal path: revert the prompt clauses and their focused string
  assertions; no stored data migration or cleanup is required.

## Acceptance criteria

- AC-1 — Source normalization distinguishes isolated lexical entries from
  phrases/sentences and repairs required determiners without destroying the
  intended phrase structure or tense.
- AC-2 — Source and translation suggestions require a natural article for
  isolated count nouns when the language uses one.
- AC-3 — The prompt requires conventional compact `(m)`/`(f)` markers when an
  article is absent or does not clearly identify gender, without forcing
  articles onto proper nouns, mass nouns, or contexts where they are unnatural.
- AC-4 — Existing semantic-context, requested-field, bounded-output, and
  review-only constraints remain intact.
- AC-5 — While a normalized Source suggestion blocks dependent suggestions, a
  prominent localized notice explains that those suggestions use the proposed
  Source and that the user must accept or reject Source first; the notice
  disappears after either decision.
- AC-6 — For an isolated count noun in a language with grammatical gender, the
  generated Source or Translation must expose gender through its natural article
  (and a conventional compact gender marker when the article is ambiguous). A
  bare noun is not considered already suitable; French `parasol` normalizes to
  `le parasol`, never `la parasol` or bare `parasol`.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add focused prompt-contract assertions for word and phrase behavior.
- [x] Update the canonical local card-authoring prompt.
- [x] Run prompt package tests and affected static/build checks.
- [x] Confirm documentation and user-flow traceability remain accurate.
- [x] Review the final diff and record evidence.
- [x] Add the conditional Source-review notice and four-locale copy.
- [x] Add focused component coverage for its visible lifecycle.
- [x] Run affected web tests, static/build checks, and browser verification.
- [x] Refresh final review and evidence for the expanded improvement.
- [x] Add a regression assertion for mandatory gender signaling and `le parasol`.
- [x] Tighten the prompt so the rule cannot be treated as optional.
- [x] Rerun prompt and backend authoring checks, then refresh final evidence.

## Verification

| Check                    | Result                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Tests                    | Pass: prompts 5/5; backend 87 files / 615 tests; web 32 files / 246 tests               |
| Lint/typecheck/build     | Pass: prompts and web lint/typecheck/build; backend typecheck                           |
| Runtime/browser/database | Pass: focused Chromium inline-authoring journey against disposable PostgreSQL and Redis |
| Documentation/user-flow  | Pass: guide validation and `dictionary-platform` mapped revision check                  |

## Outcome and evidence

- Changes made: expanded the canonical inline card-authoring instruction so
  isolated count nouns must expose grammatical gender through a natural article
  or, when the article is absent or ambiguous, a conventional gender marker.
  The prompt explicitly says that a bare isolated count noun is not already
  suitable and that French `parasol` must become `le parasol`. Phrases and
  sentences preserve structure and tense and repair missing required
  determiners. The rule applies to requested Source and Translation values and
  explicitly avoids forcing annotations where unnatural.
  Added a prominent warning immediately after Source whenever a proposed Source
  blocks dependent suggestions. It explains that other suggestions were based
  on the proposal, requires accepting or rejecting Source first, and clarifies
  that rejection removes dependent suggestions. The warning disappears after
  either decision and is localized in English, Russian, French, and Spanish.
- Commands and results:
    - Regression-first `pnpm --filter @languon/prompts test` failed on the new
      article/gender and phrase assertions before the prompt change, then passed
      1 file / 5 tests afterward.
    - A second regression-first prompt run failed specifically on the mandatory
      gender-signal and `le parasol` assertions, then passed 1 file / 5 tests
      after the prompt was tightened.
    - `pnpm --filter @languon/prompts lint`, `typecheck`, and `build` — pass.
    - Backend tests — pass, 87 files / 615 tests with 21 files / 173 tests
      skipped; backend typecheck — pass. The intended file argument was forwarded
      through the package script but Vitest selected the complete backend suite,
      so this is broader evidence than the planned focused adapter run.
    - Regression-first focused web component tests failed before the notice was
      implemented, then passed for both Source acceptance and rejection; the
      full web suite passed 32 files / 246 tests.
    - Web lint, typecheck, and production build — pass.
    - Focused Chromium E2E journey — pass, including visible notice, blocked
      dependent action, Source acceptance, notice removal, and enabled action.
      The first runs identified and corrected an ambiguous test selector and an
      outdated deterministic expectation; neither was a runtime product defect.
    - Prettier, `pnpm docs:user-flows:check`,
      `pnpm user-flow:e2e -- check dictionary-platform`, and `git diff --check` —
      pass.
    - Tested source hashes: prompt
      `1d9d15e5284c7a02062af24ba60fcc165e80eb3dcf753bb96157af263d3cde8e`;
      prompt contract test
      `455e256a76b690d847b0bd088e1b42eb1200286f53b1a1aa860a6fea0386aab0`,
      based on `63c31a2`.
- Documentation: updated the dictionary-platform inline-authoring review step
  and E2E coverage description; the guide and revision marker are synchronized.
- Review: final scoped review found no material findings. The new clauses retain
  untrusted-input treatment, requested-field isolation, bounded structured
  output, tool prohibition, and review-before-save behavior. The mandatory rule
  is limited to isolated count nouns and noun phrases, and does not override
  translation context or force articles onto verbs, proper nouns, mass nouns,
  or contexts where they are unnatural.
  The Source-review state is derived from the current proposal rather than
  persisted, so it cannot drift from the dependency state. The touched hook and
  form were already above the line-count threshold; extracting cohesive derived
  state or a one-use alert would scatter the authoring state machine or add a
  trivial wrapper, so they remain in place.

## Remaining risks

- Model output remains nondeterministic. Tests establish that the instruction is
  present and reaches the backend agent, not that every provider will choose the
  same article or gender notation on every request.
- No live provider call was made; repository policy keeps tests deterministic
  and avoids paid model requests.
- The mapped browser journey was not rerun for the final prompt-only tightening:
  its deterministic provider cannot establish live-model adherence, while the
  prompt contract directly verifies the changed instruction. The prior focused
  Chromium evidence remains valid for the unchanged Source-review UI.
