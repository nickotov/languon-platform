import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    KnowledgeBlockProposalSchema,
    KnowledgeWorkingBranchSchema,
} from '@languon/contracts';
import {
    KnowledgeBlockProposals,
    KnowledgeBlockProposalsForTurn,
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
it('refuses applying if draft recovery changes the destination branch', async () => {
    const fetch = vi.fn(async () => Response.json({ proposals: [proposal] }));
    vi.stubGlobal('fetch', fetch);
    const current = context();
    current.beforeApply = vi
        .fn()
        .mockResolvedValue({ branchId: id, version: 4 });
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

it('renders a proposal at its originating assistant turn and opens a full review without applying', async () => {
    const turnId = '33333333-3333-4333-8333-333333333333';
    const fetch = vi.fn(async () =>
        Response.json({ proposals: [{ ...proposal, turnId }] }),
    );
    vi.stubGlobal('fetch', fetch);
    const current = context();
    render(
        <KnowledgeBlockProposals context={current}>
            <div data-testid='other-turn'>
                <KnowledgeBlockProposalsForTurn turnId={id} />
            </div>
            <div data-testid='origin-turn'>
                <KnowledgeBlockProposalsForTurn turnId={turnId} />
            </div>
        </KnowledgeBlockProposals>,
    );
    await screen.findByText('<script>literal</script>');
    expect(screen.getByTestId('other-turn')).toBeEmptyDOMElement();
    expect(screen.getByTestId('origin-turn')).toHaveTextContent(
        '<script>literal</script>',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog', {
        name: 'Review proposed content',
    });
    expect(dialog).toHaveTextContent('Review prepared translations');
    expect(
        within(dialog).getAllByText(/Review prepared translations/u),
    ).toHaveLength(1);
    expect(
        within(dialog).getByText('Not published until you Save.'),
    ).toBeVisible();
    expect(dialog).toHaveTextContent('Grammar · 1');
    expect(dialog).toHaveTextContent('<script>literal</script>');
    expect(current.beforeApply).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
});

it('adds a stale proposal separately only after explicit confirmation with the current draft version', async () => {
    const requests: unknown[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
            if (init.method === 'POST') {
                requests.push(JSON.parse(String(init.body)));
                return Response.json({
                    proposal: {
                        ...proposal,
                        appliedAt: '2026-10-28T00:00:00.000Z',
                        appliedBranchVersion: 5,
                    },
                    branch: { ...branch, version: 5 },
                });
            }
            return Response.json({
                proposals: [{ ...proposal, targetStale: true }],
            });
        }),
    );
    const current = {
        ...context(),
        branchVersion: 4,
        beforeApply: vi.fn().mockResolvedValue({ branchId, version: 4 }),
    };
    render(<KnowledgeBlockProposals context={current} />);
    const button = await screen.findByRole('button', {
        name: 'Add separately',
    });
    expect(
        screen.queryByRole('button', { name: 'Apply to working draft' }),
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(current.onApplied).toHaveBeenCalled());
    expect(requests).toEqual([
        { expectedBranchVersion: 4, mode: 'add-separately' },
    ]);
});

it('uses target staleness rather than unrelated document revisions for update proposals', async () => {
    const changed = {
        ...proposal,
        target: { blockId: id, blockHash: 'a'.repeat(64) },
        targetStale: false,
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) =>
            init.method === 'POST'
                ? Response.json({
                      proposal: {
                          ...changed,
                          appliedAt: '2026-10-28T00:00:00.000Z',
                          appliedBranchVersion: 5,
                      },
                      branch: { ...branch, version: 5 },
                  })
                : Response.json({ proposals: [changed] }),
        ),
    );
    const current = {
        ...context(),
        branchVersion: 4,
        beforeApply: vi.fn().mockResolvedValue({ branchId, version: 4 }),
    };
    render(<KnowledgeBlockProposals context={current} />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to working draft' }),
    );
    await waitFor(() => expect(current.onApplied).toHaveBeenCalled());
});

