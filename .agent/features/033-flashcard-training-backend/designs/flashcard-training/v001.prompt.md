---
type: design-prompt
title: Configurable flashcard training
status: awaiting-design
created: 2026-10-02
source_paths:
    - packages/contracts/src/learning/index.ts
    - apps/backend/src/modules/learning
    - apps/web/src/fsd/widgets/dictionary-editor
    - apps/web/src/fsd/pages/shared-dictionary
    - apps/web/src/fsd/shared/ui
    - apps/web/src/app/globals.css
---

# Configurable flashcard training

Copy only the fenced prompt below into Magic Patterns. It is self-contained and
requests a frontend design/prototype, not backend implementation or deployment.

Owning delivery: [feature 033](../../.agent/features/033-flashcard-training-backend/FEATURE.md).
Requirements: [implementation plan](../flashcard-training-implementation-plan.md),
[BL-002](../backlog/002-configurable-flashcard-training.md) and the flashcard slice
of [BL-003](../backlog/003-personal-learning-progress.md).
Versioned provenance and returned-design slot: [DESIGN.md](../../.agent/features/033-flashcard-training-backend/DESIGN.md).
Backend verification is recorded separately in [EVIDENCE.md](../../.agent/features/033-flashcard-training-backend/EVIDENCE.md).
This prompt is source-based, not a claim of rendered design fidelity or completed frontend.

## Copyable prompt

