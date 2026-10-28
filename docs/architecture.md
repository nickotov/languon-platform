---
type: architecture
title: Languon architecture
source_paths:
    - apps/backend/src/modules
    - packages/contracts/src
    - apps/web/src/fsd/widgets/contextual-assistant
    - apps/web/src/fsd/pages/knowledge
    - apps/web/src/fsd/pages/texts
    - apps/web/src/fsd/features/text-reading
    - apps/web/src/fsd/pages/learner-portrait
    - apps/web/src/fsd/entities/learner-portrait
---

# Architecture

Browse the [source-backed diagram atlas](diagrams/README.md) with `pnpm diagrams`
for system boundaries and authentication, AI/accounting, learning, Texts,
Knowledge, audio and operational flows. Each diagram records its implementation
and ADR inputs and reports changes since review.

## System boundaries

Languon begins as a modular monorepo. Applications own delivery concerns while
shared packages expose narrowly scoped capabilities. Cross-workspace imports
must use package public exports; applications must not import another
application's source files.

```text
web / admin / mobile
        |
        v
   HTTP contracts
        |
        v
     backend --------> (planned) private product object storage
        |                            |
        |                            v
        |                     scanner quarantine
        v                            |
   PostgreSQL <--------------- dictionary worker
        |                    |
        +--> Redis           +--> credentialless parser child process
                             +--> Mastra / model and OCR providers
                             +--> Langfuse
```

## Backend

The backend follows domain-driven design inside each business module:

```text
interface/infrastructure --> application --> domain
```

- Domain contains entities, value objects, domain services, and repository
  contracts. It has no Hono, database, cache, model-provider, or external SDK
  dependencies.
- Application coordinates use cases and depends on abstractions. Use
  constructor injection and explicit transaction boundaries.
- Infrastructure implements repositories and external adapters for PostgreSQL,
  Redis, Mastra, model providers, and Langfuse.
- Interface code owns Hono routes, authentication boundaries, request/response
  mapping, and OpenAPI declarations.

The dictionary worker is a separate process built from the backend image;
private product storage, scanning, parser sandboxing, and OCR remain planned for
the document milestone. Root worker composition owns timers, process signals,
concurrency, and readiness, then calls a dictionary application worker service
that owns the job/lease state machine. Dictionary infrastructure implements
PostgreSQL and provider ports. HTTP handlers will enqueue bounded work and return without
waiting for providers. Model, OCR, scanner, and object-storage SDKs will remain
behind application ports. Native document parsing will run in a separate
credentialless, egress-denied child-process sandbox inside the worker service;
the worker will validate its bounded IPC output before use. No additional
service/image topology is authorized by this sandbox boundary.

Validate all external data with Zod at its system boundary. Keep transport and
persistence representations out of domain objects.

## Web and admin

The public Next.js application uses a pages-first Feature-Sliced Design. Its
allowed dependency direction is:

```text
app -> pages -> widgets -> features -> entities -> shared
```

A layer imports only from lower layers. Next.js route files in `src/app/` stay
thin and compose page slices from `src/fsd/pages/`. FSD layers live below
`src/fsd/` because Next.js reserves a top-level `src/pages/` directory for the
legacy Pages Router. Server state belongs in TanStack Query when it needs client
caching; shared client state belongs in Zustand; component-local state remains
React state.

Frontend slices use `api`, `hooks`, `lib`, `model`, and `ui` segments only when
needed. Components live in one-component folders below `ui`. Web composition
uses colocated CSS Modules and canonical size/space/radius tokens under ADR-0029.
Global CSS is limited to reset, theme and app foundations. Shared primitives live in `shared/ui`
and include colocated stories. Prefer semantic native elements, including
`dialog` and popover primitives, before custom interaction machinery. Avoid
prop drilling through unrelated components by selecting scoped context, shared
client state, or a typed `shared/lib` event bus according to ownership and
lifetime. Root ESLint configuration enforces the public-web FSD direction;
`.agents/skills/frontend-development/SKILL.md` defines the implementation
workflow.

The private administration application is a Vite SPA built with Refine, React
Router, and Ant Design. It uses `app -> pages -> widgets -> shared`: `app` owns
route/provider composition, `pages` owns route screens, `widgets` owns reusable
page composition, and `shared` owns API/auth/theme/i18n and low-level UI. It
shares only framework-neutral browser authentication protocol and coordination
through `@languon/browser-auth`; it never imports public-web application source.
ADR-0010 defines the framework, persistent owner membership, per-request
authorization, dedicated refresh cookie, and private-edge boundary.

