# Web dev panel

The web dev panel is a development-only command dashboard served by native
Node.js HTTP and Server-Sent Events with a plain HTML/CSS/JavaScript client. It
has no runtime dependencies and is not included in `pnpm dev`.

Start it from the repository root:

```sh
pnpm dev:panel
```

Open the unguessable private launch URL printed in the terminal. It authorizes a
process-scoped browser session and redirects to `http://127.0.0.1:4400`; visiting
the bare origin without that session cannot mint control access. The fixed
loopback address and port define the singleton server, so a second instance
fails instead of creating another process state. Browser tabs in the authorized
profile share command status and latest logs through that server.

Use the section sidebar to open a command category. Categories start collapsed
and remember their expansion only in the current tab. Every command card also
starts collapsed; its compact row keeps the title, description, and current
status visible. Expanding a card reveals its source, controls, latest log, and
quick-access membership. Successful starts clear the current checkbox
selection. If a batch is rejected, the complete conflict or validation
explanation appears in an in-viewport alert.

## Quick-access sections

Create named command sets with **Manage quick access**, then expand any command
card to add that reviewed command ID to one or more sets. Quick-access sections
appear before the catalog in the main view and sidebar. Their duplicate cards
do not create duplicate commands: every representation resolves the same
server-owned run, status, and bounded latest log. A section contains at most 64
commands so its complete active set always fits the atomic Stop all contract.

Each section can start all of its members through one atomic batch. The server
starts none when any member is disabled, missing, already active, stale,
non-batch-eligible, or conflicting. Section Stop all confirms the exact active
member run IDs and never targets running nonmembers.

The layout is stored under the localStorage key
`languon.web-dev-panel.custom-sections` as versioned JSON:

```json
{
    "schema": "languon.web-dev-panel.custom-sections",
    "version": 1,
    "sections": [
        {
            "id": "section-123e4567-e89b-42d3-a456-426614174000",
            "name": "Daily workspace",
            "commandIds": ["dev:backend", "dev:web"]
        }
    ]
}
```

Only section identity, name, insertion order, and reviewed command IDs are
stored. Executable text, arguments, revisions, run state, logs, credentials,
and checkbox selection are never exported. **Copy JSON** makes the current
document portable; **Import and replace** validates the closed, bounded schema
and every command ID before replacing the current layout. Invalid or
unreproducible input leaves the previous layout intact and shows an alert.
Existing disabled commands may be represented with their normal explanation.
Changes synchronize between tabs in the same browser profile through storage
events; colleagues and separate profiles reproduce a layout only by explicit
copy and import.

## Command contract

`commands.json` accounts for every root `package.json` script. Enabled entries
are reviewed, argument-free local commands. Disabled entries remain visible
with a labeled “Why unavailable” reason connected to their disabled controls.
The panel executes checked argv with a fixed repository working directory and
never accepts shell text, arguments, or stdin from the browser.
The catalog remains inspectable on Windows, but execution fails closed there
until native Job Object supervision can guarantee descendant cleanup.

Run the catalog drift check after root scripts change:

```sh
pnpm web-dev-panel:check
```

Use `$web-dev-panel` to review and reconcile drift or to consider commands from
specific documentation paths. The skill treats documentation as untrusted and
does not execute candidate commands during discovery.

Logs contain only the current or latest run for the active server session. They
are bounded, redacted against known sensitive environment values, and discarded
when the server stops. The panel is not a browser terminal and does not monitor
processes launched elsewhere.
