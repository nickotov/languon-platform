# User AI model preferences backend

Status: Complete
Owner: Root implementation agent
Created: 2026-10-04

## Problem and authorized outcome

BL-004 sentence practice needs learner-owned model selection, but existing text
routing is dictionary-owned and uses one platform default. On 2026-10-04 the user
requested implementation of the agreed [backend-first plan](../../../docs/sentence-practice-implementation-plan.md).
This feature owns the BL-005 backend prerequisite. Its profile UI and design brief
are deferred until both planned backends are verified.

## Acceptance criteria

- AC-1 — Authenticated users read Auto by default and persist Auto/curated explicit
  preference with optimistic concurrency; inactive users and foreign identity
  writes are rejected.
- AC-2 — Return sanitized model labels, enabled choices, capability, availability
  and relative current credit rates without credentials, endpoints or internals;
  preserve unavailable stored choices rather than silently rewriting them.
- AC-3 — Every existing dictionary text admission resolves the learner preference
  and pins immutable execution/budget/pricing. Changes affect only new jobs;
  same-key replay and provider retry preserve admitted configuration.
- AC-4 — Auto uses the configured default; unavailable/disabled/incompatible
  selections fail without fallback or new billing/allowance policy.
- AC-5 — Establish shared text-AI ports/infrastructure suitable for later learning
  capabilities, preserving DDD, current admin authorization/auditing, historical
  execution and mixed-worker compatibility.
- AC-6 — Verify contracts, HTTP, disposable persistence/migrations, selection races,
  current dictionary/provider/credit regressions and user-flow traceability;
  complete independent correctness/test and security review.

## Scope and constraints

Backend/contracts/migrations, existing dictionary routing and related docs only.
No frontend implementation, new provider, TTS/OCR settings, paid calls, grants,
production activation or speculative grammar capabilities. Do not generate design
prompts until the sentence backend is also ready. Existing prices and enforcement
flags remain unchanged. Preserve prior planning documents and unrelated user work.

## User-flow documentation

Create docs/user-flows/user-ai-model-preferences-backend.md for authenticated API
read/update and deterministic routed dictionary execution. Related guides:
ai-provider-management, ai-credit-wallet, dictionary-platform,
magic-profile-page, profile-account-controls. Existing profile UI journeys remain
unchanged; backend behavior has its own critical mapped test, not fabricated UI proof.

## Open decisions

None requiring product input. Local implementation choices follow the approved
plan and accepted ADRs. ADR-0021 ownership must be superseded narrowly before the
shared configuration seam is finalized.

## Completion

Backend scope complete after initial review remediation and scoped correctness/
security passes. All criteria and required relevant checks are verified in EVIDENCE.
Profile UI and the versioned Magic Patterns prompt remain deferred: the prompt is
created only after the sentence backend is also verified, then frontend delivery
waits for the returned design. BL-005 remains in progress for that remaining scope.

## Returned design scope and source inventory — 2026-10-04

The user's current request is to analyze the supplied design and take only the
modelPreference section in Account. This is a design-analysis continuation of
BL-005, not an implementation or completion claim. Backend status remains Complete.
Source identity and retained exports: [DESIGN.md](./DESIGN.md), candidate v001,
Magic Patterns provider v6. Inventory below is authoritative for this selected UI.

**Include:** the AI model section between profile details and account-data controls,
its saved/draft summary, model radio cards, alerts, actions and local navigation
confirmation. Compose it into the existing profile; keep existing tabs, account
controls and shell. The enclosing AccountTab/ProfilePage export is context only.

**Exclude:** redesigned identity/header, security, billing, upgrade/subscription
flows, credit purchases, account export/delete/restore behavior, theme controls,
scenario gallery, fixtures and simulated sign-in/persistence. Do not reproduce the
prototype's account deletion policy. The existing AI credits tab is only a link
destination; no new wallet screen is selected.

Intended ownership: a public `features/text-ai-preferences` slice for API, hooks,
model and UI; `pages/profile` composes it and owns route/tab navigation guards.
Use shared Button, Badge, Card, InlineAlert, Skeleton and Dialog contracts; do not
import the prototype application or global CSS/config.

### Required source UI and verification mapping

Every row is pending frontend implementation and runtime evidence. “Adapt” means
the retained presentation is used with real contracts, not a product omission.

