# Correction: Texts field validation and select alignment

Status: Complete
Created: 2026-10-17
Updated: 2026-10-17

## Scope and routing

Bounded correction of existing web presentation/validation. Replace the combined
compose error with localized field-specific errors and invalid borders that clear
from current input. Remove the untranslated-draft hint. Move compose Translate to
the source counter row when text exists. Repair shared Select chevron centering/size.
No API, persistence, job, auth, dependency, model, credit policy or deployment change.
Preserve all prior uncommitted Texts/UI improvements. No commits/merge/push authorized.

Source of truth: root/web AGENTS, prior completed language-normalization improvement,
frontend-development, ui-ux-composition, testing/browser skills, ADR0016/0029.
Related guide: docs/user-flows/texts.md; keep mapped scenarios synchronized.

## Acceptance

- AC-1: Missing translation language shows its own error and red Select border;
  selecting a language clears both immediately without a second submit.
- AC-2: Over 20,000 Unicode code points shows a shorten-text error beside red textarea;
  reducing to valid length clears it. Other validation errors remain specific.
- AC-3: Draft-language hint is absent. Compose Translate is on the left beneath
  entered source text, beside the count; no duplicate compose action elsewhere.
- AC-4: Shared Select uses a compact centered chevron at all supported sizes,
  including label/hint/error and loading states; accessible native select preserved.

## Plan and verification

Root owns Texts pure validation, copy/UI layout and focused tests. A bounded worker
owns shared Select source/styles/stories and isolated rendered checks. Use meaningful
pure/component error-correction tests and existing deterministic Texts browser journey
for field errors, geometry and mobile; shared Select story verifies sizes/loading.
Run affected web lint/typecheck/styles; no backend/DB implementation check required.
Existing fixture journeys can use disposable infrastructure, never development data.
Independent review is proportional: root reviews shared primitive diff; no new async
workflow, trust boundary or persistence change warrants a separate completion review.

## Evidence / risks

All four acceptance criteria are implemented and verified. Validation is derived
from current input, so correcting a field removes only its own error. Missing
target, same languages, missing source, empty text, and excessive length have
separate localized messages in all four supported locales. Oversized source is
marked immediately. Translate appears only in the source counter row once text
exists; the draft hint and duplicate compose actions are removed.

Root preflight passed: 51 tests across `ui-kit`, `texts-workspace-field-validation`,
`texts-workspace-controls`, `texts-workspace-content`, and `texts-workspace-auto`;
web typecheck; scoped ESLint including the maintained browser spec; styling
contract; affected Prettier checks; and `git diff --check`. Documentation validation
passed for all 22 guides and the Texts-specific E2E mapping. Guide and API/browser
markers agree at `sha256:4df9322d0beb2f55`. No backend implementation, persistence,
production build or dependency change required separate checks for this UI patch.

Root reviewed shared Select accessibility/native semantics, spinner and logical
padding/inset alignment, and validation hover priority in Select and Textarea.
After isolated Storybook verification, padding was made logical (same LTR geometry)
and invalid controls excluded from normal hover styling. The final integrated
browser run below includes both changes and verifies danger borders while hovered.
Root visually inspected three desktop and three phone captures, including the
320 px counter row. No outstanding material findings or known correction risks.

Rollback is this scoped UI patch, preserving prior work; no data changes. Existing
uncommitted work is preserved. No commit, merge, or push performed.

### Shared Select evidence (AC-4)

- Implementation: `apps/web/src/fsd/shared/ui/select/select.tsx`,
  `select.module.css`, `select.stories.tsx`. Existing Lucide ChevronDown replaces
  the font-dependent glyph; explicit 16px indicator/SVG boxes use logical end
  inset and 50% centering. Native select/ref/ARIA/disabled behavior is unchanged.
  Spinner retains the same centered transform throughout rotation and reduced
  motion. Workspace/folder `.languages svg` rules also specify 16px, so do not
  stretch this SVG. Added real-component SizesAndStates story (three sizes,
  labels, hint, error, loading); no implementation-mirroring unit test needed.
- SELECT-STATIC: `pnpm --filter @languon/web exec eslint src/fsd/shared/ui/select`
  and `pnpm --filter @languon/web styles:check` passed; scoped `git diff --check`
  passed. Formatted with project Prettier. Root owns affected web typecheck/tests.
- SELECT-BROWSER: project agent-browser 0.33.0 safe wrapper, task session
  `languon-select-chevron-6d802b8bab8827b3bb56f24909d64597`, real local Chromium,
  Storybook 10.5.8 started with
  `pnpm --filter @languon/web exec storybook dev -p 6006 --host 127.0.0.1 --ci`.
  Story `/iframe.html?id=ui-select--sizes-and-states&viewMode=story` inspected via
  `snapshot -i`, `get box`, `get styles`, `focus`, `set viewport`, `screenshot`,
  `errors`, `console`, `network requests`. Initial screenshot 1280x577;
  responsive viewport explicitly set to 375x812.
