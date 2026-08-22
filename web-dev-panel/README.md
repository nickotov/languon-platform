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

## Command contract

`commands.json` accounts for every root `package.json` script. Enabled entries
are reviewed, argument-free local commands. Disabled entries remain visible
with a reason. The panel executes checked argv with a fixed repository working
directory and never accepts shell text, arguments, or stdin from the browser.
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
