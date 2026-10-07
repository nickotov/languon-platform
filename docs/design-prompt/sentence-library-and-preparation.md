---
type: design-prompt
status: awaiting-design
feature: sentence-library-management
related_features:
    - sentence-practice
source_paths:
    - apps/web/src/fsd/features/sentence-training
    - apps/backend/src/modules/learning
    - packages/contracts/src/learning/sentence-library.ts
    - packages/contracts/src/learning/sentence-preparation.ts
---

# Dictionary sentence library and optional preparation — Magic Patterns prompt

Versioned owner: [feature 039](../../.agent/features/039-sentence-library-management/FEATURE.md).
[Design registry](../../.agent/features/039-sentence-library-management/DESIGN.md).
[Implementation plan](../sentence-library-implementation-plan.md).

Copy the complete brief below into Magic Patterns. It describes verified backend
behavior and the frontend to design. It contains no concrete API paths.

---

Design an extension to Languon's existing dictionary and sentence-practice UI.
Use Russian interface copy and realistic French/Russian learning examples. Use
this existing selected practice design as the visual baseline:
https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4

Produce a polished, responsive, interactive prototype covering the dictionary's
saved sentence library and optional full-dictionary preparation before practice.
Preserve the current practice screen's header, footer, button hierarchy, AI-job
status placement, inline AI settings and “Два способа проверки” placement exactly.
The new work adds management and preparation around that established practice
flow. Do not introduce a new visual direction or restyle the whole application.

## Product context and boundaries

Learners already generate sentences around dictionary words, translate them,
receive contextual hints, and check using AI, a free reference comparison or
reference reveal. Generated examples are saved and can be reused across sessions.
Examples can be shared, while personal archive choices belong to each learner.

The new library previews and manages saved examples. Its preview does not count
as practice, reveal an answer within a practice session, create a review or change
scores. It has no answer-input or answer-checking controls. Normal reference
preview is free, including when the learner has zero AI credits.

The learner's removal is a reversible personal archive. It hides examples from
that learner's future practice and preserves their learning history. Other
learners can continue using a shared example. Global archival and irreversible
deletion are administrative capabilities and are not learner actions here.

Preparation is optional and OFF by default. It can run in the background after
navigation. It saves examples without counting them as practiced. It uses normal
AI credits only for new generation and preserves all older saved examples.

## 1. Dictionary entry point and saved library

Integrate “Предложения” into the existing dictionary navigation next to its
vocabulary content, with a count only when available. Make it discoverable without
turning it into the default learning screen. Preserve the dictionary title,
language identity and existing primary practice entry point.

The library header should have a clear title, short explanation, and purposeful
controls. Use “Сохранённые предложения” and explain that these examples are reused
in practice. Include a clear route into sentence practice and a secondary route
into optional preparation. Avoid presenting generation as a free library action.

Provide these filters with compact hierarchy and a visible reset:

- Translation direction, showing the displayed language and answer language.
- Personal visibility: available / archived by me / all.
- Currentness: all / current / outdated.
- Global visibility, as an advanced filter: active / globally archived / all,
  clearly read-only for the learner.

Use a dictionary whose vocabulary source language is French and translation
language is Russian. Default practice direction is Russian → French: “Вижу русский,
перевожу на французский”. Never label this with ambiguous “source/target” alone.
An example in the opposite direction must have an explicit French → Russian badge.
Switching direction filters changes the visible examples consistently.

Each compact list row/card should show:

- Selection checkbox with an accessible label.
- Sentence text in its displayed language, with long-text wrapping.
- Explicit direction badge.
- Current/outdated state and personal/global visibility badges when applicable.
- Creation date and the supplied personal/shared example marker.
- A “Посмотреть” action and a clear archive/restore action appropriate to the state.

Do not expose generator identity, another learner's personal archive choice or
internal identifiers. The data supplies personal/shared status, not an origin or
generator search filter; do not invent those controls. Avoid practice scores/statistics in this management preview.
Keep the reference collapsed in the list so the sentence remains easy to scan.
Use bounded pagination or a “Показать ещё” control; support hundreds of examples
without an enormous single-page layout. Preserve filters when inspecting an item
and returning, and show distinct initial loading versus next-page loading.

## 2. Detailed preview

