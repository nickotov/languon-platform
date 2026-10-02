# Evidence: Flashcard training web design integration

Status: Verified; completion and security remediation passed
Updated: 2026-10-02
Base: d7390af209ee29d4394a81e3c59e532d01295bb5.
Review boundary: all tracked changes plus new feature/tests under branch
feature/flashcard-training-web. Persistence evidence remains in feature 033;
no schema changes here.

## Author-preflight checks (historical; final proof below)

- Full web suite: exit 0, 40 files / 338 tests; extra immutable RetryButton deadline regressions 2/2 pass.
- API/state/setup 33/33; interaction/Menu/UI-kit 38 pass, including StrictMode fullscreen startup and late grants.
- Backend dictionary/learning route units 24/24. Wildcard OPTIONS interception reproduced red, owned-prefix handlers turn it green.
- Strict composed training E2E: exit 0, 3/3 pass, 1.4m. Owner setup/rating/Undo/preferences; separate shared learners; anonymous local-only practice. Initial Start requires Dialog view, not Fullscreen.
- Broader dictionary E2E: exit 1, 5 passed / 2 failed / 1 skipped. Global Private locator ambiguity and repeated-account fallback stayed on login. Not counted as a wholly passing run. After scoping Private to the created dictionary header and using a fresh synthetic run ID, both former failures pass: exit 0, 2/2, 44.3s. Other five passing journeys remain valid; disabled live-AI scenario stays skipped.
- Root lint, web/backend typecheck, backend build pass. Web production build passes after retrying concurrent Playwright artifact-directory ENOTEMPTY; final validity checked after remediation.
- Docs and flashcard-training-web mapping checks pass; revision sha256:e33892d82595b0dc maps three real journeys.
- Browser wrapper tests/doctor/live probe pass (9 tests). Initial sandbox loopback EPERM required approved execution; it was not an app defect.

## Actual browser / design comparison

Pinned agent-browser 0.33.0, task Chromium session
languon-flashcard-training-web-552e407784592f781825872aae3054e0.
Task-owned localhost web3347/backend4047; disposable PostgreSQL55447/Redis55448.
Synthetic data only; no paid AI calls. User services3333/4000 and databases5432/6379
are untouched. All four user references and selected source identity are retained
in feature033 DESIGN.md. Viewed reference and runtime images; reference scaled
Spanish/English, runtime English/Spanish at1440×1000,390×844,768×1024.

| Inventory / acceptance | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 / AC-1           | Train beside existing Add card; Cards + disabled Sentences; empty Start disabled. Shared availability by real E2E. [Light menu](evidence/runtime-menu-light-desktop.png), [dark](evidence/runtime-menu-dark-desktop.png).                                                                                                                                                                                                             |
| UI-02–04 / AC-2        | Example defaults, ordered summaries, equal desktop fieldsets/stacked mobile, order/scope/helper/footer. Manual/filter/conflict/cancel/retry tested. [Light setup](evidence/runtime-setup-light-desktop.png), [dark](evidence/runtime-setup-dark-desktop.png), [mobile](evidence/runtime-setup-dark-mobile.png).                                                                                                                       |
| UI-05–07 / AC-3–5      | Start actually fullscreen; Dialog view preserves session/face; click and Space flip; Known acknowledgement, Undo restoring back, Again then explicit round2/fresh front; End confirmation. [Light practice](evidence/runtime-practice-light-desktop.png), [dark](evidence/runtime-practice-dark-desktop.png), [mobile](evidence/runtime-practice-dark-mobile.png), [tablet dialog](evidence/runtime-practice-dark-tablet-dialog.png). |
| UI-08 / AC-6           | Separate round/session/saved totals, self-assessment note, progress legend, Undo/Again/Start over/Finish; no automatic requeue. [Light results](evidence/runtime-results-light-desktop.png), [dark](evidence/runtime-results-dark-desktop.png).                                                                                                                                                                                       |
| UI-09–10 / AC-4–8      | Labelled controls/dialogs, responsive light/dark rendered. Gesture exclusions, batching, retries/idempotency, stale identity/access/content, fullscreen rejection/StrictMode and cooldown in focused tests; shared/anonymous in real journeys. Long/RTL/reduced-motion component contracts/tests are not a claim of a full visual cross-product.                                                                                      |
| UI-X                   | Dictionary preview/shell/designer/mock scenarios excluded as requested; only launcher composition changes existing pages.                                                                                                                                                                                                                                                                                                             |

