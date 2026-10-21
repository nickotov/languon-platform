---
type: adr
id: ADR-0043
title: 'Synced resource navigation and optional Texts folders'
status: accepted
date: 2026-10-20
supersedes: 'None; extends ADR-0030 navigation and ADR-0035 text organization'
---

# ADR-0043: Synced resource navigation and optional Texts folders

## Context

The user selected a new contextual sidebar, account-synced last-opened resources
and personal pins, whole-library title search, and independent texts with optional
single-folder membership. The implementation plan was explicitly authorized.
Existing Texts assumes mandatory folder ownership throughout jobs and sharing.

## Decision

Keep resource ownership in Dictionaries, Texts and Knowledge. A focused navigation
module owns only personal last-opened/pin metadata, keyed by owner, kind and stable
resource ID. Domain-owned read adapters supply current accessible summaries.
Search queries the whole owned active library with bounded results, never full
client preloading or duplicated content. Recording an open occurs after successful
resource loading, not from prefetch, hover or search. Navigation metadata is removed
with its owner; stale resource references never grant access.

A text has an owner and zero or one flat folder. Nullable membership does not
create a synthetic folder. A non-null folder belongs to the same owner. Stable
editor URLs identify texts independently of membership; older folder URLs redirect.
Move changes membership/version without copying content or rotating direct shares.
Moving into a shared folder requires explicit acknowledgment bound to current share
identity/version; publication still exposes only active saved translations. Moving
out removes inherited folder access. Folder archive/share revocation and direct
text sharing retain their existing lifecycle rules.

Owner, optional folder, version and source/share authority are rechecked at all
admission and publication boundaries. Active text jobs or pending proposals block
membership changes. Independent jobs use separately advertised detection:v2 and
translation:v3 formats so older workers cannot claim work with unsupported folder
semantics; existing folder-job execution identities remain unchanged.

The global shell retains session gating and existing guest controls. Its selected
presentation is 240px expanded/64px rail, mobile header/drawer below768px and tablet
rail below1024px. Editor+tutor visibility is a typed shared layout signal; temporary
desktop collapse does not overwrite device-local user preferences. Text editing
stays inside normal chrome; links, palette and Create honor existing dirty guards.

## Alternatives considered

### Mandatory or artificial default folder

Rejected by the user: independent texts must be actual folderless documents.

### Browser-only history and pins

Rejected by the user in favor of account synchronization across devices.

### Client-side search of previously loaded resources

Rejected because it cannot find unopened resources across the whole library.

## Consequences

### Positive

- Navigation follows real current ownership and preserves document identity.
- Folder moves preserve content and provide explicit shared-destination intent.
- Nullable membership is supported throughout text processing rather than UI-only.

### Negative

- New personal navigation persistence and a schema migration require cleanup tests.
- Optional membership affects text jobs, source resolvers, copy and sharing paths.

### Risks / limitations

- Old workers must not advertise or claim independent-text formats. Deployment uses
  the established expand/activate and drain/rollback rules; no deployment is authorized.
- There is no lossless down migration once independent texts exist. Preserve data
  and roll forward; never force them into an invented folder to undo the schema.
- Archived resources stay hidden from quick access while personal pin metadata may
  survive for restoration. No additional access is granted by that metadata.

## Related

- [ADR-0030](0030-global-web-shell-and-preference-placement.md).
- [ADR-0035](0035-texts-and-contextual-vocabulary-publication.md).
- [Feature](../../.agent/features/050-sidebar-navigation/FEATURE.md).
- [ExecPlan](../../.agent/features/050-sidebar-navigation/EXEC_PLAN.md).