| Inventory ID | Brief        | Source section/control/state                                                                                                               | Intended owner                                 | Verification and disposition                                                                                                                             | Implementation proof — 2026-10-05                                                                                                                         |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MP-UI-01     | MP-01        | ModelPreferenceSection: “AI model”, scope explanation and future-request help                                                              | Preference section/profile Account composition | Existing Account placement; other tabs unchanged. Include.                                                                                               | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-02     | MP-01, MP-03 | PreferenceSummary: saved Auto/effective context, saved explicit, unavailable saved identity; dirty saved→draft row and Not saved badge     | Preference summary                             | Auto/explicit/dirty/catalog-missing fixtures. Adapt: omit unsupported saved date/provider fields.                                                        | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-03     | MP-02        | Auto first; curated ModelOptionCard radios with selected/saved/unavailable/unknown badges, description, task labels and reason             | Model picker                                   | Keyboard single-choice, disabled selection, long names, empty catalog. Adapt catalog fields and add supplied relative rates.                             | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-04     | MP-03        | Save preference/Cancel changes; no-op disabled; saving retains selection and blocks duplicates; saved confirmation and polite live message | Preference controller/actions                  | Save, cancel, failure and duplicate-click tests. Include.                                                                                                | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-05     | MP-03        | Concurrent conflict: latest saved versus local choice; Use latest/Save my choice instead                                                   | Conflict alert/controller                      | Two versions, refetch latest, deliberate save with latest expectedVersion. Adapt, no blind overwrite.                                                    | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-06     | MP-02, MP-03 | Save network error Retry save; save-time rejection Choose Auto; saved-unavailable Choose Auto                                              | Preference alerts                              | Draft preserved; refresh availability; explicit remains saved until successful deliberate save. Include.                                                 | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-07     | MP-05        | Preference loading skeleton; independent catalog loading/error Retry; no available models Check again                                      | Load states                                    | Stable card geometry; usable loaded sections; Auto never falsely advertised executable. Include plus preference-fetch failure/retry (required addition). | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-08     | MP-04        | Free preference-change/paid new-request note; zero-credit warning; View AI credits; task-in-progress information                           | Preference context                             | Real wallet/context only, no fixture balances/model names; preference remains editable with zero credits. Adapt.                                         | Adapted: real credit note/link/task context; no mock wallet warning; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).     |
| MP-UI-09     | MP-03, MP-05 | LeaveConfirmDialog: Keep editing/Discard changes; offline draft notice; session-expired recovery                                           | Profile navigation/session integration         | Tab/back/leave behavior, real reconnect and sign-in; clear protected cache on sign-out. Adapt; do not copy fake connectivity/sign-in.                    | Implemented with recorded adaptations; [037 proof](../037-sentence-practice-web/EVIDENCE.md#model-preference-evidence).                                   |
| MP-UI-10     | MP-06        | Radio legend, labels, focus rings, status announcements, wrapping, mobile/dark/RTL/zoom                                                    | Preference UI/shared primitives                | Keyboard, touch, 200% zoom, narrow/wide and dark/RTL rendered checks. Include; fidelity unverified until rendered comparison.                            | Verified responsive/dark/keyboard; no supported RTL interface locale; [037 proof](../037-sentence-practice-web/EVIDENCE.md#design-scope-and-limitations). |

MP-05's 21 states map explicitly: 1–2→02/03; 3–4→10; 5–8→07;
9–10→03/06; 11–13→02/04; 14–15→06; 16→05; 17–18→08;
19–21→09. State gallery is retained as reference context only, never shipped.

### Geometry and presentation to preserve

Use the existing Account content width. The source SettingsSection is a bordered
rounded card with header/body separation; the model section uses vertically stacked
groups with 16px internal summary/card padding and 12px option gaps. Cards have
12px radius, 1px semantic borders, 20px radio controls, 12px radio/content gap,
14px model labels and descriptions, and 12px secondary capability text. Selection
uses primary subtle surface/border; unavailable options use neutral/dashed or
warning presentation, with textual badges. Saved summary uses a neutral subtle
surface. Conflict comparisons stack on narrow screens and use two columns from
`sm`; footer actions wrap/stack on narrow screens. Source semantic colors/radii
align with runtime globals; do not replace the global theme or approximate tokens.
Keep minimum 44px touch targets and 16px-scale icons with existing shared contracts.

### Contract discrepancies and required adaptations

- Public model summaries provide label, capabilities, availability/reason and
  relative credit rates. They do **not** provide the prototype's provider,
  marketing description or saved timestamp. Omit unsupported details rather than
  manufacture them. Use friendly labels for known capability IDs; unknown
  capabilities must not imply readiness. No exact per-request quote.
- An explicit model absent from the catalog can have selectedModel=null. Retain
  modelId and honest unavailable context; do not invent a retired friendly name
  unless already safely available from this actor's cached response.
- Auto context comes from defaultModelId and the actual catalog, not fixtures.
  Disabled/unavailable/incompatible all need an actionable disabled presentation.
- A version conflict is authoritative only after a server conflict/refetch.
  There is no supplied push notification or updatedElsewhere field. Preserve
  draft and compare with refetched latest; never infer another device changed it.
- The existing profile currently shows unavailable credit placeholders. Do not
  turn that absence into “0 credits”; fetch an established wallet projection
  where supported or retain generic credits help. The model preference is free.
- Offline “Check connection” cannot simply set online=true. Session recovery
  uses existing auth and removes stale protected settings. Local draft retention
  is in-memory only; no autosave/reload promise.
- Source primitives were not all returned at their guessed top-level file paths.
  Retained export is partial and sufficient for component-level scope analysis,
  not a complete runnable prototype. Shared primitive rendering remains unverified.

No frontend code or real-app/reference render comparison was performed in this
analysis. Upcoming implementation must evidence every required row, with
source/runtime visual comparison and existing profile/account regressions.

## Frontend continuation completed — 2026-10-05

[Feature 037](../037-sentence-practice-web/FEATURE.md) implemented and verified
this selected inventory. Its [evidence](../037-sentence-practice-web/EVIDENCE.md)
and [review](../037-sentence-practice-web/REVIEW.md) own frontend proof and resolved
findings. This backend feature remains Complete; no competing UI inventory or
external pixel-equivalence claim is introduced.