Public-web visual behavior uses the exact accepted Magic Patterns token names
and values consumed from CSS Modules (ADR-0029), with
`--sys-*` compatibility aliases for legacy consumers. The SSR-resolved
Light/Dark/System preference, app-local primitives in
`apps/web/src/fsd/shared/ui`, colocated Storybook stories, and verified runtime
composition own implemented behavior. `design/DESIGN_SYSTEM.md`, Figma Make,
and `design/main.pen` may provide design input but do not gate ordinary
implementation. Explicit supplied-design fidelity uses a source-derived
section/control/state inventory and matched rendered comparisons through
`ui-ux-composition`; runtime architecture does not justify silent omissions.
Visual changes synchronize
runtime code, affected stories/tests, and browser evidence; design artifacts are
updated only when explicitly in scope. ADR-0016 defines this ownership boundary.

The same design sources contain a separate Administration application variant
for dense operational screens. Admin maps those tokens to Ant Design light and
dark algorithms, retains a System preference, and implements tables, filters,
status labels, explicit mutation dialogs, and responsive navigation without
reusing the public web component implementation.

The web application keeps URLs independent of language. Its root layout selects
an allowlisted locale from the preference cookie, then `Accept-Language`, with
English fallback; server-loads a typed shared message catalog; and provides
translation and formatting helpers to the rendered tree. Manual selection
updates only the cookie and refreshes the unchanged route. ADR-0007 defines this
contract.

The root web layout owns one session-aware sidebar shell on all normal pages,
with a 240px expanded desktop sidebar, 64px collapsed rail, tablet rail/drawer
and mobile top bar/modal drawer. Text editors remain within this chrome.
Private navigation queries are enabled only for authenticated users and scoped
by user identity. Guests have Sign in and a Settings preference popover; signed-in
users retain the account menu. Both reuse locale/theme controls. The logo leads
to the home dashboard at /, which includes the optional learner-portrait entry.
The focused /portrait/interview route renders without the sidebar. ADR-0030 replaces only ADR-0007's original
top-right preference placement; its locale/persistence contract remains active.

The navigation module stores owner-scoped last-opened/pin metadata; Dictionaries,
Texts and Knowledge supply bounded current-summary reads through focused adapters.
Whole-library title search does not preload private contents into the browser.
Successful document loads record recency, while hover/prefetch do not. Account
purge explicitly erases metadata while retaining the minimal user tombstone.
Typed companion-layout visibility lets narrow desktop editors temporarily yield
the sidebar to the rail without replacing user preferences. See
[ADR-0043](adr/0043-sidebar-navigation-and-optional-text-folders.md).

## Mobile

The Expo application groups user-facing screens separately from reusable
features, entities, and shared platform adapters. Platform-specific code must
be isolated behind an interface and verified on each affected platform.

## Contracts

`@languon/contracts` is the source of truth for data crossing application
boundaries. Export Zod schemas and derive TypeScript types from the schemas.
The backend uses the same schemas to generate and validate OpenAPI operations.

## Data and prompts

- PostgreSQL is the durable source of truth.
- Redis is used only for explicitly disposable cache, coordination, and
  short-lived state.
- Database access is implemented in backend infrastructure through
  `@languon/database`; domain and application layers never issue SQL directly.
- Local prompts in `@languon/prompts` are deterministic fallbacks for local,
  test, and staging workflows. Configured environments may resolve managed
  prompts through Langfuse, with local fallback on an unavailable prompt.

## Dictionary platform

This section records the accepted target boundary for implementation beginning
in Dictionary Platform M1. The `dictionaries` backend module owns typed current
dictionary, settings, card,
revision, job, proposal, and upload metadata. Current vocabulary will be
relational and directly queryable; schema-versioned JSON is limited to immutable
revision snapshots and untrusted review proposals. Each card belongs to one
dictionary, and a fork creates independent identities rather than shared mutable
content.

Future workbook, lesson, course, and exercise modules compose vocabulary through
explicit link tables to stable dictionary or card IDs. They may later pin an
immutable revision for publication, but do not depend on a generic asset payload.
[ADR-0011](./adr/0011-dictionary-persistence-and-composition.md) defines this
boundary.

