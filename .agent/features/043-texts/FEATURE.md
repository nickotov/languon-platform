# Texts translation and vocabulary collection

Status: Complete — v003 UI and authorized Texts capacity follow-up verified
Owner: Root
Created: 2026-10-15

## Authorization and delivery boundary

User authorized implementation of the agreed plan. Implement and verify backend,
then deliver a source-grounded Magic Patterns prompt. Wait for the returned selected
design before creating frontend UI. That checkpoint was followed by the verified
v003 implementation recorded below. No backlog task is completed by this work. Starting tree clean on main;
work branch feature/texts. No production deployment or push.

## Historical backend checkpoint — 2026-10-15

AC-01–AC-09 delivered and verified. Independent correctness/security reviews are
closed. [Magic Patterns prompt and version history](DESIGN.md) are ready. The
feature remained active then; the subsequent v003 implementation and final
verification are recorded below.
At that checkpoint no frontend UI had been implemented. The current v003 UI
implementation and pending completion checks are recorded below.

## Acceptance criteria

- AC-01: Typed user-owned flat folders with required name/optional description;
  titled texts with per-text distinct supported source/target languages; paginated
  lists, rename, archive and restore, optimistic concurrency, explicit saves of
  untranslated drafts and translated content. Source limit 20,000 Unicode code points.
- AC-02: Explicit language detection returns advisory supported-language suggestion
  requiring user acceptance. Whole-text translation preserves exact submitted source,
  paragraph structure and complete ordered source sentence coverage. Each source
  sentence maps to one target segment (which may contain multiple sentences), using
  stable IDs and validated source/target arrays.
- AC-03: Translation results are proposals until explicit Save. Both sides of each
  pair can be edited without changing IDs; server-owned per-pair/global edited
  markers record saved modifications. Confirmed retranslation replaces only on Save;
  failures/cancellation retain saved content. Language changes replace translation.
- AC-04: Collection from either side selects a <=200-code-point phrase within one
  sentence; complete containing sentence and immediate neighbors inform AI sense.
  Context is transient, distinct from persisted dictionary semantic context.
- AC-05: Explicit Add durably generates/saves translation, definition, example and
  example translation with card-level enable overrides, unchanged dictionary defaults,
  normal language settings/provenance/revisions. Existing same-pair dictionary or
  atomic new dictionary+card; no empty dictionary on failure, no duplicates on replay,
  duplicate confirmation, recoverable safe status and destination identities.
- AC-06: Unlisted sharing for translated texts and folders, anonymous read and signed-in
  collection/private independent copy. Live folders expose active saved translations
  and edits, never drafts. Folder copies snapshot visible contents; text copy chooses
  owned active destination. Rotate/revoke/archive invalidate access; restore remains
  private. Copies/collected cards survive source changes. No capability/owner leakage.
- AC-07: Durable bounded jobs use shared model preference, immutable execution/tariff,
  credits, capacity, leases/fencing, cancellation/retry/idempotency and compatible
  API/worker activation. Full-input/model preflight, validated tool-free model output,
  auth/version/share rechecks, account purge, raw-context cleanup and restricted roles.
- AC-08: Backend contracts/domain/API/provider/jobs, real disposable database fresh
  and upgrade migrations, concurrency/lifecycle/credits and deterministic API journeys
  pass. Independent correctness/security review and focused concurrency verification.
- AC-09: After verified backend, deliver docs/design-prompt/texts.md with stable UI IDs,
  source checklist, versioned DESIGN.md/v001 prompt snapshot/hash and index. Await design.
- AC-10 (implemented and verified from returned v003): Texts navigation, fullscreen two-column
  editor/reader, explicit matching and edit toggles, explicit Save/discard, phone
  source/translation tabs with tapped counterpart, selection popover and dictionary
  creation, linked success/failure toasts, share/copy/archive states, four locales,
  dark/light, RTL, accessible keyboard/touch, 320px/200% text and runtime fidelity.

## Agreed scope and defaults

Responsive web only; backend first. Flat folders; no moving, permanent-delete UI,
rich text, uploads/extraction or native mobile. Future docs/PDF/image extraction
feeds the plain-text input contract. Optional title defaults to first nonempty line.
One source sentence per initial pair; manual pair edits preserve correspondence
without AI realignment. Detection is user-triggered; languages explicitly confirmed.
Source/target vocabulary direction follows selected side; source remains exact.
Sharing uses live saved translated content. Whole feature completion requires UI.

## Documentation

