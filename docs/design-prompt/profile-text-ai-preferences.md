---
type: design-prompt
title: Profile AI model preferences
status: current
created: 2026-10-04
updated: 2026-10-04
feature: 035-user-ai-model-preferences-backend
source_paths:
    - packages/contracts/src/text-ai/index.ts
    - apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
    - apps/backend/src/modules/text-ai/application/text-ai-preference-service.ts
related_docs:
    - docs/sentence-practice-implementation-plan.md
    - .agent/features/035-user-ai-model-preferences-backend/DESIGN.md
    - docs/backlog/004-ai-sentence-translation-practice-done.md
    - docs/backlog/005-user-selectable-ai-models-done.md
---

# Profile AI model preferences — design prompt v001

Copy the entire portable block below into Magic Patterns. This handoff follows
verified backend completion and independent review. It requests design only;
frontend implementation awaits the returned design and its source identity.

Contract fingerprint: `ee98b0a598f680c0efc2176909a046963022ec97b89962438d488338deff87d9`. Source paths are listed above. The immutable
snapshot and selection record are in the [versioned handoff](../../.agent/features/035-user-ai-model-preferences-backend/DESIGN.md).
The [implementation plan](../sentence-practice-implementation-plan.md) owns product
scope and future Jev research; no Jev integration is part of this prompt.

## Portable designer prompt