Open an accessible desktop drawer/panel or dedicated detail area; use a full-height
mobile detail view with a clear back/close action. Avoid stacked oversized dialogs.
Keep the current filters, pagination and selected items intact on return.

Show the sentence, language direction, saved date, currentness and archive states.
Provide an expandable “Пример перевода” section. The expansion is simple preview,
not a correctness score or completion action.

Display all available dictionary-word mappings and additional contextual hints.
Separate dictionary words from other useful words/expressions without burying
either group. Hints can be whole phrases: preserve “avoir besoin de” as one
expression rather than splitting it into unrelated tokens. Show the expression,
contextual translation and any available brief explanation. Do not invent
unavailable dictionary definitions or generated extra hints.

Use this natural example:

- Sentence shown: “Мне нужна помощь после работы.”
- French reference: “J'ai besoin d'aide après le travail.”
- Dictionary mapping: “после работы” → “après le travail”.
- Additional phrase hint: “нужна” → “avoir besoin de” — “нуждаться в”.
- Additional word hint: “помощь” → “aide”.

Include a legacy example with dictionary mappings but no extra contextual hints.
Explain that additional hints are absent for this saved example; keep its existing
reference and mappings usable. Empty hint groups should not look like errors.

Provide personal archive/restore at the detail level. For outdated content,
explain that vocabulary changed and the example is unavailable for new practice.
Restoring a personal archive does not automatically make an outdated or globally
archived example usable. Show these independent reasons clearly.

## 3. Selection, archive and restore

Support individual selection, selecting the current page, and explicitly selecting
all examples matching the current filters across pages. Distinguish them with
honest counts and copy: “Выбрано 12 на этой странице” versus “Все 186 по фильтрам”.
Do not imply the current page is the entire dictionary. Switching filters or
selection scope must visibly clear or reconfirm selection.

Use a contextual selection toolbar with count, clear selection and the applicable
archive/restore action. Personal removal copy can be “Убрать из моей практики”;
restoration copy can be “Восстановить”. In the normal active view, offer an explicit
all-matching management action so users can clear their saved practice pool.

Confirmation should show the precise count, direction/filter scope and consequence:
the examples leave this learner's practice and can be restored. Do not use global
or irreversible language. During submission, prevent duplicate actions, retain
the chosen scope and show progress without making the entire application unusable.
After success, update the list/count/selection and show a concise success notice.
An optional convenience undo must use real restore semantics rather than inventing
a permanent-deletion recovery feature.

Confirmation snapshots can expire or be superseded. If the selected content
changes before submission, show “Набор изменился. Проверьте выбор ещё раз.” and
require a fresh confirmation. Never silently apply a wider/newer selection.
There are at most five retained confirmations per user/dictionary and 25 per user.
One all-matching confirmation supports up to 10,000 examples; for larger sets,
explain that filters or smaller selections are needed. Use clear product copy,
not internal exception names or technical limits in the ordinary happy path.

## 4. Optional preparation in sentence setup

Extend the existing sentence setup, preserving its direction, selected word scope,
example mode and AI settings. Add a clearly OFF-by-default option such as
“Подготовить предложения для всего словаря заранее”. Explain that the current
practice round and full preparation scope are different.

Preserve the existing three modes:

- “Сначала сохранённые”: reuse eligible saved examples, including examples completed
  previously, and generate only missing coverage.
- “Новые примеры”: prepare fresh additive examples for this direction.
- “Только сохранённые”: reuse available examples without AI generation or credits;
  missing words remain visibly uncovered.

For a 248-word dictionary with 35 selected for the intended round, show both
“Раунд: 35 слов” and “Подготовка: все 248 слов”. The selected round is prepared
first, followed by bounded rounds of at most 100 words. Support a dictionary above
100 words without pretending a single learning round is unlimited.

Show the displayed/answer languages unambiguously before the start action.
Explain credit behavior beside the relevant choice. Do not promise a known exact
whole-dictionary price or completion time. Keep AI preferences inline/collapsible,
as in the selected current setup; do not overlay another settings dialog.

When preparation is off, the existing start flow remains familiar. When enabled,
the primary action clearly starts preparation; users understand they may start
practice once usable examples are ready. If background work already exists, show
its status and routes to continue, view progress or stop instead of silently
starting duplicate work.