AI generation and document ingestion are review-first asynchronous workflows.
PostgreSQL is their durable queue; a separately scalable worker command from the
backend image leases versioned jobs. Private product uploads enter quarantine,
must pass fail-closed malware scanning, and are deleted after terminal processing
or abandoned-input cleanup. Product storage credentials and lifecycle are
separate from database backups. [ADR-0012](./adr/0012-dictionary-worker-and-document-ingestion.md)
and the [operations design](./operations/dictionary-jobs-and-documents.md) define
the execution and trust boundaries.

## Shared text AI routing

The backend `text-ai` module owns a code-reviewed provider/model catalog and
administrator-owned default/per-flow routing revisions. Learners cannot choose
models; learning preferences and action budgets remain independent. Dictionary,
learning, texts, conversations and portraits own their typed agents, jobs and
result validation. Admission pins compatible candidates, processing fingerprints,
provider prices and separate flow tariffs inside the existing financial transaction.
A bounded candidate query and transaction-only immutable policy reads avoid
repeated round trips; no cross-request cache stores financial authorization.

Manual admin probes use the production prompt/schema/adapter with synthetic data,
operator spending limits and append-only expense records. Matching flow checks gate
activation; current runtime health is separate from configured state. Runtime health
observations derive identity from an admitted dispatch receipt and live typed
lease/fence. Learner policy refusals and local cancellation cannot suppress a
shared route. No learner request triggers a paid readiness check.

One approved fallback can run only within the original action allowances after
conclusive rejection/completion and before conflicting publication. Queued claims
return the actual selected receipt; dispatch rechecks emergency disable immediately
before HTTP. Inline runners bind their selected candidate to the corresponding
receipt. Technical failures do not add learner charges; unknown provider expense
stays unknown. Credential/adapter/flow changes fail closed and require a matching
check and explicit new action. No arbitrary-provider or generic-prompt API exists.
See [ADR-0046](adr/0046-admin-owned-text-ai-routing.md), the
[confirmed design](text-ai-routing-design.md) and
[admin flow](user-flows/admin-text-ai-routing.md).

## Sentence learning backend

The learning module owns typed sentence generation/checking, additive exercises,
personal attempts and explicit free reference reviews. Private references never
appear in ordinary exercise or job projections. Saved-first completion includes
personal AI checks and manual reviews, while their statistics remain separate.
Versioned exposure/coverage survives retirement and removal of other contributing
entries; full copied-candidate provenance drives strict derived-content erasure.

Dictionary and sentence work share credit settlement, a capacity lock, numerical
queue/running/provider accounting and the existing bounded root worker slots.
Exact namespaced capability evidence and immutable job guards protect mixed-worker
rollout. API admission defaults on in development/test and off in staging/production,
with an explicit environment override; workers still drain existing work. Restricted
roles and actor/owned-dictionary purge participants preserve private-data and
numerical-accounting boundaries. See [ADR-0027](adr/0027-typed-sentence-work-and-shared-ai-accounting.md)
and the [backend flow](user-flows/sentence-practice-backend.md).

The [assistance extension](sentence-practice-assistance-implementation-plan.md)
adds `sentence-generation:v2` with contextual vocabulary hints stored in the
existing public exercise JSON. Helper associations carry no dictionary entry
identity and do not participate in required-target coverage or AI assessment.
Exact legacy v1 content remains readable and queued v1 work remains drainable.
Database checks pair job format with input policy and public exercise policy with
its relational version. Worker claims respect the configured processable-format
allowlist. Admission defaults to v1 for the expand stage; v2 activation requires
compatible clients, capable rollback-floor workers and an active compatible
immutable model configuration revision. Planned normalized free comparison and
exact session replay use the existing authorized reference action and client
session state; they add no backend score or new endpoint. Their UI is pending the
versioned design handoff.

## Flashcard learning backend

The backend `learning` module owns personal flashcard preferences, content-free
attempts and one current result per learner/entry; public contracts live under
`packages/contracts/src/learning`. Dictionaries retain content and live access.
An infrastructure transaction participant rechecks authority and monotonic learning
revisions atomically with progress operations. Effective learning changes invalidate
results without fabricating authored revisions. Permanent content deletion cascades
learning rows; learner account purge explicitly removes foreign-dictionary rows.
See [ADR-0024](adr/0024-flashcard-learning-state-and-revisions.md).
The web training launcher and Cards flow are implemented. The backend capability
defaults enabled under [ADR-0025](adr/0025-flashcard-capability-enabled-by-default.md),
with explicit false retained as an off switch.

