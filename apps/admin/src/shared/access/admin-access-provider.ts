import type { AccessControlProvider } from '@refinedev/core';
import { adminMcpEnabled } from '../config/admin-capabilities';

export const adminAccessProvider: AccessControlProvider = {
    can: async ({ action, resource }) => ({
        can:
            [
                'dashboard',
                'users',
                'audit-events',
                'ai-settings',
                'accounting',
                'admin-mcp',
                'speech-recordings',
            ].includes(resource ?? '') &&
            !['create', 'delete'].includes(action) &&
            (resource !== 'admin-mcp' || adminMcpEnabled),
        reason: 'Owner membership is required.',
    }),
    options: {
        buttons: { enableAccessControl: true, hideIfUnauthorized: true },
    },
};