## 5. Background progress and starting practice

Create one coherent progress surface inside the current flow and a compact
persistent dictionary indicator after navigation. Returning should recover the
same progress. Do not trap the learner in an unclosable loading dialog.

Show word coverage as the main progress measure: “Готово 47 из 248 слов”. Show
saved examples reused and new examples generated as separate secondary counts.
These counts are not interchangeable: one sentence can cover several words.
Display overall readiness and first-round readiness separately.

Expose later prepared rounds through a compact paginated/expandable rounds list.
Each round shows word count, ready coverage and pending/partial/ready state.
Enable “Начать с готовыми примерами” for a usable ready/partial round and explain
partial coverage honestly. Starting a prepared round uses its exact ready examples;
it must not imply another hidden generation, even if “Новые примеры” was originally
selected. If no examples are usable, this action is disabled with a useful reason.

Allow leaving the progress view while work continues. Provide explicit stop:
“Остановить подготовку”. In the stopping state, explain that the current generation
will finish and no next generation will start. Do not show immediate cancellation
or an automatic refund promise. Show explicit resume after a pause.

Preparation retains at most 20 content-bearing runs per learner. Explain quota
errors as saved work needing attention rather than a mysterious server failure.
Inactive completed/failed/stale/access-lost manifests expire after seven days;
resumable pauses are preserved. Saved examples remain in the library after a
manifest expires. Show “Подготовка устарела” with a route to start a new saved-first
preparation or use the library; do not offer resume for expired manifests.

## 6. Required state variants and recovery

Deliver usable, distinct variants for all of these states, with real action
hierarchy and understandable copy:

- Library initial skeleton, loading more, successful list, very long sentences.
- No saved examples, no results for filters, empty personal archive.
- Initial load failure with retry; next-page failure preserving loaded rows.
- Detail loading, load failure, example removed/unavailable while open.
- Archive/restore pending, success, failure preserving selection, stale/expired
  confirmation, superseded token, oversized all-matching selection.
- Current, outdated, personally archived, globally archived, and combinations.
- Zero credits with fully usable free preview, archive/restore and saved-only mode.
- Preparation submission pending/uncertain result; recover existing progress before
  sending another operation. Never encourage duplicate paid requests.
- Queued, saved-reuse progress, active generation, partial first round, later rounds
  pending/ready, completed all coverage.
- Stopping while a child generation settles, paused by user and explicit resume.
- Insufficient credits with partial saved examples and resume after replenishment.
- Temporary capacity, model unavailable, provider failure and transient network
  failure, each with appropriate retry/resume and retained partial work.
- Vocabulary/direction changed: stale preparation and start-again guidance.
- Lost sharing access, signed-out session and dictionary removal: stop dependent
  actions and provide a safe return/reauthentication route.
- Inactive manifest expired, preparation storage quota reached, concurrent active
  preparation already present, and slow polling while last progress stays visible.
- All words reused without a generation, saved-only with incomplete coverage,
  and fully prepared dictionary above 100 words.

A completed preparation is not a completed practice session. Route a ready round
into the established practice screen. Preserve its separate AI/free/manual checks,
reference handling, final results and exact/fresh replay behavior.

## 7. Visual, accessibility and prototype deliverables

Use existing typography, spacing, tokens, buttons, badges, surfaces and icons.
Keep desktop layouts compact and deliberate; on mobile, stack filters sensibly,
keep selection actions reachable and use detail/back navigation without nested
modals. Support light/dark themes, keyboard selection and navigation, visible focus,
screen-reader labels, live status announcements, dialog focus return, reduced
motion and long multilingual text. Keep the controls valid for RTL languages too.

Create interactive happy paths for preview → archive → restore, filtered all-page
selection → confirmation, saved-first background preparation → partial round
practice, and stopped preparation → resume → completion. Use fake data only.
Provide separate clearly named state variants for errors and quota/access cases;
prototype state-switch controls belong in a demonstration area, not product UI.

Include final desktop/mobile screens, detailed preview, confirmations, preparation
setup/progress, later-round discovery and representative error states. The output
must be sufficiently specific to implement faithfully, with no invented backend
capabilities and no concrete API routes.