New texts API/system guide and mapped deterministic integration journeys; future
browser guide coverage after design. Update relevant AI capability/worker and
architecture documentation. Design handoff owns prompt provenance, not requirements.

## Selected design and source-to-runtime inventory

User selected the directly readable [Magic Patterns design](https://www.magicpatterns.com/c/3bkwp6aroumx9kbdrfpju5)
and explicitly requires its buttons, icons, controls and layout; small shared-kit
adjustments are authorized. Target v003, artifact
`1d26e57d-ae12-4537-8e01-45e75e40456b`. Exact source and file hashes live under
[designs/texts/v003](designs/texts/v003/source-manifest.json). Source inventories
were inspected by each surface owner before implementation and consolidated here.

The MCP supplies64 nonempty source files plus18 empty inherited primitive
placeholders. Those empty entries are not treated as actual component source.
The established app primitives/tokens remain authoritative for those mechanisms;
parent-screen markup supplies their labels, icons, sizes and placement. No
published screenshot was retrievable (the OG image is generic provider branding,
not reference evidence). Fidelity is assessed against the supplied screen source
and real rendered controls/geometry, not a fabricated reference screenshot.

| ID    | Source surface and required content/controls                                                                                                                                      | Runtime owner / verification                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| UI-01 | Existing shell: Texts FileText peer beside Dictionaries; selected state, collapsed rail and mobile drawer.                                                                        | app-shell TextsNavigation; shell/browser checks    |
| UI-02 | Library max1152; x16/24/48 y32/48, header24/30, description14/16; large FolderPlus New folder.                                                                                    | library-page; desktop/phone                        |
| UI-03 | Segmented Folders/count + Archived/Archive/count; grid1/2/3 columns gap16; radius16 cards padding20 with40px Folder icon.                                                         | library-page; populated/empty                      |
| UI-04 | Folder title/description/empty-description, real total/translated count, updated date; Link2 shared and Archive badges.                                                           | folder-card; metadata DB/tests                     |
| UI-05 | Card MoreHorizontal menu Open(FolderOpen), Edit(Pencil), Share2, separator/Archive; share disabled without saved translation; ArchiveRestore menu/footer.                         | folder-card; button/menu tests                     |
| UI-06 | Library3-card skeleton, InlineAlert/RefreshCw retry, active/archive empty states; load-more beyond first25.                                                                       | library queries/browser                            |
| UI-07 | FolderForm small dialog, Name required, optional description, examples/help, Cancel/Create/Save, inline validation/busy/error.                                                    | text-management FolderFormDialog                   |
| UI-08 | Folder max1024, breadcrumb Texts/name, description/badges, Edit/Share/Archive options, Plus Add text; archived info+Restore.                                                      | folder-page; browser                               |
| UI-09 | Underline Texts/count + Archived/count, bordered divided text rows with title/languages/ArrowRight/status/shared/date; Rename/Share/Archive or Restore menus.                     | folder-page TextRow; query/control tests           |
| UI-10 | Folder loading skeleton, missing/empty/error/retry, private drafts note and Preview public page footer.                                                                           | folder-page; public sharing flow                   |
| UI-11 | Archive confirmation Archive/Check icons, name, sharing/restore/privacy/independent-copy consequences; Cancel/Archive and busy/error.                                             | ArchiveTextDialog                                  |
| UI-12 | Rename small dialog, title field/help, Cancel/Save title; metadata-only save never changes translated provenance.                                                                 | RenameTextDialog; content/API                      |
| UI-13 | Share dialog Globe visibility, live content explanation, Link2 Create, readonly unlisted URL, Copy/Check copied, ExternalLink preview.                                            | TextShareDialog; public journey                    |
| UI-14 | Revoke action/confirmation Keep link, destructive revoke, revoked success/RefreshCw new link; no raw secret in URLs except fragment.                                              | TextShareDialog; auth/capability tests             |
| UI-15 | Fullscreen workspace native dialog,64px header: X close, Texts/folder breadcrumb, truncated title/status, CircleDot/Loader/Check/Triangle save state.                             | workspace-page; real owner journey                 |
| UI-16 | Header desktop actions; phone bottom sticky action bar; MoreHorizontal Rename/Pencil, Share2(disabled draft), RefreshCw retranslate, Archive.                                     | workspace-header/actions                           |
| UI-17 | Source/target selects and ArrowRight, ScanSearch Detect, explicit Use/Check suggestion, X dismissal and Refresh retry; no silent language override.                               | workspace-languages; API/job tests                 |
| UI-18 | Compose optional title, exact source textarea/count20k, sample passage, max1152/gap40 desktop pair; dashed Languages translation empty state.                                     | workspace-compose; Unicode/source tests            |
| UI-19 | Explicit Save draft/Save icons and WandSparkles Translate; queued Clock/running Sparkles/cancel; no fake percentages or automatic persistence.                                    | workspace job/persistence; E2E                     |
| UI-20 | Job failures with retry/dismiss, model-capacity Zap recovery, credits/provider/source failures; preserve source and saved text.                                                   | workspace alerts; real jobs + unit                 |
| UI-21 | Completed unsaved preview, expiry/regenerate and Save; read mode Edit/Pencil; proposed retranslation Save new translation/Discard.                                                | workspace banners/actions                          |
| UI-22 | Edited banner; pair editor numbered source/translation textareas, stable IDs, sticky PencilLine edited marker, empty/length validation, Save/Cancel.                              | workspace pair editor; owner E2E                   |
| UI-23 | Close unsaved Save/Discard/Keep, retranslate, discard preview, cancel edits, conflict comparison both sides/newest-before-keep-mine; focus/Escape/unload handling.                | workspace confirmations/state tests                |
| UI-24 | Matching Switch explicitly off initially; desktop paired max1152 with48 gutter, sticky uppercase12px language headings,18/36 text and24 paragraph gap.                            | text-reading; focus/browser checks                 |
| UI-25 | Source and translation bidirectional dotted→solid underline+primary highlight on hover/focus, PencilLine edited markers; exact whitespace.                                        | text-reading; DOM tests                            |
| UI-26 | Below1024 Source/Translation segmented tabs,16/32 text, preserved position; tap/Enter counterpart bottom sheet both sides, X, Prev/Next Chevron and Back.                         | text-reading; phone journey                        |
| UI-27 | Native selection BookPlus trigger; one actual sentence, max200 codepoints, repeated occurrence/UTF16 exact; Info invalid notice and X.                                            | selection helpers; unit/E2E                        |
| UI-28 | Desktop384px anchored collection panel; phone selection bar + sheet; X, context highlighted occurrence/ArrowRight/Sparkles, skeleton.                                             | collection-layer; real pointer/touch               |
| UI-29 | Same-direction dictionaries/radio/Check/BookMarked/count; search when>5, empty/noresults, Plus new dictionary, fields-override Info, Cancel/Add card.                             | collect-panel; real dictionary API                 |
| UI-30 | New name +atomic explanation, ArrowLeft back/Create and add; duplicate existing term/translation with preview retry, Choose another/Add another.                                  | collection duplicate/new subflows                  |
| UI-31 | Concurrent independent job processing, dashed pending/solid success occurrence marks, cancel/retry/choose-again and Open dictionary toast links; specific failure reasons.        | collect queue; regression tests                    |
| UI-32 | Anonymous collection LogIn/sign-in continuation/Keep reading; native selection preserved while prompt open; secret only fragment.                                                 | public+reader; auth tests                          |
| UI-33 | Public64px Logo/header, Globe read-only badge, signed-in Avatar or LogIn; unavailable Link2Off card/Go to Languon uniform projection.                                             | public-page; public journey                        |
| UI-34 | Public folder max896 px16/24 y32/48, Folder eyebrow/name/description/live count, Copy whole folder, row Read(BookOpen)/Copy with ArrowRight direction.                            | public folder; total DB/browser                    |
| UI-35 | Public reader ArrowLeft back, title/languages, Match Switch/Copy to my folders, anonymous hint, reader tabs; edited markers hidden as reference.                                  | public reader header; browser                      |
| UI-36 | SignIn dialog real email/login/signup continuation +Keep reading; no prototype fake authenticated state.                                                                          | public auth dialog                                 |
| UI-37 | Copy dialog Copy/RefreshCw, independence and500 limit, existing/new destination radios/select/name, Cancel/busy/retry; success Open folder.                                       | public copy; atomic DB/browser                     |
| UI-38 | 320/390/1440 widths, long content/names, no page overflow, safe areas/software keyboard; visible focus and names, real focus-trapped dialogs and touch alternatives.              | browser/E2E/screenshots                            |
| UI-39 | Four existing locales en/ru/es/fr; semantic colors/geometry tokens, light/dark compatible dialogs; all labels and failures translated.                                            | locale/type/style/UI-kit checks                    |
| UI-40 | Prototype demo scenario controls, fake auth/network/model functions, dictionary-detail demo route and seed fixtures are harness-only. Real dictionary destination already exists. | intentionally adapted; no production demo controls |

### Integration decisions extending local D1–D4

D5. Preserve the design's real counts/shared badges and atomic new-folder copy by
adding optional owner projection metadata, public translated total, optional copy
name/destination and idempotent draft creation. These extend existing Texts
commands under the approved feature; no new persistent concept, migration or
production dependency. Database proof checks counts/lifecycle, metadata omission
on public documents, rollback and concurrent operation replay. Safe old requests
remain valid.

D6. Capability keys remain one-time/transient, account-scoped, fragment-only and
are never recoverable from server or query persistence. If an existing shared
item's key is unavailable in this session, Preview opens the share dialog with an
explicit replacement-link warning/revoke option. This adds a truthful recovery
state to the design instead of inventing a recoverable key. Copies use actual
`/shared/texts` and `/shared/text-folders` routes and real sign-in continuation.

D7. The design's demo “extended model” success is adapted to the app's actual
Preferences/model selection; runtime admission still enforces model capacity.
Exact backend limits remain authoritative (folder120/title200), preserving
existing valid saved values even where the prototype's fields used smaller caps.
No unsupported upload/move/nesting/deletion feature is introduced. Duplicate
preview resolves the existing owner dictionary API, not fabricated card data.

D8. Existing native Dialog/Popover/Menu behavior supplies focus and top-layer
semantics. Shared Dialog gets the designed Lucide X and semantic dark-safe text;
reading popovers target their enclosing native dialog. CSS Modules and tokens
implement all prototype utilities. A style-guard regression excludes the domain
string `text-folders` outside class context while still rejecting it as a class.

## Final delivery — 2026-10-16

AC-01–AC-10 and source inventory UI-01–UI-40 are implemented and verified.
The selected v003 design is integrated through existing primitives/CSS Modules,
including its desktop/phone controls, icons and recovery states. Independent
completion/security findings are closed; final tests, runtime captures and
source identity are in EVIDENCE.md and REVIEW.md. No unresolved product defect
or acceptance gap remains. No backlog task applies. Production activation remains
the documented explicit TEXTS_AI_ENABLED rollout, outside this local delivery.

## Capacity follow-up authorization — 2026-10-16

The user explicitly requested fixing preflight rejection and extending Texts model
limits. This reuses the authorized whole-text feature scope (AC-01/02/07); it is
not a new product journey. Immutable model snapshots, credit envelopes and
old-worker exclusion require feature-level verification. Follow-up branch:
`feature/texts-capacity`, from verified main `15eaeb9`. Existing v003 UI and source
provenance remain unchanged.

- AC-11: New whole-text translations use a reviewed, task-specific capacity
  profile within the exact provider model's supported limits, while dictionary
  limits and existing queued snapshots remain unchanged. Existing aggregate
  reservation ceilings remain authoritative. Meaningful multilingual article
  requests use the task profile and exact aligned JSON framing in conservative
  complete-request preflight (without claiming a foreign tokenizer is exact);
  genuine capacity overflow fails before provider dispatch, with no truncation
  or partial publication. Older workers cannot claim the new internal format.

Live DeepSeek's non-billable catalog currently lists deepseek-flash and
deepseek-v4-pro, not the configured legacy deepseek-chat. The current official
completion schema permits max_tokens through393216 for supported currentmodels.
Legacy DeepSeek/Kie routes have no newly verified higher cap and retain their
base profile. Adding a reviewed current DeepSeekFlash profile is implementation
scope; changing the user's current default/preference is pending their choice.

### Capacity follow-up completion — 2026-10-16

AC-11 is implemented and independently approved. The user selected DeepSeek
Flash for new jobs. New translation v2 work pins 128,000 input / 32,768 output
tokens; dictionary calls remain 64,000 / 8,192, and existing queued snapshots
are untouched. Texts attempts have a bounded 180-second deadline, renewed leases
and existing cancellation/fencing; other worker deadlines are unchanged. Exact
JSON framing replaces the fixed per-pair preflight penalty. Conservative model
fit checks remain, without an unsupported tokenizer claim or silent truncation.

The local model default is activated through a reviewed, audited operator
transaction after compatible migration/worker startup. Custom rates and aggregate
ceilings were preserved; the owner's preference was Auto and needed no update.
Backend and web auth health are 200. Production rollout remains separate and
must respect both the v2 and Flash shared-worker floors in ADR-0036.
