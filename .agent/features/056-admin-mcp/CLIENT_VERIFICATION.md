# Actual MCP client verification

Date: 2026-10-27. Feature056 working patch, before final review.

All three installed clients connected to the production MCP composition on the
isolated loopback listener3103. The listener used only the disposable
languon_admin_mcp_e2e_test database on55439. Provider keys were blank. A synthetic
one-day credential was issued through AdminMcpCredentialService with only
providers.read. No model turn, generation or paid provider check was submitted.

| Client      | Version | Actual evidence                                                                                                                                                                                   |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | 0.163.0 | app-server mcpServerStatus/list returned languon-admin1.0.0, bearerToken, toolsError:null and exactly admin_connection_test/providers_inspect; direct mcpServer/tool/call returned connected:true |
| Claude Code | 2.1.310 | mcp list printed languon HTTP: Connected after actual health check                                                                                                                                |
| OpenCode    | 1.18.35 | mcp list printed exactly one server, languon: connected                                                                                                                                           |

Codex used a per-process mcp_servers override, bearer_token_env_var, and its
app-server protocol rather than an LLM request. No user config was edited.
Claude used an isolated CLAUDE_CONFIG_DIR and a user-scoped add-json entry whose
Authorization header referenced ${LANGUON_ADMIN_MCP_TOKEN}. OpenCode used an
OPENCODE_CONFIG JSON file whose header referenced {env:LANGUON_ADMIN_MCP_TOKEN},
with oauth:false; XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME and
OPENCODE_CONFIG_DIR isolated its config and caches. Neither HOME nor CODEX_HOME
was changed. Secrets were kept in mode0600 temporary files/environment only,
not command arguments, retained evidence or logs.

The first OpenCode run merged the normal global config and also connected its
existing Pencil server. No tool was called on that server. The repeat used
isolated XDG directories and verified exactly the intended Languon server.
Only that isolated repeat counts as the OpenCode acceptance evidence.

Client config formats match the in-admin examples. Endpoint3103 substitutes the
normal3002 for test isolation. The Codex executable was the installed daemon
release binary; codex was absent from PATH. Raw temporary outputs were checked
for secrets and not committed. Client checks prove compatible initialization,
authentication and discovery; the Codex check additionally proves the read-only
tool call. They do not claim LLM behavior or paid provider execution.

Primary documentation fetched and read during verification:

- https://developers.openai.com/codex/mcp/ — HTTP bearer_token_env_var.
- https://code.claude.com/docs/en/mcp — HTTP headers, environment expansion and health checks.
- https://opencode.ai/docs/mcp-servers/ — remote transport, environment headers, oauth:false.
- https://opencode.ai/docs/config/ — custom configuration/inline precedence.

The temporary listener and test credential are cleaned up after verification;
no ordinary app service is restarted or user database modified.

## Final metadata remediation rerun

At 2026-10-27T16:20Z, repeated all three actual client checks after frozen
allowedActions enforcement and migration0112. Canonical pnpm --filter
@languon/backend db:migrate succeeded against only the disposable previous E2E
DB before issuing a fresh synthetic token. Claude returned Connected; isolated
OpenCode returned exactly one connected Languon server. Codex returned
bearerToken, toolsError:null, exactly providers_inspect/admin_connection_test,
and a direct readonly call returned connected:true. No model turns or paid calls.

Verified source SHA256:

- HTTP transport: e8ada5bd208108c058816880622a3155fddd9a91dbf2e876c51d47738b77e94f
- Domain authorities: ec5a24357cd48a287d3ce9f539b7ccc57e6baf6060a4a11617eb2c4efbbd9925
- Credential service: 100ec2893798cee3cf6a747d97afd97ddfb1f756737e9d847c4bbc51f1d7f3d6
- Migration0112: edcc6cfa43000c274a37cec7c371044f12a40a510992a0782011bfad56fb83ee
- Contract: b8c39f41e2fee55231e2113411f0592442465d5d27a476a11baf58ab1281afdd
