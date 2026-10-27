import { describe, it, expect, vi } from 'vitest';
import {
    createAdminMcpServer,
    type AdminMcpServerDependencies,
} from '../../../../src/modules/admin-mcp/interface/http/admin-mcp-server';
import { loadAdminMcpEnvironment } from '../../../../src/config/environment';

function fixture() {
    const read = vi.fn(async () => ({ catalog: [] }));
    const actor = {
        tokenId: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        permissions: ['providers.read'],
        allowedActions: ['providers.inspect'],
        limits: {},
    };
    const authenticate = vi.fn(async (secret: string) => {
        if (secret !== 'synthetic') throw Error('invalid');
        return actor;
    });
    const app = createAdminMcpServer({
        port: 3002,
        credentials: { authenticate },
        administration: { read },
        checks: { register: vi.fn() },
    } as unknown as AdminMcpServerDependencies);
    const request = (body: unknown, headers: Record<string, string> = {}) =>
        app.request('http://127.0.0.1:3002/mcp', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer synthetic',
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    return { app, request, read, authenticate };
}
describe('local authenticated admin MCP HTTP', () => {
    it('rejects remote Host, browser Origin, query tokens and missing credentials before tool work', async () => {
        const { app, request, authenticate } = fixture();
        expect((await request({}, { Host: 'evil.example:3002' })).status).toBe(
            403,
        );
        expect(
            (await request({}, { Origin: 'http://localhost:3333' })).status,
        ).toBe(403);
        expect(
            (await app.request('http://127.0.0.1:3002/mcp?token=never-allow'))
                .status,
        ).toBe(400);
        expect(
            (await app.request('http://127.0.0.1:3002/mcp', { method: 'POST' }))
                .status,
        ).toBe(401);
        expect(authenticate).not.toHaveBeenCalled();
    });
    it('initializes the real SDK and exposes only the delegated read tool', async () => {
        const { request } = fixture();
        const initialized = await request({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'synthetic-client', version: '1' },
            },
        });
        expect(initialized.status).toBe(200);
        const body = await initialized.text();
        expect(body).toContain('languon-admin');
        const listing = await request({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
        });
        const text = await listing.text();
        expect(text).toContain('admin_connection_test');
        expect(text).toContain('providers_inspect');
        expect(text).not.toContain('admin_apply');
        expect(text).not.toContain('users_lookup');
    });
    it('executes read-only check without AI or database mutation', async () => {
        const { request, read } = fixture();
        const response = await request({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'admin_connection_test', arguments: {} },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('connected');
        expect(read).not.toHaveBeenCalled();
    });
    it('does not disclose database/provider exception content', async () => {
        const { request, read } = fixture();
        read.mockRejectedValueOnce(
            new Error('postgres://sensitive-secret privateprompt'),
        );
        const response = await request({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'providers_inspect', arguments: {} },
        });
        const body = await response.text();
        expect(read).toHaveBeenCalledOnce();
        expect(body).toContain('operation_rejected');
        expect(body).not.toContain('sensitive-secret');
        expect(body).not.toContain('privateprompt');
    });
});
describe('local MCP environment', () => {
    it('rejects deployed environments and reports missing fallback names without values', () => {
        const diagnostics = { warn: vi.fn(), error: vi.fn() };
        expect(() =>
            loadAdminMcpEnvironment(
                {
                    APP_ENV: 'production',
                    DATABASE_URL: 'postgres://test@localhost/db',
                },
                diagnostics,
            ),
        ).toThrow();
        const result = loadAdminMcpEnvironment(
            {
                APP_ENV: 'development',
                DATABASE_URL: 'postgres://test@localhost/db',
            },
            diagnostics,
        );
        expect(result.ADMIN_MCP_PORT).toBe(3002);
        expect(diagnostics.warn).toHaveBeenCalledWith(
            expect.stringContaining('ADMIN_MCP_PORT'),
        );
        expect(diagnostics.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('postgres://'),
        );
    });
});
