import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkbookProgress } from '@/fsd/features/workbook-learning';
import { learningApi } from '@/fsd/features/workbook-learning/api/learning-api';
vi.mock('@/fsd/features/workbook-learning/api/learning-api', () => ({
    learningApi: { workbookProgress: vi.fn() },
}));
const workbookId = '11111111-1111-4111-8111-111111111111';
const props = {
    workbookId,
    workbookVersion: 1,
    actorId: 'reader',
    locale: 'en',
    requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
        operation('session'),
};
beforeEach(() => vi.clearAllMocks());
function mount(actorId: string | undefined) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <WorkbookProgress {...props} actorId={actorId} />
        </QueryClientProvider>,
    );
    return client;
}
it('shows explicit completed notes and updated completions separately, then hides stale progress on lost access', async () => {
    vi.mocked(learningApi.workbookProgress).mockResolvedValue({
        workbookId,
        workbookVersion: 1,
        totalNotes: 3,
        completedNotes: 2,
        updatedSinceCompletion: 1,
    });
    const client = mount(props.actorId);
    expect(await screen.findByText('Completed notes: 2 / 3')).toBeVisible();
    expect(screen.getByText('Updated since completion: 1')).toBeVisible();
    vi.mocked(learningApi.workbookProgress).mockRejectedValue(
        new Error('revoked'),
    );
    await client.invalidateQueries({ queryKey: ['workbook-progress'] });
    await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not load progress.',
        ),
    );
    expect(
        screen.queryByText('Completed notes: 2 / 3'),
    ).not.toBeInTheDocument();
});
it('does not request private workbook progress for anonymous readers', () => {
    mount(undefined);
    expect(learningApi.workbookProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
