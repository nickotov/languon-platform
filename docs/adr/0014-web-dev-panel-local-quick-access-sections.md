# ADR-0014: Web dev panel local quick-access sections

Status: Accepted
Date: 2026-08-22
Supersedes: ADR-0013

## Context

ADR-0013 establishes one server-authoritative process/log source of truth and
rejects localStorage as a command-lifecycle coordination mechanism. Developers
also need personal, portable groupings of reviewed command IDs for quick access.
Those groupings are presentation preferences rather than executable definitions
or runtime state, and the user explicitly requires a local JSON representation
that can be copied to another developer's panel.

A section Stop all action introduces a separate lifecycle concern. Composing
multiple single-run stop requests in the browser can partially stop a section if
one request is stale, while the existing global Stop All affects unrelated runs.

## Decision

Adopt every execution, catalog, lifecycle, log, session, HTTP, and local-safety
decision from ADR-0013 unchanged except its statements that tabs own only
checkbox presentation and that the panel has no persistence. Narrow those two
statements as follows.

Keep custom quick-access configuration browser-local and non-authoritative. The
panel stores one versioned, closed JSON document in localStorage containing only
custom section IDs, names, insertion order, and arrays of reviewed command IDs.
It never stores command source text, executable/argv/cwd, source revisions,
eligibility, selections, run IDs, statuses, logs, session material, or agent
metadata. Section and command disclosure state remains tab-local and unpersisted.

The browser implements the document through a dependency-free pure module with
bounded byte, section, name, and membership counts; exact object keys; canonical
identifiers; case-insensitive unique names; and unique command membership within
each section. The browser renders imported names and IDs only through text
properties. Standard same-origin `storage` events synchronize valid preference
changes between open tabs, but SSE remains the only process/log synchronization
channel.

Import replaces the current document only after complete schema and current-
catalog reproducibility validation. Unknown command IDs, malformed or unsupported
versions, duplicate identities/names/memberships, and browser storage failures
produce an in-page alert and retain the prior document. Existing catalog IDs may
be imported even when disabled; their ordinary unavailable explanation remains
visible and server policy still rejects their execution. A previously stored
document that later references a removed catalog ID is preserved and rendered as
missing rather than silently mutated, but cannot Start all until repaired.

Start all uses the existing atomic `POST /api/start` batch with every section
member and current catalog revisions. It never filters a requested section down
to a silent partial start. The server therefore remains final authority for
drift, disabled, active, and conflict validation.

Add one fixed `POST /api/stop-selected` control route. Its closed body contains a
bounded nonempty array of exact command ID/run ID pairs. `ProcessManager`
serially validates the entire set for uniqueness, current-run identity, and
active state before requesting any stop. A stale or invalid pair rejects the
whole operation; successful requests stop only listed panel-owned runs. Existing
Host, session, Origin, header, content-type, body-size, no-CORS, and run-ID
protections apply unchanged.

## Alternatives considered

### Persist preferences on the panel server or in a repository file

Rejected because the requested preference is local to a browser/developer and
portable by explicit copy/paste. Server or repository writes add ownership,
concurrency, cleanup, and accidental commit concerns without improving process
truth.

### Store executable command definitions in exported JSON

Rejected because import would become a second execution authority and could
bypass the reviewed catalog/source-revision boundary. Stable command IDs are the
only portable membership contract.

### Merge imported sections into existing preferences

Rejected because duplicate ID/name resolution is ambiguous and a colleague
cannot reproduce the sender's exact layout. Atomic replacement is predictable
and recoverable because the current document remains copyable before import.

### Issue parallel single-run stop requests from the browser

Rejected because one stale failure can leave a partially stopped environment.
The server already owns serialized lifecycle truth and can validate the complete
set before any state transition.

## Consequences

### Positive

- Developers can keep and share useful layouts without weakening catalog trust.
- Duplicate cards remain views of one authoritative process/run/log.
- Import, Start all, and Stop all have explicit all-or-nothing failure semantics.
- Same-profile tabs converge on preferences without pretending browser storage
  owns operating-system processes.

### Negative

- Preferences do not automatically move across profiles/devices and can be lost
  when browser site data is cleared.
- Imported layouts depend on stable catalog IDs and deliberately fail when a
  colleague's checkout lacks one.
- A custom section containing a disabled, missing, active, stale, or conflicting
  member cannot partially Start all; the developer must resolve the section or
  control commands individually.
- The additional stop-selected route expands the native validation/test matrix.

### Risks and limitations

- localStorage may be unavailable, corrupted, or quota-limited. The catalog stays
  usable, but preference mutations must fail visibly rather than claim persistence.
- Imported JSON is untrusted and could be large or crafted for rendering abuse;
  byte/count/string limits and text-only rendering are mandatory.
- Browser `storage` events do not fire in the tab that made the write, so that tab
  updates its in-memory model synchronously and other tabs apply validated events.
- This decision does not change ADR-0013's Windows execution limitation, process
  cleanup model, log lifetime, or launch/session security boundary.

## Related

- [ADR-0013](./0013-local-web-dev-command-panel.md)
- [Feature specification](../../.agent/features/web-dev-panel-custom-sections/FEATURE.md)
- [ExecPlan](../../.agent/features/web-dev-panel-custom-sections/EXEC_PLAN.md)
- [Web dev panel user flow](../user-flows/web-dev-panel.md)