## Release and deployment

Languon production artifacts remain four immutable OCI images: web, admin,
backend, and a one-shot migrator. The backend image supplies both the HTTP and
dictionary-worker commands; a worker is a separately managed service role, not
a fifth image identity. GitHub Actions publishes exact digest manifests to GHCR.
A manually dispatched staging run qualifies, builds, and
deploys the current `stage` commit; publishing a stable SemVer release from
`main` qualifies/builds only, and a separate protected manual workflow promotes
that already-built manifest to production. Ordinary pushes and pull requests do
not start release CI.

Every application host has one stable NGINX edge and blue/green Docker Compose
application slots. Deployment applies a backward-compatible singleton
migration, gates the inactive slot on dependency-aware readiness, validates and
reloads NGINX, then retains the previous containers while old connections drain
for up to five minutes. Application rollback promotes the previous digest
manifest through the same gates and never automatically reverses schema.

Each slot's worker overlaps during
promotion only for compatible versioned job formats and immutable generation
budget envelopes. The release manifest binds the shared API/worker token and
price ceilings, and deployment rejects a candidate whose jobs could not be
claimed by either the candidate or rollback-floor worker. A terminating worker will
stop leasing, cancel or finish bounded provider work, and release recoverable
leases. API readiness will not require live model, OCR, scanner, or
product-storage capability; worker capability and queue health will be separate
deployment and monitoring gates.

Staging initially places edge, both transient application generations,
PostgreSQL, and Redis on one VPS while keeping data volumes outside application
slots. Production separates the application host from a PostgreSQL/Redis data
host connected only by a provider private network. Admin and host management
remain on the private operator network; database/cache ports are never public.

The deployment core uses OCI, Compose, NGINX, SSH/Tailscale, and S3-compatible
storage so the provider remains replaceable. Timeweb panel/network details are
an operations adapter. See [ADR-0009](./adr/0009-release-and-deployment-platform.md)
and the [operations handbook](./operations/README.md).

This document describes the current structure and boundaries. ADRs under
[`docs/adr`](./adr/README.md) explain why durable choices were made. Read the
relevant accepted ADRs before changing a boundary. Keep feature-local choices in
the active `EXEC_PLAN.md`; promote choices that future features must respect to
an ADR before implementation diverges from the documented architecture.

## Shared pronunciation and pricing

The speech module owns canonical normalized text, immutable recordings,
generation coordination and private object inventory. Dictionary and learning
modules resolve saved references and enforce live source access, including hidden
reference-answer and checked-attempt boundaries. Provider/storage adapters stay
behind application ports. Root worker composition retains bounded execution.

Approved equivalent text/language recordings are reused across actors before
resolving a new default synthesis profile. Successful text/audio is retained
indefinitely; account/content removal revokes bindings and removes associations
without erasing these derivatives. Privileged administrative deletion confirms
link impact and removes every object version through durable inventory. Private
text may remain in retained derivatives. See
[ADR-0031](adr/0031-shared-pronunciation-and-retained-recordings.md).

The credit module owns immutable editable tariff revisions, independent of
provider operational estimates and pricing-schema versions. New admissions pin
effective rates. New text actions use bounded action holds and success-only
customer settlement under [ADR-0045](adr/0045-action-accounting-and-provider-expenses.md);
technical failures remain operator expense.
Paid speech reserves an exact confirmed quote and settles only after successful
publication, with permanent billing closure after release/deadline. Cached/joined
playback is free. See
[ADR-0032](adr/0032-model-price-revisions-and-speech-settlement.md).

Standard development storage is separate persistent MinIO with a private,
versioned bucket and scoped application credentials. Production uses private S3
with independently verified Selectel behavior; disposable test storage does not
share development or production data. Operational activation and rollback gates
are documented in [shared pronunciation operations](shared-pronunciation-operations.md).

## Texts and contextual vocabulary

