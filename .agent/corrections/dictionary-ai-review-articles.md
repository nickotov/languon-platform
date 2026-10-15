# Correction: Apply noun articles during AI card review

Status: Complete
Created: 2026-10-14
Updated: 2026-10-14

## Routing decision and scope

- Existing whole-card AI review should correct noun articles consistently with
  inline generation, including French `taf` → `le taf`.
- Bounded correction of established grammar behavior in two local prompts;
  no API/schema/provider/model/dependency or persisted policy changes.
- Scope: mandatory noun-entry article/gender rules in review and inline prompts,
  focused prompt regressions, applicable guide/evidence update.
- Exclusions: automatic rewriting of existing cards, forcing articles on all
  parts of speech/languages, provider calls, UI redesign or acceptance bypass.
- Escalate if new generation contract, content fields or journey is required.

## Context

- Prompts are local-only (`packages/prompts/src/index.ts`); the review agent
  consumes the local whole-card prompt directly.
- Review currently says only “add an article when appropriate”; inline generation
  excludes all mass nouns, which can omit the article for informal French work.
- Prior rule: `.agent/improvements/dictionary-card-authoring-articles-and-gender.md`.
- Related guide: `docs/user-flows/dictionary-platform.md`, single-card proposal
  and field-generation guidance. ADR-0012 preserves explicit proposal acceptance.
- No architecture change or backlog task. Preserve prior local configuration
  and dev-panel work.

## Acceptance criteria

- AC-1: Review explicitly corrects missing/wrong source and translation articles,
  using French `taf` → `le taf` as a concrete example.
- AC-2: Both prompts cover natural article-bearing common noun entries,
  including mass nouns; retain meaning, register, gender, number and elision.
- AC-3: Neither prompt indiscriminately inserts articles for verbs, adjectives,
  proper names or languages without article-bearing entry conventions.
- AC-4: Proposal output schema, inactive fields and user acceptance stay intact.

## Plan and verification

- [x] Update the two established local prompts and focused contract assertions.
- [x] Run prompt tests/lint/typecheck and review-agent prompt propagation check.
- [x] Update relevant guide and synchronize mapped revision/checks.
- [x] Review final scope/diff and record evidence and limitations.

## Remaining risks

- Prompt enforcement reduces an underspecified rule; model compliance remains
  probabilistic. No paid provider call is part of tests or evidence.
- Real `taf` recreation requires a fresh job after worker restart; existing
  proposals and running processes retain prior results/instructions.

## Outcome and evidence

- AC-1–AC-4 implemented in local whole-card and inline prompts: required natural
  common-noun article, including mass nouns, explicit taf/le taf example,
  preserved meaning/register, no duplicate article, grammatical-gender gate and
  exceptions for non-noun/non-article conventions. Existing enabled/inactive,
  untrusted-output/schema and explicit acceptance boundaries are unchanged.
- `pnpm --filter @languon/prompts test`: 5/5 passed. Prompt contract assertions
  cover both actions and the mass-noun/proper-name boundary.
- `pnpm --filter @languon/backend exec vitest run
tests/unit/modules/dictionaries/infrastructure/ai/dictionary-card-generation-agent.test.ts
tests/unit/modules/dictionaries/infrastructure/ai/card-proposal-generators.test.ts`:
  14/14 passed. Actual Agent.getInstructions proves built package propagation;
  adapter regressions preserve untrusted output/budget/inactive fields.
- Propagation test first failed because package dist contained the old prompt.
  Rebuilt with `pnpm --filter @languon/prompts build`, then reran successfully.
  The compiled package is now current. No generated output edited by hand.
- Prompts lint/typecheck/build, scoped backend test lint, scoped Prettier,
  docs:user-flows:check (21 guides), user-flow:e2e check dictionary-platform
  (21 mapped scenarios), and git diff --check passed. Guide/test revision:
  `sha256:47e6dbade87df4bb`; prior full-guide verification date preserved.
- Real Chromium, three focused mapped journeys via isolated Playwright servers
  at localhost:4017/3347 with deterministic providers and a disposable database:
  2 passed (persisted whole-card proposal/stale recovery and saved-card inline
  authoring/advanced rewrite); 1 failed at the extra inline-creation 320px/200%
  text overflow check (scrollWidth 453 vs clientWidth 320, test line 1718).
  Generation/creation and the pre-zoom checks succeeded before that failure.
- This overflow is outside scope: no UI/CSS source changed; deterministic
  providers bypass prompt instructions. Screenshot shows clipped source input
  and footer text. Test was not weakened. Artifact:
  apps/web/.next/playwright/test-results/dictionary-platform.journe-a0d95-matic-inline-AI-application-chromium/test-failed-1.png.
- Initial fixture startup attempts failed on localhost/WebAuthn origin mismatch
  and inherited live voice-map incompatibility. Test-only runner environment
  corrected these; no user .env settings changed. Each newly created database
  was removed, including the final languon_article_e2e_1792004374250. Verified
  targets were loopback and APP_ENV development. Existing app data untouched.
- Next-generated tracked next-env.d.ts was restored to its pre-task version.
- Author preflight: exact prompt/guide/test scope, preserved prior dev-panel and
  environment corrections, no secrets/debugging output or paid calls added.
- Independent `/root/article_prompt_review` initial review found no material
  findings; confirmed grammar safeguards, field boundaries and acceptance.
  No security review required: model tools/trust policy/rendering unchanged.
- Tested patch base: 69ea1b816223d80e6974be1f11e21a8aaa61208b. SHA-256:
  review prompt 8fea630dbe6f6145ed1a8faf1e411b33296fc24a7b68fc8710cf0ffb4917a0d5;
  inline prompt 34dd0910a06aa9c307546db2757a647159144cab2fd77acf3351557f82332a25;
  prompt tests 3a41fa686fe95d4ad628681a859652f71ba0c7041d3cc6832016e2d9f9774982;
  backend agent test 33bea7db729a297e59886c7d8b002c946102ee79fe8ee5099adfab0fdb63259b.
  Evidence prose updates do not invalidate runtime checks.

## Handoff and rollback

- Restart backend and dictionary worker to reload built prompts; request a new
  proposal for taf. Existing proposals do not retroactively change.
- Live provider linguistic compliance remains unverified; deterministic tests
  do not establish that a particular paid model always obeys these rules.
- Optional extra layout failure remains outside scope and is not claimed fixed.
- Rollback only this prompt/test/guide patch and rebuild @languon/prompts; no
  persistent data, API, provider configuration or new dependencies to undo.