it('keeps the applying action visible and disabled, then reveals the applied blocks in the sheet', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
        finish = resolve;
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) =>
            init.method === 'POST'
                ? pending
                : Response.json({ proposals: [proposal] }),
        ),
    );
    const current = { ...context(), onShowBlocks: vi.fn() };
    render(<KnowledgeBlockProposals context={current} />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to working draft' }),
    );
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Apply to working draft' }),
        ).toBeDisabled(),
    );
    expect(
        screen.getByRole('button', { name: 'Apply to working draft' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
        screen.queryByRole('button', { name: 'Show in sheet' }),
    ).not.toBeInTheDocument();
    finish(
        Response.json({
            proposal: {
                ...proposal,
                appliedAt: '2026-10-28T00:00:00.000Z',
                appliedBranchVersion: 4,
            },
            branch,
        }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Show in sheet' }),
    );
    expect(current.onShowBlocks).toHaveBeenCalledWith([id]);
});

it('retains a failed proposal for explicit retry without silently applying or dropping its preview', async () => {
    let submissions = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
            if (init.method !== 'POST')
                return Response.json({ proposals: [proposal] });
            submissions++;
            if (submissions === 1)
                return Response.json(
                    {
                        error: {
                            code: 'service_unavailable',
                            message: 'Synthetic unavailable',
                            correlationId: 'test',
                        },
                    },
                    { status: 503 },
                );
            return Response.json({
                proposal: {
                    ...proposal,
                    appliedAt: '2026-10-28T00:00:00.000Z',
                    appliedBranchVersion: 4,
                },
                branch,
            });
        }),
    );
    const current = context();
    render(<KnowledgeBlockProposals context={current} />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to working draft' }),
    );
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('<script>literal</script>')).toBeVisible();
    expect(current.onApplied).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(current.onApplied).toHaveBeenCalledWith(branch));
    expect(submissions).toBe(2);
});

it('reviews stale source dependencies before an explicit independent copy and reveals the new exercise identity', async () => {
    const copiedId = '44444444-4444-4444-8444-444444444444';
    const sourceId = '55555555-5555-4555-8555-555555555555';
    const source = {
        id: sourceId,
        type: 'bilingual-text',
        language: 'fr',
        segments: [
            {
                id: '66666666-6666-4666-8666-666666666666',
                text: 'Le train part à midi.',
            },
        ],
        translations: [],
    };
    const exercise = {
        id,
        type: 'exercise',
        format: 'free-text',
        question: 'When does the train leave?',
        referenceAnswer: 'At noon.',
        explanation: 'The source names noon.',
    };
    const captured = {
        ...proposal,
        blocks: [exercise],
        dependencies: [source],
        targetStale: true,
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) =>
            init.method === 'POST'
                ? Response.json({
                      proposal: {
                          ...captured,
                          blocks: [{ ...exercise, id: copiedId }],
                          appliedAt: '2026-10-28T00:00:00.000Z',
                          appliedBranchVersion: 4,
                      },
                      branch,
                  })
                : Response.json({ proposals: [captured] }),
        ),
    );
    const current = { ...context(), onShowBlocks: vi.fn() };
    render(<KnowledgeBlockProposals context={current} />);
    await screen.findByRole('button', { name: 'Add separately' });
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog', {
        name: 'Review proposed content',
    });
    expect(dialog).toHaveTextContent('Source passages');
    expect(dialog).toHaveTextContent('Le train part à midi.');
    expect(dialog).toHaveTextContent('also copies these sources independently');
    expect(
        within(dialog).queryByRole('button', {
            name: 'Apply to working draft',
        }),
    ).not.toBeInTheDocument();
    fireEvent.click(
        within(dialog).getByRole('button', { name: 'Close', exact: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add separately' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Show in sheet' }),
    );
    expect(current.onShowBlocks).toHaveBeenCalledWith([copiedId]);
});
