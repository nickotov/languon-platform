import {
    adminMcpIssueTokenSchema,
    type AdminMcpIssueToken,
} from '@languon/contracts';

export function parseIssueTokenValues(values: AdminMcpIssueToken) {
    const limits: AdminMcpIssueToken['limits'] = {};
    if (values.permissions.includes('model-checks.run'))
        limits.modelChecks = values.limits.modelChecks;
    if (values.permissions.includes('credits.grant'))
        limits.creditGrants = values.limits.creditGrants;
    if (values.permissions.includes('credits.revoke'))
        limits.creditRevocations = values.limits.creditRevocations;
    if (values.permissions.includes('spending-limits.write'))
        limits.spendingLimits = values.limits.spendingLimits;
    return adminMcpIssueTokenSchema.safeParse({ ...values, limits });
}
