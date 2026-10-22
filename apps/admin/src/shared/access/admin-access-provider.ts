import type { AccessControlProvider } from '@refinedev/core';

export const adminAccessProvider: AccessControlProvider = {
    can: async ({ action, resource }) => ({
        can:
            [
                'dashboard',
                'users',
                'audit-events',
                'ai-settings',
                'accounting',
                'speech-recordings',
            ].includes(resource ?? '') &&
            !['create', 'delete'].includes(action),
        reason: 'Owner membership is required.',
    }),
    options: {
        buttons: { enableAccessControl: true, hideIfUnauthorized: true },
    },
};
