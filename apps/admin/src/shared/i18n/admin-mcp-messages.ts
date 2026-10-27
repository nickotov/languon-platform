export const adminMcpMessages = {
    'mcp.activity': 'Agent activity',
    'mcp.activityHelp':
        'Your delegated operations are retained for one year. Details contain safe operational metadata, never token secrets, prompts or user content. Refresh after an operation to see its latest audit record.',
    'mcp.actor': 'Actor user ID',
    'mcp.token': 'Token ID',
    'mcp.action': 'Action',
    'mcp.target': 'Target',
    'mcp.outcome': 'Outcome',
    'mcp.correlation': 'Correlation ID',
    'mcp.occurredAt': 'Date (UTC)',
    'mcp.details': 'Safe details',
    'mcp.title': 'Agent access (MCP)',
    'mcp.description':
        'Delegate bounded administration to a local agent. Each token acts as you; create a separate token for each client.',
    'mcp.issue': 'Create token',
    'mcp.tokens': 'Your tokens',
    'mcp.name': 'Client name',
    'mcp.reason': 'Reason',
    'mcp.expiryPreset': 'Expiration preset',
    'mcp.oneDay': '1 day',
    'mcp.sevenDays': '7 days',
    'mcp.thirtyDays': '30 days',
    'mcp.customExpiry': 'Custom (up to 90 days)',
    'mcp.expiry': 'Expires in days',
    'mcp.expiryHelp':
        'Choose 1, 7 or 30 days, or enter a custom whole number up to 90. Permanent tokens are not supported.',
    'mcp.permissions': 'Permissions',
    'mcp.authority':
        'Read-only by default. Writes need previews, but previews are not human approval. Anyone holding the secret can exercise its permissions.',
    'mcp.frozen':
        'Permissions and ceilings are fixed at issuance. To change access, create a replacement and revoke the old token.',
    'mcp.issueHelp':
        'Creation requires a sign-in within the last five minutes. Revocation only requires your active admin session.',
    'mcp.secretTitle': 'Save this secret now',
    'mcp.secretHelp':
        'Shown once. Store it securely outside the repository. Closing this panel removes it from this page; it cannot be retrieved later.',
    'mcp.dismissSecret': 'I have saved the secret',
    'mcp.created': 'Created',
    'mcp.expires': 'Expires',
    'mcp.lastUsed': 'Last used',
    'mcp.never': 'Never',
    'mcp.owner': 'Owner user ID',
    'mcp.status': 'Status',
    'mcp.active': 'Active',
    'mcp.expired': 'Expired',
    'mcp.revoked': 'Revoked',
    'mcp.revoke': 'Revoke token',
    'mcp.revokeTitle': 'Revoke this client’s access?',
    'mcp.revokeHelp':
        'New requests are blocked immediately. Revocation cannot undo provider expenses already incurred.',
    'mcp.limits': 'Delegated ceilings',
    'mcp.noLimits': 'Read access or configuration permissions only',
    'mcp.checkUsd': 'Maximum USD per check',
    'mcp.dailyUsd': 'Maximum USD per UTC day',
    'mcp.concurrency': 'Concurrent checks',
    'mcp.grantOperation': 'Maximum credits per grant',
    'mcp.grantDay': 'Maximum granted credits per UTC day',
    'mcp.revokeOperation': 'Maximum credits per revocation',
    'mcp.revokeDay': 'Maximum revoked credits per UTC day',
    'mcp.actionCredits': 'Delegated maximum credits per action',
    'mcp.actionUsd': 'Delegated maximum provider USD per action',
    'mcp.accountUsd': 'Delegated maximum provider USD per account/day',
    'mcp.globalUsd': 'Delegated maximum provider USD globally/day',
    'mcp.budgetHelp':
        'UTC daily ceilings reset at 00:00 UTC. Application and operator limits also apply; the strictest wins. Unknown check costs remain reserved.',
    'mcp.required': 'Enter a value.',
    'mcp.invalid':
        'Review the selected permissions and their finite positive limits.',
    'mcp.failure':
        'The operation could not be completed. Reload token metadata before retrying creation if the outcome is uncertain.',
    'mcp.users.read': 'User lookup and credit history (read)',
    'mcp.financial-reports.read': 'Financial reports (read)',
    'mcp.providers.read': 'Providers and models (read)',
    'mcp.model-checks.run': 'Paid model checks',
    'mcp.routing.write': 'Routing changes',
    'mcp.customer-tariffs.write': 'Customer tariffs',
    'mcp.provider-prices.write': 'Provider prices',
    'mcp.spending-limits.write': 'Credit and operator spending limits',
    'mcp.credits.grant': 'Credit grants (not revenue)',
    'mcp.credits.revoke': 'Revoke available, unreserved credits',
    'mcp.guide': 'Connect your agent',
    'mcp.guideIntro':
        'Local development only. Start the server separately from the app, then launch your agent with the token environment variable available to its process.',
    'mcp.start': '1. Start from the repository root',
    'mcp.environment': '2. Load the token without putting it in shell history',
    'mcp.environmentHelp':
        'In zsh, paste your newly issued secret at the hidden prompt. Launch codex, claude or opencode from this same terminal. GUI clients must also inherit this environment; restart them after configuration changes.',
    'mcp.port': 'MCP listener port',
    'mcp.portHelp':
        'Match ADMIN_MCP_PORT in your local environment (default 3002). This changes these connection snippets only; it does not change or restart the server. Host remains 127.0.0.1.',
    'mcp.portInvalid':
        'Enter a whole-number port from 1024 to 65535 to generate connection instructions.',
    'mcp.config': '3. Configure one client',
    'mcp.test': '4. Verify read-only access',
    'mcp.testHelp':
        'Use the client’s MCP status screen to confirm connection, then ask: “Using Languon, list configured providers and models. Do not run checks or change anything.” Enable provider inspection for this test. Reading never starts a paid check.',
    'mcp.troubleshoot': 'Troubleshooting',
    'mcp.troubleshootHelp':
        'Connection refused: start the MCP command and check the configured port. Unauthorized: verify the agent inherited LANGUON_ADMIN_MCP_TOKEN, token expiry/revocation and your active owner membership. Permission denied: issue a replacement with the required permission. Stale or expired preview: preview again. Budget exhausted: wait for the UTC reset or review the token’s limits in admin; MCP cannot raise its own ceiling.',
    'mcp.localOnly':
        'The endpoint is localhost-only. If ADMIN_MCP_PORT changes, update the URL in each client. Do not expose this port to the network.',
    'mcp.codexPath':
        'Add to your personal ~/.codex/config.toml; verify with codex mcp list.',
    'mcp.claudePath':
        'Merge into .mcp.json; inspect /mcp in Claude Code. The configuration contains an environment reference, never the secret.',
    'mcp.opencodePath':
        'Merge into opencode.json; verify with opencode mcp list. OAuth is disabled because this server uses an issued bearer token.',
    'mcp.sources': 'Official client documentation',
};
