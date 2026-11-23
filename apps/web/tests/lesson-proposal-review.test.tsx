import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonProposalReviewForRun } from '../src/fsd/features/knowledge-notes/ui/content-proposals/lesson-proposal-review-for-run/lesson-proposal-review-for-run';
import { ProposalList } from '../src/fsd/features/knowledge-notes/ui/content-proposals/knowledge-content-proposals/proposal-list-context';
import { contentProposalsApi } from '../src/fsd/features/knowledge-notes/api/content-proposals-api';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import { LessonProposalReview } from '../src/fsd/features/knowledge-notes/ui/content-proposals/lesson-proposal-review/lesson-proposal-review';
import { render } from './render';

const grammar = {
    id: '55555555-5555-4555-8555-555555555555',
    type: 'grammar',
    language: 'fr',
    title: 'COD et COI',
    rule: 'Le COD complète directement le verbe.',
};
const proposal = KnowledgeContentProposalSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    noteId: '33333333-3333-4333-8333-333333333333',
    branchId: '44444444-4444-4444-8444-444444444444',
    baseBranchVersion: 1,
    isCompletedLesson: true,
    lessonParts: [
        {
            taskId: 'reading',
            kind: 'prose',
            startIndex: 0,
            nodeCount: 2,
            present: false,
        },
        {
            taskId: 'grammar',
            kind: 'grammar',
            startIndex: 2,
            nodeCount: 1,
            present: false,
        },
    ],
    body: {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'Les pronoms compléments',
                            marks: [{ type: 'bold' }],
                        },
                    ],
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Deuxième paragraphe.' }],
                },
                { type: 'learningBlock', attrs: { block: grammar } },
            ],
        },
    },
    createdAt: '2026-11-10T10:00:00.000Z',
    appliedAt: '2026-11-10T10:01:00.000Z',
    appliedBranchVersion: 2,
});

function ready() {
    return {
        isPartPresent: (_taskId: string) => false,
        canInsertLesson: true,
        canInsertLessonAtCursor: true,
        busy: false,
        error: false,
        isStale: false,
        wrongBranch: false,
        cursorUnavailable: false,
        canRefreshLessonDraft: false,
        refreshLessonDraft: vi.fn().mockResolvedValue(undefined),
        lessonInsertStatus: null,
        insertLesson: vi.fn().mockResolvedValue(undefined),
    };
}

it('keeps a multi-paragraph reading together and makes each insertion destination explicit', async () => {
    const application = ready();
    render(
        <LessonProposalReview
            proposal={proposal}
            onClose={vi.fn()}
            application={application}
        />,
    );

    const preview = screen.getByRole('region', {
        name: 'Review proposed content',
    });
    const reading = within(preview).getByRole('region', { name: 'Reading' });
    const grammarPart = within(preview).getByRole('region', {
        name: 'Grammar',
    });

    expect(reading.querySelector('strong')).toHaveTextContent(
        'Les pronoms compléments',
    );

    expect(within(reading).getByText('Deuxième paragraphe.')).toBeVisible();
    expect(await within(grammarPart).findByText(grammar.rule)).toBeVisible();
    fireEvent.click(
        within(reading).getByRole('button', { name: 'Insert at end' }),
    );

    fireEvent.click(
        within(grammarPart).getByRole('button', { name: 'Insert at cursor' }),
    );

    fireEvent.click(
        within(preview).getByRole('button', {
            name: 'Insert remaining at cursor',
        }),
    );

    expect(application.insertLesson.mock.calls).toEqual([
        ['reading', 'end'],
        ['grammar', 'cursor'],
        [undefined, 'cursor'],
    ]);
});

it('marks surviving parts in the document and leaves other parts available', () => {
    const application = {
        ...ready(),
        isPartPresent: (taskId: string) => taskId === 'reading',
    };

    render(
        <LessonProposalReview
            proposal={proposal}
            onClose={vi.fn()}
            application={application}
        />,
    );

    const reading = within(screen.getByRole('region', { name: 'Reading' }));
    expect(reading.getByText('In document')).toBeVisible();
    expect(
        reading.getByRole('button', { name: 'Insert at end' }),
    ).toBeDisabled();

    expect(
        reading.getByRole('button', { name: 'Insert at cursor' }),
    ).toBeDisabled();

    const grammarPart = within(screen.getByRole('region', { name: 'Grammar' }));
    expect(
        grammarPart.getByRole('button', { name: 'Insert at end' }),
    ).toBeEnabled();
});

