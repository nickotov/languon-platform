import type {
    AdminMcpLimits,
    AdminMcpPermission,
    AdminMcpTokenMetadata,
} from '@languon/contracts';

export class AdminMcpError extends Error {
    public constructor(
        public readonly code:
            | 'check_required'
            | 'unauthorized'
            | 'permission_denied'
            | 'not_found'
            | 'preview_expired'
            | 'stale_preview'
            | 'idempotency_conflict'
            | 'quota_exceeded'
            | 'invalid_amount',
        message: string,
    ) {
        super(message);
    }
}
export interface AdminMcpActor {
    tokenId: string;
    userId: string;
    permissions: AdminMcpPermission[];
    allowedActions: string[];
    limits: AdminMcpLimits;
}
export interface AdminMcpToken extends AdminMcpTokenMetadata {
    secretHash: string;
}
export interface AdminMcpPreview {
    id: string;
    tokenId: string;
    operation: AdminMcpPermission;
    target: string;
    current: unknown;
    proposed: unknown;
    expectedVersion: string;
    reason: string;
    createdAt: Date;
    expiresAt: Date;
}
export interface AdminMcpReservation {
    id: string;
    replay: boolean;
    state: 'reserved' | 'settled' | 'unknown';
    amount: string;
}
/** Decimal values use exact millionths for both USD and credit ceilings. */
export function amountUnits(value: string): bigint {
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value))
        throw new AdminMcpError('invalid_amount', 'Invalid exact amount.');
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
export function unitsAmount(value: bigint): string {
    return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}
export function requirePermission(
    actor: AdminMcpActor,
    permission: AdminMcpPermission,
): void {
    if (!actor.permissions.includes(permission))
        throw new AdminMcpError(
            'permission_denied',
            'The credential does not permit this operation.',
        );
}
export function utcDay(at: Date): string {
    return at.toISOString().slice(0, 10);
}

/**
 * Immutable action identifiers define a bounded authority and input contract.
 * Adding a tool or broadening accepted authority requires a new action ID.
 * These groups are issuance convenience only, never runtime authorization.
 */
export const adminMcpActionsByPermission: Readonly<
    Record<AdminMcpPermission, readonly string[]>
> = {
    'users.read': ['users.lookup', 'users.credits'],
    'financial-reports.read': [
        'financial-reports.global',
        'financial-reports.user',
    ],
    'providers.read': ['providers.inspect'],
    'model-checks.run': ['model-checks.run', 'model-checks.status'],
    'routing.write': ['routing.write'],
    'customer-tariffs.write': ['customer-tariffs.write'],
    'provider-prices.write': ['provider-prices.write'],
    'spending-limits.write': ['spending-limits.write'],
    'credits.grant': ['credits.grant'],
    'credits.revoke': ['credits.revoke'],
};
export function snapshotAllowedActions(
    permissions: readonly AdminMcpPermission[],
    catalog = adminMcpActionsByPermission,
): string[] {
    return [
        ...new Set(
            permissions.flatMap((permission) => [...catalog[permission]]),
        ),
    ];
}
export function requireAction(actor: AdminMcpActor, action: string): void {
    if (!actor.allowedActions.includes(action))
        throw new AdminMcpError(
            'permission_denied',
            'The credential does not grant this action.',
        );
}

/** UUID keys carry no caller prose and cannot become a covert audit channel. */
export function requireOperationKey(value: string): void {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        )
    )
        throw new AdminMcpError(
            'idempotency_conflict',
            'A UUID operation key is required.',
        );
}
export function redactCredentialMaterial(value: string): string {
    return value
        .replace(/lmcp_[A-Za-z0-9_-]{43}/g, '[REDACTED]')
        .replace(/\bbearer[ \t]+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
}
export function assertSafeAuditContext(value: unknown): void {
    const text = JSON.stringify(value);
    if (redactCredentialMaterial(text) !== text)
        throw new AdminMcpError(
            'permission_denied',
            'Do not include credentials in audit context.',
        );
}
