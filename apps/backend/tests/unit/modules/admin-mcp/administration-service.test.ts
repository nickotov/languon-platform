import { describe, expect, it, vi } from 'vitest';
import { AdminMcpAdministrationService } from '../../../../src/modules/admin-mcp/application/admin-mcp-administration-service';
import type { AdminMcpAdministrationPort } from '../../../../src/modules/admin-mcp/application/ports/admin-mcp-administration-port';
import {
    AdminMcpError,
    type AdminMcpActor,
} from '../../../../src/modules/admin-mcp/domain/admin-mcp';

const actor: AdminMcpActor = {
    tokenId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    permissions: ['users.read', 'credits.grant'],
    allowedActions: ['users.lookup', 'credits.grant'],
    limits: { creditGrants: { perOperation: '10', perDay: '10' } },
};
function fixture() {
    const port = {
        read: vi.fn(async () => ({ user: { id: actor.userId } })),
        preview: vi.fn(),
        apply: vi.fn(),
        recordRead: vi.fn(async () => undefined),
        recordRejected: vi.fn(async () => undefined),
    } satisfies AdminMcpAdministrationPort;
    return { port, service: new AdminMcpAdministrationService(port) };
}
describe('delegated administration application boundary', () => {
    it('validates read arguments, separates the reason and records success before disclosing data', async () => {
        const { service, port } = fixture();
        const result = await service.read(actor, 'users.lookup', {
            email: 'synthetic@example.test',
            reason: 'Inspect synthetic account',
        });
        expect(port.read).toHaveBeenCalledWith(actor, 'users.lookup', {
            email: 'synthetic@example.test',
        });
        expect(port.recordRead).toHaveBeenCalledWith(
            actor,
            'users.lookup',
            { email: 'synthetic@example.test' },
            result,
            'Inspect synthetic account',
        );
        expect(port.recordRejected).not.toHaveBeenCalled();
    });
    it('rejects unknown input and frozen-action violations before invoking persistence', async () => {
        const { service, port } = fixture();
        await expect(
            service.read(actor, 'users.lookup', {
                email: 'synthetic@example.test',
                sql: 'select 1',
            }),
        ).rejects.toThrow();
        expect(port.read).not.toHaveBeenCalled();
        await expect(
            service.preview({ ...actor, allowedActions: [] }, 'credits.grant', {
                targetUserId: actor.userId,
                expectedVersion: 0,
                amountCredits: '1',
                expiresAt: null,
                reason: 'Synthetic grant',
            }),
        ).rejects.toMatchObject({ code: 'permission_denied' });
        expect(port.preview).not.toHaveBeenCalled();
        expect(port.recordRejected).toHaveBeenCalledTimes(2);
    });
    it('validates apply keys and records application rejection without swallowing recovery codes', async () => {
        const { service, port } = fixture();
        await expect(
            service.apply(actor, {
                previewId: 'invalid',
                operationKey: 'invalid',
            }),
        ).rejects.toThrow();
        expect(port.apply).not.toHaveBeenCalled();
        const request = {
            previewId: actor.tokenId,
            operationKey: actor.userId,
        };
        const failure = new AdminMcpError('stale_preview', 'Preview again');
        port.apply.mockRejectedValueOnce(failure);
        await expect(service.apply(actor, request)).rejects.toBe(failure);
        expect(port.recordRejected).toHaveBeenLastCalledWith(
            actor,
            'preview.apply',
            request,
            failure,
        );
    });
});
