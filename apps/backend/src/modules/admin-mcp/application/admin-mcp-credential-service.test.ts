import { describe, expect, it, vi } from 'vitest';
import { adminMcpIssueTokenSchema } from '@languon/contracts';
import {
    AdminMcpCredentialService,
    hashAdminMcpSecret,
    type AdminMcpCredentialStore,
} from './admin-mcp-credential-service';
import {
    amountUnits,
    unitsAmount,
    utcDay,
    adminMcpActionsByPermission,
    requireAction,
    requireOperationKey,
    assertSafeAuditContext,
    redactCredentialMaterial,
} from '../domain/admin-mcp';
const owner = '8e678f93-63f6-498f-9bfc-b4dd268a6f23';
function fixture() {
    const store: AdminMcpCredentialStore = {
        audit: vi
            .fn()
            .mockResolvedValue({ events: [], total: 0, page: 1, pageSize: 25 }),
        insertToken: vi.fn().mockResolvedValue(undefined),
        listTokens: vi.fn().mockResolvedValue([]),
        revokeToken: vi.fn().mockResolvedValue(undefined),
        authenticateHash: vi.fn().mockResolvedValue({
            tokenId: 'token',
            userId: owner,
            permissions: ['users.read'],
            allowedActions: ['users.lookup', 'users.credits'],
            limits: {},
        }),
    };
    return {
        store,
        service: new AdminMcpCredentialService(
            store,
            () => new Date('2026-10-27T12:00:00Z'),
        ),
    };
}
describe('admin MCP credentials', () => {
    it('issues independent secrets once and persists only hashes with finite default lifetime', async () => {
        const { store, service } = fixture();
        const first = await service.issue(
            owner,
            adminMcpIssueTokenSchema.parse({
                name: 'Codex',
                reason: 'Local setup',
            }),
        );
        const second = await service.issue(
            owner,
            adminMcpIssueTokenSchema.parse({
                name: 'Claude',
                reason: 'Local setup',
            }),
        );
        expect(first.secret).not.toBe(second.secret);
        expect(first.token.expiresAt).toBe('2026-11-26T12:00:00.000Z');
        expect(first.token.permissions).toEqual([
            'users.read',
            'financial-reports.read',
            'providers.read',
        ]);
        const stored = vi.mocked(store.insertToken).mock.calls[0]?.[0];
        expect(stored?.secretHash).toBe(hashAdminMcpSecret(first.secret));
        expect(stored).not.toHaveProperty('secret');
        expect(first.token).not.toHaveProperty('secretHash');
    });
    it('freezes action authority at issuance when a later catalog adds a tool', async () => {
        const { store, service } = fixture();
        const input = adminMcpIssueTokenSchema.parse({
            name: 'Original client',
            reason: 'Explicit read access',
            permissions: ['users.read'],
        });
        const original = await service.issue(owner, input);
        const expandedCatalog = {
            ...adminMcpActionsByPermission,
            'users.read': [
                ...adminMcpActionsByPermission['users.read'],
                'users.new-tool',
            ],
        };
        const laterService = new AdminMcpCredentialService(
            store,
            () => new Date('2026-10-27T12:00:00Z'),
            expandedCatalog,
        );
        const replacement = await laterService.issue(owner, input);
        expect(original.token.allowedActions).toEqual([
            'users.lookup',
            'users.credits',
        ]);
        expect(replacement.token.allowedActions).toContain('users.new-tool');
        const originalActor = {
            tokenId: original.token.id,
            userId: owner,
            permissions: original.token.permissions,
            limits: original.token.limits,
            allowedActions: original.token.allowedActions,
        };
        expect(() =>
            requireAction(originalActor, 'users.lookup'),
        ).not.toThrow();
        expect(() =>
            requireAction(originalActor, 'users.new-tool'),
        ).toThrowError(expect.objectContaining({ code: 'permission_denied' }));
        expect(
            vi.mocked(store.insertToken).mock.calls[0]?.[0].allowedActions,
        ).not.toContain('users.new-tool');
    });

    it('rejects permanent lifetimes and write authority without finite explicit limits', () => {
        for (const input of [
            { expiresInDays: 91 },
            { expiresInDays: 0 },
            { permissions: ['credits.grant'] },
            { permissions: ['credits.revoke'] },
            { permissions: ['model-checks.run'] },
            { permissions: ['spending-limits.write'] },
        ]) {
            expect(
                adminMcpIssueTokenSchema.safeParse({
                    name: 'Client',
                    reason: 'Test setup',
                    ...input,
                }).success,
            ).toBe(false);
        }
    });
    it('checks explicit frozen permissions without deriving group permissions', async () => {
        const { service } = fixture();
        const secret = `lmcp_${'a'.repeat(43)}`;
        await expect(
            service.authenticate(secret, 'users.read'),
        ).resolves.toMatchObject({ userId: owner });
        await expect(
            service.authenticate(secret, 'credits.grant'),
        ).rejects.toMatchObject({ code: 'permission_denied' });
    });
    it('rejects caller prose operation keys and credentials in persisted audit context', async () => {
        expect(() => requireOperationKey('customer@example.test')).toThrowError(
            expect.objectContaining({ code: 'idempotency_conflict' }),
        );
        expect(() =>
            requireOperationKey('27ff73de-3dfd-4c08-a233-f511c92c1a80'),
        ).not.toThrow();
        const secret = `lmcp_${'a'.repeat(43)}`;
        for (const value of [
            secret,
            `Authorization: Bearer ${secret}`,
            'Bearer private-access-token',
        ]) {
            expect(() =>
                assertSafeAuditContext({ reason: value }),
            ).toThrowError(
                expect.objectContaining({ code: 'permission_denied' }),
            );
            expect(redactCredentialMaterial(value)).not.toContain(
                'private-access-token',
            );
            expect(redactCredentialMaterial(value)).not.toContain(secret);
        }
        const { service } = fixture();
        await expect(
            service.issue(owner, {
                name: secret,
                reason: 'Normal explanation',
                permissions: ['users.read'],
                limits: {},
                expiresInDays: 1,
            }),
        ).rejects.toMatchObject({ code: 'permission_denied' });
    });

    it('rejects malformed secrets before querying persistence', async () => {
        const { store, service } = fixture();
        await expect(
            service.authenticate('not-a-credential'),
        ).rejects.toMatchObject({ code: 'unauthorized' });
        expect(store.authenticateHash).not.toHaveBeenCalled();
    });
    it('keeps decimal accounting exact and UTC day boundaries deterministic', () => {
        expect(amountUnits('0.000001')).toBe(1n);
        expect(amountUnits('0.1') + amountUnits('0.2')).toBe(
            amountUnits('0.3'),
        );
        expect(unitsAmount(1234567n)).toBe('1.234567');
        expect(utcDay(new Date('2026-10-27T23:59:59Z'))).toBe('2026-10-27');
        expect(() => amountUnits('1e3')).toThrow();
    });
});