- Observed sm select y=69/h=32 vs indicator y=77/h=16 (center 85);
  md y=130/h=40 vs y=142/h=16 (center 150); lg y=221/h=48 vs y=237/h=16
  (center 245): 0px center error. Spinner center 340 vs disabled select center
  340 (rotation changes bounding rectangle only). After resize sm/lg/spinner
  centers remained identical, all chevrons stayed 16x16. SVG computed width
  16px. Labels named all controls; loading was disabled; small control displayed
  visible focus, large showed red border and its error. Screenshot visually
  inspected with compact centered chevrons and centered spinner.
- Artifacts: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1792227591692.png`
  and `screenshot-1792227617081.png` in that directory. No browser errors or
  warning/error console messages. Network requests succeeded except Storybook's
  incidental `/favicon.ico` 404; no application request failures.
- Browser session closed and own Storybook process stopped. Isolated story proves
  primitive geometry; root separately verifies Texts integration. Tested base
  `0e07c3c`, SHA256 CSS `e82b0d11e15bbb1c0080517b112a723a853640c853d77a0ad178913231d0dc8a`,
  story `63f365bc07cf5b6fb6204924e6151a57b4c05e6d7b5ffbba8698a4506f5029f4`,
  component `68b648fc1cc18c6035c211b30a7b9adabae8055033c3371c72719c94b2ce6148`.

### Browser evidence — BV-1 (2026-10-17)

Maintained Playwright 1.62.1 / Chromium real application verification, Node24.8.0.
Exact command (synthetic local-only credentials shown):

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgresql://texts_test:texts_test_local@127.0.0.1:55443/languon_auth_texts_ui_web_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_texts_ui_web_test ALLOW_DISPOSABLE_REDIS_TESTS=true AUTH_TEST_REDIS_URL=redis://127.0.0.1:56443/1 AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56443/1 AUTH_E2E_RUN_ID=texts-field-validation-final3 pnpm test:e2e:texts-web
```

Result: all3 mapped browser journeys passed in41.4s: owner reading/collection,
public copy/revocation, phone reading/selection. Existing English `bank`, French
`le but`, save/reload, Auto detection, copy/revocation, dictionary padding,
collection focus/viewport checks remain. Added regression assertions establish:
blank source has no Translate; entered source has exactly one visible compose
Translate inside counter row to left of count; desktop icon-only and phone
icon+label; missing target aria-invalid/red border/localized error, immediately
cleared by selection;20001Unicodecodepoint source immediately invalid/red with
specific error, cleared by reducing input. Error borders are compared with rendered
danger text; restored borders with the resolved normal border token. No draftHint.
Counter geometry/no overflow checked1440,390,320 widths; screenshots inspected.

An earlier run exposed an actual invalid-hover priority bug in shared Textarea;
root fixed Select/Textarea hover selectors to exclude invalid controls. Final run
includes this correction. Initial test-only mismatch between hover/default normal
border shades was corrected by checking semantic danger/default colors. No tests
were weakened to bypass the invalid-hover issue. Maintained console/pageerror,
requestfailed and5xx assertions passed. Only server FORCE_COLOR/NO_COLOR environment
warnings appeared. No paid model services, development resets or live data.

Tested content hash (SHA256 over sorted paths +NUL+contents+NUL, all existing
tracked/untracked apps/web/src files, maintained Texts spec/config, backend fixture
server and Texts web/base runners):
`b5106b90d8cca878ef4ebcf845437c1d1fe41595ec0842349fd8f86ec617b522`.
Post-run recomputation matches exactly. Guide marker4df9322d0beb2f55;
`pnpm user-flow:e2e -- check texts` and scoped spec ESLint pass.

Artifact root:
`apps/web/.next/playwright/texts-results/texts-field-validation-final3/`.
Desktop subdirectory `texts.journeys-owner-trans-b5f41--collects-a-contextual-word/`:
`owner-compose-missing-target.png`, `owner-compose-long-source.png`,
`owner-compose-counter-action.png`. Phone subdirectory
`texts.journeys-phone-reade-9a6f6-without-horizontal-overflow/`:
`phone-owner-compose-missing-target.png`, `phone-owner-compose-long-source.png`,
`phone-owner-compose-counter-action.png`, `phone-320-compose-counter-action.png`.
At320 the count wraps within its right-hand area without overlap/overflow.
At390/320 internal workspace scrolling keeps the counter action above Save footer.
These maintained real-browser captures cover the changed form states; no separate
exploratory browser session needed. Isolated shared Select states are recorded by
its owner separately.

Cleanup: fixture runner stopped owned servers; ports3335/4005 have no listeners.
Removed only owned labelled containers `languon-texts-validation-pg` and
`languon-texts-validation-redis` (label languon.task=texts-field-validation).
Development PostgreSQL/Redis/MinIO were untouched. Browser artifacts retained.