The `texts` module owns private folders/texts, bounded aligned sentence values,
manual-edit provenance, capability sharing, independent copies and durable language
identification/translation proposals. Dictionaries own contextual selection jobs
and generated vocabulary publication. Both use shared text-AI model selection,
credits, immutable execution snapshots and the existing bounded worker slots.
An explicit Add authorizes atomic card publication (including a newly named
dictionary); translation still requires explicit Save. Temporary occurrence context
is redacted separately from persistent dictionary semantic hints. See
[ADR-0035](adr/0035-texts-and-contextual-vocabulary-publication.md) and
[the Texts feature](../.agent/features/043-texts/FEATURE.md). The web app exposes
Texts beside Dictionaries, with pages-first FSD library/folder/workspace/public
pages and focused reading/management features. Explicit saves preserve aligned
sentence identities and paragraph separators; translated content enters edit mode
only through its edit action. Public capabilities remain in URL fragments and
ephemeral client state; authentication continuation retains only supported share
paths. The selected Magic Patterns source is adapted through existing primitives,
CSS Modules and runtime tokens (ADR-0029).

Texts now have optional zero-or-one same-owner folder membership. Independent texts
are listed separately from folders; canonical editor URLs identify the text rather
than its current folder. Version-checked moves preserve content and direct shares;
shared destinations require acknowledgment of the current share identity/version.
Owner/folder/share authority is rechecked for nullable membership at job admission,
proposal publication and vocabulary collection. Independent detection:v2 and
translation:v3 formats keep incompatible older workers from claiming that work.

Translation v2 pins a task-specific reviewed capacity profile into the existing
immutable model snapshot; dictionary and legacy request caps remain unchanged.
The worker format filter isolates new work from v1-only workers. Profile limits
stay inside existing aggregate token/cost reservations. See
[ADR-0036](adr/0036-task-specific-text-translation-capacity.md) for profile
validation, conservative preflight and shared-model rollout/rollback floors.

## Contextual language assistance and Knowledge

The backend `conversations` module owns private source-associated histories,
copied attachments, editable proposals and durable turn leases/replay events.
Its source adapter checks current dictionary/text/note access separately from
content versions. Each admitted turn freezes the wording discussed; ordinary
source edits refresh subsequent turns. Permanent primary-source deletion removes
associated chat/memory/drafts, while independently saved notes survive.

The separate `knowledge` module owns independent notes, including learner-written
documents. A new note starts as a private, empty Draft with a stable ID. Server
working branches recover unpublished edits; version-checked autosave creates a
separate branch on conflict, and explicit resolution discards only named
alternatives. Explicit Save publishes the selected branch as an immutable
revision; Save a copy creates another independent note. No note stores an origin
dictionary/text/chat reference. Tools may retrieve authorized material and
propose validated note content; only authenticated application commands publish.
Restoring a revision creates a new version; if unpublished prose differs, the
restored publication appears as an alternative branch and Save waits for
explicit resolution. A revocable unlisted capability reads
only the last published note; signed-in readers copy that version before editing
or chatting. Scheduling account deletion revokes those capabilities.

Every Knowledge workspace turn freezes the complete current editor plain text,
including unsaved changes, any selected passage, and a validated target anchor
bound to that exact snapshot. The anchor is persisted with the private turn and
reply, allowing safe proposal placement after reopening; changed wording
requires comparison or a new target. Owned Text references are
authorized and copied into that one message; original changes do not rewrite
the copy. Separate configured character limits govern editor and copied
material, followed by a complete model-input budget check after memory
compaction. Multiple private conversations belong to the note but never appear
in the shared response. Existing dictionary/text source chat keeps its own
draft/excerpt behavior.

Mastra Memory1.26.0/Core1.57.0 use an application-owned transactional adapter.
Observation, reflection and actor calls share bounded per-turn execution and
credit settlement. The existing worker pool executes conversation turns and
numerical usage remains in combined capacity after content deletion. Chat and supporting memory calls use the same administrator-owned flow route
and pinned candidates as other text work; learners do not choose their model.

Web chat uses Vercel AI SDK UI with a custom transport projecting durable events
into typed message/tool parts. Disconnecting a subscription leaves worker work
running; explicit Stop requests cancellation. Knowledge editing uses Tiptap with
a restricted, versioned ProseMirror contract and fixed safe rendering. Chat
Markdown remains separate and uses a restricted Streamdown renderer. Active SSE
delivery and native incremental SDK projections retain durable replay; localized
work/tool/writing activity stays visible before text and during pauses. See
[ADR-0041](adr/0041-durable-tutor-streaming-presentation.md), [ADR-0037](adr/0037-independent-knowledge-and-agent-proposals.md),
[ADR-0042](adr/0042-knowledge-workspace-document-and-context-boundaries.md),
[feature044](../.agent/features/044-contextual-language-assistant-and-knowledge/FEATURE.md)
and [feature047](../.agent/features/047-knowledge-workspace/FEATURE.md)
for decisions and implementation evidence.

