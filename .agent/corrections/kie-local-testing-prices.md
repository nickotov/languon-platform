# Correction: Kie local testing provider-price setup

Status: Complete
Created: 2026-10-25

## Scope and authorization

Local development configuration only, using existing admin provider-price controls.
User explicitly requested Kie testing prerequisites and authorized using the signed-in
Chrome admin tab. No production settings, code, credit grants, learner tariffs,
account/content resets or paid provider calls. No commit authorized for this setup.

## Diagnosis and prepared change

Active local default is kie/gemini-2.5-pro; learner selection is Auto. Credentials,
current sentence worker capability and customer tariff exist; no Kie text provider
USD rate revision exists. No open Kie circuit was found. Sentence admission maps
missing provider pricing to the generic model_unavailable error.

Prepared existing Admin → Accounting → Add provider cost rate form:

- Provider kie, model gemini-2.5-pro, meter text-tokens.
- Input USD per million tokens: 0.38; output: 3.00.
- Cache read/write: 0.38 each, explicitly labeled conservative local estimates at
  the full input rate, not separately published Kie cache prices.
- Source https://kie.ai/gemini-2.5-pro, checked 2026-10-25.
- Source reference kie-gemini25-local-testing-cache-upper-bound.
- Audit reason records the cache estimate and requires review before production.

Kie product page supports the input/output rates. All fields were read back in the
native Chrome accessibility tree after setting. Publication attempted once and
rejected with “Recent authentication is required.” No database revision saved.
User signed in again. Reopened and refilled the form, verified current database
still had no Kie row, then published once successfully. Saved revision 1 is effective
at 2026-10-25T18:36:48.457Z. Read-only database metadata confirmed exactly one Kie
text-token revision with both cache fields populated; native Chrome UI shows the
expected 0.38 input, 3.00 output, 0.38 cache read/write and source reference.
The missing provider-price prerequisite now passes in the doctor. No duplicate
revision, learner tariff, global budget, account or model-selection change made.

## Verification and limits

Task-scoped safe browser was signed out. User explicitly authorized native Chrome
session use; Computer Use skill controls only the requested local admin surface.
No browser scripts, token extraction, authentication bypass or paid calls.
Local doctor reported missing provider price as expected. It also flagged unset
LEARNING_SENTENCES_ENABLED despite API defaulting true in development, and treated
unverified Kie probe evidence as unavailable despite admission accepting it; do not
claim these diagnostic flags prove the actual worker is incapable. Raw DB metadata
confirmed fresh sentence executor evidence. These checker discrepancies are outside
this configuration-only change.

Verified preview after save: matching row already exists; no second publication
is needed. Closed only task-owned safe browser; user's Chrome remains open on
Accounting. Existing local runtime and worker were not restarted. No new Playwright
or app-code tests needed for using the existing configuration UI; existing full
critical suite was verified in the preceding implementation, not rerun for this
local data-only setup. Configuration readiness does not prove live generation.

## Remaining risks

Recent-sign-in blocker resolved by the user; publication verified.
No successful Kie generation has been attempted or established. Provider rates and
cache estimates are local testing inputs, subject to provider invoice reconciliation.

## Subsequent provider diagnosis

The next real job passed admission and failed during execution. One separately
user-authorized synthetic request confirmed Kie returns HTTP200/bodycode410:
Gemini2.5Pro was retired upstream. The configured price record remains a valid
record of this local setup, but does not establish model availability. See
[retirement diagnostics](../improvements/kie-retirement-error-diagnostics.md).
No replacement model was selected or integrated automatically.
