import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
    adminMcpIssueTokenSchema,
    type AdminMcpIssueToken,
    type AdminMcpAuditQuery,
    type AdminMcpAuditResponse,
    type AdminMcpPermission,
    type AdminMcpTokenMetadata,
} from '@languon/contracts';
import {
    AdminMcpError,
    requirePermission,
    snapshotAllowedActions,
    adminMcpActionsByPermission,
    assertSafeAuditContext,
    type AdminMcpActor,
    type AdminMcpToken,
} from '../domain/admin-mcp';

export interface AdminMcpCredentialStore {
    insertToken(token: AdminMcpToken, reason: string, at: Date): Promise<void>;
    listTokens(ownerUserId: string, at: Date): Promise<AdminMcpTokenMetadata[]>;
    revokeToken(
        ownerUserId: string,
        tokenId: string,
        reason: string,
        at: Date,
    ): Promise<void>;
    authenticateHash(hash: string, at: Date): Promise<AdminMcpActor>;
    audit(
        ownerUserId: string,
        query: AdminMcpAuditQuery,
        at: Date,
    ): Promise<AdminMcpAuditResponse>;
}
export function hashAdminMcpSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
}
export class AdminMcpCredentialService {
    public constructor(
        private readonly store: AdminMcpCredentialStore,
        private readonly now: () => Date = () => new Date(),
        private readonly actionCatalog = adminMcpActionsByPermission,
    ) {}

    /** The browser boundary must verify recent authentication before invoking issuance. */
    public async issue(
        ownerUserId: string,
        input: AdminMcpIssueToken,
    ): Promise<{ token: AdminMcpTokenMetadata; secret: string }> {
        const parsed = adminMcpIssueTokenSchema.parse(input);
        assertSafeAuditContext({ name: parsed.name, reason: parsed.reason });
        const at = this.now();
        const secret = `lmcp_${randomBytes(32).toString('base64url')}`;
        const token: AdminMcpToken = {
            id: randomUUID(),
            ownerUserId,
            name: parsed.name,
            permissions: parsed.permissions,
            allowedActions: snapshotAllowedActions(
                parsed.permissions,
                this.actionCatalog,
            ),
            limits: parsed.limits,
            createdAt: at.toISOString(),
            expiresAt: new Date(
                at.getTime() + parsed.expiresInDays * 86_400_000,
            ).toISOString(),
            lastUsedAt: null,
            revokedAt: null,
            secretHash: hashAdminMcpSecret(secret),
        };
        await this.store.insertToken(token, parsed.reason, at);
        const { secretHash: _hash, ...metadata } = token;
        return { token: metadata, secret };
    }

    public list(ownerUserId: string): Promise<AdminMcpTokenMetadata[]> {
        return this.store.listTokens(ownerUserId, this.now());
    }

    public audit(
        ownerUserId: string,
        query: AdminMcpAuditQuery,
    ): Promise<AdminMcpAuditResponse> {
        return this.store.audit(ownerUserId, query, this.now());
    }

    public revoke(
        ownerUserId: string,
        tokenId: string,
        reason: string,
    ): Promise<void> {
        assertSafeAuditContext(reason);
        if (reason.trim().length < 5 || reason.length > 500)
            throw new Error('A bounded reason is required.');
        return this.store.revokeToken(
            ownerUserId,
            tokenId,
            reason.trim(),
            this.now(),
        );
    }

    public async authenticate(
        secret: string,
        permission?: AdminMcpPermission,
    ): Promise<AdminMcpActor> {
        if (!/^lmcp_[A-Za-z0-9_-]{43}$/.test(secret))
            throw new AdminMcpError(
                'unauthorized',
                'Invalid or inactive credential.',
            );
        const actor = await this.store.authenticateHash(
            hashAdminMcpSecret(secret),
            this.now(),
        );
        if (permission) requirePermission(actor, permission);
        return actor;
    }
}
