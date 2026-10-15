# Texts translation and vocabulary collection

Status: In progress — backend-first
Owner: Root
Created: 2026-10-15

## Authorization and delivery boundary

User authorized implementation of the agreed plan. Implement and verify backend,
then deliver a source-grounded Magic Patterns prompt. Wait for the returned selected
design before creating frontend UI. Feature remains open and unmerged at that
checkpoint. No backlog task is completed by this work. Starting tree clean on main;
work branch feature/texts. No production deployment or push.

## Backend checkpoint — 2026-10-15

AC-01–AC-09 delivered and verified. Independent correctness/security reviews are
closed. [Magic Patterns prompt and version history](DESIGN.md) are ready. The
feature remains active: AC-10 is deliberately pending the user's returned design.
No frontend UI has been implemented, and the feature is not merged.

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
- AC-10 (deferred until returned design): Texts navigation, fullscreen two-column
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
