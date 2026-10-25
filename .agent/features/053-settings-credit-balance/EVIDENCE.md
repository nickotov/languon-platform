# Verification evidence: Settings credit balance and focused AI interfaces

Updated: 2026-10-25

## Acceptance coverage

AC-1: Passive components and slots removed across dictionary/texts/Knowledge/sharedchat/
sentences/interview; retired component-only tests removed, lifecycle assertions retained.
AC-2/3: Canonical authenticated learner endpoint and account-scoped Settings panel implemented;
contract/HTTP/database and unit coverage below; browser and reviews passed.
AC-4: No admission/settlement changes. Explicit reduced-allowance and speech consent,
insufficient-credit feedback, Stop/retry and response actions retained.
AC-5: Checks below; final audit passed.

## Check records

- E-1: `pnpm test:e2e:critical -- --flow dictionary-generation --flow text-generation
--flow chat-lifecycle --flow insufficient-credits --flow free-interview` passed7
  Chromium tests across6 entries (text includes setup dependency). Owned disposable
  PostgreSQL/Redis, actual apps/workers, deterministic external providers. Evidence:
  `test-results/critical-flows/636d54b3-45ab-4baa-be1f-87e5bcbe3fd3`, log
  `/tmp/settings-credit-critical.log`. This tested removal patch before balance API/UI;
  retained as scoped removal proof, not new endpoint evidence. No paid calls.
- E-2: Focused removal unit tests33 passed; new balance+profile tests15 passed before
  final account-switch test. Final focused grouping49/49 passed; final profile/balance grouping16/16 passed. Web typecheck passed.
- E-3: Backend balance route9 tests, shared schema12 tests, actual disposable PG4 tests
  passed. Projection behavior: absent account stays absent; expired grants excluded,
  reserved amount excluded from available, otherowner isolated, unlimited expiry.
  PG55453/languon_auth_settings053_test owned by worker; container removed.
- E-4: `pnpm --filter @languon/web test` before updating all retired UI expectations
  had1005 pass/7fail:6 obsolete expectations corrected;1 unrelated unchanged workspace
  passage test still fails isolated. Reviewer confirmed affected hook/test path is
  unchanged. This is not reported as a fully passing web unit suite.

## User-flow evidence

Seven existing generation/accounting guides updated and validated; existing profile
scenario plus new settings-credit-balance scenario extended in magic-profile-page.
Exact marker checks and new runtime proof recorded after completion. Last-verified
metadata is not bumped for broader guides whose entire mapped suite was not rerun.

## Review

[REVIEW.md](./REVIEW.md). Initial UI removal review identified missing actual balance
(Settings was a placeholder); user approved this feature to resolve that finding.
Security and expanded completion reviews passed after remediation.

## Remaining gaps

No required feature evidence missing. See final limitations for the unrelated broader
unit failure and live-provider boundary. Provider financial semantics unchanged.

## Final checks and browser evidence

- E-5: Four Chromium cases passed, no skips/retries, with actual apps/worker, fresh
  owned PostgreSQL55485/Redis56485, deterministic external adapters. Executed
  `node /tmp/settings-credit-browser-proof.mjs` through existing reviewed runtime/
  cleanup/Next-preservation helpers, selecting `Settings Credits displays|paid
sentence generation|sentence preparation spends|confirms a finite credit quote`
  from profile, ai-legacy-budgets and shared-pronunciation specs. Evidence
  `test-results/settings-credit-balance/b698c2ad-a30e-4940-b77c-01e1cf86e40b`.
  Live zero and20.125 credits, compact20.13, reload and320px screenshot verified.
  Sentence consent/results, paused preparation requiring explicit newbudget, and
  finite speech quote/one settlement/free replay passed. Screenshots inspected.
- E-6: After read-only snapshot remediation, reran the profile browser case alone
  using the same owned runtime helpers: `node /tmp/settings-credit-browser-final.mjs`.
  Passed1/1, evidence `test-results/settings-credit-balance/84858c45-2c16-439a-8abd-76278a27feba`.
  Actual PostgreSQL4/4 (including HTTP read under held writer lock), route9/9,
  contracts12/12 passed. Reads do not create wallet/history/hold rows.
- E-7: Web/backend production builds passed; backend/web final typechecks and scoped
  ESLint passed. Web styling contract passed. New Settings panel uses existing Card,
  Button, InlineAlert, LoadingState, theme/geometry tokens and four UI locales.
  Full web unit suite final result1017passed/1failed across138files. The remaining
  unchanged workspace-assistant-context case is outside this patch; independent
  reviewer confirmed the source path is untouched. No test was weakened or skipped.
- E-8: Eight guides/affected revision mappings validated; global documentation check
  passed28guides/16validator tests. Final formatting/diff checks passed. Test-owned
  containers and runner locks removed; generated Next declarations restored.
- E-9: Completion and security reviews found no unresolved material issues after
  SETTINGS-CREDIT-001 and SEC-053-1 remediation (see REVIEW.md).

Browser proof for the removed panels remains valid after balance integration because
those learning consumers, their fixtures' generation paths and assertion semantics
are unchanged. New Settings browser proof was rerun after its final backend change.
Post-proof UI changes remove an unused prop and name equivalent render conditions;
unit/type/lint checks passed and rendered output is identical.

## Final limitations

The live provider was never called; no production/dev settings or learner data were
modified. No migration. The recorded unrelated unit failure prevents a claim that the
entire web suite passes. History/purchase UI remains a truthful placeholder; this
feature adds only available balance. No remote CI execution is claimed.
