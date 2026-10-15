import { act, screen, waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, TextDocument } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { textsApi, TextsApiError } from '@/fsd/entities/texts';
import { TextWorkspacePage } from '@/fsd/pages/texts/ui/workspace-page/workspace-page';
import { useTextWorkspaceSession } from '@/fsd/pages/texts/hooks/use-text-workspace-session';
import { render } from './render';
const id = '123e4567-e89b-42d3-a456-426614174000';
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation(useSessionStore.getState().user!.id);
vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({ requestWithSession: request }),
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/fsd/features/text-reading', () => ({
    TextReading: ({ document }: { document: TextDocument }) => (
        <p>{document.sourceText}</p>
    ),
}));
const document: TextDocument = {
    id,
    folderId: id,
    title: 'Private account A title',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    sourceText: 'Private account A source.',
    alignment: {
        source: [
            {
                pairId: id,
                text: 'Private account A source.',
                startOffset: 0,
                endOffset: 25,
                paragraphIndex: 0,
            },
        ],
        translation: [{ pairId: id, text: 'Traduction privée.' }],
        editedPairIds: [],
    },
    status: 'translated',
    lifecycle: 'active',
    version: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
};
function actor(actorId: string) {
    useSessionStore.setState({
        status: 'authenticated',
        user: { id: actorId } as AuthUser,
    });
}
afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().signOut();
});
describe('workspace account isolation', () => {
    it('never renders A cached document when B opens the same URL, during pending fetch or after 404', async () => {
        actor('actor-a');
        vi.spyOn(textsApi, 'listFolders').mockImplementation(async (token) => ({
            data:
                token === 'actor-a'
                    ? [
                          {
                              id,
                              name: 'Private A folder',
                              description: null,
                              lifecycle: 'active',
                              version: 1,
                              createdAt: document.createdAt,
                              updatedAt: document.updatedAt,
                          },
                      ]
                    : [],
            nextCursor: null,
        }));
        let rejectB!: (reason: unknown) => void;
        vi.spyOn(textsApi, 'getText').mockImplementation((token) =>
            token === 'actor-a'
                ? Promise.resolve({ text: document })
                : new Promise((_, reject) => {
                      rejectB = reject;
                  }),
        );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        // Also leave the old, ownerless cache entry in place to model a retained client.
        client.setQueryData(['text', id], { text: document });
        const view = render(
            <QueryClientProvider client={client}>
                <TextWorkspacePage folderId={id} textId={id} />
            </QueryClientProvider>,
        );
        await screen.findByText(document.sourceText);
        act(() => actor('actor-b'));
        await waitFor(() =>
            expect(
                screen.queryByText(document.sourceText),
            ).not.toBeInTheDocument(),
        );
        expect(screen.queryByText(document.title)).not.toBeInTheDocument();
        expect(screen.getByText('Loading text…')).toBeInTheDocument();
        await act(async () => {
            rejectB(
                new TextsApiError(404, {
                    code: 'not_found',
                    message: 'Missing',
                    correlationId: 'test',
                }),
            );
        });
        await screen.findByText('This text isn’t available');
        expect(screen.queryByText(document.sourceText)).not.toBeInTheDocument();
        expect(client.getQueryData(['text', 'actor-b', id])).toBeUndefined();
        view.unmount();
    });
    it('rejects a late A response and refuses to retry its operation using B credentials', async () => {
        actor('actor-a');
        let resolve!: (value: string) => void;
        let retry!: (token: string) => Promise<string>;
        const requestWithRetry = vi.fn(
            async (operation: (token: string) => Promise<string>) => {
                retry = operation;
                return operation('actor-a');
            },
        );
        const { result, unmount } = renderHook(() =>
            useTextWorkspaceSession(
                'actor-a',
                requestWithRetry as typeof request,
            ),
        );
        const operation = vi.fn(
            () =>
                new Promise<string>((done) => {
                    resolve = done;
                }),
        );
        const pending = result.current.request(operation);
        act(() => actor('actor-b'));
        resolve('A private result');
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(() => retry('actor-b')).toThrow('Workspace session changed');
        expect(operation).toHaveBeenCalledTimes(1);
        unmount();
    });
});