Adaptations: existing centered floating action group versus prototype bottom-right;
existing app shell unchanged. Existing accessible UI tokens/primitives replace
prototype controls. Mobile retains labelled non-drag rating controls (source
hides them). Save failures use inline accessible alert + same retry, not toast.
Native fullscreen succeeds locally, so source fallback notice is absent in that
state; rejection fallback tested. Synthetic counts/direction differ deliberately.
The duplicate Entries label was corrected to Which entries in all four locales.

Browser errors empty; console contains development HMR and Fast Refresh reload
warning during active edits, no app errors. Real E2E rejects unexpected browser/
HTTP errors; anonymous initial refresh401 is expected.

## Author-preflight rollout checkpoint (superseded below)

Independent completion/security review, final patch
checks and cleanup pending. Capability remains disabled by default, enabled only
isolated checks. No production rollout, schema/dependency/auth redesign. BL-002
not Done until verified; BL-003 remains partial beyond flashcards.

## Final remediation proof — 2026-10-02

- Final web suite: 42 files / 346 tests, exit 0; final web typecheck and root lint exit 0. Isolated production build (`AUTH_E2E_DIST_DIR=.next-training-production pnpm --filter @languon/web build`) passes. Backend build/typecheck and 24 route-unit results remain valid for unchanged backend code.
- Final real training E2E: four synchronized journeys, exit 0, 4 passed in 41.1s. Guide revision `sha256:e33892d82595b0dc`; docs/mapping checks pass. Earlier 3/3 is superseded by this full final run.
- Manual selector tests now cover search debounce, cursor paging/stale responses, visible selected state across pages/filters and exact accumulated IDs in Start. Two-card rejected-rating regressions preserve prior ACK/Undo while backend epoch/latest-attempt guards remain authoritative.
- Actual wrapper with capability disabled retains Train and disabled Sentences, omits Cards, and has no exceptions: [capture](evidence/runtime-capability-disabled-menu.png).
- Native Chromium CDP touch reproduced horizontal pointercancel because the inner scrolling face had auto touch policy. One-variable inner `touch-pan-y` fix passes native vertical scrolling without rating and horizontal swipe with rating. The focused class-policy regression was red before the fix, green after; no preventDefault or vertical-scroll suppression was added. Temporary diagnostics removed.
- Long Arabic `lang`/`dir`, reduced motion and enlarged content verified in [CSS 200% content capture](evidence/runtime-rtl-200-css-scale.png), SHA-256 `0bfb00ffa2549a7c222a40cf63b7c430f603890991dcdfc80618375da1977205`; [mobile native-touch capture](evidence/runtime-rtl-mobile-touch.png), SHA-256 `ba58158cfd78b385d40034620d439e440e22fb7119faf57e77d00868d40cd1f2`. Root viewed both. CSS scaling is a content-only surrogate: it mis-scales native top-layer controls and does not emulate browser-chrome zoom/media queries. Zoom is reset for real 720×500 dialog End/Known reachability; separate 390×844 touch and earlier 390/768 wrapper checks cover responsive layouts. No native browser-chrome zoom or exhaustive cross-product is claimed. Reviewer accepts this proportional matrix.
- [Final runtime/test manifest](evidence/runtime-manifest.txt), SHA-256 `67fde3eff2a2d23030899e98195929ff2e3d6c24f8d8cdc6675129c0c3cbf11a`, binds all changed/new runtime, config and test files to this tested/reviewed source. Immutable prompt/export hashes remain unchanged; only the exact frozen JSON export is formatter-exempt.
- Completion remediation closes all four medium findings; security initial/focused remediation finds no material issue (REVIEW.md). The gesture-style change adds no trust boundary and leaves reviewed auth/transport/rendering/CORS paths unchanged.
- Task browser and manual/E2E servers closed. Task-generated builds moved recoverably to `/private/tmp/languon-training-builds.ewMjR6` and `/private/tmp/languon-training-final-builds.ar0wL1`; generated next-env restored. Verified disposable PostgreSQL/Redis containers removed with synthetic test data; normal user services/infrastructure were untouched. No HTML reports, traces, credentials or generated builds are committed.

Remaining rollout boundary: backend capability remains false by default; enable
`LEARNING_FLASHCARDS_ENABLED=true` in the intended local backend and restart it to
use Cards. Production activation and progress for other exercise modes are not
part of this delivery.

Verified local implementation commit: `331a642db524ed3466023b7bbc565928f87809fd` on
`feature/flashcard-training-web`; runtime/test manifest is unchanged. The required
main squash contains this implementation and its completion records; feature
history is retained locally, with no push or branch deletion.
