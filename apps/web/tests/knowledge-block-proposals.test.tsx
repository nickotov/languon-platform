import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    KnowledgeBlockProposalSchema,
    KnowledgeWorkingBranchSchema,
} from '@languon/contracts';
import {
    KnowledgeBlockProposals,
    type KnowledgeBlockProposalContext,
} from '../src/fsd/features/knowledge-notes';
import { render } from './render';
const id = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const proposal = KnowledgeBlockProposalSchema.parse({
    id,
    conversationId: id,
    noteId: id,
    branchId,
    baseBranchVersion: 3,
    blocks: [
        {
            id,
            type: 'grammar',
            language: 'en',
            rule: '<script>literal</script>',
        },
    ],
    createdAt: '2026-10-28T00:00:00.000Z',
    appliedAt: null,
    appliedBranchVersion: null,
});
const branch = KnowledgeWorkingBranchSchema.parse({
    id: branchId,
    noteId: id,
    version: 4,
    basePublishedVersion: 1,
    content: {
        title: 'Grammar',
        summary: '',
        categories: [],
        studiedLanguage: 'en',
        explanationLanguage: 'en',
        body: {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: { block: proposal.blocks[0] },
                    },
                ],
            },
        },
    },
    updatedAt: '2026-10-28T00:00:00.000Z',
});
afterEach(() => vi.unstubAllGlobals());
function context(): KnowledgeBlockProposalContext {
    return {
        requestWithSession: (operation) => operation('synthetic-token'),
        conversationId: id,
        branchId,
        branchVersion: 3,
        beforeApply: vi.fn().mockResolvedValue({ branchId, version: 3 }),
        onApplied: vi.fn(),
    };
}
it('previews safe blocks and changes only the working branch after explicit Apply', async () => {
    const requests: { method: string; body: unknown }[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
            requests.push({
                method: init.method ?? 'GET',
                body: init.body ? JSON.parse(String(init.body)) : null,
            });
            return init.method === 'POST'
                ? Response.json({
                      proposal: {
                          ...proposal,
                          appliedAt: '2026-10-28T00:00:00.000Z',
                          appliedBranchVersion: 4,
                      },
                      branch,
                  })
                : Response.json({ proposals: [proposal] });
        }),
    );
    const current = context();
    const { container } = render(<KnowledgeBlockProposals context={current} />);
    expect(await screen.findByText('<script>literal</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    fireEvent.click(
        screen.getByRole('button', { name: 'Apply to working draft' }),
    );
    await waitFor(() => expect(current.onApplied).toHaveBeenCalledWith(branch));
    expect(current.beforeApply).toHaveBeenCalledTimes(1);
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual(
        { expectedBranchVersion: 3 },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
        'Save the note to publish',
    );
});
it('refuses applying when draft recovery reveals changes since generation', async () => {
    const fetch = vi.fn(async () => Response.json({ proposals: [proposal] }));
    vi.stubGlobal('fetch', fetch);
    const current = context();
    current.beforeApply = vi.fn().mockResolvedValue({ branchId, version: 4 });
    render(<KnowledgeBlockProposals context={current} />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to working draft' }),
    );
    await screen.findByText(
        'The document changed. Ask for a new proposal before applying.',
    );
    expect(current.onApplied).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
});
