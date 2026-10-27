export const defaultMcpPort = 3002;
export const mcpEndpoint = `http://127.0.0.1:${defaultMcpPort}/mcp`;
export const tokenEnvironmentVariable = 'LANGUON_ADMIN_MCP_TOKEN';

export function buildClientConfigurations(port: number) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new RangeError(
            'MCP port must be a whole number from 1024 to 65535.',
        );
    }
    const endpoint = `http://127.0.0.1:${port}/mcp`;
    return {
        codex: `[mcp_servers.languon]\nurl = "${endpoint}"\nbearer_token_env_var = "${tokenEnvironmentVariable}"`,
        claude: JSON.stringify(
            {
                mcpServers: {
                    languon: {
                        type: 'http',
                        url: endpoint,
                        headers: {
                            Authorization: 'Bearer ${LANGUON_ADMIN_MCP_TOKEN}',
                        },
                    },
                },
            },
            null,
            2,
        ),
        opencode: JSON.stringify(
            {
                $schema: 'https://opencode.ai/config.json',
                mcp: {
                    languon: {
                        type: 'remote',
                        url: endpoint,
                        oauth: false,
                        headers: {
                            Authorization:
                                'Bearer {env:LANGUON_ADMIN_MCP_TOKEN}',
                        },
                    },
                },
            },
            null,
            2,
        ),
    };
}

export const clientConfigurations = buildClientConfigurations(defaultMcpPort);

// zsh read is silent; the secret is entered interactively, not embedded in history.
export const environmentSetup =
    "read -rs 'LANGUON_ADMIN_MCP_TOKEN?Paste your MCP token: '\nexport LANGUON_ADMIN_MCP_TOKEN";
