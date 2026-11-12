# Improvement: Homepage UX research

Status: Complete
Created: 2026-11-12
Updated: 2026-11-12

## Routing decision

- Outcome: decision-ready research on public and signed-in Languon home experiences, onboarding, motivation and future lessons/teacher use.
- Documentation-only improvement: synthesize existing product context and external evidence; no application implementation or new executable journey.
- User requested deep research, not feature delivery. Survey proposals do not authorize new capabilities, analytics collection, contracts, persistence, auth changes or architectural decisions.
- Apply survey, efficient-code-search and improvement-development skills; remain on current branch. User subsequently requested a local commit.

## Scope and acceptance

- AC-1: Source-linked evidence distinguishes academic findings, practitioner guidance, competitor claims and Languon-specific hypotheses.
- AC-2: Concrete public/new/returning/re-entry home and onboarding proposals respect existing contracts and separate current capabilities from future features.
- AC-3: Compare options, describe motivation/statistics and visual hierarchy, and give a bounded validation plan and open decisions.
- AC-4: Save indexed survey with factual metadata and valid repository links; scoped formatting and diff checks pass.
- Files: this record, `docs/surveys/homepage-onboarding-and-learning-motivation.md`, survey index.
- Existing constraints: ADR-0030 global shell; ADR-0024 self-assessed flashcards; ADR-0044 explicit portrait approval/use; ADR-0054 future design selection. No ADR changes.
- User-flow traceability: home/global shell, learner portrait, sidebar navigation, flashcard training, texts, Knowledge and interactive workbooks consulted; commands and behavior unchanged, so guide/mapping changes are inapplicable.
- Rollback: remove the survey and its index row; application unaffected.

## Discovery and verification strategy

- Read-only independent research delegated to learning-evidence, product-pattern and current-app agents under root AGENTS authorization. Root integrates conclusions.
- Research source and claim audit; current repository paths checked. No hands-on competitor or local app verification claimed.
- Final checks: `pnpm exec prettier --check` on the three changed Markdown files (estimated under 10 seconds); relative-link/frontmatter inspection and `git diff --check` (estimated under 10 seconds); scoped content/diff review (several minutes).
- No application tests/build/browser/DB checks: no runtime change. No code/security review triggers; independent research provides cross-checking, not implementation approval.

## Plan

- [x] Establish scope and inspect current home constraints.
- [x] Research primary learning evidence, UX guidance and official product patterns.
- [x] Synthesize recommendations, state model, wireframes and validation plan.
- [x] Validate documentation and inspect final scoped diff.

## Evidence and remaining risks

- Initial Git status clean on `main`.
- User confirmed independent adult language learners as the primary audience before final handoff; incorporated into the survey. Teacher workflows remain a future extension in the proposed direction.
- Research cannot establish Languon conversion lift or learning outcomes without user studies; some academic sources expose abstracts only.
- Saved the [survey](../../docs/surveys/homepage-onboarding-and-learning-motivation.md) and updated its compact index. AC-1–AC-3 are covered by the evidence/comparison tables, state-based layouts, onboarding/metrics proposals, capability boundaries and validation plan.
- AC-4: scoped Prettier check passed; a Python standard-library check resolved all 27 relative Markdown links across changed files and verified required survey metadata and source paths. `git diff --check` passed. Final patch consists only of this record, survey and index; application tests/build/browser/DB checks are inapplicable.
- Independent current-app reviewer found no material repository-alignment/readiness issues. External sources were researched by separate learning-evidence/product-pattern agents and root; this is not a claim of independent replication of their findings.
- The approximately 5,300-word report distinguishes proposals, source evidence, commercial/readiness uncertainties and source-access limits. No runtime implementation, published design, commit or external write occurred.

## Acceptance retrospective

- User requested committing the delivered research. Research/synthesis and documentation verification were completed; implementation, setup and application test execution were inapplicable. Separate phase timings were not measured.
- Native web access failed; the available search connector provided a working fallback. No escaped defect was evidenced. Retain source-access limitations alongside claims in future surveys.