```text
Design an interactive, responsive Languon profile experience for choosing a personal text AI model. This is a design prototype for an established language-learning product. Produce polished desktop and mobile screens and all specified states. The product already supports the behavior below; represent it accurately without inventing billing, provider setup or task controls.

VISUAL CONTEXT
Languon uses a calm white/light-gray canvas, dark readable text, indigo primary actions (#4f46e5), subtle neutral borders, restrained shadows and rounded surfaces: roughly 8px for small controls, 12px for cards and 16px for larger panels. Use the existing typography's sans-serif character, generous readable spacing and clear focus rings. Supply a coherent dark theme. The existing profile has Account, AI credits and Security tabs, a user identity area and theme/language preferences. Place the model preference card within Account, preserving these neighboring sections and the existing signed-in app shell. Do not turn the profile into an administration console or redesign unrelated tabs.

MP-01 — INFORMATION ARCHITECTURE AND PRODUCT LANGUAGE
Use a card headed “AI model” with a short explanation: “Choose the model for new dictionary and sentence AI requests.” Display the saved choice clearly. A user's preference applies to dictionary text generation, sentence generation and AI translation checking. It does not change audio or document-reading services. Avoid developer vocabulary such as adapters, revisions, tokens, execution snapshots, capability namespaces or provider credentials.

Default choice: “Auto — use Languon’s default”. Auto is a saved preference and may resolve to a different enabled default later. If the current effective model is available, show its friendly name as secondary context; if unknown, show honest unavailable context rather than inventing a model. Explicit model choices persist until the user changes them. New tasks use the saved preference; a task already submitted keeps the model it started with. Changing this setting neither restarts work nor modifies existing sentences, attempts or scores.

MP-02 — MODEL PICKER
Create an accessible single-choice picker with Auto first and a small set of curated model cards below. Each card has a radio state, friendly model name, friendly provider label, short useful description and availability. Prototype illustrative choices such as DeepSeek Chat and a Google Gemini model; treat the actual catalog as dynamic. Use supplied capability information for human-readable labels when present. Availability can change, and support for one text task does not promise readiness for every task.

Show only credit information actually supplied by the product. If illustrating rates, label them as illustrative fixture data in the prototype's separate demo controls. Do not invent precise per-request quotes, speed promises, quality rankings, subscriptions, free AI allowances or purchasable tiers. Users never enter API keys or provider URLs. Choosing Auto does not replenish credits.

An unavailable model remains visible as a disabled option with a clear reason and a route back to an available choice. If the user's saved explicit choice becomes unavailable, preserve its identity as “Your selection is currently unavailable”; do not silently replace it with Auto. Let the user deliberately choose Auto or another available model. Do not hide the saved selection just because it is absent from the current available list.

MP-03 — EDIT, SAVE AND CONFLICT
Show the saved value separately from an unsaved draft when they differ. Provide “Save preference” and “Cancel changes”. No-op saves are disabled. Saving shows an inline progress state and prevents duplicate submission while retaining the choice. Success updates the saved summary and provides unobtrusive confirmation. Cancel restores the saved choice without changing running work.

If another tab or device changes the preference, show a conflict state: “Your preference changed elsewhere. Review the latest choice before saving.” Preserve the local draft for comparison, show the latest saved value and offer “Use latest” or a deliberate reviewed resubmission. Do not overwrite a concurrent choice silently. On network/save failure preserve the draft and offer retry. An unavailable explicit choice rejected at save time should refresh availability and let the user select a valid choice without resetting the rest of the profile.

If the user leaves with an unsaved choice, use a small accessible confirmation with “Keep editing” and “Discard changes”. Avoid requiring a confirmation for an ordinary successful save.

MP-04 — CREDITS AND PRACTICE CONTEXT
Changing the model preference is free. Zero credits does not disable this setting. Explain that new AI requests may need credits, while stored sentence practice, hints and explicit reference-answer review remain available without an AI check. A reference answer is one valid translation, not an automatic correctness verdict. Keep this explanatory copy compact and optionally link to the existing AI credits tab. Do not add purchasing, grants, top-ups or an admin adjustment flow.

For a task already in progress, show a small nonblocking explanation if useful: “This change applies to future requests. Your current task keeps its original model.” Do not claim a per-task model name where it is not supplied. Do not change an existing task's price or imply changing preference can avoid a reservation already made.

MP-05 — REQUIRED SCREEN AND STATE INVENTORY
Include each of these in the prototype and a state gallery outside the product flow:
1. Desktop Account tab with Auto saved and no draft changes.
2. Desktop explicit model saved; current selection and effective Auto context readable.
3. Mobile profile tabs and picker without horizontal overflow.
4. Dark theme, including disabled and selected model contrast.
5. Initial profile/preference/catalog loading: stable card geometry, skeletons and descriptive busy label, with other loaded profile sections usable.
6. Preference loaded while model catalog is still loading.
7. Catalog load failure with retry; saved choice remains visible rather than blank.
8. No models currently available: Auto identity remains clear, availability explanation and retry, with no false promise that Auto is currently executable.
9. One unavailable model among available options.
10. Saved explicit model now unavailable or no longer in the current list.
11. Draft choice differs from saved; Save and Cancel available.
12. Saving; duplicate action disabled and choice preserved.
13. Saved confirmation.
14. Save network failure; draft retained.
15. Save rejected because availability changed.
16. Concurrent preference conflict, latest value and local draft both visible.
17. Zero-credit account; preference still editable, free sentence-reference context clear.
18. Existing AI task in progress while the preference changes.
19. Unsaved navigation confirmation.
20. Expired session/sign-in recovery; no stale protected profile data remains visible.
21. Temporarily offline with a local in-memory draft preserved; do not imply server autosave or persistence after reload.

MP-06 — ACCESSIBILITY AND RESPONSIVE BEHAVIOR
Use semantic tabs and radio groups with visible labels, keyboard operation and focus restoration. Selected, unavailable, busy and error states need text or icons as well as color. Announce save progress/result politely; focus the relevant error or conflict region without jumping the whole page. Avoid tooltip-only explanations. Use comfortable touch targets, readable line lengths, reduced-motion states, 200% zoom behavior and RTL-friendly layout. Long model/provider names and translated copy must wrap without shrinking the radio affordance or pushing actions off-screen.

DELIVERABLE
Create a complete clickable prototype with Account-tab context, realistic model-picker interactions and a separately accessible demo-state gallery for every inventory item. Demo controls are for reviewing the design and should not appear as real product settings. Include empty/error/loading mobile examples, not just a polished happy-path desktop screen. Keep all displayed backend/model data as local prototype fixtures; no API wiring is needed. The result should be ready for a developer to implement within Languon's existing components after design review.
```

## Return the design

Return the Magic Patterns editor link and its exported source or retained captures.
Record the exact provider revision/export date so a future implementation can select
this revision explicitly. No generated design or implementation target has been
selected yet. Keep requirement IDs stable when revising this brief; create a new
snapshot rather than modifying v001.
