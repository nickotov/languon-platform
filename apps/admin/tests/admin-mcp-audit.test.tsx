import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TokenAudit } from '../src/pages/admin-mcp/ui/token-audit/token-audit';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { accessTokenStore } from '../src/shared/auth/access-token-store';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
const id = '00000000-0000-4000-8000-000000000042';
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

it('shows attributed audit activity and retrieves subsequent pages', async () => {
    const event = {
        id,
        actorUserId: id,
        tokenId: id,
        action: 'routing.write',
        target: 'application-route',
        outcome: 'success',
        reason: 'Publish reviewed routing',
        correlationId: id,
        metadata: { version: 4 },
        occurredAt: '2026-10-27T00:00:00.000Z',
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const page = new URL(String(url), 'http://localhost').searchParams.get(
            'page',
        );
        return new Response(
            JSON.stringify({
                events: page === '1' ? [event] : [],
                total: 26,
                page: Number(page),
                pageSize: 25,
            }),
            { headers: { 'Content-Type': 'application/json' } },
        );
    });
    vi.stubGlobal('fetch', fetcher);
    render(<TokenAudit />);
    await screen.findByText('application-route');
    expect(screen.getByText('routing.write')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand row' }));
    expect(screen.getByText('Publish reviewed routing')).toBeInTheDocument();
    expect(screen.getByText(/"version": 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Next Page'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('page=2&pageSize=25');
}, 20_000);
