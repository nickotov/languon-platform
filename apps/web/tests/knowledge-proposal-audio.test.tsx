import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { KnowledgeBlockProposalSchema } from '@languon/contracts';
import { BlockProposalCard } from '../src/fsd/features/knowledge-notes/ui/block-proposals/block-proposal-card';
import type { KnowledgeBlockProposalContext } from '../src/fsd/features/knowledge-notes';
import { render } from './render';
vi.mock('@/fsd/entities/session', () => ({
    useSessionStore: (select: (state: { user: { id: string } }) => unknown) =>
        select({ user: { id: 'synthetic-owner' } }),
}));
const id = '11111111-1111-4111-8111-111111111111';
const blobUrl = `blob:${location.origin}/authorized-proposal-audio`;
const assetId = '22222222-2222-4222-8222-222222222222';
const proposal = KnowledgeBlockProposalSchema.parse({
    id,
    conversationId: id,
    noteId: id,
    branchId: id,
    baseBranchVersion: 1,
    blocks: [{ id, type: 'audio', title: 'Prepared recording', assetId }],
    createdAt: '2026-10-29T00:00:00.000Z',
    appliedAt: null,
    appliedBranchVersion: null,
});
const context: KnowledgeBlockProposalContext = {
    requestWithSession: (work) => work('synthetic-token'),
    conversationId: id,
    branchId: id,
    branchVersion: 1,
    beforeApply: async () => ({ branchId: id, version: 1 }),
    onApplied: vi.fn(),
};
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
    URL.createObjectURL = vi.fn(() => blobUrl);
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    vi.unstubAllGlobals();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
});
it('loads authorized prepared bytes once for compact and full review and releases its local URL', async () => {
    const fetch = vi.fn(
        async (_url: string, _init?: RequestInit) =>
            new Response(new Blob(['synthetic wav'], { type: 'audio/wav' }), {
                headers: { 'Content-Type': 'audio/wav' },
            }),
    );
    vi.stubGlobal('fetch', fetch);
    const { container, unmount } = render(
        <BlockProposalCard
            proposal={proposal}
            context={context}
            onApplied={vi.fn()}
            disabled={false}
        />,
    );
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() =>
        expect(container.querySelector('audio')).toHaveAttribute(
            'src',
            blobUrl,
        ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toContain(
        `/knowledge/notes/${id}/media/${assetId}`,
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: 'Bearer synthetic-token' },
    });
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain('synthetic-token');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog', { name: 'Review proposed content' });
    expect(
        [...container.querySelectorAll('audio')].every(
            (audio) => audio.src === blobUrl,
        ),
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
});
it('does not preload offscreen conversation history until a proposal becomes visible', async () => {
    let observe!: (entries: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
        'IntersectionObserver',
        class {
            constructor(callback: typeof observe) {
                observe = callback;
            }
            observe() {}
            disconnect = disconnect;
        },
    );
    const fetch = vi.fn(
        async (_url: string, _init?: RequestInit) =>
            new Response(new Blob(['synthetic wav'], { type: 'audio/wav' }), {
                headers: { 'Content-Type': 'audio/wav' },
            }),
    );
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <BlockProposalCard
            proposal={proposal}
            context={context}
            onApplied={vi.fn()}
            disabled={false}
        />,
    );
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => observe([{ isIntersecting: true }]));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() =>
        expect(container.querySelector('audio')).toHaveAttribute(
            'src',
            blobUrl,
        ),
    );
    expect(disconnect).toHaveBeenCalled();
});
it('keeps rejected media unavailable instead of substituting an external or secret-bearing URL', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status: 403 })),
    );
    const { container } = render(
        <BlockProposalCard
            proposal={proposal}
            context={context}
            onApplied={vi.fn()}
            disabled={false}
        />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByText('Media is unavailable')).toBeVisible();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
});
