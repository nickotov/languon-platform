import { describe, it, expect, vi } from 'vitest';
import { createAdminMcpTokenRoutes } from '../../../../src/modules/admin-mcp/interface/http/admin-mcp-token.routes';

describe('admin MCP browser credential boundary', () => {
    function fixture(
        appEnvironment: 'development' | 'production' = 'development',
    ) {
        const principal = {
            actor: {
                id: '00000000-0000-4000-8000-000000000001',
                role: 'owner',
            },
        };
        const administration = {
            authorizeOperation: vi.fn(async () => principal),
            authorizeSensitiveOperation: vi.fn(async () => principal),
        };
        const credentials = {
            issue: vi.fn(async () => ({ token: {}, secret: 'synthetic-once' })),
            list: vi.fn(async () => []),
            revoke: vi.fn(async () => {}),
            audit: vi.fn(async () => ({
                events: [],
                total: 0,
                page: 1,
                pageSize: 25,
            })),
        };
        const policy = {
            parseBearerAuthorization: () => 'browserjwt',
            assertCookieRequestOrigin: vi.fn(),
        };
        const app = createAdminMcpTokenRoutes({
            appEnvironment,
            administration,
            credentials,
            policy,
        } as unknown as Parameters<typeof createAdminMcpTokenRoutes>[0]);
        return { app, credentials, administration, principal };
    }
    it('rejects all credential routes in production', async () => {
        const { app, credentials } = fixture('production');
        expect((await app.request('/admin/mcp/tokens')).status).toBe(404);
        expect(credentials.list).not.toHaveBeenCalled();
    });
    it('issues for the verified principal id with recent authentication and no-store', async () => {
        const { app, credentials, administration, principal } = fixture();
        const response = await app.request('/admin/mcp/tokens', {
            method: 'POST',
            headers: {
                Origin: 'http://localhost:3001',
                Authorization: 'Bearer synthetic',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Synthetic client',
                reason: 'Local read-only setup',
            }),
        });
        expect(response.status).toBe(201);
        expect(credentials.issue).toHaveBeenCalledWith(
            principal.actor.id,
            expect.anything(),
        );
        expect(
            administration.authorizeSensitiveOperation,
        ).toHaveBeenCalledOnce();
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
    it('revokes only for the current owner without recent-auth step-up', async () => {
        const { app, credentials, administration, principal } = fixture();
        const id = '00000000-0000-4000-8000-000000000002';
        const response = await app.request(`/admin/mcp/tokens/${id}/revoke`, {
            method: 'POST',
            headers: {
                Origin: 'http://localhost:3001',
                Authorization: 'Bearer synthetic',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: 'Contain compromised credential' }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(credentials.revoke).toHaveBeenCalledWith(
            principal.actor.id,
            id,
            'Contain compromised credential',
        );
        expect(administration.authorizeOperation).toHaveBeenCalledOnce();
        expect(
            administration.authorizeSensitiveOperation,
        ).not.toHaveBeenCalled();
    });
    it('rejects issuance without browser Origin', async () => {
        const { app, credentials } = fixture();
        const response = await app.request('/admin/mcp/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Synthetic', reason: 'Local setup' }),
        });
        expect(response.status).toBe(403);
        expect(credentials.issue).not.toHaveBeenCalled();
    });
});
