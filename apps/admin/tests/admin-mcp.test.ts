import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminMcpApi } from '../src/shared/api/admin-mcp-api';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import { parseIssueTokenValues } from '../src/pages/admin-mcp/lib/issue-token-values';
import {
    buildClientConfigurations,
    clientConfigurations,
} from '../src/pages/admin-mcp/lib/client-configurations';
import type { AdminMcpIssueToken } from '@languon/contracts';

const request: AdminMcpIssueToken = {
    name: 'Local Codex',
    reason: 'Read operational reports',
    expiresInDays: 30,
    permissions: ['providers.read'],
    limits: {},
};
const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
beforeEach(() => accessTokenStore.set('admin-session'));
afterEach(() => {
    accessTokenStore.clear();
    vi.unstubAllGlobals();
});

describe('MCP administration client safety', () => {
    it('loads only own-token metadata through the authorized admin API', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({ tokens: [] }));
        vi.stubGlobal('fetch', fetcher);
        expect(await adminMcpApi.list()).toEqual({ tokens: [] });
        expect(String(fetcher.mock.calls[0]?.[0])).toBe(
            '/api/admin/mcp/tokens',
        );
        expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
            Authorization: 'Bearer admin-session',
        });
    });
    it('requests bounded audit pages and validates safe metadata', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                response({ events: [], total: 0, page: 2, pageSize: 25 }),
            );
        vi.stubGlobal('fetch', fetcher);
        expect(
            await adminMcpApi.audit({ page: 2, pageSize: 25 }),
        ).toMatchObject({ page: 2, pageSize: 25 });
        expect(String(fetcher.mock.calls[0]?.[0])).toBe(
            '/api/admin/mcp/audit?page=2&pageSize=25',
        );
        expect(() => adminMcpApi.audit({ page: 1, pageSize: 101 })).toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('does not refresh or replay token creation after authentication rejection', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            response(
                {
                    error: {
                        code: 'recent_authentication_required',
                        message: 'Sign in again.',
                        correlationId: 'test',
                    },
                },
                401,
            ),
        );
        vi.stubGlobal('fetch', fetcher);
        await expect(adminMcpApi.issue(request)).rejects.toThrow(
            'Sign in again.',
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('rejects malformed successful responses rather than displaying unvalidated metadata', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValue(
                    response({ tokens: [{ secret: 'unexpected' }] }),
                ),
        );
        await expect(adminMcpApi.list()).rejects.toThrow();
    });
    it('strips ceilings for deselected permissions before issuing a credential', () => {
        const parsed = parseIssueTokenValues({
            ...request,
            limits: {
                modelChecks: {
                    perCheckUsd: '0.05',
                    perDayUsd: '0.5',
                    concurrency: 1,
                },
            },
        });
        expect(parsed.success && parsed.data.limits).toEqual({});
    });
    it('requires explicit positive grant ceilings and disallows permanent tokens', () => {
        expect(
            parseIssueTokenValues({
                ...request,
                permissions: ['credits.grant'],
            }).success,
        ).toBe(false);
        expect(
            parseIssueTokenValues({ ...request, expiresInDays: 91 }).success,
        ).toBe(false);
        expect(
            parseIssueTokenValues({
                ...request,
                permissions: ['credits.grant'],
                limits: { creditGrants: { perOperation: '0', perDay: '5' } },
            }).success,
        ).toBe(false);
    });
    it('generates every client URL from a validated local listener port', () => {
        const custom = buildClientConfigurations(3999);
        for (const config of Object.values(custom)) {
            expect(config).toContain('http://127.0.0.1:3999/mcp');
            expect(config).not.toContain(':3002/');
        }
        expect(clientConfigurations.codex).toContain(
            'http://127.0.0.1:3002/mcp',
        );
        for (const invalid of [0, 1023, 65536, 3999.5, NaN])
            expect(() => buildClientConfigurations(invalid)).toThrow(
                RangeError,
            );
    });
    it('uses client-specific environment references without embedding secrets', () => {
        expect(clientConfigurations.codex).toContain(
            'bearer_token_env_var = "LANGUON_ADMIN_MCP_TOKEN"',
        );
        expect(
            JSON.parse(clientConfigurations.claude).mcpServers.languon.headers
                .Authorization,
        ).toBe('Bearer ${LANGUON_ADMIN_MCP_TOKEN}');
        const openCode = JSON.parse(clientConfigurations.opencode).mcp.languon;
        expect(openCode.headers.Authorization).toBe(
            'Bearer {env:LANGUON_ADMIN_MCP_TOKEN}',
        );
        expect(openCode.oauth).toBe(false);
    });
});