it('keeps the lesson available for inspection and explains why a different branch cannot receive it', async () => {
    const application = {
        ...ready(),
        wrongBranch: true,
        canInsertLesson: false,
        canInsertLessonAtCursor: false,
    };

    render(
        <LessonProposalReview
            proposal={proposal}
            onClose={vi.fn()}
            application={application}
        />,
    );

    expect(await screen.findByText(grammar.rule)).toBeVisible();
    expect(
        screen.getByText(
            'Open the original lesson draft to insert this content.',
        ),
    ).toBeVisible();

    expect(
        screen.getByRole('button', { name: 'Insert remaining at end' }),
    ).toBeDisabled();

    expect(
        screen.getByRole('button', { name: 'Insert remaining at cursor' }),
    ).toBeDisabled();

    expect(
        within(screen.getByRole('region', { name: 'Reading' })).getByRole(
            'button',
            { name: 'Insert at end' },
        ),
    ).toBeDisabled();
});

it('looks up the exact published proposal once when the completed run is older than the loaded history', async () => {
    const refresh = vi.fn();
    const request = <T,>(operation: (token: string) => Promise<T>) =>
        operation('test-only');
    const client = new QueryClient();
    const list = vi.spyOn(contentProposalsApi, 'list').mockResolvedValue({
        proposals: [{ ...proposal, isCompletedLesson: true }],
    });

    try {
        render(
            <QueryClientProvider client={client}>
                <ProposalList.Provider
                    value={{
                        proposals: [],
                        actorId: 'synthetic',
                        accessDenied: false,
                        applying: false,
                        refresh,
                        context: {
                            branchId: proposal.branchId,
                            branchVersion: 2,
                            conversationId: proposal.conversationId,
                            requestWithSession: request,
                            beforeApply: vi.fn(),
                            onApplied: vi.fn(),
                        },
                    }}
                >
                    <LessonProposalReviewForRun
                        proposalId={proposal.id}
                        onClose={vi.fn()}
                    />
                </ProposalList.Provider>
            </QueryClientProvider>,
        );

        expect(await screen.findByText(grammar.rule)).toBeVisible();
        expect(list).toHaveBeenCalledExactlyOnceWith(
            request,
            proposal.conversationId,
            expect.any(AbortSignal),
            proposal.id,
        );

        expect(refresh).not.toHaveBeenCalled();
    } finally {
        list.mockRestore();
        client.clear();
    }
});

it('offers draft refresh after a version conflict and keeps every insert action locked while the draft is stale', () => {
    const application = {
        ...ready(),
        isStale: true,
        error: true,
        canRefreshLessonDraft: true,
        canInsertLesson: false,
    };

    render(
        <LessonProposalReview
            proposal={proposal}
            onClose={vi.fn()}
            application={application}
        />,
    );

    expect(
        screen.getByText(/save or resolve them in the editor/),
    ).toBeVisible();

    expect(
        screen.getByRole('button', { name: 'Insert remaining at end' }),
    ).toBeDisabled();

    expect(
        within(screen.getByRole('region', { name: 'Reading' })).getByRole(
            'button',
            { name: 'Insert at end' },
        ),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh draft' }));
    expect(application.refreshLessonDraft).toHaveBeenCalledOnce();
    expect(application.insertLesson).not.toHaveBeenCalled();
});

it('offers a different insertion position after losing the cursor', () => {
    const application = { ...ready(), error: true, cursorUnavailable: true };
    render(
        <LessonProposalReview
            proposal={proposal}
            onClose={vi.fn()}
            application={application}
        />,
    );

    expect(
        screen.getByText(
            'Choose another position in the document or insert at the end.',
        ),
    ).toBeVisible();

    fireEvent.click(
        within(screen.getByRole('region', { name: 'Reading' })).getByRole(
            'button',
            { name: 'Insert at end' },
        ),
    );

    expect(application.insertLesson).toHaveBeenCalledWith('reading', 'end');
});