## Learner portraits and guided interviews

The backend `learner-portraits` module owns approved bounded items, their consistent
summary, a separately approved draft, and one resumable unfinished interview.
Version counters prevent stale approvals; generation and lease fences prevent
pending work from recreating deleted content. The standalone interview uses its
own private operation/context store, not ordinary conversation memory. Approval,
discard and fourteen-day inactivity cleanup erase interview content while
retaining necessary numerical provider accounting. Account purge explicitly
participates in this domain.

The interviewer produces reviewable proposals from the current interview and
approved portrait only. It cannot read other chats or publish/enable changes.
Manual edits derive the summary without a model call. Shared text-AI admission
pins model/pricing and the server-only `AI_INTERVIEW_CREDITS_BYPASS` policy per
operation; free interviews retain provider cost/capacity records and do not
change ordinary AI charging.

Conversation admission reads the current approved portrait and global/per-chat
use controls in the transaction that freezes response context. Explicit manual
fields win; inherited fields resolve from the portrait with saved defaults as
fallback. Existing conversations require explicit adoption for their prior
settings. Portrait context is transient to actor response generation and is not
added to observation/reflection memory; disabling cannot erase ordinary history.

The web portrait entity validates private API DTOs and keeps owner-scoped query
state with monotonic versions. Management, editor, interview and entry slices
compose real routes and shared primitives. Session transport pins owner identity
through authentication retries, and multi-step portrait flows recheck it before
dispatch and response use. Interview input remains in mounted UI or the
server-owned unfinished interview, never a new browser storage archive.
See [ADR-0044](adr/0044-learner-portrait-approval-and-use-boundaries.md),
[the verified journey](user-flows/learner-portrait.md), and
[feature051 evidence](../.agent/features/051-learner-portrait/EVIDENCE.md).

## Action accounting and provider expenses

Provider-price discovery uses the ai-credits port and reviewed adapters for all
real text/speech catalog models, independently of credentials and retirement.
MCP `verify_model_prices` separates official identity/rate verification, local
comparison and execution readiness. `actualize_model_prices` prepares native
price revisions; `admin_apply` retains version, audit and replay authority. New
actions require new credential snapshots, while the flat writer stays separate.

Versioned native rules preserve billing units, currencies, component rounding,
minima, tiers, endpoints and time windows. Matching TypeScript/SQL evaluation
reserves bounded maxima and settles trusted per-call facts, preserving unknown
expense. Native SDK calls receive database dispatch receipts and write-once usage
checkpoints. Native overrun facts remain recorded and restrict future admission;
learner refund/output fences remain separate. A known native provider-reported
monetary amount yields a measured provider expense even if aggregate SDK token
counts are absent; action/customer token measurement and probe-result validity
remain independent. Canonical native dictionary completion leaves its legacy flat
cost projection null and retains the full immutable primary expense, including
amounts beyond that secondary integer column. Legacy pins remain unchanged.
Reviewed task bounds are still required even when official prices are verified.
See [ADR-0049](adr/0049-native-provider-pricing-and-accounting.md) and the
[native pricing guide](user-flows/model-price-coverage-and-onboarding.md).

The ai-credits module joins typed feature transactions for exact milli-credit
holds, attempt authorization and outcome-aware settlement. Customer tariffs,
capability funding policies and provider USD rates are independent immutable
revisions. Learner action limits and shared operator account/day and global/day
budgets constrain new work, including free interviews and unlimited accounts.
Transactional wallet/capacity projections keep historical scans off admission;
bounded maintenance and report refresh use dedicated background connections.
Admin-only financial records retain payments, refunds, provider deposits and
reconciliation separately from learner credits. Financial reporting preserves
unknown expense and distinguishes granted credits from purchase revenue.

See [ADR-0045](adr/0045-action-accounting-and-provider-expenses.md) and the
[approved design](ai-credit-accounting-design.md). Delivery and measured load
capacity are tracked in [Feature052](../.agent/features/052-ai-accounting/FEATURE.md).
