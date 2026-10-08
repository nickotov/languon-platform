# Improvement: Editor actions and practice history

Status: Complete
Created: 2026-10-08
Updated: 2026-10-08

## Routing and authority

Focused existing-contract UI improvement on main after feature039 (906fa8f).
User requests secondary menu fidelity, training-only launcher, richer history.
User explicitly selected saved flashcard progress instead of dated sessions.
No new API, persistence, scoring, security policy or production dependency.
User authorized committing the verified improvement on 2026-10-08. No push authority.
Preserve unrelated work. Revert the resulting commit to roll back.

## Scope and acceptance

- AC1: Secondary editor menu follows selected source icons, order and grouping,
  adds Saved sentences, and preserves existing bulk/sharing capability guards.
- AC2: Training launcher contains only Flashcards and Sentence practice.
  History remains reachable through secondary actions and within sentence practice.
- AC3: Standalone personal history has Flashcards and Sentences tabs. Flashcards
  display saved known/repeat/unstudied totals; sentences display true API progress
  separately from paginated AI/manual history, with explicit direction labels.
- AC4: Preserve authenticated/shared identity boundaries, loading/error/retry,
  empty states, keyboard/focus and narrow-screen layout. No synthetic session logs.

## Source and design inventory

Magic Patterns editor syycdjxpposwrfn72sbix4, unchanged active artifact
e4a89692-97c6-4fc0-8967-9ca6e8ecc40b. Retrieved source:
[SecondaryActionsMenu](./evidence/editor-training-history/SecondaryActionsMenu.tsx)
and [PracticeLauncher](./evidence/editor-training-history/PracticeLauncher.tsx).
Existing feature039 frozen source/history remains unchanged. Source-only fidelity;
no reference screenshot pixel claim. Icons: sentences, pasted terms, document,
import, export, sharing. Separators around grouped bulk and sharing entries.
Training source has exactly two journeys. New history grouping is locally
composed with existing tabs, statistics and personal result primitives.
No prototype generation or simulated progress is imported.

## Plan and verification

- [x] Implement secondary menu and training/history composition.
- [x] Focused behavior tests, affected lint/typecheck and production build.
- [x] Update affected user-flow guides and mapped tests.
- [x] Verify real-browser wide/narrow controls/history, console/network checks.
- [x] Independent review, final scoped diff and evidence.

Guides: sentence-practice-web, flashcard-training-web and applicable dictionary
editing guide. ADR-0016/0017 runtime primitives and source authority apply.
Root owns editor/shared menu; bounded worker owns training/history. Browser/docs
specialist owns guide/E2E changes. No backend/data changes planned.

## Evidence and remaining risks

Implementation and verification complete. Flashcards expose saved progress,
not session history; sentence aggregate statistics must not infer totals from
loaded pages. Shared/anonymous availability remains subject to existing contracts.

## Author preflight and review — 2026-10-08

Final web lint/typecheck pass; 54 unit files / 505 tests pass. Nine focused history tests
cover authoritative totals, independent direction failures, retry, inline tabs
without nested Dialog and revoked-access notification. Shared-menu regression
proves separators/headings do not affect disabled-item keyboard navigation or
focus restoration. Frontend architecture passes 9/9. Guide checker passes 16/16
and all 19 guides; sentence-practice-web, flashcard-training-web and
dictionary-platform mappings pass.

Independent production reviewer `/root/editor_history_browser` did not author
the production patch. Reviewed the complete diff/new modules against 906fa8f,
source menu/launcher inventory, history scopes and lazy read lifetimes. Initial
verdict has no material correctness, privacy, security or FSD finding. Final
verdict approves the completed patch after browser regressions and production build.

Contract adaptations: source sentence count is optional; no invented count is
displayed. Existing localized Import cards labels preserve the real import
contract. Prototype capability dialogs remain replaced by actual existing
workflows. New history entry and statistics tabs are user-requested composition.
Backend, contracts, persistence, flags and dependencies remain unchanged.

## Remediation review scope

Root preflight found R1: removing the launcher library entry made shared-reader
content harder to discover, since readonly pages have no editor secondary menu.
Shared authenticated readers now have a small secondary menu with Sentences and
history, preserving capability fragments and existing capability guards. Anonymous
viewers retain ephemeral training without personal actions. Worker also removed
the obsolete standalone-history focus override to Train; the native Dialog
restores the actual secondary trigger. Real shared navigation/focus verification
and the review's narrow reassessment pass. Source files in this record
are formatter-normalized reference copies; owning feature039 frozen exports and
hashes are unchanged.

H2, Medium, browser-confirmed owner/shared history close lost More-trigger focus.
PracticeHistory now keeps its standalone shell and unmounts read content on close.
The existing shared Dialog removed its native node before its passive close effect
ran; layout cleanup now closes the connected native dialog before removal so the
browser restores the opener. A guard suppresses duplicate programmatic close
notifications. Focused unit proof covers close-before-detach for controlled close
and component unmount; real owner/shared history and flashcard consumer journeys
verify behavior. This is a bounded established-dialog lifecycle correction; no
public transport, persistence, authorization or dependency change. Independent
review includes the expanded shared primitive and its existing consumers.

H3, High, discovered during the required shared-dialog consumer browser smoke:
React Strict Mode queued cleanup close events after reopening the native node,
which dismissed Add card immediately. Native close handling now ignores events
from reopened or disconnected nodes, while genuine live closed dialogs still
notify their owner. A queued-event root-StrictMode unit regression reproduces
the race; final real Add card/training/history consumer journeys remain the
acceptance proof. Test state/event shims do not simulate top-layer focus.

## Final completion evidence

- Web lint, typecheck, 505 unit tests, 9 frontend architecture tests and webpack
  production build pass. Targeted history/shared-UI/review regression tests: 51 pass.
- Final maintained real-browser acceptance: two owner journeys and one shared
  journey pass on the final production sources. Additional finite-round, RTL and
  prepared-example regressions pass. No unexpected console/network errors.
- All 19 user-flow guides / 16 checker tests and three affected guide mappings pass.
- [Browser evidence and 13 screenshots](./evidence/editor-training-history/BROWSER.md)
  document responsive menus, statistics, loading/error/retry, actual modal focus,
  source hashes and disposable infrastructure cleanup.
- [Independent completion review](./evidence/editor-training-history/REVIEW.md)
  approves the full production patch; R1, H2 and H3 are closed with runtime evidence.
- Disposable PostgreSQL/Redis and task app processes removed. Normal development
  data/services untouched. Generated Next.js declaration restored after build.

No remaining material findings. No backend or environment updates are required.
No backlog lifecycle status changed: this is an incremental existing-contract UI
improvement following completed feature039. User authorized a local commit after verified completion.
