import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminMcpPage } from '../src/pages/admin-mcp';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { accessTokenStore } from '../src/shared/auth/access-token-store';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
const id = '00000000-0000-4000-8000-000000000042';
const token = {
    id,
    ownerUserId: id,
    allowedActions: [],
    name: 'Local Codex',
    permissions: ['users.read', 'financial-reports.read', 'providers.read'],
    limits: {},
    createdAt: '2026-10-27T00:00:00.000Z',
    expiresAt: '2099-10-27T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
};
const response = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
beforeEach(() => {
    accessTokenStore.set('admin-session');
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    accessTokenStore.clear();
});

describe('MCP token management screen', () => {
    it('creates a read-only credential and clears its one-time secret on dismissal', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockImplementation(async (url, init) => {
                if (String(url).includes('/audit?'))
                    return response({
                        events: [],
                        total: 0,
                        page: 1,
                        pageSize: 25,
                    });
                if (init?.method === 'POST')
                    return response({ token, secret: 'synthetic-once-secret' });
                return response({ tokens: [] });
            });
        vi.stubGlobal('fetch', fetcher);
        render(<AdminMcpPage />);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        fireEvent.change(screen.getByLabelText('Client name'), {
            target: { value: 'Local Codex' },
        });
        fireEvent.change(screen.getByLabelText('Reason'), {
            target: { value: 'Inspect configuration locally' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
        await screen.findByText('synthetic-once-secret');
        const issueCall = fetcher.mock.calls.find(
            (call) => call[1]?.method === 'POST',
        );
        const body = JSON.parse(String(issueCall?.[1]?.body));
        expect(body.permissions).toEqual(token.permissions);
        expect(body.limits).toEqual({});
        expect(body.expiresInDays).toBe(30);
        fireEvent.click(
            screen.getByRole('button', { name: 'I have saved the secret' }),
        );
        expect(
            screen.queryByText('synthetic-once-secret'),
        ).not.toBeInTheDocument();
        expect(localStorage.getItem('LANGUON_ADMIN_MCP_TOKEN')).toBeNull();
    }, 20_000);

    it('shows paid-check ceilings only after explicitly enabling that permission', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>().mockImplementation(async (url) =>
                String(url).includes('/audit?')
                    ? response({
                          events: [],
                          total: 0,
                          page: 1,
                          pageSize: 25,
                      })
                    : response({ tokens: [] }),
            ),
        );
        render(<AdminMcpPage />);
        expect(
            screen.queryByLabelText('Maximum USD per check'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Paid model checks'));
        expect(screen.getByLabelText('Maximum USD per check')).toHaveValue(
            '0.05',
        );
        expect(screen.getByLabelText('Maximum USD per UTC day')).toHaveValue(
            '0.5',
        );
        expect(screen.getByLabelText('Concurrent checks')).toHaveValue('1');
        expect(
            screen.getByLabelText('Credit grants (not revenue)'),
        ).not.toBeChecked();
    });
});
