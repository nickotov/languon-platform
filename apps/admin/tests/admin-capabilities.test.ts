import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('local MCP admin capability', () => {
    it('allows local development builds', async () => {
        vi.resetModules();
        vi.stubEnv('DEV', true);
        vi.stubEnv('PROD', false);
        const { adminMcpEnabled } =
            await import('../src/shared/config/admin-capabilities');
        expect(adminMcpEnabled).toBe(true);
    });

    it('denies production resource access even if development is also asserted', async () => {
        vi.resetModules();
        vi.stubEnv('DEV', true);
        vi.stubEnv('PROD', true);
        const { adminMcpEnabled } =
            await import('../src/shared/config/admin-capabilities');
        const { adminAccessProvider } =
            await import('../src/shared/access/admin-access-provider');
        expect(adminMcpEnabled).toBe(false);
        await expect(
            adminAccessProvider.can({ resource: 'admin-mcp', action: 'list' }),
        ).resolves.toMatchObject({ can: false });
        await expect(
            adminAccessProvider.can({ resource: 'users', action: 'list' }),
        ).resolves.toMatchObject({ can: true });
    });
});