```text
Design an interactive, responsive React/TypeScript prototype for flashcard
training in Languon, a language-learning app. Keep the existing dictionary
workspace and authenticated shell recognisable; add training without redesigning
authoring, profile, navigation, audio or dictionary sharing. Use synthetic local
fixtures and an asynchronous mock API. Do not fetch real APIs or require tokens,
keys, external model services, a database, or paid integrations. Do not invent
unsupported capabilities. Provide a working prototype, not static screen images.

PRODUCT CONTEXT AND EXISTING UI
Owners edit dictionaries with a title, language pair, active entry count,
visibility badge, settings/more actions, cards and a floating large Add card
button. Source/translation word rows and example pairs use equal desktop
columns with a thin vertical separator and stack on narrow screens. Shared
readers see the title/language pair/count, an unlisted badge, read-only entries
and an existing private-copy/sign-in-to-copy action. Keep those existing actions.
Create dictionary belongs to the library and is NOT the training entry point.
Use a compact labelled Train menu beside the owner's floating Add card action;
shared readers get Train beside reader actions. Do not add editing controls for
readers. Menu choices: Cards; Sentences — Coming soon (disabled). No AI generation,
sentence practice, spaced repetition, streaks, leaderboard, audio generation,
grammar lessons or invented study history in this design.

DESIGN SYSTEM — MATCH THESE EXACT SEMANTIC TOKENS
Inter/system sans, 16px/1.5 body. Light canvas #f8f9fb, surface/elevated #ffffff,
subtle #f1f3f6; primary text #1b1e24, secondary #5b6472, tertiary #7c8797;
border #e4e7ec, strong border #d0d5dd; primary #4f46e5, hover #4338ca,
pressed #3730a3, subtle #eef2ff, on-primary #ffffff; success #106f54/subtle
#edfbf6, warning #b45309/subtle #fff8eb, danger #be123c/subtle #fff1f2.
Dark canvas #121417, surface #1b1e24, subtle #171a20, elevated #23262d;
text #f8f9fb/secondary #d0d5dd/tertiary #a6aebb; border #434a56/strong #5b6472;
primary #818cf8, hover #a5b4fc, pressed #c7d2fe, subtle #1e1b4b,
on-primary #121417; success #43c297/subtle #052a21, warning #fdb022/subtle
#451a03, danger #fb7185/subtle #4c0519.
Spacing 4/8/12/16/20/24/32/40/48/64px. Radius 4/8/12/16/24px/full;
buttons radius12px, default height44px (large52px), 8px icon gap; dialog radius24px.
Min touch target44px. Default button text14px, medium-weight; large16px.
Small shadow 0 1px 2px rgba(15,23,42,.06), medium 0 4px 12px rgba(15,23,42,.10),
large 0 12px 32px rgba(15,23,42,.14). Motion120/200/300ms; respect reduced motion.
Use named CSS variables or Tailwind v3 semantic utilities, no arbitrary palette.
Primary/secondary/ghost button variants; labelled native inputs/checkboxes;
native button-backed menu (Arrow Up/Down, Home/End, Escape and focus restoration);
native dialog-style focus trap with accessible title and scrollable body/footer.
Existing dialogs max-width384/512/672px, width calc(100vw - 32px), max-height85dvh.
These constraints do not require squeezing the practice surface into setup width.

STABLE REQUIREMENTS (keep these IDs in the delivered screen/state checklist)

FC-01 ENTRY AND ACCESS
Show Cards only when learning capability is enabled. Archived dictionaries cannot
train. Empty active dictionaries may open explanatory setup, but cannot Start.
Support owner, signed-in shared reader and anonymous shared visitor. Signed-in
shared readers save their own progress even though they do not own the dictionary.
Anonymous practice is allowed with a persistent gentle Session only message;
there is no saved progress for anonymous visitors. Sign-in must not silently
import anonymous ratings. Signing out, changing learner or changing share key
ends/clears the session; acknowledge already saved ratings without pretending
that delivered content can be recalled.

FC-02 SETUP
Cards opens a setup dialog with Front and Back groups, each selecting one or
more fields: Source, Translation, Transcription, Definition, Source-language
example, Target-language example. Defaults: Front Target-language example;
Back Source-language example. These example names mean language roles, not the
physical storage columns: a card may store its main example in the target language.
Each side requires a unique nonempty selection. Overlap is allowed; identical
sets show a helpful warning, not a block. Presentation order is Source,
Translation, Transcription, Definition, Source-language example, Target-language
example regardless of checkbox click order. Shuffle on by default; also offer
Dictionary order. Remember front/back and shuffle for signed-in learner/dictionary
across devices; defaults for anonymous users. Cancel saves nothing. A conflict
loading/saving remembered settings retains the draft; Reload saved settings or
explicitly Overwrite using refreshed version, not silent overwrite.

FC-03 SCOPE AND ELIGIBILITY
Default All active entries ignores editor search/loaded pages. Advanced Manual
selection shows searchable paginated source/translation previews, selected
count and selection preserved across searches/pages. Empty manual selection
blocks Start. Manual subset resets to All for each new session; it is not a
remembered preference. Explain that missing/disabled selected examples fall
back to corresponding source/translation word. Other absent optional fields are
omitted; an empty Front or Back excludes that entry. If fallback duplicates a
word explicitly selected, render the word once with its fallback explanation.
Show prepared Eligible/Skipped/Fallback counts and a no-eligible state. Fallback
count means entries with fallback, not the number of displayed fields. Do not
expose dormant disabled values. Selection/loading/errors are visible and retryable.

FC-04 START AND DISPLAY MODE
Start requests browser fullscreen directly from the click gesture, shows loading,
prepares an ordered eligible ID queue, saves signed-in preferences and fetches
bounded content. Unsupported/rejected fullscreen uses a viewport-filling overlay.
Switch to dialog mode and back without losing queue position, card face or stats.
Native Escape leaves fullscreen for dialog, not End. In dialog Escape/Close asks
End session confirmation; backdrop click does not end practice. Keep separate
labelled Fullscreen/Dialog and End controls. End says saved ratings stay but the
queue and Undo context are not resumed after close/reload. Handle initial request
failure without trapping the user. Mobile browser fullscreen is not guaranteed.

FC-05 CARD INTERACTION
Large readable card with Front/Back indicator, semantic field labels/language,
safe plain text and per-field LTR/RTL. Click or Enter/Space flips. Right drag/swipe
means Known; left means Practise again. Also show labelled Known and Practise
again buttons and left/right arrow keyboard equivalents. Ratings allowed before
or after flip. Preserve vertical scroll, text selection and control clicks;
small movement must neither rate nor accidentally flip. Swipe intent needs a
visible threshold/feedback and cancellation. No horizontal layout overflow on
320px; long multi-field text remains reachable. Do not nest controls in the
card's flip button. Directions stay explicit even in RTL layouts. Animations
must not be required to understand or use the card.

FC-06 SAVE, RETRY AND UNDO
Signed-in practice allows one mutation in flight. Show Saving and disable further
ratings; advance only after acknowledgment. Failed save preserves card, face
and pending choice, offers Retry same choice using the same operation ID, and
never silently continues unsaved. Anonymous ratings advance local state without
personal API calls. Undo latest acknowledged rating restores its previous card
face, counters and personal progress; available on practice AND results until
next successful rating or next round. Undo itself waits for acknowledgment and
can retry with its same operation ID. Newer competing saved result or changed
learning content gives a conflict, not an overwrite. Explain and refresh safely.
Preference conflict, stale content, reused-operation conflict and Undo conflict
need distinct meaningful user states, without exposing backend internals.

FC-07 RESULTS AND PROGRESS
Show round reviewed/Known/Practise again and Known percentage = Known/reviewed;
label it self-assessment, never accuracy. Separate round/session stats from
Saved dictionary progress: Known/Practise again/Unstudied across ALL active
entries, regardless of subset, chosen fields or queue. Anonymous sees only
session totals, no fictitious saved dictionary metrics. Results offer explicit
Practise again (only current session's latest Again group), Start over, Finish.
Do not automatically requeue misses. Shuffle each new round when on, otherwise
dictionary order. Retried entries update their latest session result; distinguish
review events per round from unique entry outcomes in the session. New entries
join next session, not today's queue. No invented accuracy/retention/time charts.

FC-08 LIVE CHANGE AND ERROR STATES
Removed/ineligible entries are skipped with notice; missing content is not shown
as a blank card. Changed content reloads before a fresh rating. Previously Known
content changed by editing becomes Unstudied in saved totals, even if changed
back later. Archive excludes entries; restoring unchanged content can restore
saved rating. Access revoked, owner removed or dictionary archived => clear
practice content and show unavailable/end state, not stale protected text.
Backend off/unavailable, malformed setup, rate limit with Retry-After, network
timeout and server errors need reachable retry/exit. Save errors must not pretend
an unknown outcome failed permanently; retry preserves idempotency key.

FC-09 RESPONSIVE AND ACCESSIBILITY
Provide desktop1280–1440, tablet768, ordinary mobile390 and narrow320 layouts,
light/dark, 200% zoom, long text and Arabic/Hebrew RTL sample. Preserve all actions
at every size; safe-area padding and reachable rating buttons. Keyboard focus,
focus return to Train on exit, accessible modal title, labelled controls,
status announcements without leaking text, non-color-only outcome signals,
44px targets, reduced-motion variant. Settings are a focused dialog, not a new
deep-linkable page. Do not hide common actions behind unlabeled icons.

IMPLEMENTED API SHAPES FOR THE MOCK ADAPTER
Base P is /learning/dictionaries/{dictionaryId} for owner, or
/learning/shared-dictionaries/{shareId} for shared. Shared requests use the
dedicated X-Languon-Share-Key header in the real app, never query/body or storage;
use placeholders only, not actual credentials. Authenticated personal requests
derive learner from bearer credentials; no learnerId in the JSON. Backend
rechecks live access on every call and replay. All responses are no-store.

GET /learning/capabilities => {flashcardsEnabled:boolean}.
GET P/entries?limit=25&search=...&cursor=... =>
{entries:[{entryId:UUID,source:string,translation:string}],nextCursor:string|null}.
GET P/flashcards/preferences =>
{configuration:{front:Field[],back:Field[]},shuffle:boolean,version:integer>=0}.
PUT P/flashcards/preferences body =>
{configuration:{front:Field[],back:Field[]},shuffle:boolean,expectedVersion:integer>=0};
response is preferences with updated version. Version0 means unsaved defaults.
POST P/flashcards/prepare body => {configuration,scope:{type:"all"}} OR
{configuration,scope:{type:"manual",entryIds:uniqueUUIDs[1..10000]}};
response => {entryIds:UUIDs[0..10000],eligibleCount,skippedCount,fallbackCount}.
Ordered IDs only, not all texts; shuffle client-side. Valid manual IDs not active
in this dictionary are counted as skipped, never reveal foreign content; malformed
IDs are rejected. Never assume selection search narrows All.
POST P/flashcards/items body => {configuration,entryIds:uniqueUUIDs[1..25]};
response => {items:[{entryId,learningVersion,front:Presentation[],back:Presentation[]}],
unavailableEntryIds:UUID[]}. Presentation => {field:Field,requestedFields:Field[],
text:string,language:string,direction:"ltr"|"rtl",fallback:boolean}.
GET P/flashcards/progress => {total,known,again,unstudied} (signed-in only).
POST P/flashcards/attempts body => {operationId:UUID,sessionId:UUID,entryId:UUID,
expectedLearningVersion:positiveInteger,round:positiveInteger,rating:"known"|"again",
configuration}; response => {attemptId,entryId,learningVersion,rating}.
POST P/flashcards/attempts/{attemptId}/undo body => {operationId:UUID}; response
=> {attemptId,entryId,learningVersion,rating:"known"|"again"|null}.
null means restored Unstudied. Attempts are per learner/entry, not per field setup.
Refresh progress separately; attempt response does NOT include totals or queue.
Server stores content-free attempt history, not queue position; no resume endpoint.
Field enum: source,translation,transcription,definition,sourceExample,targetExample.
Errors => {error:{code,message,correlationId,retryAfterSeconds?}}.
Codes authentication_required, dictionary_not_found, shared_dictionary_not_found,
entry_not_found, invalid_request, version_conflict, idempotency_conflict,
learning_version_conflict, undo_conflict, rate_limited, service_unavailable,
internal_error. Conflicts409; invalid400; auth401; unavailable404/503; rate429.
Never convert bad supplied authentication into anonymous practice.

SYNTHETIC FIXTURES AND INTERACTIVE DEMO
Dictionary Spanish→English “Everyday Spanish”, 32 active entries, source casa /
translation house. Default example front “The house is large.” (en,ltr,
targetExample), back “La casa es grande.” (es,ltr,sourceExample), version1.
Second entry caminar/walk has missing target example; front is
{field:"translation",requestedFields:["targetExample"],text:"walk",language:"en",
direction:"ltr",fallback:true}. Selecting translation plus targetExample
renders it once with requestedFields ["translation","targetExample"].
Third entry has no definition and no transcription: selecting only definition
on Front excludes it. Include an entry whose main example language is target,
an Arabic→English RTL sample, and a long multi-paragraph example within2000chars.
Selection spans at least two25-entry pages. Persist mock signed-in preferences
and independent learner A/B results in memory; anonymous makes zero personal calls.
Expose a clearly separate designer-only state switcher, not invented product UI,
for normal/empty/zero-eligible/missing-example/archived/anonymous/shared signed-in,
prepare failure/preference conflict/save pending/save lost-response retry/Undo
pending/conflict/content changed/removed/access revoked/rate limited/fullscreen
rejected. Simulate delayed acknowledgments and lost response after a saved attempt;
retry returns same attempt without double count. Offer these states intentionally
so the handoff includes designs for real failure and mobile paths.

DELIVERABLE
Working coherent prototype, named reusable components, light/dark and responsive
screens, complete state checklist mapping FC-01..FC-09, keyboard/gesture behavior
notes and explicit known deviations. Prioritise hierarchy, readable learning
content, clear progress and robust save feedback over decorative dashboards.
Do not present mock persistence or fullscreen simulation as production proof.
```

## Source checklist and limits

- FC-01–03: existing editor/shared reader, learning configuration and selection contracts.
- FC-04–06: baseline interaction requirements; frontend implementation is deliberately deferred.
- FC-07–08: learning progress, attempt/Undo DTOs and live-access/version semantics.
- FC-09: runtime tokens, shared native Menu/Dialog/Button contracts and accessibility requirements.
- Source base: `b7f4fe7`; relevant working-tree changes are feature 033 learning/contracts,
  dictionary learning revisions, account purge and backend composition. No frontend changes.
- No supplied external design, provider revision, retained design export or runtime
  comparison exists yet. No generated design is approved or selected for implementation.
- Backend feature activation/rollout checks and deployment readiness belong to the
  feature evidence, not this portable design prompt.
